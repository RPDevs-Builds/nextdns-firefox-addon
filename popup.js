/**
 * DNS Forge - popup.js
 * Main UI logic for the Firefox NextDNS extension.
 * 
 * Performance & Security Refactor - June 2026
 */

// --- Global State ---
let activeProfile = null;               // Currently active NextDNS profile ID
let cachedLogs = [];                    // Array of recent DNS logs from the API
let autoRefreshInterval = null;         // Timer reference for logs auto-refresh
let cachedListItems = [];               // Domain list items (allow/deny) for current tab
let isAutoRefreshDefault = false;       // User preference for auto-refresh
let isTabTrackingPaused = false;        // Toggle for live tab request tracking in Dashboard
let listsSynced = false;                // Local sync state for allow/deny lists
let currentAllowlist = new Set();       // Quick lookup for allowlist
let currentDenylist = new Set();        // Quick lookup for denylist
let hostnameAliases = {};               // Mapping of device IDs to friendly names
let blocksMeta = {                      // Metadata for NextDNS features (scraped or bundled)
    blocklists: [], 
    parental_services: [], 
    tlds: [], 
    categories: [] 
};
let activeBlocksSort = 'popularity';    // Current sorting mode for blocklists
let activeBlocksSubTab = 'security';    // Active category in the Blocks tab
let lastBlocksData = null;              // Cache for full profile settings (security/privacy/etc)

// --- Constants & Configuration ---
const urlParams = new URLSearchParams(window.location.search);
const isPopoutMode = urlParams.get('mode') === 'popout';
const isSidebarMode = urlParams.get('mode') === 'sidebar';
let isPinnedOnTop = false;

// Predefined Themes for the Theme Engine
const PRESET_THEMES = {
    "OLED Black": { "--bg-main": "#000000", "--bg-panel": "#0a0a0a", "--border-color": "#1a1a1a", "--hover-bg": "#111111", "--text-main": "#ffffff", "--text-muted": "#888888" },
    "Dracula": { "--bg-main": "#282a36", "--bg-panel": "#44475a", "--border-color": "#6272a4", "--hover-bg": "#50fa7b20", "--text-main": "#f8f8f2", "--text-muted": "#bfbfbf" },
    "Nord": { "--bg-main": "#2e3440", "--bg-panel": "#3b4252", "--border-color": "#4c566a", "--hover-bg": "#434c5e", "--text-main": "#eceff4", "--text-muted": "#d8dee9" },
    "Solarized Dark": { "--bg-main": "#002b36", "--bg-panel": "#073642", "--border-color": "#586e75", "--hover-bg": "#073642", "--text-main": "#eee8d5", "--text-muted": "#839496" },
    "Gruvbox": { "--bg-main": "#282828", "--bg-panel": "#3c3836", "--border-color": "#504945", "--hover-bg": "#504945", "--text-main": "#ebdbb2", "--text-muted": "#a89984" }
};

const THEME_VARS = ['bg-main', 'bg-panel', 'border-color', 'text-main', 'text-muted', 'hover-bg'];
let savedThemes = {};
let activeThemeId = 'default-dark';

// SECURITY: Robust HTML escaping to prevent XSS
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

/**
 * Main Entry Point
 */
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initial UI Mode Setup (Sidebar, Popout, or standard Popup)
    initWindowMode();

    // 2. Initialize Theme Engine
    await initThemeEngine();

    // 3. Set up Global Event Delegation
    initGlobalEventListeners();

    // 4. Set up Tab Navigation
    initTabNavigation();

    // 5. Initialize Extension Logic
    await initializeApp();
});

/**
 * Phase 2: Modularized Initialization Functions
 */

function initWindowMode() {
    if (isPopoutMode) document.body.classList.add('mode-popout');
    if (isSidebarMode) document.body.classList.add('mode-sidebar');
    
    // Sidebar specific UI adjustments
    if (isSidebarMode) {
        document.body.classList.add('sidebar-mode');
    }
}

async function initThemeEngine() {
    const sync = await browser.storage.sync.get(["activeTheme", "customThemes", "uiTheme"]);
    const local = await browser.storage.local.get(["activeTheme", "customThemes", "uiTheme"]);
    const prefs = { ...local, ...sync };
    
    savedThemes = prefs.customThemes || {};
    activeThemeId = prefs.activeTheme || (prefs.uiTheme === 'light' ? 'default-light' : 'default-dark');
    
    applyTheme(activeThemeId);
    populateThemeDropdown();

    // Bind theme-related UI buttons
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.onclick = () => applyAndSaveTheme(activeThemeId === 'default-light' ? 'default-dark' : 'default-light');
    
    const themeSelector = document.getElementById("theme-selector");
    const deleteThemeBtn = document.getElementById("delete-theme-btn");
    
    if (themeSelector) {
        themeSelector.onchange = (e) => {
            const id = e.target.value;
            if (deleteThemeBtn) deleteThemeBtn.style.display = savedThemes[id] ? 'block' : 'none';
            applyAndSaveTheme(id);
        };
    }
    
    if (deleteThemeBtn) {
        deleteThemeBtn.onclick = async () => {
            const id = themeSelector.value;
            if (savedThemes[id] && confirm(`Delete theme "${id}"?`)) {
                delete savedThemes[id];
                await Promise.all([
                    browser.storage.sync.set({ customThemes: savedThemes }),
                    browser.storage.local.set({ customThemes: savedThemes })
                ]);
                applyAndSaveTheme('default-dark');
                populateThemeDropdown();
            }
        };
    }
    
    const saveThemeBtn = document.getElementById("save-theme-btn");
    if (saveThemeBtn) saveThemeBtn.onclick = async () => {
        let tName = document.getElementById("theme-name-input").value.trim() || `Theme ${Object.keys(savedThemes).length + 1}`;
        const cTheme = {};
        THEME_VARS.forEach(v => {
            const p = document.getElementById(`color-${v}`);
            if (p) cTheme[`--${v}`] = p.value;
        });
        savedThemes[tName] = cTheme;
        await Promise.all([
            browser.storage.sync.set({ customThemes: savedThemes }),
            browser.storage.local.set({ customThemes: savedThemes })
        ]);
        await applyAndSaveTheme(tName);
    };
}

/**
 * Centralized Event Delegation for dynamic content
 */
function initGlobalEventListeners() {
    // --- Header Controls ---
    const refreshBtn = document.getElementById('refresh-view-btn');
    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            refreshBtn.style.transform = "rotate(180deg)";
            setTimeout(() => { refreshBtn.style.transform = "none"; }, 300);
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (tab) browser.tabs.reload(tab.id).catch(() => {});
            initializeApp();
        };
    }

    const popoutBtn = document.getElementById('popout-ui-btn');
    if (popoutBtn && !isPopoutMode && !isSidebarMode) {
        popoutBtn.onclick = async () => {
            const currentWin = await browser.windows.getCurrent();
            await browser.windows.create({ 
                url: "popup.html?mode=popout", 
                type: "popup", 
                width: 380, 
                height: 650, 
                left: currentWin.left + currentWin.width - 430, 
                top: currentWin.top + 60 
            });
            window.close();
        };
    }

    const sidebarBtn = document.getElementById('sidebar-ui-btn');
    if (sidebarBtn && !isSidebarMode) {
        sidebarBtn.onclick = () => { 
            browser.sidebarAction.open().catch(() => alert("Use View > Sidebar")); 
            window.close(); 
        };
    }

    // --- Bulk Domain Management ---
    const bulkToggleBtn = document.getElementById("list-bulk-toggle-btn");
    const bulkContainer = document.getElementById("list-bulk-container");
    const bulkCancelBtn = document.getElementById("list-bulk-cancel-btn");
    const bulkSubmitBtn = document.getElementById("list-bulk-submit-btn");
    const bulkTextarea = document.getElementById("list-bulk-domains");

    if (bulkToggleBtn) bulkToggleBtn.onclick = () => { 
        bulkContainer.classList.toggle('hidden');
        if (!bulkContainer.classList.contains('hidden')) bulkContainer.style.display = 'flex';
        else bulkContainer.style.display = 'none';
    };
    if (bulkCancelBtn) bulkCancelBtn.onclick = () => { bulkContainer.classList.add('hidden'); bulkContainer.style.display = 'none'; bulkTextarea.value = ''; };

    if (bulkSubmitBtn) bulkSubmitBtn.onclick = async () => {
        const listTypeSelect = document.getElementById("list-type-select");
        const listType = listTypeSelect ? listTypeSelect.value : 'denylist';
        const domains = bulkTextarea.value.split('\n').map(d => d.trim()).filter(d => d !== '');
        if (domains.length === 0 || !activeProfile) return;

        bulkSubmitBtn.disabled = true;
        bulkSubmitBtn.textContent = `Processing (0/${domains.length})...`;

        for (let i = 0; i < domains.length; i++) {
            await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, domain: domains[i], action: "add" });
            bulkSubmitBtn.textContent = `Processing (${i + 1}/${domains.length})...`;
            // Throttling to prevent API rate limits
            await new Promise(r => setTimeout(r, 400)); 
        }

        bulkTextarea.value = "";
        bulkSubmitBtn.disabled = false;
        bulkSubmitBtn.textContent = "Submit Bulk Add";
        bulkContainer.classList.add('hidden');
        bulkContainer.style.display = 'none';
        syncLists(true); loadManagerList(); 
    };

    // --- Logs Filtering ---
    const autoRefreshBtn = document.getElementById("auto-refresh-btn");
    if (autoRefreshBtn) autoRefreshBtn.onclick = () => toggleAutoRefresh(!autoRefreshInterval);

    const logSearchInput = document.getElementById("log-search");
    if (logSearchInput) logSearchInput.oninput = () => renderLogs();

    const statusFilters = document.getElementById("status-filter-content");
    if (statusFilters) statusFilters.onchange = () => renderLogs();

    const deviceFilter = document.getElementById("log-device-filter");
    if (deviceFilter) deviceFilter.onchange = () => renderLogs();

    const typeFilter = document.getElementById("log-type-filter");
    if (typeFilter) typeFilter.onchange = () => renderLogs();

    // --- List Management ---
    const listTypeSelect = document.getElementById("list-type-select");
    if (listTypeSelect) listTypeSelect.onchange = () => loadManagerList();

    const listSearchInput = document.getElementById("list-search-input");
    if (listSearchInput) listSearchInput.oninput = () => renderManagerList();

    const listAddBtn = document.getElementById("list-add-btn");
    if (listAddBtn) {
        listAddBtn.onclick = async () => {
            const domainInput = document.getElementById("list-new-domain");
            const domain = domainInput?.value.trim();
            const type = listTypeSelect ? listTypeSelect.value : 'denylist';
            if (domain && activeProfile) {
                listAddBtn.disabled = true;
                const res = await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: type, domain, action: "add" });
                listAddBtn.disabled = false;
                if (res?.success) {
                    domainInput.value = "";
                    loadManagerList(true);
                } else {
                    alert("Failed to add domain.");
                }
            }
        };
    }

    // --- Tab Requests Tracking ---
    const tabSyncBtn = document.getElementById('toggle-tab-tracking-btn');
    if (tabSyncBtn) tabSyncBtn.onclick = () => {
        isTabTrackingPaused = !isTabTrackingPaused;
        tabSyncBtn.classList.toggle('btn-secondary', !isTabTrackingPaused);
        tabSyncBtn.classList.toggle('btn-dark', isTabTrackingPaused);
        tabSyncBtn.textContent = isTabTrackingPaused ? '▶️ Paused' : '⏸️ Live';
        if (!isTabTrackingPaused) updateDashboardTabInfo();
    };

    // Listeners for active tab requests
    browser.tabs.onActivated.addListener(() => { if (!isTabTrackingPaused) updateDashboardTabInfo(); });
    browser.tabs.onUpdated.addListener((id, ch, t) => { if (t.active && ch.status === 'complete' && !isTabTrackingPaused) updateDashboardTabInfo(); });

    // --- Generic Click Handler (Delegation) ---
    document.addEventListener('click', async (e) => {
        const target = e.target;
        
        // Log Actions (Allow/Deny from logs)
        if (target.closest('#logs-container')) {
            const btn = target.closest('button');
            if (btn) {
                if (btn.hasAttribute('data-log-action')) {
                    handleLogAction(btn.getAttribute('data-list'), btn.getAttribute('data-domain'), btn.getAttribute('data-log-action'), btn);
                } else if (btn.hasAttribute('data-find')) {
                    findInLists(btn.getAttribute('data-find'));
                }
            }
        }
        
        // List Management (Delete from Deny/Allow list)
        if (target.closest('#list-items-container')) {
            const btn = target.closest('button');
            if (btn && btn.hasAttribute('data-delete')) {
                deleteListItem(btn.getAttribute('data-delete'));
            }
        }
        
        // API Toggles (Security, Privacy, etc.)
        if (target.closest('.api-toggle-btn')) {
            toggleApiSetting(target.closest('.api-toggle-btn'));
        }
        
        // Blocks Sub-nav
        if (target.closest('#blocks-sub-nav .sub-tab-btn')) {
            const btn = target.closest('.sub-tab-btn');
            document.querySelectorAll('#blocks-sub-nav .sub-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeBlocksSubTab = btn.getAttribute('data-sub');
            const searchInput = document.getElementById("blocks-search-input");
            if (searchInput) searchInput.value = "";
            loadToggles();
        }
    });

    // --- Blocks Filtering ---
    const blocksSearchInput = document.getElementById("blocks-search-input");
    if (blocksSearchInput) blocksSearchInput.oninput = () => loadToggles();

    const blocksSortSelect = document.getElementById("blocks-sort-select");
    if (blocksSortSelect) blocksSortSelect.onchange = (e) => {
        activeBlocksSort = e.target.value;
        loadToggles();
    };

    // --- Meta Data Management ---
    const metaRefreshBtn = document.getElementById("meta-refresh-btn");
    if (metaRefreshBtn) metaRefreshBtn.onclick = handleMetaRefresh;
    
    const metaDeleteBtn = document.getElementById("meta-delete-btn");
    if (metaDeleteBtn) metaDeleteBtn.onclick = handleMetaDelete;
    
    const metaSaveBtn = document.getElementById("meta-save-btn");
    if (metaSaveBtn) metaSaveBtn.onclick = handleMetaSave;
    
    const metaLoadBtn = document.getElementById("meta-load-btn");
    const metaFileInput = document.getElementById("meta-file-input");
    if (metaLoadBtn && metaFileInput) {
        metaLoadBtn.onclick = () => metaFileInput.click();
        metaFileInput.onchange = handleMetaLoad;
    }

    // --- Settings Setup Bindings ---
    const fetchProfilesBtn = document.getElementById("setting-fetch-profiles");
    if (fetchProfilesBtn) fetchProfilesBtn.onclick = fetchProfiles;

    const saveSettingsBtn = document.getElementById("save-settings-btn");
    if (saveSettingsBtn) saveSettingsBtn.onclick = saveSettings;

    // --- Dashboard Specific ---
    const snoozeBtn = document.getElementById("snooze-btn");
    if (snoozeBtn) snoozeBtn.onclick = snoozeDashboardDomain;

    const launchManagerBtn = document.getElementById("launch-full-manager-btn");
    if (launchManagerBtn) launchManagerBtn.onclick = () => browser.tabs.create({ url: "viewer.html" });

    const pinBtn = document.getElementById("pin-ui-btn");
    if (pinBtn) {
        // Detect if we are already in a popout window
        const urlParams = new URLSearchParams(window.location.search);
        const isPopout = urlParams.get('popout') === 'true';
        
        if (isPopout) {
            pinBtn.classList.remove('hidden');
            pinBtn.classList.add('btn-allow');
            pinBtn.innerHTML = '📌 Pinned';
            pinBtn.title = "Close Popout";
        } else {
            pinBtn.classList.remove('hidden');
            pinBtn.classList.add('btn-secondary');
            pinBtn.innerHTML = '📍 Pin';
            pinBtn.title = "Pop out into window";
        }

        pinBtn.onclick = async () => {
            if (isPopout) {
                window.close();
            } else {
                const win = await browser.windows.getCurrent();
                await browser.windows.create({
                    url: browser.runtime.getURL("popup.html?popout=true"),
                    type: "popup",
                    width: 400,
                    height: 600,
                    left: win.left + (win.width - 400),
                    top: win.top
                });
                window.close();
            }
        };
    }
}

function initTabNavigation() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            const target = btn.getAttribute('data-tab');
            if (!target) return;
            
            // UI Toggle
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            
            const content = document.getElementById(`tab-${target}`);
            if (content) content.classList.add('active');
            
            // Feature Specific Loading
            if (target === 'logs') { 
                if (isAutoRefreshDefault) toggleAutoRefresh(true); else loadNativeLogs(); 
            } else {
                toggleAutoRefresh(false);
            }
            
            if (target === 'lists') loadManagerList();
            if (target === 'toggles') loadToggles();
            if (target === 'settings') loadSettings();
        };
    });

    // Sub-nav for Settings
    const settingsSubNav = document.getElementById('settings-sub-nav');
    if (settingsSubNav) {
        settingsSubNav.onclick = (e) => {
            const btn = e.target.closest('.sub-tab-btn');
            if (btn) {
                settingsSubNav.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.settings-sub-content').forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
                
                btn.classList.add('active');
                const target = btn.getAttribute('data-sub');
                const content = document.getElementById(`settings-${target}`);
                if (content) { 
                    content.classList.add('active'); 
                    content.style.display = 'block'; 
                }
                
                if (target === 'analytics') loadAnalytics();
            }
        };
    }
}

/**
 * Core Application Logic
 */
async function initializeApp() {
    // Load Core Preferences (Dual-storage fallback)
    const syncPrefs = await browser.storage.sync.get([
        "apiKey", "autoRefreshDefault", "hostnameAliases", "aliases",
        "webGuiMaster", "webGuiTlds", "webGuiBlocklists", "webGuiLogActions", "webGuiDesc", 
        "webGuiProfileNotes", "webGuiFilter"
    ]);
    const localPrefs = await browser.storage.local.get([
        "apiKey", "autoRefreshDefault", "hostnameAliases",
        "webGuiMaster", "webGuiTlds", "webGuiBlocklists", "webGuiLogActions", "webGuiDesc", 
        "webGuiProfileNotes", "webGuiFilter"
    ]);
    
    // Falsy-safe merge: sync takes precedence ONLY if it has a non-empty value
    const prefs = {
        ...localPrefs,
        ...syncPrefs,
        apiKey: syncPrefs.apiKey || localPrefs.apiKey || "",
        autoRefreshDefault: syncPrefs.autoRefreshDefault !== undefined ? syncPrefs.autoRefreshDefault : localPrefs.autoRefreshDefault,
        webGuiMaster: syncPrefs.webGuiMaster !== undefined ? syncPrefs.webGuiMaster : localPrefs.webGuiMaster
    };

    isAutoRefreshDefault = prefs.autoRefreshDefault !== false;
    
    // Migration: Move old 'aliases' key to 'hostnameAliases'
    if (!prefs.hostnameAliases && prefs.aliases) {
        hostnameAliases = prefs.aliases;
        await browser.storage.sync.set({ hostnameAliases: prefs.aliases });
        await browser.storage.sync.remove("aliases");
    } else {
        hostnameAliases = prefs.hostnameAliases || {};
    }
    
    // Load feature metadata (Blocklists, TLDs, etc.)
    await loadAllMetadata();

    // Initialize Web GUI Customization controls
    initWebCustomizationUI(prefs);

    // Profile Setup
    if (!prefs.apiKey) { 
        document.querySelector('.tab-btn[data-tab="settings"]').click(); 
        return; 
    }
    
    const stored = await browser.storage.sync.get(["activeProfile", "activeProfileName"]);
    if (!stored.activeProfile) {
        const p = await browser.runtime.sendMessage({ type: "GET_PROFILE" }).catch(() => null);
        if (p) activeProfile = p.id;
    } else {
        activeProfile = stored.activeProfile;
    }

    // Update dynamic links based on active profile
    updateDynamicLinks();

    // UI Feedback for profile status
    const profStatus = document.getElementById("profile-status");
    if (profStatus) {
        profStatus.innerHTML = activeProfile 
            ? `Profile: <span style="color:var(--accent); font-weight:700;">${escapeHTML(stored.activeProfileName || activeProfile)}</span>` 
            : "Profile: Not Found";
    }

    // Initial Data Fetch
    await syncLists(); 
    updateDashboardTabInfo(); 
    renderLogs();
}

function initWebCustomizationUI(prefs) {
    const masterToggle = document.getElementById("web-gui-master-toggle");
    const featuresDiv = document.getElementById("web-gui-features");
    
    const toggles = {
        "web-gui-tlds-toggle": prefs.webGuiTlds !== false,
        "web-gui-blocklists-toggle": prefs.webGuiBlocklists !== false,
        "web-gui-log-actions-toggle": prefs.webGuiLogActions !== false,
        "web-gui-filter-toggle": prefs.webGuiFilter !== false,
        "web-gui-desc-toggle": prefs.webGuiDesc !== false,
        "web-gui-profile-notes-toggle": prefs.webGuiProfileNotes !== false
    };

    if (masterToggle && featuresDiv) {
        const masterOn = prefs.webGuiMaster !== false;
        masterToggle.checked = masterOn;
        featuresDiv.style.opacity = masterOn ? "1" : "0.5";
        featuresDiv.style.pointerEvents = masterOn ? "auto" : "none";

        Object.keys(toggles).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.checked = toggles[id];
                el.disabled = !masterOn;
                el.onchange = async (e) => {
                    const key = id.replace(/-toggle$/, '').replace(/^web-gui-/, 'webGui').replace(/-(.)/g, (_, c) => c.toUpperCase());
                    const obj = {}; obj[key] = e.target.checked;
                    await Promise.all([
                        browser.storage.sync.set(obj),
                        browser.storage.local.set(obj)
                    ]);
                };
            }
        });

        masterToggle.onchange = async (e) => {
            const checked = e.target.checked;
            featuresDiv.style.opacity = checked ? "1" : "0.5";
            featuresDiv.style.pointerEvents = checked ? "auto" : "none";
            Object.keys(toggles).forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = !checked;
            });
            await Promise.all([
                browser.storage.sync.set({ webGuiMaster: checked }),
                browser.storage.local.set({ webGuiMaster: checked })
            ]);
        };
    }

    // Link dynamic buttons to Viewer
    const bindViewer = (btnId, tab) => {
        const btn = document.getElementById(btnId);
        if (btn) btn.onclick = () => browser.tabs.create({ url: `viewer.html?tab=${tab}` });
    };

    bindViewer("web-gui-tlds-manager-btn", "tlds");
    bindViewer("web-gui-blocklists-manager-btn", "blocklists");
    bindViewer("web-gui-filter-viewer-btn", "filters");
    bindViewer("domain-desc-viewer-btn", "domains");
    bindViewer("profile-notes-viewer-btn", "profiles");

    const securityLink = document.getElementById("web-gui-security-link");
    if (securityLink && activeProfile) securityLink.href = `https://my.nextdns.io/${activeProfile}/security`;

    const privacyLink = document.getElementById("web-gui-privacy-link");
    if (privacyLink && activeProfile) privacyLink.href = `https://my.nextdns.io/${activeProfile}/privacy`;

    const showHideTldsBtn = document.getElementById("web-gui-tlds-show-hide-btn");
    if (showHideTldsBtn) {
        showHideTldsBtn.onclick = async () => {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (tab?.url.includes("my.nextdns.io")) {
                browser.tabs.sendMessage(tab.id, { type: "TOGGLE_TLD_LIST" }).catch(() => {
                    alert("Please refresh the NextDNS page to enable customization features.");
                });
            } else {
                alert("Please open the NextDNS Security page first.");
            }
        };
    }

    const showHideBlocklistsBtn = document.getElementById("web-gui-blocklists-show-hide-btn");
    if (showHideBlocklistsBtn) {
        showHideBlocklistsBtn.onclick = async () => {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (tab?.url.includes("my.nextdns.io")) {
                browser.tabs.sendMessage(tab.id, { type: "TOGGLE_BLOCKLIST_LIST" }).catch(() => {
                    alert("Please refresh the NextDNS page to enable customization features.");
                });
            } else {
                alert("Please open the NextDNS Privacy page first.");
            }
        };
    }
}

function updateDynamicLinks() {
    const logsLink = document.getElementById("web-gui-logs-link");
    const securityLink = document.getElementById("web-gui-security-link");
    const privacyLink = document.getElementById("web-gui-privacy-link");
    
    if (logsLink && activeProfile) logsLink.href = `https://my.nextdns.io/${activeProfile}/logs`;
    if (securityLink && activeProfile) securityLink.href = `https://my.nextdns.io/${activeProfile}/security`;
    if (privacyLink && activeProfile) privacyLink.href = `https://my.nextdns.io/${activeProfile}/privacy`;
}

/**
 * Data Rendering & UI Logic
 */

function renderLogs() {
    const container = document.getElementById("logs-container");
    if (!container) return;
    
    if (!Array.isArray(cachedLogs) || cachedLogs.length === 0) {
        container.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted); font-size:0.9em;'>No logs found.</div>";
        return;
    }

    // Filter Logic
    const query = (document.getElementById("log-search")?.value || "").toLowerCase();
    const deviceFilter = document.getElementById("log-device-filter")?.value;
    const typeFilter = document.getElementById("log-type-filter")?.value;
    const activeFilters = Array.from(document.querySelectorAll('#status-filter-content input:checked')).map(cb => cb.value);

    const filtered = cachedLogs.filter(log => {
        if (!log) return false;
        const domain = (log.name || log.domain || '').toLowerCase();
        const id = log.device?.id || log.clientIp;
        const status = (log.status === 'allowed' || log.status === 'whitelisted') ? 'status:allowed' : 'status:blocked';
        
        const isWhite = log.status === 'whitelisted' || log.reasons?.some(r => {
            const n = r.name.toLowerCase();
            return n.includes('allowlist') || n.includes('allow list');
        });
        const isBlack = log.reasons?.some(r => {
            const n = r.name.toLowerCase();
            return n.includes('denylist') || n.includes('deny list');
        });

        if (query && !domain.includes(query)) return false;
        if (deviceFilter && id !== deviceFilter) return false;
        if (typeFilter && !(log.protocol || '').toLowerCase().includes(typeFilter)) return false;
        if (!activeFilters.includes(status)) return false;
        
        const reasonFilters = activeFilters.filter(f => f.startsWith('reason:'));
        if (reasonFilters.length > 0) {
            const matchAllow = reasonFilters.includes('reason:allowlist') && isWhite;
            const matchDeny = reasonFilters.includes('reason:denylist') && isBlack;
            // If it doesn't match any of the checked reason filters, but some WERE checked, hide it.
            if (!matchAllow && !matchDeny) return false;
        }
        return true;
    });

    // Efficient Rendering using DocumentFragment
    const fragment = document.createDocumentFragment();
    filtered.slice(0, 100).forEach(log => {
        const row = document.createElement('div');
        row.className = 'log-row';
        const isBlocked = log.status === 'blocked';
        row.style.color = isBlocked ? 'var(--danger)' : 'var(--success)';
        
        const name = hostnameAliases[log.device?.id || log.clientIp] || log.device?.name || log.device?.id || log.clientIp || 'Unknown Device';
        const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "---";

        row.innerHTML = `
            <div class="flex-between" style="font-size:0.75em; color:var(--text-muted);">
                <span>🕒 ${timeStr} | 📱 ${escapeHTML(name)}</span>
                <span style="font-weight:700;">${isBlocked ? 'BLOCKED' : 'ALLOWED'}</span>
            </div>
            <div style="font-weight:700; margin-top:2px; word-break:break-all;">${escapeHTML(log.name || log.domain)}</div>
        `;
        fragment.appendChild(row);
    });
    
    container.innerHTML = "";
    container.appendChild(fragment);

    // Update Device Filter options if needed
    updateDeviceFilterOptions();
}

function updateDeviceFilterOptions() {
    const dropdown = document.getElementById("log-device-filter");
    if (!dropdown || dropdown.options.length > 1) return;

    const devices = new Set();
    cachedLogs.forEach(l => {
        const id = l.device?.id || l.clientIp;
        if (id) devices.add(id);
    });

    devices.forEach(id => {
        const log = cachedLogs.find(l => (l.device?.id || l.clientIp) === id);
        const name = hostnameAliases[id] || log.device?.name || id;
        dropdown.insertAdjacentHTML('beforeend', `<option value="${id}">${escapeHTML(name)}</option>`);
    });
}

/**
 * Theme Engine Helpers
 */
function applyTheme(id) {
    THEME_VARS.forEach(v => document.body.style.removeProperty(`--${v}`));
    if (id === 'default-light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
        const theme = PRESET_THEMES[id] || savedThemes[id];
        if (theme) Object.entries(theme).forEach(([k, v]) => document.body.style.setProperty(k, v));
    }
    syncThemePickers();
}

async function applyAndSaveTheme(id) {
    activeThemeId = id;
    applyTheme(id);
    await Promise.all([
        browser.storage.sync.set({ activeTheme: id }),
        browser.storage.local.set({ activeTheme: id })
    ]);
    populateThemeDropdown();
}

function populateThemeDropdown() {
    const select = document.getElementById("theme-selector");
    const deleteBtn = document.getElementById("delete-theme-btn");
    if (!select) return;
    
    select.innerHTML = `<option value="default-dark">🌙 Default Dark</option><option value="default-light">☀️ Default Light</option>`;
    Object.keys(PRESET_THEMES).forEach(t => select.insertAdjacentHTML('beforeend', `<option value="${t}">✨ ${t}</option>`));
    Object.keys(savedThemes).forEach(t => select.insertAdjacentHTML('beforeend', `<option value="${t}">🎨 ${t}</option>`));
    
    select.value = activeThemeId;
    if (deleteBtn) deleteBtn.style.display = savedThemes[activeThemeId] ? 'block' : 'none';
}

function syncThemePickers() {
    const styles = getComputedStyle(document.body);
    THEME_VARS.forEach(v => {
        const p = document.getElementById(`color-${v}`);
        if (p) p.value = styles.getPropertyValue(`--${v}`).trim() || '#000000';
    });
}

/**
 * Meta & Profile Data Sync
 */
async function loadAllMetadata() {
    try {
        const storage = await browser.storage.local.get("scrapedMeta");
        if (storage.scrapedMeta?.blocklists) {
            blocksMeta = storage.scrapedMeta;
            updateLastRefreshUI();
            return;
        }
        
        // Remote Fallback
        const REMOTE_URL = 'https://raw.githubusercontent.com/DNS-Forge/nextdns-addon-data/main/data/blocks_meta.json';
        const res = await fetch(REMOTE_URL).catch(() => null);
        if (res?.ok) {
            blocksMeta = await res.json();
            await browser.storage.local.set({ scrapedMeta: blocksMeta });
        } else {
            // Local Bundle Fallback
            const localRes = await fetch(browser.runtime.getURL(`data/blocks_meta.json`));
            blocksMeta = await localRes.json();
        }
        updateLastRefreshUI();
    } catch (e) {
        console.error("Metadata load failed", e);
    }
}

async function syncLists(force = false) {
    if (!activeProfile || (!force && listsSynced)) return;
    const [a, d] = await Promise.all([
        browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: "allowlist", action: "list" }),
        browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: "denylist", action: "list" })
    ]).catch(() => [null, null]);
    
    currentAllowlist = new Set((a?.data || []).filter(i => i?.id).map(i => i.id));
    currentDenylist = new Set((d?.data || []).filter(i => i?.id).map(i => i.id));
    listsSynced = true;
}

/**
 * Settings & Tools
 */
async function loadSettings() {
    // Try Sync first, fallback to Local
    const sync = await browser.storage.sync.get(["apiKey", "autoRefreshDefault", "blockNotif", "autoRefreshTime", "iconAction", "enableLabs"]);
    const local = await browser.storage.local.get(["apiKey", "autoRefreshDefault", "blockNotif", "autoRefreshTime", "iconAction", "enableLabs"]);
    
    // Merge: sync takes precedence ONLY if it has a non-empty value
    const s = { 
        ...local, 
        ...sync,
        apiKey: sync.apiKey || local.apiKey || ""
    };
    
    const set = (id, val) => { const el = document.getElementById(id); if (el) { if (el.type === 'checkbox') el.checked = !!val; else el.value = val || ""; } };
    
    set("setting-api-key", s.apiKey);
    set("setting-auto-refresh", s.autoRefreshDefault !== false);
    set("setting-block-notif", s.blockNotif);
    set("setting-refresh-time", s.autoRefreshTime || 5);
    set("setting-icon-action", s.iconAction || "popup");
    set("setting-enable-labs", s.enableLabs);
    
    const labTab = document.getElementById("tab-btn-labs");
    if (labTab) labTab.classList.toggle('hidden', !s.enableLabs);
    if (s.apiKey) fetchProfiles();
}

async function saveSettings() {
    const get = (id) => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : null; };
    const btn = document.getElementById("save-settings-btn");
    
    const settings = {
        apiKey: get("setting-api-key"),
        overrideProfileId: document.getElementById("setting-profile-select")?.value,
        autoRefreshDefault: get("setting-auto-refresh"),
        blockNotif: get("setting-block-notif"),
        autoRefreshTime: get("setting-refresh-time"),
        iconAction: get("setting-icon-action"),
        enableLabs: get("setting-enable-labs")
    };

    // Save to both Sync (for multi-device) and Local (for reliability/persistence)
    await Promise.all([
        browser.storage.sync.set(settings),
        browser.storage.local.set(settings)
    ]);
    
    if (btn) { btn.textContent = "✅ Saved!"; setTimeout(() => { btn.textContent = "💾 Save Options"; }, 2000); }
    initializeApp();
}

/**
 * Feature Specific Renders (Blocks, Lists, Dashboard)
 */

async function loadToggles() {
    if (!activeProfile) return;
    if (!lastBlocksData) {
        const res = await browser.runtime.sendMessage({ type: "GET_ALL_SETTINGS", profileId: activeProfile });
        lastBlocksData = res?.data || {};
    }

    const container = document.getElementById("toggles-container");
    if (!container) return;

    const query = (document.getElementById("blocks-search-input")?.value || "").toLowerCase();
    
    // UI visibility logic for search/sort
    const searchContainer = document.getElementById("blocks-search-container");
    if (searchContainer) {
        const needsSearch = ['blocklists', 'parental', 'tlds'].includes(activeBlocksSubTab);
        searchContainer.classList.toggle('hidden', !needsSearch);
        document.getElementById("blocks-sort-select")?.classList.toggle('hidden', activeBlocksSubTab !== 'blocklists');
    }

    let html = '';
    // Modular render based on sub-tab
    switch (activeBlocksSubTab) {
        case 'security': html = renderSecurityToggles(); break;
        case 'privacy': html = renderPrivacyToggles(); break;
        case 'blocklists': html = renderBlocklistsGrid(query); break;
        case 'parental': html = renderParentalToggles(query); break;
        case 'tlds': html = renderTldsGrid(query); break;
    }
    container.innerHTML = html;
}

function renderSecurityToggles() {
    const SETTING_GROUPS = {
        items: [
            { id: 'threatIntelligenceFeeds', label: 'Threat Intelligence Feeds' },
            { id: 'aiThreatDetection', label: 'AI Threat Detection' },
            { id: 'googleSafeBrowsing', label: 'Google Safe Browsing' },
            { id: 'cryptojackingProtection', label: 'Cryptojacking Protection' },
            { id: 'dnsRebindingProtection', label: 'DNS Rebinding Protection' },
            { id: 'idnHomographAttackProtection', label: 'IDN Homograph Protection' },
            { id: 'typosquattingProtection', label: 'Typosquatting Protection' },
            { id: 'dga', label: 'Domain Generation Algorithms (DGAs) Protection' },
            { id: 'nrd', label: 'Block Newly Registered Domains (NRDs)' },
            { id: 'ddns', label: 'Block Dynamic DNS Hostnames' },
            { id: 'parking', label: 'Block Parked Domains' },
            { id: 'csam', label: 'Block Child Sexual Abuse Material' }
        ]
    };
    return SETTING_GROUPS.items.map(i => renderToggleRow(i, 'security', !!lastBlocksData.security?.[i.id], 'boolean')).join('');
}

function renderPrivacyToggles() {
    const TRACKING = [
        { id: 'disguisedTrackers', label: 'Block Disguised Trackers' },
        { id: 'allowAffiliate', label: 'Allow Affiliate Links' }
    ];
    const NATIVES = [
        { id: 'windows', label: 'Windows' },
        { id: 'apple', label: 'Apple' },
        { id: 'samsung', label: 'Samsung' },
        { id: 'huawei', label: 'Huawei' },
        { id: 'xiaomi', label: 'Xiaomi' },
        { id: 'sonos', label: 'Sonos' },
        { id: 'roku', label: 'Roku' },
        { id: 'alexa', label: 'Alexa' }
    ];

    let html = '<div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Tracking</div>';
    html += TRACKING.map(i => renderToggleRow(i, 'privacy', !!lastBlocksData.privacy?.[i.id], 'boolean')).join('');
    
    const privacyUrl = activeProfile ? `https://my.nextdns.io/${activeProfile}/privacy` : '#';
    html += `<hr style="border-top:1px solid var(--border-color); border-bottom:0; margin:10px 0;">
             <div class="flex-between" style="margin:0 0 5px;">
                <div style="font-weight:bold; font-size: 0.85em;">Native Tracking Protection</div>
                <a href="${privacyUrl}" target="_blank" class="tld-jump-link" style="font-size: 0.75em; padding: 2px 6px; text-decoration: none;">🌐 Privacy Page</a>
             </div>`;

    html += NATIVES.map(i => {
        const isActive = lastBlocksData.natives?.some(n => n.id === i.id);
        return renderToggleRow(i, 'privacy/natives', isActive, 'list');
    }).join('');
    return html;
}

function renderBlocklistsGrid(query) {
    const activeIds = new Set((lastBlocksData.blocklists || []).map(l => l.id));
    let filtered = blocksMeta.blocklists.filter(b => b.name.toLowerCase().includes(query) || b.description.toLowerCase().includes(query));
    
    // Sort logic
    if (activeBlocksSort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (activeBlocksSort === 'updated') filtered.sort((a, b) => b.updated_ts - a.updated_ts);
    else if (activeBlocksSort === 'popularity') filtered.sort((a, b) => b.popularity - a.popularity);
    else if (activeBlocksSort === 'entries') filtered.sort((a, b) => b.entries - a.entries);

    return filtered.map(b => {
        const active = activeIds.has(b.id);
        return `
            <div style="padding: 10px; border-bottom: 1px solid var(--border-color); background: var(--bg-panel); margin-bottom: 5px; border-radius: 4px;">
                <div class="flex-between" style="align-items: flex-start;">
                    <div style="flex-grow: 1; padding-right: 10px;">
                        <div style="font-weight:bold; font-size: 0.9em;">${escapeHTML(b.name)}</div>
                        <div style="font-size: 0.8em; opacity: 0.7; margin: 4px 0;">${escapeHTML(b.description)}</div>
                        <div style="font-size: 0.75em; opacity: 0.5;">${escapeHTML(b.entries)} entries • Updated ${escapeHTML(b.updated)}</div>
                    </div>
                    <button class="api-toggle-btn ${active?'btn-deny':'btn-allow'}" 
                        data-cat="privacy/blocklists" data-id="${b.id}" data-type="list" data-active="${active}" 
                        style="width:auto; padding:4px 12px; font-size: 0.8em;">${active?'Remove':'Add'}</button>
                </div>
            </div>`;
    }).join('') || '<div style="text-align:center; opacity:0.5; padding:20px;">No blocklists found.</div>';
}

function renderParentalToggles(query) {
    const SETTINGS = [
        { id: 'safeSearch', label: 'SafeSearch' },
        { id: 'youtubeRestrictedMode', label: 'YouTube Restricted Mode' }
    ];
    let html = '<div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Global Settings</div>';
    html += SETTINGS.map(i => renderToggleRow(i, 'parentalcontrol', !!lastBlocksData.parentalcontrol?.[i.id], 'boolean')).join('');
    
    html += '<hr style="border-top:1px solid var(--border-color); border-bottom:0; margin:10px 0;"><div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Categories</div>';
    html += (blocksMeta.categories || []).map(c => {
        const isActive = lastBlocksData.categories?.some(cat => cat.id === c.id);
        return renderToggleRow(c, 'parentalcontrol/categories', isActive, 'list');
    }).join('');

    html += '<hr style="border-top:1px solid var(--border-color); border-bottom:0; margin:10px 0;"><div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Services</div>';
    const activeServices = new Set((lastBlocksData.services || []).map(s => s.id));
    const filteredServices = blocksMeta.parental_services.filter(s => s.name.toLowerCase().includes(query));
    html += filteredServices.map(s => {
        const isActive = activeServices.has(s.id);
        return renderToggleRow({ id: s.id, label: s.name }, 'parentalcontrol/services', isActive, 'list');
    }).join('');
    return html;
}

function renderToggleRow(item, cat, active, type) {
    return `
        <div class="flex-between" style="margin-bottom:8px;">
            <span style="font-size: 0.9em;">${escapeHTML(item.label || item.name)}</span>
            <button class="api-toggle-btn ${active?'btn-allow':'btn-secondary'}" 
                data-cat="${cat}" data-id="${item.id}" data-type="${type}" data-active="${active}" 
                style="width:auto; padding:2px 8px; font-size: 0.8em;">${active?'ON':'OFF'}</button>
        </div>`;
}

async function toggleApiSetting(btn) {
    const cat = btn.getAttribute('data-cat');
    const id = btn.getAttribute('data-id');
    const type = btn.getAttribute('data-type');
    const active = btn.getAttribute('data-active') === 'true';
    
    btn.disabled = true;
    btn.style.opacity = '0.5';
    
    const res = await browser.runtime.sendMessage({ 
        type: "TOGGLE_SETTING", 
        profileId: activeProfile, 
        category: cat, id, 
        action: active ? "delete" : "add", 
        settingType: type 
    });
    
    if (res?.success) {
        lastBlocksData = null; // Invalidate cache
        await loadToggles();
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        alert("Failed to update setting: " + (res?.error || "Unknown error"));
    }
}

async function toggleAutoRefresh(enable) {
    const btn = document.getElementById("auto-refresh-btn");
    if (!btn) return;
    clearInterval(autoRefreshInterval); autoRefreshInterval = null;
    if (enable) {
        btn.classList.replace("btn-dark", "btn-secondary"); btn.textContent = "⏸️ Auto";
        loadNativeLogs();
        const { autoRefreshTime } = await browser.storage.sync.get("autoRefreshTime");
        autoRefreshInterval = setInterval(loadNativeLogs, (parseInt(autoRefreshTime) || 5) * 1000);
    } else { btn.classList.replace("btn-secondary", "btn-dark"); btn.textContent = "▶️ Auto"; }
}

async function loadNativeLogs() {
    if (!activeProfile) return;
    const res = await browser.runtime.sendMessage({ type: "GET_LOGS", profileId: activeProfile }).catch(() => null);
    if (res?.success) { 
        cachedLogs = res.data || []; 
        renderLogs(); 
    }
}

async function handleLogAction(list, domain, action, btn) {
    await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: list, domain, action });
    loadNativeLogs();
}

async function findInLists(d) {
    const btn = document.querySelector('.tab-btn[data-tab="lists"]');
    if (btn) btn.click();
    const input = document.getElementById("list-search-input");
    if (input) input.value = d;
    loadManagerList();
}

async function loadManagerList(force = false) {
    const listTypeSelect = document.getElementById("list-type-select");
    if (!listTypeSelect) return;
    const listType = listTypeSelect.value;
    const res = await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, action: "list" });
    cachedListItems = res?.data || [];
    renderManagerList();
}

function renderManagerList() {
    const input = document.getElementById("list-search-input");
    const container = document.getElementById("list-items-container");
    if (!input || !container) return;
    const query = input.value.toLowerCase();
    const filtered = cachedListItems.filter(i => i.id.toLowerCase().includes(query));
    
    container.innerHTML = filtered.map(i => `
        <div class="list-item flex-between" style="background:var(--bg-panel); padding:8px 12px; border-radius:6px; margin-bottom:5px; border:1px solid var(--border-color);">
            <span style="font-family:monospace;">${escapeHTML(i.id)}</span>
            <button class="btn-deny" style="width:auto; padding:4px 8px;" data-delete="${escapeHTML(i.id)}">❌</button>
        </div>`).join('') || "<div style='text-align:center; opacity:0.5; padding:20px;'>List is empty.</div>";
}

async function deleteListItem(domain) {
    const listTypeSelect = document.getElementById("list-type-select");
    const listType = listTypeSelect ? listTypeSelect.value : 'denylist';
    await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, domain, action: "delete" });
    loadManagerList(true);
}

async function fetchProfiles() {
    const btn = document.getElementById("setting-fetch-profiles");
    if (!btn) return;
    btn.textContent = "⏳";
    const select = document.getElementById("setting-profile-select");
    const res = await browser.runtime.sendMessage({ type: "GET_PROFILES_LIST" });
    if (select) {
        select.innerHTML = '<option value="">Auto-Detect (Default)</option>';
        if (res?.data) {
            res.data.forEach(p => select.insertAdjacentHTML('beforeend', `<option value="${p.id}">${escapeHTML(p.name)} (${p.id})</option>`));
            const { overrideProfileId } = await browser.storage.sync.get("overrideProfileId");
            if (overrideProfileId) select.value = overrideProfileId;
        }
    }
    btn.textContent = "🔄";
}

async function loadAnalytics() {
    const res = await browser.runtime.sendMessage({ type: "GET_ANALYTICS", profileId: activeProfile });
    const container = document.getElementById("analytics-overview");
    if (res?.data && container) {
        container.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div class="panel-box" style="margin-bottom:0;">
                    <div style="font-size:0.7em; color:var(--text-muted);">QUERIES</div>
                    <div style="font-size:1.2em; font-weight:700;">${res.data.queries.toLocaleString()}</div>
                </div>
                <div class="panel-box" style="margin-bottom:0;">
                    <div style="font-size:0.7em; color:var(--text-muted);">BLOCKED</div>
                    <div style="font-size:1.2em; font-weight:700; color:var(--danger);">${res.data.blockedQueries.toLocaleString()}</div>
                </div>
            </div>`;
    } else if (container) container.innerHTML = "No analytics data.";
}

// Re-map dashboard actions
document.getElementById("allow-btn").onclick = () => executeDashboardAction("allowlist");
document.getElementById("deny-btn").onclick = () => executeDashboardAction("denylist");
document.getElementById("snooze-btn").onclick = snoozeDashboardDomain;

async function executeDashboardAction(type) {
    const input = document.getElementById("domain-input");
    const d = input?.value.trim();
    if (d && activeProfile) {
        await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: type, domain: d, action: "add" });
        input.style.borderColor = type === 'allowlist' ? "var(--success)" : "var(--danger)";
        syncLists(true);
    }
}

async function snoozeDashboardDomain() {
    const input = document.getElementById("domain-input");
    const d = input?.value.trim();
    if (d && activeProfile) {
        await browser.runtime.sendMessage({ type: "TEMP_ALLOW", profileId: activeProfile, domain: d });
        input.style.borderColor = "var(--warning)";
    }
}

// Meta Handlers
async function handleMetaRefresh() {
    updateMetaStatus("Refreshing remote metadata...");
    try {
        const REMOTE_URL = 'https://raw.githubusercontent.com/DNS-Forge/nextdns-addon-data/main/data/blocks_meta.json';
        const res = await fetch(REMOTE_URL);
        const data = await res.json();
        await browser.storage.local.set({ scrapedMeta: data });
        blocksMeta = data;
        updateMetaStatus("Sync Complete.");
        updateLastRefreshUI();
        if (activeBlocksSubTab) loadToggles();
    } catch (e) { updateMetaStatus("Sync Failed."); }
}

async function handleMetaDelete() {
    if (confirm("Clear local metadata cache?")) {
        await browser.storage.local.remove("scrapedMeta");
        updateMetaStatus("Cache Cleared.");
        initializeApp();
    }
}

async function handleMetaSave() {
    const blob = new Blob([JSON.stringify(blocksMeta, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    await browser.downloads.download({ url, filename: "blocks_meta.json", saveAs: true });
}

async function handleMetaLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            await browser.storage.local.set({ scrapedMeta: data });
            blocksMeta = data;
            updateMetaStatus("Import Success.");
            updateLastRefreshUI();
        } catch (err) { alert("Invalid JSON."); }
    };
    reader.readAsText(file);
}

function updateMetaStatus(t) {
    const el = document.getElementById("meta-status-text");
    if (el) el.textContent = t;
}

// Bulk Exports
const downloadLogsBtn = document.getElementById("download-logs-btn");
if (downloadLogsBtn) downloadLogsBtn.onclick = async () => {
    const csv = await browser.runtime.sendMessage({ type: "DOWNLOAD_LOGS_CSV", profileId: activeProfile });
    if (csv) {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const a = document.createElement('a'); a.href = url; a.download = `nextdns_logs_${activeProfile}.csv`; a.click();
    }
};

const wipeLogsBtn = document.getElementById("wipe-logs-btn");
if (wipeLogsBtn) wipeLogsBtn.onclick = async () => {
    if (confirm("Wipe all logs for this profile?")) {
        await browser.runtime.sendMessage({ type: "CLEAR_LOGS", profileId: activeProfile });
        cachedLogs = []; renderLogs();
    }
};

const exportSettingsBtn = document.getElementById("export-settings-btn");
if (exportSettingsBtn) exportSettingsBtn.onclick = async () => {
    const s = await browser.storage.sync.get(null);
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    await browser.downloads.download({ url, filename: "dns_forge_backup.json", saveAs: true });
};

const importSettingsBtn = document.getElementById("import-settings-btn");
const importSettingsFile = document.getElementById("import-settings-file");
if (importSettingsBtn && importSettingsFile) {
    importSettingsBtn.onclick = () => importSettingsFile.click();
    importSettingsFile.onchange = async (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (confirm("Overwriting all settings. Continue?")) {
                    await browser.storage.sync.clear();
                    await browser.storage.sync.set(data);
                    window.location.reload();
                }
            } catch (err) { alert("Invalid Backup File."); }
        };
        reader.readAsText(file);
    };
}

/**
 * TLD Manager Logic (Popup specific)
 */
function renderTldsGrid(query) {
    const activeTlds = new Set((lastBlocksData.tlds || []).map(t => t.id));
    const groups = {};
    
    blocksMeta.tlds.forEach(tld => {
        if (query && !tld.toLowerCase().includes(query)) return;
        
        // Multi-inclusion logic: .co.uk appears in both C and U
        const letters = new Set();
        letters.add(tld[0].toUpperCase());
        const parts = tld.split('.');
        parts.forEach(p => { if (p) letters.add(p[0].toUpperCase()); });

        letters.forEach(letter => {
            if (!groups[letter]) groups[letter] = [];
            groups[letter].push(tld);
        });
    });

    const sortedLetters = Object.keys(groups).sort();
    let html = `<div id="tlds-top">${sortedLetters.map(l => `<a href="#tld-group-${l}" class="tld-jump-link">${l}</a>`).join('')}</div>`;

    html += sortedLetters.map(letter => `
        <div id="tld-group-${letter}" style="margin-top: 15px;">
            <div class="flex-between" style="border-bottom:1px solid var(--border-color); margin-bottom:8px;">
                <strong style="color:var(--accent);">${letter}</strong>
                <a href="#tlds-top" style="font-size:0.7em; color:var(--text-muted); text-decoration:none;">↑ TOP</a>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                ${groups[letter].map(t => {
                    const active = activeTlds.has(t);
                    return `
                        <div class="flex-between" style="background:rgba(0,0,0,0.1); padding:4px 8px; border-radius:4px;">
                            <span style="font-size: 0.85em; font-family:monospace;">.${escapeHTML(t)}</span>
                            <button class="api-toggle-btn ${active?'btn-deny':'btn-allow'}" 
                                data-cat="security/tlds" data-id="${t}" data-type="list" data-active="${active}" 
                                style="width:auto; padding:2px 6px; font-size: 0.7em;">${active?'OFF':'ON'}</button>
                        </div>`;
                }).join('')}
            </div>
        </div>
    `).join('') || '<div style="text-align:center; opacity:0.5; padding:20px;">No TLDs match search.</div>';
    
    return html;
}

/**
 * Dashboard & Statistics
 */
async function updateDashboardTabInfo() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    
    const stats = await browser.runtime.sendMessage({ type: "GET_TAB_STATS", tabId: tab.id });
    const requests = stats?.requests || {};
    const domains = Object.keys(requests);
    
    const header = document.getElementById("tab-log-header");
    if (header) header.textContent = `Tab Requests: (${domains.length})`;
    
    const container = document.getElementById("tab-log");
    if (container) {
        if (domains.length === 0) {
            container.innerHTML = "<div style='opacity:0.5; padding:10px;'>No requests captured for this tab yet.</div>";
        } else {
            container.innerHTML = domains.map(d => {
                const r = requests[d];
                const color = r.status === 'blocked' ? 'var(--danger)' : (r.reason === 'Allow List' ? 'var(--success)' : 'inherit');
                return `<div style="padding:4px; color:${color}; font-size:0.9em; border-bottom:1px solid rgba(255,255,255,0.05);">
                    ${escapeHTML(d)} 
                    <span style="font-size:0.8em; opacity:0.6; margin-left:5px;">${escapeHTML(r.reason === 'Default' ? '' : `[${r.reason}]`)}</span>
                </div>`;
            }).join('');
        }
    }
    
    // Privacy Grade Logic
    const score = document.getElementById("privacy-score");
    if (score) {
        const blockedCount = stats?.blockedCount || 0;
        let grade = "-";
        if (domains.length > 0) {
            const ratio = blockedCount / domains.length;
            if (ratio > 0.4) grade = "A+"; else if (ratio > 0.25) grade = "A"; else if (ratio > 0.1) grade = "B"; else if (ratio > 0.05) grade = "C"; else grade = "D";
        }
        score.textContent = grade;
    }
}

// Ensure settings sub-tab renders hosts when clicked
async function renderAliases() {
    // This logic is now mostly moved to viewer.html for centralized management
    // but we can provide a small preview here if needed.
}

// Final Helper UI updates
function updateLastRefreshUI() {
    const el = document.getElementById("meta-last-refresh");
    if (el && blocksMeta.last_updated) {
        el.textContent = `Last Refresh: ${new Date(blocksMeta.last_updated).toLocaleDateString()}`;
    }
}
