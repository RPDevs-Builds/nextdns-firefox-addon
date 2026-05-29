let activeTab = 'domains'; // 'domains', 'profiles', 'filters', 'hostnames', or 'tlds'
let currentData = {}; // Cache for currently displayed tab
let blocksMeta = { tlds: [] };
let activeTlds = new Set();
let activeProfile = null;

const tabDomains = document.getElementById('tab-domains');
const tabProfiles = document.getElementById('tab-profiles');
const tabFilters = document.getElementById('tab-filters');
const tabHostnames = document.getElementById('tab-hostnames');
const tabTlds = document.getElementById('tab-tlds');
const listContainer = document.getElementById('list-container');
const searchInput = document.getElementById('search-input');
const addBtn = document.getElementById('add-btn');

const editModal = document.getElementById('edit-modal');
const modalTitle = document.getElementById('modal-title');
const labelKey = document.getElementById('label-key');
const inputKey = document.getElementById('input-key');
const selectProfile = document.getElementById('select-profile');
const inputNote = document.getElementById('input-note');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

let profilesList = [];

// Initialize from URL params
const params = new URLSearchParams(window.location.search);
if (params.get('tab') === 'profiles') activeTab = 'profiles';
else if (params.get('tab') === 'filters') activeTab = 'filters';
else if (params.get('tab') === 'hostnames') activeTab = 'hostnames';
else if (params.get('tab') === 'tlds') activeTab = 'tlds';

async function init() {
  const p = await browser.runtime.sendMessage({ type: "GET_PROFILE" }).catch(() => null);
  if (p) activeProfile = p.id;
  
  if (activeTab === 'tlds') {
    await fetchTldData();
  }
  
  updateTabs();
  renderList();
  fetchProfiles();
}

init();

async function fetchTldData() {
  const local = await browser.storage.local.get("scrapedMeta");
  if (local.scrapedMeta && local.scrapedMeta.tlds) {
    blocksMeta.tlds = local.scrapedMeta.tlds;
  }
  if (activeProfile) {
    const res = await browser.runtime.sendMessage({ type: "GET_ALL_SETTINGS", profileId: activeProfile });
    if (res && res.success && res.data && res.data.tlds) {
      activeTlds = new Set(res.data.tlds.map(t => t.id));
    }
  }
}

async function fetchProfiles() {
  try {
    const res = await browser.runtime.sendMessage({ type: "GET_PROFILES_LIST" });
    if (res && res.data) {
      profilesList = res.data;
      populateProfileSelect();
    }
  } catch (e) { console.error("Failed to fetch profiles", e); }
}

function populateProfileSelect() {
  selectProfile.innerHTML = profilesList.map(p => 
    `<option value="${p.id}">${escapeHTML(p.name)} (${p.id})</option>`
  ).join('');
}

tabDomains.onclick = () => { activeTab = 'domains'; updateTabs(); renderList(); };
tabProfiles.onclick = () => { activeTab = 'profiles'; updateTabs(); renderList(); };
tabFilters.onclick = () => { activeTab = 'filters'; updateTabs(); renderList(); };
tabHostnames.onclick = () => { activeTab = 'hostnames'; updateTabs(); renderList(); };
tabTlds.onclick = async () => { activeTab = 'tlds'; updateTabs(); await fetchTldData(); renderList(); };
searchInput.oninput = () => renderList();

function updateTabs() {
  tabDomains.classList.toggle('active', activeTab === 'domains');
  tabProfiles.classList.toggle('active', activeTab === 'profiles');
  tabFilters.classList.toggle('active', activeTab === 'filters');
  tabHostnames.classList.toggle('active', activeTab === 'hostnames');
  tabTlds.classList.toggle('active', activeTab === 'tlds');
  
  addBtn.style.display = activeTab === 'tlds' ? 'none' : 'block';
  
  if (activeTab === 'domains') labelKey.textContent = 'Domain';
  else if (activeTab === 'profiles') labelKey.textContent = 'Profile ID';
  else if (activeTab === 'hostnames') labelKey.textContent = 'Device ID / IP';
  else if (activeTab === 'tlds') labelKey.textContent = 'TLD';
  else labelKey.textContent = 'Filter Pattern (e.g. **.google.com)';
}

async function renderList() {
  const query = searchInput.value.toLowerCase();
  
  if (activeTab === 'tlds') {
    renderTlds(query);
    return;
  }
  
  let storageKey = 'domainDescriptions';
  if (activeTab === 'profiles') storageKey = 'profileNotes';
  if (activeTab === 'filters') storageKey = 'logFilters';
  if (activeTab === 'hostnames') storageKey = 'hostnameAliases';
  
  const storage = await browser.storage.sync.get(storageKey);
  currentData = storage[storageKey] || {};
  
  const entries = Object.entries(currentData).filter(([key, val]) => {
    return key.toLowerCase().includes(query) || val.toLowerCase().includes(query);
  }).sort((a, b) => a[0].localeCompare(b[0]));

  let html = '';
  if (activeTab === 'filters') {
    html += `<div style="padding: 10px; font-size: 0.85em; color: var(--text-muted); background: var(--bg-main); border-radius: 4px; margin-bottom: 15px;">
      <b>Wildcard Rules:</b><br>
      - <code>domain.tld</code>: Exact match only.<br>
      - <code>*.domain.tld</code>: 1 level of subdomains.<br>
      - <code>*.*.domain.tld</code>: 2 levels of subdomains.<br>
      - <code>**.domain.tld</code>: ALL subdomains recursively.
    </div>`;
  } else if (activeTab === 'hostnames') {
    html += `<div style="padding: 10px; font-size: 0.85em; color: var(--text-muted); background: var(--bg-main); border-radius: 4px; margin-bottom: 15px;">
      <b>Device Aliases:</b> Map Device IDs or IPs to friendly names. These will appear in your logs for easier identification.
    </div>`;
  }

  html += entries.map(([key, val]) => `
    <div class="list-item">
      <div class="item-info">
        <div class="item-title">${escapeHTML(key)}</div>
        <div class="item-desc">${escapeHTML(val)}</div>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-edit" data-key="${escapeHTML(key)}">Edit</button>
        <button class="btn btn-delete" data-key="${escapeHTML(key)}">Delete</button>
      </div>
    </div>
  `).join('') || `<div style="text-align:center; padding:40px; color:var(--text-muted);">No ${activeTab} found.</div>`;
  
  listContainer.innerHTML = html;
}

// Event Delegation for Edit/Delete
listContainer.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  const key = btn.getAttribute('data-key');
  if (!key) return;

  if (btn.classList.contains('btn-edit')) {
    openEdit(key);
  } else if (btn.classList.contains('btn-delete')) {
    deleteEntry(key);
  }
});

function escapeHTML(str) {
  const p = document.createElement('p');
  p.textContent = str;
  return p.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function openEdit(key) {
  const val = currentData[key] || "";
  modalTitle.textContent = `Edit ${activeTab === 'domains' ? 'Domain Description' : (activeTab === 'profiles' ? 'Profile Note' : (activeTab === 'hostnames' ? 'Device Alias' : 'Log Filter'))}`;
  
  inputKey.value = key;
  inputKey.disabled = true;
  inputKey.style.display = 'block';
  selectProfile.style.display = 'none';

  inputNote.value = val;
  editModal.style.display = 'flex';
}

addBtn.onclick = () => {
  modalTitle.textContent = `Add ${activeTab === 'domains' ? 'Domain Description' : (activeTab === 'profiles' ? 'Profile Note' : (activeTab === 'hostnames' ? 'Device Alias' : 'Log Filter'))}`;
  inputKey.value = '';
  inputNote.value = '';
  
  if (activeTab === 'profiles') {
    inputKey.style.display = 'none';
    selectProfile.style.display = 'block';
    if (profilesList.length === 0) fetchProfiles();
  } else {
    inputKey.style.display = 'block';
    inputKey.disabled = false;
    selectProfile.style.display = 'none';
  }
  
  editModal.style.display = 'flex';
};

cancelBtn.onclick = () => {
  editModal.style.display = 'none';
};

saveBtn.onclick = async () => {
  const key = (activeTab === 'profiles' && selectProfile.style.display === 'block') 
    ? selectProfile.value 
    : inputKey.value.trim();
    
  const note = inputNote.value.trim();
  if (!key) return alert('Please enter or select a key.');

  let storageKey = 'domainDescriptions';
  if (activeTab === 'profiles') storageKey = 'profileNotes';
  if (activeTab === 'filters') storageKey = 'logFilters';
  if (activeTab === 'hostnames') storageKey = 'hostnameAliases';

  const storage = await browser.storage.sync.get(storageKey);
  const data = storage[storageKey] || {};
  
  if (note || activeTab === 'filters') {
    data[key] = note || "Hidden";
  } else {
    delete data[key];
  }
  
  const saveObj = {};
  saveObj[storageKey] = data;
  await browser.storage.sync.set(saveObj);
  editModal.style.display = 'none';
  renderList();
};

async function deleteEntry(key) {
  if (!confirm(`Delete ${activeTab === 'domains' ? 'description' : (activeTab === 'profiles' ? 'note' : (activeTab === 'hostnames' ? 'alias' : 'filter'))} for ${key}?`)) return;
  let storageKey = 'domainDescriptions';
  if (activeTab === 'profiles') storageKey = 'profileNotes';
  if (activeTab === 'filters') storageKey = 'logFilters';
  if (activeTab === 'hostnames') storageKey = 'hostnameAliases';

  const storage = await browser.storage.sync.get(storageKey);
  const data = storage[storageKey] || {};
  delete data[key];
  const saveObj = {};
  saveObj[storageKey] = data;
  await browser.storage.sync.set(saveObj);
  renderList();
}

function renderTlds(query) {
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
  
  let html = `<div id="tlds-top" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom: 20px; justify-content:center;">
    ${sortedLetters.map(l => `<a href="#tld-group-${l}" style="text-decoration:none; padding: 4px 10px; background:var(--bg-panel); border:1px solid var(--border-color); border-radius:4px; color:var(--text-main);">${l}</a>`).join('')}
  </div>`;

  html += sortedLetters.map(letter => `
    <div id="tld-group-${letter}" style="margin-top: 20px; scroll-margin-top: 20px; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border-color); margin-bottom:10px; padding-bottom: 5px;">
        <div style="font-weight:bold; font-size:1.2em; color:var(--accent);">${letter}</div>
        <a href="#tlds-top" style="font-size:0.85em; text-decoration:none; color:var(--text-muted);">↑ Back to Top</a>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
        ${groups[letter].map(t => {
          const active = activeTlds.has(t);
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 5px; background: rgba(0,0,0,0.2); border-radius: 4px;">
              <span style="font-family:monospace; font-size:0.9em; ${active ? 'text-decoration:line-through; opacity:0.5;' : ''}">${escapeHTML(t)}</span>
              <button class="api-toggle-btn btn ${active ? 'btn-allow' : 'btn-delete'}" data-cat="security/tlds" data-id="${t}" data-active="${active}" style="padding:4px 8px; font-size: 0.8em; margin: 0;">${active ? 'OFF' : 'ON'}</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
  
  if (sortedLetters.length === 0) {
    html = `<div style="text-align:center; padding:40px; color:var(--text-muted);">No TLDs found. Need to sync meta first.</div>`;
  }
  
  listContainer.innerHTML = html;
}

listContainer.addEventListener('click', async (e) => {
  const toggleBtn = e.target.closest('.api-toggle-btn');
  if (toggleBtn) {
    toggleBtn.disabled = true;
    toggleBtn.style.opacity = '0.5';
    const cat = toggleBtn.getAttribute('data-cat');
    const id = toggleBtn.getAttribute('data-id');
    const active = toggleBtn.getAttribute('data-active') === 'true';
    
    const res = await browser.runtime.sendMessage({ 
      type: "TOGGLE_SETTING", 
      profileId: activeProfile, 
      category: cat, 
      id, 
      action: active ? "delete" : "add", 
      settingType: 'list' 
    });
    
    if (res.success) {
      if (active) activeTlds.delete(id);
      else activeTlds.add(id);
      renderTlds(searchInput.value.toLowerCase());
    } else {
      alert("Failed to toggle setting.");
      toggleBtn.disabled = false;
      toggleBtn.style.opacity = '1';
    }
  }
});

