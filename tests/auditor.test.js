const fs = require('fs');
const path = require('path');

describe('Security Auditor (Phase 4.4)', () => {
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
                onChanged: { addListener: jest.fn() }
            },
            runtime: {
                onMessage: { addListener: jest.fn() },
                getURL: jest.fn(path => path)
            },
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

        // Mock fetch for audit metadata
        global.fetch = jest.fn().mockImplementation((url) => {
            if (url.includes('deprecated_lists.json')) {
                return Promise.resolve({
                    json: () => Promise.resolve({
                        deprecated: [{ id: 'dep-1', name: 'Old List', reason: 'Outdated' }],
                        recommended: []
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        const bgJs = fs.readFileSync(path.resolve(__dirname, '../src/background.js'), 'utf8');
        bg = eval(`(function() { 
            ${bgJs}; 
            return { messageHandlers }; 
        })()`);
    });

    test('RUN_AUDIT: Detects disabled security settings', async () => {
        const profileId = 'p1';
        
        // Mock config with all security off
        global.apiClient.fetchWithRetry.mockResolvedValue({
            success: true,
            response: {
                json: () => Promise.resolve({
                    data: { security: { dga: false, nrd: false }, privacy: { blocklists: [] } }
                })
            }
        });

        const result = await bg.messageHandlers.RUN_AUDIT({ profileId });

        expect(result.success).toBe(true);
        expect(result.score).toBeLessThan(100);
        expect(result.recommendations.some(r => r.message.includes('DGA'))).toBe(true);
    });

    test('RUN_AUDIT: Detects deprecated blocklists', async () => {
        const profileId = 'p1';
        
        // Mock config with a deprecated list
        global.apiClient.fetchWithRetry.mockResolvedValue({
            success: true,
            response: {
                json: () => Promise.resolve({
                    data: { 
                        security: { dga: true, nrd: true, parkedDomains: true, csam: true }, 
                        privacy: { blocklists: [{ id: 'dep-1', name: 'Old List' }] } 
                    }
                })
            }
        });

        const result = await bg.messageHandlers.RUN_AUDIT({ profileId });

        expect(result.success).toBe(true);
        expect(result.recommendations.some(r => r.message.includes('deprecated'))).toBe(true);
        expect(result.recommendations[0].fix.action).toBe('delete');
    });
});
