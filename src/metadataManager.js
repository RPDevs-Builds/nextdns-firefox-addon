/**
 * Metadata Manager Utility
 * Handles loading and caching of TLD, Blocklist, and Service metadata.
 * Implements a robust fallback chain: Local Storage -> Remote GitHub -> Local Bundle.
 * 
 * @module metadataManager
 */

const REMOTE_URL = 'https://raw.githubusercontent.com/DNS-Forge/firefox-addon/main/data/blocks_meta.json';
const BUNDLE_PATH = 'data/blocks_meta.json';

/**
 * Loads metadata from the best available source.
 * Updates local storage if a remote fetch is successful.
 * @async
 * @returns {Promise<Object>} The metadata object containing blocklists, tlds, etc.
 */
export async function loadMetadata() {
    try {
        // 1. Try Local Storage Cache
        const local = await browser.storage.local.get("scrapedMeta");
        if (local.scrapedMeta && Object.keys(local.scrapedMeta).length > 0) {
            // Check if it's complete enough (has both tlds and blocklists)
            if (local.scrapedMeta.tlds?.length > 0 && local.scrapedMeta.blocklists?.length > 0) {
                return local.scrapedMeta;
            }
        }

        // 2. Try Remote GitHub (Main Repo)
        const res = await fetch(REMOTE_URL).catch(() => null);
        if (res && res.ok) {
            const data = await res.json();
            await browser.storage.local.set({ scrapedMeta: data });
            return data;
        }

        // 3. Fallback to Bundled Data
        const bundleRes = await fetch(browser.runtime.getURL(BUNDLE_PATH));
        const bundleData = await bundleRes.json();
        return bundleData;
    } catch (e) {
        console.error("[MetadataManager] Load failed:", e);
        return { blocklists: [], parental_services: [], tlds: [], categories: [] };
    }
}
