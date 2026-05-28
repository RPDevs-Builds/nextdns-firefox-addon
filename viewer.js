let activeTab = 'domains'; // 'domains' or 'profiles'

const tabDomains = document.getElementById('tab-domains');
const tabProfiles = document.getElementById('tab-profiles');
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
updateTabs();
renderList();

tabDomains.onclick = () => { activeTab = 'domains'; updateTabs(); renderList(); };
tabProfiles.onclick = () => { activeTab = 'profiles'; updateTabs(); renderList(); };
searchInput.oninput = () => renderList();

function updateTabs() {
  tabDomains.classList.toggle('active', activeTab === 'domains');
  tabProfiles.classList.toggle('active', activeTab === 'profiles');
  labelKey.textContent = activeTab === 'domains' ? 'Domain' : 'Profile ID';
}

async function renderList() {
  const query = searchInput.value.toLowerCase();
  const storageKey = activeTab === 'domains' ? 'domainDescriptions' : 'profileNotes';
  const data = (await browser.storage.sync.get(storageKey))[storageKey] || {};
  
  const entries = Object.entries(data).filter(([key, val]) => {
    return key.toLowerCase().includes(query) || val.toLowerCase().includes(query);
  }).sort((a, b) => a[0].localeCompare(b[0]));

  listContainer.innerHTML = entries.map(([key, val]) => `
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
}

function escapeHTML(str) {
  const p = document.createElement('p');
  p.textContent = str;
  return p.innerHTML;
}

window.openEdit = (key, val) => {
  modalTitle.textContent = `Edit ${activeTab === 'domains' ? 'Domain Description' : 'Profile Note'}`;
  inputKey.value = key;
  inputKey.disabled = true;
  inputNote.value = val;
  editModal.style.display = 'flex';
};

addBtn.onclick = () => {
  modalTitle.textContent = `Add ${activeTab === 'domains' ? 'Domain Description' : 'Profile Note'}`;
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

  const storageKey = activeTab === 'domains' ? 'domainDescriptions' : 'profileNotes';
  const storage = await browser.storage.sync.get(storageKey);
  const data = storage[storageKey] || {};
  
  if (note) {
    data[key] = note;
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
  if (!confirm(`Delete ${activeTab === 'domains' ? 'description' : 'note'} for ${key}?`)) return;
  const storageKey = activeTab === 'domains' ? 'domainDescriptions' : 'profileNotes';
  const storage = await browser.storage.sync.get(storageKey);
  const data = storage[storageKey] || {};
  delete data[key];
  const saveObj = {};
  saveObj[storageKey] = data;
  await browser.storage.sync.set(saveObj);
  renderList();
};
