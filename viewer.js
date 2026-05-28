let activeTab = 'domains'; // 'domains', 'profiles', or 'filters'

const tabDomains = document.getElementById('tab-domains');
const tabProfiles = document.getElementById('tab-profiles');
const tabFilters = document.getElementById('tab-filters');
const listContainer = document.getElementById('list-container');
const searchInput = document.getElementById('search-input');
const addBtn = document.getElementById('add-btn');

const editModal = document.getElementById('edit-modal');
const modalTitle = document.getElementById('modal-title');
const labelKey = document.getElementById('label-key');
const inputKey = document.getElementById('input-key');
const inputNote = document.getElementById('input-note');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

// Initialize from URL params
const params = new URLSearchParams(window.location.search);
if (params.get('tab') === 'profiles') activeTab = 'profiles';
else if (params.get('tab') === 'filters') activeTab = 'filters';
updateTabs();
renderList();

tabDomains.onclick = () => { activeTab = 'domains'; updateTabs(); renderList(); };
tabProfiles.onclick = () => { activeTab = 'profiles'; updateTabs(); renderList(); };
tabFilters.onclick = () => { activeTab = 'filters'; updateTabs(); renderList(); };
searchInput.oninput = () => renderList();

function updateTabs() {
  tabDomains.classList.toggle('active', activeTab === 'domains');
  tabProfiles.classList.toggle('active', activeTab === 'profiles');
  tabFilters.classList.toggle('active', activeTab === 'filters');
  
  if (activeTab === 'domains') labelKey.textContent = 'Domain';
  else if (activeTab === 'profiles') labelKey.textContent = 'Profile ID';
  else labelKey.textContent = 'Filter Pattern (e.g. **.google.com)';
}

async function renderList() {
  const query = searchInput.value.toLowerCase();
  let storageKey = 'domainDescriptions';
  if (activeTab === 'profiles') storageKey = 'profileNotes';
  if (activeTab === 'filters') storageKey = 'logFilters';
  
  const data = (await browser.storage.sync.get(storageKey))[storageKey] || {};
  
  const entries = Object.entries(data).filter(([key, val]) => {
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
  }

  html += entries.map(([key, val]) => `
    <div class="list-item">
      <div class="item-info">
        <div class="item-title">${escapeHTML(key)}</div>
        <div class="item-desc">${escapeHTML(val)}</div>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-edit" onclick="openEdit('${key}', '${val.replace(/'/g, "\\'")}')">Edit</button>
        <button class="btn btn-delete" onclick="deleteEntry('${key}')">Delete</button>
      </div>
    </div>
  `).join('') || `<div style="text-align:center; padding:40px; color:var(--text-muted);">No ${activeTab} found.</div>`;
  
  listContainer.innerHTML = html;
}

function escapeHTML(str) {
  const p = document.createElement('p');
  p.textContent = str;
  return p.innerHTML;
}

window.openEdit = (key, val) => {
  modalTitle.textContent = `Edit ${activeTab === 'domains' ? 'Domain Description' : (activeTab === 'profiles' ? 'Profile Note' : 'Log Filter')}`;
  inputKey.value = key;
  inputKey.disabled = true;
  inputNote.value = val;
  editModal.style.display = 'flex';
};

addBtn.onclick = () => {
  modalTitle.textContent = `Add ${activeTab === 'domains' ? 'Domain Description' : (activeTab === 'profiles' ? 'Profile Note' : 'Log Filter')}`;
  inputKey.value = '';
  inputKey.disabled = false;
  inputNote.value = '';
  editModal.style.display = 'flex';
};

cancelBtn.onclick = () => {
  editModal.style.display = 'none';
};

saveBtn.onclick = async () => {
  const key = inputKey.value.trim();
  const note = inputNote.value.trim();
  if (!key) return alert('Please enter a key.');

  let storageKey = 'domainDescriptions';
  if (activeTab === 'profiles') storageKey = 'profileNotes';
  if (activeTab === 'filters') storageKey = 'logFilters';

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

window.deleteEntry = async (key) => {
  if (!confirm(`Delete ${activeTab === 'domains' ? 'description' : (activeTab === 'profiles' ? 'note' : 'filter')} for ${key}?`)) return;
  let storageKey = 'domainDescriptions';
  if (activeTab === 'profiles') storageKey = 'profileNotes';
  if (activeTab === 'filters') storageKey = 'logFilters';

  const storage = await browser.storage.sync.get(storageKey);
  const data = storage[storageKey] || {};
  delete data[key];
  const saveObj = {};
  saveObj[storageKey] = data;
  await browser.storage.sync.set(saveObj);
  renderList();
};
