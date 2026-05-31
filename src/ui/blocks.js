/**
 * DNS Forge - Blocks & Toggles UI Module
 * @module ui/blocks
 */

import { state } from './state.js';
import { escapeHTML, setSafeHTML } from './utils.js';
import { loadMetadata } from '../metadataManager.js';

/**
 * Synchronizes the allowlist and denylist for the active profile from the background state.
 * @async
 * @param {boolean} [force=false] - Whether to force a re-sync even if already synced.
 */
export async function syncLists(force = false) {
    if (!state.activeProfile || (!force && state.listsSynced)) return;
    const [a, d] = await Promise.all([
        browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: state.activeProfile, listType: "allowlist", action: "list" }),
        browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: state.activeProfile, listType: "denylist", action: "list" })
    ]).catch(() => [null, null]);

    state.currentAllowlist = new Set((a?.data || []).filter(i => i?.id).map(i => i.id));
    state.currentDenylist = new Set((d?.data || []).filter(i => i?.id).map(i => i.id));
    state.listsSynced = true;

    if (state.activeTab === 'lists') renderLists();
}

/**
 * Renders the Allowlist or Denylist in the "Lists" tab.
 * @param {string|null} [queryOverride=null] - Optional search query override.
 */
export function renderLists(queryOverride = null) {
    const container = document.getElementById("list-items-container");
    if (!container) return;

    const listType = document.getElementById("list-type-select")?.value || 'denylist';
    const query = (queryOverride !== null ? queryOverride : (document.getElementById("list-search-input")?.value || "")).toLowerCase();
    
    const items = listType === 'allowlist' ? state.currentAllowlist : state.currentDenylist;
    
    if (items.size === 0) {
        setSafeHTML(container, `<div style="text-align:center; padding:20px; color:var(--text-muted);">No domains in this list.</div>`);
        return;
    }

    const filtered = Array.from(items).filter(d => d.toLowerCase().includes(query)).sort();

    if (filtered.length === 0) {
        setSafeHTML(container, `<div style="text-align:center; padding:20px; color:var(--text-muted);">No domains match your search.</div>`);
        return;
    }

    const html = filtered.map(domain => `
        <div class="flex-between" style="padding:8px 12px; background:var(--bg-panel); border-radius:6px; margin-bottom:5px; border:1px solid var(--border-color);">
            <span style="font-family:monospace; font-size:0.9em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px;">${escapeHTML(domain)}</span>
            <button class="btn-deny list-delete-btn" data-domain="${escapeHTML(domain)}" style="width:auto; padding:2px 8px; font-size:0.7em;">Remove</button>
        </div>
    `).join('');
    
    setSafeHTML(container, html);

    // Bind delete buttons
    container.querySelectorAll('.list-delete-btn').forEach(btn => {
        btn.onclick = async () => {
            const domain = btn.getAttribute('data-domain');
            btn.disabled = true; btn.textContent = "...";
            const res = await browser.runtime.sendMessage({
                type: "MANAGE_DOMAIN",
                profileId: state.activeProfile,
                listType,
                domain,
                action: "delete"
            });
            if (res.success) {
                if (listType === 'allowlist') state.currentAllowlist.delete(domain);
                else state.currentDenylist.delete(domain);
                renderLists();
            } else {
                btn.disabled = false; btn.textContent = "Error";
            }
        };
    });
}

/**
 * Loads and renders the block settings toggles based on the current sub-tab and search query.
 * @async
 * @param {string|null} [queryOverride=null] - Optional search query override.
 */
export async function loadToggles(queryOverride = null) {
    if (!state.activeProfile) return;
    
    // Ensure metadata is loaded for blocklists/tlds
    if (!state.blocksMeta || state.blocksMeta.blocklists.length === 0) {
        state.blocksMeta = await loadMetadata();
    }

    if (!state.lastBlocksData) {
        const res = await browser.runtime.sendMessage({ type: "GET_ALL_SETTINGS", profileId: state.activeProfile });
        state.lastBlocksData = res?.data || {};
    }

    const container = document.getElementById("toggles-container");
    if (!container) return;

    const query = (queryOverride !== null ? queryOverride : (document.getElementById("blocks-search-input")?.value || "")).toLowerCase();

    
    // UI visibility logic for search/sort
    const searchContainer = document.getElementById("blocks-search-container");
    if (searchContainer) {
        const needsSearch = ['blocklists', 'parental', 'tlds'].includes(state.activeBlocksSubTab);
        searchContainer.classList.toggle('hidden', !needsSearch);
        document.getElementById("blocks-sort-select")?.classList.toggle('hidden', state.activeBlocksSubTab !== 'blocklists');
    }

    let html = '';
    switch (state.activeBlocksSubTab) {
        case 'security': html = renderSecurityToggles(); break;
        case 'privacy': html = renderPrivacyToggles(); break;
        case 'performance': html = renderPerformanceToggles(); break;
        case 'blocklists': html = renderBlocklistsGrid(query); break;
        case 'parental': html = renderParentalToggles(query); break;
        case 'tlds': html = renderTldsGrid(query); break;
    }
    setSafeHTML(container, html);
}

/**
 * Renders the security category toggles.
 * @returns {string} HTML string for security toggles.
 */
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
    return SETTING_GROUPS.items.map(i => renderToggleRow(i, 'security', !!state.lastBlocksData.security?.[i.id], 'boolean')).join('');
}

/**
 * Renders the expert performance category toggles.
 * @returns {string} HTML string for performance toggles.
 */
function renderPerformanceToggles() {
    const ITEMS = [
        { id: 'ecs', label: 'EDNS Client Subnet (ECS)', note: 'Improves global CDN performance.' },
        { id: 'cnameFlattening', label: 'CNAME Flattening', note: 'Speeds up resolution of CNAME chains.' },
        { id: 'cacheBoost', label: 'Cache Boost', note: 'Forces minimum TTL to reduce lookups.' },
        { id: 'web3', label: 'Web3 Support', note: 'Enables .eth and .crypto resolution.' }
    ];

    return `
        <div class="panel-section">
            <h4 style="margin-top:0;">Expert Performance</h4>
            ${ITEMS.map(s => `
                <div class="flex-between" style="margin-bottom:12px;">
                    <div>
                        <div style="font-size:0.9em;">${s.label}</div>
                        <div style="font-size:0.7em; color:var(--text-muted);">${s.note}</div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="toggle-${s.id}" class="api-toggle" data-cat="settings" data-id="${s.id}" ${state.lastBlocksData.settings?.[s.id] ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Renders the privacy category toggles, including native tracking protection.
 * @returns {string} HTML string for privacy toggles.
 */
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

    let html = TRACKING.map(i => renderToggleRow(i, 'settings', !!state.lastBlocksData.settings?.[i.id], 'boolean')).join('');
    const privacyUrl = state.activeProfile ? `https://my.nextdns.io/${state.activeProfile}/privacy` : '#';
    
    html += `<hr style="border-top:1px solid var(--border-color); border-bottom:0; margin:10px 0;">
             <div class="flex-between" style="margin:0 0 5px;">
                <div style="font-weight:bold; font-size: 0.85em;">Native Tracking Protection</div>
                <a href="${privacyUrl}" target="_blank" class="tld-jump-link" style="font-size: 0.75em; padding: 2px 6px; text-decoration: none;">🌐 Privacy Page</a>
             </div>`;

    html += NATIVES.map(i => {
        const isActive = state.lastBlocksData.privacy?.natives?.some(n => n.id === i.id);
        return renderToggleRow(i, 'privacy/natives', isActive, 'list');
    }).join('');
    return html;
}

/**
 * Renders the blocklists grid with search and sort filters.
 * @param {string} query - The search query.
 * @returns {string} HTML string for blocklists grid.
 */
function renderBlocklistsGrid(query) {
    const activeIds = new Set((state.lastBlocksData.privacy?.blocklists || []).map(l => l.id));
    let filtered = state.blocksMeta.blocklists.filter(b => b.name.toLowerCase().includes(query) || b.description.toLowerCase().includes(query));

    if (state.activeBlocksSort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (state.activeBlocksSort === 'updated') filtered.sort((a, b) => b.updated_ts - a.updated_ts);
    else if (state.activeBlocksSort === 'popularity') filtered.sort((a, b) => b.popularity - a.popularity);
    else if (state.activeBlocksSort === 'entries') filtered.sort((a, b) => b.entries - a.entries);

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

/**
 * Renders the parental control toggles and services.
 * @param {string} query - The search query for filtering services.
 * @returns {string} HTML string for parental control section.
 */
function renderParentalToggles(query) {
    const SETTINGS = [
        { id: 'safeSearch', label: 'SafeSearch' },
        { id: 'youtubeRestrictedMode', label: 'YouTube Restricted Mode' }
    ];
    let html = '<div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Global Settings</div>';
    html += SETTINGS.map(i => renderToggleRow(i, 'parentalcontrol', !!state.lastBlocksData.parentalcontrol?.[i.id], 'boolean')).join('');

    html += '<hr style="border-top:1px solid var(--border-color); border-bottom:0; margin:10px 0;"><div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Categories</div>';
    html += (state.blocksMeta.categories || []).map(c => {
        const isActive = state.lastBlocksData.parentalcontrol?.categories?.some(cat => cat.id === c.id);
        return renderToggleRow(c, 'parentalcontrol/categories', isActive, 'list');
    }).join('');

    html += '<hr style="border-top:1px solid var(--border-color); border-bottom:0; margin:10px 0;"><div style="font-weight:bold; margin:0 0 5px; font-size: 0.85em;">Services</div>';
    const activeServices = new Set((state.lastBlocksData.parentalcontrol?.services || []).map(s => s.id));
    html += (state.blocksMeta.parental_services || []).filter(s => s.name.toLowerCase().includes(query)).map(s => {
        const active = activeServices.has(s.id);
        return `
            <div class="flex-between" style="padding:8px; background:var(--bg-panel); border-radius:6px; margin-bottom:5px;">
                <span style="font-size:0.9em;">${escapeHTML(s.name)}</span>
                <button class="api-toggle-btn ${active?'btn-deny':'btn-allow'}"
                    data-cat="parentalcontrol/services" data-id="${s.id}" data-type="list" data-active="${active}"
                    style="width:auto; padding:4px 10px; font-size: 0.7em;">${active?'OFF':'ON'}</button>
            </div>
        `;
    }).join('');

    return html;
}

/**
 * Renders the TLDs grid with jump links and search filtering.
 * @param {string} query - The search query.
 * @returns {string} HTML string for TLDs grid.
 */
function renderTldsGrid(query) {
    const activeTlds = new Set((state.lastBlocksData.security?.tlds || []).map(t => t.id));
    const groups = {};

    state.blocksMeta.tlds.forEach(tld => {
        if (query && !tld.toLowerCase().includes(query)) return;
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
                                style="width:auto; padding:2px 6px; font-size: 0.75em;">${active?'OFF':'ON'}</button>
                        </div>`;
                }).join('')}
            </div>
        </div>
    `).join('') || '<div style="text-align:center; opacity:0.5; padding:20px;">No TLDs match search.</div>';

    return html;
}

/**
 * Renders a standard toggle row for boolean or list-based settings.
 * @param {Object} item - The setting item (id, label/name).
 * @param {string} cat - The category path for the API call.
 * @param {boolean} isActive - Whether the setting is currently active.
 * @param {string} type - The setting type ('boolean' or 'list').
 * @returns {string} HTML string for the toggle row.
 */
function renderToggleRow(item, cat, isActive, type) {
    return `
        <div class="flex-between" style="margin-bottom:12px;">
            <div style="font-size:0.9em;">${escapeHTML(item.label || item.name)}</div>
            <label class="switch">
                <input type="checkbox" class="api-toggle" data-cat="${cat}" data-id="${item.id}" data-type="${type}" ${isActive ? 'checked' : ''}>
                <span class="slider round"></span>
            </label>
        </div>
    `;
}
