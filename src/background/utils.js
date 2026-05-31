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
 * Handles the logic for showing a browser notification when a request is blocked.
 * Implements a 10-second debouncing per domain to prevent notification spam.
 * @async
 * @param {string} domain - The blocked domain.
 */
export async function handleBlockNotification(domain) {
    const blockNotif = await storage.get("blockNotif");
    if (!blockNotif) return;

    const now = Date.now();
    const lastTime = state.lastNotificationTimes[domain] || 0;
    
    if (now - lastTime > 10000) {
        state.lastNotificationTimes[domain] = now;
        browser.notifications.create({
            type: "basic",
            iconUrl: "/icons/icon-48.png",
            title: "NextDNS Blocked",
            message: `${domain} was blocked.`
        });
    }
}
