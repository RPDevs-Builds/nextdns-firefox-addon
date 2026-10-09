/**
 * DNS Forge - Message Handlers
 * This module defines the core message dispatcher for the background script.
 * It handles all incoming messages from the popup, options page, and viewer window, 
 * coordinating API calls, storage updates, and real-time streaming logic.
 * 
 * @module background/handlers
 */

import { state, API_BASE, TEST_URL, ALARM_PREFIX } from './state.js';
import { storage } from '../storage.js';
import { apiClient } from '../apiClient.js';
import { manageDomain, detectActiveProfile, updateProfileCache } from './api.js';
import { logStreamManager } from './logStream.js';

/**
 * Registry of message handlers keyed by message type.
 * Each handler is an asynchronous function that processes a specific request.
 * @type {Object<string, Function>}
 */
export const messageHandlers = {
    /**
     * Adds or removes a domain from the active profile's allow/deny list.
     * @param {Object} msg - The message object containing profileId, listType, domain, and action.
     */
    MANAGE_DOMAIN: async (msg) => {
        const res = await manageDomain(msg.profileId, msg.listType, msg.domain, msg.action);
        if (res.success && (msg.action === 'add' || msg.action === 'delete')) {
            await updateProfileCache();
        }
        return res;
    },
    /**
     * Temporarily allows a domain by adding it to the allowlist and scheduling an alarm for removal.
     * @param {Object} msg - The message object containing profileId and domain.
     */
    TEMP_ALLOW: async (msg) => {
        const res = await manageDomain(msg.profileId, "allowlist", msg.domain, "add");
        if (res.success) {
            const alarmName = `${ALARM_PREFIX}p=${encodeURIComponent(msg.profileId)}&d=${encodeURIComponent(msg.domain)}`;
            browser.alarms.create(alarmName, { delayInMinutes: 5 });
            await updateProfileCache();
        }
        return res;
    },
    /**
     * Retrieves network request statistics for a specific browser tab.
     * @param {Object} msg - The message object containing tabId.
     */
    GET_TAB_STATS: async (msg) => ({ 
        requests: state.tabRequests[msg.tabId] || {}, 
        blockedCount: state.blockedTabRequests[msg.tabId] || 0 
    }),
    /**
     * Clears network request statistics for a specific browser tab.
     * @param {Object} msg - The message object containing tabId.
     */
    CLEAR_TAB_STATS: async (msg) => {
        if (msg.tabId !== undefined && state.tabRequests[msg.tabId]) {
            state.tabRequests[msg.tabId] = {};
            state.blockedTabRequests[msg.tabId] = 0;
        }
        return { success: true };
    },
    /**
     * Fetches historical logs for a profile from the NextDNS API.
     * @param {Object} msg - The message object containing profileId.
     */
    GET_LOGS: async (msg) => {
        try {
            const rawParam = msg.raw === false ? '' : '?raw=1';
            const r = await apiClient.fetchWithRetry(`/profiles/${msg.profileId}/logs${rawParam}`, { 
                cache: 'no-store', 
                headers: { "Accept": "application/json", "X-Api-Key": await storage.get("apiKey", "") } 
            });
            let data = [];
            if (r.success) {
                const json = await r.response.json();
                data = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
            }
            
            // Merge locally captured browser requests if any, avoiding duplicate domain entries
            if (Array.isArray(state.localLogs) && state.localLogs.length > 0) {
                const existing = new Set(data.map(l => (l.domain || l.name || '').toLowerCase()));
                const missingLocal = state.localLogs.filter(l => !existing.has((l.domain || l.name || '').toLowerCase()));
                data = [...missingLocal, ...data].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            }

            return { success: true, data };
        } catch(e) {
            console.warn("[Handler] GET_LOGS failed:", e);
            return { success: false, data: state.localLogs || [] };
        }
    },
    /**
     * Fetches the current allowlist and denylist for a profile.
     * @param {Object} msg - The message object containing profileId.
     */
    GET_PROFILE_DATA: async (msg) => {
        try {
            const [allow, deny] = await Promise.all([
                apiClient.fetchWithRetry(`/profiles/${msg.profileId}/allowlist`),
                apiClient.fetchWithRetry(`/profiles/${msg.profileId}/denylist`)
            ]);
            const aJson = allow.success ? await allow.response.json() : { data: [] };
            const dJson = deny.success ? await deny.response.json() : { data: [] };
            return { 
                success: true, 
                allowlist: (Array.isArray(aJson.data) ? aJson.data : (Array.isArray(aJson) ? aJson : [])).map(d => d.id),
                denylist: (Array.isArray(dJson.data) ? dJson.data : (Array.isArray(dJson) ? dJson : [])).map(d => d.id)
            };
        } catch (e) {
            console.warn("[Handler] GET_PROFILE_DATA failed:", e);
            return { success: false, allowlist: [], denylist: [] };
        }
    },
    /**
     * Fetches analytics summary or time-series data for a profile.
     * @param {Object} msg - The message object containing profileId and an optional series flag.
     */
    GET_ANALYTICS: async (msg) => {
        const { profileId, series = false } = msg;
        const seriesSuffix = series ? ';series' : '';
        try {
            const r = await apiClient.fetchWithRetry(`/profiles/${profileId}/analytics/status${seriesSuffix}`, { cache: 'no-store' });
            if (!r.success) return { success: false, data: {} };
            const json = await r.response.json();
            if (series) return { success: true, data: json.data || [] };
            const total = (json.data || []).reduce((acc, curr) => acc + (curr.queries || 0), 0);
            const blocked = (json.data || []).find(d => d.status === 'blocked')?.queries || 0;
            return {
                success: true,
                data: {
                    queries: total,
                    blockedQueries: blocked,
                    blockedPercent: total > 0 ? Math.round((blocked / total) * 100) : 0
                }
            };
        } catch(e) {
            console.warn("[Handler] GET_ANALYTICS failed:", e);
            return { success: false, data: {} };
        }
    },
    /**
     * Detects and returns the active profile ID and name.
     */
    GET_PROFILE: async () => await detectActiveProfile(),
    /**
     * Explicit profile re-detection handler.
     */
    DETECT_PROFILE: async () => {
        const profile = await detectActiveProfile();
        return { success: !!profile, profile };
    },
    /**
     * Fetches the list of all available NextDNS profiles in the account.
     */
    GET_PROFILES_LIST: async (msg) => {
        try {
            const fetchOptions = { cache: 'no-store' };
            if (msg?.apiKey) {
                fetchOptions.headers = {
                    "Content-Type": "application/json",
                    "X-Api-Key": msg.apiKey.trim()
                };
            }
            const r = await apiClient.fetchWithRetry(`/profiles`, fetchOptions);
            if (!r.success) return { success: false, data: [] };
            const json = await r.response.json();
            const data = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
            return { success: true, data };
        } catch(e) {
            console.warn("[Handler] GET_PROFILES_LIST failed:", e);
            return { success: false, data: [] };
        }
    },
    /**
     * Toggles a boolean or list-based setting in the NextDNS profile.
     * Implements Mirror Mode replication if configured.
     * @param {Object} msg - The message object containing profileId, category, id, and action.
     */
    TOGGLE_SETTING: async (msg) => {
        const { profileId, category, id, action, value, settingType } = msg;

        // Input validation & path traversal guard
        if (!profileId || typeof profileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(profileId)) {
            return { success: false, error: "Invalid profile ID" };
        }
        if (!category || typeof category !== 'string' || !/^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)*$/.test(category)) {
            return { success: false, error: "Invalid setting category" };
        }
        if (id && (typeof id !== 'string' || id.includes('/') || id.includes('\\') || id.includes('..'))) {
            return { success: false, error: "Invalid setting ID" };
        }

        let endpoint = `/profiles/${profileId}/${category}`;
        let method = 'PATCH';
        let body = null;

        if (settingType === 'list') {
            method = action === 'add' ? 'POST' : 'DELETE';
            endpoint += action === 'add' ? '' : `/${id}`;
            if (action === 'add') body = JSON.stringify({ id });
        } else if (settingType === 'boolean') {
            body = JSON.stringify({ [id]: action === 'add' });
        } else {
            body = JSON.stringify({ [id]: value });
        }
        
        console.log(`[Handler] TOGGLE_SETTING: ${method} ${endpoint} | Body: ${body}`);

        const r = await apiClient.fetchWithRetry(endpoint, { method, body });
        
        console.log(`[Handler] TOGGLE_SETTING Result: ${r.success ? 'Success' : 'Failed'}`);
        if (!r.success) {
            const errorText = await r.response?.text().catch(() => 'No response body');
            console.error(`[Handler] TOGGLE_SETTING Error: ${errorText}`);
        }
        
        // --- Mirror Mode Logic ---
        if (r.success) {
            const mirrorProfiles = await storage.get("mirrorProfiles", []);
            if (mirrorProfiles.length > 0 && !msg._mirrored) {
                for (const mId of mirrorProfiles) {
                    if (mId === profileId) continue;
                    console.log(`[Mirror] Replicating change to profile: ${mId}`);
                    // Execute replication asynchronously without blocking the response
                    messageHandlers.TOGGLE_SETTING({
                        ...msg,
                        profileId: mId,
                        _mirrored: true // Prevent infinite loops
                    }).catch(err => console.error(`[Mirror] Failed for ${mId}:`, err));
                }
            }
        }

        return { success: r.success };
    },
    /**
     * Fetches all configuration categories (security, privacy, etc.) for a profile.
     * Used for backups and snapshots.
     * @param {Object} msg - The message object containing profileId.
     */
    GET_ALL_SETTINGS: async (msg) => {
        const { profileId } = msg;
        const categories = ['security', 'privacy', 'parentalcontrol', 'settings', 'settings/performance'];
        const results = await Promise.all(categories.map(c => apiClient.fetchWithRetry(`/profiles/${profileId}/${c}`, { cache: 'no-store' })));
        const data = {};
        for (let i = 0; i < categories.length; i++) {
            if (results[i].success) {
                const json = await results[i].response.json();
                data[categories[i]] = json.data || json;
            }
        }
        // Normalize settings/performance across flat and nested structures
        if (data['settings/performance']) {
            if (!data.settings) data.settings = {};
            data.settings.performance = { ...(data.settings.performance || {}), ...data['settings/performance'] };
            data.settings.ecs = data['settings/performance'].ecs ?? data.settings.ecs;
            data.settings.cacheBoost = data['settings/performance'].cacheBoost ?? data.settings.cacheBoost;
            data.settings.cnameFlattening = data['settings/performance'].cnameFlattening ?? data.settings.cnameFlattening;
        } else if (data.settings?.performance) {
            data['settings/performance'] = data.settings.performance;
            data.settings.ecs = data.settings.performance.ecs ?? data.settings.ecs;
            data.settings.cacheBoost = data.settings.performance.cacheBoost ?? data.settings.cacheBoost;
            data.settings.cnameFlattening = data.settings.performance.cnameFlattening ?? data.settings.cnameFlattening;
        }
        return { success: true, data };
    },
    /**
     * Correlates blocked domains in a tab with historical NextDNS logs.
     * @param {Object} msg - The message object containing tabId and profileId.
     */
    DEBUG_TAB: async (msg) => {
        const { tabId, profileId } = msg;
        const tabData = state.tabRequests[tabId] || {};
        const blockedDomains = Object.keys(tabData).filter(d => tabData[d].status === 'blocked');
        
        if (blockedDomains.length === 0) return { success: true, correlations: [] };

        const r = await apiClient.fetchWithRetry(`/profiles/${profileId}/logs?raw=1`, { cache: 'no-store' });
        if (!r.success) return { success: false, error: "Failed to fetch logs" };
        const logsData = await r.response.json();
        const logs = logsData.data || [];

        const correlations = blockedDomains.map(domain => {
            const logMatch = logs.find(l => (l.name === domain || l.domain === domain) && l.status === 'blocked');
            if (logMatch) {
                return {
                    domain,
                    reasons: logMatch.reasons || [logMatch.reason || "Unknown"],
                    timestamp: logMatch.timestamp,
                    device: logMatch.device?.name || logMatch.clientIp
                };
            }
            return null;
        }).filter(c => c !== null);

        return { success: true, correlations };
    },
    /**
     * Creates a configuration snapshot of the current profile settings.
     * @param {Object} msg - The message object containing profileId and snapshot name.
     */
    CREATE_SNAPSHOT: async (msg) => {
        const { profileId, name } = msg;
        const configRes = await messageHandlers.GET_ALL_SETTINGS({ profileId });
        if (!configRes.success) return { success: false, error: "Failed to fetch current config" };
        
        const snapshot = {
            id: Date.now().toString(),
            name,
            timestamp: Date.now(),
            data: configRes.data
        };

        const profileSnapshots = await storage.get("profileSnapshots", {});
        if (!profileSnapshots[profileId]) profileSnapshots[profileId] = [];
        profileSnapshots[profileId].unshift(snapshot);
        if (profileSnapshots[profileId].length > 10) profileSnapshots[profileId].pop();
        
        await storage.set("profileSnapshots", profileSnapshots);
        return { success: true, snapshot };
    },
    /**
     * Lists all snapshots for a specific profile.
     * @param {Object} msg - The message object containing profileId.
     */
    LIST_SNAPSHOTS: async (msg) => {
        const profileSnapshots = await storage.get("profileSnapshots", {});
        return { success: true, snapshots: profileSnapshots[msg.profileId] || [] };
    },
    /**
     * Deletes a configuration snapshot.
     * @param {Object} msg - The message object containing profileId and snapshotId.
     */
    DELETE_SNAPSHOT: async (msg) => {
        const profileSnapshots = await storage.get("profileSnapshots", {});
        if (profileSnapshots[msg.profileId]) {
            profileSnapshots[msg.profileId] = profileSnapshots[msg.profileId].filter(s => s.id !== msg.snapshotId);
            await storage.set("profileSnapshots", profileSnapshots);
        }
        return { success: true };
    },
    /**
     * Starts the SSE log stream for a profile.
     * @param {Object} msg - The message object containing profileId.
     */
    START_STREAM: async (msg) => {
        return logStreamManager.start(msg.profileId);
    },
    /**
     * Stops the active SSE log stream.
     */
    STOP_STREAM: async () => {
        logStreamManager.stop();
        return { success: true };
    },
    /**
     * Clears all historical logs for a profile from the NextDNS API.
     * @param {Object} msg - The message object containing profileId.
     */
    CLEAR_LOGS: async (msg) => {
        const r = await apiClient.fetchWithRetry(`/profiles/${msg.profileId}/logs`, { method: 'DELETE' });
        return { success: r.success };
    },
    /**
     * Lists all configured automation rules.
     */
    LIST_RULES: async () => {
        const forgeRules = await storage.get("forgeRules", []);
        return { success: true, rules: forgeRules };
    },
    /**
     * Saves a new automation rule.
     * @param {Object} msg - The message object containing the rule definition.
     */
    SAVE_RULE: async (msg) => {
        const forgeRules = await storage.get("forgeRules", []);
        const newRule = { id: Date.now().toString(), ...msg.rule, active: true };
        forgeRules.push(newRule);
        await storage.set("forgeRules", forgeRules);
        return { success: true, rule: newRule };
    },
    /**
     * Deletes an automation rule.
     * @param {Object} msg - The message object containing ruleId.
     */
    DELETE_RULE: async (msg) => {
        const forgeRules = await storage.get("forgeRules", []);
        const updated = forgeRules.filter(r => r.id !== msg.ruleId);
        await storage.set("forgeRules", updated);
        return { success: true };
    },
    /**
     * Fetches DNS Rewrites for a profile.
     * @param {Object} msg - The message object containing profileId.
     */
    LIST_REWRITES: async (msg) => {
        const r = await apiClient.fetchWithRetry(`/profiles/${msg.profileId}/rewrites`, { cache: 'no-store' });
        if (!r.success) return { success: false, error: "Failed to fetch rewrites" };
        const data = await r.response.json();
        return { success: true, data: data.data || [] };
    },
    /**
     * Saves a DNS Rewrite mapping.
     * @param {Object} msg - The message object containing profileId, name, and content.
     */
    SAVE_REWRITE: async (msg) => {
        const { profileId, name, content } = msg;
        const r = await apiClient.fetchWithRetry(`/profiles/${profileId}/rewrites`, {
            method: 'POST',
            body: JSON.stringify({ name, content })
        });
        return { success: r.success };
    },
    /**
     * Deletes a DNS Rewrite mapping.
     * @param {Object} msg - The message object containing profileId and name.
     */
    DELETE_REWRITE: async (msg) => {
        const { profileId, name } = msg;
        const r = await apiClient.fetchWithRetry(`/profiles/${profileId}/rewrites/${name}`, { method: 'DELETE' });
        return { success: r.success };
    },
    /**
     * Pushes a new notification to the Action Center and persists to storage.
     * Evaluates alert settings for enabled state, trigger filters, and delivery targets.
     * @param {Object} msg - The notification payload.
     */
    PUSH_NOTIFICATION: async (msg) => {
        const { type, severity, message } = msg.payload || {};
        const alertSettings = await storage.get("alertSettings", {
            enabled: true,
            desktop: false,
            actionCenter: true,
            triggerThreats: true,
            triggerDenylist: true,
            triggerParental: false
        });

        // 1. Master toggle check
        if (alertSettings.enabled === false) {
            return { success: false, reason: "alerts_disabled" };
        }

        // 2. Trigger category filter check
        let isTriggerEnabled = true;
        if (type === 'security') {
            isTriggerEnabled = alertSettings.triggerThreats !== false;
        } else if (type === 'denylist' || type === 'block') {
            isTriggerEnabled = alertSettings.triggerDenylist !== false;
        } else if (type === 'parental') {
            isTriggerEnabled = alertSettings.triggerParental !== false;
        }

        if (!isTriggerEnabled) {
            return { success: false, reason: "trigger_type_disabled" };
        }

        const notification = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            type,
            severity,
            message,
            read: false
        };

        // 3. Action Center feed delivery
        if (alertSettings.actionCenter !== false) {
            state.notifications = state.notifications || [];
            state.notifications.unshift(notification);
            if (state.notifications.length > 50) state.notifications.pop();
            await storage.set("notifications", state.notifications);
        }

        // 4. Desktop OS notification delivery
        if (alertSettings.desktop) {
            try {
                if (typeof browser !== 'undefined' && browser.notifications?.create) {
                    await browser.notifications.create({
                        type: "basic",
                        iconUrl: "/icons/icon-48.png",
                        title: `NextDNS ${severity === 'high' ? 'Alert' : 'Notice'}`,
                        message: message
                    });
                }
            } catch (err) {
                console.warn("[Background] Desktop notification creation failed:", err);
            }
        }

        return { success: true };
    },
    /**
     * Retrieves the current list of Action Center notifications.
     */
    GET_NOTIFICATIONS: async () => {
        return { success: true, notifications: state.notifications || [] };
    },
    /**
     * Clears all Action Center notifications from state and storage.
     */
    CLEAR_NOTIFICATIONS: async () => {
        state.notifications = [];
        await storage.set("notifications", []);
        return { success: true };
    },
    /**
     * Saves metadata scraped from the NextDNS dashboard by content scripts.
     * Merges the new data into the 'scrapedMeta' object in storage.
     * @param {Object} msg - The message object containing the payload with metaType and data.
     */
    SAVE_SCRAPED_META: async (msg) => {
        if (!msg?.payload || typeof msg.payload !== 'object') {
            return { success: false, error: "Invalid payload" };
        }
        const { metaType, data } = msg.payload;
        const allowedTypes = ['blocklists', 'parental_services', 'tlds', 'categories'];
        if (!allowedTypes.includes(metaType) || !Array.isArray(data)) {
            return { success: false, error: "Invalid metaType or data format" };
        }
        const scrapedMeta = await storage.get("scrapedMeta", { blocklists: [], parental_services: [], tlds: [], categories: [] });
        
        scrapedMeta[metaType] = data;
        await storage.set("scrapedMeta", scrapedMeta);
        console.log(`[Background] Updated scraped metadata for: ${metaType}`);
        return { success: true };
    }
};
