/**
 * StorageManager Utility
 * Unifies browser.storage.sync and browser.storage.local access with an active caching layer.
 * Provides synchronous access to cached storage values and ensures data consistency between storage areas.
 * 
 * @module storage
 */
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
                    const syncData = await browser.storage.sync.get(null).catch(() => ({}));
                    const localData = await browser.storage.local.get(null).catch(() => ({}));
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
                if (Object.keys(healObj).length > 0) {
                    await browser.storage.local.set(healObj).catch(() => null);
                }

                browser.storage.onChanged.addListener((changes, area) => {
                    for (let [key, { newValue }] of Object.entries(changes)) {
                        if (newValue === undefined) {
                            delete this.cache[key];
                        } else {
                            this.cache[key] = newValue;
                        }
                    }
                });
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
     * Retrieves a value from the storage cache.
     * Falls back to a default value if the key is not found.
     * @async
     * @param {string} key - The storage key to retrieve.
     * @param {*} [defaultValue=null] - The value to return if the key is not found.
     * @returns {Promise<*>} The stored value or defaultValue.
     */
    async get(key, defaultValue = null) {
        if (!this.initialized) await this.init();
        return this.cache[key] !== undefined ? this.cache[key] : defaultValue;
    }

    /**
     * Sets a value in both sync and local storage and updates the internal cache.
     * @async
     * @param {string} key - The storage key to set.
     * @param {*} value - The value to store.
     */
    async set(key, value) {
        if (!this.initialized) await this.init();
        this.cache[key] = value;
        const obj = { [key]: value };
        await Promise.all([
            browser.storage.sync.set(obj),
            browser.storage.local.set(obj)
        ]);
    }
}

/**
 * Single instance of the StorageManager exported for project-wide use.
 */
export const storage = new StorageManager();
