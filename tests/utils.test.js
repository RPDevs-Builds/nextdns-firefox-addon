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
    });
});
