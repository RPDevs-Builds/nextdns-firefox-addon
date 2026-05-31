/**
 * DNS Forge - API Wrapper Functions
 * Provides high-level functions for interacting with the NextDNS API, 
 * including domain management, profile detection, and DDNS updates.
 * 
 * @module background/api
 */

import { storage } from '../storage.js';
import { apiClient } from '../apiClient.js';
import { API_BASE, TEST_URL, state } from './state.js';

/**
 * Manages domains in a profile's allowlist or denylist.
 * Supports adding, deleting, and listing entries.
 * @async
 * @param {string} profileId - The NextDNS profile ID.
 * @param {string} listType - The type of list ('allowlist' or 'denylist').
 * @param {string|null} domain - The domain to add or delete (null for list action).
 * @param {string} action - The action to perform ('add', 'delete', or 'list').
 * @returns {Promise<Object>} A result object with success status or data.
 */
export async function manageDomain(profileId, listType, domain, action) {
    const endpoint = `/profiles/${profileId}/${listType}`;
    try {
        let res;
        if (action === 'add') {
            res = await apiClient.fetchWithRetry(endpoint, { method: 'POST', body: JSON.stringify({ id: domain }) });
        } else if (action === 'delete') {
            res = await apiClient.fetchWithRetry(`${endpoint}/${domain}`, { method: 'DELETE' });
        } else if (action === 'list') {
            res = await apiClient.fetchWithRetry(endpoint, { method: 'GET' });
            if (res.success) return await res.response.json();
            return { error: res.error || "Fetch Error" };
        }
        return { success: res.success };
    } catch (error) { return { success: false, error: "Network Error" }; }
}

/**
 * Detects the currently active NextDNS profile.
 * Prioritizes a user-defined override, then diagnostic tests, and finally the account profile list.
 * Updates the storage with the identified profile ID and name.
 * @async
 * @returns {Promise<{id: string, name: string}|null>} The detected profile object or null.
 */
export async function detectActiveProfile() {
    const manualProfileId = await storage.get("activeProfile");
    const apiKey = await storage.get("apiKey");

    let activeId = manualProfileId;

    if (!activeId) {
        try {
            const res = await apiClient.fetchWithRetry(TEST_URL, { cache: 'no-store' }, 2, 500);
            if (res.success) {
                const data = await res.response.json();
                if (data?.profile) activeId = data.profile;
            }
        } catch (e) {}
    }

    if (!activeId && apiKey) {
        try {
            const res = await apiClient.fetchWithRetry(`${API_BASE}/profiles`, {}, 2, 500);
            if (res.success) {
                const pData = await res.response.json();
                if (pData.data?.length > 0) activeId = pData.data[0].id;
            }
        } catch (e) {}
    }

    if (activeId) {
        let profileName = activeId;
        if (apiKey) {
            try {
                const pRes = await apiClient.fetchWithRetry(`${API_BASE}/profiles`, {}, 2, 500);
                if (pRes.success) {
                    const pData = await pRes.response.json();
                    const matchedProfile = pData.data.find(p => p.id === activeId || p.fingerprint === activeId);
                    if (matchedProfile) {
                        activeId = matchedProfile.id;
                        profileName = `${matchedProfile.name} (${activeId})`;
                    }
                }
            } catch(e) {}
        }

        // Only save to storage if it changed or wasn't set to prevent redundant writes
        const currentStored = await storage.get("activeProfile");
        if (activeId !== currentStored) {
            await storage.set("activeProfile", activeId);
            await storage.set("activeProfileName", profileName);
        }

        return { id: activeId, name: profileName };
    }
    return null;
}

/**
 * Synchronizes the background state cache with the current profile's allowlist and denylist.
 * @async
 */
export async function updateProfileCache() {
    const activeProfileId = await storage.get("activeProfile");
    if (!activeProfileId) return;
    
    const [allow, deny] = await Promise.all([
        manageDomain(activeProfileId, "allowlist", null, "list"),
        manageDomain(activeProfileId, "denylist", null, "list")
    ]);

    state.currentProfileData.allowlist = new Set((allow?.data || []).filter(d => d?.id).map(d => d.id));
    state.currentProfileData.denylist = new Set((deny?.data || []).filter(d => d?.id).map(d => d.id));
}

/**
 * Performs a DDNS check. Detects the current public IP and updates the linked IP in NextDNS 
 * if a change is detected.
 * @async
 */
export async function checkAndUpdateLinkedIP() {
    const activeProfileId = await storage.get("activeProfile");
    if (!activeProfileId) return;

    try {
        const res = await fetch("https://api.ipify.org?format=json");
        const { ip } = await res.json();

        const settingsRes = await apiClient.fetchWithRetry(`/profiles/${activeProfileId}`);
        if (!settingsRes.success) return;
        const pData = await settingsRes.response.json();
        const currentLinkedIP = pData.data?.linkedIp;

        if (ip && ip !== currentLinkedIP) {
            console.log(`[DDNS] IP Change detected: ${currentLinkedIP} -> ${ip}. Updating...`);
            const updateRes = await apiClient.fetchWithRetry(`/profiles/${activeProfileId}/linked-ip/${ip}`, { method: 'POST' });
            if (updateRes.success) {
                console.log("[DDNS] Successfully updated linked IP.");
            }
        }
    } catch (e) {
        console.warn("[DDNS] Check failed", e);
    }
}
