/**
 * DNS Forge - API Wrapper Functions
 */

import { storage } from '../storage.js';
import { apiClient } from '../apiClient.js';
import { API_BASE, TEST_URL, state } from './state.js';

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

export async function detectActiveProfile() {
    const overrideProfileId = await storage.get("overrideProfileId");
    const apiKey = await storage.get("apiKey");

    let activeId = overrideProfileId;

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

        await storage.set("activeProfile", activeId);
        await storage.set("activeProfileName", profileName);

        return { id: activeId, name: profileName };
    }
    return null;
}

export async function updateProfileCache() {
    const activeProfile = await storage.get("activeProfile");
    if (!activeProfile) return;
    
    const [allow, deny] = await Promise.all([
        manageDomain(activeProfile, "allowlist", null, "list"),
        manageDomain(activeProfile, "denylist", null, "list")
    ]);

    state.currentProfileData.allowlist = new Set((allow?.data || []).filter(d => d?.id).map(d => d.id));
    state.currentProfileData.denylist = new Set((deny?.data || []).filter(d => d?.id).map(d => d.id));
}

export async function checkAndUpdateLinkedIP() {
    const activeProfile = await storage.get("activeProfile");
    if (!activeProfile) return;

    try {
        const res = await fetch("https://api.ipify.org?format=json");
        const { ip } = await res.json();

        const settingsRes = await apiClient.fetchWithRetry(`/profiles/${activeProfile}`);
        if (!settingsRes.success) return;
        const pData = await settingsRes.response.json();
        const currentLinkedIP = pData.data?.linkedIp;

        if (ip && ip !== currentLinkedIP) {
            console.log(`[DDNS] IP Change detected: ${currentLinkedIP} -> ${ip}. Updating...`);
            const updateRes = await apiClient.fetchWithRetry(`/profiles/${activeProfile}/linked-ip/${ip}`, { method: 'POST' });
            if (updateRes.success) {
                console.log("[DDNS] Successfully updated linked IP.");
            }
        }
    } catch (e) {
        console.warn("[DDNS] Check failed", e);
    }
}

