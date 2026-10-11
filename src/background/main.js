/**
 * DNS Forge - Background Engine (ES Module)
 * 
 * Copyright (C) 2025 DNS Forge Contributors
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 * 
 * @module background/main
 * @see {@link https://dns-forge.github.io/reference/background/main/|Wiki Reference}
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

    // Hydrate in-memory state from persistent storage cache immediately for fast cold start
    const cachedAllow = await storage.get("cachedAllowlist", []);
    const cachedDeny = await storage.get("cachedDenylist", []);
    state.currentProfileData.allowlist = new Set(cachedAllow);
    state.currentProfileData.denylist = new Set(cachedDeny);
    state.notifications = await storage.get("notifications", []);
    
    // 2. Setup Context Menus
    await setupContextMenus();
    
    // 3. Register Listeners
    try {
        if (browser.webRequest?.onBeforeRequest?.addListener) {
            browser.webRequest.onBeforeRequest.addListener(
                requestListener,
                { urls: ["<all_urls>"] },
                ["blocking"]
            );
        }
    } catch (e) {
        console.warn("[Background] webRequestBlocking not supported on this platform (e.g. Android):", e);
    }

    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (messageHandlers[msg.type]) {
            messageHandlers[msg.type](msg, sender)
                .then(sendResponse)
                .catch(err => {
                    console.error(`[Background] Handler error on ${msg.type}:`, err);
                    sendResponse({ success: false, error: err.message || "Handler error" });
                });
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

    // 6. Apply Icon Click Action
    applyIconAction();
}

/**
 * Applies the user-configured icon click action (popup, popout, or sidebar).
 * Always ensures the popup path is set so clicking the toolbar icon or the Unified
 * Extensions panel reliably opens the extension interface (avoiding Mozilla Bug 1805908 / Bug 1814231
 * where setting popup to "" causes only context menu items to appear).
 * @async
 */
async function applyIconAction() {
    try {
        const iconClickAction = await storage.get("iconClickAction", "popup");
        console.log("[Background] Applying icon click action:", iconClickAction);
        // Note: In Firefox, setting popup to "" causes clicking on the extension
        // in the Unified Extensions panel or toolbar to display the context menu
        // with only menu items (Mozilla Bug 1805908).
        // Therefore, we ALWAYS ensure the popup is set to "src/popup.html".
        await browser.action.setPopup({ popup: "src/popup.html" });
        console.log("[Background] Popup enabled (src/popup.html).");
    } catch (e) {
        console.error("[Background] Failed to apply icon action:", e);
    }
}

/**
 * Global icon click handler. Fires only when no popup is defined.
 * Handles opening the native Firefox sidebar or a dedicated popout window.
 */
browser.action.onClicked.addListener(async () => {
    try {
        const iconClickAction = await storage.get("iconClickAction", "popup");
        console.log("[Background] Icon clicked. Action:", iconClickAction);
        if (iconClickAction === 'sidebar') {
            if (browser.sidebarAction?.open) {
                browser.sidebarAction.open();
            } else if (browser.tabs?.create) {
                browser.tabs.create({ url: browser.runtime.getURL('src/popup.html?mode=tab') });
            }
        } else if (iconClickAction === 'popout') {
            const url = browser.runtime.getURL('src/popup.html?mode=popout');
            if (browser.windows?.create) {
                browser.windows.create({
                    url,
                    type: 'popup',
                    width: 380,
                    height: 600
                });
            } else if (browser.tabs?.create) {
                browser.tabs.create({ url });
            }
        }
    } catch (e) {
        console.error("[Background] onClicked handler failed:", e);
    }
});

/**
 * Creates the extension's context menu entries for allowing/denying domains.
 * Safely guards against platforms without context menu support (e.g. Firefox for Android).
 * @async
 */
async function setupContextMenus() {
    if (!browser.menus || !browser.menus.create) {
        console.log("[Background] Context menus not supported on this platform (e.g. Android). Skipping.");
        return;
    }
    try {
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
    } catch (e) {
        console.warn("[Background] Failed to setup context menus:", e);
    }
}

/**
 * Listener for context menu clicks.
 * Identifies the domain from the clicked context and updates the profile's allow/deny list.
 */
if (browser.menus?.onClicked?.addListener) {
    browser.menus.onClicked.addListener(async (info, tab) => {
        try {
            const urlStr = info.linkUrl || info.pageUrl || tab?.url;
            if (!urlStr) return;
            let parsedUrl;
            try {
                parsedUrl = new URL(urlStr);
            } catch (_) {
                return;
            }
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) return;
            const domain = parsedUrl.hostname;
            if (!domain || !domain.trim()) return;

            const activeProfileId = (await storage.get("overrideProfileId")) || (await storage.get("activeProfile")) || (await storage.get("detectedProfileId"));
            if (!activeProfileId || activeProfileId === 'auto' || activeProfileId.startsWith('fp')) {
                console.warn("[ContextMenus] Cannot apply menu action: No valid NextDNS profile active.");
                return;
            }

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
}

// Start Init
initializeBackground();
