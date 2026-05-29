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
    const sync = await browser.storage.sync.get("activeProfile");
    const local = await browser.storage.local.get("activeProfile");
    const activeProfile = sync.activeProfile || local.activeProfile;
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
    const { blockNotif } = await browser.storage.sync.get("blockNotif");
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
    const sync = await browser.storage.sync.get("iconAction");
    const local = await browser.storage.local.get("iconAction");
    const iconAction = sync.iconAction || local.iconAction || "popup";
    
    if (iconAction === "sidebar") {
        await browser.action.setPopup({ popup: "" });
    } else {
        await browser.action.setPopup({ popup: "popup.html" });
    }
}

/**
 * Main Initialization Lifecycle
 */
async function initializeBackground() {
    if (isInitialized) return;
    console.log("[Init] Starting DNS Forge Background Engine...");
    
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
    
    isInitialized = true;
    console.log("[Init] Background Engine Ready.");
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
async function getHeaders() {
    const sync = await browser.storage.sync.get("apiKey");
    const local = await browser.storage.local.get("apiKey");
    const apiKey = sync.apiKey || local.apiKey || "";
    return { "Content-Type": "application/json", "X-Api-Key": apiKey };
}

async function manageDomain(profileId, listType, domain, action) {
    const headers = await getHeaders();
    const endpoint = `${API_BASE}/profiles/${profileId}/${listType}`;
    try {
        let response;
        if (action === 'add') {
            response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ id: domain }) });
        } else if (action === 'delete') {
            response = await fetch(`${endpoint}/${domain}`, { method: 'DELETE', headers });
        } else if (action === 'list') {
            response = await fetch(endpoint, { method: 'GET', headers });
            if (response.ok) return await response.json();
            return { error: response.statusText };
        }
        return { success: response.ok };
    } catch (error) { return { success: false, error: "Network Error" }; }
}

async function detectActiveProfile() {
    const sync = await browser.storage.sync.get(["overrideProfileId", "apiKey"]);
    const local = await browser.storage.local.get(["overrideProfileId", "apiKey"]);
    const overrideProfileId = sync.overrideProfileId || local.overrideProfileId;
    const apiKey = sync.apiKey || local.apiKey;
    
    let activeId = overrideProfileId;
    
    if (!activeId) {
        try {
            const response = await fetch(TEST_URL, { cache: 'no-store' });
            const data = await response.json();
            if (data?.profile) activeId = data.profile;
        } catch (e) {}
    }

    if (!activeId && apiKey) {
        try {
            const res = await fetch(`${API_BASE}/profiles`, { headers: { "X-Api-Key": apiKey } });
            if (res.ok) {
                const pData = await res.json();
                if (pData.data?.length > 0) activeId = pData.data[0].id;
            }
        } catch (e) {}
    }

    if (activeId) {
        let profileName = activeId; 
        const headers = await getHeaders();
        if (headers["X-Api-Key"]) {
            try {
                const pRes = await fetch(`${API_BASE}/profiles`, { headers });
                if (pRes.ok) {
                    const pData = await pRes.json();
                    const matchedProfile = pData.data.find(p => p.id === activeId || p.fingerprint === activeId);
                    if (matchedProfile) {
                        activeId = matchedProfile.id;
                        profileName = `${matchedProfile.name} (${activeId})`;
                    }
                }
            } catch(e) {}
        }
        
        const saveObj = { activeProfile: activeId, activeProfileName: profileName };
        await Promise.all([
            browser.storage.sync.set(saveObj),
            browser.storage.local.set(saveObj)
        ]);
        
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
        const h = await getHeaders();
        h["Accept"] = "application/json";
        try { 
            const r = await fetch(`${API_BASE}/profiles/${msg.profileId}/logs`, { headers: h, cache: 'no-store' });
            const json = await r.json();
            return { success: r.ok, data: json.data || json || [] };
        } catch(e) { return { success: false, data: [] }; }
    },
    GET_ANALYTICS: async (msg) => {
        const h = await getHeaders();
        try { return await (await fetch(`${API_BASE}/profiles/${msg.profileId}/analytics/status`, { headers: h, cache: 'no-store' })).json(); } catch(e) { return { data: {} }; }
    },
    GET_PROFILE: async () => await detectActiveProfile(),
    GET_PROFILES_LIST: async () => {
        const h = await getHeaders();
        try { return await (await fetch(`${API_BASE}/profiles`, { headers: h, cache: 'no-store' })).json(); } catch(e) { return null; }
    },
    CLEAR_LOGS: async (msg) => {
        const h = await getHeaders();
        const r = await fetch(`${API_BASE}/profiles/${msg.profileId}/logs`, { method: 'DELETE', headers: h });
        return { success: r.ok };
    },
    DOWNLOAD_LOGS_CSV: async (msg) => {
        const h = await getHeaders();
        try { return await (await fetch(`${API_BASE}/profiles/${msg.profileId}/logs/download`, { headers: h, cache: 'no-store' })).text(); } catch(e) { return null; }
    },
    GET_ALL_SETTINGS: async (msg) => {
        const h = await getHeaders();
        try {
            const r = await fetch(`${API_BASE}/profiles/${msg.profileId}`, { headers: h, cache: 'no-store' });
            if (!r.ok) return { success: false, error: r.statusText };
            const res = await r.json();
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
        const h = await getHeaders();
        let { profileId, category, id, action, settingType } = msg;
        
        // Normalize Category (NextDNS API case-sensitivity)
        if (category.toLowerCase().startsWith('parentalcontrol')) {
            category = category.replace(/parentalcontrol/i, 'parentalControl');
        }
        
        const url = `${API_BASE}/profiles/${profileId}/${category}`;
        try {
            let r;
            if (settingType === 'boolean') {
                const body = {}; body[id] = (action === "add");
                r = await fetch(url, { method: 'PATCH', headers: h, body: JSON.stringify(body) });
            } else {
                if (action === "add") {
                    const body = { id: id };
                    if (category.includes('parentalControl')) body.active = true;
                    r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
                } else {
                    r = await fetch(`${url}/${id}`, { method: 'DELETE', headers: h });
                }
            }
            return { success: r.ok };
        } catch(e) { return { success: false, error: e.message }; }
    }
};

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
