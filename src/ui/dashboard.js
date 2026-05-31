/**
 * DNS Forge - Dashboard UI Module
 * Handles log rendering, analytics, and tab-specific request tracking for the dashboard view.
 * 
 * @module ui/dashboard
 */

import { state } from './state.js';
import { escapeHTML, setSafeHTML } from './utils.js';

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

    // 2. If Dashboard is active, update the view
    if (state.activeTab === 'dashboard') {
        const container = document.getElementById("logs-container");
        if (container) {
            // Prepend new log row if it matches current search
            const row = document.createElement('div');
            row.className = 'log-row';
            const isBlocked = log.status === 'blocked';
            row.style.color = isBlocked ? 'var(--danger)' : 'var(--success)';
            
            const name = state.hostnameAliases[log.device?.id || log.clientIp] || log.device?.name || log.device?.id || log.clientIp || 'Unknown Device';
            const timeStr = new Date(log.timestamp).toLocaleTimeString();

            const html = `
                <div class="flex-between" style="font-size:0.75em; color:var(--text-muted);">
                    <span>🕒 ${timeStr} | 📱 ${escapeHTML(name)}</span>
                    <span style="font-weight:700;">${isBlocked ? 'BLOCKED' : 'ALLOWED'}</span>
                </div>
                <div style="font-weight:700; margin-top:2px; word-break:break-all;">${escapeHTML(log.name || log.domain)}</div>
            `;
            setSafeHTML(row, html);
            
            const query = (document.getElementById("log-search")?.value || "").toLowerCase();
            if (!query || (log.name || log.domain || '').toLowerCase().includes(query)) {
                container.prepend(row);
                if (container.children.length > 100) container.lastElementChild.remove();
            }
        }
    }
}

/**
 * Renders the full list of logs to the dashboard container.
 * Applies active filters for search queries, device selection, and status (allowed/blocked).
 * @param {Array|null} [logsOverride=null] - Optional override for the log array to render.
 */
export function renderLogs(logsOverride = null) {
    const container = document.getElementById("logs-container");
    if (!container) return;
    
    const logs = logsOverride !== null ? logsOverride : state.cachedLogs;
    if (!Array.isArray(logs) || logs.length === 0) {
        setSafeHTML(container, "<div style='text-align:center; padding:20px; color:var(--text-muted); font-size:0.9em;'>No logs found.</div>");
        return;
    }

    const query = (document.getElementById("log-search")?.value || "").toLowerCase();
    const deviceFilter = document.getElementById("log-device-filter")?.value;
    const activeFilters = Array.from(document.querySelectorAll('#status-filter-content input:checked')).map(cb => cb.value);

    const filtered = logs.filter(log => {
        if (!log) return false;
        const domain = (log.name || log.domain || '').toLowerCase();
        const id = log.device?.id || log.clientIp;
        const status = (log.status === 'allowed' || log.status === 'whitelisted') ? 'status:allowed' : 'status:blocked';
        
        if (query && !domain.includes(query)) return false;
        if (deviceFilter && id !== deviceFilter) return false;
        if (!activeFilters.includes(status)) return false;
        return true;
    });

    const fragment = document.createDocumentFragment();
    filtered.slice(0, 100).forEach(log => {
        const row = document.createElement('div');
        row.className = 'log-row';
        const isBlocked = log.status === 'blocked';
        row.style.color = isBlocked ? 'var(--danger)' : 'var(--success)';
        
        const name = state.hostnameAliases[log.device?.id || log.clientIp] || log.device?.name || log.device?.id || log.clientIp || 'Unknown Device';
        const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "---";

        const html = `
            <div class="flex-between" style="font-size:0.75em; color:var(--text-muted);">
                <span>🕒 ${timeStr} | 📱 ${escapeHTML(name)}</span>
                <span style="font-weight:700;">${isBlocked ? 'BLOCKED' : 'ALLOWED'}</span>
            </div>
            <div style="font-weight:700; margin-top:2px; word-break:break-all;">${escapeHTML(log.name || log.domain)}</div>
        `;
        setSafeHTML(row, html);
        fragment.appendChild(row);
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
    state.cachedLogs.forEach(l => {
        const id = l.device?.id || l.clientIp;
        if (id) devices.add(id);
    });

    devices.forEach(id => {
        const log = state.cachedLogs.find(l => (l.device?.id || l.clientIp) === id);
        const name = state.hostnameAliases[id] || log.device?.name || id;
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
    if (!state.activeProfile) return;
    const [summary, series] = await Promise.all([
        browser.runtime.sendMessage({ type: "GET_ANALYTICS", profileId: state.activeProfile }),
        browser.runtime.sendMessage({ type: "GET_ANALYTICS", profileId: state.activeProfile, series: true })
    ]);

    const container = document.getElementById("analytics-overview");
    if (summary?.data && container) {
        const sData = series?.data || [];
        let trendHtml = "";
        if (sData.length > 5) {
            const recent = sData.slice(-5).reduce((acc, curr) => acc + curr.queries, 0);
            const previous = sData.slice(-10, -5).reduce((acc, curr) => acc + curr.queries, 0);
            const diff = recent - previous;
            const percent = previous > 0 ? Math.round((diff / previous) * 100) : 0;
            const color = diff > 0 ? 'var(--danger)' : 'var(--success)';
            trendHtml = `<div style="font-size:0.75em; color:${color}; margin-top:5px;">
                ${diff > 0 ? '📈' : '📉'} ${Math.abs(percent)}% ${diff > 0 ? 'increase' : 'decrease'} in activity
            </div>`;
        }

        const html = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div class="panel-box" style="margin-bottom:0;">
                    <div style="font-size:0.7em; color:var(--text-muted);">QUERIES</div>
                    <div style="font-size:1.2em; font-weight:700;">${summary.data.queries.toLocaleString()}</div>
                </div>
                <div class="panel-box" style="margin-bottom:0;">
                    <div style="font-size:0.7em; color:var(--text-muted);">BLOCKED</div>
                    <div style="font-size:1.2em; font-weight:700; color:var(--danger);">${summary.data.blockedQueries.toLocaleString()}</div>
                </div>
            </div>
            ${trendHtml}`;
        setSafeHTML(container, html);
    } else if (container) container.textContent = "No analytics data.";
}

/**
 * Fetches recent historical logs from the NextDNS API.
 * Updates the state cache and triggers a full UI re-render of the log list.
 * @async
 */
export async function loadNativeLogs() {
    if (!state.activeProfile) return;
    const res = await browser.runtime.sendMessage({ type: "GET_LOGS", profileId: state.activeProfile }).catch(() => null);
    if (res?.success) { 
        state.cachedLogs = res.data || []; 
        renderLogs(); 
    }
}

/**
 * Updates the "Tab Requests" panel with network request data specific to the active browser tab.
 * Calculates a privacy grade based on the ratio of blocked to total requests.
 * @async
 */
export async function updateDashboardTabInfo() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    const stats = await browser.runtime.sendMessage({ type: "GET_TAB_STATS", tabId: tab.id });
    const requests = stats?.requests || {};
    const domains = Object.keys(requests);

    const header = document.getElementById("tab-log-header");
    if (header) header.textContent = `Tab Requests: (${domains.length})`;

    const container = document.getElementById("tab-log");
    if (container) {
        if (domains.length === 0) {
            setSafeHTML(container, "<div style='opacity:0.5; padding:10px;'>No requests captured for this tab yet.</div>");
        } else {
            const html = domains.map(d => {
                const r = requests[d];
                const color = r.status === 'blocked' ? 'var(--danger)' : (r.reason === 'Allow List' ? 'var(--success)' : 'inherit');
                return `<div style="padding:4px; color:${color}; font-size:0.9em; border-bottom:1px solid rgba(255,255,255,0.05);">
                    ${escapeHTML(d)} 
                    <span style="font-size:0.8em; opacity:0.6; margin-left:5px;">${escapeHTML(r.reason === 'Default' ? '' : `[${r.reason}]`)}</span>
                </div>`;
            }).join('');
            setSafeHTML(container, html);
        }
    }

    const score = document.getElementById("privacy-score");
    if (score) {
        const blockedCount = stats?.blockedCount || 0;
        let grade = "-";
        if (domains.length > 0) {
            const ratio = blockedCount / domains.length;
            if (ratio > 0.4) grade = "A+"; else if (ratio > 0.25) grade = "A"; else if (ratio > 0.1) grade = "B"; else if (ratio > 0.05) grade = "C"; else grade = "D";
        }
        score.textContent = grade;
    }
}

/**
 * Updates the href attributes of deep-links to the official NextDNS web GUI.
 * Ensures that links point to the correct active profile.
 */
export function updateDynamicLinks() {
    const logsLink = document.getElementById("web-gui-logs-link");
    const securityLink = document.getElementById("web-gui-security-link");
    const privacyLink = document.getElementById("web-gui-privacy-link");

    if (logsLink && state.activeProfile) logsLink.href = `https://my.nextdns.io/${state.activeProfile}/logs`;
    if (securityLink && state.activeProfile) securityLink.href = `https://my.nextdns.io/${state.activeProfile}/security`;
    if (privacyLink && state.activeProfile) privacyLink.href = `https://my.nextdns.io/${state.activeProfile}/privacy`;
}
