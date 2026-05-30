/**
 * DNS Forge - WebRequest Listener
 */

import { state } from './state.js';
import { getMatch, handleBlockNotification } from './utils.js';

export function requestListener(details) {
    if (details.tabId >= 0) {
        try {
            const url = new URL(details.url);
            const domain = url.hostname;
            
            if (!state.tabRequests[details.tabId] || details.type === "main_frame") {
                state.tabRequests[details.tabId] = {};
                state.blockedTabRequests[details.tabId] = 0;
            }
            
            let status = 'allowed';
            let reason = 'Default';
            
            const allowMatch = getMatch(domain, state.currentProfileData.allowlist);
            const denyMatch = getMatch(domain, state.currentProfileData.denylist);

            if (allowMatch) {
                status = 'allowed';
                reason = 'Allow List';
            } else if (denyMatch) {
                status = 'blocked';
                reason = 'Deny List';
            }

            state.tabRequests[details.tabId][domain] = { status, reason, timestamp: Date.now() };

            if (status === 'blocked') {
                state.blockedTabRequests[details.tabId]++;
                handleBlockNotification(domain);
                return { cancel: true };
            }
        } catch (e) {
            console.error("[WebRequest] Error processing request:", e);
        }
    }
    return { cancel: false };
}
