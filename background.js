const API_BASE = "https://api.nextdns.io";
const TEST_URL = "https://test.nextdns.io/";

let tabRequests = {}; 
let blockedTabRequests = {}; 
let currentProfileData = { allowlist: new Set(), denylist: new Set() };

const ALARM_PREFIX = "tempAllow?"; 

async function updateProfileCache() {
  const { activeProfile } = await browser.storage.sync.get("activeProfile");
  if (!activeProfile) return;
  
  const [allow, deny] = await Promise.all([
    manageDomain(activeProfile, "allowlist", null, "list"),
    manageDomain(activeProfile, "denylist", null, "list")
  ]);

  currentProfileData.allowlist = new Set((allow?.data || []).map(d => d.id));
  currentProfileData.denylist = new Set((deny?.data || []).map(d => d.id));
}

async function setupContextMenus() {
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

browser.menus.onClicked.addListener(async (info, tab) => {
  const { activeProfile } = await browser.storage.sync.get("activeProfile");
  if (!activeProfile) return;

  let url;
  try {
    url = new URL(info.linkUrl || info.pageUrl || tab.url);
  } catch (e) { return; }
  
  const domain = url.hostname;
  const listType = info.menuItemId === "dns-forge-allow" ? "allowlist" : "denylist";
  
  await manageDomain(activeProfile, listType, domain, "add");
  updateProfileCache();
  updateWebRequestListeners();
});

async function applyIconAction() {
  const { iconAction } = await browser.storage.sync.get("iconAction");
  if (iconAction === "sidebar") await browser.action.setPopup({ popup: "" });
  else await browser.action.setPopup({ popup: "popup.html" });
}

async function initializeBackground() {
  console.log("Initializing DNS Forge Background...");
  await detectActiveProfile();
  await applyIconAction();
  setupContextMenus();
  await updateProfileCache();
  updateWebRequestListeners();
  console.log("DNS Forge Background Initialized.");
}

// Ensure initialization runs on every script load (handles reloads/updates)
initializeBackground();

// For Testing
if (typeof module !== 'undefined') {
  module.exports = { initializeBackground, requestListener };
}

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") browser.runtime.openOptionsPage();
  browser.alarms.create("refreshProfile", { periodInMinutes: 15 });
  browser.alarms.create("syncCache", { periodInMinutes: 5 });
});

browser.runtime.onStartup.addListener(() => {
  // initializeBackground already runs at top level
});

browser.action.onClicked.addListener(async () => {
  const { iconAction } = await browser.storage.sync.get("iconAction");
  if (iconAction === "sidebar") {
    try {
      await browser.sidebarAction.open();
    } catch (e) {
      console.error("Failed to open sidebar:", e);
    }
  }
});

function updateWebRequestListeners() {
  const isListening = browser.webRequest.onBeforeRequest.hasListener(requestListener);
  if (!isListening) {
    browser.webRequest.onBeforeRequest.addListener(
      requestListener,
      { urls: ["<all_urls>"] },
      ["blocking"]
    );
  }
}

function getMatch(domain, listSet) {
  if (listSet.has(domain)) return domain;
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const root = parts.slice(i).join('.');
    if (listSet.has(root)) return root;
  }
  return null;
}

let lastNotificationTimes = {};

function requestListener(details) {
  if (details.tabId >= 0) {
    try {
      const url = new URL(details.url);
      const domain = url.hostname;
      
      if (!tabRequests[details.tabId] || details.type === "main_frame") {
        tabRequests[details.tabId] = {};
        blockedTabRequests[details.tabId] = 0;
      }
      
      let status = 'allowed';
      let reason = 'Default';
      
      if (getMatch(domain, currentProfileData.allowlist)) {
        status = 'allowed';
        reason = 'Allow List';
      } else if (getMatch(domain, currentProfileData.denylist)) {
        status = 'blocked';
        reason = 'Deny List';
      }

      tabRequests[details.tabId][domain] = { status, reason, timestamp: Date.now() };

      if (status === 'blocked') {
        blockedTabRequests[details.tabId]++;
        
        // Trigger Notification if enabled
        browser.storage.sync.get("blockNotif").then(({ blockNotif }) => {
          if (blockNotif) {
            const now = Date.now();
            if (!lastNotificationTimes[domain] || (now - lastNotificationTimes[domain] > 10000)) {
              lastNotificationTimes[domain] = now;
              browser.notifications.create({
                type: "basic",
                iconUrl: "icons/icon-48.png",
                title: "NextDNS Blocked",
                message: `${domain} was blocked.`
              });
            }
          }
        });

        return { cancel: true };
      }
    } catch (e) {
      console.error("Error in requestListener:", e);
    }
  }
  return { cancel: false };
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Initialize tab tracking if it doesn't exist
  if (!tabRequests[tabId]) {
    tabRequests[tabId] = {};
    blockedTabRequests[tabId] = 0;
  }
  // We no longer clear here because changeInfo.url fires AFTER network requests have started, wiping out the logs.
});

browser.tabs.onRemoved.addListener((tabId) => {
  delete tabRequests[tabId];
  delete blockedTabRequests[tabId];
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "refreshProfile") detectActiveProfile();
  else if (alarm.name === "syncCache") updateProfileCache();
  else if (alarm.name.startsWith(ALARM_PREFIX)) {
    const params = new URLSearchParams(alarm.name.slice(ALARM_PREFIX.length));
    const profileId = params.get("p");
    const domain = params.get("d");
    if (profileId && domain) {
      await manageDomain(profileId, "allowlist", domain, "delete");
      updateProfileCache();
    }
  }
});

async function getHeaders() {
  const { apiKey } = await browser.storage.sync.get("apiKey");
  return { "Content-Type": "application/json", "X-Api-Key": apiKey || "" };
}

async function manageDomain(profileId, listType, domain, action) {
  const headers = await getHeaders();
  const endpoint = `${API_BASE}/profiles/${profileId}/${listType}`;
  try {
    let response;
    if (action === 'add') response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ id: domain }) });
    else if (action === 'delete') response = await fetch(`${endpoint}/${domain}`, { method: 'DELETE', headers });
    else if (action === 'list') {
      response = await fetch(endpoint, { method: 'GET', headers });
      if (response.ok) return await response.json();
      return { error: response.statusText };
    }
    return { success: response.ok };
  } catch (error) { return { success: false, error: "Network Error" }; }
}

async function detectActiveProfile() {
  const { overrideProfileId, apiKey } = await browser.storage.sync.get(["overrideProfileId", "apiKey"]);
  let activeId = overrideProfileId;
  
  if (!activeId) {
    try {
      const response = await fetch(TEST_URL, { cache: 'no-store' });
      const data = await response.json();
      if (data && data.profile) activeId = data.profile;
    } catch (e) {}
  }

  // Fallback to first profile if we have an API key but no active ID
  if (!activeId && apiKey) {
    try {
      const h = { "X-Api-Key": apiKey };
      const res = await fetch(`${API_BASE}/profiles`, { headers: h });
      if (res.ok) {
        const pData = await res.json();
        if (pData.data && pData.data.length > 0) activeId = pData.data[0].id;
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
    await browser.storage.sync.set({ activeProfile: activeId, activeProfileName: profileName });
    return { id: activeId, name: profileName };
  }
  return null;
}

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
    }
    return res;
  },
  GET_TAB_STATS: async (msg) => ({ requests: tabRequests[msg.tabId] || {}, blockedCount: blockedTabRequests[msg.tabId] || 0 }),
  GET_LOGS: async (msg) => {
    const h = await getHeaders();
    h["Accept"] = "application/json";
    try { 
      const r = await fetch(`${API_BASE}/profiles/${msg.profileId}/logs`, { headers: h });
      const json = await r.json();
      if (json && json.data) return { success: true, data: json.data };
      if (Array.isArray(json)) return { success: true, data: json };
      return { success: false, data: [] };
    } catch(e) { return { success: false, data: [] }; }
  },
  GET_ANALYTICS: async (msg) => {
    const h = await getHeaders();
    try { return await (await fetch(`${API_BASE}/profiles/${msg.profileId}/analytics/status`, { headers: h })).json(); } catch(e) { return { data: {} }; }
  },
  GET_PROFILE: async () => await detectActiveProfile(),
  GET_PROFILES_LIST: async () => {
    const h = await getHeaders();
    try { return await (await fetch(`${API_BASE}/profiles`, { headers: h })).json(); } catch(e) { return null; }
  },
  CLEAR_LOGS: async (msg) => {
    const h = await getHeaders();
    const r = await fetch(`${API_BASE}/profiles/${msg.profileId}/logs`, { method: 'DELETE', headers: h });
    return { success: r.ok };
  },
  DOWNLOAD_LOGS_CSV: async (msg) => {
    const h = await getHeaders();
    try { return await (await fetch(`${API_BASE}/profiles/${msg.profileId}/logs/download`, { headers: h })).text(); } catch(e) { return null; }
  },
  
  // --- Optimized: Fetch root profile for all Blocks UI Tabs ---
  GET_ALL_SETTINGS: async (msg) => {
    const h = await getHeaders();
    try {
      const r = await fetch(`${API_BASE}/profiles/${msg.profileId}`, { headers: h });
      if (!r.ok) return { success: false, error: r.statusText };
      const res = await r.json();
      const p = res.data || {};
      
      return { 
        success: true, 
        data: { 
          security: p.security || {}, 
          privacy: p.privacy || {}, 
          parentalcontrol: p.parentalControl || p.parentalcontrol || {},
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
    const { profileId, category, id, action, settingType } = msg;
    
    // Normalize category: NextDNS API is case-sensitive for 'parentalControl'
    let finalCategory = category;
    if (category.toLowerCase().startsWith('parentalcontrol')) {
      finalCategory = category.replace(/parentalcontrol/i, 'parentalControl');
    }
    
    const url = `${API_BASE}/profiles/${profileId}/${finalCategory}`;
    
    try {
      let r;
      if (settingType === 'boolean') {
        const body = {};
        body[id] = (action === "add");
        r = await fetch(url, { method: 'PATCH', headers: h, body: JSON.stringify(body) });
      } else {
        const isAdd = (action === "add");
        if (isAdd) {
          const body = { id: id };
          if (finalCategory.includes('parentalControl')) {
            body.active = true; 
          }
          r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
        } else {
          r = await fetch(`${url}/${id}`, { method: 'DELETE', headers: h });
        }
      }
      return { success: r.ok };
    } catch(e) { return { success: false, error: e.message }; }
  },
  
  SAVE_SCRAPED_META: async (msg) => {
    try {
      const { metaType, data } = msg.payload;
      // Load current local meta
      const storage = await browser.storage.local.get("scrapedMeta");
      const scrapedMeta = storage.scrapedMeta || { blocklists: [], parental_services: [], tlds: [], categories: [] };
      scrapedMeta[metaType] = data;
      scrapedMeta.last_updated = new Date().toISOString();
      await browser.storage.local.set({ scrapedMeta });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
};

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message).then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});