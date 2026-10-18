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
                    }),
                    remove: jest.fn(keys => {
                        const arr = Array.isArray(keys) ? keys : [keys];
                        arr.forEach(k => delete mockLocal[k]);
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
                    }),
                    remove: jest.fn(keys => {
                        const arr = Array.isArray(keys) ? keys : [keys];
                        arr.forEach(k => delete mockSync[k]);
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

    test('StorageManager: Credential isolation and syncCredentials toggle behavior', async () => {
        const { storage, LOCAL_ONLY_KEYS, CREDENTIAL_KEYS } = await import('../src/storage.js');
        expect(LOCAL_ONLY_KEYS.has('cachedAllowlist')).toBe(true);
        expect(CREDENTIAL_KEYS.has('apiKey')).toBe(true);
        expect(CREDENTIAL_KEYS.has('adguardApiKey')).toBe(true);
        expect(CREDENTIAL_KEYS.has('controldApiKey')).toBe(true);
        expect(CREDENTIAL_KEYS.has('piholeApiKey')).toBe(true);
        expect(CREDENTIAL_KEYS.has('piholeUrl')).toBe(true);

        await storage.init();

        // 1. When syncCredentials is false (default)
        await storage.set({
            syncCredentials: false,
            apiKey: 'local-only-token',
            adguardApiKey: 'adg-token',
            profileId: 'my-profile'
        });

        expect(mockLocal.apiKey).toBe('local-only-token');
        expect(mockLocal.adguardApiKey).toBe('adg-token');
        expect(mockLocal.profileId).toBe('my-profile');
        expect(mockSync.profileId).toBe('my-profile');
        expect(mockSync.apiKey).toBeUndefined();
        expect(mockSync.adguardApiKey).toBeUndefined();

        // 2. When syncCredentials is true
        await storage.set({
            syncCredentials: true,
            apiKey: 'synced-token',
            adguardApiKey: 'synced-adg'
        });

        expect(mockLocal.apiKey).toBe('synced-token');
        expect(mockSync.apiKey).toBe('synced-token');
        expect(mockSync.adguardApiKey).toBe('synced-adg');

        // 3. When toggling syncCredentials from true back to false, removes credentials from sync
        await storage.set({ syncCredentials: false });
        expect(mockSync.apiKey).toBeUndefined();
        expect(mockSync.adguardApiKey).toBeUndefined();
        // Kept in local storage
        expect(mockLocal.apiKey).toBe('synced-token');

        // 4. Handles rejection in sync.remove safely
        browser.storage.sync.remove.mockRejectedValueOnce(new Error('Sync remove failed'));
        await expect(storage.set({ syncCredentials: false })).resolves.not.toThrow();
    });

    test('StorageManager: Supports removing keys', async () => {
        const { storage } = await import('../src/storage.js');
        await storage.init();
        await storage.set('tempKey', 'tempVal');
        expect(await storage.get('tempKey')).toBe('tempVal');

        await storage.remove('tempKey');
        expect(await storage.get('tempKey')).toBeNull();
    });

    test('StorageManager: onChanged listener updates and deletes keys in cache', async () => {
        let changeListener;
        global.browser.storage.onChanged.addListener = jest.fn(fn => { changeListener = fn; });
        const { storage } = await import('../src/storage.js');
        storage.initialized = false;
        await storage.init();
        expect(changeListener).toBeDefined();

        // Simulate update
        changeListener({ newProp: { newValue: 'hello' } }, 'sync');
        expect(await storage.get('newProp')).toBe('hello');

        // Simulate delete (newValue: undefined) for normal key
        changeListener({ newProp: { newValue: undefined } }, 'sync');
        expect(await storage.get('newProp')).toBeNull();

        // Simulate delete for CREDENTIAL_KEY in sync area where local has value
        global.browser.storage.local.get = jest.fn().mockResolvedValue({ apiKey: 'localApiKeyVal' });
        changeListener({ apiKey: { newValue: undefined } }, 'sync');
        await new Promise(r => setTimeout(r, 20));
        expect(storage.cache.apiKey).toBe('localApiKeyVal');

        // Simulate delete for CREDENTIAL_KEY in sync area where local does not have value
        global.browser.storage.local.get = jest.fn().mockResolvedValue({});
        changeListener({ apiKey: { newValue: undefined } }, 'sync');
        await new Promise(r => setTimeout(r, 20));
        expect(storage.cache.apiKey).toBeUndefined();

        // Simulate delete for CREDENTIAL_KEY in sync area where local.get rejects
        global.browser.storage.local.get = jest.fn().mockRejectedValue(new Error('Local get failed'));
        changeListener({ apiKey: { newValue: undefined } }, 'sync');
        await new Promise(r => setTimeout(r, 20));
    });

    test('StorageManager: Auto-heal skips credentials when syncCredentials is false', async () => {
        mockSync = { apiKey: 'sync-key-123', syncCredentials: false, activeProfile: 'p1' };
        mockLocal = {};
        const { storage } = await import('../src/storage.js');
        storage.initialized = false;
        storage.initPromise = null;
        await storage.init();
        expect(mockLocal.apiKey).toBeUndefined();
        expect(mockLocal.activeProfile).toBe('p1');
    });

    test('StorageManager: handles init timeout or failure gracefully', async () => {
        jest.useFakeTimers();
        global.browser.storage.sync.get = jest.fn(() => new Promise(() => {})); // Hangs
        const { storage } = await import('../src/storage.js');
        storage.initialized = false;
        const initP = storage.init();
        jest.advanceTimersByTime(2500);
        await initP;
        expect(storage.initialized).toBe(true);
        expect(await storage.get('anyKey', 'defaultVal')).toBe('defaultVal');
        jest.useRealTimers();
    });

    test('StorageManager: Supports removing array of keys', async () => {
        const { storage } = await import('../src/storage.js');
        storage.initialized = false;
        await storage.init();
        await storage.set({ k1: 'v1', k2: 'v2' });
        await storage.remove(['k1', 'k2']);
        expect(await storage.get('k1')).toBeNull();
        expect(await storage.get('k2')).toBeNull();
    });

    test('StorageManager: Safely catches errors in sync/local get, set, remove, and healing', async () => {
        global.browser.storage.sync.get = jest.fn().mockRejectedValue(new Error('Sync get error'));
        global.browser.storage.local.get = jest.fn().mockRejectedValue(new Error('Local get error'));
        global.browser.storage.local.set = jest.fn().mockRejectedValue(new Error('Local set error'));
        global.browser.storage.sync.set = jest.fn().mockRejectedValue(new Error('Sync set error'));
        global.browser.storage.local.remove = jest.fn().mockRejectedValue(new Error('Local remove error'));
        global.browser.storage.sync.remove = jest.fn().mockRejectedValue(new Error('Sync remove error'));

        const { storage } = await import('../src/storage.js');
        storage.initialized = false;
        await storage.init();
        expect(storage.initialized).toBe(true);

        // set handles rejection gracefully (both single key and object batch)
        await expect(storage.set('singleKey', 'singleVal')).resolves.not.toThrow();
        expect(await storage.get('singleKey')).toBe('singleVal');
        await expect(storage.set({ objKey: 'objVal' })).resolves.not.toThrow();
        expect(await storage.get('objKey')).toBe('objVal');

        // remove handles rejection gracefully (both single key and array)
        await expect(storage.remove('singleKey')).resolves.not.toThrow();
        expect(await storage.get('singleKey')).toBeNull();
        await expect(storage.remove(['objKey'])).resolves.not.toThrow();
        expect(await storage.get('objKey')).toBeNull();

        // array get with default object
        const defResult = await storage.get(['nonExistent'], { nonExistent: 'fallbackVal' });
        expect(defResult.nonExistent).toBe('fallbackVal');

        // StorageManager: remove when uninitialized (line 155)
        storage.initialized = false;
        await storage.remove('uninitializedKey');
        expect(storage.initialized).toBe(true);

        // StorageManager: healObj rejection catch (line 65)
        storage.initialized = false;
        global.browser.storage.sync.get = jest.fn().mockResolvedValue({ healKey: 'healValue' });
        global.browser.storage.local.get = jest.fn().mockResolvedValue({});
        global.browser.storage.local.set = jest.fn().mockRejectedValue(new Error('Heal set failed'));
        await storage.init();
        expect(storage.initialized).toBe(true);
    });

    test('StorageManager: Exhaustive Branch Coverage to 100%', async () => {
        const { storage } = await import('../src/storage.js');

        // 1. Line 34: init() when already initialized
        storage.initialized = true;
        expect(await storage.init()).toBeUndefined();

        // 2. Line 35: init() when initPromise is already in progress
        storage.initialized = false;
        const dummyPromise = Promise.resolve('in-flight');
        storage.initPromise = dummyPromise;
        expect(await storage.init()).toBe('in-flight');
        storage.initPromise = null;

        // 3. Lines 45, 48, 64, 68: init() when browser.storage APIs are missing
        const origStorage = global.browser.storage;
        storage.initialized = false;
        global.browser.storage = {}; // no sync, local, onChanged
        await storage.init();
        expect(storage.initialized).toBe(true);

        // Line 64: healObj has keys, but browser.storage.local.set is missing
        storage.initialized = false;
        global.browser.storage = {
            sync: { get: jest.fn().mockResolvedValue({ syncK: 'syncV' }) },
            local: { get: jest.fn().mockResolvedValue({}) }
        };
        await storage.init();
        expect(storage.initialized).toBe(true);

        // Line 82: catch block fallback when this.cache is falsy
        jest.useFakeTimers();
        storage.initialized = false;
        storage.cache = null;
        global.browser.storage = {
            sync: { get: jest.fn(() => new Promise(() => {})) },
            local: { get: jest.fn(() => new Promise(() => {})) }
        };
        const hangPromise = storage.init();
        jest.advanceTimersByTime(2500);
        await hangPromise;
        expect(storage.cache).toEqual({});
        jest.useRealTimers();

        // Restore browser.storage
        global.browser.storage = origStorage;

        // 4. Line 101, 102, 103, 109: get() branches
        // Line 102: get() when uninitialized
        storage.initialized = false;
        const resUninit = await storage.get('autoInitKey', 'default');
        expect(resUninit).toBe('default');

        // Line 101: get() with default params (no arguments)
        const allData = await storage.get();
        expect(typeof allData).toBe('object');

        // Line 103: get(undefined)
        const undefData = await storage.get(undefined);
        expect(typeof undefData).toBe('object');

        // Line 109: get(array, nonObjectDefault)
        await storage.set({ presentKey: 'val123' });
        const arrResult = await storage.get(['presentKey', 'absentKey'], 'not-an-object');
        expect(arrResult.presentKey).toBe('val123');
        expect(arrResult.absentKey).toBeUndefined();

        const arrResultNull = await storage.get(['absentKey'], null);
        expect(arrResultNull.absentKey).toBeUndefined();

        // 5. Line 124, 125, 132, 139, 142: set() branches
        // Line 124: set() when uninitialized
        storage.initialized = false;
        await storage.set('uninitSetKey', 'uninitVal');
        expect(await storage.get('uninitSetKey')).toBe('uninitVal');

        // Line 125: set() with null key (non-object branch: { [null]: value })
        await storage.set(null, 'nullVal');
        expect(storage.cache['null']).toBe('nullVal');

        // Line 139: set() with only LOCAL_ONLY_KEYS so syncObj is empty
        global.browser.storage.sync.set = jest.fn();
        await storage.set({ localLogs: ['log1'] });
        expect(global.browser.storage.sync.set).not.toHaveBeenCalled();

        // Line 139 & 142: set() when browser.storage.sync.set or local.set are missing
        global.browser.storage = {
            sync: {},
            local: {}
        };
        await expect(storage.set('missingMethodsKey', 'val')).resolves.not.toThrow();

        // Line 132: set() when browser.storage is undefined
        delete global.browser.storage;
        await expect(storage.set('noStorageKey', 'val')).resolves.not.toThrow();

        // 6. Line 155, 161, 162, 163: remove() branches
        // Line 161: remove() when browser.storage is undefined
        await expect(storage.remove('noStorageRemoveKey')).resolves.not.toThrow();

        // Restore global.browser.storage with missing remove methods
        global.browser.storage = {
            sync: {},
            local: {}
        };
        await expect(storage.remove(['missingRemoveMethodKey'])).resolves.not.toThrow();

        // Restore original browser.storage
        global.browser.storage = origStorage;
    });
});

