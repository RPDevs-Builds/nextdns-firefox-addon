/**
 * DNS Forge - Control D API Provider
 * @module providers/controld
 */

import { apiClient } from '../apiClient.js';
import { storage } from '../storage.js';

export const CONTROLD_API_BASE = 'https://api.controld.com';

/**
 * Returns authorization headers for Control D API requests.
 * @async
 * @param {string|null} [apiKeyOverride=null] - Optional API key override.
 * @returns {Promise<Object>} Request headers.
 */
export async function getControldHeaders(apiKeyOverride = null) {
    let key = apiKeyOverride;
    if (!key && storage) {
        key = await storage.get('controldApiKey', '');
    }
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    if (key) {
        headers['Authorization'] = `Bearer ${key.trim()}`;
    }
    return headers;
}

/**
 * Fetches available profiles from the Control D account.
 * @async
 * @param {string|null} [apiKeyOverride=null] - Optional API key override.
 * @returns {Promise<Object>} Object with success status and normalized profiles array.
 */
export async function fetchControldProfiles(apiKeyOverride = null) {
    try {
        const headers = await getControldHeaders(apiKeyOverride);
        const res = await apiClient.fetchWithRetry(`${CONTROLD_API_BASE}/profiles`, { headers, cache: 'no-store' });
        if (!res?.success) return { success: false, data: [] };
        const json = await res.response.json();
        const profiles = Array.isArray(json?.body?.profiles) ? json.body.profiles : [];
        return {
            success: true,
            data: profiles.map(p => ({
                id: p.PK,
                name: p.name || p.PK,
                updated: p.updated
            }))
        };
    } catch (e) {
        console.warn("[Control D] fetchControldProfiles failed:", e);
        return { success: false, data: [] };
    }
}

/**
 * Fetches configured custom rules for a Control D profile and maps them into allowlist/denylist arrays.
 * @async
 * @param {string} profileId - The Control D profile PK.
 * @param {string|null} [apiKeyOverride=null] - Optional API key override.
 * @returns {Promise<Object>} Object containing allowlist and denylist arrays.
 */
export async function fetchControldProfileData(profileId, apiKeyOverride = null) {
    if (!profileId) {
        return { success: false, allowlist: [], denylist: [] };
    }
    try {
        const headers = await getControldHeaders(apiKeyOverride);
        const res = await apiClient.fetchWithRetry(`${CONTROLD_API_BASE}/profiles/${encodeURIComponent(profileId)}/rules`, { headers, cache: 'no-store' });
        if (!res?.success) return { success: false, allowlist: [], denylist: [] };
        const json = await res.response.json();
        const rules = Array.isArray(json?.body?.rules) ? json.body.rules : [];
        
        const allowlist = [];
        const denylist = [];

        for (const r of rules) {
            const domain = r.PK;
            if (!domain) continue;
            if (r.action?.do === 1) {
                allowlist.push(domain);
            } else if (r.action?.do === 0) {
                denylist.push(domain);
            }
        }

        return {
            success: true,
            allowlist,
            denylist
        };
    } catch (e) {
        console.warn("[Control D] fetchControldProfileData failed:", e);
        return { success: false, allowlist: [], denylist: [] };
    }
}

/**
 * Adds or deletes a domain from a Control D profile's custom rules.
 * @async
 * @param {string} profileId - The Control D profile PK.
 * @param {string} listType - 'allowlist' or 'denylist'.
 * @param {string} domain - Domain string to add or delete.
 * @param {string} action - 'add' or 'delete'.
 * @returns {Promise<Object>} Result object with success status.
 */
export async function manageControldDomain(profileId, listType, domain, action) {
    if (!profileId || !domain || typeof domain !== 'string') {
        return { success: false, error: 'Missing profile ID or domain' };
    }
    const cleanDomain = domain.trim().toLowerCase().replace(/^\*+\./, '').replace(/^\.+|\.+$/g, '');
    if (!cleanDomain) return { success: false, error: 'Invalid domain format' };

    try {
        const headers = await getControldHeaders();
        if (action === 'add') {
            const doAction = listType === 'allowlist' ? 1 : 0;
            const res = await apiClient.fetchWithRetry(`${CONTROLD_API_BASE}/profiles/${encodeURIComponent(profileId)}/rules`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hostnames: [cleanDomain],
                    do: doAction
                })
            });
            return { success: !!res?.success };
        } else if (action === 'delete') {
            const res = await apiClient.fetchWithRetry(`${CONTROLD_API_BASE}/profiles/${encodeURIComponent(profileId)}/rules/${encodeURIComponent(cleanDomain)}`, {
                method: 'DELETE',
                headers
            });
            return { success: !!res?.success };
        }
        return { success: false, error: 'Unknown action' };
    } catch (e) {
        console.warn("[Control D] manageControldDomain failed:", e);
        return { success: false, error: e.message || 'Action failed' };
    }
}

/**
 * Fetches query logs for Control D (returns empty array for merging with local webRequest logs).
 * @async
 * @param {string} [profileId=''] - Profile ID.
 * @returns {Promise<Object>} Object with success status and empty data array.
 */
export async function fetchControldLogs(profileId = '') {
    return { success: true, data: [] };
}

/**
 * Clears query logs for Control D.
 * @async
 * @param {string} [profileId=''] - Profile ID.
 * @returns {Promise<Object>} Object with success status.
 */
export async function clearControldLogs(profileId = '') {
    return { success: true };
}
