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

        // Mock browser.runtime
        global.browser = {
            runtime: { sendMessage: jest.fn() }
        };
    });

    test('PUSH_NOTIFICATION: Adds notification to state', async () => {
        const payload = { type: 'security', severity: 'high', message: 'Test alert' };
        await bg.messageHandlers.PUSH_NOTIFICATION({ payload });

        expect(state.notifications.length).toBe(1);
        expect(state.notifications[0].message).toBe('Test alert');
        expect(state.notifications[0].read).toBe(false);
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
