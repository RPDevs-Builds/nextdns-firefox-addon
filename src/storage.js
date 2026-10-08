/**
 * StorageManager Utility
 * Unifies browser.storage.sync and browser.storage.local access with an active caching layer.
 * Provides synchronous access to cached storage values and ensures data consistency between storage areas.
 * 
 * @module storage
 */
const LOCAL_ONLY_KEYS = new Set([
    'cachedAllowlist',
    'cachedDenylist',
    'profileSnapshots',
    'notifications',
    'scrapedMeta',
    'localLogs'
]);

class StorageManager {
    constructor() {
        /** @type {Object} Internal cache of storage values */
        this.cache = {};
        /** @type {boolean} Initialization status */
        this.initialized = false;
        /** @type {Promise|null} Promise for ongoing initialization */
        this.initPromise = null;
    }

    /**
     * Initializes the storage manager by loading all data from sync and local storage.
     * Implements an "auto-heal" mechanism to restore missing local data from sync.
     * Sets up a listener for external storage changes to keep the cache synchronized.
     * @async
     */
    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                // Use a timeout to prevent hanging forever if storage API is unresponsive
                const storageTimeout = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Storage init timeout")), 2000)
                );

                const loadData = async () => {
                    const syncData = (typeof browser !== 'undefined' && browser.storage?.sync?.get)
                        ? await browser.storage.sync.get(null).catch(() => ({}))
                        : {};
                    const localData = (typeof browser !== 'undefined' && browser.storage?.local?.get)
                        ? await browser.storage.local.get(null).catch(() => ({}))
                        : {};
                    return { syncData, localData };
                };

                const { syncData, localData } = await Promise.race([loadData(), storageTimeout]);
                
                this.cache = { ...localData, ...syncData };
                
                const healObj = {};
                for (let k in syncData) {
                    if (syncData[k] !== undefined && localData[k] === undefined) {
                        healObj[k] = syncData[k];
                    }
                }
                if (Object.keys(healObj).length > 0 && typeof browser !== 'undefined' && browser.storage?.local?.set) {
                    await browser.storage.local.set(healObj).catch(() => null);
                }

                if (typeof browser !== 'undefined' && browser.storage?.onChanged?.addListener) {
                    browser.storage.onChanged.addListener((changes, area) => {
                        for (let [key, { newValue }] of Object.entries(changes)) {
                            if (newValue === undefined) {
                                delete this.cache[key];
                            } else {
                                this.cache[key] = newValue;
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn("[StorageManager] Initialization partially failed or timed out:", e);
                // Fallback to empty cache if everything failed, but mark as initialized to unblock
                this.cache = this.cache || {};
            } finally {
                this.initialized = true;
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    }

    /**
     * Retrieves a value or multiple values from the storage cache.
     * Falls back to defaultValue if a single key is not found.
     * Supports passing a single string key, an array of keys, or null to retrieve all cached data.
     * @async
     * @param {string|string[]|null} [key=null] - The storage key(s) to retrieve, or null for all.
     * @param {*} [defaultValue=null] - The value to return if the key is not found.
     * @returns {Promise<*>} The stored value(s) or defaultValue.
     */
    async get(key = null, defaultValue = null) {
        if (!this.initialized) await this.init();
        if (key === null || key === undefined) {
            return { ...this.cache };
        }
        if (Array.isArray(key)) {
            const result = {};
            for (const k of key) {
                result[k] = this.cache[k] !== undefined ? this.cache[k] : (defaultValue && typeof defaultValue === 'object' ? defaultValue[k] : undefined);
            }
            return result;
        }
        return this.cache[key] !== undefined ? this.cache[key] : defaultValue;
    }

    /**
     * Sets a value or multiple key-value pairs in storage and updates the internal cache.
     * Automatically filters out local-only keys from sync storage to respect browser quotas.
     * @async
     * @param {string|Object} key - The storage key to set or an object of key-value pairs.
     * @param {*} [value] - The value to store (ignored if key is an object).
     */
    async set(key, value) {
        if (!this.initialized) await this.init();
        const updateObj = (typeof key === 'object' && key !== null) ? { ...key } : { [key]: value };
        
        for (const [k, v] of Object.entries(updateObj)) {
            this.cache[k] = v;
        }

        const promises = [];
        if (typeof browser !== 'undefined' && browser.storage) {
            const syncObj = {};
            for (const [k, v] of Object.entries(updateObj)) {
                if (!LOCAL_ONLY_KEYS.has(k)) {
                    syncObj[k] = v;
                }
            }
            if (Object.keys(syncObj).length > 0 && browser.storage.sync?.set) {
                promises.push(browser.storage.sync.set(syncObj).catch(() => null));
            }
            if (browser.storage.local?.set) {
                promises.push(browser.storage.local.set(updateObj).catch(() => null));
            }
        }
        await Promise.all(promises);
    }

    /**
     * Removes a key or list of keys from storage and cache.
     * @async
     * @param {string|string[]} keys - Key or keys to remove.
     */
    async remove(keys) {
        if (!this.initialized) await this.init();
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
            delete this.cache[k];
        }
        const promises = [];
        if (typeof browser !== 'undefined' && browser.storage) {
            if (browser.storage.sync?.remove) promises.push(browser.storage.sync.remove(keyList).catch(() => null));
            if (browser.storage.local?.remove) promises.push(browser.storage.local.remove(keyList).catch(() => null));
        }
        await Promise.all(promises);
    }
}

/**
 * Single instance of the StorageManager exported for project-wide use.
 */
export const storage = new StorageManager();
