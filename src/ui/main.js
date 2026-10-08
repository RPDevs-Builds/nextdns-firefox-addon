/**
 * DNS Forge - Main Popup Entry Point (ES Module)
 * This module orchestrates the initialization and event management for the extension popup.
 * It coordinates theme management, tab navigation, and service initialization.
 * 
 * @module ui/main
 * @see {@link https://dns-forge.github.io/reference/ui/main/|Wiki Reference}
 */

import { state, isPopoutMode, isSidebarMode, isTabMode, PRESET_THEMES, THEME_VARS, DEFAULT_THEME_COLORS, urlParams } from './state.js';
import { setActiveTab, setSafeHTML, escapeHTML, downloadAsFile } from './utils.js';
import { handleLiveLog, renderLogs, loadAnalytics, updateDashboardTabInfo, updateDynamicLinks, loadNativeLogs, downloadLogsCSV, wipeLogs } from './dashboard.js';
import { loadToggles, syncLists, renderLists } from './blocks.js';
import { runSecurityAudit, runIntelligentDebugger, exportDebuggerSnapshot, exportAuditReport } from './tools.js';
import { loadRules, saveAutomationRule } from './scheduler.js';
import { renderNotifications, initNotifications } from './notifications.js';
import { storage } from '../storage.js';

/**
 * Global initialization handler. Runs on DOMContentLoaded.
 * Fires window mode detection, theme engine setup, and overall app bootstrap.
 */
document.addEventListener("DOMContentLoaded", async () => {
    console.log("[DNS Forge] Popup DOM Loaded. Initializing UI...");
    
    // 1. Immediate UI Setup (Sync)
    try {
        initWindowMode();
        initGlobalEventListeners();
        initTabNavigation();
        initNotifications();
        console.log("[DNS Forge] UI Listeners bound.");
    } catch (e) { console.error("[DNS Forge] Sync UI setup failed:", e); }

    // If popout or sidebar mode redirect is triggered, stop further popup initialization
    if (await handleIconClickModeRedirect()) {
        return;
    }

    // 2. Async App Bootstrap
    try {
        await initThemeEngine();
        console.log("[Init] Theme engine ready.");
    } catch (e) {
        console.error("[Init] Theme engine failed:", e);
    }
    
    initializeApp().then(() => {
        console.log("[DNS Forge] Popup Fully Initialized.");
    }).catch(e => {
        console.error("[DNS Forge] Critical Initialization Error:", e);
        const dashContainer = document.getElementById("dash-overview");
        if (dashContainer) {
            setSafeHTML(dashContainer, `
                <div class="panel-box" style="border-color: var(--danger);">
                    <h4 style="color: var(--danger);">Initialization Failed</h4>
                    <p style="font-size: 0.8em; color: var(--text-muted);">The extension failed to bootstrap core services.</p>
                    <button class="btn-secondary" onclick="location.reload()" style="width: 100%;">🔄 Retry Popup</button>
                </div>
            `);
        }
    });
});

/**
 * Handles domain management actions (Allow/Deny/Snooze) from the Dashboard.
 * @async
 * @param {string} listType - The list to modify ('allowlist' or 'denylist').
 * @param {string} action - The action to perform ('add' or 'delete').
 * @param {boolean} [isTemp=false] - Whether this is a temporary allow (snooze).
 */
async function handleDashboardDomain(listType, action, isTemp = false) {
    const input = document.getElementById('domain-input');
    const domain = input?.value.trim();
    if (!domain) return;

    const btn = isTemp ? document.getElementById('snooze-btn') : document.getElementById(`${listType.replace('list','')}-btn`);
    if (btn) btn.disabled = true;

    try {
        const type = isTemp ? "TEMP_ALLOW" : "MANAGE_DOMAIN";
        const res = await browser.runtime.sendMessage({
            type,
            profileId: state.activeProfile,
            listType,
            domain,
            action,
            duration: isTemp ? 5 : undefined // 5 minutes default
        });

        if (res.success) {
            alert(`Successfully ${isTemp ? 'temporarily allowed' : (action === 'add' ? 'added' : 'removed')} ${domain}`);
            await syncLists(true);
        } else {
            alert(`Failed to update ${domain}: ${res.error || 'Unknown error'}`);
        }
    } catch (e) {
        alert("Communication error with background script.");
    } finally {
        if (btn) btn.disabled = false;
    }
}

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
 * Adjusts html and body classes to enable mode-specific styling.
 */
function initWindowMode() {
    if (isPopoutMode) {
        document.documentElement.classList.add('mode-popout');
        document.body.classList.add('mode-popout');
    }
    if (isSidebarMode) {
        document.documentElement.classList.add('mode-sidebar');
        document.body.classList.add('mode-sidebar');
        document.body.classList.add('sidebar-mode');
    }
    if (isTabMode) {
        document.documentElement.classList.add('mode-tab');
        document.body.classList.add('mode-tab');
    }
}

/**
 * Handles redirecting to a standalone window or opening the sidebar
 * if the user has configured iconClickAction to 'popout' or 'sidebar'.
 * @async
 * @returns {Promise<boolean>} True if redirected, false if proceeding in standard popup mode.
 */
async function handleIconClickModeRedirect() {
    if (isPopoutMode || isSidebarMode || isTabMode) return false;
    try {
        const iconClickAction = await storage.get("iconClickAction");
        if (iconClickAction === 'popout') {
            const url = browser.runtime.getURL('src/popup.html?mode=popout');
            if (window.browser?.windows?.create) {
                await browser.windows.create({
                    url,
                    type: 'popup',
                    width: 400,
                    height: 600
                });
            } else if (window.browser?.tabs?.create) {
                await browser.tabs.create({ url });
            }
            window.close();
            return true;
        } else if (iconClickAction === 'sidebar') {
            if (window.browser?.sidebarAction?.open) {
                await browser.sidebarAction.open();
                window.close();
                return true;
            } else if (window.browser?.tabs?.create) {
                const url = browser.runtime.getURL('src/popup.html?mode=tab');
                await browser.tabs.create({ url });
                window.close();
                return true;
            }
        }
    } catch (e) {
        console.warn("[DNS Forge] Error checking iconClickAction mode redirect:", e);
    }
    return false;
}

/**
 * Normalizes any hex/rgb color string into a valid 7-character #rrggbb string for HTML color inputs.
 * @param {string} val - Color string to normalize.
 * @param {string} [fallback='#000000'] - Fallback hex if parsing fails.
 * @returns {string} 7-character lowercase hex string.
 */
export function normalizeHexColor(val, fallback = '#000000') {
    if (!val || typeof val !== 'string') return fallback;
    val = val.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        return val.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{8}$/.test(val)) {
        return val.slice(0, 7).toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(val)) {
        const r = val[1], g = val[2], b = val[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{4}$/.test(val)) {
        const r = val[1], g = val[2], b = val[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    const rgbMatch = val.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
        const r = Math.min(255, parseInt(rgbMatch[1], 10)).toString(16).padStart(2, '0');
        const g = Math.min(255, parseInt(rgbMatch[2], 10)).toString(16).padStart(2, '0');
        const b = Math.min(255, parseInt(rgbMatch[3], 10)).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toLowerCase();
    }
    return fallback;
}

/**
 * Returns the color palette dictionary for a given theme identifier.
 * @param {string} id - Theme identifier.
 * @returns {Object.<string, string>} Mapping of CSS variable names to hex colors.
 */
export function getThemeColors(id) {
    if (DEFAULT_THEME_COLORS && DEFAULT_THEME_COLORS[id]) {
        const defaults = DEFAULT_THEME_COLORS[id];
        const res = {};
        THEME_VARS.forEach(v => {
            res[v] = normalizeHexColor(defaults[`--${v}`] || defaults[v]);
        });
        return res;
    }
    const theme = PRESET_THEMES[id] || (state.savedThemes && state.savedThemes[id]);
    const fallback = getThemeColors('default-dark');
    const colors = {};
    THEME_VARS.forEach(v => {
        const raw = theme ? (theme[`--${v}`] || theme[v]) : null;
        colors[v] = raw ? normalizeHexColor(raw, fallback[v]) : fallback[v];
    });
    return colors;
}

/**
 * Returns human-readable display label for a theme ID.
 * @param {string} id - Theme identifier.
 * @returns {string} Human readable label.
 */
export function getThemeDisplayName(id) {
    if (id === 'default-dark') return 'Default Dark';
    if (id === 'default-light') return 'Default Light';
    return id || 'Custom';
}

/**
 * Synchronizes the Custom Color Palette inputs (<input type="color">) to match the specified theme.
 * @param {string} themeId - Theme identifier to pull colors from.
 */
export function updateColorPaletteInputs(themeId) {
    const colors = getThemeColors(themeId);
    THEME_VARS.forEach(v => {
        const input = document.getElementById(`color-${v}`);
        if (input && colors[v]) {
            input.value = normalizeHexColor(colors[v]);
        }
    });
}

/**
 * Updates the visibility of the delete theme button (🗑️).
 * Visible only for user-saved custom themes that are currently saved (not unsaved / preset).
 */
export function updateDeleteThemeBtnVisibility() {
    const delBtn = document.getElementById('delete-theme-btn');
    if (!delBtn) return;
    if (!state.isThemeUnsaved && state.savedThemes && state.savedThemes[state.activeThemeId]) {
        delBtn.style.display = 'inline-block';
    } else {
        delBtn.style.display = 'none';
    }
}

/**
 * Updates the visibility of the (unsaved) badge next to Active Theme label.
 */
export function updateUnsavedBadge() {
    const badge = document.getElementById('theme-unsaved-badge');
    if (!badge) return;
    badge.style.display = state.isThemeUnsaved ? 'inline' : 'none';
}

/**
 * Sets the theme unsaved state and refreshes dropdown / badges.
 * @param {boolean} isUnsaved - Whether changes are currently unsaved.
 */
export function setThemeUnsaved(isUnsaved) {
    if (state.isThemeUnsaved === isUnsaved) return;
    state.isThemeUnsaved = isUnsaved;
    populateThemeDropdown();
}

/**
 * Applies a specific theme ID to the document body.
 * Handles both standard light/dark modes and custom CSS variable-based themes.
 * @param {string} id - The unique identifier of the theme to apply.
 */
export function applyTheme(id) {
    THEME_VARS.forEach(v => document.body.style.removeProperty(`--${v}`));
    if (id === 'default-light') {
        document.body.classList.add('light-mode');
        const lightColors = getThemeColors('default-light');
        THEME_VARS.forEach(v => document.body.style.setProperty(`--${v}`, lightColors[v]));
    } else {
        document.body.classList.remove('light-mode');
        if (id === 'default-dark') {
            const darkColors = getThemeColors('default-dark');
            THEME_VARS.forEach(v => document.body.style.setProperty(`--${v}`, darkColors[v]));
        } else {
            const theme = PRESET_THEMES[id] || (state.savedThemes && state.savedThemes[id]);
            if (theme) {
                Object.entries(theme).forEach(([key, val]) => {
                    const prop = key.startsWith('--') ? key : `--${key}`;
                    document.body.style.setProperty(prop, val);
                });
            }
        }
    }
}

/**
 * Populates the theme selector dropdown with preset, custom user themes, and unsaved indicators.
 * Utilizes setSafeHTML and DOM nodes for AMO compliance.
 */
export function populateThemeDropdown() {
    const select = document.getElementById("theme-selector");
    if (!select) return;
    
    setSafeHTML(select, '');
    
    // If currently unsaved, render unsaved option reflecting base theme
    if (state.isThemeUnsaved) {
        const unsavedOpt = document.createElement('option');
        unsavedOpt.value = '__unsaved__';
        const baseName = getThemeDisplayName(state.activeThemeId);
        unsavedOpt.textContent = `🎨 ${baseName} (unsaved)`;
        select.appendChild(unsavedOpt);
    }
    
    const optDark = document.createElement('option');
    optDark.value = 'default-dark';
    optDark.textContent = '🌙 Default Dark';
    select.appendChild(optDark);
    
    const optLight = document.createElement('option');
    optLight.value = 'default-light';
    optLight.textContent = '☀️ Default Light';
    select.appendChild(optLight);
    
    Object.keys(PRESET_THEMES).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = `✨ ${t}`;
        select.appendChild(opt);
    });
    
    Object.keys(state.savedThemes || {}).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = `🎨 ${t}`;
        select.appendChild(opt);
    });
    
    if (state.isThemeUnsaved) {
        select.value = '__unsaved__';
    } else {
        select.value = state.activeThemeId;
    }

    updateDeleteThemeBtnVisibility();
    updateUnsavedBadge();
}

/**
 * Initializes the theme engine by loading the active theme and custom themes from storage.
 * Synchronizes the internal state and triggers theme application and dropdown population.
 * @async
 */
export async function initThemeEngine() {
    const { activeTheme, customThemes = {} } = await storage.get(["activeTheme", "customThemes"], { customThemes: {} });
    state.savedThemes = customThemes;
    state.isThemeUnsaved = false;
    if (activeTheme) {
        state.activeThemeId = activeTheme;
        applyTheme(activeTheme);
    } else {
        applyTheme('default-dark');
    }
    populateThemeDropdown();
    updateColorPaletteInputs(state.activeThemeId);
}

/**
 * Saves current custom palette under a user-defined theme name.
 * Clears unsaved state and persists to storage.
 * @async
 */
export async function saveCustomTheme() {
    const nameInput = document.getElementById('theme-name-input');
    const saveBtn = document.getElementById('save-theme-btn');
    if (!nameInput) return;

    const themeName = nameInput.value.trim();
    if (!themeName) {
        nameInput.focus();
        nameInput.placeholder = 'Please enter a theme name...';
        nameInput.style.borderColor = 'var(--danger)';
        setTimeout(() => {
            nameInput.placeholder = 'New theme name...';
            nameInput.style.borderColor = '';
        }, 2000);
        return;
    }

    if (['default-dark', 'default-light'].includes(themeName) || PRESET_THEMES[themeName]) {
        nameInput.value = '';
        nameInput.placeholder = 'Name reserved. Choose another...';
        nameInput.style.borderColor = 'var(--danger)';
        setTimeout(() => {
            nameInput.placeholder = 'New theme name...';
            nameInput.style.borderColor = '';
        }, 2500);
        return;
    }

    const newPalette = {};
    THEME_VARS.forEach(v => {
        const input = document.getElementById(`color-${v}`);
        newPalette[`--${v}`] = input ? input.value : (getThemeColors('default-dark')[v]);
    });

    if (!state.savedThemes) state.savedThemes = {};
    state.savedThemes[themeName] = newPalette;
    await storage.set('customThemes', state.savedThemes);

    state.activeThemeId = themeName;
    state.isThemeUnsaved = false;
    await storage.set('activeTheme', themeName);

    applyTheme(themeName);
    updateColorPaletteInputs(themeName);
    populateThemeDropdown();

    nameInput.value = '';
    if (saveBtn) {
        saveBtn.textContent = '✅';
        saveBtn.disabled = true;
        setTimeout(() => {
            saveBtn.textContent = '💾';
            saveBtn.disabled = false;
        }, 1500);
    }
}

/**
 * Deletes the currently selected custom theme and reverts to default dark.
 * @async
 */
export async function deleteCustomTheme() {
    if (state.isThemeUnsaved || !state.savedThemes || !state.savedThemes[state.activeThemeId]) return;

    const themeToDelete = state.activeThemeId;
    delete state.savedThemes[themeToDelete];
    await storage.set('customThemes', state.savedThemes);

    state.activeThemeId = 'default-dark';
    state.isThemeUnsaved = false;
    await storage.set('activeTheme', 'default-dark');

    applyTheme('default-dark');
    updateColorPaletteInputs('default-dark');
    populateThemeDropdown();
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
            if (tabId === 'dashboard') {
                if (!state.activeProfile || document.getElementById("profile-status")?.textContent.includes("Not Detected")) {
                    refreshActiveProfileAndUI();
                }
            }
            if (tabId === 'settings') {
                loadProfiles();
                const activeSub = document.querySelector('#settings-sub-nav .sub-tab-btn.active')?.dataset.sub;
                if (activeSub === 'alerts') loadAlertSettings();
                if (activeSub === 'mirror') initMirrorModeUI();
                if (activeSub === 'schedules') loadRules();
                if (activeSub === 'customize') {
                    populateThemeDropdown();
                    if (!state.isThemeUnsaved) updateColorPaletteInputs(state.activeThemeId);
                }
                if (activeSub === 'webgui') initCustomizeUI();
            }
            if (tabId === 'toggles') loadToggles();
            if (tabId === 'logs') loadNativeLogs();
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
                if (subId === 'alerts') loadAlertSettings();
                if (subId === 'analytics') loadAnalytics();
                if (subId === 'customize') {
                    populateThemeDropdown();
                    if (!state.isThemeUnsaved) updateColorPaletteInputs(state.activeThemeId);
                }
                if (subId === 'webgui') initCustomizeUI();
                if (subId === 'schedules') loadRules();
                if (subId === 'mirror') initMirrorModeUI();
                if (subId === 'setup') loadProfiles();
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

    document.getElementById("allow-btn")?.addEventListener('click', () => handleDashboardDomain('allowlist', 'add'));
    document.getElementById("deny-btn")?.addEventListener('click', () => handleDashboardDomain('denylist', 'add'));
    document.getElementById("snooze-btn")?.addEventListener('click', () => handleDashboardDomain('allowlist', 'add', true));

    document.getElementById("toggle-tab-tracking-btn")?.addEventListener('click', (e) => {
        state.isTabTrackingPaused = !state.isTabTrackingPaused;
        e.target.textContent = state.isTabTrackingPaused ? "▶️ LIVE" : "⏸️ LIVE";
        e.target.classList.toggle('btn-secondary', !state.isTabTrackingPaused);
        e.target.classList.toggle('btn-dark', state.isTabTrackingPaused);
    });

    // Log Filters
    document.getElementById("log-search")?.addEventListener('input', () => renderLogs());
    document.getElementById("log-device-filter")?.addEventListener('change', () => renderLogs());
    document.getElementById("log-type-filter")?.addEventListener('change', () => renderLogs());

    const filterAll = document.getElementById("filter-all");
    const filterStandard = document.getElementById("filter-standard");
    const filterAllowed = document.getElementById("filter-allowed");
    const filterBlocked = document.getElementById("filter-blocked");
    const filterAllowlist = document.getElementById("filter-allowlist");
    const filterDenylist = document.getElementById("filter-denylist");
    const statusFilterInputs = document.querySelectorAll('#status-filter-content input');

    statusFilterInputs.forEach(cb => {
        cb.addEventListener('change', (e) => {
            if (e.target === filterAll) {
                if (filterAll.checked) {
                    if (filterStandard) filterStandard.checked = true;
                    if (filterAllowed) filterAllowed.checked = true;
                    if (filterBlocked) filterBlocked.checked = true;
                    if (filterAllowlist) filterAllowlist.checked = false;
                    if (filterDenylist) filterDenylist.checked = false;
                } else {
                    if (filterStandard) filterStandard.checked = false;
                    if (filterAllowed) filterAllowed.checked = true;
                    if (filterBlocked) filterBlocked.checked = false;
                }
            } else if (e.target === filterAllowlist || e.target === filterDenylist) {
                if (e.target.checked) {
                    if (filterAll) filterAll.checked = false;
                    if (e.target === filterAllowlist && filterAllowed) filterAllowed.checked = false;
                    if (e.target === filterDenylist && filterBlocked) filterBlocked.checked = false;
                }
            } else {
                if (e.target === filterAllowed && filterAllowed.checked && filterAllowlist) {
                    filterAllowlist.checked = false;
                }
                if (e.target === filterBlocked && filterBlocked.checked && filterDenylist) {
                    filterDenylist.checked = false;
                }

                const standardChecked = !!filterStandard?.checked;
                const allowedChecked = !!filterAllowed?.checked;
                const blockedChecked = !!filterBlocked?.checked;
                const allowlistChecked = !!filterAllowlist?.checked;
                const denylistChecked = !!filterDenylist?.checked;

                if (standardChecked && allowedChecked && blockedChecked && !allowlistChecked && !denylistChecked) {
                    if (filterAll) filterAll.checked = true;
                } else {
                    if (filterAll) filterAll.checked = false;
                }
            }

            const anyChecked = Array.from(statusFilterInputs).some(input => input.checked);
            if (!anyChecked && filterAll) {
                filterAll.checked = true;
                if (filterStandard) filterStandard.checked = true;
                if (filterAllowed) filterAllowed.checked = true;
                if (filterBlocked) filterBlocked.checked = true;
            }

            renderLogs();
        });
    });

    // Tools
    document.getElementById('run-audit-btn')?.addEventListener('click', runSecurityAudit);
    document.getElementById('run-debugger-btn')?.addEventListener('click', runIntelligentDebugger);
    document.getElementById('export-audit-btn')?.addEventListener('click', exportAuditReport);
    document.getElementById('export-debugger-btn')?.addEventListener('click', exportDebuggerSnapshot);
    document.getElementById('add-rule-btn')?.addEventListener('click', saveAutomationRule);

    // Alerts Settings
    document.getElementById('alert-save-btn')?.addEventListener('click', saveAlertSettings);
    document.getElementById('alert-test-btn')?.addEventListener('click', sendTestAlert);
    [
        'alert-setting-enabled', 'alert-setting-desktop', 'alert-setting-action-center',
        'alert-trigger-threats', 'alert-trigger-denylist', 'alert-trigger-audit', 'alert-trigger-parental'
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => saveAlertSettings());
    });

    // Data Management
    document.getElementById('launch-full-manager-btn')?.addEventListener('click', () => {
        browser.tabs.create({ url: browser.runtime.getURL('src/viewer.html') });
    });
    document.getElementById('download-logs-btn')?.addEventListener('click', downloadLogsCSV);
    document.getElementById('wipe-logs-btn')?.addEventListener('click', wipeLogs);

    // Theme Engine
    document.getElementById("theme-selector")?.addEventListener('change', async (e) => {
        const id = e.target.value;
        if (id === '__unsaved__') return;
        state.activeThemeId = id;
        state.isThemeUnsaved = false;
        applyTheme(id);
        updateColorPaletteInputs(id);
        populateThemeDropdown();
        await storage.set("activeTheme", id);
    });

    THEME_VARS.forEach(v => {
        const input = document.getElementById(`color-${v}`);
        if (!input) return;
        const onColorChange = (e) => {
            document.body.style.setProperty(`--${v}`, e.target.value);
            setThemeUnsaved(true);
        };
        input.addEventListener('input', onColorChange);
        input.addEventListener('change', onColorChange);
    });

    document.getElementById('save-theme-btn')?.addEventListener('click', saveCustomTheme);
    document.getElementById('delete-theme-btn')?.addEventListener('click', deleteCustomTheme);
    document.getElementById('theme-name-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveCustomTheme();
        }
    });

    // Backup & Restore
    document.getElementById('export-settings-btn')?.addEventListener('click', exportFullConfiguration);
    document.getElementById('import-settings-btn')?.addEventListener('click', () => document.getElementById('import-settings-file').click());
    document.getElementById('import-settings-file')?.addEventListener('change', importFullConfiguration);

    document.getElementById('save-mirror-btn')?.addEventListener('click', saveMirrorMode);
    document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);
    document.getElementById('setting-fetch-profiles')?.addEventListener('click', handleFetchProfilesClick);

    // Header controls
    document.getElementById('popout-ui-btn')?.addEventListener('click', () => {
        const url = browser.runtime.getURL('src/popup.html?mode=popout');
        if (browser.windows?.create) {
            browser.windows.create({
                url,
                type: 'popup',
                width: 380,
                height: 600
            });
        } else if (browser.tabs?.create) {
            browser.tabs.create({ url });
        }
        window.close();
    });

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
            await storage.set(key, value);
            if (id === 'master') {
                const features = document.getElementById('web-gui-features');
                if (features) {
                    features.style.opacity = value ? '1' : '0.5';
                    features.style.pointerEvents = value ? 'all' : 'none';
                }
            }
        });
    });

    document.getElementById('web-gui-forced-theme')?.addEventListener('change', async (e) => {
        await storage.set('webGuiForcedTheme', e.target.value);
    });

    // Logs SSE listener
    browser.runtime.onMessage.addListener((msg) => {
        if (msg.type === "LIVE_LOG") handleLiveLog(msg.log);
        if (msg.type === "PUSH_NOTIFICATION") {
            state.notifications.unshift({ ...msg.payload, timestamp: Date.now() });
            if (state.notifications.length > 50) state.notifications.pop();
            renderNotifications();
        }
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
            } else {
                updateLocalBlocksCache(cat, id, action);
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
                updateLocalBlocksCache(cat, id, action);
            } else {
                alert("Failed to update.");
            }
            btn.disabled = false;
        }
    });
}

/**
 * Synchronizes the in-memory lastBlocksData cache when a setting or list item is toggled.
 * Handles top-level categories as well as sub-resource lists (e.g. privacy/natives, parentalcontrol/services).
 * @param {string} cat - Category path (e.g., 'privacy', 'parentalcontrol/services')
 * @param {string} id - Identifier of the setting or item
 * @param {string} action - 'add' or 'delete'
 */
export function updateLocalBlocksCache(cat, id, action) {
    if (!state.lastBlocksData) return;
    if (cat && cat.includes('/')) {
        const [parentCat, subCat] = cat.split('/');
        if (!state.lastBlocksData[parentCat]) {
            state.lastBlocksData[parentCat] = {};
        }
        if (subCat === 'performance') {
            if (!state.lastBlocksData[parentCat].performance) {
                state.lastBlocksData[parentCat].performance = {};
            }
            state.lastBlocksData[parentCat].performance[id] = (action === 'add');
            state.lastBlocksData[parentCat][id] = (action === 'add');
            if (state.lastBlocksData['settings/performance']) {
                state.lastBlocksData['settings/performance'][id] = (action === 'add');
            }
            return;
        }
        if (!Array.isArray(state.lastBlocksData[parentCat][subCat])) {
            state.lastBlocksData[parentCat][subCat] = [];
        }
        if (action === 'add') {
            if (!state.lastBlocksData[parentCat][subCat].some(item => item.id === id)) {
                state.lastBlocksData[parentCat][subCat].push({ id });
            }
        } else {
            state.lastBlocksData[parentCat][subCat] = state.lastBlocksData[parentCat][subCat].filter(item => item.id !== id);
        }
    } else if (cat) {
        if (!state.lastBlocksData[cat]) {
            state.lastBlocksData[cat] = {};
        }
        state.lastBlocksData[cat][id] = (action === 'add');
    }
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
 * Implements fault-tolerance to ensure one failing service doesn't block others.
 * @async
 */
async function initializeApp() {
    console.log("[Init] Starting fault-tolerant app bootstrap...");
    
    // 1. Settings & Profile Detection (Critical)
    let settings = {};
    try {
        settings = await initSettingsUI();
        console.log("[Init] Settings UI ready.");
    } catch (e) { console.error("[Init] Settings UI failed:", e); }

    let profile = await refreshActiveProfileAndUI();
    if (!profile && settings.activeProfile) {
        state.activeProfile = settings.activeProfile;
        const profStatus = document.getElementById("profile-status");
        if (profStatus) {
            setSafeHTML(profStatus, `
                <span style="display:inline-block; width:8px; height:8px; background:var(--success); border-radius:50%; box-shadow: 0 0 6px var(--success);"></span>
                Profile: ${escapeHTML(settings.activeProfile)}
            `);
        }
    }

    // 2. Services (Fault-Tolerant)
    const services = [
        { name: 'Dynamic Links', fn: updateDynamicLinks },
        { name: 'Sync Lists', fn: () => syncLists() },
        { name: 'Analytics', fn: loadAnalytics },
        { name: 'Toggles', fn: loadToggles },
        { name: 'Native Logs', fn: loadNativeLogs },
        { name: 'Rules', fn: loadRules },
        { name: 'Mirror Mode', fn: initMirrorModeUI }
    ];

    for (const service of services) {
        try {
            console.log(`[Init] Starting service: ${service.name}...`);
            await service.fn();
            console.log(`[Init] Service ${service.name} ready.`);
        } catch (e) {
            console.error(`[Init] Service ${service.name} failed:`, e);
        }
    }

    try { updateDashboardTabInfo(); } catch(e) {}

    window.addEventListener("unload", () => {
        browser.runtime.sendMessage({ type: "STOP_STREAM" });
    });

    // Start Dashboard update interval
    setInterval(() => {
        if (!state.isTabTrackingPaused && state.activeTab === 'dashboard') {
            updateDashboardTabInfo();
        }
    }, 1000);
}

async function initCustomizeUI() {
    const keys = ["webGuiMaster", "webGuiTlds", "webGuiBlocklists", "webGuiLogActions", "webGuiDesc", "webGuiProfileNotes", "webGuiFilter", "webGuiForcedTheme"];
    try {
        const data = await storage.get(keys);
        
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

        const forcedThemeSelect = document.getElementById('web-gui-forced-theme');
        if (forcedThemeSelect) {
            forcedThemeSelect.value = data.webGuiForcedTheme || 'default';
        }

        const masterEnabled = data.webGuiMaster !== false;
        const features = document.getElementById('web-gui-features');
        if (features) {
            features.style.opacity = masterEnabled ? '1' : '0.5';
            features.style.pointerEvents = masterEnabled ? 'all' : 'none';
        }
    } catch (e) { console.error("[Init] Customize UI failed:", e); }
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

    try {
        const res = await browser.runtime.sendMessage({ type: "GET_PROFILES_LIST" });
        const mirrorProfiles = await storage.get("mirrorProfiles", []);

        if (res?.success && Array.isArray(res.data)) {
            list.textContent = '';
            res.data.forEach(p => {
                if (p.id === state.activeProfile) return;
                const label = document.createElement('label');
                label.className = 'checkbox-label';
                label.style.display = 'block';
                label.style.marginBottom = '6px';
                const isChecked = Array.isArray(mirrorProfiles) && mirrorProfiles.includes(p.id);
                setSafeHTML(label, `<input type="checkbox" data-id="${p.id}" ${isChecked ? 'checked' : ''}> ${escapeHTML(p.name)}`);
                list.appendChild(label);
            });
        }
    } catch (e) { console.error("[Init] Mirror Mode UI failed:", e); }
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
    await storage.set("mirrorProfiles", selected);
    saveBtn.textContent = "✅ Saved!";
    setTimeout(() => { saveBtn.textContent = "💾 Save Mirror Config"; }, 2000);
}

/**
 * Loads available profiles from the NextDNS API and populates the Profile Override dropdown.
 * @async
 * @param {string|null} [customApiKey=null] - Optional API key to use for fetching.
 * @returns {Promise<Array>} List of profiles.
 */
export async function loadProfiles(customApiKey = null) {
    const profileSelect = document.getElementById('setting-profile-select');
    if (!profileSelect) return [];

    try {
        const apiKey = customApiKey !== null 
            ? customApiKey 
            : (document.getElementById('setting-api-key')?.value.trim() || '');
            
        const res = await browser.runtime.sendMessage({ 
            type: "GET_PROFILES_LIST",
            apiKey: apiKey || undefined
        });

        const storedSync = await storage.get(["activeProfile", "detectedProfileId", "activeProfileName"], {});
        const currentSelected = profileSelect.value !== undefined && profileSelect.value !== '' 
            ? profileSelect.value 
            : (storedSync.activeProfile || '');

        setSafeHTML(profileSelect, '<option value="">⚡ Auto-Detect (Default)</option>');

        if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
            res.data.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name} (${p.id})`;
                profileSelect.appendChild(opt);
            });
            profileSelect.value = currentSelected;
            return res.data;
        }
        return [];
    } catch (e) {
        console.error("[Init] loadProfiles failed:", e);
        return [];
    }
}

/**
 * Handles clicks on the fetch profiles 🔄 button.
 * @async
 * @param {Event} [e] - Click event.
 */
export async function handleFetchProfilesClick(e) {
    if (e) e.preventDefault();
    const btn = document.getElementById('setting-fetch-profiles');
    if (btn) btn.classList.add('spinning');
    const key = document.getElementById('setting-api-key')?.value.trim();
    const list = await loadProfiles(key);
    if (btn) setTimeout(() => btn.classList.remove('spinning'), 500);
}

/**
 * Re-detects the active profile and refreshes the Overview page UI status and dashboard services.
 * @async
 * @returns {Promise<Object|null>} The detected profile.
 */
export async function refreshActiveProfileAndUI() {
    const profStatus = document.getElementById("profile-status");
    if (profStatus) {
        setSafeHTML(profStatus, `
            <span style="display:inline-block; width:8px; height:8px; background:var(--accent); border-radius:50%; box-shadow: 0 0 6px var(--accent);"></span>
            Profile: Detecting...
        `);
    }

    try {
        const profile = await browser.runtime.sendMessage({ type: "GET_PROFILE" }).catch(() => null);
        if (profile && profile.id) {
            state.activeProfile = profile.id;
            if (profStatus) {
                const html = `
                    <span style="display:inline-block; width:8px; height:8px; background:var(--success); border-radius:50%; box-shadow: 0 0 6px var(--success);"></span>
                    Profile: ${escapeHTML(profile.name)}
                `;
                setSafeHTML(profStatus, html);
            }
            browser.runtime.sendMessage({ type: "START_STREAM", profileId: state.activeProfile });
            updateDynamicLinks();
            syncLists();
            loadAnalytics();
            loadToggles();
            return profile;
        } else {
            if (profStatus) {
                setSafeHTML(profStatus, `<span style="display:inline-block; width:8px; height:8px; background:var(--danger); border-radius:50%;"></span> Profile: Not Detected`);
            }
            return null;
        }
    } catch (e) {
        console.error("[RefreshProfile] Failed:", e);
        return null;
    }
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
    try {
        const data = await storage.get(keys);

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

        // Load profiles into dropdown
        if (profileSelect) {
            await loadProfiles(data.apiKey);
            profileSelect.value = data.activeProfile || '';
        }

        // Live fetch on API key input (debounced)
        if (apiKeyInput && !apiKeyInput.dataset.bound) {
            apiKeyInput.dataset.bound = "true";
            let debounceTimer;
            apiKeyInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    const val = apiKeyInput.value.trim();
                    if (val.length >= 20) {
                        await loadProfiles(val);
                    }
                }, 400);
            });
        }

        await loadAlertSettings();

        return data;
    } catch (e) { 
        console.error("[Init] Settings UI core failed:", e); 
        return {};
    }
}

/**
 * Saves the current settings from the UI to sync storage.
 * @async
 */
async function saveSettings() {
    const saveBtn = document.getElementById('save-settings-btn');
    if (!saveBtn) return;

    const apiKey = document.getElementById('setting-api-key')?.value.trim() || '';
    const activeProfile = document.getElementById('setting-profile-select')?.value || '';
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

    saveBtn.textContent = "⏳ Saving...";
    saveBtn.disabled = true;

    await storage.set(newSettings);

    // Refresh profile detection and reload profiles
    await loadProfiles(apiKey);
    await refreshActiveProfileAndUI();

    saveBtn.textContent = "✅ Saved!";
    saveBtn.disabled = false;
    setTimeout(() => { 
        saveBtn.textContent = "💾 Save Options"; 
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
        btn.classList.add("btn-secondary"); 
        btn.classList.remove("btn-dark"); 
        btn.textContent = "⏸️ Auto";
        loadNativeLogs();
        const autoRefreshTime = await storage.get("autoRefreshTime", 5);
        state.autoRefreshInterval = setInterval(loadNativeLogs, (parseInt(autoRefreshTime) || 5) * 1000);
    } else { 
        btn.classList.add("btn-dark"); 
        btn.classList.remove("btn-secondary"); 
        btn.textContent = "▶️ Auto"; 
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

/**
 * Loads Alert Settings from storage and populates the Alerts sub-tab form.
 * @async
 */
export async function loadAlertSettings() {
    try {
        const alertSettings = await storage.get("alertSettings");
        const legacyBlock = await storage.get("enableBlockNotifications");
        const settings = alertSettings || {
            enabled: true,
            desktop: !!legacyBlock,
            actionCenter: true,
            triggerThreats: true,
            triggerDenylist: true,
            triggerAudit: true,
            triggerParental: false
        };

        const enabledInput = document.getElementById('alert-setting-enabled');
        const desktopInput = document.getElementById('alert-setting-desktop');
        const actionCenterInput = document.getElementById('alert-setting-action-center');
        const threatsInput = document.getElementById('alert-trigger-threats');
        const denylistInput = document.getElementById('alert-trigger-denylist');
        const auditInput = document.getElementById('alert-trigger-audit');
        const parentalInput = document.getElementById('alert-trigger-parental');

        if (enabledInput) enabledInput.checked = settings.enabled !== false;
        if (desktopInput) desktopInput.checked = !!settings.desktop;
        if (actionCenterInput) actionCenterInput.checked = settings.actionCenter !== false;
        if (threatsInput) threatsInput.checked = settings.triggerThreats !== false;
        if (denylistInput) denylistInput.checked = settings.triggerDenylist !== false;
        if (auditInput) auditInput.checked = settings.triggerAudit !== false;
        if (parentalInput) parentalInput.checked = !!settings.triggerParental;
    } catch (e) {
        console.error("[Alerts] Failed to load alert settings:", e);
    }
}

/**
 * Saves current Alert Settings from the UI to storage.
 * @async
 */
export async function saveAlertSettings() {
    const saveBtn = document.getElementById('alert-save-btn');
    const settings = {
        enabled: document.getElementById('alert-setting-enabled')?.checked ?? true,
        desktop: document.getElementById('alert-setting-desktop')?.checked ?? false,
        actionCenter: document.getElementById('alert-setting-action-center')?.checked ?? true,
        triggerThreats: document.getElementById('alert-trigger-threats')?.checked ?? true,
        triggerDenylist: document.getElementById('alert-trigger-denylist')?.checked ?? true,
        triggerAudit: document.getElementById('alert-trigger-audit')?.checked ?? true,
        triggerParental: document.getElementById('alert-trigger-parental')?.checked ?? false
    };

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "⏳ Saving...";
    }

    try {
        await storage.set({ 
            alertSettings: settings,
            enableBlockNotifications: settings.desktop,
            blockNotif: settings.desktop
        });

        const blockNotifCheck = document.getElementById('setting-block-notif');
        if (blockNotifCheck) blockNotifCheck.checked = settings.desktop;

        if (saveBtn) {
            saveBtn.textContent = "✅ Saved!";
            setTimeout(() => {
                saveBtn.textContent = "💾 Save Alert Options";
                saveBtn.disabled = false;
            }, 1200);
        }
    } catch (e) {
        console.error("[Alerts] Failed to save alert settings:", e);
        if (saveBtn) {
            saveBtn.textContent = "❌ Error";
            saveBtn.disabled = false;
        }
    }
}

/**
 * Sends a test alert through the Action Center and desktop notification system.
 * @async
 */
export async function sendTestAlert() {
    const btn = document.getElementById('alert-test-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending...";
    }
    try {
        await browser.runtime.sendMessage({
            type: "PUSH_NOTIFICATION",
            payload: {
                type: "security",
                severity: "high",
                message: "Test Alert: NextDNS Forge alerting is active and configured."
            }
        });
        if (btn) {
            btn.textContent = "✅ Sent!";
            setTimeout(() => {
                btn.textContent = "📢 Send Test Alert";
                btn.disabled = false;
            }, 1200);
        }
    } catch (e) {
        console.error("[Alerts] Failed to send test alert:", e);
        if (btn) {
            btn.textContent = "❌ Failed";
            btn.disabled = false;
        }
    }
}
