const fs = require('fs');
const path = require('path');

describe('Intelligent Debugger (Phase 4.1)', () => {
    let bg;
    let mockStorage = {};

    beforeEach(() => {
        jest.resetModules();
        mockStorage = {};
        
        // Mock global browser APIs for background.js
        global.browser = {
            storage: {
                local: {
                    get: jest.fn(keys => {
                        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
                        return Promise.resolve(mockStorage);
                    }),
                    set: jest.fn(obj => {
                        Object.assign(mockStorage, obj);
                        return Promise.resolve();
                    })
                },
                sync: {
                    get: jest.fn(keys => {
                        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
                        return Promise.resolve(mockStorage);
                    }),
                    set: jest.fn(obj => {
                        Object.assign(mockStorage, obj);
                        return Promise.resolve();
                    })
                },
                onChanged: { addListener: jest.fn() }
            },
            runtime: {
                onMessage: { addListener: jest.fn() }
            },
            alarms: {
                create: jest.fn(),
                onAlarm: { addListener: jest.fn() }
            },
            webRequest: {
                onBeforeRequest: { addListener: jest.fn(), hasListener: jest.fn(() => false) }
            },
            tabs: {
                onRemoved: { addListener: jest.fn() }
            },
            action: {
                setPopup: jest.fn().mockResolvedValue(),
                onClicked: { addListener: jest.fn() }
            },
            menus: {
                create: jest.fn(),
                removeAll: jest.fn().mockResolvedValue(),
                onClicked: { addListener: jest.fn() }
            }
        };

        global.apiClient = {
            fetchWithRetry: jest.fn(),
            setStorage: jest.fn()
        };
        global.storage = {
            init: jest.fn(),
            get: jest.fn(),
            set: jest.fn()
        };

        const bgJs = fs.readFileSync(path.resolve(__dirname, '../background.js'), 'utf8');
        bg = eval(`(function() { 
            ${bgJs}; 
            return { messageHandlers, requestListener }; 
        })()`);
    });

    test('DEBUG_TAB: Successfully correlates blocked domains from API logs', async () => {
        const tabId = 123;
        const profileId = 'p123';
        
        // 1. Simulate some requests in the tab
        bg.requestListener({ url: 'https://example.com/home', tabId, type: 'main_frame' });
        bg.requestListener({ url: 'https://google.com/tracker.js', tabId, type: 'script' });

        // 2. Mock API response with one blocked domain that matches our tab
        global.apiClient.fetchWithRetry.mockResolvedValue({
            success: true,
            response: {
                json: () => Promise.resolve({
                    data: [
                        { domain: 'example.com', status: 'blocked', reasons: [{ name: 'OISD' }], timestamp: Date.now(), deviceName: 'iPhone' },
                        { domain: 'random.com', status: 'blocked', reasons: [{ name: 'Deny List' }], timestamp: Date.now() }
                    ]
                })
            }
        });

        // 3. Run DEBUG_TAB handler
        const result = await bg.messageHandlers.DEBUG_TAB({ tabId, profileId });

        expect(result.success).toBe(true);
        expect(result.correlations.length).toBe(1);
        expect(result.correlations[0].domain).toBe('example.com');
        expect(result.correlations[0].reasons[0].name).toBe('OISD');
    });

    test('DEBUG_TAB: Returns empty if no requests in tab', async () => {
        const result = await bg.messageHandlers.DEBUG_TAB({ tabId: 999, profileId: 'p1' });
        expect(result.success).toBe(true);
        expect(result.correlations.length).toBe(0);
    });
});
