/**
 * DNS Forge - AdGuard DNS API Provider
 * @module providers/adguard
 */

import { apiClient } from '../apiClient.js';
import { storage } from '../storage.js';

export const ADGUARD_API_BASE = 'https://api.adguard-dns.io/oapi/v1';

/**
 * Returns authorization headers for AdGuard DNS API requests.
 * @async
 * @param {string|null} [apiKeyOverride=null] - Optional API key override.
 * @returns {Promise<Object>} Request headers.
 */
export async function getAdguardHeaders(apiKeyOverride = null) {
    let key = apiKeyOverride;
    if (!key && storage) {
        key = await storage.get('adguardApiKey', '');
    }
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    if (key) {
        headers['Authorization'] = `ApiKey ${key.trim()}`;
    }
    return headers;
}

/**
 * Fetches available DNS servers (profiles) from the AdGuard DNS account.
 * @async
 * @param {string|null} [apiKeyOverride=null] - Optional API key override.
 * @returns {Promise<Object>} Object with success status and data array.
 */
export async function fetchAdguardServers(apiKeyOverride = null) {
    try {
        const headers = await getAdguardHeaders(apiKeyOverride);
        const res = await apiClient.fetchWithRetry(`${ADGUARD_API_BASE}/dns_servers`, { headers, cache: 'no-store' });
        if (!res?.success) return { success: false, data: [] };
        const json = await res.response.json();
        const data = Array.isArray(json) ? json : (json?.data || []);
        return {
            success: true,
            data: data.map(s => ({
                id: s.id,
                name: s.name,
                default: !!s.default,
                settings: s.settings
            }))
        };
    } catch (e) {
        console.warn("[AdGuard] fetchAdguardServers failed:", e);
        return { success: false, data: [] };
    }
}

/**
 * Fetches the user rules (allowlist and denylist) for a specific AdGuard DNS server.
 * @async
 * @param {string} serverId - The AdGuard DNS server ID.
 * @returns {Promise<Object>} Object with success status, allowlist, and denylist.
 */
export async function fetchAdguardProfileData(serverId) {
    if (!serverId || typeof serverId !== 'string') {
        return { success: false, allowlist: [], denylist: [] };
    }
    try {
        const headers = await getAdguardHeaders();
        const res = await apiClient.fetchWithRetry(`${ADGUARD_API_BASE}/dns_servers/${serverId}`, { headers, cache: 'no-store' });
        if (!res?.success) return { success: false, allowlist: [], denylist: [] };
        const server = await res.response.json();
        const rules = server?.settings?.user_rules_settings?.rules || [];
        
        const allowlist = [];
        const denylist = [];
        rules.forEach(r => {
            if (typeof r !== 'string') return;
            if (r.startsWith('@@||')) {
                allowlist.push(r.replace(/^@@\|\|/, '').replace(/\^$/, ''));
            } else if (r.startsWith('||')) {
                denylist.push(r.replace(/^\|\|/, '').replace(/\^$/, ''));
            }
        });
        return { success: true, allowlist, denylist };
    } catch (e) {
        console.warn("[AdGuard] fetchAdguardProfileData failed:", e);
        return { success: false, allowlist: [], denylist: [] };
    }
}

/**
 * Adds or removes a domain rule in an AdGuard DNS server.
 * In AdGuard DNS:
 *   - Allow rule format: @@||domain^
 *   - Deny rule format:  ||domain^
 * @async
 * @param {string} serverId - The AdGuard DNS server ID.
 * @param {string} listType - 'allowlist' or 'denylist'.
 * @param {string} domain - Domain string to add or delete.
 * @param {string} action - 'add' or 'delete'.
 * @returns {Promise<Object>} Result object with success status.
 */
export async function manageAdguardDomain(serverId, listType, domain, action) {
    if (!serverId || !domain || typeof domain !== 'string') {
        return { success: false, error: 'Missing server ID or domain' };
    }
    const cleanDomain = domain.trim().toLowerCase().replace(/^\*+\./, '').replace(/^\.+|\.+$/g, '');
    if (!cleanDomain) return { success: false, error: 'Invalid domain format' };

    try {
        const headers = await getAdguardHeaders();
        const getRes = await apiClient.fetchWithRetry(`${ADGUARD_API_BASE}/dns_servers/${serverId}`, { headers, cache: 'no-store' });
        if (!getRes?.success) return { success: false, error: 'Failed to fetch current AdGuard settings' };
        const server = await getRes.response.json();
        
        let rules = Array.isArray(server?.settings?.user_rules_settings?.rules) 
            ? [...server.settings.user_rules_settings.rules] 
            : [];

        const allowRule = `@@||${cleanDomain}^`;
        const denyRule = `||${cleanDomain}^`;

        if (action === 'add') {
            rules = rules.filter(r => r !== allowRule && r !== denyRule);
            if (listType === 'allowlist') {
                rules.push(allowRule);
            } else {
                rules.push(denyRule);
            }
        } else if (action === 'delete') {
            rules = rules.filter(r => r !== allowRule && r !== denyRule);
        }

        const putRes = await apiClient.fetchWithRetry(`${ADGUARD_API_BASE}/dns_servers/${serverId}/settings`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                user_rules_settings: {
                    enabled: true,
                    rules
                }
            })
        });
        return { success: !!putRes?.success };
    } catch (e) {
        console.warn("[AdGuard] manageAdguardDomain failed:", e);
        return { success: false, error: e.message || 'Action failed' };
    }
}

/**
 * Fetches query logs from AdGuard DNS and normalizes them into DNS Forge log schema.
 * @async
 * @param {string} [serverId=''] - Optional AdGuard DNS server ID filter.
 * @param {number|null} [timeFromMillis=null] - Start timestamp in ms.
 * @param {number|null} [timeToMillis=null] - End timestamp in ms.
 * @returns {Promise<Object>} Object with success status and array of log objects.
 */
export async function fetchAdguardLogs(serverId = '', timeFromMillis = null, timeToMillis = null) {
    try {
        const headers = await getAdguardHeaders();
        const now = timeToMillis || Date.now();
        const from = timeFromMillis || (now - 24 * 60 * 60 * 1000);
        const serverParam = serverId ? `&dns_servers=${encodeURIComponent(serverId)}` : '';
        const url = `${ADGUARD_API_BASE}/query_log?time_from_millis=${from}&time_to_millis=${now}${serverParam}`;
        
        const res = await apiClient.fetchWithRetry(url, { headers, cache: 'no-store' });
        if (!res?.success) return { success: false, data: [] };
        const json = await res.response.json();
        const items = Array.isArray(json?.items) ? json.items : [];
        
        const data = items.map(item => ({
            name: item.domain,
            domain: item.domain,
            timestamp: item.time_millis,
            status: item.filtering_info?.status === 'BLOCKED' ? 'blocked' : (item.filtering_info?.status === 'WHITELISTED' ? 'allowed' : 'default'),
            reasons: item.filtering_info?.rules ? item.filtering_info.rules.map(r => ({ name: r.text || r })) : [],
            device: { id: item.device_id, name: item.device_name || item.device_id || 'AdGuard Client' }
        }));
        return { success: true, data };
    } catch (e) {
        console.warn("[AdGuard] fetchAdguardLogs failed:", e);
        return { success: false, data: [] };
    }
}

/**
 * Clears query logs on the AdGuard DNS account.
 * @async
 * @returns {Promise<Object>} Object with success status.
 */
export async function clearAdguardLogs() {
    try {
        const headers = await getAdguardHeaders();
        const res = await apiClient.fetchWithRetry(`${ADGUARD_API_BASE}/query_log`, {
            method: 'DELETE',
            headers
        });
        return { success: !!res?.success };
    } catch (e) {
        console.warn("[AdGuard] clearAdguardLogs failed:", e);
        return { success: false };
    }
}
