const INTERNAL_API = "https://api.nextdns.io/profiles";

let webGuiConfig = { master: true, tlds: true, blocklists: true, logs: true, desc: true, notes: true, filter: true, forcedTheme: 'default' };
let domSelectors = null;
let hostnameAliases = {};

// Initialize config and listen for live changes
async function initConfig() {

  try {
    const url = browser.runtime.getURL("src/domSelectors.json");
    const res = await fetch(url);
    domSelectors = await res.json();
  } catch (e) {
    console.error("[DNS Forge] Failed to load domSelectors.json", e);
  }

  const sync = await browser.storage.sync.get(["webGuiMaster", "webGuiTlds", "webGuiBlocklists", "webGuiLogActions", "webGuiDesc", "webGuiProfileNotes", "webGuiFilter", "webGuiForcedTheme", "hostnameAliases"]);
  const local = await browser.storage.local.get(["webGuiMaster", "webGuiTlds", "webGuiBlocklists", "webGuiLogActions", "webGuiDesc", "webGuiProfileNotes", "webGuiFilter", "webGuiForcedTheme", "hostnameAliases"]);
  const res = { ...local, ...sync };

  if (res.webGuiMaster !== undefined) webGuiConfig.master = res.webGuiMaster;
  if (res.webGuiTlds !== undefined) webGuiConfig.tlds = res.webGuiTlds;
  if (res.webGuiBlocklists !== undefined) webGuiConfig.blocklists = res.webGuiBlocklists;
  if (res.webGuiLogActions !== undefined) webGuiConfig.logs = res.webGuiLogActions;
  if (res.webGuiDesc !== undefined) webGuiConfig.desc = res.webGuiDesc;
  if (res.webGuiProfileNotes !== undefined) webGuiConfig.notes = res.webGuiProfileNotes;
  if (res.webGuiFilter !== undefined) webGuiConfig.filter = res.webGuiFilter;
  if (res.webGuiForcedTheme !== undefined) webGuiConfig.forcedTheme = res.webGuiForcedTheme;
  
  hostnameAliases = res.hostnameAliases || {};
  
  setupSectionCollapsing();
  applyForcedTheme();
  setupThemeObserver();
}

function setupSectionCollapsing() {
    const headers = document.querySelectorAll('h4, h5');
    headers.forEach(header => {
        if (header.dataset.nxmProcessed) return;
        header.dataset.nxmProcessed = "true";
        header.classList.add('nxm-collapsible-header');
        
        const btn = document.createElement('span');
        btn.className = 'nxm-collapse-btn';
        btn.style.marginLeft = '10px';
        btn.textContent = '▼';
        header.appendChild(btn);

        header.onclick = () => {
            let next = header.nextElementSibling;
            const isHidden = next && next.style.display === 'none';
            btn.textContent = isHidden ? '▼' : '▶';
            while (next && !['H4', 'H5'].includes(next.tagName)) {
                next.style.display = isHidden ? '' : 'none';
                next = next.nextElementSibling;
            }
        };
    });
}


initConfig().then(evaluatePage);

/**
 * Unified UI Cleanup
 */
function cleanupUI() {
    console.log("[DNS Forge] Running full UI cleanup.");
    // Remove all Forge-injected UI components
    const idsToRemove = [
        'nxm-tld-controls', 'nxm-modal-enable-all', 'nxm-modal-disable-all', 
        'nxm-privacy-controls', 'nxm-logs-filter-group', 'nxm-profile-note',
        'nxm-progress-ui', 'nxm-filter-modal-backdrop',
        'nxm-header-filtered-logs-btn', 'nxm-dropdown-filtered-logs-item'
    ];
    idsToRemove.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'nxm-tld-controls' || id === 'nxm-privacy-controls') restoreFeatureUI(id);
            el.remove();
        }
    });

    document.querySelectorAll('.nxm-log-actions, .nxm-domain-desc').forEach(el => el.remove());
    
    // Remove forced theme classes
    document.documentElement.classList.remove('nxm-forced-dark', 'nxm-forced-light');
    if (document.body) {
        document.body.classList.remove('nxm-forced-dark', 'nxm-forced-light');
    }

    // Restore all hidden elements
    document.querySelectorAll('[data-nxm-hidden="true"]').forEach(el => {
        el.style.display = "";
        delete el.dataset.nxmHidden;
        delete el.dataset.nxmOwner;
    });

    // Restore filtered logs
    document.querySelectorAll('.list-group-item[style*="display: none"]').forEach(el => {
        if (el.dataset.nxmFiltered) {
            el.style.display = "";
            delete el.dataset.nxmFiltered;
        }
    });
}

function evaluatePage() {
    const path = window.location.pathname;

    // API Key Auto-Extraction
    if (path.endsWith('/account')) {
        extractApiKey();
    }

    if (!webGuiConfig.master) {
        cleanupUI();
        return;
    }

    // Global web console enhancements
    applyForcedTheme();
    injectHeaderFilteredLogsButton();

    // Targeted feature management
    manageFeature('tlds', 'nxm-tld-controls', path.endsWith('/security'), () => {
        scrapeTLDs();
        injectPageButtons();
        injectModalButtons();
        if (webGuiConfig.desc) injectDomainDescriptions();
    });

    manageFeature('blocklists', 'nxm-privacy-controls', path.endsWith('/privacy'), () => {
        scrapeBlocklists();
        injectPrivacyButtons();
        if (webGuiConfig.desc) injectDomainDescriptions();
    });

    if (webGuiConfig.notes) injectProfileNote();
    injectProfileSwitcher();

    if (path.endsWith('/parentalcontrol')) {
        scrapeServices();
    } else if (path.endsWith('/logs')) {
        if (webGuiConfig.logs) injectLogActions();
        if (webGuiConfig.filter) applyLogFilters();
        injectLogsSettingsControls();
    }
}

function manageFeature(configKey, uiId, isCorrectPage, injectFn) {
    const isEnabled = webGuiConfig[configKey];
    const exists = document.getElementById(uiId);

    if (!isEnabled || !isCorrectPage) {
        if (exists) {
            console.log(`[DNS Forge] Disabling feature: ${uiId}`);
            exists.remove();
            restoreFeatureUI(uiId);
        }
        return;
    }

    if (!exists) {
        injectFn();
    }
}

function restoreFeatureUI(ownerId) {
    document.querySelectorAll(`[data-nxm-owner="${ownerId}"]`).forEach(el => {
        el.style.display = "";
        delete el.dataset.nxmHidden;
        delete el.dataset.nxmOwner;
    });
}

browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" || area === "local") {
        let changed = false;
        const keys = ["webGuiMaster", "webGuiTlds", "webGuiBlocklists", "webGuiLogActions", "webGuiDesc", "webGuiProfileNotes", "webGuiFilter", "webGuiForcedTheme"];
        keys.forEach(k => {
            if (changes[k] && changes[k].newValue !== undefined) {
                const configKey = k.replace(/^webGui/, '').toLowerCase();
                const map = {
                    'master': 'master',
                    'tlds': 'tlds',
                    'blocklists': 'blocklists',
                    'logactions': 'logs',
                    'desc': 'desc',
                    'profilenotes': 'notes',
                    'filter': 'filter',
                    'forcedtheme': 'forcedTheme'
                };
                const targetKey = map[configKey] || configKey;
                webGuiConfig[targetKey] = changes[k].newValue;
                changed = true;
                console.log(`[DNS Forge] Config changed: ${targetKey} = ${webGuiConfig[targetKey]}`);
            }
        });
        
        if (changed) {
            // We don't call cleanupUI() here because manageFeature handles it surgically.
            // But if master is toggled, we should.
            if (changes.webGuiMaster) cleanupUI();
            if (changes.webGuiForcedTheme) applyForcedTheme();
            evaluatePage();
        }
    }
});

let mutationTimer;
const observer = new MutationObserver((mutations) => {
    // 1. Core suppression & aliasing
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.classList && node.classList.contains('modal')) {
                        if (node.textContent.includes('Network Error')) {
                            node.style.display = 'none';
                            node.style.opacity = '0';
                            console.warn("[DNS Forge] Suppressed NextDNS Network Error modal.");
                            showToast("Reconnecting to NextDNS...");
                        } else if (node.textContent.includes('Add a blocklist')) {
                            setTimeout(() => injectBlocklistModalSort(node), 100);
                        }
                    }
                    applyDeviceAliases(node);
                }
            });
        }
    }

    // 2. Throttled logic for UI enhancements
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
        evaluatePage();
        setupSectionCollapsing();
    }, 100);
});

function applyDeviceAliases(root) {
    if (!Object.keys(hostnameAliases).length) return;
    
    // Target device ID spans in Logs and Analytics
    const elements = root.querySelectorAll('.notranslate');
    elements.forEach(el => {
        const id = el.textContent.trim();
        if (hostnameAliases[id]) {
            el.textContent = "";
            const span = document.createElement('span');
            span.title = `ID: ${id}`;
            span.style.borderBottom = '1px dashed var(--accent)';
            span.style.cursor = 'help';
            span.textContent = hostnameAliases[id];
            el.appendChild(span);
        }
    });
}

function showToast(message) {
    let toast = document.getElementById('nxm-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'nxm-toast';
        toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:#333; color:#fff; padding:10px 20px; border-radius:8px; z-index:999999; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-size:14px; transition: opacity 0.3s ease; opacity: 0;';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

observer.observe(document.body, { childList: true, subtree: true });

async function extractApiKey() {
  const elements = [
    ...Array.from(document.querySelectorAll('code')),
    ...Array.from(document.querySelectorAll('input')),
    ...Array.from(document.querySelectorAll('.api-key'))
  ];
  
  const apiKeyEl = elements.find(el => {
    const val = (el.tagName === 'INPUT' ? el.value : el.textContent).trim();
    return /^[a-f0-9]{24}$/.test(val);
  });
  
  if (apiKeyEl) {
    const newKey = (apiKeyEl.tagName === 'INPUT' ? apiKeyEl.value : apiKeyEl.textContent).trim();
    const sync = await browser.storage.sync.get("apiKey");
    const local = await browser.storage.local.get("apiKey");
    const currentKey = sync.apiKey || local.apiKey;
    
    if (newKey && newKey !== currentKey) {
      await Promise.all([
        browser.storage.sync.set({ apiKey: newKey }),
        browser.storage.local.set({ apiKey: newKey })
      ]);
      console.log("[DNS Forge] API Key auto-extracted and synced.");
    }
  }
}

// --- UI Injection ---

async function injectPrivacyButtons() {
  if (document.getElementById('nxm-privacy-controls')) return;
  
  let h5;
  if (domSelectors?.dashboard?.blocklistHeader) {
      const sel = domSelectors.dashboard.blocklistHeader;
      h5 = Array.from(document.querySelectorAll(sel.selector)).find(el => el.textContent.trim() === sel.textMatches);
  } else {
      h5 = Array.from(document.querySelectorAll('h5')).find(el => el.textContent.trim() === 'Blocklists');
  }
  const headerItem = h5?.closest('.list-group-item');

  if (headerItem && h5) {
    const btnGroup = document.createElement('div');
    btnGroup.id = 'nxm-privacy-controls';
    btnGroup.style.cssText = 'display: inline-flex; gap: 8px; margin-left: 12px; vertical-align: middle; align-items: center;';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'nxm-search-blocklists';
    searchInput.placeholder = 'Filter Blocklists...';
    searchInput.className = 'form-control form-control-sm';
    searchInput.style.cssText = 'height: 22px; width: 150px; font-size: 0.75em;';

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'nxm-toggle-blocklists';
    toggleBtn.className = 'btn btn-secondary';
    toggleBtn.style.cssText = 'background: #6c757d; border-color: #6c757d; padding: 1px 8px; font-size: 0.75em; height: 22px; line-height: 1;';
    toggleBtn.setAttribute('aria-label', 'Toggle Blocklists');
    toggleBtn.textContent = '👁️ Toggle List';

    btnGroup.append(searchInput, toggleBtn);
    
    h5.style.display = 'inline-block';
    h5.style.margin = '0';
    h5.after(btnGroup);

    const listGroup = headerItem.parentElement;
    if (listGroup) {
      const toggleList = () => {
        const siblings = Array.from(listGroup.children).filter(child => child !== headerItem);
        const isCurrentlyHidden = siblings.some(s => s.style.display === 'none' && !s.dataset.nxmFiltered);
        siblings.forEach(s => {
          if (!s.dataset.nxmFiltered) {
              s.style.display = isCurrentlyHidden ? '' : 'none';
          }
          if (!isCurrentlyHidden) {
              s.dataset.nxmHidden = "true";
              s.dataset.nxmOwner = "nxm-privacy-controls";
          } else {
              delete s.dataset.nxmHidden;
              delete s.dataset.nxmOwner;
          }
        });
      };

      // Initial rollup
      const siblings = Array.from(listGroup.children).filter(child => child !== headerItem);
      siblings.forEach(s => {
        s.style.display = 'none';
        s.dataset.nxmHidden = "true";
        s.dataset.nxmOwner = "nxm-privacy-controls";
      });

      document.getElementById('nxm-toggle-blocklists').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        toggleList();
      };

      // Search functionality
      document.getElementById('nxm-search-blocklists').oninput = (e) => {
          const query = e.target.value.toLowerCase();
          siblings.forEach(s => {
              const text = s.textContent.toLowerCase();
              if (text.includes(query)) {
                  s.style.display = '';
                  delete s.dataset.nxmFiltered;
              } else {
                  s.style.display = 'none';
                  s.dataset.nxmFiltered = "true";
              }
          });
      };
    }
  }
}

async function injectPageButtons() {
  if (document.getElementById('nxm-tld-controls')) return;
  
  let h5;
  if (domSelectors?.dashboard?.tldHeader) {
      const sel = domSelectors.dashboard.tldHeader;
      h5 = Array.from(document.querySelectorAll(sel.selector)).find(el => el.textContent.includes(sel.textMatches));
  } else {
      h5 = Array.from(document.querySelectorAll('h5')).find(el => el.textContent.includes('Block Top-Level Domains (TLDs)'));
  }
  const headerItem = h5?.closest('.list-group-item');

  if (headerItem && h5) {
    const btnGroup = document.createElement('div');
    btnGroup.id = 'nxm-tld-controls';
    btnGroup.style.cssText = 'display: inline-flex; gap: 6px; margin-left: 12px; vertical-align: middle; align-items: center;';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'nxm-search-tlds';
    searchInput.placeholder = 'Filter TLDs...';
    searchInput.className = 'form-control form-control-sm';
    searchInput.style.cssText = 'height: 22px; width: 120px; font-size: 0.75em;';

    const enableAllBtn = document.createElement('button');
    enableAllBtn.id = 'nxm-enable-all';
    enableAllBtn.className = 'btn btn-primary';
    enableAllBtn.style.cssText = 'padding: 1px 8px; font-size: 0.75em; height: 22px; line-height: 1;';
    enableAllBtn.textContent = 'Enable ALL';

    const disableAllBtn = document.createElement('button');
    disableAllBtn.id = 'nxm-disable-all';
    disableAllBtn.className = 'btn btn-danger';
    disableAllBtn.style.cssText = 'padding: 1px 8px; font-size: 0.75em; height: 22px; line-height: 1;';
    disableAllBtn.textContent = 'Disable ALL';

    const restoreBtn = document.createElement('button');
    restoreBtn.id = 'nxm-restore';
    restoreBtn.className = 'btn btn-secondary';
    restoreBtn.style.cssText = 'display: none; padding: 1px 8px; font-size: 0.75em; height: 22px; line-height: 1;';
    restoreBtn.textContent = 'Restore';

    const toggleTableBtn = document.createElement('button');
    toggleTableBtn.id = 'nxm-toggle-table';
    toggleTableBtn.className = 'btn btn-secondary';
    toggleTableBtn.style.cssText = 'background: #6c757d; border-color: #6c757d; padding: 1px 8px; font-size: 0.75em; height: 22px; line-height: 1;';
    toggleTableBtn.setAttribute('aria-label', 'Toggle TLDs');
    toggleTableBtn.textContent = '👁️ Toggle';

    btnGroup.append(searchInput, enableAllBtn, disableAllBtn, restoreBtn, toggleTableBtn);
    
    h5.style.display = 'inline-block';
    h5.style.margin = '0';
    h5.after(btnGroup);

    const listGroup = headerItem.parentElement;
    if (listGroup) {
      const toggleList = () => {
        const siblings = Array.from(listGroup.children).filter(child => child !== headerItem);
        const isCurrentlyHidden = siblings.some(s => s.style.display === 'none' && !s.dataset.nxmFiltered);
        siblings.forEach(s => {
          if (!s.dataset.nxmFiltered) {
              s.style.display = isCurrentlyHidden ? '' : 'none';
          }
          if (!isCurrentlyHidden) {
              s.dataset.nxmHidden = "true";
              s.dataset.nxmOwner = "nxm-tld-controls";
          } else {
              delete s.dataset.nxmHidden;
              delete s.dataset.nxmOwner;
          }
        });
      };

      // Initial rollup
      const siblings = Array.from(listGroup.children).filter(child => child !== headerItem);
      siblings.forEach(s => {
        s.style.display = 'none';
        s.dataset.nxmHidden = "true";
        s.dataset.nxmOwner = "nxm-tld-controls";
      });

      document.getElementById('nxm-toggle-table').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        toggleList();
      };

      // Search functionality
      document.getElementById('nxm-search-tlds').oninput = (e) => {
          const query = e.target.value.toLowerCase();
          siblings.forEach(s => {
              const text = s.textContent.toLowerCase();
              if (text.includes(query)) {
                  s.style.display = '';
                  delete s.dataset.nxmFiltered;
              } else {
                  s.style.display = 'none';
                  s.dataset.nxmFiltered = "true";
              }
          });
      };
    }

    document.getElementById('nxm-enable-all').onclick = handleEnableAll;
    document.getElementById('nxm-disable-all').onclick = handleDisableAll;
    document.getElementById('nxm-restore').onclick = handleRestore;
    
    checkBackupStatus();
  }
}

async function injectLogsSettingsControls() {
  if (document.getElementById('nxm-logs-filter-group')) return;

  let headerContainer;
  if (domSelectors?.dashboard?.logsHeader) {
      headerContainer = document.querySelector(domSelectors.dashboard.logsHeader.selector);
  } else {
      headerContainer = document.querySelector('.Logs .list-group-item.bg-2 .d-md-flex');
  }
  if (!headerContainer) return;

  const group = document.createElement('div');
  group.id = 'nxm-logs-filter-group';
  group.className = 'd-flex mt-3 ms-md-5'; 

  const switchWrapper = document.createElement('div');
  switchWrapper.className = 'd-flex align-items-center';
  switchWrapper.style.transform = 'scale(0.9)';
  switchWrapper.style.marginTop = '-10px';
  switchWrapper.style.marginBottom = '-10px';

  const formCheck = document.createElement('div');
  formCheck.className = 'form-check form-switch';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'nxm-filtered-logs-toggle';
  checkbox.className = 'form-check-input';
  checkbox.style.cursor = 'pointer';
  checkbox.checked = webGuiConfig.filter;
  checkbox.onchange = async (e) => {
    await browser.storage.sync.set({ webGuiFilter: e.target.checked });
  };

  const label = document.createElement('label');
  label.htmlFor = 'nxm-filtered-logs-toggle';
  label.className = 'form-check-label';

  formCheck.appendChild(checkbox);
  formCheck.appendChild(label);
  switchWrapper.appendChild(formCheck);

  const textWrapper = document.createElement('div');
  textWrapper.className = 'd-flex align-items-center';
  textWrapper.style.opacity = '0.7';
  textWrapper.style.whiteSpace = 'nowrap';
  
  const small = document.createElement('small');
  small.textContent = 'Filtered Logs';
  small.style.cursor = 'pointer';
  small.onclick = () => checkbox.click();

  const manageBtn = document.createElement('button');
  manageBtn.id = 'nxm-manage-filters-btn';
  manageBtn.className = 'btn btn-sm btn-outline-info ms-2';
  manageBtn.style.cssText = 'padding: 1px 8px; font-size: 0.75rem; border-radius: 10px; line-height: 1.3; font-weight: 600; cursor: pointer;';
  manageBtn.title = 'Manage Filtered Logs Popup';
  manageBtn.textContent = '⚙️ Manage';
  manageBtn.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    openFilteredLogsModal();
  };

  textWrapper.appendChild(small);
  textWrapper.appendChild(manageBtn);
  group.appendChild(switchWrapper);
  group.appendChild(textWrapper);
  updateFilterCountBadge();
  
  // Phase 2.5: Compact Mode, Highlighting, and Search
  const extraControls = document.createElement('div');
  extraControls.className = 'd-flex align-items-center gap-3 ms-4';
  const highlightDiv = document.createElement('div');
  highlightDiv.className = 'form-check form-switch';
  highlightDiv.title = 'Highlight blocked rows in red and allowed in green';

  const highlightInput = document.createElement('input');
  highlightInput.className = 'form-check-input';
  highlightInput.type = 'checkbox';
  highlightInput.id = 'nxm-logs-highlight';
  highlightInput.checked = true;

  const highlightLabel = document.createElement('label');
  highlightLabel.className = 'form-check-label';
  highlightLabel.style.cssText = 'font-size:0.8em; margin-left: 5px;';
  highlightLabel.textContent = 'Highlight';
  highlightDiv.append(highlightInput, highlightLabel);

  const compactDiv = document.createElement('div');
  compactDiv.className = 'form-check form-switch';
  compactDiv.title = 'Reduce vertical padding in logs';

  const compactInput = document.createElement('input');
  compactInput.className = 'form-check-input';
  compactInput.type = 'checkbox';
  compactInput.id = 'nxm-logs-compact';

  const compactLabel = document.createElement('label');
  compactLabel.className = 'form-check-label';
  compactLabel.style.cssText = 'font-size:0.8em; margin-left: 5px;';
  compactLabel.textContent = 'Compact';
  compactDiv.append(compactInput, compactLabel);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'nxm-logs-search';
  searchInput.className = 'form-control form-control-sm';
  searchInput.placeholder = 'Search...';
  searchInput.style.cssText = 'width: 120px; height: 24px; font-size: 0.8em;';

  const refreshBtn = document.createElement('button');
  refreshBtn.id = 'nxm-logs-refresh';
  refreshBtn.className = 'btn btn-secondary';
  refreshBtn.style.cssText = 'background: transparent; border: none; font-size: 1.2em; line-height: 1; padding: 0 5px; color: var(--text-color);';
  refreshBtn.title = 'Refresh Logs';
  refreshBtn.textContent = '⟲';
  refreshBtn.onclick = () => location.reload();

  const logCounters = document.createElement('div');
  logCounters.id = 'nxm-log-counters';
  logCounters.style.cssText = 'font-size: 0.8em; opacity: 0.8; margin-left: 10px; white-space: nowrap;';

  extraControls.append(highlightDiv, compactDiv, searchInput, refreshBtn, logCounters);
  group.appendChild(extraControls);

  headerContainer.appendChild(group);

  const applyLogStyles = () => {
      const isCompact = document.getElementById('nxm-logs-compact')?.checked;
      const isHighlight = document.getElementById('nxm-logs-highlight')?.checked;
      
      let styleEl = document.getElementById('nxm-log-styles');
      if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'nxm-log-styles';
          document.head.appendChild(styleEl);
      }
      
      let css = "";
      if (isCompact) css += `.Logs .list-group-item { padding-top: 4px !important; padding-bottom: 4px !important; min-height: 0 !important; }`;
      if (isHighlight) css += `
        .Logs .list-group-item:has(.text-danger) { background-color: rgba(220, 53, 69, 0.08) !important; }
        .Logs .list-group-item:has(.text-success) { background-color: rgba(40, 167, 69, 0.05) !important; }
      `;
      styleEl.textContent = css;
  };

  document.getElementById('nxm-logs-compact').onchange = applyLogStyles;
  document.getElementById('nxm-logs-highlight').onchange = applyLogStyles;
  
  document.getElementById('nxm-logs-search').oninput = (e) => {
      const terms = e.target.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const rows = document.querySelectorAll('.Logs .list-group-item:not(.bg-2)');
      rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          let show = true;
          for (const term of terms) {
              if (term.startsWith('-') && term.length > 1) {
                  if (text.includes(term.substring(1))) show = false;
              } else {
                  if (!text.includes(term)) show = false;
              }
          }
          row.style.display = show ? '' : 'none';
      });
      updateLogCounters();
  };

  applyLogStyles();
  updateLogCounters();
}

function updateLogCounters() {
    const counters = document.getElementById('nxm-log-counters');
    if (!counters) return;
    const all = document.querySelectorAll('.Logs .list-group-item:not(.bg-2)');
    let visible = 0;
    all.forEach(r => { if (r.style.display !== 'none') visible++; });
    counters.textContent = `Showing ${visible} of ${all.length}`;
}

async function applyLogFilters() {
  const rows = Array.from(document.querySelectorAll('.list-group-item'));
  const { logFilters = {} } = await browser.storage.sync.get("logFilters");
  const filterKeys = Object.keys(logFilters);

  if (filterKeys.length === 0) {
    rows.forEach(row => {
      if (row.dataset.nxmFiltered) {
        row.style.display = "";
        delete row.dataset.nxmFiltered;
      }
    });
    updateLogCounters();
    updateFilterCountBadge(0);
    return;
  }

  rows.forEach(row => {
    const domainEl = row.querySelector('.notranslate');
    if (!domainEl) return;
    const domain = domainEl.textContent.trim();
    if (!domain) return;

    let shouldHide = false;
    for (const pattern of filterKeys) {
      if (matchPattern(domain, pattern)) {
        shouldHide = true;
        break;
      }
    }

    if (shouldHide) {
      row.style.display = "none";
      row.dataset.nxmFiltered = "true";
    } else if (row.dataset.nxmFiltered) {
      row.style.display = "";
      delete row.dataset.nxmFiltered;
    }
  });

  updateLogCounters();
  updateFilterCountBadge(filterKeys.length);
}

function matchPattern(domain, pattern) {
  if (domain === pattern) return true;
  if (pattern.startsWith('**.')) {
    const base = pattern.substring(3);
    return domain === base || domain.endsWith('.' + base);
  }
  if (pattern.includes('*')) {
    const patternParts = pattern.split('.');
    const domainParts = domain.split('.');
    if (patternParts.length !== domainParts.length) return false;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '*') continue;
      if (patternParts[i] !== domainParts[i]) return false;
    }
    return true;
  }
  return false;
}

async function injectDomainDescriptions() {
  injectBulkAddDomains();
  const items = Array.from(document.querySelectorAll('.list-group-item'));
  const { domainDescriptions = {} } = await browser.storage.sync.get("domainDescriptions");

  let listContainer = null;

  items.forEach(item => {
    const domainEl = item.querySelector('.notranslate');
    if (!domainEl) return;
    const domain = domainEl.textContent.trim();
    if (!domain || domain.includes(' ') || domain.startsWith('.')) return;
    const deleteBtn = item.querySelector('button[class*="btn-danger"], button[class*="btn-deny"]');
    if (!deleteBtn) return;
    
    if (!listContainer) listContainer = item.parentElement;

    if (!item.querySelector('.nxm-domain-desc')) {
      const note = domainDescriptions[domain] || "";
      const container = document.createElement('div');
      container.className = 'nxm-domain-desc';
      container.style.cssText = 'font-size: 0.8em; color: #6c757d; margin-top: 2px; display: flex; align-items: center; gap: 8px;';

      const textSpan = document.createElement('span');
      textSpan.textContent = note ? `Note: ${note}` : "";
      textSpan.style.fontStyle = 'italic';

      const editBtn = document.createElement('button');
      editBtn.textContent = note ? '📝' : '➕ Note';
      editBtn.style.cssText = 'border: none; background: transparent; cursor: pointer; padding: 0; font-size: 0.9em; opacity: 0.6;';
      editBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const newNote = prompt(`Note for ${domain}:`, note);
        if (newNote !== null) handleSaveNote(domain, newNote);
      };

      container.appendChild(textSpan);
      container.appendChild(editBtn);
      domainEl.parentElement.appendChild(container);
    }

    // Phase 2.2: Bulk Management Checkboxes
    if (!item.querySelector('.nxm-bulk-cb')) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'nxm-bulk-cb';
      cb.dataset.domain = domain;
      cb.style.cssText = 'margin-right: 15px; cursor: pointer; transform: scale(1.2);';
      item.insertBefore(cb, item.firstChild);
    }
  });

  // Inject Bulk Action Header
  if (listContainer && !document.getElementById('nxm-bulk-header')) {
      const header = document.createElement('div');
      header.id = 'nxm-bulk-header';
      header.className = 'list-group-item bg-2 d-flex align-items-center';
      header.style.cssText = 'padding: 10px 15px; gap: 15px; border-bottom: 2px solid var(--border-color);';
      
      const selectAll = document.createElement('input');
      selectAll.type = 'checkbox';
      selectAll.style.cssText = 'cursor: pointer; transform: scale(1.2);';
      selectAll.onchange = (e) => {
          document.querySelectorAll('.nxm-bulk-cb').forEach(cb => cb.checked = e.target.checked);
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.textContent = 'Delete Selected';
      delBtn.onclick = async () => {
          const selected = Array.from(document.querySelectorAll('.nxm-bulk-cb:checked')).map(cb => cb.dataset.domain);
          if (selected.length === 0) return alert('No domains selected.');
          if (!confirm(`Are you sure you want to delete ${selected.length} domains?`)) return;
          
          const profileId = getProfileId();
          const listType = window.location.pathname.includes('allowlist') ? 'allowlist' : 'denylist';
          
          delBtn.disabled = true;
          delBtn.textContent = 'Deleting...';
          
          // Execute in parallel batches to prevent extreme rate limiting, though background handles it too
          const batchSize = 5;
          for (let i = 0; i < selected.length; i += batchSize) {
              const batch = selected.slice(i, i + batchSize);
              await Promise.all(batch.map(domain => 
                  browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId, listType, action: "delete", domain })
              ));
          }
          window.location.reload();
      };

      header.appendChild(selectAll);
      header.appendChild(delBtn);
      listContainer.insertBefore(header, listContainer.firstChild);
  }
}

async function handleSaveNote(domain, note) {
  const { domainDescriptions = {} } = await browser.storage.sync.get("domainDescriptions");
  if (note.trim()) domainDescriptions[domain] = note;
  else delete domainDescriptions[domain];
  await browser.storage.sync.set({ domainDescriptions });
  document.querySelectorAll('.nxm-domain-desc').forEach(el => el.remove());
  injectDomainDescriptions();
}

function injectLogActions() {
  const rows = Array.from(document.querySelectorAll('.list-group-item'));
  rows.forEach(row => {
    if (row.querySelector('.nxm-log-actions')) return;
    const domainEl = row.querySelector('.notranslate');
    if (!domainEl) return;
    const domain = domainEl.textContent.trim();
    if (!domain || domain.includes(' ')) return;

    const timeEl = row.querySelector('time');
    if (timeEl && timeEl.dateTime && !row.dataset.nxmTimeFixed) {
        row.dataset.nxmTimeFixed = "true";
        const d = new Date(timeEl.dateTime);
        const timeStr = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const absSpan = document.createElement('span');
        absSpan.textContent = ` [${timeStr}]`;
        absSpan.style.cssText = 'font-size: 0.9em; opacity: 0.7; margin-left: 5px;';
        if (timeEl.parentElement) timeEl.parentElement.appendChild(absSpan);
    }

    const actionContainer = document.createElement('div');
    actionContainer.className = 'nxm-log-actions';
    actionContainer.style.cssText = 'display: inline-flex; gap: 5px; margin-left: 10px; vertical-align: middle;';

    const btn = (txt, title, fn) => {
        const b = document.createElement('button');
        b.textContent = txt; b.title = title;
        b.style.cssText = 'border: none; background: transparent; cursor: pointer; font-size: 0.9em;';
        b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
        return b;
    };

    actionContainer.appendChild(btn('✅', `Allow ${domain}`, () => handleLogAction(domain, 'allowlist')));
    actionContainer.appendChild(btn('🚫', `Deny ${domain}`, () => handleLogAction(domain, 'denylist')));
    actionContainer.appendChild(btn('👁️‍🗨️', `Hide ${domain}`, () => handleHideAction(domain)));
    
    domainEl.parentElement.appendChild(actionContainer);
  });
}

async function handleHideAction(domain) {
  openFilteredLogsModal(domain);
}

/**
 * Updates the filter count badge on the "Manage" button in the logs header.
 * @param {number} [forcedCount] - Optional known count to avoid an extra storage read.
 */
async function updateFilterCountBadge(forcedCount) {
  const btn = document.getElementById('nxm-manage-filters-btn');
  if (!btn) return;
  let count = forcedCount;
  if (count === undefined) {
    const { logFilters = {} } = await browser.storage.sync.get("logFilters");
    count = Object.keys(logFilters).length;
  }
  btn.textContent = `⚙️ Manage (${count})`;
}

/**
 * Closes and removes the Filtered Logs Manager modal dialog from the page.
 */
function closeFilteredLogsModal() {
  const existing = document.getElementById('nxm-filter-modal-backdrop');
  if (existing) existing.remove();
}

/**
 * Opens an in-page modal dialog on my.nextdns.io/<id>/logs to view, add, search,
 * and delete log filter patterns in real-time.
 * @param {string} [prefilledPattern=""] - Optional initial pattern to pre-fill in the input field.
 */
async function openFilteredLogsModal(prefilledPattern = "") {
  closeFilteredLogsModal();

  const { logFilters = {} } = await browser.storage.sync.get("logFilters");

  // 1. Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'nxm-filter-modal-backdrop';
  backdrop.className = 'nxm-modal-backdrop';
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeFilteredLogsModal();
  };

  // 2. Dialog Container
  const dialog = document.createElement('div');
  dialog.className = 'nxm-modal-dialog';
  dialog.onclick = (e) => e.stopPropagation();

  // 3. Header
  const header = document.createElement('div');
  header.className = 'nxm-modal-header';

  const title = document.createElement('h5');
  title.className = 'nxm-modal-title';
  title.textContent = '🛡️ Manage Filtered Logs';

  const countBadge = document.createElement('span');
  countBadge.id = 'nxm-modal-badge';
  countBadge.className = 'nxm-filter-badge';
  countBadge.textContent = `${Object.keys(logFilters).length} Active`;
  title.appendChild(countBadge);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'nxm-modal-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close (Esc)';
  closeBtn.onclick = () => closeFilteredLogsModal();

  header.appendChild(title);
  header.appendChild(closeBtn);

  // 4. Body
  const body = document.createElement('div');
  body.className = 'nxm-modal-body';

  // Add New Filter Box
  const addBox = document.createElement('div');
  addBox.className = 'nxm-filter-add-box';

  const addTitle = document.createElement('div');
  addTitle.style.cssText = 'font-weight: 600; font-size: 0.85em; color: #4facf7; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;';
  addTitle.textContent = 'Add Filter Rule';

  const addRow = document.createElement('div');
  addRow.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;';

  const patternInput = document.createElement('input');
  patternInput.type = 'text';
  patternInput.id = 'nxm-new-filter-pattern';
  patternInput.className = 'form-control form-control-sm';
  patternInput.placeholder = 'Domain or pattern (e.g. *.doubleclick.net)';
  patternInput.style.cssText = 'flex: 2; min-width: 180px; background: #0f172a; color: #fff; border: 1px solid #475569;';
  if (prefilledPattern) {
    patternInput.value = prefilledPattern;
  }

  const noteInput = document.createElement('input');
  noteInput.type = 'text';
  noteInput.id = 'nxm-new-filter-note';
  noteInput.className = 'form-control form-control-sm';
  noteInput.placeholder = 'Note / Reason (optional)';
  noteInput.style.cssText = 'flex: 1.5; min-width: 130px; background: #0f172a; color: #fff; border: 1px solid #475569;';

  const addSubmitBtn = document.createElement('button');
  addSubmitBtn.className = 'btn btn-sm btn-primary';
  addSubmitBtn.style.cssText = 'padding: 4px 14px; font-weight: 600;';
  addSubmitBtn.textContent = '+ Add Filter';

  const hint = document.createElement('small');
  hint.style.cssText = 'display: block; color: #94a3b8; font-size: 0.75em; line-height: 1.4;';
  hint.textContent = 'Supported: exact (domain.com), wildcard (*.domain.com), or subdomains & root (**.domain.com).';

  addRow.appendChild(patternInput);
  addRow.appendChild(noteInput);
  addRow.appendChild(addSubmitBtn);
  addBox.appendChild(addTitle);
  addBox.appendChild(addRow);
  addBox.appendChild(hint);
  body.appendChild(addBox);

  // Filter Rules Header & Search
  const listHeaderRow = document.createElement('div');
  listHeaderRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;';

  const listHeading = document.createElement('span');
  listHeading.style.cssText = 'font-weight: 600; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8;';
  listHeading.textContent = 'Active Filter Rules';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'form-control form-control-sm';
  searchInput.placeholder = 'Search rules...';
  searchInput.style.cssText = 'width: 150px; background: #1e293b; color: #fff; border: 1px solid #475569; font-size: 0.8em;';

  listHeaderRow.appendChild(listHeading);
  listHeaderRow.appendChild(searchInput);
  body.appendChild(listHeaderRow);

  // Filter List Container
  const listContainer = document.createElement('div');
  listContainer.id = 'nxm-modal-filter-list';
  listContainer.className = 'nxm-filter-list';
  body.appendChild(listContainer);

  // 5. Footer
  const footer = document.createElement('div');
  footer.className = 'nxm-modal-footer';

  const footerStatus = document.createElement('small');
  footerStatus.id = 'nxm-modal-footer-status';
  footerStatus.style.cssText = 'color: #94a3b8; font-size: 0.8em;';
  footerStatus.textContent = 'Filter rules hide matching log rows in real-time.';

  const footerButtons = document.createElement('div');
  footerButtons.style.cssText = 'display: flex; gap: 8px;';

  const clearAllBtn = document.createElement('button');
  clearAllBtn.className = 'btn btn-sm btn-outline-danger';
  clearAllBtn.textContent = 'Clear All';

  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn btn-sm btn-secondary';
  doneBtn.textContent = 'Close';
  doneBtn.onclick = () => closeFilteredLogsModal();

  footerButtons.appendChild(clearAllBtn);
  footerButtons.appendChild(doneBtn);
  footer.appendChild(footerStatus);
  footer.appendChild(footerButtons);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  // Render entries
  const renderList = (filterTerm = '') => {
    listContainer.replaceChildren();
    const entries = Object.entries(logFilters);
    const term = filterTerm.toLowerCase().trim();
    const filteredEntries = entries.filter(([pattern, note]) => {
      if (!term) return true;
      return pattern.toLowerCase().includes(term) || (note && note.toLowerCase().includes(term));
    });

    countBadge.textContent = `${entries.length} Active`;
    updateFilterCountBadge(entries.length);

    if (filteredEntries.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'text-align: center; padding: 25px 15px; color: #94a3b8; font-size: 0.85em; background: #1e293b; border-radius: 6px; border: 1px dashed #334155;';
      emptyMsg.textContent = entries.length === 0
        ? 'No filter rules defined. Add a domain or pattern above, or click 👁️‍🗨️ on any log row to hide it.'
        : 'No filter rules match your search.';
      listContainer.appendChild(emptyMsg);
      return;
    }

    filteredEntries.forEach(([pattern, note]) => {
      const item = document.createElement('div');
      item.className = 'nxm-filter-item';

      const left = document.createElement('div');
      left.style.cssText = 'display: flex; align-items: center; gap: 8px; overflow: hidden;';

      const patSpan = document.createElement('span');
      patSpan.className = 'nxm-filter-pattern';
      patSpan.textContent = pattern;

      const noteSpan = document.createElement('span');
      noteSpan.className = 'nxm-filter-note';
      noteSpan.textContent = note || '';

      left.appendChild(patSpan);
      if (note) left.appendChild(noteSpan);

      const delBtn = document.createElement('button');
      delBtn.className = 'nxm-filter-delete-btn';
      delBtn.textContent = 'Remove';
      delBtn.onclick = async () => {
        delete logFilters[pattern];
        await browser.storage.sync.set({ logFilters });
        await applyLogFilters();
        renderList(searchInput.value);
      };

      item.appendChild(left);
      item.appendChild(delBtn);
      listContainer.appendChild(item);
    });
  };

  renderList();

  searchInput.oninput = (e) => renderList(e.target.value);

  const handleAdd = async () => {
    let pattern = patternInput.value.trim().toLowerCase();
    pattern = pattern.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!pattern) return;

    const note = noteInput.value.trim() || 'Custom Log Filter';
    logFilters[pattern] = note;
    await browser.storage.sync.set({ logFilters });
    patternInput.value = '';
    noteInput.value = '';
    await applyLogFilters();
    renderList(searchInput.value);
    patternInput.focus();
  };

  addSubmitBtn.onclick = handleAdd;
  patternInput.onkeydown = (e) => { if (e.key === 'Enter') handleAdd(); };
  noteInput.onkeydown = (e) => { if (e.key === 'Enter') handleAdd(); };

  clearAllBtn.onclick = async () => {
    if (!confirm('Are you sure you want to clear all log filter rules? All hidden domains will reappear in the log stream.')) return;
    for (const k of Object.keys(logFilters)) {
      delete logFilters[k];
    }
    await browser.storage.sync.set({ logFilters: {} });
    await applyLogFilters();
    renderList();
  };

  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      closeFilteredLogsModal();
      document.removeEventListener('keydown', keyHandler);
    }
  };
  document.addEventListener('keydown', keyHandler);

  if (prefilledPattern) {
    patternInput.focus();
    patternInput.select();
  }
}

async function handleLogAction(domain, listType) {
  const profileId = getProfileId();
  if (!profileId) return;
  if (!confirm(`Add ${domain} to ${listType}?`)) return;
  browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId, listType, action: "add", domain }).then(res => {
    if (res.success) alert(`Added ${domain} to ${listType}`);
    else alert(`Error: ${res.error}`);
  });
}

function getProfileId() {
  const match = window.location.pathname.match(/\/([a-z0-9]+)\//);
  return match ? match[1] : null;
}

function scrapeBlocklists() {
  const items = Array.from(document.querySelectorAll('.list-group-item'));
  const blocks = [];
  const seen = new Set();
  items.forEach(item => {
    const nameEl = item.querySelector('[style*="font-weight: 500"]');
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    if (seen.has(name) || !name || !item.textContent.includes('entries')) return;
    seen.add(name);
    const descEl = item.querySelector('[style*="font-size: 0.9em"]');
    const description = descEl ? descEl.textContent.trim() : "";
    const entriesMatch = item.textContent.match(/([\d,]+)\s+entries/);
    const entriesCount = entriesMatch ? parseInt(entriesMatch[1].replace(/,/g, ''), 10) : 0;
    let id = name.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-').replace(/\./g, '').replace(/'/g, '').replace(/\(/g, '').replace(/\)/g, '');
    if (id.includes('nextdns-ads') && id.includes('trackers')) id = 'nextdns-recommended';
    blocks.push({ id, name, description, entries: entriesCount });
  });
  if (blocks.length > 5) browser.runtime.sendMessage({ type: "SAVE_SCRAPED_META", payload: { metaType: 'blocklists', data: blocks } });
}

function scrapeServices() {
  const items = Array.from(document.querySelectorAll('.list-group-item'));
  const services = [];
  const seen = new Set();
  items.forEach(item => {
    const nameEl = item.querySelector('span[style*="font-weight: 500"]');
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    if (seen.has(name) || !name) return;
    if (['Porn', 'Gambling', 'Dating', 'Piracy', 'Social Networks', 'Online Gaming', 'Video Streaming'].includes(name)) return;
    seen.add(name);
    services.push({ id: name.toLowerCase().replace(/ /g, '-'), name });
  });
  if (services.length > 10) browser.runtime.sendMessage({ type: "SAVE_SCRAPED_META", payload: { metaType: 'parental_services', data: services } });
}

function scrapeTLDs() {
  const items = Array.from(document.querySelectorAll('.list-group-item'));
  const tlds = [];
  items.forEach(item => {
    const nameEl = item.querySelector('span[style*="font-weight: 500"]');
    if (!nameEl || !nameEl.textContent.startsWith('.')) return;
    const tld = nameEl.textContent.substring(1).trim();
    if (/^[a-zA-Z0-9.-]+$/.test(tld)) tlds.push(tld);
  });
  if (tlds.length > 50) browser.runtime.sendMessage({ type: "SAVE_SCRAPED_META", payload: { metaType: 'tlds', data: Array.from(new Set(tlds)).sort() } });
}

function injectModalButtons() {
  const modal = document.querySelector('.modal-dialog.modal-lg.modal-dialog-scrollable');
  if (modal && !document.getElementById('nxm-modal-enable-all')) {
    const btn = (id, txt, cls, right) => {
        const b = document.createElement('button');
        b.id = id; b.className = cls; b.textContent = txt;
        b.style.cssText = `position: absolute; right: ${right}px; bottom: 10px; z-index: 9999;`;
        b.onclick = id.includes('enable') ? handleEnableAll : handleDisableAll;
        return b;
    };
    modal.appendChild(btn('nxm-modal-enable-all', 'Enable ALL TLDs', 'btn btn-primary', 250));
    modal.appendChild(btn('nxm-modal-disable-all', 'Disable ALL TLDs', 'btn btn-danger', 100));
  }
}

async function checkBackupStatus() {
  const profileId = getProfileId();
  if (!profileId) return;
  const data = await browser.storage.sync.get(`tldBackup_${profileId}`);
  const restoreBtn = document.getElementById('nxm-restore');
  if (restoreBtn) restoreBtn.style.display = data[`tldBackup_${profileId}`] ? 'inline-block' : 'none';
}

async function getCurrentActiveTLDs(profileId) {
  try {
    const res = await fetch(`${INTERNAL_API}/${profileId}/security/tlds`, { credentials: 'include' });
    const data = await res.json();
    return (data.data || []).map(item => item.id);
  } catch (e) { return []; }
}

async function handleEnableAll() {
  const profileId = getProfileId();
  if (!profileId) return;
  if (!confirm("This will enable all TLDs. We will create a backup first. Continue?")) return;
  const currentTLDs = await getCurrentActiveTLDs(profileId);
  await browser.storage.sync.set({ [`tldBackup_${profileId}`]: currentTLDs });
  checkBackupStatus();
  const allTLDs = Array.from(document.querySelectorAll('.modal-dialog .list-group-item')).map(el => el.textContent.trim().toLowerCase()).filter(text => text.startsWith('.')); 
  if (allTLDs.length === 0) return alert("Please click 'Add a TLD' to open the modal first.");
  processTLDs(profileId, allTLDs, 'POST', 'Enabling TLDs');
}

async function handleDisableAll() {
  const profileId = getProfileId();
  if (!profileId) return;
  if (!confirm("Are you sure you want to disable ALL active TLD blocks?")) return;
  const currentTLDs = await getCurrentActiveTLDs(profileId);
  if (currentTLDs.length === 0) return alert("No active TLDs to disable.");
  processTLDs(profileId, currentTLDs, 'DELETE', 'Disabling TLDs');
}

async function handleRestore() {
  const profileId = getProfileId();
  if (!profileId) return;
  const data = await browser.storage.sync.get(`tldBackup_${profileId}`);
  const backup = data[`tldBackup_${profileId}`];
  if (!backup || backup.length === 0) return alert("No backup found.");
  const currentTLDs = await getCurrentActiveTLDs(profileId);
  await processTLDs(profileId, currentTLDs, 'DELETE', 'Clearing current TLDs', false); 
  await processTLDs(profileId, backup, 'POST', 'Restoring Backup');
}

async function processTLDs(profileId, tldArray, method, actionText, alertOnFinish = true) {
  const btns = document.querySelectorAll('[id^="nxm-"]');
  btns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
  const total = tldArray.length;
  if (total === 0) return;
  
  let completed = 0;
  const queue = [...tldArray];
  const runTask = async (tld) => {
    const url = method === 'POST' ? `${INTERNAL_API}/${profileId}/security/tlds` : `${INTERNAL_API}/${profileId}/security/tlds/${tld}`;
    const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (method === 'POST') opts.body = JSON.stringify({ id: tld });
    try { await fetch(url, opts); } catch (e) {} finally { completed++; }
  };
  const workers = Array(Math.min(10, queue.length)).fill(null).map(async () => {
    while (queue.length > 0) await runTask(queue.shift());
  });
  await Promise.all(workers);
  if (alertOnFinish) { alert(`Success: ${actionText} finished.`); window.location.reload(); }
}

async function injectProfileNote() {
  if (document.getElementById('nxm-profile-note')) return;
  const profileId = getProfileId();
  if (!profileId) return;
  const header = document.querySelector('.navbar-brand')?.parentElement;
  if (!header) return;
  const { profileNotes = {} } = await browser.storage.sync.get("profileNotes");
  const note = profileNotes[profileId] || "";
  const container = document.createElement('div');
  container.id = 'nxm-profile-note';
  container.style.cssText = 'font-size: 0.85em; color: #4facf7; margin-left: 20px; display: flex; align-items: center; gap: 8px; cursor: pointer;';
  container.textContent = "";
  const icon = document.createElement('span');
  icon.textContent = "📝";
  const noteSpan = document.createElement('span');
  noteSpan.style.fontStyle = 'italic';
  noteSpan.textContent = note || 'Add Profile Note';
  container.appendChild(icon);
  container.appendChild(noteSpan);
  header.appendChild(container);
  container.onclick = async () => {
    const newNote = prompt(`Note for Profile ${profileId}:`, note);
    if (newNote !== null) {
      profileNotes[profileId] = newNote;
      await browser.storage.sync.set({ profileNotes });
      container.querySelector('span:last-child').textContent = newNote || 'Add Profile Note';
    }
  };
}

async function injectProfileSwitcher() {
  if (document.getElementById('nxm-profile-switcher')) return;
  const profileId = getProfileId();
  if (!profileId) return;
  
  const header = document.querySelector('.navbar-brand')?.parentElement;
  if (!header) return;

  const res = await browser.runtime.sendMessage({ type: "GET_PROFILES_LIST" });
  let profiles = [];
  if (res && res.data) profiles = res.data;
  else if (Array.isArray(res)) profiles = res;
  
  if (profiles.length < 2) return;

  const select = document.createElement('select');
  select.id = 'nxm-profile-switcher';
  select.className = 'form-select form-select-sm';
  select.style.cssText = 'width: 200px; margin-left: auto; margin-right: 15px; font-size: 0.85em; background-color: var(--bg-panel); color: var(--text-color); border: 1px solid var(--border-color);';
  
  profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.id})`;
    if (p.id === profileId || p.fingerprint === profileId) opt.selected = true;
    select.appendChild(opt);
  });

  select.onchange = (e) => {
    const rawVal = e.target.value;
    if (typeof rawVal !== 'string') return;
    const cleanId = rawVal.trim();
    if (!/^[a-z0-9]{1,32}$/i.test(cleanId)) return;
    const currentPath = window.location.pathname;
    if (!/^\/[a-z0-9]+\//i.test(currentPath)) return;
    const newPath = currentPath.replace(/^\/([a-z0-9]+)\//, `/${cleanId}/`);
    window.location.assign(newPath);
  };

  header.appendChild(select);
}

let themeObserver = null;
let isSettingTheme = false;

function applyForcedTheme() {
  const forced = webGuiConfig.master ? (webGuiConfig.forcedTheme || 'default') : 'default';

  if (forced === 'dark') {
    document.documentElement.setAttribute('data-bs-theme', 'dark');
    document.documentElement.classList.add('nxm-forced-dark');
    document.documentElement.classList.remove('nxm-forced-light');
    if (document.body) {
      document.body.classList.add('nxm-forced-dark');
      document.body.classList.remove('nxm-forced-light');
    }
  } else if (forced === 'light') {
    document.documentElement.setAttribute('data-bs-theme', 'light');
    document.documentElement.classList.add('nxm-forced-light');
    document.documentElement.classList.remove('nxm-forced-dark');
    if (document.body) {
      document.body.classList.add('nxm-forced-light');
      document.body.classList.remove('nxm-forced-dark');
    }
  } else {
    document.documentElement.classList.remove('nxm-forced-dark', 'nxm-forced-light');
    if (document.body) {
      document.body.classList.remove('nxm-forced-dark', 'nxm-forced-light');
    }
  }
}

function setupThemeObserver() {
  if (themeObserver) return;
  if (typeof MutationObserver === 'undefined') return;

  themeObserver = new MutationObserver(() => {
    if (isSettingTheme) return;
    if (!webGuiConfig.master || !webGuiConfig.forcedTheme || webGuiConfig.forcedTheme === 'default') {
      return;
    }
    const current = document.documentElement.getAttribute('data-bs-theme');
    if (current !== webGuiConfig.forcedTheme) {
      isSettingTheme = true;
      try {
        document.documentElement.setAttribute('data-bs-theme', webGuiConfig.forcedTheme);
      } finally {
        isSettingTheme = false;
      }
    }
    if (webGuiConfig.forcedTheme === 'dark' && !document.documentElement.classList.contains('nxm-forced-dark')) {
      document.documentElement.classList.add('nxm-forced-dark');
    } else if (webGuiConfig.forcedTheme === 'light' && !document.documentElement.classList.contains('nxm-forced-light')) {
      document.documentElement.classList.add('nxm-forced-light');
    }
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-bs-theme']
  });
}

function findAccountDropdown() {
  // Strategy 1: Find by account link in menu
  const accountLink = document.querySelector('a.dropdown-item[href="/account"], a[href="/account"]');
  if (accountLink) {
    const dd = accountLink.closest('.dropdown');
    if (dd) return dd;
  }

  // Strategy 2: Button with fa-user icon inside a dropdown
  const userIcon = document.querySelector('.dropdown button.dropdown-toggle svg.fa-user, .dropdown button.dropdown-toggle svg[data-icon="user"], .dropdown svg.fa-user, .dropdown svg[data-icon="user"]');
  if (userIcon) {
    const dd = userIcon.closest('.dropdown');
    if (dd) return dd;
  }

  // Strategy 3: Any dropdown toggle with notranslate email/user text in header
  const dropdownToggles = document.querySelectorAll('.dropdown > button.dropdown-toggle, .dropdown > .dropdown-toggle');
  for (const btn of dropdownToggles) {
    if (btn.querySelector('.fa-user, [data-icon="user"], span.notranslate')) {
      const dd = btn.closest('.dropdown');
      if (dd) return dd;
    }
  }

  return null;
}

function injectHeaderFilteredLogsButton() {
  if (!webGuiConfig.master || !webGuiConfig.filter) {
    document.getElementById('nxm-header-filtered-logs-btn')?.remove();
    document.getElementById('nxm-dropdown-filtered-logs-item')?.remove();
    return;
  }

  const accountDropdown = findAccountDropdown();
  if (!accountDropdown) return;

  // 1. Inject 👁️‍🗨️ button beside the account dropdown in the header
  if (!document.getElementById('nxm-header-filtered-logs-btn')) {
    const eyeBtn = document.createElement('button');
    eyeBtn.id = 'nxm-header-filtered-logs-btn';
    eyeBtn.type = 'button';
    eyeBtn.className = 'btn btn-light me-2';
    eyeBtn.style.cssText = 'padding: 4px 10px; font-size: 1rem; line-height: 1.5; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;';
    eyeBtn.title = 'Manage Filtered Logs';
    eyeBtn.setAttribute('aria-label', 'Manage Filtered Logs');
    eyeBtn.textContent = '👁️‍🗨️';
    eyeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFilteredLogsModal();
    };

    const parent = accountDropdown.parentElement;
    if (parent) {
      if (parent.tagName === 'DIV' && parent.children.length === 1) {
        parent.style.display = 'inline-flex';
        parent.style.alignItems = 'center';
      }
      parent.insertBefore(eyeBtn, accountDropdown);
    }
  }

  // 2. Inject menu item inside the account dropdown menu if present
  const dropdownMenu = accountDropdown.querySelector('.dropdown-menu');
  if (dropdownMenu && !document.getElementById('nxm-dropdown-filtered-logs-item')) {
    const item = document.createElement('a');
    item.id = 'nxm-dropdown-filtered-logs-item';
    item.className = 'dropdown-item';
    item.href = '#';
    item.setAttribute('data-rr-ui-dropdown-item', '');
    item.setAttribute('role', 'button');
    item.style.cssText = 'cursor: pointer; display: flex; align-items: center; gap: 8px;';
    item.textContent = '👁️‍🗨️ Manage Filtered Logs';
    item.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFilteredLogsModal();
    };

    const accountLink = dropdownMenu.querySelector('a[href="/account"]');
    if (accountLink && accountLink.nextSibling) {
      dropdownMenu.insertBefore(item, accountLink.nextSibling);
    } else {
      dropdownMenu.prepend(item);
    }
  }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TOGGLE_TLD_LIST") {
    document.getElementById("nxm-toggle-table")?.click();
    sendResponse({ success: true });
  } else if (message.type === "TOGGLE_BLOCKLIST_LIST") {
    document.getElementById("nxm-toggle-blocklists")?.click();
    sendResponse({ success: true });
  }
});

function injectBlocklistModalSort(modal) {
    if (modal.querySelector('#nxm-sort-blocklists')) return;
    const header = modal.querySelector('.modal-header');
    if (!header) return;

    const btn = document.createElement('button');
    btn.id = 'nxm-sort-blocklists';
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = 'Sort A-Z';
    btn.onclick = () => {
        const list = modal.querySelector('.list-group');
        if (!list) return;
        const items = Array.from(list.children);
        items.sort((a, b) => {
            const tA = a.querySelector('strong, h5, span:not(.badge)')?.textContent.trim().toLowerCase() || a.textContent.trim().toLowerCase();
            const tB = b.querySelector('strong, h5, span:not(.badge)')?.textContent.trim().toLowerCase() || b.textContent.trim().toLowerCase();
            return tA.localeCompare(tB);
        });
        items.forEach(i => list.appendChild(i));
    };
    header.style.position = 'relative';
    header.appendChild(btn);
}

function injectBulkAddDomains() {
    const isList = window.location.pathname.includes('allowlist') || window.location.pathname.includes('denylist');
    if (!isList) return;
    
    let form = document.querySelector('form');
    if (!form || document.getElementById('nxm-bulk-add-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'nxm-bulk-add-btn';
    btn.className = 'btn btn-secondary';
    btn.textContent = 'Bulk Add';
    btn.style.marginLeft = '10px';
    btn.onclick = async (e) => {
        e.preventDefault();
        const domainsStr = prompt("Enter domains separated by commas or newlines:");
        if (!domainsStr) return;
        
        const domains = domainsStr.split(/[\s,]+/).map(d => d.trim()).filter(d => d.length > 0 && d.includes('.'));
        if (domains.length === 0) return alert("No valid domains found.");
        if (!confirm(`Add ${domains.length} domains?`)) return;
        
        const profileId = window.location.pathname.split('/')[1] || getProfileId();
        const listType = window.location.pathname.includes('allowlist') ? 'allowlist' : 'denylist';
        
        btn.disabled = true;
        btn.textContent = 'Adding...';
        
        const batchSize = 5;
        for (let i = 0; i < domains.length; i += batchSize) {
            const batch = domains.slice(i, i + batchSize);
            await Promise.all(batch.map(domain => 
                browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId, listType, action: "add", domain })
            ));
        }
        window.location.reload();
    };
    
    // Find the submit button and insert after it
    const submitBtn = form.querySelector('button[type="submit"]') || form.lastElementChild;
    if (submitBtn) {
        submitBtn.parentElement.appendChild(btn);
    }
}

function applyDomainListStyling() {
    const isList = window.location.pathname.includes('allowlist') || window.location.pathname.includes('denylist');
    if (!isList) return;
    
    const list = document.querySelector('.list-group');
    if (!list || list.dataset.nxmStyled) return;
    list.dataset.nxmStyled = 'true';
    
    // Add Sort button
    const container = list.parentElement;
    if (container && !document.getElementById('nxm-sort-domains')) {
        const sortBtn = document.createElement('button');
        sortBtn.id = 'nxm-sort-domains';
        sortBtn.className = 'btn btn-secondary btn-sm mb-2';
        sortBtn.textContent = 'Sort A-Z';
        sortBtn.onclick = () => {
            const items = Array.from(list.children).filter(el => el.classList.contains('list-group-item') && !el.id.includes('nxm-bulk-header'));
            items.sort((a, b) => {
                const tA = a.querySelector('.notranslate')?.textContent.trim().toLowerCase() || "";
                const tB = b.querySelector('.notranslate')?.textContent.trim().toLowerCase() || "";
                
                // Root domain sorting
                const partsA = tA.split('.');
                const rootA = partsA.slice(-2).join('.');
                const partsB = tB.split('.');
                const rootB = partsB.slice(-2).join('.');
                
                if (rootA !== rootB) return rootA.localeCompare(rootB);
                return tA.localeCompare(tB);
            });
            items.forEach(i => list.appendChild(i));
        };
        container.insertBefore(sortBtn, list);
    }
    
    // Apply styling to each item
    const items = Array.from(list.querySelectorAll('.list-group-item:not(#nxm-bulk-header)'));
    items.forEach(item => {
        const domainEl = item.querySelector('.notranslate');
        if (!domainEl) return;
        const text = domainEl.textContent.trim();
        
        // Bold root domain, lighten subdomains
        const parts = text.split('.');
        domainEl.replaceChildren();
        if (parts.length > 2) {
            const root = parts.slice(-2).join('.');
            const sub = parts.slice(0, -2).join('.');
            const subSpan = document.createElement('span');
            subSpan.style.opacity = '0.6';
            subSpan.textContent = `${sub}.`;
            const strong = document.createElement('strong');
            strong.textContent = root;
            domainEl.append(subSpan, strong);
        } else {
            const strong = document.createElement('strong');
            strong.textContent = text;
            domainEl.append(strong);
        }
    });
}
