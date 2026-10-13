/**
 * DNS Forge - Background Utilities Unit Tests
 */

import { jest } from '@jest/globals';
import { getMatch, handleBlockNotification } from '../src/background/utils.js';
import { state } from '../src/background/state.js';
import { storage } from '../src/storage.js';

describe('Background Utilities (utils.js)', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        state.lastNotificationTimes = {};
        state.notifications = [];
        await storage.init();
        await storage.set('alertSettings', null);
        await storage.set('blockNotif', false);
    });

    describe('getMatch', () => {
        test('matches exact domain in set', () => {
            const set = new Set(['ads.google.com', 'tracker.com']);
            expect(getMatch('ads.google.com', set)).toBe('ads.google.com');
            expect(getMatch('tracker.com', set)).toBe('tracker.com');
        });

        test('recursively matches parent domains in set', () => {
            const set = new Set(['google.com', 'doubleclick.net']);
            expect(getMatch('ad.services.google.com', set)).toBe('google.com');
            expect(getMatch('sub.doubleclick.net', set)).toBe('doubleclick.net');
        });

        test('returns null when domain does not match', () => {
            const set = new Set(['google.com']);
            expect(getMatch('google.org', set)).toBeNull();
            expect(getMatch('example.net', set)).toBeNull();
            expect(getMatch('notgoogle.com', set)).toBeNull();
        });
    });

    describe('handleBlockNotification', () => {
        test('early returns when alerts are disabled or triggerDenylist is false', async () => {
            await storage.set('alertSettings', { enabled: false });
            await handleBlockNotification('bad.com');
            expect(state.lastNotificationTimes['bad.com']).toBeUndefined();

            await storage.set('alertSettings', { enabled: true, triggerDenylist: false });
            await handleBlockNotification('bad2.com');
            expect(state.lastNotificationTimes['bad2.com']).toBeUndefined();
        });

        test('early returns when neither desktop nor actionCenter is enabled', async () => {
            await storage.set('alertSettings', { enabled: true, triggerDenylist: true, desktop: false, actionCenter: false });
            await handleBlockNotification('bad.com');
            expect(state.lastNotificationTimes['bad.com']).toBeUndefined();
        });

        test('records notification in actionCenter and limits queue to 50', async () => {
            await storage.set('alertSettings', { enabled: true, triggerDenylist: true, actionCenter: true, desktop: false });
            
            for (let i = 0; i < 55; i++) {
                state.lastNotificationTimes = {}; // Reset debounce
                await handleBlockNotification(`bad${i}.com`);
            }

            expect(state.notifications.length).toBe(50);
            expect(state.notifications[0].message).toContain('bad54.com');
        });

        test('dispatches desktop notification with error catch', async () => {
            const notifSpy = jest.fn();
            global.browser.notifications = { create: notifSpy };

            await storage.set('alertSettings', { enabled: true, triggerDenylist: true, desktop: true });
            await handleBlockNotification('malicious.domain');

            expect(notifSpy).toHaveBeenCalledWith(expect.objectContaining({
                title: 'NextDNS Blocked',
                message: 'malicious.domain was blocked.'
            }));

            // Test catch block on notification failure
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            notifSpy.mockImplementationOnce(() => { throw new Error('OS Notification Error'); });
            state.lastNotificationTimes = {};
            await handleBlockNotification('malicious2.domain');
            expect(warnSpy).toHaveBeenCalledWith('[Background] Notification failed:', expect.any(Error));
            warnSpy.mockRestore();
        });

        test('prunes old notification timestamps when tracking map exceeds 200 entries', async () => {
            await storage.set('alertSettings', { enabled: true, triggerDenylist: true, desktop: true });
            global.browser.notifications = { create: jest.fn() };

            const now = Date.now();
            // Pre-fill 205 entries where some are older than 60s
            for (let i = 0; i < 205; i++) {
                state.lastNotificationTimes[`old${i}.com`] = now - 70000;
            }

            await handleBlockNotification('new-trigger.com');
            const keys = Object.keys(state.lastNotificationTimes);
            expect(keys).toContain('new-trigger.com');
            expect(keys).not.toContain('old0.com');
        });

        test('debounces notification for same domain within 10 seconds', async () => {
            await storage.set('alertSettings', { enabled: true, triggerDenylist: true, actionCenter: true });
            state.lastNotificationTimes = {};
            await handleBlockNotification('debounce.com');
            const initialCount = state.notifications.length;

            // Immediate repeat call within 10s should be debounced
            await handleBlockNotification('debounce.com');
            expect(state.notifications.length).toBe(initialCount);
        });

        test('handles storage error during actionCenter set gracefully and falls back to legacyBlockNotif', async () => {
            await storage.set('alertSettings', { enabled: true, triggerDenylist: true, actionCenter: true, desktop: true });
            const notifSpy = jest.fn();
            global.browser.notifications = { create: notifSpy };

            // Storage set fails on notifications key to trigger .catch(() => {}) on line 74
            const origSet = storage.set.bind(storage);
            storage.set = jest.fn((k, v) => {
                if (k === 'notifications') return Promise.reject(new Error('Storage disk failure'));
                return origSet(k, v);
            });

            state.lastNotificationTimes = {};
            await expect(handleBlockNotification('legacy-notif.com')).resolves.not.toThrow();
            expect(notifSpy).toHaveBeenCalled();
            storage.set = origSet;
        });

        test('falls back to legacyBlockNotif when alertSettings is not configured', async () => {
            const notifSpy = jest.fn();
            global.browser.notifications = { create: notifSpy };
            await storage.set('alertSettings', null);
            await storage.set('blockNotif', true);
            state.lastNotificationTimes = {};
            await handleBlockNotification('legacy-only.com');
            expect(notifSpy).toHaveBeenCalled();
        });

        test('Utils Branch Hardening: handles uninitialized notifications state and absent desktop notification API', async () => {
            await storage.set('alertSettings', { enabled: true, triggerDenylist: true, actionCenter: true, desktop: true });
            state.lastNotificationTimes = {};
            state.notifications = null; // hits line 71: state.notifications = state.notifications || [];

            // Temporarily delete browser.notifications to hit line 79: browser.notifications?.create falsy
            const origNotif = global.browser.notifications;
            delete global.browser.notifications;

            await handleBlockNotification('no-api.com');
            expect(Array.isArray(state.notifications)).toBe(true);
            expect(state.notifications.length).toBe(1);

            // Now test when browser.notifications exists but has no create function
            global.browser.notifications = {};
            state.lastNotificationTimes = {};
            await handleBlockNotification('no-create.com');
            expect(state.notifications.length).toBe(2);

            global.browser.notifications = origNotif;
        });
    });
});
