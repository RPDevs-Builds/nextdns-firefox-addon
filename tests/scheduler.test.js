const fs = require('fs');
const path = require('path');

describe('Automation Scheduler (Phase 4.3)', () => {
    let bg;
    let mockStorage = {};

    beforeEach(() => {
        jest.resetModules();
        mockStorage = {};

        global.browser = {
            storage: {
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
                local: { get: jest.fn(), set: jest.fn() },
                onChanged: { addListener: jest.fn() }
            },
            runtime: { onMessage: { addListener: jest.fn() } },
            alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
            webRequest: { onBeforeRequest: { addListener: jest.fn(), hasListener: jest.fn(() => false) } },
            tabs: { onRemoved: { addListener: jest.fn() } },
            menus: { create: jest.fn(), removeAll: jest.fn().mockResolvedValue(), onClicked: { addListener: jest.fn() } },
            action: { setPopup: jest.fn().mockResolvedValue(), onClicked: { addListener: jest.fn() } }
        };

        global.apiClient = {
            fetchWithRetry: jest.fn()
        };
        global.storage = {
            init: jest.fn().mockResolvedValue(),
            get: jest.fn(key => Promise.resolve(mockStorage[key])),
            set: jest.fn((key, val) => { mockStorage[key] = val; return Promise.resolve(); })
        };

        const bgJs = fs.readFileSync(path.resolve(__dirname, '../background.js'), 'utf8');
        bg = eval(`(function() { 
            ${bgJs}; 
            return { messageHandlers, checkAutomationRules }; 
        })()`);
    });

    test('SAVE_RULE: Successfully adds a rule to sync storage', async () => {
        const rule = { name: 'Focus', trigger: '09:00', action: 'disable', targetId: 'youtube', category: 'parentalControl/services' };
        const result = await bg.messageHandlers.SAVE_RULE({ rule });

        expect(result.success).toBe(true);
        expect(mockStorage.forgeRules.length).toBe(1);
        expect(mockStorage.forgeRules[0].name).toBe('Focus');
    });

    test('checkAutomationRules: Triggers action when time matches', async () => {
        const now = new Date();
        const hhmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        mockStorage.forgeRules = [{
            id: 'r1', name: 'Auto Block', trigger: hhmm, action: 'disable', targetId: 'tiktok', category: 'parentalControl/services', active: true
        }];
        mockStorage.activeProfile = 'p123';

        // Mock TOGGLE_SETTING success
        global.apiClient.fetchWithRetry.mockResolvedValue({ success: true });

        await bg.checkAutomationRules();

        // The first call to apiClient is TEST_URL from initializeBackground/detectActiveProfile
        // We want the call triggered by checkAutomationRules -> TOGGLE_SETTING
        const targetCall = global.apiClient.fetchWithRetry.mock.calls.find(call => call[0].includes('tiktok'));
        expect(targetCall).toBeDefined();
        expect(targetCall[1].method).toBe('DELETE'); // 'disable' maps to 'delete' action
    });
});
