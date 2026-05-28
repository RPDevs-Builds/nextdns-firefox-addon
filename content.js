const INTERNAL_API = "https://api.nextdns.io/profiles";

let webGuiConfig = { master: true, tlds: true, logs: true, desc: true, notes: true, filter: true };

// Initialize config and listen for live changes
browser.storage.sync.get(["webGuiMaster", "webGuiTlds", "webGuiLogActions", "webGuiDesc", "webGuiProfileNotes", "webGuiFilter"]).then(res => {
  if (res.webGuiMaster !== undefined) webGuiConfig.master = res.webGuiMaster;
  if (res.webGuiTlds !== undefined) webGuiConfig.tlds = res.webGuiTlds;
  if (res.webGuiLogActions !== undefined) webGuiConfig.logs = res.webGuiLogActions;
  if (res.webGuiDesc !== undefined) webGuiConfig.desc = res.webGuiDesc;
  if (res.webGuiProfileNotes !== undefined) webGuiConfig.notes = res.webGuiProfileNotes;
  if (res.webGuiFilter !== undefined) webGuiConfig.filter = res.webGuiFilter;
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.webGuiMaster) webGuiConfig.master = changes.webGuiMaster.newValue;
    if (changes.webGuiTlds) webGuiConfig.tlds = changes.webGuiTlds.newValue;
    if (changes.webGuiLogActions) webGuiConfig.logs = changes.webGuiLogActions.newValue;
    if (changes.webGuiDesc) webGuiConfig.desc = changes.webGuiDesc.newValue;
    if (changes.webGuiProfileNotes) webGuiConfig.notes = changes.webGuiProfileNotes.newValue;
    if (changes.webGuiFilter) webGuiConfig.filter = changes.webGuiFilter.newValue;
    
    // Force a UI re-evaluation if user toggles live
    if (!webGuiConfig.master || !webGuiConfig.tlds) {
      document.getElementById('nxm-tld-controls')?.remove();
      document.getElementById('nxm-modal-enable-all')?.remove();
      document.getElementById('nxm-modal-disable-all')?.remove();
    }
    if (!webGuiConfig.master || !webGuiConfig.logs) {
      document.querySelectorAll('.nxm-log-actions').forEach(el => el.remove());
    }
    if (!webGuiConfig.master || !webGuiConfig.desc) {
      document.querySelectorAll('.nxm-domain-desc').forEach(el => el.remove());
    }
    if (!webGuiConfig.master || !webGuiConfig.notes) {
      document.getElementById('nxm-profile-note')?.remove();
    }
    if (!webGuiConfig.master || !webGuiConfig.filter) {
      document.querySelectorAll('.list-group-item[style*="display: none"]').forEach(el => {
        if (el.dataset.nxmFiltered) {
          el.style.display = "";
          delete el.dataset.nxmFiltered;
        }
      });
    }
  }
});

let mutationTimer;
const observer = new MutationObserver(() => {
  const path = window.location.pathname;
  clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => {
    // Inject profile note on all dashboard pages
    if (webGuiConfig.master && webGuiConfig.notes) {
      injectProfileNote();
    }

    if (path.endsWith('/security')) {
      scrapeTLDs(); // Passive scraper always runs
      
      // Only inject UI if both master and feature toggles are enabled
      if (webGuiConfig.master) {
        if (webGuiConfig.tlds) {
          injectPageButtons();
          injectModalButtons();
        }
        if (webGuiConfig.desc) injectDomainDescriptions();
      }
    } else if (path.endsWith('/privacy')) {
      scrapeBlocklists();
      if (webGuiConfig.master && webGuiConfig.desc) injectDomainDescriptions();
    } else if (path.endsWith('/parentalcontrol')) {
      scrapeServices();
    } else if (path.endsWith('/logs')) {
      if (webGuiConfig.master) {
        if (webGuiConfig.logs) injectLogActions();
        if (webGuiConfig.filter) applyLogFilters();
        injectLogsSettingsControls();
      }
    }
  }, 500);
});
observer.observe(document.body, { childList: true, subtree: true });

async function injectLogsSettingsControls() {
  if (document.getElementById('nxm-logs-filter-group')) return;

  const headerContainer = document.querySelector('.Logs .list-group-item.bg-2 .d-md-flex');
  if (!headerContainer) return;

  // Outer group matching exact native snippet: <div class="d-flex mt-3 ms-md-5">
  const group = document.createElement('div');
  group.id = 'nxm-logs-filter-group';
  group.className = 'd-flex mt-3 ms-md-5'; 

  // Switch wrapper: <div class="d-flex align-items-center" style="transform: scale(0.9); margin-top: -10px; margin-bottom: -10px;">
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

  // Text wrapper: <div class="d-flex align-items-center" style="opacity: 0.7; white-space: nowrap;">
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
  viewerBtn.title = 'Filtered Domains Viewer';
  viewerBtn.style.border = 'none';
  viewerBtn.style.background = 'transparent';
  viewerBtn.style.cursor = 'pointer';
  viewerBtn.style.fontSize = '1em';
  viewerBtn.style.padding = '0 0 0 5px';
  viewerBtn.style.display = 'flex';
  viewerBtn.style.alignItems = 'center';
  viewerBtn.style.opacity = '0.8';
  viewerBtn.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    browser.runtime.sendMessage({ type: "OPEN_VIEWER", tab: "filters" });
  };

  textWrapper.appendChild(small);
  textWrapper.appendChild(viewerBtn);

  group.appendChild(switchWrapper);
  group.appendChild(textWrapper);
  
  headerContainer.appendChild(group);
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
  if (domain === pattern) return true; // Exact match

  if (pattern.startsWith('**.')) {
    // Recursive subdomains: **.example.com matches example.com and any.sub.example.com
    const base = pattern.substring(3);
    return domain === base || domain.endsWith('.' + base);
  }

  if (pattern.includes('*')) {
    // Level-specific wildcard: *.example.com (1 level), *.*.example.com (2 levels)
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

  items.forEach(item => {
    // Look for domains in allow/deny lists (they are usually in spans with notranslate)
    const domainEl = item.querySelector('.notranslate');
    if (!domainEl) return;
    
    const domain = domainEl.textContent.trim();
    if (!domain || domain.includes(' ') || domain.startsWith('.')) return;
    
    // Check if we are in the Allowlist/Denylist sections (heuristic: they have a delete button)
    const deleteBtn = item.querySelector('button[class*="btn-danger"], button[class*="btn-deny"]');
    if (!deleteBtn) return;

    if (item.querySelector('.nxm-domain-desc')) return;

    const note = domainDescriptions[domain] || "";
    
    const container = document.createElement('div');
    container.className = 'nxm-domain-desc';
    container.style.fontSize = '0.8em';
    container.style.color = '#6c757d';
    container.style.marginTop = '2px';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '8px';

    const textSpan = document.createElement('span');
    textSpan.textContent = note ? `Note: ${note}` : "";
    textSpan.style.fontStyle = 'italic';

    const editBtn = document.createElement('button');
    editBtn.textContent = note ? '📝' : '➕ Note';
    editBtn.style.border = 'none';
    editBtn.style.background = 'transparent';
    editBtn.style.cursor = 'pointer';
    editBtn.style.padding = '0';
    editBtn.style.fontSize = '0.9em';
    editBtn.style.opacity = '0.6';
    editBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const newNote = prompt(`Note for ${domain}:`, note);
      if (newNote !== null) {
        handleSaveNote(domain, newNote);
      }
    };

    container.appendChild(textSpan);
    container.appendChild(editBtn);
    domainEl.parentElement.appendChild(container);
  });
}

async function handleSaveNote(domain, note) {
  const { domainDescriptions = {} } = await browser.storage.sync.get("domainDescriptions");
  if (note.trim()) {
    domainDescriptions[domain] = note;
  } else {
    delete domainDescriptions[domain];
  }
  await browser.storage.sync.set({ domainDescriptions });
  // The observer or a manual re-run will update the UI
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
    actionContainer.style.display = 'inline-flex';
    actionContainer.style.gap = '5px';
    actionContainer.style.marginLeft = '10px';
    actionContainer.style.verticalAlign = 'middle';

    const allowBtn = document.createElement('button');
    allowBtn.textContent = '✅';
    allowBtn.title = `Allow ${domain}`;
    allowBtn.style.border = 'none';
    allowBtn.style.background = 'transparent';
    allowBtn.style.cursor = 'pointer';
    allowBtn.style.fontSize = '0.9em';
    allowBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      handleLogAction(domain, 'allowlist');
    };

    const denyBtn = document.createElement('button');
    denyBtn.textContent = '🚫';
    denyBtn.title = `Deny ${domain}`;
    denyBtn.style.border = 'none';
    denyBtn.style.background = 'transparent';
    denyBtn.style.cursor = 'pointer';
    denyBtn.style.fontSize = '0.9em';
    denyBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      handleLogAction(domain, 'denylist');
    };

    const hideBtn = document.createElement('button');
    hideBtn.textContent = '👁️‍🗨️';
    hideBtn.title = `Hide ${domain} from logs`;
    hideBtn.style.border = 'none';
    hideBtn.style.background = 'transparent';
    hideBtn.style.cursor = 'pointer';
    hideBtn.style.fontSize = '0.9em';
    hideBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      handleHideAction(domain);
    };

    actionContainer.appendChild(allowBtn);
    actionContainer.appendChild(denyBtn);
    actionContainer.appendChild(hideBtn);
    domainEl.parentElement.appendChild(actionContainer);
  });
}

async function handleHideAction(domain) {
  const pattern = prompt(`Enter filter pattern to hide (supports *, **):`, domain);
  if (!pattern) return;

  const { logFilters = {} } = await browser.storage.sync.get("logFilters");
  logFilters[pattern] = "Hidden via Log Action";
  await browser.storage.sync.set({ logFilters });
  
  // Re-apply filters instantly
  applyLogFilters();
}

async function handleLogAction(domain, listType) {
  const profileId = getProfileId();
  if (!profileId) return;

  const confirmAction = confirm(`Add ${domain} to ${listType}?`);
  if (!confirmAction) return;

  browser.runtime.sendMessage({
    type: "MANAGE_DOMAIN",
    profileId: profileId,
    listType: listType,
    action: "add",
    domain: domain
  }).then(res => {
    if (res.success) alert(`Added ${domain} to ${listType}`);
    else alert(`Error: ${res.error || 'Failed to add domain'}`);
  });
}

function getProfileId() {
  const match = window.location.pathname.match(/\/([a-z0-9]+)\//);
  return match ? match[1] : null;
}

// --- Passive Scraper Logic ---

function parseRelativeDate(dateStr) {
  const now = Date.now() / 1000;
  const match = dateStr.match(/(\d+)\s+(day|hour|month|year|minute|second)/);
  if (!match) return now;
  const val = parseInt(match[1]);
  const unit = match[2];
  const multipliers = { 'second': 1, 'minute': 60, 'hour': 3600, 'day': 86400, 'month': 2592000, 'year': 31536000 };
  return now - (val * (multipliers[unit] || 0));
}

function scrapeBlocklists() {
  // Look for list-group-items that look like blocklists
  const items = Array.from(document.querySelectorAll('.list-group-item'));
  const blocks = [];
  const seen = new Set();
  
  items.forEach(item => {
    const nameEl = item.querySelector('[style*="font-weight: 500"]');
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    if (seen.has(name) || !name) return;
    
    // Quick heuristic: blocklists usually have an "entries" count
    if (!item.textContent.includes('entries')) return;
    
    seen.add(name);
    
    const descEl = item.querySelector('[style*="font-size: 0.9em"]');
    const description = descEl ? descEl.textContent.trim() : "";
    
    const linkEl = item.querySelector('a[target="_blank"]');
    const website = linkEl ? linkEl.getAttribute('href') : "";
    
    const entriesMatch = item.textContent.match(/([\d,]+)\s+entries/);
    const entriesText = entriesMatch ? `${entriesMatch[1].trim()} entries` : "0 entries";
    const entriesCount = entriesMatch ? parseInt(entriesMatch[1].replace(/,/g, ''), 10) : 0;
    
    const updatedMatch = item.textContent.match(/Updated\s+(.*?ago)/);
    const updatedText = updatedMatch ? `Updated ${updatedMatch[1].trim()}` : "Updated unknown";
    const updatedTs = updatedMatch ? parseRelativeDate(updatedMatch[1]) : (Date.now() / 1000);
    
    let id = name.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-').replace(/\./g, '').replace(/'/g, '').replace(/\(/g, '').replace(/\)/g, '');
    if (id.includes('nextdns-ads') && id.includes('trackers')) id = 'nextdns-recommended';
    
    blocks.push({
      id, name, description, website, entries_text: entriesText, entries: entriesCount, updated_text: updatedText, updated_ts: updatedTs, popularity: 0
    });
  });
  
  if (blocks.length > 5) {
    blocks.forEach((b, idx) => b.popularity = blocks.length - idx);
    browser.runtime.sendMessage({ type: "SAVE_SCRAPED_META", payload: { metaType: 'blocklists', data: blocks } });
  }
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
    
    // Avoid scraping categories as services
    if (['Porn', 'Gambling', 'Dating', 'Piracy', 'Social Networks', 'Online Gaming', 'Video Streaming'].includes(name)) return;
    
    seen.add(name);
    let id = name.toLowerCase().replace(/ /g, '-');
    const norm = {"Disney+": "disneyplus", "HBO Max": "hbomax", "Prime Video": "primevideo", "Xbox Live": "xboxlive", "PlayStation Network": "playstation-network", "YouTube": "youtube"};
    id = norm[name] || id;
    
    services.push({ id, name });
  });
  
  if (services.length > 10) {
    browser.runtime.sendMessage({ type: "SAVE_SCRAPED_META", payload: { metaType: 'parental_services', data: services } });
  }
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
  
  if (tlds.length > 50) {
    const uniqueTlds = Array.from(new Set(tlds)).sort();
    browser.runtime.sendMessage({ type: "SAVE_SCRAPED_META", payload: { metaType: 'tlds', data: uniqueTlds } });
  }
}

// --- UI Injection ---
async function injectPageButtons() {
  if (document.getElementById('nxm-tld-controls')) return;
  const buttons = Array.from(document.querySelectorAll('button'));
  const addTldBtn = buttons.find(b => b.textContent.includes('Add a TLD'));

  if (addTldBtn && addTldBtn.parentElement) {
    const container = addTldBtn.parentElement;
    const btnGroup = document.createElement('div');
    btnGroup.id = 'nxm-tld-controls';
    btnGroup.style.display = 'inline-flex';
    btnGroup.style.gap = '10px';
    btnGroup.style.marginLeft = '15px';

    btnGroup.innerHTML = `
      <button id="nxm-enable-all" class="btn btn-primary">Enable ALL TLDs</button>
      <button id="nxm-disable-all" class="btn btn-danger">Disable ALL TLDs</button>
      <button id="nxm-restore" class="btn btn-secondary" style="display: none;">Restore TLDs</button>
      <button id="nxm-toggle-table" class="btn btn-secondary" style="background: #6c757d; border-color: #6c757d;">👁️ Toggle List</button>
    `;
    container.appendChild(btnGroup);

    document.getElementById('nxm-enable-all').onclick = handleEnableAll;
    document.getElementById('nxm-disable-all').onclick = handleDisableAll;
    document.getElementById('nxm-restore').onclick = handleRestore;

    const card = container.closest('.card');
    if (card) {
      const listGroup = card.querySelector('.list-group');
      if (listGroup) {
        listGroup.style.display = 'none'; 
        document.getElementById('nxm-toggle-table').onclick = () => {
          listGroup.style.display = listGroup.style.display === 'none' ? '' : 'none';
        };
      }
    }
    checkBackupStatus();
  }
}

function injectModalButtons() {
  const modal = document.querySelector('.modal-dialog.modal-lg.modal-dialog-scrollable');
  if (modal && !document.getElementById('nxm-modal-enable-all')) {
    const enableAll = document.createElement('button');
    enableAll.id = 'nxm-modal-enable-all';
    enableAll.className = 'btn btn-primary';
    enableAll.style.cssText = 'position: absolute; right: 250px; bottom: 10px; z-index: 9999;';
    enableAll.textContent = 'Enable ALL TLDs';
    enableAll.onclick = handleEnableAll;

    const disableAll = document.createElement('button');
    disableAll.id = 'nxm-modal-disable-all';
    disableAll.className = 'btn btn-danger';
    disableAll.style.cssText = 'position: absolute; right: 100px; bottom: 10px; z-index: 9999;';
    disableAll.textContent = 'Disable ALL TLDs';
    disableAll.onclick = handleDisableAll;

    modal.appendChild(enableAll);
    modal.appendChild(disableAll);
  }
}

function showProgressUI(actionText, total) {
  let ui = document.getElementById('nxm-progress-ui');
  if (!ui) {
    ui = document.createElement('div');
    ui.id = 'nxm-progress-ui';
    ui.style.cssText = 'position: fixed; top: 20px; right: 20px; width: 300px; background: white; color: #333; padding: 15px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); z-index: 10000; font-family: sans-serif; border: 1px solid #ccc;';
    
    const textDiv = document.createElement('div');
    textDiv.id = 'nxm-progress-text';
    textDiv.style.cssText = 'font-weight: bold; margin-bottom: 10px;';
    textDiv.textContent = actionText + '...';

    const barContainer = document.createElement('div');
    barContainer.style.cssText = 'width: 100%; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;';

    const bar = document.createElement('div');
    bar.id = 'nxm-progress-bar';
    bar.style.cssText = 'height: 100%; background: #007bff; width: 0%; transition: width 0.1s;';
    barContainer.appendChild(bar);

    const countDiv = document.createElement('div');
    countDiv.id = 'nxm-progress-count';
    countDiv.style.cssText = 'font-size: 0.85em; color: #666; margin-top: 5px; text-align: right;';
    countDiv.textContent = `0 / ${total}`;

    ui.appendChild(textDiv);
    ui.appendChild(barContainer);
    ui.appendChild(countDiv);

    document.body.appendChild(ui);
  } else {
    document.getElementById('nxm-progress-text').textContent = actionText + '...';
    document.getElementById('nxm-progress-count').textContent = `0 / ${total}`;
    document.getElementById('nxm-progress-bar').style.width = '0%';
  }
}

function updateProgress(current, total) {
  const bar = document.getElementById('nxm-progress-bar');
  const count = document.getElementById('nxm-progress-count');
  if (bar && count) {
    const percentage = Math.round((current / total) * 100);
    bar.style.width = `${percentage}%`;
    count.textContent = `${current} / ${total}`;
  }
}

function removeProgressUI() {
  const ui = document.getElementById('nxm-progress-ui');
  if (ui) ui.remove();
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
  if (!confirm("This will enable all TLDs. We will create a backup of your current setup first. Continue?")) return;
  const currentTLDs = await getCurrentActiveTLDs(profileId);
  await browser.storage.sync.set({ [`tldBackup_${profileId}`]: currentTLDs });
  checkBackupStatus();
  const modalItems = document.querySelectorAll('.modal-dialog .list-group-item');
  const allTLDs = Array.from(modalItems).map(el => el.textContent.trim().toLowerCase()).filter(text => text.startsWith('.')); 
  if (allTLDs.length === 0) return alert("Please click 'Add a TLD' to open the modal first so the extension can read the master list.");
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
  showProgressUI(actionText, total);
  
  let completed = 0;
  const CONCURRENCY_LIMIT = 10;
  const queue = [...tldArray];

  const runTask = async (tld) => {
    const url = method === 'POST' ? `${INTERNAL_API}/${profileId}/security/tlds` : `${INTERNAL_API}/${profileId}/security/tlds/${tld}`;
    const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (method === 'POST') opts.body = JSON.stringify({ id: tld });
    try { await fetch(url, opts); } catch (e) { console.warn(`Error on ${tld}:`, e); } finally {
      completed++;
      updateProgress(completed, total);
    }
  };

  const workers = Array(Math.min(CONCURRENCY_LIMIT, queue.length)).fill(null).map(async () => {
    while (queue.length > 0) await runTask(queue.shift());
  });

  await Promise.all(workers);
  removeProgressUI();
  btns.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
  if (alertOnFinish) {
    alert(`Success: ${actionText} finished. The page will now reload.`);
    window.location.reload();
  }
}

async function injectProfileNote() {
  if (document.getElementById('nxm-profile-note')) return;

  const profileId = getProfileId();
  if (!profileId) return;

  // Find the profile selector or header area to inject into
  const header = document.querySelector('.navbar-brand')?.parentElement;
  if (!header) return;

  const { profileNotes = {} } = await browser.storage.sync.get("profileNotes");
  const note = profileNotes[profileId] || "";

  const container = document.createElement('div');
  container.id = 'nxm-profile-note';
  container.style.fontSize = '0.85em';
  container.style.color = '#4facf7';
  container.style.marginLeft = '20px';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '8px';
  container.style.cursor = 'pointer';
  container.title = 'Click to edit profile note';

  const icon = document.createElement('span');
  icon.textContent = '📝';
  
  const text = document.createElement('span');
  text.textContent = note ? `Note: ${note}` : 'Add Profile Note';
  text.style.fontStyle = 'italic';

  container.appendChild(icon);
  container.appendChild(text);
  header.appendChild(container);

  container.onclick = async () => {
    const newNote = prompt(`Note for Profile ${profileId}:`, note);
    if (newNote !== null) {
      profileNotes[profileId] = newNote;
      await browser.storage.sync.set({ profileNotes });
      text.textContent = newNote ? `Note: ${newNote}` : 'Add Profile Note';
    }
  };
}