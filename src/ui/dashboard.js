/**
 * DNS Forge - Dashboard UI Module
 * Handles log rendering, analytics, and tab-specific request tracking for the dashboard view.
 * 
 * @module ui/dashboard
 */

import { state } from './state.js';
import { escapeHTML, setSafeHTML, downloadAsFile, showToast, renderEmptyStateHTML } from './utils.js';
import { syncLists } from './blocks.js';

/**
 * Formats a single log entry into a styled DOM row element.
 * Unifies live log stream and historical log rendering.
 * @param {Object} log - DNS log item.
 * @returns {HTMLDivElement} Configured log row element.
 */
export function formatLogRow(log) {
    const row = document.createElement('div');
    row.className = 'log-row';
    const isBlocked = log.status === 'blocked';
    const isAllowlist = log.status === 'allowed' || log.status === 'whitelisted' ||
        (Array.isArray(log.reasons) && log.reasons.some(r => r.id === 'allowlist' || (r.name && r.name.toLowerCase().includes('allow'))));

    let statusBadge = '';
    let rowColor = 'var(--text-main)';

    if (isBlocked) {
        rowColor = 'var(--danger)';
        statusBadge = '<span style="font-weight:700; color:var(--danger);">BLOCKED</span>';
    } else if (isAllowlist) {
        rowColor = 'var(--success)';
        statusBadge = '<span style="font-weight:700; color:var(--success);">ALLOWLIST</span>';
    } else if (log.status === 'relayed') {
        rowColor = 'var(--accent)';
        statusBadge = '<span style="font-weight:700; color:var(--accent);">RELAYED</span>';
    } else {
        rowColor = 'var(--text-main)';
        statusBadge = '<span style="font-size:0.85em; opacity:0.6; font-weight:600;">STANDARD</span>';
    }
    row.style.color = rowColor;
    
    const deviceId = log.device?.id || log.clientIp;
    const alias = state.hostnameAliases?.[deviceId] || state.hostnameAliases?.[log.device?.ip] || state.hostnameAliases?.[log.clientIp];
    const baseName = alias || log.device?.name || log.device?.id || log.clientIp || 'Unknown Device';
    const model = (log.device?.model && !baseName.includes(log.device.model)) ? ` (${log.device.model})` : '';
    const name = `${baseName}${model}`;
    let timeStr = "---";
    if (log.timestamp) {
        const d = new Date(log.timestamp);
        timeStr = isNaN(d.getTime()) ? "---" : d.toLocaleTimeString();
    }

    const reasonText = Array.isArray(log.reasons) 
        ? log.reasons.map(r => r.name || r.id || r).filter(Boolean).join(', ') 
        : (typeof log.reason === 'string' && log.reason !== 'Default' ? log.reason : '');
    const badge = reasonText && !isAllowlist ? ` (${escapeHTML(reasonText)})` : '';

    const html = `
        <div class="flex-between" style="font-size:0.75em; color:var(--text-muted);">
            <span>🕒 ${timeStr} | 📱 ${escapeHTML(name)}</span>
            <div>${statusBadge}${badge}</div>
        </div>
        <div style="font-weight:700; margin-top:2px; word-break:break-all;">${escapeHTML(log.name || log.domain)}</div>
    `;
    setSafeHTML(row, html);
    return row;
}

/**
 * Handles incoming live log events from the background SSE stream.
 * Updates the internal log cache and prepends the log to the UI if the dashboard is active.
 * @param {Object} log - The DNS log object received from the stream.
 */
export function handleLiveLog(log) {
    if (!log) return;
    
    // 1. Update cached logs for filtering/viewing
    state.cachedLogs.unshift(log);
    if (state.cachedLogs.length > 200) state.cachedLogs.pop();

    // 2. If Logs tab is active, update the view
    if (state.activeTab === 'logs') {
        const container = document.getElementById("logs-container");
        if (container) {
            // Remove placeholder if it exists
            if (container.children.length === 1 && container.children[0].textContent.includes('No logs')) {
                container.textContent = '';
            }

            const query = (document.getElementById("log-search")?.value || "").toLowerCase();
            const deviceFilter = document.getElementById("log-device-filter")?.value;
            const protocolFilter = document.getElementById("log-type-filter")?.value;
            const deviceId = log.device?.id || log.clientIp;
            const protocol = (log.protocol || '').toLowerCase();
            const activeFilters = Array.from(document.querySelectorAll('#status-filter-content input:checked')).map(cb => cb.value);

            if ((!query || (log.name || log.domain || '').toLowerCase().includes(query)) && 
                (!deviceFilter || deviceId === deviceFilter) && 
                (!protocolFilter || protocol === protocolFilter) &&
                matchesLogFilters(log, activeFilters)) {
                const row = formatLogRow(log);
                container.prepend(row);
                if (container.children.length > 100) container.lastElementChild.remove();
            }
        }
    }
}

/**
 * Checks whether a given DNS log item matches the active status and reason filters.
 * Ensures that uncategorized default plain traffic ('default', neutral traffic like google.com),
 * explicitly allowed items ('allowed' / 'whitelisted'), and blocked items are accurately handled.
 *
 * @param {Object} log - The DNS log object.
 * @param {string[]} [activeFilters=[]] - Array of active filter values.
 * @returns {boolean} True if the log matches the active filter criteria.
 */
export function matchesLogFilters(log, activeFilters = []) {
    if (!log) return false;
    
    // If "all" is checked, or no filter is selected:
    if (activeFilters.includes('all') || activeFilters.length === 0) {
        return true;
    }

    const isBlocked = log.status === 'blocked';
    const isAllowlist = log.status === 'allowed' || log.status === 'whitelisted' ||
        (Array.isArray(log.reasons) && log.reasons.some(r => r.id === 'allowlist' || (r.name && r.name.toLowerCase().includes('allow')))) ||
        (typeof log.reason === 'string' && log.reason.toLowerCase().includes('allow'));
    const isStandard = !isBlocked && !isAllowlist; // Plain traffic that isn't on a list and isn't marked allowed or denied

    const isDenylist = isBlocked && (
        (Array.isArray(log.reasons) && log.reasons.some(r => r.id === 'denylist' || (r.name && r.name.toLowerCase().includes('deny')))) ||
        (typeof log.reason === 'string' && log.reason.toLowerCase().includes('deny'))
    );

    const hasStandard = activeFilters.includes('status:default');
    const hasAllowed = activeFilters.includes('status:allowed');
    const hasBlocked = activeFilters.includes('status:blocked');
    const hasAllowlist = activeFilters.includes('reason:allowlist');
    const hasDenylist = activeFilters.includes('reason:denylist');

    // If all three categories (Standard + Allowed + Blocked) are active and no sub-reason filter, show all
    if (hasStandard && hasAllowed && hasBlocked && !hasAllowlist && !hasDenylist) {
        return true;
    }

    let match = false;
    if (hasStandard && isStandard) match = true;
    if (hasAllowed && (isAllowlist || (!hasStandard && isStandard))) match = true;
    if (hasBlocked && isBlocked) match = true;
    if (hasAllowlist && isAllowlist) match = true;
    if (hasDenylist && isDenylist) match = true;

    return match;
}

/**
 * Renders the full list of logs to the dashboard container.
 * Applies active filters for search queries, device selection, and status (allowed/blocked).
 * @param {Array|null} [logsOverride=null] - Optional override for the log array to render.
 */
export function renderLogs(logsOverride = null) {
    const container = document.getElementById("logs-container");
    if (!container) return;
    
    let logs = logsOverride !== null ? logsOverride : state.cachedLogs;
    if (!Array.isArray(logs)) logs = [];

    if (logs.length === 0) {
        setSafeHTML(container, renderEmptyStateHTML("No logs found.", "📡"));
        return;
    }

    const query = (document.getElementById("log-search")?.value || "").toLowerCase();
    const deviceFilter = document.getElementById("log-device-filter")?.value;
    const protocolFilter = document.getElementById("log-type-filter")?.value;
    const activeFilters = Array.from(document.querySelectorAll('#status-filter-content input:checked')).map(cb => cb.value);

    const filtered = logs.filter(log => {
        if (!log) return false;
        const domain = (log.name || log.domain || '').toLowerCase();
        const id = log.device?.id || log.clientIp;
        const protocol = (log.protocol || '').toLowerCase();
        
        if (query && !domain.includes(query)) return false;
        if (deviceFilter && id !== deviceFilter) return false;
        if (protocolFilter && protocol !== protocolFilter) return false;
        if (!matchesLogFilters(log, activeFilters)) return false;
        return true;
    });

    if (filtered.length === 0) {
        setSafeHTML(container, renderEmptyStateHTML("No logs match the current filter.", "🔍"));
        updateDeviceFilterOptions();
        return;
    }

    const fragment = document.createDocumentFragment();
    filtered.slice(0, 100).forEach(log => {
        fragment.appendChild(formatLogRow(log));
    });
    
    container.textContent = "";
    container.appendChild(fragment);
    updateDeviceFilterOptions();
}

/**
 * Updates the device filter dropdown with the unique set of devices found in the log cache.
 * Maps device IDs to friendly aliases if available.
 * @private
 */
function updateDeviceFilterOptions() {
    const dropdown = document.getElementById("log-device-filter");
    if (!dropdown || dropdown.options.length > 1) return;

    const devices = new Set();
    if (Array.isArray(state.cachedLogs)) {
        state.cachedLogs.forEach(l => {
            const id = l.device?.id || l.clientIp;
            if (id) devices.add(id);
        });
    }

    devices.forEach(id => {
        const log = state.cachedLogs.find(l => (l.device?.id || l.clientIp) === id);
        const name = state.hostnameAliases?.[id] || log?.device?.name || id;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = name;
        dropdown.appendChild(opt);
    });
}

/**
 * Fetches and displays analytics summary and trend data for the active profile.
 * Calculates percentage change in activity based on time-series data.
 * @async
 */
export async function loadAnalytics() {
    if (!state.activeProfile) {
        console.warn("[Dashboard] Cannot load analytics: No active profile.");
        return;
    }

    const container = document.getElementById("analytics-overview");
    if (container) {
        setSafeHTML(container, "<div style='text-align:center; padding:10px; opacity:0.6;'>Fetching stats...</div>");
    }

    try {
        console.log("[Dashboard] Fetching analytics for profile:", state.activeProfile);
        const [summary, series] = await Promise.all([
            browser.runtime.sendMessage({ type: "GET_ANALYTICS", profileId: state.activeProfile }),
            browser.runtime.sendMessage({ type: "GET_ANALYTICS", profileId: state.activeProfile, series: true })
        ]);

        if (summary?.data && container) {
            const queries = Number(summary.data.queries) || 0;
            const blockedQueries = Number(summary.data.blockedQueries) || 0;
            let rawBlockedPercent = summary.data.blockedPercent;
            if (typeof rawBlockedPercent !== 'number' || isNaN(rawBlockedPercent)) {
                rawBlockedPercent = queries > 0 ? (blockedQueries / queries) * 100 : 0;
            }
            const blockedPercent = Math.max(0, Math.min(100, Math.round(rawBlockedPercent * 10) / 10));

            const sData = series?.data || [];
            let trendHtml = "";
            if (sData.length > 5) {
                const recent = sData.slice(-5).reduce((acc, curr) => acc + (Number(curr.queries) || 0), 0);
                const previous = sData.slice(-10, -5).reduce((acc, curr) => acc + (Number(curr.queries) || 0), 0);
                const diff = recent - previous;
                const percent = previous > 0 ? Math.round((diff / previous) * 100) : 0;
                const color = diff > 0 ? 'var(--danger)' : 'var(--success)';
                trendHtml = `<div style="font-size:0.75em; color:${color}; margin-top:5px;">
                    ${diff > 0 ? '↗' : '↘'} ${Math.abs(percent)}% ${diff > 0 ? 'increase' : 'decrease'} in traffic
                </div>`;
            }

            const html = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                    <div style="text-align:center; background:rgba(255,255,255,0.03); padding:10px; border-radius:6px;">
                        <div style="font-size:0.7em; text-transform:uppercase; opacity:0.6;">Total Queries</div>
                        <div style="font-size:1.3em; font-weight:700; color:var(--accent);">${queries.toLocaleString()}</div>
                    </div>
                    <div style="text-align:center; background:rgba(255,255,255,0.03); padding:10px; border-radius:6px;">
                        <div style="font-size:0.7em; text-transform:uppercase; opacity:0.6;">Blocked</div>
                        <div style="font-size:1.3em; font-weight:700; color:var(--danger);">${blockedQueries.toLocaleString()}</div>
                    </div>
                </div>
                <div style="font-size:0.85em; margin-bottom:5px;">Block Rate: <strong>${blockedPercent}%</strong></div>
                <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                    <div style="width:${blockedPercent}%; height:100%; background:var(--danger);"></div>
                </div>
                ${trendHtml}
            `;
            setSafeHTML(container, html);
        } else if (container) {
            setSafeHTML(container, renderEmptyStateHTML("No analytics data available.", "📊"));
        }
    } catch (e) {
        console.error("[Dashboard] loadAnalytics failed:", e);
        const container = document.getElementById("analytics-overview");
        if (container) {
            setSafeHTML(container, `<div style='text-align:center; padding:10px; color:var(--danger);'>Error: ${escapeHTML(e.message)}</div>`);
        }
    }
}

/**
 * Fetches recent historical logs from the NextDNS API.
 * Updates the state cache and triggers a full UI re-render of the log list.
 * @async
 */
export async function loadNativeLogs() {
    if (!state.activeProfile) {
        console.warn("[Dashboard] Cannot load logs: No active profile.");
        return;
    }

    const container = document.getElementById("logs-container");
    if (container && state.cachedLogs.length === 0) {
        setSafeHTML(container, "<div style='text-align:center; padding:20px; opacity:0.6;'>Loading logs from NextDNS...</div>");
    }

    try {
        console.log("[Dashboard] Fetching native logs for profile:", state.activeProfile);
        const res = await browser.runtime.sendMessage({ type: "GET_LOGS", profileId: state.activeProfile });
        if (res?.success) { 
            state.cachedLogs = Array.isArray(res.data) ? res.data : []; 
            console.log(`[Dashboard] Received ${state.cachedLogs.length} logs.`);
            renderLogs(); 
        } else {
            console.error("[Dashboard] Failed to fetch logs:", res?.error || "Unknown error");
            if (container && state.cachedLogs.length === 0) {
                setSafeHTML(container, `<div style='text-align:center; padding:20px; color:var(--danger);'>Failed to load logs: ${escapeHTML(res?.error || "Check API Key")}</div>`);
            }
        }
    } catch (e) {
        console.error("[Dashboard] sendMessage failed in loadNativeLogs:", e);
    }
}

let isTabActionPending = false;

/**
 * Attaches delegated click listeners to the Tab Requests container
 * for allowing, unallowing, denying, and undenying domains.
 */
export function initTabLogEvents() {
    const container = document.getElementById("tab-log");
    if (!container || container._hasTabLogListeners) return;
    container._hasTabLogListeners = true;

    container.addEventListener('click', async (e) => {
        // 1. Action button click (+ Allow, ✕ Allow, + Deny, ✕ Deny)
        const btn = e.target.closest('.tab-action-btn');
        if (btn) {
            e.stopPropagation();
            const domain = btn.getAttribute('data-domain');
            const listType = btn.getAttribute('data-list');
            const action = btn.getAttribute('data-action');
            if (!domain || !listType || !action) return;

            btn.disabled = true;
            btn.textContent = '...';
            isTabActionPending = true;

            try {
                const res = await browser.runtime.sendMessage({
                    type: "MANAGE_DOMAIN",
                    profileId: state.activeProfile,
                    listType,
                    domain,
                    action
                });

                if (res.success) {
                    if (action === 'add') {
                        if (listType === 'allowlist') {
                            if (state.currentAllowlist instanceof Set) state.currentAllowlist.add(domain);
                            if (state.currentDenylist instanceof Set) state.currentDenylist.delete(domain);
                        } else {
                            if (state.currentDenylist instanceof Set) state.currentDenylist.add(domain);
                            if (state.currentAllowlist instanceof Set) state.currentAllowlist.delete(domain);
                        }
                    } else if (action === 'delete') {
                        if (listType === 'allowlist') {
                            if (state.currentAllowlist instanceof Set) state.currentAllowlist.delete(domain);
                        } else {
                            if (state.currentDenylist instanceof Set) state.currentDenylist.delete(domain);
                        }
                    }
                    syncLists(true).catch(() => {});
                } else {
                    btn.disabled = false;
                    btn.textContent = 'Err';
                    console.error(`[Dashboard] Failed to ${action} ${domain} in ${listType}:`, res?.error);
                }
            } catch (err) {
                btn.disabled = false;
                btn.textContent = 'Err';
                console.error("[Dashboard] Action failed:", err);
            } finally {
                isTabActionPending = false;
                await updateDashboardTabInfo();
            }
            return;
        }

        // 2. Click domain name to populate domain input
        const domainEl = e.target.closest('.tab-domain-name');
        if (domainEl) {
            const domain = domainEl.getAttribute('data-domain');
            const domainInput = document.getElementById("domain-input");
            if (domainInput && domain) {
                domainInput.value = domain;
                domainInput.focus();
            }
        }
    });
}

/**
 * Updates the "Tab Requests" panel with network request data specific to the active browser tab.
 * Renders interactive allow/deny controls per requested domain and updates total blocked count.
 * @async
 */
export async function updateDashboardTabInfo() {
    if (isTabActionPending) return;
    try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) return;

        // Populate the domain input field
        const domainInput = document.getElementById("domain-input");
        if (domainInput && tab.url.startsWith('http')) {
            try {
                const url = new URL(tab.url);
                const currentDomain = url.hostname.replace(/^www\./, '');
                if (domainInput.value !== currentDomain && !domainInput.matches(':focus')) {
                    domainInput.value = currentDomain;
                }
            } catch (e) {
                console.warn("[Dashboard] Failed to parse tab URL:", e);
            }
        }

        const stats = await browser.runtime.sendMessage({ type: "GET_TAB_STATS", tabId: tab.id });
        if (!stats) return;

        const requests = stats.requests || {};
        const domains = Object.keys(requests);

        const header = document.getElementById("tab-log-header");
        if (header) header.textContent = `Tab Requests: (${domains.length})`;

        const container = document.getElementById("tab-log");
        if (container) {
            initTabLogEvents();
            if (domains.length === 0) {
                if (!container.textContent.includes('capturing')) {
                    setSafeHTML(container, renderEmptyStateHTML('Waiting for network activity...', '📡'));
                }
            } else {
                const html = domains.map(d => {
                    const r = requests[d] || {};
                    const isAllowed = state.currentAllowlist instanceof Set && state.currentAllowlist.has(d);
                    const isDenied = state.currentDenylist instanceof Set && state.currentDenylist.has(d);

                    let statusColor = 'inherit';
                    let badgeText = '';

                    if (isAllowed) {
                        statusColor = 'var(--success)';
                        badgeText = '[Allowed]';
                    } else if (isDenied) {
                        statusColor = 'var(--danger)';
                        badgeText = '[Denied]';
                    } else if (r.status === 'blocked') {
                        statusColor = 'var(--danger)';
                        badgeText = (r.reason && r.reason !== 'Default') ? `[${r.reason}]` : '[Blocked]';
                    } else if (r.reason && r.reason !== 'Default') {
                        badgeText = `[${r.reason}]`;
                    }

                    const allowBtn = isAllowed
                        ? `<button class="tab-action-btn tab-btn-remove-allow" data-domain="${escapeHTML(d)}" data-list="allowlist" data-action="delete" title="Remove from Allowlist" style="background: rgba(40, 167, 69, 0.15); color: var(--success); border: 1px solid var(--success); padding: 2px 6px; font-size: 0.72em; border-radius: 4px; cursor: pointer; font-weight: 600;">✕ Allow</button>`
                        : `<button class="tab-action-btn tab-btn-add-allow" data-domain="${escapeHTML(d)}" data-list="allowlist" data-action="add" title="Add to Allowlist" style="background: var(--success); color: white; border: none; padding: 2px 6px; font-size: 0.72em; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Allow</button>`;

                    const denyBtn = isDenied
                        ? `<button class="tab-action-btn tab-btn-remove-deny" data-domain="${escapeHTML(d)}" data-list="denylist" data-action="delete" title="Remove from Denylist" style="background: rgba(220, 53, 69, 0.15); color: var(--danger); border: 1px solid var(--danger); padding: 2px 6px; font-size: 0.72em; border-radius: 4px; cursor: pointer; font-weight: 600;">✕ Deny</button>`
                        : `<button class="tab-action-btn tab-btn-add-deny" data-domain="${escapeHTML(d)}" data-list="denylist" data-action="add" title="Add to Denylist" style="background: var(--danger); color: white; border: none; padding: 2px 6px; font-size: 0.72em; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Deny</button>`;

                    return `<div class="tab-request-row" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; border-bottom: 1px solid rgba(255,255,255,0.05); gap: 6px;">
                        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;" title="${escapeHTML(d)}">
                            <span class="tab-domain-name" data-domain="${escapeHTML(d)}" style="color: ${statusColor}; font-size: 0.88em; cursor: pointer;">${escapeHTML(d)}</span>
                            ${badgeText ? `<span style="font-size: 0.75em; opacity: 0.6; margin-left: 4px;">${escapeHTML(badgeText)}</span>` : ''}
                        </div>
                        <div style="display: flex; gap: 4px; flex-shrink: 0;">
                            ${allowBtn}
                            ${denyBtn}
                        </div>
                    </div>`;
                }).join('');
                setSafeHTML(container, html);
            }
        }

        // Total blocked items count for the current active tab
        const tabBlockedEl = document.getElementById("tab-blocked-count") || document.getElementById("privacy-score");
        if (tabBlockedEl) {
            tabBlockedEl.textContent = stats.blockedCount || 0;
        }
    } catch (e) {
        console.error("[Dashboard] updateDashboardTabInfo failed:", e);
    }
}

/**
 * Updates the href attributes of deep-links to the official NextDNS web GUI.
 * Ensures that links point to the correct active profile.
 */
export function updateDynamicLinks() {
    const profileLink = document.getElementById("web-gui-profile-link");
    const logsLink = document.getElementById("web-gui-logs-link");
    const securityLink = document.getElementById("web-gui-security-link");
    const privacyLink = document.getElementById("web-gui-privacy-link");

    if (profileLink) {
        profileLink.href = state.activeProfile ? `https://my.nextdns.io/${state.activeProfile}` : 'https://my.nextdns.io';
    }
    if (logsLink && state.activeProfile) logsLink.href = `https://my.nextdns.io/${state.activeProfile}/logs`;
    if (securityLink && state.activeProfile) securityLink.href = `https://my.nextdns.io/${state.activeProfile}/security`;
    if (privacyLink && state.activeProfile) privacyLink.href = `https://my.nextdns.io/${state.activeProfile}/privacy`;
}

/**
 * Exports the current log cache as a CSV file.
 */
export function downloadLogsCSV() {
    if (state.cachedLogs.length === 0) return showToast("No logs to export.", "warning");

    const headers = ["Timestamp", "Device", "Domain", "Status", "Reason"];
    const rows = state.cachedLogs.map(l => [
        !isNaN(new Date(l.timestamp).getTime()) ? new Date(l.timestamp).toISOString() : (l.timestamp || "Invalid Date"),
        state.hostnameAliases?.[l.device?.id || l.clientIp] || l.device?.name || l.clientIp || "Unknown",
        l.name || l.domain || "",
        l.status || "",
        Array.isArray(l.reasons) ? l.reasons.map(r => r.name || r.id || r).filter(Boolean).join('; ') : (l.reason || "")
    ]);

    const csvContent = [headers, ...rows].map(r => r.map(c => `"${(c||'').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadAsFile(`dns_forge_logs_${Date.now()}.csv`, csvContent, 'text/csv');
}

/**
 * Triggers a remote log wipe via the background script and clears the local cache.
 * @async
 */
export async function wipeLogs() {
    if (!state.activeProfile) return;
    if (!confirm("Are you sure you want to clear all logs from NextDNS? This cannot be undone.")) return;

    const btn = document.getElementById('wipe-logs-btn');
    if (btn) { btn.disabled = true; btn.textContent = "Clearing..."; }

    try {
        const res = await browser.runtime.sendMessage({ type: "CLEAR_LOGS", profileId: state.activeProfile });
        if (res?.success) {
            state.cachedLogs = [];
            renderLogs();
            showToast("Logs cleared successfully.", "success");
        } else {
            showToast(`Failed to clear logs: ${res?.error || "Unknown error"}`, "error");
        }
    } catch (err) {
        showToast(`Failed to clear logs: ${err?.message || "Unknown error"}`, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "🗑️ Clear Logs"; }
    }
}

