/**
 * DNS Forge - Scheduler UI Module
 * @module ui/scheduler
 */

import { escapeHTML, setSafeHTML, showToast, renderEmptyStateHTML } from './utils.js';

/**
 * Loads the currently scheduled automation rules from the background and renders them in the UI.
 * Attaches click listeners to the delete buttons.
 * @async
 */
export async function loadRules() {
    const res = await browser.runtime.sendMessage({ type: "LIST_RULES" });
    const list = document.getElementById('rules-list');
    if (!list) return;

    if (!res?.rules || res.rules.length === 0) {
        setSafeHTML(list, renderEmptyStateHTML('No automation rules scheduled.', '⏰'));
    } else {
        const html = res.rules.map(r => `
            <div class="flex-between" style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 4px; margin-bottom: 5px; border-left: 3px solid ${r.action === 'enable' ? 'var(--success)' : 'var(--danger)'};">
                <div style="font-size: 0.85em;">
                    <strong>${escapeHTML(r.name)}</strong>
                    <div style="font-size: 0.8em; color: var(--text-muted);">${r.trigger} • ${r.action} ${r.targetId}</div>
                </div>
                <button class="btn-deny delete-rule-btn" data-id="${escapeHTML(r.id)}" style="width: auto; padding: 2px 6px; font-size: 0.75em;" aria-label="Delete rule ${escapeHTML(r.name)}">🗑️</button>
            </div>
        `).join('');
        setSafeHTML(list, html);

        list.querySelectorAll('.delete-rule-btn').forEach(btn => {
            btn.onclick = async () => {
                const ruleId = btn.getAttribute('data-id');
                btn.disabled = true;
                try {
                    const delRes = await browser.runtime.sendMessage({ type: "DELETE_RULE", ruleId });
                    if (delRes?.success) {
                        showToast("Rule deleted.", "success");
                        await loadRules();
                    } else {
                        showToast(`Failed to delete rule: ${delRes?.error || 'Unknown error'}`, "error");
                    }
                } catch (err) {
                    showToast(`Failed to delete rule: ${err?.message || 'Unknown error'}`, "error");
                } finally {
                    btn.disabled = false;
                }
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
    const name = document.getElementById('rule-name')?.value?.trim();
    const trigger = document.getElementById('rule-trigger')?.value?.trim();
    const action = document.getElementById('rule-action')?.value;
    const targetVal = document.getElementById('rule-target')?.value;

    if (!name || !trigger) return showToast("Please enter name and time.", "warning");
    if (!targetVal || !targetVal.includes(':')) return showToast("Please select a target setting.", "warning");

    const [category, targetId] = targetVal.split(':');
    const isService = category.toLowerCase().includes('services');
    const settingType = isService ? 'list' : 'boolean';
    const rule = { name, trigger, action, category, targetId, settingType };

    const btn = document.getElementById('add-rule-btn');
    if (btn) btn.disabled = true;

    try {
        const res = await browser.runtime.sendMessage({ type: "SAVE_RULE", rule });
        if (res?.success) {
            const nameInput = document.getElementById('rule-name');
            if (nameInput) nameInput.value = '';
            const triggerEl = document.getElementById('rule-trigger');
            if (triggerEl) triggerEl.value = '';
            showToast("Automation rule saved.", "success");
            await loadRules();
        } else {
            showToast(`Failed to save rule: ${res?.error || 'Unknown error'}`, "error");
        }
    } catch (e) {
        showToast(`Failed to save rule: ${e?.message || 'Unknown error'}`, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}
