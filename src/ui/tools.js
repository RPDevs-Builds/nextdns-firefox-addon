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
                <strong style="font-family: monospace; font-size: 0.9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">${escapeHTML(c.domain)}</strong>
                <button class="btn-allow debug-allow-btn" data-domain="${escapeHTML(c.domain)}" style="width: auto; padding: 2px 8px; font-size: 0.7em;">Allow</button>
            </div>
            <div style="margin-top: 5px; display: flex; flex-wrap: wrap; gap: 4px;">${reasons}</div>
            <div style="font-size: 0.7em; color: var(--text-muted); margin-top: 5px;">${new Date(c.timestamp).toLocaleTimeString()} • ${escapeHTML(c.device)}</div>
        `;
        setSafeHTML(row, html);
        
        row.querySelector('.debug-allow-btn').onclick = async (e) => {
            const btn = e.target;
            const domain = btn.getAttribute('data-domain');
            btn.disabled = true;
            btn.textContent = "...";
            const allowRes = await browser.runtime.sendMessage({
                type: "MANAGE_DOMAIN",
                profileId: state.activeProfile,
                listType: "allowlist",
                domain,
                action: "add"
            });
            if (allowRes.success) {
                btn.textContent = "Added";
                btn.classList.replace('btn-allow', 'btn-secondary');
                showToast(`Added ${domain} to Allowlist`, 'success');
            } else {
                btn.disabled = false;
                btn.textContent = "Error";
                showToast(`Failed to add domain: ${allowRes?.error || 'Unknown error'}`, 'error');
            }
        };
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
