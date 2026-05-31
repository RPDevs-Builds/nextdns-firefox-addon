/**
 * DNS Forge - Tools UI Module (Auditor & Debugger)
 * @module ui/tools
 */

import { state } from './state.js';
import { escapeHTML, setSafeHTML } from './utils.js';

/**
 * Executes the "Forge Debugger" logic.
 * Correlates background web request tracking with live NextDNS API logs to identify which list is blocking a domain.
 * Renders findings with "Allow" buttons for quick whitelisting.
 * @async
 */
export async function runIntelligentDebugger() {
    const resultsContainer = document.getElementById('debugger-results');
    setSafeHTML(resultsContainer, '<div style="text-align: center; padding: 20px;">Fetching logs and correlating...</div>');

    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return;
    const tabId = tabs[0].id;

    if (!state.activeProfile) {
        setSafeHTML(resultsContainer, '<div class="alert alert-warning">No active profile detected.</div>');
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

    if (res.correlations.length === 0) {
        setSafeHTML(resultsContainer, '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No blocked domains correlated from this tab.</div>');
        return;
    }

    resultsContainer.textContent = '';
    res.correlations.forEach(c => {
        const row = document.createElement('div');
        row.className = 'panel-box';
        row.style.marginBottom = '10px';
        row.style.padding = '10px';
        
        const reasons = c.reasons.map(r => `<span class="badge-deny" style="padding: 1px 4px; font-size: 0.7em; border-radius: 3px;">${escapeHTML(r.name || r)}</span>`).join(' ');
        
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
            btn.disabled = true;
            btn.textContent = "...";
            const allowRes = await browser.runtime.sendMessage({
                type: "MANAGE_DOMAIN",
                profileId: state.activeProfile,
                listType: "allowlist",
                domain: btn.getAttribute('data-domain'),
                action: "add"
            });
            if (allowRes.success) {
                btn.textContent = "Added";
                btn.classList.replace('btn-allow', 'btn-secondary');
            } else {
                btn.disabled = false;
                btn.textContent = "Error";
            }
        };
        resultsContainer.appendChild(row);
    });
}

/**
 * Executes the "Security Auditor" scan.
 * Analyzes the active NextDNS profile for security gaps and deprecated blocklists.
 * Calculates a health score and provides actionable recommendations.
 * @async
 */
export async function runSecurityAudit() {
    if (!state.activeProfile) return alert("No active profile.");
    const res = await browser.runtime.sendMessage({ type: "RUN_AUDIT", profileId: state.activeProfile });

    if (!res.success) return alert("Audit failed: " + res.error);

    const scoreRing = document.getElementById('audit-score-ring');
    const resultsList = document.getElementById('audit-results');

    scoreRing.textContent = res.score;
    scoreRing.style.color = res.score > 80 ? 'var(--success)' : (res.score > 50 ? 'var(--warning)' : 'var(--danger)');

    if (res.recommendations.length === 0) {
        setSafeHTML(resultsList, '<div class="alert alert-success" style="font-size:0.85em;">Excellent! No security issues found.</div>');
    } else {
        const html = res.recommendations.map(rec => `
            <div class="panel-box" style="border-left: 3px solid ${rec.severity === 'high' ? 'var(--danger)' : 'var(--warning)'}; margin-bottom: 10px; padding: 10px;">
                <div style="font-size: 0.85em; margin-bottom: 8px;">${escapeHTML(rec.message)}</div>
                <button class="btn-allow fix-audit-btn" data-fix='${JSON.stringify(rec.fix)}' style="width: auto; padding: 3px 10px; font-size: 0.75em;">Apply Fix</button>
            </div>
        `).join('');
        setSafeHTML(resultsList, html);

        resultsList.querySelectorAll('.fix-audit-btn').forEach(btn => {
            btn.onclick = async () => {
                const fix = JSON.parse(btn.getAttribute('data-fix'));
                btn.disabled = true; btn.textContent = "Applying...";
                const fRes = await browser.runtime.sendMessage({
                    type: "TOGGLE_SETTING",
                    profileId: state.activeProfile,
                    ...fix
                });
                if (fRes.success) {
                    btn.textContent = "Fixed";
                    btn.classList.replace('btn-allow', 'btn-secondary');
                } else {
                    btn.disabled = false; btn.textContent = "Error";
                }
            };
        });
    }
}
