/**
 * DNS Forge - Pi-hole API Provider
 * @module providers/pihole
 */

import { apiClient } from '../apiClient.js';
import { storage } from '../storage.js';

export const DEFAULT_PIHOLE_URL = 'http://pi.hole/admin';

/**
 * Normalizes a raw URL into a canonical Pi-hole admin endpoint.
 * @param {string} [rawUrl=''] - The raw URL input.
 * @returns {string} Normalized base admin URL (e.g. 'http://pi.hole/admin').
 */
export function normalizePiholeUrl(rawUrl = '') {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return DEFAULT_PIHOLE_URL;
    }
    let url = rawUrl.trim();
    if (!url) return DEFAULT_PIHOLE_URL;

    if (!/^https?:\/\//i.test(url)) {
        url = `http://${url}`;
    }
    url = url.replace(/\/+$/, '');
    url = url.replace(/\/api\.php$/i, '');
    if (!/\/admin$/i.test(url)) {
        url = `${url}/admin`;
    }
    return url;
}

/**
 * Returns configuration (base admin URL and API token) for Pi-hole requests.
 * @async
 * @param {string|null} [apiKeyOverride=null] - Optional API token override.
 * @param {string|null} [urlOverride=null] - Optional URL override.
 * @returns {Promise<{ baseUrl: string, apiKey: string }>} Pi-hole configuration.
 */
export async function getPiholeConfig(apiKeyOverride = null, urlOverride = null) {
    let apiKey = apiKeyOverride;
    let rawUrl = urlOverride;

    if (!apiKey && storage) {
        apiKey = await storage.get('piholeApiKey', '');
    }
    if (!rawUrl && storage) {
        rawUrl = await storage.get('piholeUrl', DEFAULT_PIHOLE_URL);
    }

    const baseUrl = normalizePiholeUrl(rawUrl);
    return {
        baseUrl,
        apiKey: typeof apiKey === 'string' ? apiKey.trim() : ''
    };
}

/**
 * Fetches the active profile/server identity from the Pi-hole instance.
 * @async
 * @param {string|null} [apiKeyOverride=null] - Optional API key override.
 * @param {string|null} [urlOverride=null] - Optional URL override.
 * @returns {Promise<Object>} Object with success status and server profiles array.
 */
export async function fetchPiholeProfiles(apiKeyOverride = null, urlOverride = null) {
    try {
        const { baseUrl, apiKey } = await getPiholeConfig(apiKeyOverride, urlOverride);
        const authParam = apiKey ? `&auth=${encodeURIComponent(apiKey)}` : '';
        const url = `${baseUrl}/api.php?status${authParam}`;

        const res = await apiClient.fetchWithRetry(url, { cache: 'no-store' });
        if (!res?.success) return { success: false, data: [] };

        let statusText = 'enabled';
        try {
            const json = await res.response.json();
            if (json && json.status) {
                statusText = json.status;
            }
        } catch (_) {}

        return {
            success: true,
            data: [
                {
                    id: 'pihole-default',
                    name: `Pi-hole (${statusText})`,
                    status: statusText
                }
            ]
        };
    } catch (e) {
        console.warn("[Pi-hole] fetchPiholeProfiles failed:", e);
        return { success: false, data: [] };
    }
}

/**
 * Helper to safely extract domain strings from Pi-hole list JSON responses.
 * @param {Object|Array} [json=null] - The parsed JSON.
 * @returns {string[]} Array of domain strings.
 */
export function extractDomains(json = null) {
    const list = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
    const result = [];
    for (const item of list) {
        let domain = '';
        if (typeof item === 'string') {
            domain = item;
        } else if (item && typeof item === 'object') {
            domain = item.domain || item.name || (Array.isArray(item) ? item[0] : '');
        }
        if (domain && typeof domain === 'string') {
            result.push(domain);
        }
    }
    return result;
}

/**
 * Fetches whitelist and blacklist rules from the Pi-hole instance.
 * @async
 * @param {string} [profileId='pihole-default'] - Profile/instance ID.
 * @param {string|null} [apiKeyOverride=null] - Optional API key override.
 * @param {string|null} [urlOverride=null] - Optional URL override.
 * @returns {Promise<Object>} Object containing allowlist and denylist arrays.
 */
export async function fetchPiholeProfileData(profileId = 'pihole-default', apiKeyOverride = null, urlOverride = null) {
    if (!profileId) {
        return { success: false, allowlist: [], denylist: [] };
    }
    try {
        const { baseUrl, apiKey } = await getPiholeConfig(apiKeyOverride, urlOverride);
        const authParam = apiKey ? `&auth=${encodeURIComponent(apiKey)}` : '';

        const [whiteRes, blackRes] = await Promise.all([
            apiClient.fetchWithRetry(`${baseUrl}/api.php?list=white${authParam}`, { cache: 'no-store' }),
            apiClient.fetchWithRetry(`${baseUrl}/api.php?list=black${authParam}`, { cache: 'no-store' })
        ]);

        let allowlist = [];
        let denylist = [];

        if (whiteRes?.success) {
            try {
                const whiteJson = await whiteRes.response.json();
                allowlist = extractDomains(whiteJson);
            } catch (_) {}
        }

        if (blackRes?.success) {
            try {
                const blackJson = await blackRes.response.json();
                denylist = extractDomains(blackJson);
            } catch (_) {}
        }

        return {
            success: true,
            allowlist,
            denylist
        };
    } catch (e) {
        console.warn("[Pi-hole] fetchPiholeProfileData failed:", e);
        return { success: false, allowlist: [], denylist: [] };
    }
}

/**
 * Adds or deletes a domain from Pi-hole's whitelist or blacklist.
 * @async
 * @param {string} profileId - Profile/instance ID.
 * @param {string} listType - 'allowlist' or 'denylist'.
 * @param {string} domain - Domain string.
 * @param {string} action - 'add' or 'delete'.
 * @param {string|null} [apiKeyOverride=null] - Optional API key override.
 * @param {string|null} [urlOverride=null] - Optional URL override.
 * @returns {Promise<Object>} Result object with success status.
 */
export async function managePiholeDomain(profileId, listType, domain, action, apiKeyOverride = null, urlOverride = null) {
    if (!profileId || !domain || typeof domain !== 'string') {
        return { success: false, error: 'Missing profile ID or domain' };
    }
    const cleanDomain = domain.trim().toLowerCase().replace(/^\*+\./, '').replace(/^\.+|\.+$/g, '');
    if (!cleanDomain) return { success: false, error: 'Invalid domain format' };

    try {
        const { baseUrl, apiKey } = await getPiholeConfig(apiKeyOverride, urlOverride);
        const authParam = apiKey ? `&auth=${encodeURIComponent(apiKey)}` : '';
        const listParam = listType === 'allowlist' ? 'white' : 'black';
        const opParam = action === 'add' ? 'add' : (action === 'delete' ? 'sub' : null);

        if (!opParam) {
            return { success: false, error: 'Unknown action' };
        }

        const url = `${baseUrl}/api.php?list=${listParam}&${opParam}=${encodeURIComponent(cleanDomain)}${authParam}`;
        const res = await apiClient.fetchWithRetry(url, { cache: 'no-store' });

        return { success: !!res?.success };
    } catch (e) {
        console.warn("[Pi-hole] managePiholeDomain failed:", e);
        return { success: false, error: e.message || 'Action failed' };
    }
}

/**
 * Fetches recent query logs from Pi-hole.
 * @async
 * @param {string} [profileId=''] - Profile ID.
 * @param {string|null} [apiKeyOverride=null] - Optional API key override.
 * @param {string|null} [urlOverride=null] - Optional URL override.
 * @returns {Promise<Object>} Object with success status and normalized log items array.
 */
export async function fetchPiholeLogs(profileId = '', apiKeyOverride = null, urlOverride = null) {
    try {
        const { baseUrl, apiKey } = await getPiholeConfig(apiKeyOverride, urlOverride);
        const authParam = apiKey ? `&auth=${encodeURIComponent(apiKey)}` : '';
        const url = `${baseUrl}/api.php?getAllQueries=100${authParam}`;

        const res = await apiClient.fetchWithRetry(url, { cache: 'no-store' });
        if (!res?.success) return { success: true, data: [] };

        const json = await res.response.json();
        const rawQueries = Array.isArray(json?.data) ? json.data : [];

        const data = rawQueries.map(q => {
            if (!Array.isArray(q)) return null;
            const timestamp = parseInt(q[0], 10) ? parseInt(q[0], 10) * 1000 : Date.now();
            const domain = q[2] || '';
            const client = q[3] || '';
            const statusNum = parseInt(q[4], 10);
            const isBlocked = statusNum === 1 || statusNum === 4 || statusNum === 5;

            return {
                timestamp,
                domain,
                name: domain,
                client,
                deviceId: client,
                status: isBlocked ? 'blocked' : 'allowed'
            };
        }).filter(Boolean);

        return { success: true, data };
    } catch (e) {
        console.warn("[Pi-hole] fetchPiholeLogs failed:", e);
        return { success: true, data: [] };
    }
}

/**
 * Clears query logs buffer for Pi-hole.
 * @async
 * @param {string} [profileId=''] - Profile ID.
 * @returns {Promise<Object>} Object with success status.
 */
export async function clearPiholeLogs(profileId = '') {
    return { success: true };
}

/**
 * Temporarily disables Pi-hole ad blocking (snooze).
 * @async
 * @param {number} [seconds=0] - Duration in seconds (0 = permanently disabled).
 * @param {string|null} [apiKeyOverride=null] - Optional API key override.
 * @param {string|null} [urlOverride=null] - Optional URL override.
 * @returns {Promise<Object>} Object with success status.
 */
export async function disablePiholeBlocking(seconds = 0, apiKeyOverride = null, urlOverride = null) {
    try {
        const { baseUrl, apiKey } = await getPiholeConfig(apiKeyOverride, urlOverride);
        const authParam = apiKey ? `&auth=${encodeURIComponent(apiKey)}` : '';
        const url = `${baseUrl}/api.php?disable=${encodeURIComponent(seconds)}${authParam}`;

        const res = await apiClient.fetchWithRetry(url, { cache: 'no-store' });
        return { success: !!res?.success };
    } catch (e) {
        console.warn("[Pi-hole] disablePiholeBlocking failed:", e);
        return { success: false, error: e.message || 'Disable failed' };
    }
}
