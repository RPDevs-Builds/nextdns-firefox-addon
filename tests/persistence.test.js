/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// No path resolve needed here

describe('Storage Persistence & Auto-Heal', () => {
    let mockLocal = {};
    let mockSync = {};

    beforeEach(async () => {
        jest.resetModules();
        mockLocal = {};
        mockSync = {};

        global.browser = {
            storage: {
                local: {
                    get: jest.fn(keys => {
                        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockLocal[keys] });
                        return Promise.resolve(mockLocal);
                    }),
                    set: jest.fn(obj => {
                        Object.assign(mockLocal, obj);
                        return Promise.resolve();
                    })
                },
                sync: {
                    get: jest.fn(keys => {
                        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockSync[keys] });
                        return Promise.resolve(mockSync);
                    }),
                    set: jest.fn(obj => {
                        Object.assign(mockSync, obj);
                        return Promise.resolve();
                    })
                },
                onChanged: { addListener: jest.fn() }
            },
            runtime: { 
                onMessage: { addListener: jest.fn() },
                getURL: jest.fn(p => p),
                sendMessage: jest.fn().mockResolvedValue({ success: true, data: [] })
            },
            alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
            webRequest: { onBeforeRequest: { addListener: jest.fn(), hasListener: jest.fn(() => false) } },
            tabs: { onRemoved: { addListener: jest.fn() } },
            menus: { create: jest.fn(), removeAll: jest.fn().mockResolvedValue(), onClicked: { addListener: jest.fn() } },
            action: { setPopup: jest.fn().mockResolvedValue(), onClicked: { addListener: jest.fn() } }
        };

        global.apiClient = {
            fetchWithRetry: jest.fn(),
            setStorage: jest.fn()
        };
    });

    test('Background: Heals local storage from sync on startup', async () => {
        mockSync = { apiKey: 'sync-key-123', activeProfile: 'p1' };
        mockLocal = {}; // Local is empty

        const { initializeBackground } = await import('../src/background/main.js');
        await initializeBackground();

        expect(mockLocal.apiKey).toBe('sync-key-123');
    });

    test('Popup: Auto-heals local storage from sync', async () => {
        mockSync = { apiKey: 'sync-key-123' };
        mockLocal = {};

        // In the modular structure, storage.init() handles healing.
        const { storage } = await import('../src/storage.js');
        await storage.init();

        expect(mockLocal.apiKey).toBe('sync-key-123');
    });

    test('StorageManager: Supports array get, full cache get, and default values', async () => {
        const { storage } = await import('../src/storage.js');
        await storage.init();
        await storage.set({ alpha: 'one', beta: 'two' });

        const multi = await storage.get(['alpha', 'beta', 'missing']);
        expect(multi.alpha).toBe('one');
        expect(multi.beta).toBe('two');
        expect(multi.missing).toBeUndefined();

        const all = await storage.get(null);
        expect(all.alpha).toBe('one');
        expect(all.beta).toBe('two');
    });

    test('StorageManager: Excludes LOCAL_ONLY_KEYS from sync storage', async () => {
        const { storage } = await import('../src/storage.js');
        await storage.init();
        
        await storage.set({
            theme: 'dark',
            cachedAllowlist: ['domain.com'],
            profileSnapshots: [{ id: '1' }]
        });

        // 'theme' should be in sync and local
        expect(mockLocal.theme).toBe('dark');
        expect(mockSync.theme).toBe('dark');

        // Large/ephemeral items should only be in local
        expect(mockLocal.cachedAllowlist).toEqual(['domain.com']);
        expect(mockSync.cachedAllowlist).toBeUndefined();
        expect(mockLocal.profileSnapshots).toEqual([{ id: '1' }]);
        expect(mockSync.profileSnapshots).toBeUndefined();
    });

    test('StorageManager: Supports removing keys', async () => {
        const { storage } = await import('../src/storage.js');
        await storage.init();
        await storage.set('tempKey', 'tempVal');
        expect(await storage.get('tempKey')).toBe('tempVal');

        await storage.remove('tempKey');
        expect(await storage.get('tempKey')).toBeNull();
    });
});
