/**
 * DNS Forge - Tools UI Module (Debugger)
 * @module ui/tools
 */

import { state } from './state.js';
import { escapeHTML, setSafeHTML, downloadAsFile, showToast, renderEmptyStateHTML } from './utils.js';

let lastDebuggerResult = null;

/**
 * Executes the "Forge Debugger" logic.
 * Correlates background web request tracking with live NextDNS API logs to identify which list is blocking a domain.
 * Renders findings with "Allow" buttons for quick whitelisting.
 * @async
 */
export async function runIntelligentDebugger() {
    const resultsContainer = document.getElementById('debugger-results');
    const exportBtn = document.getElementById('export-debugger-btn');
    
    setSafeHTML(resultsContainer, '<div style="text-align: center; padding: 20px;">Fetching logs and correlating...</div>');
    exportBtn?.classList.add('hidden');

    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
        setSafeHTML(resultsContainer, renderEmptyStateHTML('No active tab found.', '⚠️'));
        return;
    }
    const tabId = tabs[0].id;

    if (!state.activeProfile) {
        setSafeHTML(resultsContainer, renderEmptyStateHTML('No active profile detected.', '⚠️'));
        return;
    }

    const res = await browser.runtime.sendMessage({ 
        type: "DEBUG_TAB", 
        tabId, 
        profileId: state.activeProfile 
    });

    if (!res.success) {
        resultsContainer.textContent = "";
        const errDiv = document.createElement('div');
        errDiv.style.color = 'var(--danger)';
        errDiv.style.padding = '10px';
        errDiv.textContent = `Error: ${res.error}`;
        resultsContainer.appendChild(errDiv);
        return;
    }

    lastDebuggerResult = res.correlations;

    if (res.correlations.length === 0) {
        setSafeHTML(resultsContainer, renderEmptyStateHTML('No blocked domains correlated from this tab.', '🔍'));
        return;
    }

    exportBtn?.classList.remove('hidden');
    resultsContainer.textContent = '';
    res.correlations.forEach(c => {
        const row = document.createElement('div');
        row.className = 'panel-box';
        row.style.marginBottom = '10px';
        row.style.padding = '10px';
        
        const reasons = Array.isArray(c.reasons)
            ? c.reasons.map(r => `<span class="badge-deny" style="padding: 1px 4px; font-size: 0.7em; border-radius: 3px;">${escapeHTML(r.name || r)}</span>`).join(' ')
            : (c.reason ? `<span class="badge-deny" style="padding: 1px 4px; font-size: 0.7em; border-radius: 3px;">${escapeHTML(c.reason)}</span>` : '');
        
        const html = `
            <div class="flex-between">
                <strong style="font-family: monospace; font-size: 0.9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">${escapeHTML(c.domain)}</strong>
                <div style="display: flex; gap: 4px;">
                    <button class="btn-allow debug-allow-btn" data-domain="${escapeHTML(c.domain)}" style="width: auto; padding: 2px 8px; font-size: 0.7em;">Allow</button>
                    <button class="btn-secondary debug-snooze-btn" data-domain="${escapeHTML(c.domain)}" title="Temporarily allow for 15 minutes" style="width: auto; padding: 2px 8px; font-size: 0.7em;">Snooze 15m</button>
                </div>
            </div>
            <div style="margin-top: 5px; display: flex; flex-wrap: wrap; gap: 4px;">${reasons}</div>
            <div style="font-size: 0.7em; color: var(--text-muted); margin-top: 5px;">${!isNaN(new Date(c.timestamp).getTime()) ? new Date(c.timestamp).toLocaleTimeString() : 'Unknown'} • ${escapeHTML(c.device)}</div>
        `;
        setSafeHTML(row, html);
        
        row.querySelector('.debug-allow-btn').onclick = async (e) => {
            const btn = e.target;
            const domain = btn.getAttribute('data-domain');
            btn.disabled = true;
            btn.textContent = "...";
            try {
                const allowRes = await browser.runtime.sendMessage({
                    type: "MANAGE_DOMAIN",
                    profileId: state.activeProfile,
                    listType: "allowlist",
                    domain,
                    action: "add"
                });
                if (allowRes?.success) {
                    btn.textContent = "Added";
                    btn.classList.replace('btn-allow', 'btn-secondary');
                    showToast(`Added ${domain} to Allowlist`, 'success');
                } else {
                    btn.disabled = false;
                    btn.textContent = "Error";
                    showToast(`Failed to add domain: ${allowRes?.error || 'Unknown error'}`, 'error');
                }
            } catch (err) {
                btn.disabled = false;
                btn.textContent = "Error";
                showToast(`Failed to add domain: ${err?.message || 'Unknown error'}`, 'error');
            }
        };

        const snoozeBtn = row.querySelector('.debug-snooze-btn');
        if (snoozeBtn) {
            snoozeBtn.onclick = async (e) => {
                const btn = e.target;
                const domain = btn.getAttribute('data-domain');
                btn.disabled = true;
                btn.textContent = "...";
                try {
                    const res = await browser.runtime.sendMessage({
                        type: "TEMP_ALLOW",
                        profileId: state.activeProfile,
                        domain,
                        durationInMinutes: 15
                    });
                    if (res?.success) {
                        btn.textContent = "Snoozed 15m";
                        btn.classList.add('badge-allow');
                        showToast(`Snoozed ${domain} for 15 minutes`, 'success');
                    } else {
                        btn.disabled = false;
                        btn.textContent = "Error";
                        showToast(`Failed to snooze domain: ${res?.error || 'Unknown error'}`, 'error');
                    }
                } catch (err) {
                    btn.disabled = false;
                    btn.textContent = "Error";
                    showToast(`Failed to snooze domain: ${err?.message || 'Unknown error'}`, 'error');
                }
            };
        }
        resultsContainer.appendChild(row);
    });
}

/**
 * Exports the current debugger correlations as a JSON snapshot.
 */
export function exportDebuggerSnapshot() {
    if (!lastDebuggerResult) return;
    const data = JSON.stringify({
        tool: "Forge Debugger",
        timestamp: new Date().toISOString(),
        profile: state.activeProfile,
        correlations: lastDebuggerResult
    }, null, 2);
    downloadAsFile(`forge_debugger_${state.activeProfile}_${Date.now()}.json`, data);
}

let lastDiagnosticResult = null;

/**
 * Executes the NextDNS Network Diagnostics check and renders findings.
 * Measures PoP RTT latency, validates connection status, and displays network info.
 * @async
 */
export async function runNetworkDiagnosticsUI() {
    const resultsContainer = document.getElementById('diagnostics-results');
    const exportBtn = document.getElementById('export-diagnostics-btn');
    const runBtn = document.getElementById('run-diagnostics-btn');

    if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = "Testing...";
    }
    setSafeHTML(resultsContainer, '<div style="text-align: center; padding: 20px;">Testing NextDNS network connectivity and PoP latency...</div>');
    exportBtn?.classList.add('hidden');

    try {
        const res = await browser.runtime.sendMessage({ type: "RUN_DIAGNOSTICS" });
        if (!res?.success || !res?.diagnostics) {
            setSafeHTML(resultsContainer, renderEmptyStateHTML(res?.error || 'Diagnostic test failed.', '⚠️'));
            return;
        }

        const diag = res.diagnostics;
        lastDiagnosticResult = diag;

        const isConn = diag.isConnected;
        const statusBadge = isConn 
            ? '<span class="badge-allow" style="padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟢 CONNECTED</span>'
            : '<span class="badge-deny" style="padding: 2px 8px; border-radius: 4px; font-weight: 700;">🔴 UNCONFIGURED</span>';

        const latencyBadge = diag.rttMs !== null 
            ? `<span style="font-weight: 700; color: ${diag.rttMs < 50 ? 'var(--success)' : (diag.rttMs < 120 ? 'var(--warning)' : 'var(--danger)')};">${diag.rttMs} ms</span>`
            : '<span style="color: var(--text-muted);">---</span>';

        const html = `
            <div class="panel-box" style="margin-bottom: 10px; padding: 12px;">
                <div class="flex-between" style="margin-bottom: 8px;">
                    <strong style="font-size: 0.9em;">NextDNS Status</strong>
                    <div>${statusBadge}</div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8em; margin-top: 10px;">
                    <div style="background: rgba(0,0,0,0.15); padding: 8px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.75em; text-transform: uppercase;">Edge PoP Server</span>
                        <strong style="font-family: monospace;">${escapeHTML(diag.popServer || 'Unknown')}</strong>
                    </div>
                    <div style="background: rgba(0,0,0,0.15); padding: 8px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.75em; text-transform: uppercase;">Round-Trip Latency</span>
                        ${latencyBadge}
                    </div>
                    <div style="background: rgba(0,0,0,0.15); padding: 8px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.75em; text-transform: uppercase;">DNS Protocol</span>
                        <strong style="font-family: monospace;">${escapeHTML(diag.protocol || 'Unknown')}</strong>
                    </div>
                    <div style="background: rgba(0,0,0,0.15); padding: 8px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.75em; text-transform: uppercase;">Client Public IP</span>
                        <strong style="font-family: monospace;">${escapeHTML(diag.clientIp || 'Unknown')}</strong>
                    </div>
                </div>
                <div style="margin-top: 10px; font-size: 0.75em; color: var(--text-muted); display: flex; justify-content: space-between;">
                    <span>Profile: <strong>${escapeHTML(diag.activeProfileName || diag.activeProfileId || 'None')}</strong></span>
                    <span>${new Date(diag.timestamp).toLocaleTimeString()}</span>
                </div>
            </div>
        `;
        setSafeHTML(resultsContainer, html);
        exportBtn?.classList.remove('hidden');
    } catch (e) {
        setSafeHTML(resultsContainer, renderEmptyStateHTML(e.message || 'Diagnostic error', '⚠️'));
    } finally {
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.textContent = "🩺 Run Diagnostics";
        }
    }
}

/**
 * Exports the current diagnostic report as a JSON file.
 */
export function exportDiagnosticReport() {
    if (!lastDiagnosticResult) return;
    const data = JSON.stringify({
        tool: "NextDNS Network Diagnostics",
        version: lastDiagnosticResult.extensionVersion || "1.2.0",
        timestamp: new Date().toISOString(),
        diagnostics: lastDiagnosticResult
    }, null, 2);
    downloadAsFile(`nextdns_diagnostic_${lastDiagnosticResult.activeProfileId || 'profile'}_${Date.now()}.json`, data);
}
