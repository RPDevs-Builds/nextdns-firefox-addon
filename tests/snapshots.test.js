/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('Profile Snapshots (Phase 4.2)', () => {
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
            runtime: { onMessage: { addListener: jest.fn() } }
        };

        global.storage = {
            init: jest.fn().mockResolvedValue(),
            get: jest.fn(key => Promise.resolve(mockStorage[key])),
            set: jest.fn((key, val) => { mockStorage[key] = val; return Promise.resolve(); })
        };

        const { messageHandlers } = await import('../src/background/handlers.js');
        bg = { messageHandlers };
    });

    test('CREATE_SNAPSHOT: Successfully creates and stores a snapshot', async () => {
        const profileId = 'p1';
        
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { some: 'config' } })
        });

        const result = await bg.messageHandlers.CREATE_SNAPSHOT({ profileId, name: 'Initial' });

        expect(result.success).toBe(true);
        expect(mockStorage.profileSnapshots[profileId].length).toBe(1);
        expect(mockStorage.profileSnapshots[profileId][0].name).toBe('Initial');
    });

    test('LIST_SNAPSHOTS: Returns snapshots for a specific profile', async () => {
        mockStorage.profileSnapshots = {
            'p1': [{ id: '1', name: 'S1', timestamp: Date.now(), data: {} }]
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

    test('CREATE_SNAPSHOT: Returns error if profileId is missing', async () => {
        const result = await bg.messageHandlers.CREATE_SNAPSHOT({});
        expect(result.success).toBe(false);
        expect(result.error).toContain('Profile ID required');
    });

    test('CREATE_SNAPSHOT: Prunes oldest snapshots when payload exceeds quota limit', async () => {
        const profileId = 'p1';
        const largeString = 'x'.repeat(1200000);
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { largeData: largeString } })
        });

        const res1 = await bg.messageHandlers.CREATE_SNAPSHOT({ profileId, name: 'Snap1' });
        expect(res1.success).toBe(true);
        expect(mockStorage.profileSnapshots[profileId].length).toBe(1);

        const res2 = await bg.messageHandlers.CREATE_SNAPSHOT({ profileId, name: 'Snap2' });
        expect(res2.success).toBe(true);
        expect(mockStorage.profileSnapshots[profileId].length).toBe(1);
        expect(mockStorage.profileSnapshots[profileId][0].name).toBe('Snap2');
    });
});
