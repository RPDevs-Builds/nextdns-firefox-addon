/**
 * StorageManager Utility
 * Unifies browser.storage.sync and browser.storage.local access with an active caching layer.
 */
class StorageManager {
    constructor() {
        this.cache = {};
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        const syncData = await browser.storage.sync.get(null);
        const localData = await browser.storage.local.get(null);
        this.cache = { ...localData, ...syncData };
        
        const healObj = {};
        for (let k in syncData) {
            if (syncData[k] !== undefined && localData[k] === undefined) {
                healObj[k] = syncData[k];
            }
        }
        if (Object.keys(healObj).length > 0) {
            await browser.storage.local.set(healObj);
            console.log("[StorageManager] Healed local storage from sync.");
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
        
        this.initialized = true;
    }

    async get(key, defaultValue = null) {
        if (!this.initialized) await this.init();
        return this.cache[key] !== undefined ? this.cache[key] : defaultValue;
    }

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

const storage = new StorageManager();
if (typeof module !== 'undefined') module.exports = storage;
