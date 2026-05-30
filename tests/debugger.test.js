/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('Intelligent Debugger (Phase 4.1)', () => {
    let bg;
    let mockStorage = {};

    beforeEach(async () => {
        jest.resetModules();
        mockStorage = {};
        
        global.fetch = jest.fn();

        global.browser = {
            storage: {
                local: {
                    get: jest.fn(keys => Promise.resolve(mockStorage)),
                    set: jest.fn(obj => { Object.assign(mockStorage, obj); return Promise.resolve(); })
                },
                sync: {
                    get: jest.fn(keys => Promise.resolve(mockStorage)),
                    set: jest.fn(obj => { Object.assign(mockStorage, obj); return Promise.resolve(); })
                },
                onChanged: { addListener: jest.fn() }
            },
            runtime: { onMessage: { addListener: jest.fn() } },
            alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
            webRequest: { onBeforeRequest: { addListener: jest.fn(), hasListener: jest.fn(() => false) } },
            tabs: { onRemoved: { addListener: jest.fn() } },
            action: { setPopup: jest.fn().mockResolvedValue(), onClicked: { addListener: jest.fn() } },
            menus: { create: jest.fn(), removeAll: jest.fn().mockResolvedValue(), onClicked: { addListener: jest.fn() } }
        };

        global.storage = {
            init: jest.fn().mockResolvedValue(),
            get: jest.fn(key => Promise.resolve(mockStorage[key])),
            set: jest.fn((key, val) => { mockStorage[key] = val; return Promise.resolve(); })
        };

        const { messageHandlers } = await import('../src/background/handlers.js');
        const { requestListener } = await import('../src/background/requestListener.js');
        bg = { messageHandlers, requestListener };
    });

    test('DEBUG_TAB: Successfully correlates blocked domains from API logs', async () => {
        const tabId = 123;
        const profileId = 'p123';
        
        const { state } = await import('../src/background/state.js');
        state.currentProfileData.denylist = new Set(['example.com']);

        bg.requestListener({ url: 'https://example.com/home', tabId, type: 'main_frame' });

        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [
                    { domain: 'example.com', status: 'blocked', reasons: [{ name: 'OISD' }], timestamp: Date.now() }
                ]
            })
        });

        const result = await bg.messageHandlers.DEBUG_TAB({ tabId, profileId });

        expect(result.success).toBe(true);
        expect(result.correlations.length).toBe(1);
        expect(result.correlations[0].domain).toBe('example.com');
    });

    test('DEBUG_TAB: Returns empty if no requests in tab', async () => {
        const result = await bg.messageHandlers.DEBUG_TAB({ tabId: 999, profileId: 'p1' });
        expect(result.success).toBe(true);
        expect(result.correlations.length).toBe(0);
    });
});
