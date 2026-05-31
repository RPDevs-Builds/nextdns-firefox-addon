/**
 * DNS Forge - Main Popup Entry Point (ES Module)
 * This module orchestrates the initialization and event management for the extension popup.
 * It coordinates theme management, tab navigation, and service initialization.
 * 
 * @module ui/main
 * @see {@link https://dns-forge.github.io/reference/ui/main/|Wiki Reference}
 */

import { state, isPopoutMode, isSidebarMode, PRESET_THEMES, THEME_VARS, urlParams } from './state.js';
import { setActiveTab, setSafeHTML, escapeHTML, downloadAsFile } from './utils.js';
import { handleLiveLog, renderLogs, loadAnalytics, updateDashboardTabInfo, updateDynamicLinks, loadNativeLogs } from './dashboard.js';
import { loadToggles, syncLists } from './blocks.js';
import { runSecurityAudit, runIntelligentDebugger, exportDebuggerSnapshot, exportAuditReport } from './tools.js';
import { loadRules, saveAutomationRule } from './scheduler.js';
import { loadPresets } from './presets.js';

/**
 * Global initialization handler. Runs on DOMContentLoaded.
 * Fires window mode detection, theme engine setup, and overall app bootstrap.
 */
document.addEventListener("DOMContentLoaded", async () => {
    initWindowMode();
    await initThemeEngine();
    initGlobalEventListeners();
    initTabNavigation();
    await initializeApp();
});

/**
 * Detects and applies CSS classes based on the current window mode (Popout vs Sidebar).
 * Adjusts body classes to enable mode-specific styling.
 */
function initWindowMode() {
    if (isPopoutMode) document.body.classList.add('mode-popout');
    if (isSidebarMode) document.body.classList.add('mode-sidebar');
    if (isSidebarMode) document.body.classList.add('sidebar-mode');
}

/**
 * Initializes the theme engine by loading the active theme and custom themes from storage.
 * Synchronizes the internal state and triggers theme application and dropdown population.
 * @async
 */
async function initThemeEngine() {
    const { activeTheme, customThemes = {} } = await browser.storage.sync.get(["activeTheme", "customThemes"]);
    state.savedThemes = customThemes;
    if (activeTheme) {
        state.activeThemeId = activeTheme;
        applyTheme(activeTheme);
    }
    populateThemeDropdown();
}

/**
 * Applies a specific theme ID to the document body.
 * Handles both standard light/dark modes and custom CSS variable-based themes.
 * @param {string} id - The unique identifier of the theme to apply.
 */
function applyTheme(id) {
    THEME_VARS.forEach(v => document.body.style.removeProperty(`--${v}`));
    if (id === 'default-light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
        const theme = PRESET_THEMES[id] || state.savedThemes[id];
        if (theme) {
            Object.entries(theme).forEach(([key, val]) => {
                document.body.style.setProperty(key, val);
            });
        }
    }
}

/**
 * Populates the theme selector dropdown with preset and custom user themes.
 * Utilizes setSafeHTML for AMO compliance during initial dropdown population.
 */
function populateThemeDropdown() {
    const select = document.getElementById("theme-selector");
    if (!select) return;
    
    setSafeHTML(select, '<option value="default-dark">🌙 Default Dark</option><option value="default-light">☀️ Default Light</option>');
    
    Object.keys(PRESET_THEMES).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = `✨ ${t}`;
        select.appendChild(opt);
    });
    Object.keys(state.savedThemes).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = `🎨 ${t}`;
        select.appendChild(opt);
    });
    
    select.value = state.activeThemeId;
}

/**
 * Binds global event listeners for UI interactions.
 * Covers tab switching, dashboard actions, tool triggers, and background message listeners.
 */
function initGlobalEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            const tabId = btn.dataset.tab;
            setActiveTab(tabId);
            if (tabId === 'presets') loadPresets();
        };
    });

    // Dashboard Actions
    document.getElementById("auto-refresh-btn")?.addEventListener('click', (e) => {
        const isEnabled = e.target.classList.contains('btn-secondary');
        toggleAutoRefresh(!isEnabled);
    });

    // Tools
    document.getElementById('run-audit-btn')?.addEventListener('click', runSecurityAudit);
    document.getElementById('run-debugger-btn')?.addEventListener('click', runIntelligentDebugger);
    document.getElementById('export-audit-btn')?.addEventListener('click', exportAuditReport);
    document.getElementById('export-debugger-btn')?.addEventListener('click', exportDebuggerSnapshot);
    document.getElementById('add-rule-btn')?.addEventListener('click', saveAutomationRule);

    // Backup & Restore
    document.getElementById('export-settings-btn')?.addEventListener('click', exportFullConfiguration);
    document.getElementById('import-settings-btn')?.addEventListener('click', () => document.getElementById('import-settings-file').click());
    document.getElementById('import-settings-file')?.addEventListener('change', importFullConfiguration);

    // Logs SSE listener
    browser.runtime.onMessage.addListener((msg) => {
        if (msg.type === "LIVE_LOG") handleLiveLog(msg.log);
    });
}

/**
 * Determines the initial tab to display based on URL parameters.
 * Defaults to the 'dashboard' tab.
 */
function initTabNavigation() {
    const initialTab = urlParams.get('tab') || 'dashboard';
    setActiveTab(initialTab);
}

/**
 * Primary application bootstrap logic.
 * Fetches the active profile, starts the log stream, and initializes all sub-modules.
 * @async
 */
async function initializeApp() {
    const profile = await browser.runtime.sendMessage({ type: "GET_PROFILE" }).catch(() => null);
    if (profile) {
        state.activeProfile = profile.id;
        const profStatus = document.getElementById("profile-status");
        if (profStatus) {
            const html = `
                <span style="display:inline-block; width:8px; height:8px; background:var(--success); border-radius:50%; box-shadow: 0 0 6px var(--success);"></span>
                Profile: ${escapeHTML(profile.name)}
            `;
            setSafeHTML(profStatus, html);
        }
        browser.runtime.sendMessage({ type: "START_STREAM", profileId: state.activeProfile });
    }

    window.addEventListener("unload", () => {
        browser.runtime.sendMessage({ type: "STOP_STREAM" });
    });

    updateDynamicLinks();
    await syncLists();
    await loadAnalytics();
    await loadToggles();
    await loadRules();
    await initMirrorModeUI();
    updateDashboardTabInfo();
}

/**
 * Initializes the Mirror Mode UI, allowing users to select profiles for synchronization.
 * Fetches the list of all available profiles and binds the save handler.
 * @async
 */
async function initMirrorModeUI() {
    const list = document.getElementById('mirror-profiles-list');
    const saveBtn = document.getElementById('save-mirror-btn');
    if (!list || !saveBtn) return;

    const res = await browser.runtime.sendMessage({ type: "GET_PROFILES_LIST" });
    const { mirrorProfiles = [] } = await browser.storage.sync.get("mirrorProfiles");

    if (res?.success) {
        list.textContent = '';
        res.data.forEach(p => {
            if (p.id === state.activeProfile) return;
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.style.display = 'block';
            label.style.marginBottom = '6px';
            const isChecked = mirrorProfiles.includes(p.id);
            setSafeHTML(label, `<input type="checkbox" data-id="${p.id}" ${isChecked ? 'checked' : ''}> ${escapeHTML(p.name)}`);
            list.appendChild(label);
        });
    }

    saveBtn.onclick = async () => {
        const selected = Array.from(list.querySelectorAll('input:checked')).map(i => i.getAttribute('data-id'));
        await browser.storage.sync.set({ mirrorProfiles: selected });
        saveBtn.textContent = "✅ Saved!";
        setTimeout(() => { saveBtn.textContent = "💾 Save Mirror Config"; }, 2000);
    };
}

/**
 * Toggles the auto-refresh mechanism for native dashboard logs.
 * Sets or clears an interval based on user preference and storage settings.
 * @async
 * @param {boolean} enable - Whether to enable or disable auto-refresh.
 */
async function toggleAutoRefresh(enable) {
    const btn = document.getElementById("auto-refresh-btn");
    if (!btn) return;
    if (state.autoRefreshInterval) clearInterval(state.autoRefreshInterval);
    state.autoRefreshInterval = null;

    if (enable) {
        btn.classList.replace("btn-dark", "btn-secondary"); btn.textContent = "⏸️ Auto";
        loadNativeLogs();
        const { autoRefreshTime } = await browser.storage.sync.get("autoRefreshTime");
        state.autoRefreshInterval = setInterval(loadNativeLogs, (parseInt(autoRefreshTime) || 5) * 1000);
    } else { 
        btn.classList.replace("btn-secondary", "btn-dark"); btn.textContent = "▶️ Auto"; 
    }
}

/**
 * Exports the entire extension configuration (sync and local storage) as a JSON file.
 * @async
 */
export async function exportFullConfiguration() {
    const data = await browser.storage.sync.get(null);
    const localData = await browser.storage.local.get(null);
    const payload = JSON.stringify({
        type: "DNS_FORGE_BACKUP",
        version: browser.runtime.getManifest().version,
        timestamp: new Date().toISOString(),
        sync: data,
        local: localData
    }, null, 2);
    downloadAsFile(`dns_forge_backup_${Date.now()}.json`, payload);
}

/**
 * Imports an extension configuration from a JSON file.
 * Validates the file structure before applying settings.
 * @async
 * @param {Event} e - The file input change event.
 */
export async function importFullConfiguration(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const config = JSON.parse(event.target.result);
            if (config.type !== "DNS_FORGE_BACKUP") {
                throw new Error("Invalid backup file format.");
            }

            if (confirm("This will overwrite your current settings. Continue?")) {
                if (config.sync) await browser.storage.sync.set(config.sync);
                if (config.local) await browser.storage.local.set(config.local);
                alert("Settings restored successfully! The extension will now reload.");
                browser.runtime.reload();
            }
        } catch (err) {
            alert("Error importing settings: " + err.message);
        }
        e.target.value = ''; // Reset input
    };
    reader.readAsText(file);
}
