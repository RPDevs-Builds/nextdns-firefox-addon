/**
 * DNS Forge - Background Engine (ES Module)
 * This is the main entry point for the background service worker.
 * It initializes storage, registers network request listeners, manages context menus, 
 * and handles background alarms and messaging.
 * 
 * @module background/main
 */

import { state, ALARM_PREFIX } from './state.js';
import { storage } from '../storage.js';
import { apiClient } from '../apiClient.js';
import { updateProfileCache, detectActiveProfile, manageDomain, checkAndUpdateLinkedIP } from './api.js';
import { requestListener } from './requestListener.js';
import { messageHandlers } from './handlers.js';
import { checkAutomationRules } from './scheduler.js';

/**
 * Bootstraps the background engine.
 * Initializes storage, sets up context menus, registers request and message listeners, 
 * and starts periodic tasks (alarms).
 * @async
 */
export async function initializeBackground() {
    if (state.isInitialized) return;
    
    console.log("[Init] Starting DNS Forge Background Engine...");
    
    // 1. Initialize core utilities
    await storage.init();
    apiClient.setStorage(storage);
    
    // 2. Setup Context Menus
    await setupContextMenus();
    
    // 3. Register Listeners
    browser.webRequest.onBeforeRequest.addListener(
        requestListener,
        { urls: ["<all_urls>"] },
        ["blocking"]
    );

    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (messageHandlers[msg.type]) {
            messageHandlers[msg.type](msg, sender).then(sendResponse);
            return true; // Keep channel open for async response
        }
    });

    browser.tabs.onRemoved.addListener((tabId) => {
        delete state.tabRequests[tabId];
        delete state.blockedTabRequests[tabId];
    });

    browser.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name.startsWith(ALARM_PREFIX)) {
            const params = new URLSearchParams(alarm.name.split('?')[1]);
            const profileId = params.get('p');
            const domain = params.get('d');
            if (profileId && domain) {
                console.log(`[Scheduler] Temporary allow expired for ${domain}. Removing...`);
                await manageDomain(profileId, "allowlist", domain, "delete");
                await updateProfileCache();
            }
        }
        if (alarm.name === "rule-engine") {
            checkAutomationRules();
        }
        if (alarm.name === "ddns-check") {
            checkAndUpdateLinkedIP();
        }
    });

    // 4. Initial Sync
    await detectActiveProfile();
    await updateProfileCache();
    
    // 5. Setup periodic tasks
    browser.alarms.create("rule-engine", { periodInMinutes: 1 });
    browser.alarms.create("ddns-check", { periodInMinutes: 60 });
    checkAndUpdateLinkedIP();
    
    state.isInitialized = true;
    console.log("[Init] Background Engine Ready.");
}

/**
 * Creates the extension's context menu entries for allowing/denying domains.
 * @async
 */
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

/**
 * Listener for context menu clicks.
 * Identifies the domain from the clicked context and updates the profile's allow/deny list.
 */
browser.menus.onClicked.addListener(async (info, tab) => {
    try {
        const urlStr = info.linkUrl || info.pageUrl || tab?.url;
        if (!urlStr) return;
        const domain = new URL(urlStr).hostname;
        const activeProfileId = await storage.get("activeProfile");

        if (info.menuItemId === "dns-forge-allow") {
            await manageDomain(activeProfileId, "allowlist", domain, "add");
        } else if (info.menuItemId === "dns-forge-deny") {
            await manageDomain(activeProfileId, "denylist", domain, "add");
        }
        await updateProfileCache();
    } catch (e) {
        console.error("[ContextMenus] Error handling click:", e);
    }
});

// Start Init
initializeBackground();
