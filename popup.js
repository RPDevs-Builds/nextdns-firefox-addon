let activeProfile = null;
let cachedLogs = []; 
let autoRefreshInterval = null;
let cachedListItems = []; 
let isAutoRefreshDefault = false;
let isTabTrackingPaused = false; 

// Cache State
let listsSynced = false;
let currentAllowlist = new Set();
let currentDenylist = new Set();
let deviceAliases = {};
let blocksMeta = { blocklists: [], parental_services: [], tlds: [], categories: [] };
let activeBlocksSort = 'popularity';

const urlParams = new URLSearchParams(window.location.search);
const isPopoutMode = urlParams.get('mode') === 'popout';
const isSidebarMode = urlParams.get('mode') === 'sidebar';
let isPinnedOnTop = false;

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

// SECURITY: Prevent XSS injection
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}

document.addEventListener("DOMContentLoaded", async () => {
  const popoutBtn = document.getElementById('popout-ui-btn');
  const pinBtn = document.getElementById('pin-ui-btn');
  const sidebarBtn = document.getElementById('sidebar-ui-btn');
  const refreshBtn = document.getElementById('refresh-view-btn');
  const themeBtn = document.getElementById('theme-toggle-btn');
  const tabSyncBtn = document.getElementById('toggle-tab-tracking-btn');

  // --- Bulk Add Event Listeners ---
  const bulkToggleBtn = document.getElementById("list-bulk-toggle-btn");
  const bulkContainer = document.getElementById("list-bulk-container");
  const bulkCancelBtn = document.getElementById("list-bulk-cancel-btn");
  const bulkSubmitBtn = document.getElementById("list-bulk-submit-btn");
  const bulkTextarea = document.getElementById("list-bulk-domains");

  if (bulkToggleBtn) bulkToggleBtn.onclick = () => { bulkContainer.style.display = bulkContainer.style.display === 'none' ? 'flex' : 'none'; };
  if (bulkCancelBtn) bulkCancelBtn.onclick = () => { bulkContainer.style.display = 'none'; bulkTextarea.value = ''; };

  if (bulkSubmitBtn) bulkSubmitBtn.onclick = async () => {
    const listTypeSelect = document.getElementById("list-type-select");
    const listType = listTypeSelect ? listTypeSelect.value : 'denylist';
    const domains = bulkTextarea.value.split('\n').map(d => d.trim()).filter(d => d !== '');
    if (domains.length === 0 || !activeProfile) return;

    bulkSubmitBtn.disabled = true;
    bulkCancelBtn.disabled = true;
    bulkSubmitBtn.textContent = `Processing (0/${domains.length})...`;

    for (let i = 0; i < domains.length; i++) {
      if (listType === 'allowlist') currentAllowlist.add(domains[i]);
      else currentDenylist.add(domains[i]);

      await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, domain: domains[i], action: "add" });
      bulkSubmitBtn.textContent = `Processing (${i + 1}/${domains.length})...`;
      await new Promise(r => setTimeout(r, 500)); 
    }

    bulkTextarea.value = "";
    bulkSubmitBtn.disabled = false;
    bulkCancelBtn.disabled = false;
    bulkSubmitBtn.textContent = "Submit Bulk Add";
    bulkContainer.style.display = 'none';
    syncLists(true); loadManagerList(); 
  };

  // --- Live Tab Tracking ---
  if (tabSyncBtn) tabSyncBtn.onclick = () => {
    isTabTrackingPaused = !isTabTrackingPaused;
    tabSyncBtn.classList.toggle('btn-secondary', !isTabTrackingPaused);
    tabSyncBtn.classList.toggle('btn-dark', isTabTrackingPaused);
    tabSyncBtn.textContent = isTabTrackingPaused ? '▶️ Paused' : '⏸️ Live';
    if (!isTabTrackingPaused) updateDashboardTabInfo();
  };

  browser.tabs.onActivated.addListener(() => { if (!isTabTrackingPaused) updateDashboardTabInfo(); });
  browser.tabs.onUpdated.addListener((id, ch, t) => { if (t.active && ch.status === 'complete' && !isTabTrackingPaused) updateDashboardTabInfo(); });

  // View Router Logic
  if (isSidebarMode) document.body.classList.add('sidebar-mode');
  else if (isPopoutMode) {
    document.body.classList.add('popout-mode');
    if (pinBtn) pinBtn.onclick = async () => {
      isPinnedOnTop = !isPinnedOnTop;
      const win = await browser.windows.getCurrent();
      await browser.windows.update(win.id, { alwaysOnTop: isPinnedOnTop }).catch(() => alert("Pinning blocked by OS."));
      pinBtn.style.color = isPinnedOnTop ? '#28a745' : 'var(--text-muted)';
    };
  } else {
    if (popoutBtn) popoutBtn.onclick = async () => {
      const currentWin = await browser.windows.getCurrent();
      await browser.windows.create({ url: "popup.html?mode=popout", type: "popup", width: 380, height: 650, left: currentWin.left + currentWin.width - 430, top: currentWin.top + 60 });
      window.close();
    };
    if (sidebarBtn) sidebarBtn.onclick = () => { browser.sidebarAction.open().catch(() => alert("Use View > Sidebar")); window.close(); };
  }

  // --- Theme Engine ---
  const { activeTheme, customThemes, uiTheme } = await browser.storage.sync.get(["activeTheme", "customThemes", "uiTheme"]);
  savedThemes = customThemes || {};
  activeThemeId = activeTheme || (uiTheme === 'light' ? 'default-light' : 'default-dark');
  applyTheme(activeThemeId);
  populateThemeDropdown();

  if (themeBtn) themeBtn.onclick = () => applyAndSaveTheme(activeThemeId === 'default-light' ? 'default-dark' : 'default-light');
  const themeSelector = document.getElementById("theme-selector");
  if (themeSelector) themeSelector.onchange = (e) => applyAndSaveTheme(e.target.value);
  const saveThemeBtn = document.getElementById("save-theme-btn");
  if (saveThemeBtn) saveThemeBtn.onclick = async () => {
    let tName = document.getElementById("theme-name-input").value.trim() || `Theme ${Object.keys(savedThemes).length + 1}`;
    const cTheme = {};
    THEME_VARS.forEach(v => {
      const p = document.getElementById(`color-${v}`);
      if (p) cTheme[`--${v}`] = p.value;
    });
    savedThemes[tName] = cTheme;
    await browser.storage.sync.set({ customThemes: savedThemes });
    await applyAndSaveTheme(tName);
  };

  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      refreshBtn.style.transform = "rotate(180deg)";
      setTimeout(() => { refreshBtn.style.transform = "none"; }, 300);
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab) browser.tabs.reload(tab.id).catch(() => {});
      initializeApp();
    };
  }

  // --- Main Tab Navigation ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-tab');
      const content = document.getElementById(`tab-${target}`);
      if (content) content.classList.add('active');
      if (target === 'logs') { if (isAutoRefreshDefault) toggleAutoRefresh(true); else loadNativeLogs(); }
      else toggleAutoRefresh(false);
      if (target === 'lists') loadManagerList();
      if (target === 'toggles') loadToggles();
      if (target === 'settings') loadSettings();
    };
  });

  // --- Settings Sub-tabs ---
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
        if (content) { content.classList.add('active'); content.style.display = 'block'; }
        if (target === 'hostnames') renderAliases();
        if (target === 'analytics') loadAnalytics();
      }
    };
  }

  // --- Log Filters ---
  const statusBtn = document.getElementById("status-filter-dropdown-btn");
  if (statusBtn) statusBtn.onclick = (e) => { e.stopPropagation(); const c = document.getElementById("status-filter-content"); if (c) c.style.display = c.style.display === "none" ? "flex" : "none"; };
  document.addEventListener("click", () => { const c = document.getElementById("status-filter-content"); if (c) c.style.display = "none"; });
  const filterContent = document.getElementById("status-filter-content");
  if (filterContent) { filterContent.onclick = (e) => e.stopPropagation(); filterContent.querySelectorAll('input').forEach(cb => cb.onchange = renderLogs); }
  const devFilt = document.getElementById("log-device-filter");
  if (devFilt) devFilt.onchange = renderLogs;
  const typFilt = document.getElementById("log-type-filter");
  if (typFilt) typFilt.onchange = renderLogs;
  const logSearch = document.getElementById("log-search");
  if (logSearch) logSearch.oninput = renderLogs;

  const autoRefreshBtn = document.getElementById("auto-refresh-btn");
  if (autoRefreshBtn) autoRefreshBtn.onclick = () => toggleAutoRefresh(autoRefreshInterval === null);

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

  const fetchProfilesBtn = document.getElementById("setting-fetch-profiles");
  if (fetchProfilesBtn) fetchProfilesBtn.onclick = fetchProfiles;

  const saveSettingsBtn = document.getElementById("save-settings-btn");
  if (saveSettingsBtn) saveSettingsBtn.onclick = saveSettings;

  const downloadLogsBtn = document.getElementById("download-logs-btn");
  if (downloadLogsBtn) downloadLogsBtn.onclick = downloadLogs;

  const wipeLogsBtn = document.getElementById("wipe-logs-btn");
  if (wipeLogsBtn) wipeLogsBtn.onclick = wipeLogs;

  const listTypeSelect = document.getElementById("list-type-select");
  if (listTypeSelect) listTypeSelect.onchange = () => { document.getElementById("list-search-input").value = ""; loadManagerList(); };
  const listSearchInput = document.getElementById("list-search-input");
  if (listSearchInput) listSearchInput.oninput = renderManagerList;
  const listAddBtn = document.getElementById("list-add-btn");
  if (listAddBtn) listAddBtn.onclick = addListItem;

  document.getElementById("allow-btn").onclick = () => executeAction("allowlist");
  document.getElementById("deny-btn").onclick = () => executeAction("denylist");
  document.getElementById("snooze-btn").onclick = snoozeDomain;

  document.addEventListener('click', async (e) => {
    if (e.target.closest('#logs-container')) {
      const btn = e.target.closest('button');
      if (btn) {
        if (btn.hasAttribute('data-log-action')) handleLogAction(btn.getAttribute('data-list'), btn.getAttribute('data-domain'), btn.getAttribute('data-log-action'), btn);
        else if (btn.hasAttribute('data-find')) findInLists(btn.getAttribute('data-find'));
      }
    }
    if (e.target.closest('#list-items-container')) {
      const btn = e.target.closest('button');
      if (btn && btn.hasAttribute('data-delete')) deleteListItem(btn.getAttribute('data-delete'));
    }
    if (e.target.closest('.api-toggle-btn')) toggleApiSetting(e.target.closest('.api-toggle-btn'));
    
    // Updated: Handle Blocks sub-nav clicks
    if (e.target.closest('#blocks-sub-nav .sub-tab-btn')) {
      const btn = e.target.closest('.sub-tab-btn');
      document.querySelectorAll('#blocks-sub-nav .sub-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeBlocksSubTab = btn.getAttribute('data-sub');
      const searchInput = document.getElementById("blocks-search-input");
      if (searchInput) searchInput.value = "";
      loadToggles();
    }
  });

  const blocksSearchInput = document.getElementById("blocks-search-input");
  if (blocksSearchInput) blocksSearchInput.oninput = () => loadToggles();

  const blocksSortSelect = document.getElementById("blocks-sort-select");
  if (blocksSortSelect) blocksSortSelect.onchange = (e) => { activeBlocksSort = e.target.value; loadToggles(); };

  initializeApp();
});

async function applyAndSaveTheme(id) { activeThemeId = id; applyTheme(id); await browser.storage.sync.set({ activeTheme: id }); populateThemeDropdown(); }
function applyTheme(id) {
  THEME_VARS.forEach(v => document.body.style.removeProperty(`--${v}`));
  if (id === 'default-light') document.body.classList.add('light-mode');
  else {
    document.body.classList.remove('light-mode');
    const theme = PRESET_THEMES[id] || savedThemes[id];
    if (theme) Object.entries(theme).forEach(([k, v]) => document.body.style.setProperty(k, v));
  }
  syncThemePickers();
}
function populateThemeDropdown() {
  const select = document.getElementById("theme-selector");
  if (!select) return;
  select.innerHTML = `<option value="default-dark">🌙 Default Dark</option><option value="default-light">☀️ Default Light</option>`;
  Object.keys(PRESET_THEMES).forEach(t => select.insertAdjacentHTML('beforeend', `<option value="${t}">✨ ${t}</option>`));
  Object.keys(savedThemes).forEach(t => select.insertAdjacentHTML('beforeend', `<option value="${t}">🎨 ${t}</option>`));
  select.value = activeThemeId;
}
function syncThemePickers() {
  const styles = getComputedStyle(document.body);
  THEME_VARS.forEach(v => { const p = document.getElementById(`color-${v}`); if (p) p.value = styles.getPropertyValue(`--${v}`).trim() || '#000000'; });
}

async function syncLists(force = false) {
  if (!activeProfile || (!force && listsSynced)) return;
  const [a, d] = await Promise.all([
    browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: "allowlist", action: "list" }),
    browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: "denylist", action: "list" })
  ]).catch(() => [null, null]);
  
  // Robust mapping: filter out null/undefined items
  currentAllowlist = new Set((a?.data || []).filter(i => i && i.id).map(i => i.id));
  currentDenylist = new Set((d?.data || []).filter(i => i && i.id).map(i => i.id));
  listsSynced = true;
}

function updateMetaStatus(text) {
  const statusEl = document.getElementById("meta-status-text");
  if (statusEl) statusEl.textContent = text;
}

async function handleMetaRefresh() {
  updateMetaStatus("Fetching remote metadata...");
  try {
    const REMOTE_BASE = 'https://raw.githubusercontent.com/DNS-Forge/nextdns-addon-data/main/data/blocks_meta.json';
    const response = await fetch(REMOTE_BASE);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    await browser.storage.local.set({ scrapedMeta: data });
    blocksMeta = data;
    updateMetaStatus("Local metadata refreshed from remote.");
    if (activeBlocksSubTab) loadToggles(true);
  } catch (e) {
    updateMetaStatus("Refresh failed: " + e.message);
  }
}

async function handleMetaDelete() {
  await browser.storage.local.remove("scrapedMeta");
  blocksMeta = { blocklists: [], parental_services: [], tlds: [], categories: [] };
  updateMetaStatus("Local cache deleted. Will use bundled fallback.");
  loadAllMetadata();
  if (activeBlocksSubTab) loadToggles(true);
}

async function handleMetaSave() {
  try {
    const jsonStr = JSON.stringify(blocksMeta, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    await browser.downloads.download({ url, filename: "blocks_meta.json", saveAs: true });
    URL.revokeObjectURL(url);
    updateMetaStatus("Metadata saved successfully.");
  } catch (e) { updateMetaStatus("Save failed: " + e.message); }
}

async function handleMetaLoad(e) {
  const file = e.target.files[0];
  if (!file) return;
  updateMetaStatus("Loading file...");
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.blocklists && data.tlds) {
        await browser.storage.local.set({ scrapedMeta: data });
        blocksMeta = data;
        updateMetaStatus("Metadata loaded from file.");
        if (activeBlocksSubTab) loadToggles(true);
      } else { updateMetaStatus("Invalid JSON structure."); }
    } catch (err) { updateMetaStatus("Parse error: " + err.message); }
    e.target.value = ""; 
  };
  reader.readAsText(file);
}

async function loadAllMetadata() {
  // 1. Try to load fresh metadata natively scraped or imported by user
  try {
    const storage = await browser.storage.local.get("scrapedMeta");
    const scraped = storage.scrapedMeta;
    if (scraped && scraped.blocklists && scraped.tlds && scraped.blocklists.length > 0) {
      blocksMeta = scraped;
      updateMetaStatus("Using fully cached/scraped metadata.");
      return blocksMeta;
    }
  } catch (e) { console.warn("Local scraped meta check failed", e); }

  // 2. Fallback to Remote GitHub Single JSON
  try {
    updateMetaStatus("Using remote fallback data.");
    const REMOTE_BASE = 'https://raw.githubusercontent.com/DNS-Forge/nextdns-addon-data/main/data/blocks_meta.json';
    let response = await fetch(REMOTE_BASE).catch(() => null);
    
    if (!response || !response.ok) {
      // Fallback to local bundled JSON if remote is 404 (e.g. private repo) or fails
      response = await fetch(browser.runtime.getURL(`data/blocks_meta.json`));
    }
    
    const data = await response.json();
    blocksMeta = data;
    return data;
  } catch (e) { 
    console.error(`Failed to load metadata`, e); 
    updateMetaStatus("Failed to load metadata.");
    return blocksMeta; 
  }
}

async function initializeApp() {
  const { apiKey, autoRefreshDefault, aliases } = await browser.storage.sync.get(["apiKey", "autoRefreshDefault", "aliases"]);
  isAutoRefreshDefault = autoRefreshDefault !== false;
  deviceAliases = aliases || {};
  
  // Load monolithic metadata
  await loadAllMetadata();

  if (!apiKey) { document.querySelector('.tab-btn[data-tab="settings"]').click(); return; }
  
  let stored = await browser.storage.sync.get(["activeProfile", "activeProfileName"]);
  if (!stored.activeProfile) {
    const p = await browser.runtime.sendMessage({ type: "GET_PROFILE" }).catch(() => null);
    if (p) { activeProfile = p.id; stored.activeProfileName = p.name; }
  } else activeProfile = stored.activeProfile;

  const profStatus = document.getElementById("profile-status");
  if (profStatus) profStatus.innerHTML = activeProfile ? `Profile: <span style="color:#4facf7;">${escapeHTML(stored.activeProfileName || activeProfile)}</span>` : "Profile: Not Found";
  await syncLists(); updateDashboardTabInfo(); renderLogs();
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
  if (res) { cachedLogs = res.data || res.logs || res || []; renderLogs(); }
}

function renderLogs() {
  const container = document.getElementById("logs-container");
  if (!container) return;
  
  if (!Array.isArray(cachedLogs) || cachedLogs.length === 0) {
    container.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted); font-size:0.9em;'>No logs found.</div>";
    return;
  }

  const textFilterInput = document.getElementById("log-search");
  const textFilter = textFilterInput ? textFilterInput.value.toLowerCase() : "";
  const devFilt = document.getElementById("log-device-filter");
  const deviceFilter = devFilt ? devFilt.value : "";
  const typFilt = document.getElementById("log-type-filter");
  const typeFilter = typFilt ? typFilt.value : "";
  const activeFilters = Array.from(document.querySelectorAll('#status-filter-content input:checked')).map(cb => cb.value);

  // Auto-populate device dropdown if needed
  const deviceDropdown = document.getElementById("log-device-filter");
  if (deviceDropdown && deviceDropdown.options.length === 1) {
    const unique = [...new Set(cachedLogs.filter(l => l && (l.device || l.clientIp)).map(l => l.device?.id || l.clientIp).filter(Boolean))];
    unique.forEach(id => {
      const log = cachedLogs.find(l => l && (l.device?.id || l.clientIp) === id);
      if (!log) return;
      const name = deviceAliases[id] || log.device?.name || id;
      deviceDropdown.insertAdjacentHTML('beforeend', `<option value="${id}">${escapeHTML(name)}</option>`);
    });
  }

  const filtered = cachedLogs.filter(log => {
    if (!log) return false;
    const domain = (log.name || log.domain || '').toLowerCase();
    const id = log.device?.id || log.clientIp;
    const type = (log.protocol || '').toLowerCase();
    const status = (log.status === 'allowed' || log.status === 'whitelisted') ? 'status:allowed' : 'status:blocked';
    
    const isWhite = log.status === 'whitelisted' || log.reasons?.some(r => r.name.toLowerCase().includes('allowlist'));
    const isBlack = log.reasons?.some(r => r.name.toLowerCase().includes('denylist'));

    if (textFilter && !domain.includes(textFilter)) return false;
    if (deviceFilter && id !== deviceFilter) return false;
    if (typeFilter && !type.includes(typeFilter)) return false;
    if (!activeFilters.includes(status)) return false;
    
    // Fix: OR logic for 'Only' filters
    const reasonFilters = activeFilters.filter(f => f.startsWith('reason:'));
    if (reasonFilters.length > 0) {
      const matchAllow = reasonFilters.includes('reason:allowlist') && isWhite;
      const matchDeny = reasonFilters.includes('reason:denylist') && isBlack;
      if (!matchAllow && !matchDeny) return false;
    }
    
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted); font-size:0.9em;'>No logs match the current filters.</div>";
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach(log => {
    try {
      const row = document.createElement('div');
      row.className = 'log-row';
      const isBlocked = log.status === 'blocked';
      row.style.color = isBlocked ? '#dc3545' : '#28a745';
      const name = deviceAliases[log.device?.id || log.clientIp] || log.device?.name || log.device?.id || log.clientIp || 'Unknown Device';
      
      let timeStr = "---";
      if (log.timestamp) {
        const d = new Date(log.timestamp);
        timeStr = isNaN(d.getTime()) ? "Invalid Time" : d.toLocaleTimeString();
      }

      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:0.75em; color:var(--text-muted);">
          <span>🕒 ${timeStr} | 📱 ${escapeHTML(name)} | 🌐 ${log.protocol || 'DNS'}</span>
          <span style="font-weight:bold;">${isBlocked ? 'BLOCKED' : 'ALLOWED'}</span>
        </div>
        <div style="font-weight:bold; margin-top:2px; word-break:break-all;">${escapeHTML(log.name || log.domain || 'Unknown Domain')}</div>
      `;
      fragment.appendChild(row);
    } catch (e) {
      console.error("Error rendering log row:", e, log);
    }
  });
  
  container.innerHTML = "";
  container.appendChild(fragment);
}

async function loadSettings() {
  const s = await browser.storage.sync.get(["apiKey", "autoRefreshDefault", "blockNotif", "autoRefreshTime", "iconAction", "enableLabs", "overrideProfileId"]);
  const apiKeyInput = document.getElementById("setting-api-key");
  if (apiKeyInput) apiKeyInput.value = s.apiKey || "";
  const autoRefreshInput = document.getElementById("setting-auto-refresh");
  if (autoRefreshInput) autoRefreshInput.checked = s.autoRefreshDefault !== false;
  const blockNotifInput = document.getElementById("setting-block-notif");
  if (blockNotifInput) blockNotifInput.checked = !!s.blockNotif;
  const refreshTimeInput = document.getElementById("setting-refresh-time");
  if (refreshTimeInput) refreshTimeInput.value = s.autoRefreshTime || 5;
  const iconActionInput = document.getElementById("setting-icon-action");
  if (iconActionInput) iconActionInput.value = s.iconAction || "popup";
  const enableLabsInput = document.getElementById("setting-enable-labs");
  if (enableLabsInput) enableLabsInput.checked = !!s.enableLabs;
  const labTab = document.getElementById("tab-btn-labs");
  if (labTab) labTab.style.display = s.enableLabs ? 'block' : 'none';
  if (s.apiKey) fetchProfiles();
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

async function saveSettings() {
  const btn = document.getElementById("save-settings-btn");
  await browser.storage.sync.set({
    apiKey: document.getElementById("setting-api-key").value.trim(),
    overrideProfileId: document.getElementById("setting-profile-select").value,
    autoRefreshDefault: document.getElementById("setting-auto-refresh").checked,
    blockNotif: document.getElementById("setting-block-notif").checked,
    autoRefreshTime: document.getElementById("setting-refresh-time").value,
    iconAction: document.getElementById("setting-icon-action").value,
    enableLabs: document.getElementById("setting-enable-labs").checked
  });
  if (btn) { btn.textContent = "✅ Saved!"; setTimeout(() => { btn.textContent = "💾 Save Options"; }, 2000); }
  initializeApp();
}

async function downloadLogs() {
  const btn = document.getElementById("download-logs-btn");
  if (btn) btn.textContent = "⏳...";
  const csv = await browser.runtime.sendMessage({ type: "DOWNLOAD_LOGS_CSV", profileId: activeProfile });
  if (csv) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `logs_${activeProfile}.csv`; a.click();
    if (btn) btn.textContent = "✅ Done";
  } else if (btn) btn.textContent = "❌ Error";
  if (btn) setTimeout(() => { btn.textContent = "📥 Download Logs (CSV)"; }, 3000);
}

async function wipeLogs() {
  if (confirm("Clear all logs?")) {
    await browser.runtime.sendMessage({ type: "CLEAR_LOGS", profileId: activeProfile });
    cachedLogs = []; renderLogs();
  }
}

async function loadAnalytics() {
  const res = await browser.runtime.sendMessage({ type: "GET_ANALYTICS", profileId: activeProfile });
  const container = document.getElementById("analytics-overview");
  if (res?.data && container) {
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div class="panel-box">Queries: ${res.data.queries.toLocaleString()}</div>
        <div class="panel-box">Blocked: ${res.data.blockedQueries.toLocaleString()}</div>
      </div>`;
  } else if (container) container.innerHTML = "No analytics data.";
}

function renderAliases() {
  const container = document.getElementById("hostname-alias-list");
  if (container) container.innerHTML = Object.entries(deviceAliases).map(([id, name]) => `
    <div style="display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid var(--border-color);">
      <span><b>${escapeHTML(name)}</b> (${escapeHTML(id)})</span>
      <button class="btn-deny" style="width:auto; padding:2px 8px;" onclick="deleteAlias('${id}')">Remove</button>
    </div>
  `).join('') || "No aliases.";
}

window.deleteAlias = async (id) => { delete deviceAliases[id]; await browser.storage.sync.set({ aliases: deviceAliases }); renderAliases(); };

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
    container.innerHTML = domains.map(d => {
      const r = requests[d];
      const color = r.status === 'blocked' ? '#dc3545' : (r.reason === 'Allow List' ? '#28a745' : 'inherit');
      const reasonLabel = r.reason !== 'Default' ? `<span style="font-size: 0.8em; opacity: 0.7; margin-left: 5px;">[${r.reason}]</span>` : '';
      return `<div style="padding:4px; color:${color}">${escapeHTML(d)}${reasonLabel}</div>`;
    }).join('');
  }
  
  const score = document.getElementById("privacy-score");
  if (score) {
    const blockedCount = stats?.blockedCount || 0;
    const uDomains = domains.length;
    let grade = "-";
    if (uDomains > 0) {
      const ratio = blockedCount / uDomains;
      if (ratio > 0.5) grade = "A+"; else if (ratio > 0.3) grade = "A"; else if (ratio > 0.15) grade = "B"; else if (ratio > 0.05) grade = "C"; else grade = "D";
    }
    score.textContent = grade;
  }
}

async function snoozeDomain() {
  const input = document.getElementById("domain-input");
  if (!input) return;
  const d = input.value.trim();
  if (d && activeProfile) {
    await browser.runtime.sendMessage({ type: "TEMP_ALLOW", profileId: activeProfile, domain: d });
    input.style.borderColor = "#f39c12";
  }
}

async function executeAction(type) {
  const input = document.getElementById("domain-input");
  if (!input) return;
  const d = input.value.trim();
  if (d && activeProfile) {
    await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: type, domain: d, action: "add" });
    input.style.borderColor = type === 'allowlist' ? "#28a745" : "#dc3545";
    syncLists(true);
  }
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
    <div class="list-item">
      <span>${escapeHTML(i.id)}</span>
      <button class="btn-deny" style="width:auto;" data-delete="${escapeHTML(i.id)}">❌</button>
    </div>`).join('') || "List is empty.";
}

async function deleteListItem(domain) {
  const listTypeSelect = document.getElementById("list-type-select");
  const listType = listTypeSelect ? listTypeSelect.value : 'denylist';
  await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, domain, action: "delete" });
  loadManagerList(true);
}

async function addListItem() {
  const dInput = document.getElementById("list-new-domain");
  const d = dInput ? dInput.value.trim() : "";
  const listTypeSelect = document.getElementById("list-type-select");
  const listType = listTypeSelect ? listTypeSelect.value : 'denylist';
  if (d && activeProfile) {
    await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, domain: d, action: "add" });
    if (dInput) dInput.value = "";
    loadManagerList(true);
  }
}

let lastBlocksData = null;
let activeBlocksSubTab = 'security';
const SETTING_GROUPS = {
  security: { 
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
  },
  privacy: { 
    items: [
      { id: 'disguisedTrackers', label: 'Block Disguised Trackers' },
      { id: 'allowAffiliate', label: 'Allow Affiliate Links' }
    ],
    natives: [
      { id: 'windows', label: 'Windows' },
      { id: 'apple', label: 'Apple' },
      { id: 'samsung', label: 'Samsung' },
      { id: 'huawei', label: 'Huawei' },
      { id: 'xiaomi', label: 'Xiaomi' },
      { id: 'sonos', label: 'Sonos' },
      { id: 'roku', label: 'Roku' },
      { id: 'alexa', label: 'Alexa' }
    ]
  },
  parental: { 
    items: [
      { id: 'safeSearch', label: 'SafeSearch' },
      { id: 'youtubeRestrictedMode', label: 'YouTube Restricted Mode' }
    ]
  }
};

async function loadToggles(force = false) {
  if (force) lastBlocksData = null;
  if (!activeProfile) return;
  if (!lastBlocksData) {
    const res = await browser.runtime.sendMessage({ type: "GET_ALL_SETTINGS", profileId: activeProfile });
    lastBlocksData = res?.data || {};
  }

  const container = document.getElementById("toggles-container");
  const searchContainer = document.getElementById("blocks-search-container");
  const searchInput = document.getElementById("blocks-search-input");
  if (!container) return;

  const query = searchInput ? searchInput.value.toLowerCase() : "";
  const sortSelect = document.getElementById("blocks-sort-select");
  
  if (searchContainer) {
    searchContainer.style.display = (activeBlocksSubTab === 'blocklists' || activeBlocksSubTab === 'parental' || activeBlocksSubTab === 'tlds') ? 'flex' : 'none';
    if (sortSelect) sortSelect.style.display = (activeBlocksSubTab === 'blocklists') ? 'block' : 'none';
  }

  let html = '';
  if (activeBlocksSubTab === 'security') {
    html += (SETTING_GROUPS.security.items || []).map(i => renderToggleRow(i, 'security', !!lastBlocksData.security?.[i.id], 'boolean')).join('');
  } else if (activeBlocksSubTab === 'privacy') {
    html += '<div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Tracking</div>';
    html += (SETTING_GROUPS.privacy.items || []).map(i => renderToggleRow(i, 'privacy', !!lastBlocksData.privacy?.[i.id], 'boolean')).join('');
    html += '<hr style="border-top:1px solid var(--border-color); border-bottom:0; margin:10px 0;"><div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Native Tracking</div>';
    html += (SETTING_GROUPS.privacy.natives || []).map(i => {
       const isActive = lastBlocksData.natives?.some(n => n.id === i.id && n.active);
       return renderToggleRow(i, 'privacy/natives', isActive, 'list');
    }).join('');
  } else if (activeBlocksSubTab === 'blocklists') {
    const activeIds = new Set((lastBlocksData.blocklists || []).map(l => l.id));
    let filtered = blocksMeta.blocklists.filter(b => b.name.toLowerCase().includes(query) || b.description.toLowerCase().includes(query));
    
    // Sort logic
    if (activeBlocksSort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (activeBlocksSort === 'updated') filtered.sort((a, b) => b.updated_ts - a.updated_ts);
    else if (activeBlocksSort === 'popularity') filtered.sort((a, b) => b.popularity - a.popularity);
    else if (activeBlocksSort === 'entries') filtered.sort((a, b) => b.entries - a.entries);

    html += filtered.map(b => {
      const active = activeIds.has(b.id);
      return `
        <div style="padding: 10px; border-bottom: 1px solid var(--border-color); background: var(--bg-panel); margin-bottom: 5px; border-radius: 4px;">
          <div style="display:flex; justify-content:space-between; align-items: flex-start;">
            <div style="flex-grow: 1; padding-right: 10px;">
              <div style="font-weight:bold; font-size: 0.9em;">${escapeHTML(b.name)}</div>
              <div style="font-size: 0.8em; opacity: 0.7; margin: 4px 0;">${escapeHTML(b.description)}</div>
              <div style="font-size: 0.75em; opacity: 0.5;">${escapeHTML(b.entries)} entries • Updated ${escapeHTML(b.updated)}</div>
            </div>
            <button class="api-toggle-btn ${active?'btn-deny':'btn-allow'}" data-cat="privacy/blocklists" data-id="${b.id}" data-type="list" data-active="${active}" style="width:auto; padding:4px 12px; font-size: 0.8em;">${active?'Remove':'Add'}</button>
          </div>
        </div>`;
    }).join('') || '<div style="text-align:center; opacity:0.5; padding:20px;">No blocklists found.</div>';
  } else if (activeBlocksSubTab === 'parental') {
    html += '<div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Global Settings</div>';
    html += (SETTING_GROUPS.parental?.items || [
      { id: 'safeSearch', label: 'SafeSearch' },
      { id: 'youtubeRestrictedMode', label: 'YouTube Restricted Mode' }
    ]).map(i => renderToggleRow(i, 'parentalcontrol', !!lastBlocksData.parentalcontrol?.[i.id], 'boolean')).join('');
    
    html += '<hr style="border-top:1px solid var(--border-color); border-bottom:0; margin:10px 0;"><div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Categories</div>';
    html += (blocksMeta.categories || []).map(c => {
      const isActive = lastBlocksData.categories?.some(cat => cat.id === c.id && cat.active);
      return renderToggleRow(c, 'parentalcontrol/categories', isActive, 'list');
    }).join('');

    html += '<hr style="border-top:1px solid var(--border-color); border-bottom:0; margin:10px 0;"><div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Services</div>';
    const activeServices = new Set((lastBlocksData.services || []).map(s => s.id));
    const filteredServices = blocksMeta.parental_services.filter(s => s.name.toLowerCase().includes(query));
    html += filteredServices.map(s => {
       const isActive = activeServices.has(s.id);
       return renderToggleRow({ id: s.id, label: s.name }, 'parentalcontrol/services', isActive, 'list');
    }).join('');
  } else if (activeBlocksSubTab === 'tlds') {
    const activeTlds = new Set((lastBlocksData.tlds || []).map(t => t.id));
    const groups = {};
    blocksMeta.tlds.forEach(tld => {
      if (query && !tld.toLowerCase().includes(query)) return;
      
      const addToList = (letter) => {
        letter = letter.toUpperCase();
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push(tld);
      };

      const firstLetter = tld[0];
      addToList(firstLetter);

      // Handle 2-part TLDs like co.uk
      if (tld.includes('.')) {
        const parts = tld.split('.');
        parts.forEach((p, idx) => {
          if (idx > 0) addToList(p[0]);
        });
      }
    });

    const sortedLetters = Object.keys(groups).sort();
    html += sortedLetters.map(letter => `
      <div style="margin-top: 15px;">
        <div style="font-weight:bold; border-bottom:1px solid var(--border-color); margin-bottom:5px; padding-bottom: 2px;">${letter}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
          ${groups[letter].map(t => {
            const active = activeTlds.has(t);
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; padding: 2px 0;">
                <span style="font-size: 0.85em;">.${escapeHTML(t)}</span>
                <button class="api-toggle-btn ${active?'btn-deny':'btn-allow'}" data-cat="security/tlds" data-id="${t}" data-type="list" data-active="${active}" style="width:auto; padding:1px 6px; font-size: 0.7em;">${active?'OFF':'ON'}</button>
              </div>`;
          }).join('')}
        </div>
      </div>
    `).join('') || '<div style="text-align:center; opacity:0.5; padding:20px;">No TLDs found.</div>';
  }
  container.innerHTML = html;
}

function renderToggleRow(item, cat, active, type) {
  return `
    <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items: center;">
      <span style="font-size: 0.9em;">${escapeHTML(item.label || item.name)}</span>
      <button class="api-toggle-btn ${active?'btn-allow':'btn-secondary'}" data-cat="${cat}" data-id="${item.id}" data-type="${type}" data-active="${active}" style="width:auto; padding:2px 8px; font-size: 0.8em;">${active?'ON':'OFF'}</button>
    </div>`;
}

async function toggleApiSetting(btn) {
  const cat = btn.getAttribute('data-cat');
  const id = btn.getAttribute('data-id');
  const type = btn.getAttribute('data-type');
  const active = btn.getAttribute('data-active') === 'true';
  
  btn.disabled = true;
  btn.style.opacity = '0.5';
  
  const res = await browser.runtime.sendMessage({ type: "TOGGLE_SETTING", profileId: activeProfile, category: cat, id, action: active ? "delete" : "add", settingType: type });
  
  if (res?.success) {
    lastBlocksData = null; 
    await loadToggles();
  } else {
    btn.disabled = false;
    btn.style.opacity = '1';
    alert("Failed to update setting: " + (res?.error || "Unknown error"));
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
