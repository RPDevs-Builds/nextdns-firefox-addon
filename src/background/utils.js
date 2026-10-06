/**
 * DNS Forge - Background Utilities
 * @module background/utils
 */

import { state } from './state.js';
import { storage } from '../storage.js';
import { apiClient } from '../apiClient.js';

/**
 * Checks if a domain or its parent domains are present in a given list (allowlist/denylist).
 * Implements recursive parent domain matching.
 * @param {string} domain - The domain to check.
 * @param {Set<string>} listSet - The set of domains to match against.
 * @returns {string|null} The matched domain from the set, or null if no match.
 */
export function getMatch(domain, listSet) {
    if (listSet.has(domain)) return domain;
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
        const root = parts.slice(i).join('.');
        if (listSet.has(root)) return root;
    }
    return null;
}

/**
 * Handles the logic for showing notifications when a request is blocked.
 * Implements a 10-second debouncing per domain to prevent notification spam.
 * Respects alert settings for master enabled, denylist triggers, desktop, and action center.
 * @async
 * @param {string} domain - The blocked domain.
 */
export async function handleBlockNotification(domain) {
    const alertSettings = await storage.get("alertSettings", null);
    const legacyBlockNotif = await storage.get("blockNotif");

    const isAlertsEnabled = alertSettings ? alertSettings.enabled !== false : true;
    const isDenylistTrigger = alertSettings ? alertSettings.triggerDenylist !== false : true;
    const isDesktopEnabled = alertSettings ? !!alertSettings.desktop : !!legacyBlockNotif;
    const isActionCenterEnabled = alertSettings ? alertSettings.actionCenter !== false : false;

    if (!isAlertsEnabled || !isDenylistTrigger) return;
    if (!isDesktopEnabled && !isActionCenterEnabled) return;

    const now = Date.now();
    const lastTime = state.lastNotificationTimes[domain] || 0;
    
    if (now - lastTime > 10000) {
        state.lastNotificationTimes[domain] = now;

        if (isActionCenterEnabled) {
            const notification = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                type: "denylist",
                severity: "medium",
                message: `${domain} was blocked by Denylist.`,
                read: false
            };
            state.notifications = state.notifications || [];
            state.notifications.unshift(notification);
            if (state.notifications.length > 50) state.notifications.pop();
            await storage.set("notifications", state.notifications).catch(() => {});
        }

        if (isDesktopEnabled) {
            try {
                if (typeof browser !== 'undefined' && browser.notifications?.create) {
                    browser.notifications.create({
                        type: "basic",
                        iconUrl: "/icons/icon-48.png",
                        title: "NextDNS Blocked",
                        message: `${domain} was blocked.`
                    });
                }
            } catch (e) {
                console.warn("[Background] Notification failed:", e);
            }
        }
    }
}
