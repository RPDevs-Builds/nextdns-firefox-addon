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
import { handleLiveLog, renderLogs, loadAnalytics, updateDashboardTabInfo, updateDynamicLinks, loadNativeLogs, downloadLogsCSV, wipeLogs } from './dashboard.js';
import { loadToggles, syncLists, renderLists } from './blocks.js';
import { runSecurityAudit, runIntelligentDebugger, exportDebuggerSnapshot, exportAuditReport } from './tools.js';
import { loadRules, saveAutomationRule } from './scheduler.js';
import { loadPresets } from './presets.js';

/**
 * Global initialization handler. Runs on DOMContentLoaded.
 * Fires window mode detection, theme engine setup, and overall app bootstrap.
 */
document.addEventListener("DOMContentLoaded", async () => {
    console.log("[DNS Forge] Popup DOM Loaded. Initializing...");
    
    // 1. Immediate UI Setup (Sync)
    initWindowMode();
    initGlobalEventListeners();
    initTabNavigation();

    // 2. Async App Bootstrap
    try {
        await initThemeEngine();
        await initializeApp();
        console.log("[DNS Forge] Popup Fully Initialized.");
    } catch (e) {
        console.error("[DNS Forge] Critical Initialization Error:", e);
        // Show a fallback error message in the Dash tab if it completely fails
        const dashContainer = document.getElementById("dash-overview");
        if (dashContainer) {
            setSafeHTML(dashContainer, `
                <div class="panel-box" style="border-color: var(--danger);">
                    <h4 style="color: var(--danger);">Initialization Error</h4>
                    <p style="font-size: 0.8em; color: var(--text-muted);">The extension failed to load data. This is usually due to the background script being unresponsive.</p>
                    <button class="btn-secondary" onclick="location.reload()" style="width: 100%;">🔄 Retry Popup</button>
                    <pre style="font-size: 0.6em; margin-top: 10px; color: var(--danger); overflow: auto;">${escapeHTML(e.message)}</pre>
                </div>
            `);
        }
    }
});

/**
 * Handles adding a single domain to the selected list.
 * @async
 */
async function handleAddDomain() {
    const input = document.getElementById('list-new-domain');
    const domain = input?.value.trim();
    if (!domain) return;

    const listType = document.getElementById('list-type-select').value;
    const btn = document.getElementById('list-add-btn');
    btn.disabled = true;

    const res = await browser.runtime.sendMessage({
        type: "MANAGE_DOMAIN",
        profileId: state.activeProfile,
        listType,
        domain,
        action: "add"
    });

    if (res.success) {
        input.value = '';
        await syncLists(true);
    } else {
        alert("Failed to add domain.");
    }
    btn.disabled = false;
}

/**
 * Handles bulk adding multiple domains to the selected list.
 * @async
 */
async function handleBulkAdd() {
    const textarea = document.getElementById('list-bulk-domains');
    const domains = textarea?.value.split('\n').map(d => d.trim()).filter(d => d.length > 0);
    if (domains.length === 0) return;

    const listType = document.getElementById('list-type-select').value;
    const btn = document.getElementById('list-bulk-submit-btn');
    btn.disabled = true;
    btn.textContent = "Adding...";

    let successCount = 0;
    for (const domain of domains) {
        const res = await browser.runtime.sendMessage({
            type: "MANAGE_DOMAIN",
            profileId: state.activeProfile,
            listType,
            domain,
            action: "add"
        });
        if (res.success) successCount++;
    }

    alert(`Successfully added ${successCount} of ${domains.length} domains.`);
    textarea.value = '';
    document.getElementById('list-bulk-container').classList.add('hidden');
    await syncLists(true);
    btn.disabled = false;
    btn.textContent = "Bulk Add";
}

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
            if (tabId === 'lists') renderLists();
            if (tabId === 'toggles') loadToggles();
        };
    });

    // Sub-tab switching
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const subId = btn.dataset.sub;
            const parentTab = btn.closest('.tab-content').id.replace('tab-', '');
            
            console.log(`[DNS Forge] Sub-tab click: ${parentTab} -> ${subId}`);

            // Update active class for siblings
            btn.parentElement.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (parentTab === 'toggles') {
                state.activeBlocksSubTab = subId;
                loadToggles();
            } else if (parentTab === 'dashboard') {
                document.querySelectorAll('#tab-dashboard .dashboard-sub-content').forEach(p => p.classList.remove('active'));
                document.getElementById(`dash-${subId}`)?.classList.add('active');
                if (subId === 'overview') loadAnalytics();
            } else if (parentTab === 'settings') {
                document.querySelectorAll('.settings-sub-content').forEach(p => p.classList.remove('active'));
                document.getElementById(`settings-${subId}`)?.classList.add('active');
                if (subId === 'analytics') loadAnalytics();
                if (subId === 'customize') initCustomizeUI();
            }
        };
    });

    // Lists Tab Actions
    document.getElementById('list-type-select')?.addEventListener('change', () => renderLists());
    document.getElementById('list-search-input')?.addEventListener('input', (e) => renderLists(e.target.value));
    document.getElementById('list-add-btn')?.addEventListener('click', handleAddDomain);
    document.getElementById('list-bulk-toggle-btn')?.addEventListener('click', () => {
        document.getElementById('list-bulk-container').classList.toggle('hidden');
    });
    document.getElementById('list-bulk-submit-btn')?.addEventListener('click', handleBulkAdd);
    document.getElementById('list-bulk-cancel-btn')?.addEventListener('click', () => {
        document.getElementById('list-bulk-container').classList.add('hidden');
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

    // Data Management
    document.getElementById('launch-full-manager-btn')?.addEventListener('click', () => {
        browser.tabs.create({ url: browser.runtime.getURL('src/viewer.html') });
    });
    document.getElementById('download-logs-btn')?.addEventListener('click', downloadLogsCSV);
    document.getElementById('wipe-logs-btn')?.addEventListener('click', wipeLogs);

    // Backup & Restore
    document.getElementById('export-settings-btn')?.addEventListener('click', exportFullConfiguration);
    document.getElementById('import-settings-btn')?.addEventListener('click', () => document.getElementById('import-settings-file').click());
    document.getElementById('import-settings-file')?.addEventListener('change', importFullConfiguration);

    document.getElementById('save-mirror-btn')?.addEventListener('click', saveMirrorMode);
    document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);

    // Customize Toggles (Web GUI)
    const webGuiToggles = ['master', 'tlds', 'blocklists', 'logs', 'desc', 'notes', 'filter'];
    const webGuiMap = {
        'master': 'webGuiMaster',
        'tlds': 'webGuiTlds',
        'blocklists': 'webGuiBlocklists',
        'logs': 'webGuiLogActions',
        'desc': 'webGuiDesc',
        'notes': 'webGuiProfileNotes',
        'filter': 'webGuiFilter'
    };
    webGuiToggles.forEach(id => {
        document.getElementById(`web-gui-${id}-toggle`)?.addEventListener('change', async (e) => {
            const key = webGuiMap[id];
            const value = e.target.checked;
            await browser.storage.sync.set({ [key]: value });
            await browser.storage.local.set({ [key]: value });
            if (id === 'master') {
                const features = document.getElementById('web-gui-features');
                if (features) {
                    features.style.opacity = value ? '1' : '0.5';
                    features.style.pointerEvents = value ? 'all' : 'none';
                }
            }
        });
    });

    // Logs SSE listener
    browser.runtime.onMessage.addListener((msg) => {
        if (msg.type === "LIVE_LOG") handleLiveLog(msg.log);
    });

    // Delegated listeners for dynamic toggles
    document.addEventListener('change', async (e) => {
        if (e.target.classList.contains('api-toggle')) {
            const { cat, id, type } = e.target.dataset;
            const action = e.target.checked ? 'add' : 'delete';
            const res = await browser.runtime.sendMessage({
                type: "TOGGLE_SETTING",
                profileId: state.activeProfile,
                category: cat,
                id,
                action,
                settingType: type
            });
            if (!res.success) {
                e.target.checked = !e.target.checked;
                alert("Failed to update setting.");
            }
        }
    });

    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('api-toggle-btn')) {
            const btn = e.target;
            const { cat, id, type, active } = btn.dataset;
            const action = active === 'true' ? 'delete' : 'add';
            
            btn.disabled = true;
            const res = await browser.runtime.sendMessage({
                type: "TOGGLE_SETTING",
                profileId: state.activeProfile,
                category: cat,
                id,
                action,
                settingType: type
            });

            if (res.success) {
                btn.dataset.active = (action === 'add').toString();
                btn.textContent = action === 'add' ? 'Remove' : 'Add';
                btn.classList.toggle('btn-allow', action === 'delete');
                btn.classList.toggle('btn-deny', action === 'add');
            } else {
                alert("Failed to update.");
            }
            btn.disabled = false;
        }
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
    const settings = await initSettingsUI();
    
    let profile = await browser.runtime.sendMessage({ type: "GET_PROFILE" }).catch(() => null);
    
    // Fallback if profile detection fails but we have a stored profile ID
    if (!profile && settings.activeProfile) {
        profile = { id: settings.activeProfile, name: "Last Known Profile" };
    }

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
    } else {
        const profStatus = document.getElementById("profile-status");
        if (profStatus) {
            setSafeHTML(profStatus, `<span style="display:inline-block; width:8px; height:8px; background:var(--danger); border-radius:50%;"></span> Profile: Not Detected`);
        }
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

async function initCustomizeUI() {
    const keys = ["webGuiMaster", "webGuiTlds", "webGuiBlocklists", "webGuiLogActions", "webGuiDesc", "webGuiProfileNotes", "webGuiFilter"];
    const data = await browser.storage.sync.get(keys);
    
    const mapping = {
        'master': 'webGuiMaster',
        'tlds': 'webGuiTlds',
        'blocklists': 'webGuiBlocklists',
        'logs': 'webGuiLogActions',
        'desc': 'webGuiDesc',
        'notes': 'webGuiProfileNotes',
        'filter': 'webGuiFilter'
    };

    Object.entries(mapping).forEach(([id, key]) => {
        const el = document.getElementById(`web-gui-${id}-toggle`);
        if (el) el.checked = data[key] !== false; // Default to true
    });

    const masterEnabled = data.webGuiMaster !== false;
    const features = document.getElementById('web-gui-features');
    if (features) {
        features.style.opacity = masterEnabled ? '1' : '0.5';
        features.style.pointerEvents = masterEnabled ? 'all' : 'none';
    }
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
}

/**
 * Saves the selected mirror profiles to sync storage.
 * @async
 */
async function saveMirrorMode() {
    const list = document.getElementById('mirror-profiles-list');
    const saveBtn = document.getElementById('save-mirror-btn');
    if (!list || !saveBtn) return;
    
    const selected = Array.from(list.querySelectorAll('input:checked')).map(i => i.getAttribute('data-id'));
    await browser.storage.sync.set({ mirrorProfiles: selected });
    saveBtn.textContent = "✅ Saved!";
    setTimeout(() => { saveBtn.textContent = "💾 Save Mirror Config"; }, 2000);
}

/**
 * Initializes the Settings UI by loading values from storage and populating the form.
 * @async
 * @returns {Promise<Object>} The loaded settings object.
 */
async function initSettingsUI() {
    const keys = [
        "apiKey", "activeProfile", "iconClickAction", 
        "autoRefreshLogs", "enableBlockNotifications", 
        "enableLabs", "autoRefreshTime"
    ];
    const data = await browser.storage.sync.get(keys);

    const apiKeyInput = document.getElementById('setting-api-key');
    const profileSelect = document.getElementById('setting-profile-select');
    const iconActionSelect = document.getElementById('setting-icon-action');
    const autoRefreshCheck = document.getElementById('setting-auto-refresh');
    const blockNotifCheck = document.getElementById('setting-block-notif');
    const enableLabsCheck = document.getElementById('setting-enable-labs');
    const refreshTimeInput = document.getElementById('setting-refresh-time');

    if (apiKeyInput) apiKeyInput.value = data.apiKey || '';
    if (iconActionSelect) iconActionSelect.value = data.iconClickAction || 'popup';
    if (autoRefreshCheck) autoRefreshCheck.checked = !!data.autoRefreshLogs;
    if (blockNotifCheck) blockNotifCheck.checked = !!data.enableBlockNotifications;
    if (enableLabsCheck) enableLabsCheck.checked = !!data.enableLabs;
    if (refreshTimeInput) refreshTimeInput.value = data.autoRefreshTime || 5;

    state.lastIconAction = data.iconClickAction || 'popup';

    // Handle Profile Select
    if (profileSelect) {
        const loadProfiles = async () => {
            const res = await browser.runtime.sendMessage({ type: "GET_PROFILES_LIST" });
            if (res?.success) {
                setSafeHTML(profileSelect, '<option value="">Auto-Detect (Default)</option>');
                res.data.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name;
                    profileSelect.appendChild(opt);
                });
                profileSelect.value = data.activeProfile || '';
            }
        };

        await loadProfiles();
        document.getElementById('setting-fetch-profiles')?.addEventListener('click', loadProfiles);
    }

    return data;
}

/**
 * Saves the current settings from the UI to sync storage.
 * @async
 */
async function saveSettings() {
    const saveBtn = document.getElementById('save-settings-btn');
    if (!saveBtn) return;

    const apiKey = document.getElementById('setting-api-key')?.value.trim();
    const activeProfile = document.getElementById('setting-profile-select')?.value;
    const iconClickAction = document.getElementById('setting-icon-action')?.value;
    const autoRefreshLogs = document.getElementById('setting-auto-refresh')?.checked;
    const enableBlockNotifications = document.getElementById('setting-block-notif')?.checked;
    const enableLabs = document.getElementById('setting-enable-labs')?.checked;
    const autoRefreshTime = document.getElementById('setting-refresh-time')?.value;

    const newSettings = {
        apiKey,
        activeProfile,
        iconClickAction,
        autoRefreshLogs,
        enableBlockNotifications,
        enableLabs,
        autoRefreshTime: parseInt(autoRefreshTime) || 5
    };

    await browser.storage.sync.set(newSettings);
    // Also set local for redundancy/background access speed
    await browser.storage.local.set(newSettings);

    saveBtn.textContent = "✅ Saved!";
    setTimeout(() => { 
        saveBtn.textContent = "💾 Save Options"; 
        // Trigger a reload to apply fundamental changes (like icon click action)
        if (iconClickAction !== state.lastIconAction) {
            browser.runtime.reload();
        }
    }, 1500);

    state.lastIconAction = iconClickAction;
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
