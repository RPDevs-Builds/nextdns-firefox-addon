/**
 * DNS Forge - Main Popup Entry Point (ES Module)
 * This module orchestrates the initialization and event management for the extension popup.
 * It coordinates theme management, tab navigation, and service initialization.
 * 
 * @module ui/main
 * @see {@link https://dns-forge.github.io/reference/ui/main/|Wiki Reference}
 */

import { state, isPopoutMode, isSidebarMode, isTabMode, PRESET_THEMES, THEME_VARS, DEFAULT_THEME_COLORS, urlParams } from './state.js';
import { setActiveTab, setSafeHTML, escapeHTML, downloadAsFile, showToast, renderEmptyStateHTML } from './utils.js';
import { handleLiveLog, renderLogs, loadAnalytics, updateDashboardTabInfo, updateDynamicLinks, loadNativeLogs, downloadLogsCSV, wipeLogs, initTabLogEvents, initBuiltinLogsEvents } from './dashboard.js';
import { loadToggles, syncLists, renderLists } from './blocks.js';
import { runIntelligentDebugger, exportDebuggerSnapshot, runNetworkDiagnosticsUI, exportDiagnosticReport } from './tools.js';
import { loadRules, saveAutomationRule } from './scheduler.js';
import { renderNotifications, initNotifications } from './notifications.js';
import { storage } from '../storage.js';
import { mapConcurrent } from '../apiClient.js';
import {
    normalizeHexColor,
    getThemeColors,
    getThemeDisplayName,
    updateColorPaletteInputs,
    updateDeleteThemeBtnVisibility,
    updateUnsavedBadge,
    setThemeUnsaved,
    applyTheme,
    populateThemeDropdown,
    initThemeEngine,
    initViewerTheme,
    saveCustomTheme,
    deleteCustomTheme
} from './theme.js';

export {
    normalizeHexColor,
    getThemeColors,
    getThemeDisplayName,
    updateColorPaletteInputs,
    updateDeleteThemeBtnVisibility,
    updateUnsavedBadge,
    setThemeUnsaved,
    applyTheme,
    populateThemeDropdown,
    initThemeEngine,
    initViewerTheme,
    saveCustomTheme,
    deleteCustomTheme
};


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
                    <button id="retry-bootstrap-btn" class="btn-secondary" style="width: 100%;">🔄 Retry Popup</button>
                </div>
            `);
            const retryBtn = dashContainer.querySelector("#retry-bootstrap-btn");
            if (retryBtn) retryBtn.addEventListener("click", () => location.reload());
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
export async function handleDashboardDomain(listType, action, isTemp = false) {
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
            showToast(`Successfully ${isTemp ? 'temporarily allowed' : (action === 'add' ? 'added' : 'removed')} ${domain}`, 'success');
            await syncLists(true);
            updateDashboardTabInfo();
        } else {
            showToast(`Failed to update ${domain}: ${res.error || 'Unknown error'}`, 'error');
        }
    } catch (e) {
        showToast("Communication error with background script.", 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Handles adding a single domain to the selected list.
 * @async
 */
export async function handleAddDomain() {
    const input = document.getElementById('list-new-domain');
    const domain = input?.value.trim();
    if (!domain) return;

    const listType = document.getElementById('list-type-select').value;
    const btn = document.getElementById('list-add-btn');
    if (btn) btn.disabled = true;

    try {
        const res = await browser.runtime.sendMessage({
            type: "MANAGE_DOMAIN",
            profileId: state.activeProfile,
            listType,
            domain,
            action: "add"
        });

        if (res?.success) {
            input.value = '';
            showToast(`Added ${domain} to ${listType}`, 'success');
            await syncLists(true);
        } else {
            showToast(`Failed to add domain: ${res?.error || "Unknown error"}`, 'error');
        }
    } catch (e) {
        showToast(`Failed to add domain: ${e?.message || "Communication error"}`, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Handles bulk adding multiple domains to the selected list.
 * @async
 */
export async function handleBulkAdd() {
    const textarea = document.getElementById('list-bulk-domains');
    const domains = textarea?.value.split('\n').map(d => d.trim()).filter(d => d.length > 0);
    if (domains.length === 0) return;

    const listType = document.getElementById('list-type-select').value;
    const btn = document.getElementById('list-bulk-submit-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Adding...";
    }

    try {
        const results = await mapConcurrent(domains, 4, async (domain) => {
            const res = await browser.runtime.sendMessage({
                type: "MANAGE_DOMAIN",
                profileId: state.activeProfile,
                listType,
                domain,
                action: "add"
            });
            return !!res?.success;
        });

        const successCount = results.filter(Boolean).length;
        showToast(`Successfully added ${successCount} of ${domains.length} domains.`, 'success');
        textarea.value = '';
        document.getElementById('list-bulk-container')?.classList.add('hidden');
        await syncLists(true);
    } catch (e) {
        showToast(`Bulk add error: ${e?.message || "Communication error"}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Bulk Add";
        }
    }
}

/**
 * Detects and applies CSS classes based on the current window mode (Popout vs Sidebar).
 * Adjusts html and body classes to enable mode-specific styling.
 */
export function initWindowMode() {
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
export async function handleIconClickModeRedirect() {
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
            try {
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
            } catch (sidebarErr) {
                console.warn("[DNS Forge] Could not open sidebar from popup context, displaying dropdown instead:", sidebarErr);
                return false;
            }
        }
    } catch (e) {
        console.warn("[DNS Forge] Error checking iconClickAction mode redirect:", e);
    }
    return false;
}

// Theme management functions are imported and re-exported from ./theme.js


/**
 * Binds global event listeners for UI interactions.
 * Covers tab switching, dashboard actions, tool triggers, and background message listeners.
 */
export function initGlobalEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            const tabId = btn.dataset.tab;
            if (state.activeTab === 'logs' && tabId !== 'logs' && state.autoRefreshInterval) {
                clearInterval(state.autoRefreshInterval);
                state.autoRefreshInterval = null;
                state.wasAutoRefreshActive = true;
                const autoBtn = document.getElementById("auto-refresh-btn");
                if (autoBtn) {
                    autoBtn.classList.remove("btn-secondary");
                    autoBtn.classList.add("btn-dark");
                    autoBtn.textContent = "▶️ Auto";
                }
            } else if (tabId === 'logs' && state.wasAutoRefreshActive && !state.autoRefreshInterval) {
                state.wasAutoRefreshActive = false;
                toggleAutoRefresh(true);
            }

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

    // Tab keyboard navigation (WAI-ARIA pattern)
    const tabBar = document.querySelector('.tab-bar');
    if (tabBar) {
        tabBar.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const tabs = Array.from(tabBar.querySelectorAll('.tab-btn:not(.hidden)'));
                const currentIndex = tabs.findIndex(t => t.dataset.tab === state.activeTab);
                if (currentIndex === -1) return;
                
                let nextIndex = e.key === 'ArrowRight' ? currentIndex + 1 : currentIndex - 1;
                if (nextIndex >= tabs.length) nextIndex = 0;
                if (nextIndex < 0) nextIndex = tabs.length - 1;
                
                tabs[nextIndex].focus();
                tabs[nextIndex].click();
            }
        });
    }

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

    document.getElementById("clear-tab-log-btn")?.addEventListener('click', async () => {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id !== undefined) {
            await browser.runtime.sendMessage({ type: "CLEAR_TAB_STATS", tabId: tab.id });
            await updateDashboardTabInfo();
        }
    });

    initTabLogEvents();
    initBuiltinLogsEvents();

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
    document.getElementById('run-debugger-btn')?.addEventListener('click', runIntelligentDebugger);
    document.getElementById('export-debugger-btn')?.addEventListener('click', exportDebuggerSnapshot);
    document.getElementById('run-diagnostics-btn')?.addEventListener('click', runNetworkDiagnosticsUI);
    document.getElementById('export-diagnostics-btn')?.addEventListener('click', exportDiagnosticReport);
    document.getElementById('add-rule-btn')?.addEventListener('click', saveAutomationRule);

    // Alerts Settings
    document.getElementById('alert-save-btn')?.addEventListener('click', saveAlertSettings);
    document.getElementById('alert-test-btn')?.addEventListener('click', sendTestAlert);
    [
        'alert-setting-enabled', 'alert-setting-desktop', 'alert-setting-action-center',
        'alert-trigger-threats', 'alert-trigger-denylist', 'alert-trigger-parental'
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => saveAlertSettings());
    });

    // Data Management
    document.getElementById('launch-full-manager-btn')?.addEventListener('click', () => {
        const url = state.activeProfile 
            ? browser.runtime.getURL(`src/viewer.html?profile=${encodeURIComponent(state.activeProfile)}`)
            : browser.runtime.getURL('src/viewer.html');
        browser.tabs.create({ url });
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
    document.getElementById('sidebar-ui-btn')?.addEventListener('click', async () => {
        try {
            if (browser.sidebarAction?.open) {
                await browser.sidebarAction.open();
                window.close();
            } else if (browser.tabs?.create) {
                browser.tabs.create({ url: browser.runtime.getURL('src/popup.html?mode=tab') });
                window.close();
            }
        } catch (e) {
            console.warn("[DNS Forge] Failed to open sidebar from button:", e);
        }
    });

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
            e.target.disabled = true;
            try {
                const targetProfile = state.activeProfile || (await storage.get('activeProfile')) || (await storage.get('overrideProfileId'));
                if (targetProfile && !state.activeProfile) {
                    state.activeProfile = targetProfile;
                }
                const res = await browser.runtime.sendMessage({
                    type: "TOGGLE_SETTING",
                    profileId: targetProfile,
                    category: cat,
                    id,
                    action,
                    settingType: type
                });
                if (!res || !res.success) {
                    e.target.checked = !e.target.checked;
                    showToast(`Failed to update setting: ${res?.error || 'Unknown error'}`, 'error');
                } else {
                    updateLocalBlocksCache(cat, id, action);
                }
            } catch (err) {
                e.target.checked = !e.target.checked;
                showToast("Failed to update setting: " + (err.message || err), 'error');
            } finally {
                e.target.disabled = false;
            }
        }
    });

    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('api-toggle-btn')) {
            const btn = e.target;
            const { cat, id, type, active } = btn.dataset;
            const action = active === 'true' ? 'delete' : 'add';
            
            btn.disabled = true;
            try {
                const targetProfile = state.activeProfile || (await storage.get('activeProfile')) || (await storage.get('overrideProfileId'));
                if (targetProfile && !state.activeProfile) {
                    state.activeProfile = targetProfile;
                }
                const res = await browser.runtime.sendMessage({
                    type: "TOGGLE_SETTING",
                    profileId: targetProfile,
                    category: cat,
                    id,
                    action,
                    settingType: type
                });

                if (res && res.success) {
                    btn.dataset.active = (action === 'add').toString();
                    btn.textContent = action === 'add' ? 'Remove' : 'Add';
                    btn.classList.toggle('btn-allow', action === 'delete');
                    btn.classList.toggle('btn-deny', action === 'add');
                    updateLocalBlocksCache(cat, id, action);
                } else {
                    showToast(`Failed to update: ${res?.error || 'Unknown error'}`, 'error');
                }
            } catch (err) {
                showToast("Failed to update: " + (err.message || err), 'error');
            } finally {
                btn.disabled = false;
            }
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
    if (!state.lastBlocksData) {
        state.lastBlocksData = {};
    }
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
export function initTabNavigation() {
    const initialTab = urlParams.get('tab') || 'dashboard';
    setActiveTab(initialTab);
}

/**
 * Primary application bootstrap logic.
 * Fetches the active profile, starts the log stream, and initializes all sub-modules.
 * Implements fault-tolerance to ensure one failing service doesn't block others.
 * @async
 */
export async function initializeApp() {
    console.log("[Init] Starting fault-tolerant app bootstrap...");
    
    // Load device hostname aliases and listen for dynamic updates
    try {
        state.hostnameAliases = (await storage.get("hostnameAliases")) || {};
    } catch (e) {
        console.warn("[Init] Failed to load hostnameAliases:", e);
    }

    if (typeof browser !== 'undefined' && browser.storage?.onChanged && !window._hasAliasStorageListener) {
        window._hasAliasStorageListener = true;
        browser.storage.onChanged.addListener((changes) => {
            if (changes.hostnameAliases) {
                state.hostnameAliases = changes.hostnameAliases.newValue || {};
                if (state.activeTab === 'logs') {
                    renderLogs();
                }
            }
        });
    }

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

    const cleanup = () => {
        if (state.tabTrackingIntervalId) {
            clearInterval(state.tabTrackingIntervalId);
            state.tabTrackingIntervalId = null;
        }
        if (state.autoRefreshInterval) {
            clearInterval(state.autoRefreshInterval);
            state.autoRefreshInterval = null;
        }
        browser.runtime.sendMessage({ type: "STOP_STREAM" }).catch(() => {});
    };

    window.addEventListener("pagehide", cleanup);
    window.addEventListener("unload", cleanup);

    // Start Dashboard update interval
    if (state.tabTrackingIntervalId) {
        clearInterval(state.tabTrackingIntervalId);
    }
    state.tabTrackingIntervalId = setInterval(() => {
        if (!state.isTabTrackingPaused && state.activeTab === 'dashboard') {
            updateDashboardTabInfo();
        }
    }, 1000);
}

export async function initCustomizeUI() {
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
export async function initMirrorModeUI() {
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
                setSafeHTML(label, `<input type="checkbox" data-id="${escapeHTML(p.id)}" ${isChecked ? 'checked' : ''}> ${escapeHTML(p.name)}`);
                list.appendChild(label);
            });
        }
    } catch (e) { console.error("[Init] Mirror Mode UI failed:", e); }
}

/**
 * Saves the selected mirror profiles to sync storage.
 * @async
 */
export async function saveMirrorMode() {
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
        const provider = document.getElementById('setting-provider-select')?.value || (await storage.get('dnsProvider', 'nextdns'));
        let apiKey = customApiKey;
        if (apiKey === null) {
            if (provider === 'pihole') {
                apiKey = document.getElementById('setting-pihole-api-key')?.value.trim() || '';
            } else if (provider === 'controld') {
                apiKey = document.getElementById('setting-controld-api-key')?.value.trim() || '';
            } else if (provider === 'adguard') {
                apiKey = document.getElementById('setting-adguard-api-key')?.value.trim() || '';
            } else {
                apiKey = document.getElementById('setting-api-key')?.value.trim() || '';
            }
        }
            
        const res = await browser.runtime.sendMessage({ 
            type: "GET_PROFILES_LIST",
            apiKey: apiKey || undefined
        });

        const storedSync = await storage.get(["activeProfile", "detectedProfileId", "activeProfileName", "overrideProfileId"], {});
        const currentSelected = profileSelect.value !== undefined && profileSelect.value !== '' 
            ? profileSelect.value 
            : ((storedSync.overrideProfileId && storedSync.overrideProfileId !== 'auto') ? storedSync.overrideProfileId : '');

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
    const provider = document.getElementById('setting-provider-select')?.value || 'nextdns';
    const key = provider === 'pihole'
        ? (document.getElementById('setting-pihole-api-key')?.value.trim() || null)
        : (provider === 'controld'
            ? (document.getElementById('setting-controld-api-key')?.value.trim() || null)
            : (provider === 'adguard'
                ? (document.getElementById('setting-adguard-api-key')?.value.trim() || null)
                : (document.getElementById('setting-api-key')?.value.trim() || null)));
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
            <span>Profile: Detecting...</span>
        `);
    }

    try {
        const [profile, netRes] = await Promise.all([
            browser.runtime.sendMessage({ type: "GET_PROFILE" }).catch(() => null),
            browser.runtime.sendMessage({ type: "GET_NETWORK_STATUS" }).catch(() => null)
        ]);
        const netStatus = netRes?.networkStatus || {};

        if (profile && profile.id) {
            state.activeProfile = profile.id;
            if (profStatus) {
                const isConn = Boolean(netStatus.isConnected);
                const dotColor = isConn ? 'var(--success)' : 'var(--warning)';
                const statusBadge = isConn 
                    ? `<span style="font-size: 0.7em; background: rgba(34, 197, 94, 0.15); color: var(--success); border: 1px solid var(--success); padding: 1px 5px; border-radius: 4px; font-weight: 700;" title="DNS queries are actively routed through NextDNS via ${escapeHTML(netStatus.protocol || 'DoH')}">🟢 ${escapeHTML(netStatus.protocol || 'DoH')}${netStatus.popServer ? ` (${escapeHTML(netStatus.popServer)})` : ''}${profile.manual ? ' • Override' : ''}</span>`
                    : (profile.manual 
                        ? `<span style="font-size: 0.7em; background: rgba(243, 156, 18, 0.15); color: var(--warning); border: 1px solid var(--warning); padding: 1px 5px; border-radius: 4px; font-weight: 700;" title="Manual profile override is active, but DNS queries are not currently routing through NextDNS">🟡 Override (DNS Inactive)</span>`
                        : `<span style="font-size: 0.7em; background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid var(--danger); padding: 1px 5px; border-radius: 4px; font-weight: 700;" title="Profile is configured in DNS Forge, but this browser is not currently routing DNS through NextDNS">🔴 DNS Inactive</span>`);

                const html = `
                    <span style="display:inline-block; width:8px; height:8px; background:${dotColor}; border-radius:50%; box-shadow: 0 0 6px ${dotColor};" title="Profile configured and active"></span>
                    <span>Profile: ${escapeHTML(profile.name)}</span>
                    ${statusBadge}
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
                setSafeHTML(profStatus, `
                    <span style="display:inline-block; width:8px; height:8px; background:var(--danger); border-radius:50%;"></span>
                    <span>Profile: Not Detected</span>
                    <span style="font-size: 0.7em; background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid var(--danger); padding: 1px 5px; border-radius: 4px; font-weight: 700;" title="No active NextDNS profile could be detected. Check your API key in Settings.">🔴 Unconfigured / Leaking</span>
                `);
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
export async function initSettingsUI() {
    const keys = [
        "apiKey", "adguardApiKey", "controldApiKey", "piholeApiKey", "piholeUrl", "dnsProvider", "activeProfile", "overrideProfileId", "iconClickAction", 
        "autoRefreshLogs", "enableBlockNotifications", 
        "enableLabs", "syncCredentials", "autoRefreshTime"
    ];
    try {
        const data = await storage.get(keys);

        const apiKeyInput = document.getElementById('setting-api-key');
        const adguardKeyInput = document.getElementById('setting-adguard-api-key');
        const controldKeyInput = document.getElementById('setting-controld-api-key');
        const piholeKeyInput = document.getElementById('setting-pihole-api-key');
        const piholeUrlInput = document.getElementById('setting-pihole-url');
        const providerSelect = document.getElementById('setting-provider-select');
        const nextdnsGroup = document.getElementById('nextdns-credentials-group');
        const adguardGroup = document.getElementById('adguard-credentials-group');
        const controldGroup = document.getElementById('controld-credentials-group');
        const piholeGroup = document.getElementById('pihole-credentials-group');
        const profileSelect = document.getElementById('setting-profile-select');
        const iconActionSelect = document.getElementById('setting-icon-action');
        const autoRefreshCheck = document.getElementById('setting-auto-refresh');
        const blockNotifCheck = document.getElementById('setting-block-notif');
        const enableLabsCheck = document.getElementById('setting-enable-labs');
        const syncCredentialsCheck = document.getElementById('setting-sync-credentials');
        const refreshTimeInput = document.getElementById('setting-refresh-time');

        const currentProvider = data.dnsProvider || 'nextdns';
        if (providerSelect) providerSelect.value = currentProvider;
        if (apiKeyInput) apiKeyInput.value = data.apiKey || '';
        if (adguardKeyInput) adguardKeyInput.value = data.adguardApiKey || '';
        if (controldKeyInput) controldKeyInput.value = data.controldApiKey || '';
        if (piholeKeyInput) piholeKeyInput.value = data.piholeApiKey || '';
        if (piholeUrlInput) piholeUrlInput.value = data.piholeUrl || 'http://pi.hole/admin';
        if (nextdnsGroup) nextdnsGroup.classList.toggle('hidden', currentProvider !== 'nextdns');
        if (adguardGroup) adguardGroup.classList.toggle('hidden', currentProvider !== 'adguard');
        if (controldGroup) controldGroup.classList.toggle('hidden', currentProvider !== 'controld');
        if (piholeGroup) piholeGroup.classList.toggle('hidden', currentProvider !== 'pihole');

        if (providerSelect && !providerSelect.dataset.bound) {
            providerSelect.dataset.bound = "true";
            providerSelect.addEventListener('change', async () => {
                const prov = providerSelect.value;
                if (nextdnsGroup) nextdnsGroup.classList.toggle('hidden', prov !== 'nextdns');
                if (adguardGroup) adguardGroup.classList.toggle('hidden', prov !== 'adguard');
                if (controldGroup) controldGroup.classList.toggle('hidden', prov !== 'controld');
                if (piholeGroup) piholeGroup.classList.toggle('hidden', prov !== 'pihole');
                await storage.set({ dnsProvider: prov });
                await handleFetchProfilesClick();
            });
        }

        if (iconActionSelect) iconActionSelect.value = data.iconClickAction || 'popup';
        if (autoRefreshCheck) autoRefreshCheck.checked = !!data.autoRefreshLogs;
        if (blockNotifCheck) blockNotifCheck.checked = !!data.enableBlockNotifications;
        if (enableLabsCheck) enableLabsCheck.checked = !!data.enableLabs;
        if (syncCredentialsCheck) syncCredentialsCheck.checked = !!data.syncCredentials;
        if (refreshTimeInput) refreshTimeInput.value = data.autoRefreshTime || 5;

        state.lastIconAction = data.iconClickAction || 'popup';

        // Load profiles into dropdown
        if (profileSelect) {
            const activeKey = currentProvider === 'pihole'
                ? data.piholeApiKey
                : (currentProvider === 'controld'
                    ? data.controldApiKey
                    : (currentProvider === 'adguard' ? data.adguardApiKey : data.apiKey));
            await loadProfiles(activeKey);
            profileSelect.value = (data.overrideProfileId && data.overrideProfileId !== 'auto')
                ? data.overrideProfileId
                : '';
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

        if (adguardKeyInput && !adguardKeyInput.dataset.bound) {
            adguardKeyInput.dataset.bound = "true";
            let debounceTimer;
            adguardKeyInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    const val = adguardKeyInput.value.trim();
                    if (val.length >= 20) {
                        await loadProfiles(val);
                    }
                }, 400);
            });
        }

        if (controldKeyInput && !controldKeyInput.dataset.bound) {
            controldKeyInput.dataset.bound = "true";
            let debounceTimer;
            controldKeyInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    const val = controldKeyInput.value.trim();
                    if (val.length >= 20) {
                        await loadProfiles(val);
                    }
                }, 400);
            });
        }

        if (piholeKeyInput && !piholeKeyInput.dataset.bound) {
            piholeKeyInput.dataset.bound = "true";
            let debounceTimer;
            piholeKeyInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    const val = piholeKeyInput.value.trim();
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
        throw e;
    }
}

/**
 * Saves the current settings from the UI to sync storage.
 * @async
 */
export async function saveSettings() {
    const saveBtn = document.getElementById('save-settings-btn');
    if (!saveBtn) return;

    const dnsProvider = document.getElementById('setting-provider-select')?.value || 'nextdns';
    const apiKey = document.getElementById('setting-api-key')?.value.trim() || '';
    const adguardApiKey = document.getElementById('setting-adguard-api-key')?.value.trim() || '';
    const controldApiKey = document.getElementById('setting-controld-api-key')?.value.trim() || '';
    const piholeApiKey = document.getElementById('setting-pihole-api-key')?.value.trim() || '';
    const piholeUrl = document.getElementById('setting-pihole-url')?.value.trim() || 'http://pi.hole/admin';
    const activeProfile = document.getElementById('setting-profile-select')?.value || '';
    const iconClickAction = document.getElementById('setting-icon-action')?.value;
    const autoRefreshLogs = document.getElementById('setting-auto-refresh')?.checked;
    const enableBlockNotifications = document.getElementById('setting-block-notif')?.checked;
    const enableLabs = document.getElementById('setting-enable-labs')?.checked;
    const syncCredentials = document.getElementById('setting-sync-credentials')?.checked;
    const autoRefreshTime = document.getElementById('setting-refresh-time')?.value;

    const newSettings = {
        dnsProvider,
        apiKey,
        adguardApiKey,
        controldApiKey,
        piholeApiKey,
        piholeUrl,
        activeProfile,
        overrideProfileId: activeProfile ? activeProfile : 'auto',
        iconClickAction,
        autoRefreshLogs,
        enableBlockNotifications,
        enableLabs,
        syncCredentials: !!syncCredentials,
        autoRefreshTime: parseInt(autoRefreshTime) || 5
    };

    saveBtn.textContent = "⏳ Saving...";
    saveBtn.disabled = true;

    await storage.set(newSettings);

    // Refresh profile detection and reload profiles
    const activeKey = dnsProvider === 'pihole'
        ? piholeApiKey
        : (dnsProvider === 'controld'
            ? controldApiKey
            : (dnsProvider === 'adguard' ? adguardApiKey : apiKey));
    await loadProfiles(activeKey);
    await refreshActiveProfileAndUI();

    const hasIconActionChanged = iconClickAction !== state.lastIconAction;
    state.lastIconAction = iconClickAction;

    saveBtn.textContent = "✅ Saved!";
    saveBtn.disabled = false;
    setTimeout(() => { 
        saveBtn.textContent = "💾 Save Options"; 
        if (hasIconActionChanged) {
            browser.runtime.reload();
        }
    }, 1500);
}

/**
 * Toggles the auto-refresh mechanism for native dashboard logs.
 * Sets or clears an interval based on user preference and storage settings.
 * @async
 * @param {boolean} enable - Whether to enable or disable auto-refresh.
 */
export async function toggleAutoRefresh(enable) {
    if (state.autoRefreshInterval) clearInterval(state.autoRefreshInterval);
    state.autoRefreshInterval = null;
    const btn = document.getElementById("auto-refresh-btn");
    if (!btn) return;

    if (enable) {
        btn.classList.add("btn-secondary"); 
        btn.classList.remove("btn-dark"); 
        btn.textContent = "⏸️ Auto";
        await loadNativeLogs();
        const autoRefreshTime = await storage.get("autoRefreshTime", 5);
        state.autoRefreshInterval = setInterval(loadNativeLogs, (parseInt(autoRefreshTime) || 5) * 1000);
    } else { 
        btn.classList.add("btn-dark"); 
        btn.classList.remove("btn-secondary"); 
        btn.textContent = "▶️ Auto"; 
    }
}

export const CREDENTIAL_KEYS = ["apiKey", "adguardApiKey", "controldApiKey", "piholeApiKey", "piholeUrl"];

export const ALLOWED_CONFIG_KEYS = new Set([
    "activeProfile", "detectedProfileId", "overrideProfileId", "provider", "mirrorProfiles",
    "customProfiles", "quickSwitchProfiles", "iconClickAction", "theme", "syncCredentials",
    "showDescriptions", "autoRefreshLogs", "logDisplayLimit", "blockNotif", "disableNotifications",
    "disableAnimation", "advancedMode", "compactView", "logFilters", "alertSettings",
    "scheduleSettings", "hostnameAliases", "savedPresets", "linkedIpSettings",
    "webGuiMaster", "webGuiDesc", "webGuiNotes", "webGuiTlds", "webGuiBlocklists",
    "webGuiLogs", "webGuiFilter", "webGuiSort", "allowlistNotes", "denylistNotes",
    "parentalToggles", "apiKey", "adguardApiKey", "controldApiKey", "piholeApiKey", "piholeUrl",
    "activeTheme", "customThemes", "autoRefreshTime", "enableBlockNotifications",
    "cachedAllowlist", "cachedDenylist", "profileSnapshots", "notifications", "scrapedMeta", "localLogs"
]);

export function filterOutCredentials(data) {
    if (!data || typeof data !== 'object') return {};
    const filtered = { ...data };
    for (const key of CREDENTIAL_KEYS) {
        delete filtered[key];
    }
    return filtered;
}

export function sanitizeImportedData(data) {
    if (!data || typeof data !== 'object') return {};
    const sanitized = {};
    for (const [k, v] of Object.entries(data)) {
        if (ALLOWED_CONFIG_KEYS.has(k) && !k.startsWith('__proto__') && k !== 'prototype' && k !== 'constructor') {
            sanitized[k] = v;
        }
    }
    return sanitized;
}

/**
 * Exports the entire extension configuration (sync and local storage) as a JSON file.
 * Automatically filters out sensitive API keys and provider tokens by default.
 * @async
 * @param {boolean} [includeCredentials=false] - Whether to include sensitive API keys.
 */
export async function exportFullConfiguration(includeCredentials = false) {
    const rawSync = await browser.storage.sync.get(null);
    const rawLocal = await browser.storage.local.get(null);
    const syncData = includeCredentials ? rawSync : filterOutCredentials(rawSync);
    const localData = includeCredentials ? rawLocal : filterOutCredentials(rawLocal);
    const payload = JSON.stringify({
        type: "DNS_FORGE_BACKUP",
        version: browser.runtime.getManifest().version,
        timestamp: new Date().toISOString(),
        sync: syncData,
        local: localData
    }, null, 2);
    downloadAsFile(`dns_forge_backup_${Date.now()}.json`, payload);
}

/**
 * Imports an extension configuration from a JSON file.
 * Validates the file structure and whitelists allowed configuration keys before applying.
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
            if (!config || config.type !== "DNS_FORGE_BACKUP") {
                throw new Error("Invalid backup file format.");
            }

            if (confirm("This will overwrite your current settings. Continue?")) {
                if (config.sync && typeof config.sync === 'object') {
                    const sanitizedSync = sanitizeImportedData(config.sync);
                    await browser.storage.sync.set(sanitizedSync);
                }
                if (config.local && typeof config.local === 'object') {
                    const sanitizedLocal = sanitizeImportedData(config.local);
                    await browser.storage.local.set(sanitizedLocal);
                }
                showToast("Settings restored successfully! Reloading...", 'success');
                setTimeout(() => browser.runtime.reload(), 800);
            }
        } catch (err) {
            showToast("Error importing settings: " + err.message, 'error');
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
            triggerParental: false
        };

        const enabledInput = document.getElementById('alert-setting-enabled');
        const desktopInput = document.getElementById('alert-setting-desktop');
        const actionCenterInput = document.getElementById('alert-setting-action-center');
        const threatsInput = document.getElementById('alert-trigger-threats');
        const denylistInput = document.getElementById('alert-trigger-denylist');
        const parentalInput = document.getElementById('alert-trigger-parental');

        if (enabledInput) enabledInput.checked = settings.enabled !== false;
        if (desktopInput) desktopInput.checked = !!settings.desktop;
        if (actionCenterInput) actionCenterInput.checked = settings.actionCenter !== false;
        if (threatsInput) threatsInput.checked = settings.triggerThreats !== false;
        if (denylistInput) denylistInput.checked = settings.triggerDenylist !== false;
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
