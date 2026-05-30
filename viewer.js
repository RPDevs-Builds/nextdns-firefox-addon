/**
 * DNS Forge - viewer.js
 * Logic for the full-screen Data Manager window.
 * 
 * Performance & Security Refactor - June 2026
 */

// --- Global State ---
let activeTab = 'domains';      // Currently active sub-tab ('domains', 'profiles', 'filters', 'hostnames', 'tlds')
let currentData = {};           // Cache for the active tab's data (storage-based)
let profilesList = [];          // List of available NextDNS profiles
let activeProfile = null;       // Active profile ID for API calls
let blocksMeta = { tlds: [], blocklists: [] };  // Metadata for TLDs & Blocklists
let activeTlds = new Set();     // Currently blocked TLDs
let activeBlocklists = new Set(); // Currently blocked Blocklists

// --- DOM References ---
const listContainer = document.getElementById('list-container');
const searchInput = document.getElementById('search-input');
const addBtn = document.getElementById('add-btn');
const editModal = document.getElementById('edit-modal');
const modalTitle = document.getElementById('modal-title');
const inputKey = document.getElementById('input-key');
const selectProfile = document.getElementById('select-profile');
const inputNote = document.getElementById('input-note');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

/**
 * Robust HTML escaping to prevent XSS
 */
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

/**
 * Main Initialization
 */
async function init() {
    // 1. Detect Active Profile
    const p = await browser.runtime.sendMessage({ type: "GET_PROFILE" }).catch(() => null);
    if (p) activeProfile = p.id;
    
    // 2. Parse initial tab from URL
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('tab');
    if (['profiles', 'filters', 'hostnames', 'tlds', 'blocklists'].includes(initialTab)) {
        activeTab = initialTab;
    }
    
    // 3. Setup event listeners
    initEventListeners();
    
    // 4. Initial Render
    await refreshView();
    
    // 5. Fetch profiles for selection
    fetchProfiles();
}

/**
 * Bind global UI events
 */
function initEventListeners() {
    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = async () => {
            activeTab = btn.id.replace('tab-', '');
            await refreshView();
        };
    });

    // Search Input
    searchInput.oninput = () => renderList();

    // Add New Entry
    addBtn.onclick = openAddModal;

    // Modal Controls
    cancelBtn.onclick = () => { editModal.style.display = 'none'; };
    saveBtn.onclick = handleSave;

    // Global Click Delegation for List Items (Edit/Delete/Toggle)
    listContainer.onclick = async (e) => {
        const target = e.target;
        
        // Handle API Toggles (TLDs, Blocklists)
        if (target.closest('.api-toggle-btn')) {
            handleApiToggle(target.closest('.api-toggle-btn'));
            return;
        }
        
        // Handle Edit/Delete Buttons
        const btn = target.closest('.btn');
        if (!btn) return;
        
        const key = btn.getAttribute('data-key');
        if (!key) return;

        if (btn.classList.contains('btn-edit')) {
            openEditModal(key);
        } else if (btn.classList.contains('btn-delete')) {
            handleDelete(key);
        }
    };
}

/**
 * Central View Refresher
 */
async function refreshView() {
    // Update Tab UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `tab-${activeTab}`);
    });
    
    // Update Control visibility
    const isBackup = activeTab === 'backup';
    const isSnapshots = activeTab === 'snapshots';
    addBtn.classList.toggle('hidden', ['tlds', 'blocklists', 'backup', 'snapshots'].includes(activeTab));
    document.getElementById('main-controls').classList.toggle('hidden', isBackup || isSnapshots);
    listContainer.classList.toggle('hidden', isBackup || isSnapshots);
    document.getElementById('backup-container').classList.toggle('hidden', !isBackup);
    document.getElementById('snapshots-container').classList.toggle('hidden', !isSnapshots);
    
    if (isBackup) {
        setupBackupTab();
        return;
    }
    
    if (isSnapshots) {
        loadSnapshots();
        return;
    }

    // Update Labels
    const labelKey = document.getElementById('label-key');
    const labels = {
        'domains': 'Domain',
        'profiles': 'Profile ID',
        'hostnames': 'Device ID / IP',
        'tlds': 'TLD',
        'blocklists': 'Blocklist',
        'filters': 'Filter Pattern',
        'snapshots': 'Snapshot',
        'rewrites': 'Domain Name'
    };
    if (labelKey) labelKey.textContent = labels[activeTab] || 'Key';

    const inputNote = document.getElementById('input-note');
    if (inputNote) {
        inputNote.placeholder = (activeTab === 'rewrites') ? 'IP Address (e.g. 1.2.3.4)' : 'Notes...';
    }

    // Fetch Data based on tab
    if (activeTab === 'tlds') {
        await fetchTldData();
    } else if (activeTab === 'blocklists') {
        await fetchBlocklistData();
    } else if (activeTab === 'rewrites') {
        await fetchRewritesData();
    } else {
        const storageKey = getStorageKey();
        const sync = await browser.storage.sync.get(storageKey);
        const local = await browser.storage.local.get(storageKey);
        currentData = sync[storageKey] || local[storageKey] || {};
    }

    renderList();
}

/**
 * Helper to safely set HTML from a string (AMO compliance)
 */
function setSafeHTML(el, html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    el.innerHTML = '';
    while (doc.body.firstChild) {
        el.appendChild(doc.body.firstChild);
    }
}

/**
 * Phase 4.2: Profile Snapshots Logic
 */
async function loadSnapshots() {
    if (!activeProfile) return;
    const res = await browser.runtime.sendMessage({ type: "LIST_SNAPSHOTS", profileId: activeProfile });
    const list = document.getElementById('snapshots-list');
    
    if (!res.snapshots || res.snapshots.length === 0) {
        setSafeHTML(list, '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No snapshots yet. Take one before making changes!</div>');
    } else {
        const html = res.snapshots.map((s, i) => `
            <div class="list-item" style="border-left: 4px solid var(--accent); padding-left: 15px;">
                <div class="item-info">
                    <strong>${escapeHTML(s.name)}</strong>
                    <div class="item-note" style="font-size: 0.8em;">${new Date(s.timestamp).toLocaleString()} • ${s.id}</div>
                </div>
                <div class="item-actions">
                    ${i > 0 ? `<button class="btn btn-edit compare-btn" data-id="${s.id}" style="background: var(--bg-panel); color: var(--accent); border: 1px solid var(--accent);">Diff</button>` : ''}
                    <button class="btn btn-add restore-btn" data-id="${s.id}">Restore</button>
                    <button class="btn btn-delete delete-snapshot-btn" data-id="${s.id}">Delete</button>
                </div>
            </div>
        `).join('');
        setSafeHTML(list, html);

        // Event Listeners
        list.querySelectorAll('.compare-btn').forEach(btn => {
            btn.onclick = () => compareSnapshots(btn.getAttribute('data-id'), res.snapshots);
        });
        list.querySelectorAll('.restore-btn').forEach(btn => {
            btn.onclick = () => restoreSnapshot(btn.getAttribute('data-id'), res.snapshots);
        });
        list.querySelectorAll('.delete-snapshot-btn').forEach(btn => {
            btn.onclick = async () => {
                if (confirm("Delete this snapshot permanently?")) {
                    await browser.runtime.sendMessage({ type: "DELETE_SNAPSHOT", profileId: activeProfile, snapshotId: btn.getAttribute('data-id') });
                    loadSnapshots();
                }
            };
        });
    }

    document.getElementById('create-snapshot-btn').onclick = async () => {
        const name = prompt("Enter snapshot name:", `Manual Snapshot ${new Date().toLocaleTimeString()}`);
        if (name === null) return;
        const btn = document.getElementById('create-snapshot-btn');
        btn.disabled = true; btn.textContent = "Taking...";
        await browser.runtime.sendMessage({ type: "CREATE_SNAPSHOT", profileId: activeProfile, name });
        btn.disabled = false; btn.textContent = "📸 Take Snapshot";
        loadSnapshots();
    };
}

function compareSnapshots(id, snapshots) {
    const s1 = snapshots.find(s => s.id === id);
    const s2 = snapshots[0]; // Always compare against the latest
    if (!s1 || !s2) return;

    const diffContainer = document.getElementById('snapshot-diff-container');
    const diffContent = document.getElementById('diff-content');
    
    diffContainer.classList.remove('hidden');
    document.getElementById('close-diff-btn').onclick = () => diffContainer.classList.add('hidden');

    const config1 = s1.config;
    const config2 = s2.config;
    
    let diffStr = `Comparing [${s1.name}] (Old) vs [${s2.name}] (Current)\n\n`;
    
    const categories = ['security', 'privacy', 'parentalcontrol'];
    categories.forEach(cat => {
        const c1 = config1[cat] || {};
        const c2 = config2[cat] || {};
        const allKeys = new Set([...Object.keys(c1), ...Object.keys(c2)]);
        
        let catDiff = "";
        allKeys.forEach(k => {
            if (c1[k] !== c2[k]) {
                catDiff += `${c1[k] ? '+' : '-'} ${k}: ${c1[k]} -> ${c2[k]}\n`;
            }
        });
        if (catDiff) diffStr += `[${cat.toUpperCase()}]\n${catDiff}\n`;
    });

    diffContent.textContent = diffStr || "No differences found in boolean settings.";
}

async function restoreSnapshot(id, snapshots) {
    const s = snapshots.find(s => s.id === id);
    if (!s || !confirm(`Roll back to snapshot [${s.name}]? This will overwrite your current settings.`)) return;

    // Use the existing cloning logic but from the snapshot config
    const logEl = document.getElementById('cloning-log');
    logEl.classList.remove('hidden');
    logEl.textContent = "";
    const startMsg = document.createElement('div');
    startMsg.textContent = "[System] Restoring Snapshot...";
    logEl.appendChild(startMsg);
    
    // Switch to Backup tab to see the log
    document.getElementById('tab-backup').click();
    
    const log = (msg) => { 
        const div = document.createElement('div');
        div.textContent = msg;
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight; 
    };

    try {
        const config = s.config;
        log("Restoration logic initiated...");
        alert("Snapshot rollback initiated! (Feature implementation in progress)");
    } catch (e) {
        log("[Error] " + e.message);
    }
}

/**
 * Phase 3.1: Profile Cloning & Backup Logic
 */
async function setupBackupTab() {
    const cloneTarget = document.getElementById('clone-target-profile');
    const html = profilesList.map(p => 
        `<option value="${p.id}">${escapeHTML(p.name)} (${p.id})</option>`
    ).join('');
    setSafeHTML(cloneTarget, html);

    document.getElementById('export-profile-btn').onclick = handleExportProfile;
    document.getElementById('import-profile-btn').onclick = () => document.getElementById('import-profile-file').click();
    document.getElementById('import-profile-file').onchange = handleImportProfile;
}

async function handleExportProfile() {
    if (!activeProfile) return alert("No active profile detected.");
    
    const btn = document.getElementById('export-profile-btn');
    btn.disabled = true;
    btn.textContent = "Exporting...";

    try {
        const res = await browser.runtime.sendMessage({ type: "GET_ALL_SETTINGS", profileId: activeProfile });
        if (!res?.success) throw new Error(res?.error || "Failed to fetch settings");

        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dns-forge-backup-${activeProfile}-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    } catch (e) {
        alert("Export failed: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "📤 Export to JSON";
    }
}

async function handleImportProfile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const targetProfile = document.getElementById('clone-target-profile').value;
    if (!confirm(`Are you sure you want to CLONE settings to profile ${targetProfile}? This will overwrite existing settings.`)) return;

    const logEl = document.getElementById('cloning-log');
    logEl.classList.remove('hidden');
    logEl.textContent = "";
    const startMsg = document.createElement('div');
    startMsg.textContent = "[System] Starting Import...";
    logEl.appendChild(startMsg);
    
    const log = (msg) => { 
        const div = document.createElement('div');
        div.textContent = msg;
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight; 
    };

    try {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const config = JSON.parse(event.target.result);
            
            // 1. Security Settings
            log("[1/4] Applying Security settings...");
            for (let [key, val] of Object.entries(config.security || {})) {
                if (typeof val === 'boolean') {
                    await browser.runtime.sendMessage({ type: "TOGGLE_SETTING", profileId: targetProfile, category: "security", id: key, action: val ? "add" : "delete", settingType: "boolean" });
                }
            }

            // 2. Privacy settings
            log("[2/4] Applying Privacy settings...");
            for (let [key, val] of Object.entries(config.privacy || {})) {
                if (typeof val === 'boolean') {
                    await browser.runtime.sendMessage({ type: "TOGGLE_SETTING", profileId: targetProfile, category: "privacy", id: key, action: val ? "add" : "delete", settingType: "boolean" });
                }
            }

            // 3. Blocklists & TLDs
            log("[3/4] Enabling Blocklists & TLDs...");
            for (let b of (config.blocklists || [])) {
                await browser.runtime.sendMessage({ type: "TOGGLE_SETTING", profileId: targetProfile, category: "privacy/blocklists", id: b.id, action: "add" });
            }
            for (let t of (config.tlds || [])) {
                await browser.runtime.sendMessage({ type: "TOGGLE_SETTING", profileId: targetProfile, category: "security/tlds", id: t.id, action: "add" });
            }

            // 4. Parental Control
            log("[4/4] Applying Parental Controls...");
            for (let s of (config.services || [])) {
                await browser.runtime.sendMessage({ type: "TOGGLE_SETTING", profileId: targetProfile, category: "parentalControl/services", id: s.id, action: "add" });
            }

            log("[Success] Profile cloned successfully!");
            alert("Cloning complete!");
        };
        reader.readAsText(file);
    } catch (e) {
        log("[Error] " + e.message);
        alert("Import failed: " + e.message);
    }
}

/**
 * Fetch Metadata for TLD Manager (with Fallbacks)
 */
async function fetchTldData() {
    await loadMetadataIfNeeded();
    if (activeProfile) {
        const res = await browser.runtime.sendMessage({ type: "GET_ALL_SETTINGS", profileId: activeProfile });
        if (res?.success && res.data?.tlds) {
            activeTlds = new Set(res.data.tlds.map(t => t.id));
        }
    }
}

/**
 * Fetch Metadata for Blocklist Manager (with Fallbacks)
 */
async function fetchBlocklistData() {
    await loadMetadataIfNeeded();
    if (activeProfile) {
        const res = await browser.runtime.sendMessage({ type: "GET_ALL_SETTINGS", profileId: activeProfile });
        if (res?.success && res.data?.blocklists) {
            activeBlocklists = new Set(res.data.blocklists.map(l => l.id));
        }
    }
}

/**
 * Robust Metadata Loader (Matches popup logic)
 */
async function loadMetadataIfNeeded() {
    if (blocksMeta.blocklists.length > 0 && blocksMeta.tlds.length > 0) return;

    try {
        const storage = await browser.storage.local.get("scrapedMeta");
        if (storage.scrapedMeta?.blocklists && storage.scrapedMeta?.tlds) {
            blocksMeta = storage.scrapedMeta;
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
    } catch (e) {
        console.error("Metadata load failed in Viewer", e);
    }
}

/**
 * Render the main content list
 */
function renderList() {
    const query = searchInput.value.toLowerCase();
    
    if (activeTab === 'tlds') {
        renderTlds(query);
        return;
    }

    if (activeTab === 'blocklists') {
        renderBlocklists(query);
        return;
    }
    
    const entries = Object.entries(currentData).filter(([key, val]) => {
        return key.toLowerCase().includes(query) || val.toLowerCase().includes(query);
    }).sort((a, b) => a[0].localeCompare(b[0]));

    let html = '';
    // Optional info banners
    if (activeTab === 'filters') {
        html += `<div class="panel-box" style="margin: 15px; font-size: 0.9em; opacity: 0.8;">
            <b>Wildcard Rules:</b> <code>domain.tld</code> (Exact), <code>*.domain.tld</code> (Subdomain), <code>**.domain.tld</code> (All Subdomains).
        </div>`;
    }

    // Map entries to HTML
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
    `).join('') || `<div style="text-align:center; padding:60px; opacity:0.5;">No items found in ${activeTab}.</div>`;
    
    setSafeHTML(listContainer, html);
}

/**
 * Render TLD Manager Tab
 */
function renderTlds(query) {
    const groups = {};
    blocksMeta.tlds.forEach(tld => {
        if (query && !tld.toLowerCase().includes(query)) return;
        const letter = tld[0].toUpperCase();
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push(tld);
    });

    const sortedLetters = Object.keys(groups).sort();
    
    let html = `<div id="tlds-top">${sortedLetters.map(l => `<a href="#tld-group-${l}" class="tld-jump-link">${l}</a>`).join('')}</div>`;

    html += sortedLetters.map(letter => `
        <div id="tld-group-${letter}" class="panel-box" style="margin: 20px; padding: 20px; background: var(--bg-panel);">
            <div class="flex-between" style="border-bottom: 1px solid var(--border-color); margin-bottom: 15px; padding-bottom: 10px;">
                <h2 style="margin:0; font-size: 1.5em; color: var(--accent);">${letter}</h2>
                <a href="#tlds-top" style="font-size:0.8em; color:var(--text-muted); text-decoration:none;">↑ BACK TO TOP</a>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                ${groups[letter].map(t => {
                    const active = activeTlds.has(t);
                    return `
                        <div class="flex-between" style="background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 6px;">
                            <span style="font-family:monospace; font-size:0.95em; ${active ? 'color: var(--deny);' : ''}">${escapeHTML(t)}</span>
                            <button class="api-toggle-btn btn ${active ? 'btn-delete' : 'btn-add'}" 
                                data-cat="security/tlds" data-id="${t}" data-active="${active}" 
                                style="padding:4px 10px; font-size: 0.8em;">${active ? 'OFF' : 'ON'}</button>
                        </div>`;
                }).join('')}
            </div>
        </div>
    `).join('') || `<div style="text-align:center; padding:60px; opacity:0.5;">TLD list is empty. Try syncing metadata in Options.</div>`;
    
    setSafeHTML(listContainer, html);
}

/**
 * Render Blocklist Manager Tab
 */
function renderBlocklists(query) {
    let filtered = blocksMeta.blocklists.filter(b => 
        b.name.toLowerCase().includes(query) || b.description.toLowerCase().includes(query)
    );

    let html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; padding: 20px;">
            ${filtered.map(b => {
                const active = activeBlocklists.has(b.id);
                return `
                    <div class="panel-box" style="padding: 15px; display: flex; flex-direction: column; justify-content: space-between; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 8px;">
                        <div>
                            <div class="flex-between" style="margin-bottom: 8px;">
                                <strong style="color: var(--accent);">${escapeHTML(b.name)}</strong>
                                <span style="font-size: 0.75em; opacity: 0.6;">${b.entries_text || ''}</span>
                            </div>
                            <p style="font-size: 0.8em; margin: 0 0 10px; color: var(--text-muted); line-height: 1.4;">${escapeHTML(b.description)}</p>
                        </div>
                        <div class="flex-between" style="margin-top: auto; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05);">
                            <span style="font-size: 0.7em; opacity: 0.5;">${b.updated_text || ''}</span>
                            <button class="api-toggle-btn btn ${active ? 'btn-delete' : 'btn-add'}" 
                                data-cat="privacy/blocklists" data-id="${b.id}" data-active="${active}" 
                                style="padding:4px 12px; font-size: 0.8em;">${active ? 'REMOVE' : 'ENABLE'}</button>
                        </div>
                    </div>`;
            }).join('')}
        </div>`;

    if (filtered.length === 0) {
        html = `<div style="text-align:center; padding:60px; opacity:0.5;">No blocklists found matching your search.</div>`;
    }
    
    setSafeHTML(listContainer, html);
}

/**
 * Modal Actions (Add/Edit)
 */
function openEditModal(key) {
    const val = currentData[key] || "";
    modalTitle.textContent = `Edit Entry`;
    inputKey.value = key;
    inputKey.disabled = true;
    inputKey.classList.remove('hidden');
    selectProfile.classList.add('hidden');
    inputNote.value = val;
    editModal.style.display = 'flex';
}

function openAddModal() {
    modalTitle.textContent = `Add New Entry`;
    inputKey.value = '';
    inputNote.value = '';
    
    const keySection = document.getElementById('key-section');
    const labelKey = document.getElementById('label-key');
    
    if (activeTab === 'profiles') {
        if (labelKey) labelKey.textContent = 'Select Profile';
        inputKey.classList.add('hidden');
        selectProfile.classList.remove('hidden');
    } else {
        if (labelKey) labelKey.textContent = 'Key / Domain';
        inputKey.classList.remove('hidden');
        inputKey.disabled = false;
        selectProfile.classList.add('hidden');
    }
    
    editModal.style.display = 'flex';
}

async function fetchRewritesData() {
    if (!activeProfile) return;
    const res = await browser.runtime.sendMessage({ type: "LIST_REWRITES", profileId: activeProfile });
    if (res.success) {
        currentData = {};
        res.data.forEach(r => {
            currentData[r.name] = r.content;
        });
    }
}

/**
 * Global Actions (Delete/Save)
 */
async function handleSave() {
    const key = (activeTab === 'profiles' && !selectProfile.classList.contains('hidden')) 
        ? selectProfile.value 
        : inputKey.value.trim();
        
    const note = inputNote.value.trim();
    if (!key) return alert('Please enter or select a key.');

    if (activeTab === 'rewrites') {
        if (!activeProfile) return alert("Profile not detected.");
        await browser.runtime.sendMessage({ type: "SAVE_REWRITE", profileId: activeProfile, name: key, content: note });
    } else {
        const storageKey = getStorageKey();
        const storage = await browser.storage.sync.get(storageKey);
        const data = storage[storageKey] || {};
        
        data[key] = note || (activeTab === 'filters' ? "Hidden" : "");
        
        const saveObj = {};
        saveObj[storageKey] = data;
        await Promise.all([
            browser.storage.sync.set(saveObj),
            browser.storage.local.set(saveObj)
        ]);
    }
    
    editModal.style.display = 'none';
    refreshView();
}

async function handleDelete(key) {
    if (!confirm(`Permanently remove entry for "${key}"?`)) return;

    if (activeTab === 'rewrites') {
        await browser.runtime.sendMessage({ type: "DELETE_REWRITE", profileId: activeProfile, name: key });
    } else {
        const storageKey = getStorageKey();
        const storage = await browser.storage.sync.get(storageKey);
        const data = storage[storageKey] || {};
        delete data[key];
        
        const saveObj = {};
        saveObj[storageKey] = data;
        await Promise.all([
            browser.storage.sync.set(saveObj),
            browser.storage.local.set(saveObj)
        ]);
    }
    refreshView();
}

/**
 * Generic API Toggle Handler (TLDs, Blocklists)
 */
async function handleApiToggle(btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    
    const cat = btn.getAttribute('data-cat');
    const id = btn.getAttribute('data-id');
    const active = btn.getAttribute('data-active') === 'true';
    
    const res = await browser.runtime.sendMessage({ 
        type: "TOGGLE_SETTING", 
        profileId: activeProfile, 
        category: cat, 
        id, 
        action: active ? "delete" : "add", 
        settingType: 'list' 
    });
    
    if (res?.success) {
        if (cat.includes('tlds')) {
            if (active) activeTlds.delete(id); else activeTlds.add(id);
        } else if (cat.includes('blocklists')) {
            if (active) activeBlocklists.delete(id); else activeBlocklists.add(id);
        }
        renderList();
    } else {
        alert("Failed to update setting.");
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

/**
 * Utility Helpers
 */
function getStorageKey() {
    const map = {
        'domains': 'domainDescriptions',
        'profiles': 'profileNotes',
        'filters': 'logFilters',
        'hostnames': 'hostnameAliases'
    };
    return map[activeTab] || 'domainDescriptions';
}

async function fetchProfiles() {
    try {
        const res = await browser.runtime.sendMessage({ type: "GET_PROFILES_LIST" });
        if (res && res.data) {
            profilesList = res.data;
            const html = profilesList.map(p => `<option value="${p.id}">${escapeHTML(p.name)} (${p.id})</option>`).join('');
            setSafeHTML(selectProfile, html);
        } else if (Array.isArray(res)) {
            // Handle different API response shapes
            profilesList = res;
            const html = profilesList.map(p => `<option value="${p.id}">${escapeHTML(p.name)} (${p.id})</option>`).join('');
            setSafeHTML(selectProfile, html);
        }
    } catch (e) { console.warn("Failed to fetch profiles for modal", e); }
}

// Start application
init();
