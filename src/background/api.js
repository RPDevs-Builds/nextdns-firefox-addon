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
    const overrideId = await storage.get("overrideProfileId");
    const apiKey = await storage.get("apiKey");

    // Clean up any legacy invalid fingerprint stored as manualProfileId
    const isManual = Boolean(overrideId && overrideId !== 'auto' && !overrideId.startsWith('fp'));
    const activeId = isManual ? overrideId : null;

    let accountProfiles = [];
    if (apiKey) {
        try {
            const pRes = await apiClient.fetchWithRetry(`${API_BASE}/profiles`, {}, 2, 500);
            if (pRes.success) {
                const pData = await pRes.response.json();
                accountProfiles = Array.isArray(pData.data) ? pData.data : [];
            }
        } catch (e) {
            console.warn("[ProfileDetect] Account profiles fetch failed:", e);
        }
    }

    if (isManual) {
        let profileName = activeId;
        const matched = accountProfiles.find(p => p.id === activeId);
        if (matched) {
            profileName = `${matched.name} (${activeId})`;
        }
        await storage.set("activeProfileName", profileName);
        return { id: activeId, name: profileName, manual: true };
    }

    // Auto-detection mode
    let detectedId = null;
    let detectedName = null;

    // 1. Try test.nextdns.io to identify active network profile
    try {
        const res = await apiClient.fetchWithRetry(TEST_URL, { cache: 'no-store' }, 2, 500);
        if (res.success) {
            const data = await res.response.json();
            const networkProfile = data?.profile;
            if (networkProfile) {
                if (accountProfiles.length > 0) {
                    const matched = accountProfiles.find(p => p.id === networkProfile || p.fingerprint === networkProfile);
                    if (matched) {
                        detectedId = matched.id;
                        detectedName = `${matched.name} (${detectedId})`;
                    }
                } else if (!networkProfile.startsWith('fp')) {
                    detectedId = networkProfile;
                    detectedName = networkProfile;
                }
            }
        }
    } catch (e) {
        console.warn("[ProfileDetect] Test URL detection failed:", e);
    }

    // 2. If test.nextdns.io didn't match, fall back to first account profile
    if (!detectedId && accountProfiles.length > 0) {
        const first = accountProfiles[0];
        detectedId = first.id;
        detectedName = `${first.name} (${detectedId})`;
    }

    if (detectedId) {
        await storage.set("activeProfile", detectedId);
        await storage.set("detectedProfileId", detectedId);
        await storage.set("activeProfileName", detectedName);
        return { id: detectedId, name: detectedName, autoDetected: true };
    }

    return null;
}

/**
 * Synchronizes the background state cache with the current profile's allowlist and denylist.
 * Persists the lists to storage to survive event page suspension.
 * @async
 */
export async function updateProfileCache() {
    const activeProfileId = (await storage.get("activeProfile")) || (await storage.get("detectedProfileId"));
    if (!activeProfileId || activeProfileId.startsWith('fp')) return;
    
    const [allow, deny] = await Promise.all([
        manageDomain(activeProfileId, "allowlist", null, "list"),
        manageDomain(activeProfileId, "denylist", null, "list")
    ]);

    const allowList = (allow?.data || []).filter(d => d?.id).map(d => d.id);
    const denyList = (deny?.data || []).filter(d => d?.id).map(d => d.id);

    state.currentProfileData.allowlist = new Set(allowList);
    state.currentProfileData.denylist = new Set(denyList);

    await storage.set("cachedAllowlist", allowList);
    await storage.set("cachedDenylist", denyList);
}

/**
 * Performs a DDNS check. Detects the current public IP and updates the linked IP in NextDNS 
 * if a change is detected.
 * @async
 */
export async function checkAndUpdateLinkedIP() {
    const activeProfileId = (await storage.get("activeProfile")) || (await storage.get("detectedProfileId"));
    if (!activeProfileId || activeProfileId.startsWith('fp')) return;

    try {
        const settingsRes = await apiClient.fetchWithRetry(`/profiles/${activeProfileId}`);
        if (!settingsRes.success) return;
        const pData = await settingsRes.response.json().catch(() => ({}));
        const currentLinkedIP = pData.data?.linkedIp;

        // Only update if the profile already has a linked IP configured
        if (!currentLinkedIP) return;

        let ip = null;
        // 1. Prioritize NextDNS native diagnostic endpoint (respects host permissions, avoids 3rd party leak)
        try {
            const testRes = await apiClient.fetchWithRetry(TEST_URL, { cache: 'no-store' }, 1, 300);
            if (testRes.success) {
                const testData = await testRes.response.json().catch(() => ({}));
                ip = testData.client || testData.srcIP;
            }
        } catch (_) {}

        // 2. Fall back to external IP detection only if NextDNS test diagnostic is unavailable
        if (!ip) {
            try {
                const res = await fetch("https://api.ipify.org?format=json");
                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    ip = data.ip;
                }
            } catch (_) {}
        }

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
