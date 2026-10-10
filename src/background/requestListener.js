/**
 * DNS Forge - WebRequest Listener
 * @module background/requestListener
 */

import { state } from './state.js';
import { getMatch, handleBlockNotification } from './utils.js';

/**
 * Main listener for the browser.webRequest.onBeforeRequest event.
 * Tracks outgoing requests by tab, matches them against the current allowlist/denylist, 
 * and cancels requests that match the denylist.
 * Also triggers block notifications.
 * @param {Object} details - Details of the web request.
 * @returns {Object} A blocking response object ({cancel: boolean}).
 */
export function requestListener(details) {
    if (details.tabId >= 0) {
        try {
            const url = new URL(details.url);
            const domain = url.hostname;
            if (!domain) return { cancel: false };
            
            if (!state.tabRequests[details.tabId] || details.type === "main_frame") {
                state.tabRequests[details.tabId] = {};
                state.blockedTabRequests[details.tabId] = 0;
            }
            
            let status = 'default';
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

            const tabDomains = state.tabRequests[details.tabId];
            const domainKeys = Object.keys(tabDomains);
            if (!tabDomains[domain] && domainKeys.length >= 300) {
                let oldestKey = domainKeys[0];
                let oldestTs = tabDomains[oldestKey]?.timestamp || 0;
                for (let k = 1; k < domainKeys.length; k++) {
                    const key = domainKeys[k];
                    const ts = tabDomains[key]?.timestamp || 0;
                    if (ts < oldestTs) {
                        oldestTs = ts;
                        oldestKey = key;
                    }
                }
                delete tabDomains[oldestKey];
            }
            tabDomains[domain] = { status, reason, timestamp: Date.now() };

            if (status === 'blocked') {
                state.blockedTabRequests[details.tabId]++;
                handleBlockNotification(domain);
            }

            // Record into localLogs buffer and broadcast LIVE_LOG for active log views
            if (!Array.isArray(state.localLogs)) state.localLogs = [];
            const recentDuplicate = state.localLogs.find(l => (l.domain === domain || l.name === domain) && (Date.now() - l.timestamp < 3000));
            if (!recentDuplicate) {
                const logEntry = {
                    domain,
                    name: domain,
                    status,
                    reason: status === 'default' ? '' : reason,
                    reasons: allowMatch ? [{ id: 'allowlist', name: 'Allow List' }] : (denyMatch ? [{ id: 'denylist', name: 'Deny List' }] : []),
                    timestamp: Date.now(),
                    protocol: url.protocol ? url.protocol.replace(':', '').toUpperCase() : 'HTTP',
                    device: { name: 'This Browser' }
                };
                state.localLogs.unshift(logEntry);
                if (state.localLogs.length > 200) state.localLogs.pop();
                if (typeof browser?.runtime?.sendMessage === 'function') {
                    try {
                        browser.runtime.sendMessage({ type: "LIVE_LOG", log: logEntry }).catch(() => {});
                    } catch (_) {}
                }
            }

            if (status === 'blocked') {
                return { cancel: true };
            }
        } catch (e) {
            console.error("[WebRequest] Error processing request:", e);
        }
    }
    return { cancel: false };
}
