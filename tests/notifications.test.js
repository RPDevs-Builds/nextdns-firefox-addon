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

    test('PUSH_NOTIFICATION: Throttles at 50', async () => {
        for (let i = 0; i < 60; i++) {
            await bg.messageHandlers.PUSH_NOTIFICATION({ 
                payload: { type: 'test', severity: 'low', message: `msg ${i}` } 
            });
        }
        expect(state.notifications.length).toBe(50);
    });
});
