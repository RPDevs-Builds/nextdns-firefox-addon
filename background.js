/**
 * DNS Forge - background.js
 * The core engine for the NextDNS Firefox extension.
 * 
 * Performance & Security Refactor - June 2026
 */

// --- Constants ---
const API_BASE = "https://api.nextdns.io";
const TEST_URL = "https://test.nextdns.io/";
const ALARM_PREFIX = "tempAllow?"; 

// --- Global State ---
let tabRequests = {};               // Real-time log of requests per tab
let blockedTabRequests = {};        // Counter for blocked requests per tab
let currentProfileData = {          // Cached local copy of allow/deny lists
    allowlist: new Set(), 
    denylist: new Set() 
};
let lastNotificationTimes = {};     // Throttling for block notifications
let isInitialized = false;          // Guard to prevent double initialization

/**
 * Update the local cache of allow/deny lists to speed up request filtering.
 * Triggered on startup, API key change, or manual sync.
 */
async function updateProfileCache() {
    const activeProfile = await storage.get("activeProfile");
    if (!activeProfile) return;
    
    console.log(`[Cache] Syncing lists for profile: ${activeProfile}`);
    
    // Fetch both lists in parallel
    const [allow, deny] = await Promise.all([
        manageDomain(activeProfile, "allowlist", null, "list"),
        manageDomain(activeProfile, "denylist", null, "list")
    ]);

    currentProfileData.allowlist = new Set((allow?.data || []).filter(d => d?.id).map(d => d.id));
    currentProfileData.denylist = new Set((deny?.data || []).filter(d => d?.id).map(d => d.id));
    
    console.log(`[Cache] Sync complete. Allow: ${currentProfileData.allowlist.size}, Deny: ${currentProfileData.denylist.size}`);
}

/**
 * Setup Context Menus (Idempotent)
 */
async function setupContextMenus() {
    // ALWAYS remove all before creating to prevent duplicates (GEMINI.md mandate)
    await browser.menus.removeAll();
    
    browser.menus.create({
        id: "dns-forge-allow",
        title: "Allow domain '%s'",
        contexts: ["link", "page"],
    });
    browser.menus.create({
        id: "dns-forge-deny",
        title: "Deny domain '%s'",
        contexts: ["link", "page"],
    });
}

/**
 * WebRequest Listener: Core filtering logic
 */
function requestListener(details) {
    // Only track requests originating from visible tabs
    if (details.tabId >= 0) {
        try {
            const url = new URL(details.url);
            const domain = url.hostname;
            
            // Clear tab state on new page load
            if (!tabRequests[details.tabId] || details.type === "main_frame") {
                tabRequests[details.tabId] = {};
                blockedTabRequests[details.tabId] = 0;
            }
            
            let status = 'allowed';
            let reason = 'Default';
            
            // Check for matches in cached lists (GEMINI.md: use local cache)
            if (getMatch(domain, currentProfileData.allowlist)) {
                status = 'allowed';
                reason = 'Allow List';
            } else if (getMatch(domain, currentProfileData.denylist)) {
                status = 'blocked';
                reason = 'Deny List';
            }

            // Record request for Dashboard tracking
            tabRequests[details.tabId][domain] = { status, reason, timestamp: Date.now() };

            if (status === 'blocked') {
                blockedTabRequests[details.tabId]++;
                
                // Block Notifications (Throttled to 10s per unique domain - GEMINI.md mandate)
                handleBlockNotification(domain);

                return { cancel: true };
            }
        } catch (e) {
            console.error("[WebRequest] Error processing request:", e);
        }
    }
    return { cancel: false };
}

/**
 * Logic to throttle notifications
 */
async function handleBlockNotification(domain) {
    const blockNotif = await storage.get("blockNotif");
    if (!blockNotif) return;

    const now = Date.now();
    const lastTime = lastNotificationTimes[domain] || 0;
    
    if (now - lastTime > 10000) {
        lastNotificationTimes[domain] = now;
        browser.notifications.create({
            type: "basic",
            iconUrl: "icons/icon-48.png",
            title: "NextDNS Blocked",
            message: `${domain} was blocked.`
        });
    }
}

/**
 * Domain matching with wildcard support (parent domain match)
 */
function getMatch(domain, listSet) {
    if (listSet.has(domain)) return domain;
    const parts = domain.split('.');
    // Walk up the domain tree (e.g., sub.example.com -> example.com)
    for (let i = 1; i < parts.length - 1; i++) {
        const root = parts.slice(i).join('.');
        if (listSet.has(root)) return root;
    }
    return null;
}

/**
 * Unified Storage Change Listener
 */
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" || area === "local") {
        if (changes.iconAction) {
            applyIconAction();
        }
        if (changes.apiKey || changes.overrideProfileId) {
            updateProfileCache();
        }
    }
});

/**
 * Handle Toolbar Icon Action (Sidebar vs Popup)
 */
async function applyIconAction() {
    const iconAction = await storage.get("iconAction", "popup");

    if (iconAction === "sidebar") {
        await browser.action.setPopup({ popup: "" });
    } else {
        await browser.action.setPopup({ popup: "popup.html" });
    }
}

browser.action.onClicked.addListener(async () => {
    const iconAction = await storage.get("iconAction", "popup");

    if (iconAction === "sidebar") {
        if (browser.sidebarAction && browser.sidebarAction.open) {
            browser.sidebarAction.open();
        } else if (browser.sidebarAction && browser.sidebarAction.toggle) {
            browser.sidebarAction.toggle();
        }
    }
});
/**
 * SSE Log Streaming Manager
 */
const logStreamManager = {
    eventSource: null,
    currentProfileId: null,

    async start(profileId) {
        if (this.eventSource && this.currentProfileId === profileId) return { success: true };
        this.stop();

        const apiKey = await storage.get("apiKey");
        if (!apiKey) return { success: false, error: "API Key required" };

        this.currentProfileId = profileId;
        const url = `${API_BASE}/profiles/${profileId}/logs/stream?api_key=${apiKey}`;
        
        try {
            this.eventSource = new EventSource(url);
            
            this.eventSource.onmessage = (event) => {
                try {
                    const log = JSON.parse(event.data);
                    // Broadcast to all active extension components
                    browser.runtime.sendMessage({ type: "LIVE_LOG", log }).catch(() => {});
                } catch (e) {}
            };

            this.eventSource.onerror = (err) => {
                console.warn("[SSE] Stream error:", err);
                this.stop();
            };

            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    stop() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            this.currentProfileId = null;
        }
    }
};

/**
 * Main Initialization Lifecycle
 */
async function initializeBackground() {
    if (isInitialized) return;
    console.log("[Init] Starting DNS Forge Background Engine...");
    
    // Initialize centralized storage cache
    if (typeof storage !== 'undefined') await storage.init();

    // 1. Detect active profile & setup UI
    await detectActiveProfile();
    await applyIconAction();
    await setupContextMenus();
    
    // 2. Initial Cache Warm-up
    await updateProfileCache();
    
    // 3. Attach WebRequest Listeners
    if (!browser.webRequest.onBeforeRequest.hasListener(requestListener)) {
        browser.webRequest.onBeforeRequest.addListener(
            requestListener,
            { urls: ["<all_urls>"] },
            ["blocking"]
        );
    }
    
    // 4. Start Dynamic IP Updater (DDNS)
    browser.alarms.create("ddns-check", { periodInMinutes: 60 });
    checkAndUpdateLinkedIP();

    // 5. Start Automation Scheduler
    browser.alarms.create("rule-engine", { periodInMinutes: 1 });
    checkAutomationRules();

    isInitialized = true;
    console.log("[Init] Background Engine Ready.");
}

async function checkAndUpdateLinkedIP() {
    const activeProfile = await storage.get("activeProfile");
    if (!activeProfile) return;

    try {
        // 1. Get current WAN IP
        const res = await fetch("https://api.ipify.org?format=json");
        const { ip } = await res.json();
        
        // 2. Get Profile Settings to check current Linked IP
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

// Start Initialization
initializeBackground();

/**
 * Tab Management (Memory Cleanup)
 */
browser.tabs.onRemoved.addListener((tabId) => {
    delete tabRequests[tabId];
    delete blockedTabRequests[tabId];
});

/**
 * Context Menu Click Handler
 */
browser.menus.onClicked.addListener(async (info, tab) => {
    try {
        const urlStr = info.linkUrl || info.pageUrl || tab?.url;
        if (!urlStr) return;
        const domain = new URL(urlStr).hostname;
        
        if (info.menuItemId === "dns-forge-allow") {
            await manageDomain(tab?.activeProfile || "current", "allowlist", domain, "add");
        } else if (info.menuItemId === "dns-forge-deny") {
            await manageDomain(tab?.activeProfile || "current", "denylist", domain, "add");
        }
        await updateProfileCache();
    } catch (e) {
        console.error("[ContextMenus] Error handling click:", e);
    }
});

/**
 * API Communication Layer
 */
async function manageDomain(profileId, listType, domain, action) {
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

async function detectActiveProfile() {
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

/**
 * Message Handlers: Bridge between UI and API
 */
const messageHandlers = {
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
    GET_TAB_STATS: async (msg) => ({ requests: tabRequests[msg.tabId] || {}, blockedCount: blockedTabRequests[msg.tabId] || 0 }),
    GET_LOGS: async (msg) => {
        try { 
            const r = await apiClient.fetchWithRetry(`/profiles/${msg.profileId}/logs`, { cache: 'no-store', headers: { "Accept": "application/json", "X-Api-Key": await storage.get("apiKey", "") } });
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
            return r.success ? await r.response.json() : null;
        } catch(e) { return null; }
    },
    DEBUG_TAB: async (msg) => {
        const tabId = msg.tabId;
        const profileId = msg.profileId;
        const localRequests = tabRequests[tabId] || {};
        const localDomains = Object.keys(localRequests);

        if (localDomains.length === 0) return { success: true, correlations: [] };

        try {
            const r = await apiClient.fetchWithRetry(`/profiles/${profileId}/logs`, { cache: 'no-store' });
            if (!r.success) return { success: false, error: "Failed to fetch API logs" };
            
            const apiLogs = await r.response.json();
            const correlations = [];

            // Match API logs against local tab requests
            (apiLogs.data || apiLogs || []).forEach(log => {
                if (localDomains.includes(log.domain) && log.status === 'blocked') {
                    correlations.push({
                        domain: log.domain,
                        status: log.status,
                        reasons: log.reasons || [],
                        timestamp: log.timestamp,
                        device: log.deviceName || log.device || "Unknown"
                    });
                }
            });

            return { success: true, correlations };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },
    CLEAR_LOGS: async (msg) => {
        const r = await apiClient.fetchWithRetry(`/profiles/${msg.profileId}/logs`, { method: 'DELETE' });
        return { success: r.success };
    },
    DOWNLOAD_LOGS_CSV: async (msg) => {
        try { 
            const r = await apiClient.fetchWithRetry(`/profiles/${msg.profileId}/logs/download`, { cache: 'no-store' });
            return r.success ? await r.response.text() : null;
        } catch(e) { return null; }
    },
    GET_ALL_SETTINGS: async (msg) => {
        try {
            const r = await apiClient.fetchWithRetry(`/profiles/${msg.profileId}`, { cache: 'no-store' });
            if (!r.success) return { success: false, error: r.error };
            const res = await r.response.json();
            const p = res.data || {};
            return { 
                success: true, 
                data: { 
                    security: p.security || {}, 
                    privacy: p.privacy || {}, 
                    parentalcontrol: p.parentalControl || {},
                    services: p.parentalControl?.services || [],
                    categories: p.parentalControl?.categories || [],
                    natives: p.privacy?.natives || [],
                    blocklists: p.privacy?.blocklists || [],
                    tlds: p.security?.tlds || []
                } 
            };
        } catch(e) { return { success: false, error: e.message }; }
    },
    TOGGLE_SETTING: async (msg) => {
        let { profileId, category, id, action, settingType } = msg;
        
        // Normalize Category (NextDNS API case-sensitivity)
        if (category.toLowerCase().startsWith('parentalcontrol')) {
            category = category.replace(/parentalcontrol/i, 'parentalControl');
        }
        
        const endpoint = `/profiles/${profileId}/${category}`;
        try {
            let r;
            if (settingType === 'boolean') {
                const body = {}; body[id] = (action === "add");
                r = await apiClient.fetchWithRetry(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
            } else {
                if (action === "add") {
                    const body = { id: id };
                    if (category.includes('parentalControl')) body.active = true;
                    r = await apiClient.fetchWithRetry(endpoint, { method: 'POST', body: JSON.stringify(body) });
                } else {
                    r = await apiClient.fetchWithRetry(`${endpoint}/${id}`, { method: 'DELETE' });
                }
            }
            return { success: r.success };
        } catch(e) { return { success: false, error: e.message }; }
    },
    CREATE_SNAPSHOT: async (msg) => {
        const profileId = msg.profileId;
        const name = msg.name || `Snapshot ${new Date().toLocaleString()}`;
        
        // 1. Fetch current config
        const settingsRes = await messageHandlers.GET_ALL_SETTINGS({ profileId });
        if (!settingsRes.success) return { success: false, error: "Failed to fetch current config" };

        // 2. Load existing snapshots
        const { profileSnapshots = {} } = await browser.storage.local.get("profileSnapshots");
        if (!profileSnapshots[profileId]) profileSnapshots[profileId] = [];

        // 3. Add new snapshot
        const snapshot = {
            id: Date.now().toString(),
            name,
            timestamp: Date.now(),
            config: settingsRes.data
        };
        profileSnapshots[profileId].unshift(snapshot);

        // Limit to last 10 snapshots per profile
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

        // 1. Check Security Defaults
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

        // 2. Check for Deprecated Lists
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

/**
 * Automation Rule Engine
 */
async function checkAutomationRules() {
    const { forgeRules = [] } = await browser.storage.sync.get("forgeRules");
    if (forgeRules.length === 0) return;

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    for (const rule of forgeRules) {
        if (!rule.active) continue;
        
        if (rule.trigger === currentTime) {
            console.log(`[Scheduler] Rule matched: ${rule.name} (${rule.action} ${rule.targetId})`);
            const activeProfile = await storage.get("activeProfile");
            if (!activeProfile) continue;

            await messageHandlers.TOGGLE_SETTING({
                profileId: activeProfile,
                category: rule.category,
                id: rule.targetId,
                action: rule.action === 'enable' ? 'add' : 'delete',
                settingType: rule.settingType || 'id'
            });
        }
    }
}

/**
 * Global Message Listener
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = messageHandlers[message.type];
    if (handler) {
        handler(message).then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep channel open for async response
    }
});

/**
 * Alarm Listener (Temp Allows & Periodic Sync)
 */
browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
        const params = new URLSearchParams(alarm.name.slice(ALARM_PREFIX.length));
        const p = params.get("p");
        const d = params.get("d");
        if (p && d) {
            await manageDomain(p, "allowlist", d, "delete");
            await updateProfileCache();
        }
    } else if (alarm.name === "ddns-check") {
        checkAndUpdateLinkedIP();
    } else if (alarm.name === "rule-engine") {
        checkAutomationRules();
    }
});

if (typeof module !== 'undefined') {
    module.exports = { 
        initializeBackground, 
        updateProfileCache, 
        detectActiveProfile, 
        manageDomain, 
        requestListener, 
        messageHandlers 
    };
}
