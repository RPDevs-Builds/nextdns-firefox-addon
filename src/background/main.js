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

    // 6. Apply Icon Click Action
    applyIconAction();
}

/**
 * Applies the user-configured icon click action (popup or sidebar).
 * Dynamically sets the popup path or clears it to enable the onClicked listener.
 * @async
 */
async function applyIconAction() {
    const { iconClickAction = 'popup' } = await browser.storage.sync.get("iconClickAction");
    if (iconClickAction === 'sidebar') {
        browser.action.setPopup({ popup: "" });
    } else {
        browser.action.setPopup({ popup: "src/popup.html" });
    }
}

/**
 * Global icon click handler. Fires only when no popup is defined.
 * Typically used to open the native Firefox sidebar.
 */
browser.action.onClicked.addListener(async () => {
    const { iconClickAction = 'popup' } = await browser.storage.sync.get("iconClickAction");
    if (iconClickAction === 'sidebar') {
        browser.sidebarAction.open();
    }
});

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
