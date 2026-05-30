const fs = require('fs');
const path = require('path');

describe('Profile Snapshots (Phase 4.2)', () => {
    let bg;
    let mockStorage = {};

    beforeEach(() => {
        jest.resetModules();
        mockStorage = {};

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
            set: jest.fn((key, val) => { mockStorage[key] = val; return Promise.resolve(); }),
            getAll: jest.fn(() => Promise.resolve(mockStorage))
        };

        const bgJs = fs.readFileSync(path.resolve(__dirname, '../src/background.js'), 'utf8');
        bg = eval(`(function() { 
            ${bgJs}; 
            return { messageHandlers }; 
        })()`);
    });

    test('CREATE_SNAPSHOT: Successfully creates and stores a snapshot', async () => {
        const profileId = 'p1';
        
        // Mock GET_ALL_SETTINGS response
        global.apiClient.fetchWithRetry.mockResolvedValue({
            success: true,
            response: {
                json: () => Promise.resolve({
                    data: { security: { dga: true }, privacy: { blocklists: [{ id: 'b1' }] } }
                })
            }
        });

        const result = await bg.messageHandlers.CREATE_SNAPSHOT({ profileId, name: 'Initial' });

        expect(result.success).toBe(true);
        expect(mockStorage.profileSnapshots[profileId].length).toBe(1);
        expect(mockStorage.profileSnapshots[profileId][0].name).toBe('Initial');
        expect(mockStorage.profileSnapshots[profileId][0].config.security.dga).toBe(true);
    });

    test('LIST_SNAPSHOTS: Returns snapshots for a specific profile', async () => {
        mockStorage.profileSnapshots = {
            'p1': [{ id: '1', name: 'S1', timestamp: Date.now(), config: {} }],
            'p2': [{ id: '2', name: 'S2', timestamp: Date.now(), config: {} }]
        };

        const result = await bg.messageHandlers.LIST_SNAPSHOTS({ profileId: 'p1' });
        expect(result.success).toBe(true);
        expect(result.snapshots.length).toBe(1);
        expect(result.snapshots[0].name).toBe('S1');
    });

    test('DELETE_SNAPSHOT: Successfully removes a snapshot', async () => {
        mockStorage.profileSnapshots = {
            'p1': [{ id: 's1', name: 'S1' }, { id: 's2', name: 'S2' }]
        };

        await bg.messageHandlers.DELETE_SNAPSHOT({ profileId: 'p1', snapshotId: 's1' });
        expect(mockStorage.profileSnapshots['p1'].length).toBe(1);
        expect(mockStorage.profileSnapshots['p1'][0].id).toBe('s2');
    });
});
