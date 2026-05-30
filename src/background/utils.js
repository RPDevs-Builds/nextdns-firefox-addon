/**
 * DNS Forge - Background Utilities
 */

import { state } from './state.js';
import { storage } from '../storage.js';
import { apiClient } from '../apiClient.js';

export function getMatch(domain, listSet) {
    if (listSet.has(domain)) return domain;
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
        const root = parts.slice(i).join('.');
        if (listSet.has(root)) return root;
    }
    return null;
}

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
