/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('Action Center (Phase 8.1)', () => {
    let bg;
    let state;

    beforeEach(async () => {
        // Reset state
        const stateMod = await import('../src/background/state.js');
        state = stateMod.state;
        state.notifications = [];

        const { messageHandlers } = await import('../src/background/handlers.js');
        bg = { messageHandlers };

        // Mock browser.runtime and notifications
        global.browser = {
            runtime: { sendMessage: jest.fn() },
            notifications: { create: jest.fn() },
            storage: {
                sync: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue({}) },
                local: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue({}) }
            }
        };

        const { storage } = await import('../src/storage.js');
        storage.cache = {};
        state.lastNotificationTimes = {};
    });

    test('PUSH_NOTIFICATION: Adds notification to state by default', async () => {
        const payload = { type: 'security', severity: 'high', message: 'Test alert' };
        await bg.messageHandlers.PUSH_NOTIFICATION({ payload });

        expect(state.notifications.length).toBe(1);
        expect(state.notifications[0].message).toBe('Test alert');
        expect(state.notifications[0].read).toBe(false);
    });

    test('PUSH_NOTIFICATION: Honors enabled=false (master toggle)', async () => {
        const { storage } = await import('../src/storage.js');
        storage.cache.alertSettings = { enabled: false };

        const payload = { type: 'security', severity: 'high', message: 'Filtered alert' };
        const res = await bg.messageHandlers.PUSH_NOTIFICATION({ payload });

        expect(res.success).toBe(false);
        expect(res.reason).toBe('alerts_disabled');
        expect(state.notifications.length).toBe(0);
    });

    test('PUSH_NOTIFICATION: Filters by trigger category', async () => {
        const { storage } = await import('../src/storage.js');
        storage.cache.alertSettings = { 
            enabled: true, 
            triggerThreats: false, 
            triggerDenylist: true,
            actionCenter: true 
        };

        // Threats disabled
        const resThreat = await bg.messageHandlers.PUSH_NOTIFICATION({ 
            payload: { type: 'security', severity: 'high', message: 'Threat' } 
        });
        expect(resThreat.success).toBe(false);
        expect(resThreat.reason).toBe('trigger_type_disabled');
        expect(state.notifications.length).toBe(0);

        // Denylist enabled
        const resDeny = await bg.messageHandlers.PUSH_NOTIFICATION({ 
            payload: { type: 'denylist', severity: 'medium', message: 'Blocked domain' } 
        });
        expect(resDeny.success).toBe(true);
        expect(state.notifications.length).toBe(1);
    });

    test('PUSH_NOTIFICATION: Respects actionCenter=false and dispatches desktop notification when desktop=true', async () => {
        const { storage } = await import('../src/storage.js');
        storage.cache.alertSettings = { 
            enabled: true, 
            triggerThreats: true, 
            actionCenter: false,
            desktop: true
        };

        const payload = { type: 'security', severity: 'high', message: 'Desktop only' };
        const res = await bg.messageHandlers.PUSH_NOTIFICATION({ payload });

        expect(res.success).toBe(true);
        // Not in Action Center feed
        expect(state.notifications.length).toBe(0);
        // Dispatched to desktop
        expect(global.browser.notifications.create).toHaveBeenCalledWith(expect.objectContaining({
            type: 'basic',
            message: 'Desktop only'
        }));
    });

    test('handleBlockNotification: Respects alertSettings for denylist block events', async () => {
        const { storage } = await import('../src/storage.js');
        const { handleBlockNotification } = await import('../src/background/utils.js');

        // Case 1: Alerts disabled
        storage.cache.alertSettings = { enabled: false, desktop: true };
        await handleBlockNotification('blocked.example.com');
        expect(global.browser.notifications.create).not.toHaveBeenCalled();

        // Case 2: Alerts enabled with desktop=true and actionCenter=true
        storage.cache.alertSettings = { enabled: true, triggerDenylist: true, desktop: true, actionCenter: true };
        await handleBlockNotification('threat.example.com');
        expect(global.browser.notifications.create).toHaveBeenCalledWith(expect.objectContaining({
            message: 'threat.example.com was blocked.'
        }));
        expect(state.notifications.some(n => n.message === 'threat.example.com was blocked by Denylist.')).toBe(true);
    });

    test('GET_NOTIFICATIONS: Retrieves stored notifications', async () => {
        state.notifications = [{ id: '1', message: 'Alert 1' }];
        const res = await bg.messageHandlers.GET_NOTIFICATIONS();
        expect(res.success).toBe(true);
        expect(res.notifications).toEqual([{ id: '1', message: 'Alert 1' }]);
    });

    test('CLEAR_NOTIFICATIONS: Empties stored notifications', async () => {
        state.notifications = [{ id: '1', message: 'Alert 1' }];
        const res = await bg.messageHandlers.CLEAR_NOTIFICATIONS();
        expect(res.success).toBe(true);
        expect(state.notifications).toEqual([]);
    });

    test('UI: renderNotifications updates badge and popover content', async () => {
        document.body.innerHTML = `
            <button id="alerts-toggle-btn">📢<span id="alerts-badge" class="alerts-badge hidden"></span></button>
            <div id="alerts-popover" class="alerts-popover hidden">
                <button id="notifications-clear-btn">Clear All</button>
                <div id="notifications-container"></div>
            </div>
        `;

        const uiNotifications = await import('../src/ui/notifications.js');
        const uiState = (await import('../src/ui/state.js')).state;
        uiState.notifications = [
            { id: '101', severity: 'high', type: 'security', message: 'Threat blocked', timestamp: Date.now() }
        ];

        uiNotifications.renderNotifications();

        const badge = document.getElementById('alerts-badge');
        expect(badge.classList.contains('hidden')).toBe(false);

        const container = document.getElementById('notifications-container');
        expect(container.textContent).toContain('Threat blocked');

        // Test clear
        uiState.notifications = [];
        uiNotifications.renderNotifications();
        expect(badge.classList.contains('hidden')).toBe(true);
        expect(container.textContent).toContain('No new alerts.');
    });
});
