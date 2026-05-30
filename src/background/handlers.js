/**
 * DNS Forge - Message Handlers
 */

import { state, API_BASE, TEST_URL, ALARM_PREFIX } from './state.js';
import { storage } from '../storage.js';
import { apiClient } from '../apiClient.js';
import { manageDomain, detectActiveProfile, updateProfileCache } from './api.js';
import { logStreamManager } from './logStream.js';

export const messageHandlers = {
    MANAGE_DOMAIN: async (msg) => {
        const res = await manageDomain(msg.profileId, msg.listType, msg.domain, msg.action);
        if (res.success && (msg.action === 'add' || msg.action === 'delete')) {
            await updateProfileCache();
        }
        return res;
    },
    TEMP_ALLOW: async (msg) => {
        const res = await manageDomain(msg.profileId, "allowlist", msg.domain, "add");
        if (res.success) {
            const alarmName = `${ALARM_PREFIX}p=${encodeURIComponent(msg.profileId)}&d=${encodeURIComponent(msg.domain)}`;
            browser.alarms.create(alarmName, { delayInMinutes: 5 });
            await updateProfileCache();
        }
        return res;
    },
    GET_TAB_STATS: async (msg) => ({ 
        requests: state.tabRequests[msg.tabId] || {}, 
        blockedCount: state.blockedTabRequests[msg.tabId] || 0 
    }),
    GET_LOGS: async (msg) => {
        try {
            const r = await apiClient.fetchWithRetry(`/profiles/${msg.profileId}/logs`, { 
                cache: 'no-store', 
                headers: { "Accept": "application/json", "X-Api-Key": await storage.get("apiKey", "") } 
            });
            if (!r.success) return { success: false, data: [] };
            const json = await r.response.json();
            return { success: true, data: json.data || json || [] };
        } catch(e) { return { success: false, data: [] }; }
    },
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
        } catch(e) { return { success: false, data: {} }; }
    },
    GET_PROFILE: async () => await detectActiveProfile(),
    GET_PROFILES_LIST: async () => {
        try {
            const r = await apiClient.fetchWithRetry(`/profiles`, { cache: 'no-store' });
            if (!r.success) return { success: false, data: [] };
            const json = await r.response.json();
            return { success: true, data: json.data || [] };
        } catch(e) { return { success: false, data: [] }; }
    },
    TOGGLE_SETTING: async (msg) => {
        const { profileId, category, id, action, value, settingType } = msg;
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

        const r = await apiClient.fetchWithRetry(endpoint, { method, body });
        
        // --- Mirror Mode Logic ---
        if (r.success) {
            const { mirrorProfiles = [] } = await browser.storage.sync.get("mirrorProfiles");
            if (mirrorProfiles.length > 0 && !msg._mirrored) {
                mirrorProfiles.forEach(mId => {
                    if (mId === profileId) return;
                    console.log(`[Mirror] Replicating change to profile: ${mId}`);
                    messageHandlers.TOGGLE_SETTING({
                        ...msg,
                        profileId: mId,
                        _mirrored: true // Prevent infinite loops
                    });
                });
            }
        }

        return { success: r.success };
    },
    GET_ALL_SETTINGS: async (msg) => {
        const { profileId } = msg;
        const categories = ['security', 'privacy', 'parentalcontrol', 'settings'];
        const results = await Promise.all(categories.map(c => apiClient.fetchWithRetry(`/profiles/${profileId}/${c}`, { cache: 'no-store' })));
        const data = {};
        for (let i = 0; i < categories.length; i++) {
            if (results[i].success) {
                const json = await results[i].response.json();
                data[categories[i]] = json.data || json;
            }
        }
        return { success: true, data };
    },
    DEBUG_TAB: async (msg) => {
        const { tabId, profileId } = msg;
        const tabData = state.tabRequests[tabId] || {};
        const blockedDomains = Object.keys(tabData).filter(d => tabData[d].status === 'blocked');
        
        if (blockedDomains.length === 0) return { success: true, correlations: [] };

        const r = await apiClient.fetchWithRetry(`/profiles/${profileId}/logs`, { cache: 'no-store' });
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

        const { profileSnapshots = {} } = await browser.storage.local.get("profileSnapshots");
        if (!profileSnapshots[profileId]) profileSnapshots[profileId] = [];
        profileSnapshots[profileId].unshift(snapshot);
        if (profileSnapshots[profileId].length > 10) profileSnapshots[profileId].pop();
        
        await browser.storage.local.set({ profileSnapshots });
        return { success: true, snapshot };
    },
    LIST_SNAPSHOTS: async (msg) => {
        const { profileSnapshots = {} } = await browser.storage.local.get("profileSnapshots");
        return { success: true, snapshots: profileSnapshots[msg.profileId] || [] };
    },
    DELETE_SNAPSHOT: async (msg) => {
        const { profileSnapshots = {} } = await browser.storage.local.get("profileSnapshots");
        if (profileSnapshots[msg.profileId]) {
            profileSnapshots[msg.profileId] = profileSnapshots[msg.profileId].filter(s => s.id !== msg.snapshotId);
            await browser.storage.local.set({ profileSnapshots });
        }
        return { success: true };
    },
    START_STREAM: async (msg) => {
        return logStreamManager.start(msg.profileId);
    },
    STOP_STREAM: async () => {
        logStreamManager.stop();
        return { success: true };
    },
    LIST_RULES: async () => {
        const { forgeRules = [] } = await browser.storage.sync.get("forgeRules");
        return { success: true, rules: forgeRules };
    },
    SAVE_RULE: async (msg) => {
        const { forgeRules = [] } = await browser.storage.sync.get("forgeRules");
        const newRule = { id: Date.now().toString(), ...msg.rule, active: true };
        forgeRules.push(newRule);
        await browser.storage.sync.set({ forgeRules });
        return { success: true, rule: newRule };
    },
    DELETE_RULE: async (msg) => {
        const { forgeRules = [] } = await browser.storage.sync.get("forgeRules");
        const updated = forgeRules.filter(r => r.id !== msg.ruleId);
        await browser.storage.sync.set({ forgeRules: updated });
        return { success: true };
    },
    LIST_REWRITES: async (msg) => {
        const r = await apiClient.fetchWithRetry(`/profiles/${msg.profileId}/rewrites`, { cache: 'no-store' });
        if (!r.success) return { success: false, error: "Failed to fetch rewrites" };
        const data = await r.response.json();
        return { success: true, data: data.data || [] };
    },
    SAVE_REWRITE: async (msg) => {
        const { profileId, name, content } = msg;
        const r = await apiClient.fetchWithRetry(`/profiles/${profileId}/rewrites`, {
            method: 'POST',
            body: JSON.stringify({ name, content })
        });
        return { success: r.success };
    },
    DELETE_REWRITE: async (msg) => {
        const { profileId, name } = msg;
        const r = await apiClient.fetchWithRetry(`/profiles/${profileId}/rewrites/${name}`, { method: 'DELETE' });
        return { success: r.success };
    },
    RUN_AUDIT: async (msg) => {
        const profileId = msg.profileId;
        const configRes = await messageHandlers.GET_ALL_SETTINGS({ profileId });
        if (!configRes.success) return { success: false, error: "Failed to fetch config" };

        const config = configRes.data;
        const recommendations = [];
        let score = 100;

        const securityChecks = {
            dga: { name: "DGA Protection", score: 10 },
            nrd: { name: "Block Newly Registered Domains", score: 10 },
            parkedDomains: { name: "Block Parked Domains", score: 5 },
            csam: { name: "Block CSAM", score: 15 }
        };

        for (let [id, check] of Object.entries(securityChecks)) {
            if (!config.security[id]) {
                score -= check.score;
                recommendations.push({
                    type: "security",
                    severity: "high",
                    message: `${check.name} is disabled. Enabling this is highly recommended for safety.`,
                    fix: { category: "security", id, action: "add", settingType: "boolean" }
                });
            }
        }

        try {
            const auditDataUrl = browser.runtime.getURL("data/deprecated_lists.json");
            const auditDataRes = await fetch(auditDataUrl);
            const auditData = await auditDataRes.json();

            (config.blocklists || []).forEach(list => {
                const dep = auditData.deprecated.find(d => d.id === list.id);
                if (dep) {
                    score -= 5;
                    recommendations.push({
                        type: "blocklist",
                        severity: "medium",
                        message: `List [${list.name}] is deprecated: ${dep.reason}`,
                        fix: { category: "privacy/blocklists", id: list.id, action: "delete" }
                    });
                }
            });
        } catch (e) { console.warn("Audit metadata load failed", e); }

        return { success: true, score: Math.max(0, score), recommendations };
    }
};
