const INTERNAL_API = "https://api.nextdns.io/profiles";

let webGuiConfig = { master: true, tlds: true, blocklists: true, logs: true, desc: true, notes: true, filter: true };
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

  const sync = await browser.storage.sync.get(["webGuiMaster", "webGuiTlds", "webGuiBlocklists", "webGuiLogActions", "webGuiDesc", "webGuiProfileNotes", "webGuiFilter", "hostnameAliases"]);
  const local = await browser.storage.local.get(["webGuiMaster", "webGuiTlds", "webGuiBlocklists", "webGuiLogActions", "webGuiDesc", "webGuiProfileNotes", "webGuiFilter", "hostnameAliases"]);
  const res = { ...local, ...sync };

  if (res.webGuiMaster !== undefined) webGuiConfig.master = res.webGuiMaster;
  if (res.webGuiTlds !== undefined) webGuiConfig.tlds = res.webGuiTlds;
  if (res.webGuiBlocklists !== undefined) webGuiConfig.blocklists = res.webGuiBlocklists;
  if (res.webGuiLogActions !== undefined) webGuiConfig.logs = res.webGuiLogActions;
  if (res.webGuiDesc !== undefined) webGuiConfig.desc = res.webGuiDesc;
  if (res.webGuiProfileNotes !== undefined) webGuiConfig.notes = res.webGuiProfileNotes;
  if (res.webGuiFilter !== undefined) webGuiConfig.filter = res.webGuiFilter;
  
  hostnameAliases = res.hostnameAliases || {};
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
        'nxm-progress-ui'
    ];
    idsToRemove.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'nxm-tld-controls' || id === 'nxm-privacy-controls') restoreFeatureUI(id);
            el.remove();
        }
    });

    document.querySelectorAll('.nxm-log-actions, .nxm-domain-desc').forEach(el => el.remove());
    
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
        const keys = ["webGuiMaster", "webGuiTlds", "webGuiBlocklists", "webGuiLogActions", "webGuiDesc", "webGuiProfileNotes", "webGuiFilter"];
        keys.forEach(k => {
            if (changes[k] && changes[k].newValue !== undefined) {
                const configKey = k.replace(/^webGui/, '').toLowerCase();
                const map = { 'master': 'master', 'tlds': 'tlds', 'blocklists': 'blocklists', 'logactions': 'logs', 'desc': 'desc', 'profilenotes': 'notes', 'filter': 'filter' };
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
            evaluatePage();
        }
    }
});

let mutationTimer;
const observer = new MutationObserver((mutations) => {
    // Phase 2.1: The "Network Error" Suppressor
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.classList && node.classList.contains('modal')) {
                        if (node.textContent.includes('Network Error')) {
                            node.style.display = 'none';
                            node.style.opacity = '0';
                            console.warn("[DNS Forge] Suppressed NextDNS Network Error modal.");
                            // Show non-intrusive toast instead
                            showToast("Reconnecting to NextDNS...");
                        }
                    }
                    // Phase 3.4: Device Nickname Aliasing
                    applyDeviceAliases(node);
                }
            });
        }
    }

    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(evaluatePage, 500);
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
    btnGroup.innerHTML = `
      <input type="search" id="nxm-search-blocklists" placeholder="Filter Blocklists..." class="form-control form-control-sm" style="height: 22px; width: 150px; font-size: 0.75em;">
      <button id="nxm-toggle-blocklists" class="btn btn-secondary" style="background: #6c757d; border-color: #6c757d; padding: 1px 8px; font-size: 0.75em; height: 22px; line-height: 1;">👁️ Toggle List</button>
    `;
    
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
    btnGroup.innerHTML = `
      <input type="search" id="nxm-search-tlds" placeholder="Filter TLDs..." class="form-control form-control-sm" style="height: 22px; width: 120px; font-size: 0.75em;">
      <button id="nxm-enable-all" class="btn btn-primary" style="padding: 1px 8px; font-size: 0.75em; height: 22px; line-height: 1;">Enable ALL</button>
      <button id="nxm-disable-all" class="btn btn-danger" style="padding: 1px 8px; font-size: 0.75em; height: 22px; line-height: 1;">Disable ALL</button>
      <button id="nxm-restore" class="btn btn-secondary" style="display: none; padding: 1px 8px; font-size: 0.75em; height: 22px; line-height: 1;">Restore</button>
      <button id="nxm-toggle-table" class="btn btn-secondary" style="background: #6c757d; border-color: #6c757d; padding: 1px 8px; font-size: 0.75em; height: 22px; line-height: 1;">👁️ Toggle</button>
    `;
    
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

// ... (Rest of the file stays the same, I'll provide it all to be safe)

if (typeof module !== 'undefined') {
  module.exports = {
    cleanupUI,
    evaluatePage,
    webGuiConfig,
    initConfig
  };
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

  const viewerBtn = document.createElement('button');
  viewerBtn.textContent = '📋';
  viewerBtn.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    browser.runtime.sendMessage({ type: "OPEN_VIEWER", tab: "filters" });
  };

  textWrapper.appendChild(small);
  textWrapper.appendChild(viewerBtn);
  group.appendChild(switchWrapper);
  group.appendChild(textWrapper);
  
  // Phase 2.5: Compact Mode, Highlighting, and Search
  const extraControls = document.createElement('div');
  extraControls.className = 'd-flex align-items-center gap-3 ms-4';
  extraControls.style.cssText = 'border-left: 1px solid var(--border-color); padding-left: 15px;';
  extraControls.innerHTML = `
    <div class="form-check form-switch" title="Highlight blocked rows in red and allowed in green">
        <input class="form-check-input" type="checkbox" id="nxm-logs-highlight" checked>
        <label class="form-check-label" style="font-size:0.8em; margin-left: 5px;">Highlight</label>
    </div>
    <div class="form-check form-switch" title="Reduce vertical padding in logs">
        <input class="form-check-input" type="checkbox" id="nxm-logs-compact">
        <label class="form-check-label" style="font-size:0.8em; margin-left: 5px;">Compact</label>
    </div>
    <input type="search" id="nxm-logs-search" class="form-control form-control-sm" placeholder="Search..." style="width: 120px; height: 24px; font-size: 0.8em;">
  `;
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
      const query = e.target.value.toLowerCase();
      const rows = document.querySelectorAll('.Logs .list-group-item:not(.bg-2)');
      rows.forEach(row => {
          row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
      });
  };

  applyLogStyles();
}

async function applyLogFilters() {
  const rows = Array.from(document.querySelectorAll('.list-group-item'));
  const { logFilters = {} } = await browser.storage.sync.get("logFilters");
  const filterKeys = Object.keys(logFilters);
  if (filterKeys.length === 0) return;

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
  const pattern = prompt(`Enter filter pattern to hide:`, domain);
  if (!pattern) return;
  const { logFilters = {} } = await browser.storage.sync.get("logFilters");
  logFilters[pattern] = "Hidden via Log Action";
  await browser.storage.sync.set({ logFilters });
  applyLogFilters();
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
    const newId = e.target.value;
    const currentPath = window.location.pathname;
    const newPath = currentPath.replace(/\/([a-z0-9]+)\//, `/${newId}/`);
    window.location.href = newPath;
  };

  header.appendChild(select);
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
