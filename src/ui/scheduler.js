/**
 * DNS Forge - Scheduler UI Module
 * @module ui/scheduler
 */

import { escapeHTML, setSafeHTML } from './utils.js';

/**
 * Loads the currently scheduled automation rules from the background and renders them in the UI.
 * Attaches click listeners to the delete buttons.
 * @async
 */
export async function loadRules() {
    const res = await browser.runtime.sendMessage({ type: "LIST_RULES" });
    const list = document.getElementById('rules-list');
    if (!list) return;

    if (!res.rules || res.rules.length === 0) {
        setSafeHTML(list, '<div style="text-align: center; color: var(--text-muted); font-size: 0.8em; padding: 10px;">No rules scheduled.</div>');
    } else {
        const html = res.rules.map(r => `
            <div class="flex-between" style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 4px; margin-bottom: 5px; border-left: 3px solid ${r.action === 'enable' ? 'var(--success)' : 'var(--danger)'};">
                <div style="font-size: 0.85em;">
                    <strong>${escapeHTML(r.name)}</strong>
                    <div style="font-size: 0.8em; color: var(--text-muted);">${r.trigger} • ${r.action} ${r.targetId}</div>
                </div>
                <button class="btn-deny delete-rule-btn" data-id="${r.id}" style="width: auto; padding: 2px 6px; font-size: 0.75em;">🗑️</button>
            </div>
        `).join('');
        setSafeHTML(list, html);

        list.querySelectorAll('.delete-rule-btn').forEach(btn => {
            btn.onclick = async () => {
                await browser.runtime.sendMessage({ type: "DELETE_RULE", ruleId: btn.getAttribute('data-id') });
                loadRules();
            };
        });
    }
}

/**
 * Reads form data from the scheduler UI and saves a new automation rule via the background script.
 * Resets the form and reloads the rules list upon success.
 * @async
 */
export async function saveAutomationRule() {
    const name = document.getElementById('rule-name').value;
    const trigger = document.getElementById('rule-trigger').value;
    const action = document.getElementById('rule-action').value;
    const targetVal = document.getElementById('rule-target').value;

    if (!name || !trigger) return alert("Please enter name and time.");

    const [category, targetId] = targetVal.split(':');
    const rule = { name, trigger, action, category, targetId };

    await browser.runtime.sendMessage({ type: "SAVE_RULE", rule });
    document.getElementById('rule-name').value = '';
    loadRules();
}
