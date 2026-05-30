/**
 * DNS Forge - Presets UI Module
 */

import { state } from './state.js';
import { escapeHTML, setSafeHTML } from './utils.js';

export async function loadPresets() {
    const list = document.getElementById('presets-list');
    if (!list) return;

    try {
        const res = await fetch(browser.runtime.getURL('data/presets.json'));
        const { presets } = await res.json();

        const html = presets.map(p => `
            <div class="panel-box" style="margin-bottom:15px; padding:15px; border-left:4px solid var(--accent);">
                <div class="flex-between">
                    <strong style="font-size:1.1em;">${escapeHTML(p.name)}</strong>
                    <button class="btn-allow apply-preset-btn" data-id="${p.id}" style="width:auto; padding:6px 15px;">Apply</button>
                </div>
                <div style="font-size:0.85em; color:var(--text-muted); margin-top:5px;">${escapeHTML(p.description)}</div>
            </div>
        `).join('');
        setSafeHTML(list, html);

        list.querySelectorAll('.apply-preset-btn').forEach(btn => {
            btn.onclick = async () => {
                const presetId = btn.getAttribute('data-id');
                const preset = presets.find(p => p.id === presetId);
                if (preset && confirm(`Apply "${preset.name}" preset? This will overwrite existing settings.`)) {
                    btn.disabled = true;
                    btn.textContent = "Applying...";
                    await applyPreset(preset);
                    btn.textContent = "Applied!";
                    setTimeout(() => { btn.textContent = "Apply"; btn.disabled = false; }, 2000);
                }
            };
        });
    } catch (e) {
        console.error("[Presets] Failed to load presets", e);
    }
}

async function applyPreset(preset) {
    if (!state.activeProfile) return;

    const promises = [];

    // 1. Security/Privacy/Settings Toggles
    for (const [category, settings] of Object.entries(preset.settings)) {
        if (category === 'blocklists' || category === 'tlds' || category === 'categories') continue;
        
        for (const [id, value] of Object.entries(settings)) {
            promises.push(browser.runtime.sendMessage({
                type: "TOGGLE_SETTING",
                profileId: state.activeProfile,
                category,
                id,
                action: value ? 'add' : 'delete',
                settingType: 'boolean'
            }));
        }
    }

    // 2. Blocklists / TLDs / Categories (List-based)
    if (preset.settings.blocklists) {
        for (const id of preset.settings.blocklists) {
            promises.push(browser.runtime.sendMessage({
                type: "TOGGLE_SETTING",
                profileId: state.activeProfile,
                category: "privacy/blocklists",
                id,
                action: "add",
                settingType: "list"
            }));
        }
    }

    if (preset.settings.tlds) {
        for (const id of preset.settings.tlds) {
            promises.push(browser.runtime.sendMessage({
                type: "TOGGLE_SETTING",
                profileId: state.activeProfile,
                category: "security/tlds",
                id,
                action: "add",
                settingType: "list"
            }));
        }
    }

    if (preset.settings.categories) {
        for (const id of preset.settings.categories) {
            promises.push(browser.runtime.sendMessage({
                type: "TOGGLE_SETTING",
                profileId: state.activeProfile,
                category: "parentalcontrol/categories",
                id,
                action: "add",
                settingType: "list"
            }));
        }
    }

    await Promise.all(promises);
    // Refresh local cache and UI
    state.lastBlocksData = null; // Invalidate cache
}
