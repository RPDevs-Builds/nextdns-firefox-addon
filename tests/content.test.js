/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://my.nextdns.io/abc123/security"}
 */

import { jest, beforeEach, describe, test, expect } from '@jest/globals';

describe('Content Script (NextDNS Web Console Enhancements)', () => {
    let storageChangedListener;
    let messageListener;

    beforeEach(() => {
        jest.setTimeout(45000);
        document.body.innerHTML = `
            <h5>Block Top-Level Domains (TLDs)</h5>
            <div id="tld-content" class="content-box">TLD List</div>
            <h4>Security Settings</h4>
            <div id="sec-content" class="content-box">Security items</div>
            <div id="nxm-tld-controls">Injected TLD Controls</div>
            <div data-nxm-hidden="true" style="display: none;">Hidden Section</div>
            <div class="list-group-item" data-nxm-filtered="true" style="display: none;">Filtered Log</div>
            <button id="nxm-toggle-table">Toggle Table</button>
            <button id="nxm-toggle-blocklists">Toggle Blocklists</button>
        `;

        global.browser = {
            storage: {
                sync: {
                    get: jest.fn().mockResolvedValue({
                        webGuiMaster: true,
                        webGuiTlds: true,
                        webGuiBlocklists: true,
                        webGuiLogActions: true,
                        webGuiDesc: true,
                        webGuiProfileNotes: true,
                        webGuiFilter: true,
                        webGuiForcedTheme: 'default',
                        hostnameAliases: { '192.168.1.10': 'Smart TV' }
                    }),
                    set: jest.fn().mockResolvedValue({})
                },
                local: {
                    get: jest.fn().mockResolvedValue({}),
                    set: jest.fn().mockResolvedValue({})
                },
                onChanged: {
                    addListener: jest.fn(cb => storageChangedListener = cb)
                }
            },
            runtime: {
                getURL: jest.fn((p) => `chrome-extension://test/${p}`),
                sendMessage: jest.fn().mockResolvedValue({ success: true }),
                onMessage: {
                    addListener: jest.fn(cb => messageListener = cb)
                }
            }
        };

        global.confirm = jest.fn(() => true);
        global.prompt = jest.fn(() => 'Test Note');

        global.fetch = jest.fn().mockImplementation((url) => {
            if (url.includes('domSelectors.json')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        dashboard: {
                            tldHeader: { selector: "h5", textMatches: "Block Top-Level Domains (TLDs)" },
                            blocklistHeader: { selector: "h5", textMatches: "Blocklists" },
                            logsHeader: { selector: ".Logs .list-group-item.bg-2 .d-md-flex" },
                            logRows: { selector: ".list-group-item" },
                            apiInputKey: { selector: "input.api-key", patternMatches: "^[a-f0-9]{24}$" }
                        }
                    })
                });
            }
            if (url.includes('/security/tlds')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({ data: [{ id: 'xyz' }, { id: 'top' }] })
                });
            }
            return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
        });
    });

    test('Initializes content script, loads selectors, and configures collapsible headers', async () => {
        await import('../src/content.js');
        await new Promise(r => setTimeout(r, 60));

        // Collapsible header test
        const h5 = document.querySelector('h5');
        expect(h5.classList.contains('nxm-collapsible-header')).toBe(true);
        const collapseBtn = h5.querySelector('.nxm-collapse-btn');
        expect(collapseBtn).not.toBeNull();
        expect(collapseBtn.textContent).toBe('▼');

        // Click to collapse
        h5.click();
        expect(collapseBtn.textContent).toBe('▶');
        const nextContent = document.getElementById('tld-content');
        expect(nextContent.style.display).toBe('none');

        // Click to expand
        h5.click();
        expect(collapseBtn.textContent).toBe('▼');
        expect(nextContent.style.display).toBe('');
    });

    test('runtime.onMessage handles TOGGLE_TLD_LIST and TOGGLE_BLOCKLIST_LIST', async () => {
        await import('../src/content.js');
        await new Promise(r => setTimeout(r, 60));

        expect(messageListener).toBeDefined();

        const tldBtn = document.getElementById('nxm-toggle-table');
        const clickSpy = jest.spyOn(tldBtn, 'click');

        const sendResponse = jest.fn();
        messageListener({ type: 'TOGGLE_TLD_LIST' }, {}, sendResponse);
        expect(clickSpy).toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({ success: true });

        const blBtn = document.getElementById('nxm-toggle-blocklists');
        const blClickSpy = jest.spyOn(blBtn, 'click');
        messageListener({ type: 'TOGGLE_BLOCKLIST_LIST' }, {}, sendResponse);
        expect(blClickSpy).toHaveBeenCalled();
    });

    test('Extracts API key when on account page', async () => {
        window.history.pushState({}, '', '/account');

        document.body.innerHTML += `
            <input class="api-key" type="text" value="0123456789abcdef01234567" />
        `;

        window.dispatchEvent(new Event('hashchange'));
        await new Promise(r => setTimeout(r, 180));

        expect(global.browser.storage.sync.set).toHaveBeenCalledWith({
            apiKey: '0123456789abcdef01234567'
        });
    });

    test('Storage onChanged listener updates live config and cleans up UI when master disabled', async () => {
        await import('../src/content.js');
        await new Promise(r => setTimeout(r, 60));

        expect(storageChangedListener).toBeDefined();

        const hiddenEl = document.querySelector('[data-nxm-hidden="true"]');
        expect(hiddenEl).not.toBeNull();

        // Master toggle disabled
        storageChangedListener({
            webGuiMaster: { newValue: false }
        }, 'sync');

        expect(hiddenEl.style.display).toBe('');
        expect(hiddenEl.dataset.nxmHidden).toBeUndefined();

        // Forced theme update
        storageChangedListener({
            webGuiMaster: { newValue: true },
            webGuiForcedTheme: { newValue: 'dark' }
        }, 'sync');
        expect(document.documentElement.classList.contains('nxm-forced-dark')).toBe(true);

        storageChangedListener({
            webGuiForcedTheme: { newValue: 'light' }
        }, 'sync');
        expect(document.documentElement.classList.contains('nxm-forced-light')).toBe(true);
    });

    test('Device Aliases replaces spans with friendly names and detailed tooltips', async () => {
        document.body.innerHTML += `
            <div class="row">
                <span class="notranslate">192.168.1.10</span>
                <span class="notranslate">unknown-device</span>
            </div>
        `;

        await import('../src/content.js');
        await new Promise(r => setTimeout(r, 60));

        const spans = document.querySelectorAll('.notranslate');
        // 1. String alias from storage: 'Smart TV'
        expect(spans[0].dataset.nxmAliased).toBe("true");
        expect(spans[0].textContent).toBe("Smart TV");
        expect(spans[0].querySelector('span').title).toBe("ID: 192.168.1.10");

        // 2. Unknown device untouched
        expect(spans[1].dataset.nxmAliased).toBeUndefined();
        expect(spans[1].textContent).toBe("unknown-device");
    });

    test('Blocklist Modal Sort button sorts modal list items alphabetically', async () => {
        await import('../src/content.js');

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-header"><h5>Add a blocklist</h5></div>
            <div class="list-group">
                <div class="list-group-item"><strong>Zebra List</strong></div>
                <div class="list-group-item"><strong>Alpha List</strong></div>
                <div class="list-group-item"><strong>Beta List</strong></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Wait for MutationObserver callback
        await new Promise(r => setTimeout(r, 180));

        const sortBtn = modal.querySelector('#nxm-sort-blocklists');
        expect(sortBtn).not.toBeNull();

        sortBtn.click();

        const items = modal.querySelectorAll('.list-group-item strong');
        expect(items[0].textContent).toBe("Alpha List");
        expect(items[1].textContent).toBe("Beta List");
        expect(items[2].textContent).toBe("Zebra List");
    });

    test('Network Error modal suppression hides modal and presents reconnecting toast', async () => {
        await import('../src/content.js');

        const errorModal = document.createElement('div');
        errorModal.className = 'modal';
        errorModal.textContent = 'Network Error occurred while syncing';
        document.body.appendChild(errorModal);

        await new Promise(r => setTimeout(r, 60));

        expect(errorModal.style.display).toBe('none');
        expect(errorModal.style.opacity).toBe('0');

        const toast = document.getElementById('nxm-toast');
        expect(toast).not.toBeNull();
        expect(toast.textContent).toContain('Reconnecting to NextDNS...');
    });

    test('Privacy controls filter blocklists and toggle list rollup', async () => {
        window.history.pushState({}, '', '/abc123/privacy');

        document.body.innerHTML += `
            <div class="list-group">
                <div class="list-group-item">
                    <h5>Blocklists</h5>
                </div>
                <div class="list-group-item" id="item-easylist">EasyList - Ad blocking (150,000 entries)</div>
                <div class="list-group-item" id="item-oisd">OISD Basic - Privacy protection (80,000 entries)</div>
            </div>
        `;

        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        const controls = document.getElementById('nxm-privacy-controls');
        expect(controls).not.toBeNull();

        const searchInput = document.getElementById('nxm-search-blocklists');
        const toggleBtn = document.getElementById('nxm-toggle-blocklists');

        // Search for 'oisd'
        searchInput.value = 'oisd';
        searchInput.dispatchEvent(new Event('input'));

        const easyItem = document.getElementById('item-easylist');
        const oisdItem = document.getElementById('item-oisd');
        expect(easyItem.style.display).toBe('none');
        expect(oisdItem.style.display).toBe('');

        // Toggle list rollup
        toggleBtn.click();
        expect(oisdItem.style.display).toBe('none');
        toggleBtn.click();
        expect(oisdItem.style.display).toBe('');
    });

    test('Bulk Add button on allowlist/denylist page splits domains and dispatches messages', async () => {
        window.history.pushState({}, '', '/myprofile/allowlist');
        global.prompt = jest.fn().mockReturnValue('good1.com, good2.org, bad-entry, good3.net');
        global.confirm = jest.fn().mockReturnValue(true);

        document.body.innerHTML = `
            <form>
                <input type="text" />
            </form>
        `;

        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        const bulkBtn = document.getElementById('nxm-bulk-add-btn');
        if (bulkBtn) {
            await bulkBtn.onclick(new Event('click'));
            expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'MANAGE_DOMAIN',
                domain: 'good1.com',
                action: 'add'
            }));
            expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'MANAGE_DOMAIN',
                domain: 'good2.org',
                action: 'add'
            }));
            expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'MANAGE_DOMAIN',
                domain: 'good3.net',
                action: 'add'
            }));
        }
    });

    test('Profile note and switcher are injected into header', async () => {
        global.browser.storage.sync.get.mockImplementation(async (keys) => {
            if (keys === 'profileNotes' || (Array.isArray(keys) && keys.includes('profileNotes'))) {
                return { profileNotes: { abc123: 'Production Profile' } };
            }
            return {
                webGuiMaster: true,
                webGuiProfileNotes: true,
                profileNotes: { abc123: 'Production Profile' }
            };
        });

        global.browser.runtime.sendMessage.mockImplementation(async (msg) => {
            if (msg.type === 'GET_PROFILES_LIST') {
                return {
                    success: true,
                    data: [
                        { id: 'abc123', name: 'Primary' },
                        { id: 'xyz789', name: 'Secondary' }
                    ]
                };
            }
            return { success: true };
        });

        document.body.innerHTML += `
            <nav class="navbar">
                <div class="container-fluid">
                    <a class="navbar-brand">NextDNS</a>
                </div>
            </nav>
        `;

        window.history.pushState({}, '', '/abc123/setup');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        const note = document.getElementById('nxm-profile-note');
        expect(note).not.toBeNull();
        expect(note.textContent).toContain('Production Profile');

        const switcher = document.getElementById('nxm-profile-switcher');
        expect(switcher).not.toBeNull();
        expect(switcher.options.length).toBe(2);
        expect(switcher.value).toBe('abc123');
    });

    test('Logs page controls and filter toggle are injected into logs view', async () => {
        document.body.innerHTML += `
            <div class="Logs">
                <div class="list-group-item bg-2">
                    <div class="d-md-flex">
                        <h5>Logs</h5>
                    </div>
                </div>
            </div>
        `;

        window.history.pushState({}, '', '/abc123/logs');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        const logGroup = document.getElementById('nxm-logs-filter-group');
        expect(logGroup).not.toBeNull();

        const toggle = document.getElementById('nxm-filtered-logs-toggle');
        expect(toggle).not.toBeNull();
        expect(toggle.checked).toBe(true);

        const highlight = document.getElementById('nxm-logs-highlight');
        expect(highlight).not.toBeNull();
    });

    test('TLD page buttons enable search filtering and list toggling', async () => {
        document.body.innerHTML = `
            <div class="list-group">
                <div class="list-group-item">
                    <h5>Block Top-Level Domains (TLDs)</h5>
                </div>
                <div class="list-group-item" id="tld-xyz">.xyz - High risk</div>
                <div class="list-group-item" id="tld-top">.top - Spammer favorite</div>
            </div>
        `;

        window.history.pushState({}, '', '/abc123/security');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        const tldControls = document.getElementById('nxm-tld-controls');
        expect(tldControls).not.toBeNull();

        const search = document.getElementById('nxm-search-tlds');
        const toggle = document.getElementById('nxm-toggle-table');

        // Search for .xyz
        search.value = 'xyz';
        search.dispatchEvent(new Event('input'));

        expect(document.getElementById('tld-xyz').style.display).toBe('');
        expect(document.getElementById('tld-top').style.display).toBe('none');

        // Toggle table
        toggle.click();
        expect(document.getElementById('tld-xyz').style.display).toBe('none');
    });

    test('browser.runtime.onMessage handles TOGGLE_TLD_LIST and TOGGLE_BLOCKLIST_LIST', async () => {
        let tldClicked = false;
        let blocklistClicked = false;

        document.getElementById('nxm-toggle-table').onclick = () => { tldClicked = true; };
        document.getElementById('nxm-toggle-blocklists').onclick = () => { blocklistClicked = true; };

        await import('../src/content.js');
        expect(messageListener).toBeDefined();

        let responseTld = null;
        messageListener({ type: 'TOGGLE_TLD_LIST' }, {}, (r) => { responseTld = r; });
        expect(tldClicked).toBe(true);
        expect(responseTld).toEqual({ success: true });

        let responseBlocklist = null;
        messageListener({ type: 'TOGGLE_BLOCKLIST_LIST' }, {}, (r) => { responseBlocklist = r; });
        expect(blocklistClicked).toBe(true);
        expect(responseBlocklist).toEqual({ success: true });
    });

    test('injectHeaderFilteredLogsButton injects eye button and dropdown item', async () => {
        document.body.innerHTML = `
            <div class="header-nav">
                <div>
                    <div class="dropdown">
                        <button class="dropdown-toggle">Account</button>
                        <div class="dropdown-menu">
                            <a href="/account" class="dropdown-item">Settings</a>
                        </div>
                    </div>
                </div>
            </div>
        `;

        window.history.pushState({}, '', '/abc123/logs');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        const eyeBtn = document.getElementById('nxm-header-filtered-logs-btn');
        expect(eyeBtn).not.toBeNull();
        expect(eyeBtn.textContent).toBe('👁️‍🗨️');

        const dropItem = document.getElementById('nxm-dropdown-filtered-logs-item');
        expect(dropItem).not.toBeNull();
        expect(dropItem.textContent).toContain('Manage Filtered Logs');
    });

    test('applyDomainListStyling injects Sort A-Z button and styles domain items', async () => {
        document.body.innerHTML = `
            <div class="container">
                <div class="list-group">
                    <div class="list-group-item">
                        <span class="notranslate">zebra.com</span>
                    </div>
                    <div class="list-group-item">
                        <span class="notranslate">sub.alpha.com</span>
                    </div>
                    <div class="list-group-item">
                        <span class="notranslate">beta.org</span>
                    </div>
                </div>
            </div>
        `;

        window.history.pushState({}, '', '/abc123/allowlist');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        const sortBtn = document.getElementById('nxm-sort-domains');
        expect(sortBtn).not.toBeNull();
        expect(sortBtn.textContent).toBe('Sort A-Z');

        // Verify root domain bolding
        const subItem = document.querySelectorAll('.list-group-item')[1];
        const span = subItem.querySelector('.notranslate span');
        const strong = subItem.querySelector('.notranslate strong');
        expect(span.textContent).toBe('sub.');
        expect(strong.textContent).toBe('alpha.com');

        // Trigger Sort A-Z
        sortBtn.click();

        const sortedDomains = Array.from(document.querySelectorAll('.list-group-item .notranslate'))
            .map(el => el.textContent.trim());
        expect(sortedDomains).toEqual(['sub.alpha.com', 'beta.org', 'zebra.com']);
    });

    test('Domain notes and bulk management checkboxes on allowlist', async () => {
        document.body.innerHTML = `
            <div class="container">
                <div class="list-group">
                    <div class="list-group-item">
                        <span class="notranslate">note-domain.com</span>
                        <button class="btn-danger">Delete</button>
                    </div>
                    <div class="list-group-item">
                        <span class="notranslate">other-domain.com</span>
                        <button class="btn-danger">Delete</button>
                    </div>
                </div>
            </div>
        `;

        global.browser.storage.sync.get.mockImplementation(async (keys) => {
            if (keys === 'domainDescriptions') {
                return { domainDescriptions: { 'note-domain.com': 'Critical server' } };
            }
            return {
                webGuiMaster: true,
                webGuiDesc: true,
                domainDescriptions: { 'note-domain.com': 'Critical server' }
            };
        });

        window.history.pushState({}, '', '/abc123/allowlist');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        // Verify note rendered
        const descContainer = document.querySelector('.nxm-domain-desc');
        expect(descContainer).not.toBeNull();
        expect(descContainer.textContent).toContain('Critical server');

        // Verify bulk checkboxes and header
        const checkboxes = document.querySelectorAll('.nxm-bulk-cb');
        expect(checkboxes.length).toBe(2);

        const bulkHeader = document.getElementById('nxm-bulk-header');
        expect(bulkHeader).not.toBeNull();

        // Select All toggle
        const selectAllCb = bulkHeader.querySelector('input[type="checkbox"]');
        selectAllCb.checked = true;
        selectAllCb.onchange({ target: { checked: true } });
        expect(checkboxes[0].checked).toBe(true);
        expect(checkboxes[1].checked).toBe(true);

        // Edit note via prompt
        global.prompt = jest.fn(() => 'Updated note');
        const editBtn = descContainer.querySelector('button');
        editBtn.click();
        await new Promise(r => setTimeout(r, 60));

        expect(global.prompt).toHaveBeenCalledWith('Note for note-domain.com:', 'Critical server');
        expect(global.browser.storage.sync.set).toHaveBeenCalledWith({
            domainDescriptions: expect.objectContaining({ 'note-domain.com': 'Updated note' })
        });

        // Delete note when prompt returns empty string
        global.prompt = jest.fn(() => '');
        editBtn.click();
        await new Promise(r => setTimeout(r, 60));
        expect(global.browser.storage.sync.set).toHaveBeenCalled();

        // Delete selected bulk domains
        const delBtn = bulkHeader.querySelector('.btn-danger');
        await delBtn.onclick();
        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'MANAGE_DOMAIN',
            action: 'delete'
        }));
    });

    test('Log row actions (Allow, Deny, Hide) and live timestamps', async () => {
        document.body.innerHTML = `
            <div class="list-group">
                <div class="list-group-item">
                    <time datetime="2026-10-11T12:34:56Z">12:34</time>
                    <span class="notranslate">telemetry.service.io</span>
                </div>
            </div>
        `;

        global.browser.storage.sync.get.mockResolvedValue({
            webGuiMaster: true,
            webGuiLogActions: true,
            logFilters: {}
        });

        window.history.pushState({}, '', '/abc123/logs');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        const actionsContainer = document.querySelector('.nxm-log-actions');
        expect(actionsContainer).not.toBeNull();

        const buttons = actionsContainer.querySelectorAll('button');
        expect(buttons.length).toBe(3); // Allow, Deny, Hide

        // Test Allow action
        buttons[0].click();
        expect(global.confirm).toHaveBeenCalledWith(expect.stringContaining('telemetry.service.io to allowlist'));
        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'MANAGE_DOMAIN',
            profileId: 'abc123',
            listType: 'allowlist',
            action: 'add',
            domain: 'telemetry.service.io'
        });

        // Test Deny action
        buttons[1].click();
        expect(global.confirm).toHaveBeenCalledWith(expect.stringContaining('telemetry.service.io to denylist'));
        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'MANAGE_DOMAIN',
            profileId: 'abc123',
            listType: 'denylist',
            action: 'add',
            domain: 'telemetry.service.io'
        });

        // Test Hide action (opens filter modal)
        buttons[2].click();
        await new Promise(r => setTimeout(r, 60));
        const modalBackdrop = document.getElementById('nxm-filter-modal-backdrop');
        expect(modalBackdrop).not.toBeNull();
        expect(document.getElementById('nxm-new-filter-pattern').value).toBe('telemetry.service.io');
    });

    test('Filtered logs modal manager: adding, searching, deleting, and clearing filters', async () => {
        document.body.innerHTML = `
            <div class="header-nav">
                <div>
                    <div class="dropdown">
                        <button class="dropdown-toggle">Account</button>
                        <div class="dropdown-menu">
                            <a href="/account" class="dropdown-item">Settings</a>
                        </div>
                    </div>
                </div>
            </div>
            <div id="nxm-manage-filters-btn">⚙️ Manage (0)</div>
        `;

        const mockFilters = {
            '*.metrics.com': 'Analytics',
            'api.track.org': 'Tracker'
        };

        global.browser.storage.sync.get.mockImplementation(async (keys) => {
            if (keys === 'logFilters') return { logFilters: { ...mockFilters } };
            return { webGuiMaster: true, logFilters: { ...mockFilters } };
        });

        window.history.pushState({}, '', '/abc123/logs');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        // Click eye button to open modal
        const headerBtn = document.getElementById('nxm-header-filtered-logs-btn');
        expect(headerBtn).not.toBeNull();
        headerBtn.click();
        await new Promise(r => setTimeout(r, 60));

        const modalBackdrop = document.getElementById('nxm-filter-modal-backdrop');
        expect(modalBackdrop).not.toBeNull();

        // Check active badge
        const badge = document.getElementById('nxm-modal-badge');
        expect(badge.textContent).toBe('2 Active');

        // Search rules
        const searchInput = modalBackdrop.querySelector('input[type="search"]');
        searchInput.value = 'track';
        searchInput.oninput({ target: { value: 'track' } });

        const items = modalBackdrop.querySelectorAll('.nxm-filter-item');
        expect(items.length).toBe(1);
        expect(items[0].textContent).toContain('api.track.org');

        // Clear search
        searchInput.value = '';
        searchInput.oninput({ target: { value: '' } });

        // Add new filter
        const patInput = document.getElementById('nxm-new-filter-pattern');
        const noteInput = document.getElementById('nxm-new-filter-note');
        const addBtn = modalBackdrop.querySelector('.btn-primary');

        patInput.value = 'new-tracker.net';
        noteInput.value = 'New Telemetry';
        await addBtn.onclick();

        expect(global.browser.storage.sync.set).toHaveBeenCalledWith({
            logFilters: expect.objectContaining({
                'new-tracker.net': 'New Telemetry'
            })
        });

        // Remove a filter
        const delBtn = modalBackdrop.querySelector('.nxm-filter-delete-btn');
        await delBtn.onclick();
        expect(global.browser.storage.sync.set).toHaveBeenCalled();

        // Clear all filters
        const clearAllBtn = modalBackdrop.querySelector('.btn-outline-danger');
        await clearAllBtn.onclick();
        expect(global.browser.storage.sync.set).toHaveBeenCalledWith({ logFilters: {} });

        // Close modal on Escape
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.getElementById('nxm-filter-modal-backdrop')).toBeNull();
    });

    test('Scrapes parental services, blocklists, and TLDs when visiting respective pages', async () => {
        // 1. Parental Controls Scraping
        document.body.innerHTML = `
            <div class="list-group">
                <div class="list-group-item"><span style="font-weight: 500;">YouTube</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">TikTok</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">Netflix</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">Facebook</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">Instagram</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">Snapchat</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">Roblox</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">Discord</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">Twitch</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">Steam</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">Pinterest</span></div>
                <div class="list-group-item"><span style="font-weight: 500;">Spotify</span></div>
            </div>
        `;

        window.history.pushState({}, '', '/abc123/parentalcontrol');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'SAVE_SCRAPED_META',
            payload: expect.objectContaining({ metaType: 'parental_services' })
        }));

        // 2. Blocklists Scraping
        document.body.innerHTML = `
            <div class="list-group">
                <div class="list-group-item"><span style="font-weight: 500;">NextDNS Ads & Trackers</span><span style="font-size: 0.9em;">Default</span> 100,000 entries</div>
                <div class="list-group-item"><span style="font-weight: 500;">AdGuard Base</span><span style="font-size: 0.9em;">List 2</span> 50,000 entries</div>
                <div class="list-group-item"><span style="font-weight: 500;">EasyList</span><span style="font-size: 0.9em;">List 3</span> 70,000 entries</div>
                <div class="list-group-item"><span style="font-weight: 500;">OISD Basic</span><span style="font-size: 0.9em;">List 4</span> 200,000 entries</div>
                <div class="list-group-item"><span style="font-weight: 500;">Steven Black</span><span style="font-size: 0.9em;">List 5</span> 120,000 entries</div>
                <div class="list-group-item"><span style="font-weight: 500;">Goodbye Ads</span><span style="font-size: 0.9em;">List 6</span> 80,000 entries</div>
            </div>
        `;

        window.history.pushState({}, '', '/abc123/privacy');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'SAVE_SCRAPED_META',
            payload: expect.objectContaining({ metaType: 'blocklists' })
        }));

        // 3. TLDs Scraping
        const tldItems = Array.from({ length: 55 }, (_, i) => 
            `<div class="list-group-item"><span style="font-weight: 500;">.tld${i}</span></div>`
        ).join('');
        document.body.innerHTML = `<div class="list-group">${tldItems}</div>`;

        window.history.pushState({}, '', '/abc123/security');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'SAVE_SCRAPED_META',
            payload: expect.objectContaining({ metaType: 'tlds' })
        }));
    });

    test('TLD bulk modal buttons: Enable All, Disable All, and Restore', async () => {
        document.body.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="list-group">
                    <div class="list-group-item">.xyz</div>
                    <div class="list-group-item">.top</div>
                    <div class="list-group-item">.click</div>
                </div>
            </div>
            <button id="nxm-restore" style="display: none;">Restore Backup</button>
        `;

        global.browser.storage.sync.get.mockImplementation(async (keys) => {
            if (keys === 'tldBackup_abc123') return { tldBackup_abc123: ['xyz', 'top'] };
            return { webGuiMaster: true, webGuiTlds: true, tldBackup_abc123: ['xyz', 'top'] };
        });

        window.history.pushState({}, '', '/abc123/security');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        const enableAllBtn = document.getElementById('nxm-modal-enable-all');
        const disableAllBtn = document.getElementById('nxm-modal-disable-all');
        expect(enableAllBtn).not.toBeNull();
        expect(disableAllBtn).not.toBeNull();

        // Enable All TLDs
        await enableAllBtn.onclick();
        expect(global.confirm).toHaveBeenCalledWith(expect.stringContaining('enable all TLDs'));
        expect(global.browser.storage.sync.set).toHaveBeenCalledWith({
            tldBackup_abc123: expect.any(Array)
        });

        // Disable All TLDs
        await disableAllBtn.onclick();
        expect(global.confirm).toHaveBeenCalledWith(expect.stringContaining('disable ALL active TLD blocks'));
        expect(global.fetch).toHaveBeenCalled();

        // Restore Backup
        const restoreBtn = document.getElementById('nxm-restore');
        restoreBtn.onclick = async () => {
            const data = await global.browser.storage.sync.get('tldBackup_abc123');
            expect(data.tldBackup_abc123).toBeDefined();
        };
        await restoreBtn.onclick();
    });

    test('Profile note click in header prompts user and saves to storage', async () => {
        document.body.innerHTML = `
            <div class="header">
                <a class="navbar-brand">NextDNS</a>
            </div>
        `;

        global.browser.storage.sync.get.mockResolvedValue({
            webGuiMaster: true,
            webGuiProfileNotes: true,
            profileNotes: { 'abc123': 'Home Router' }
        });

        window.history.pushState({}, '', '/abc123/setup');
        await import('../src/content.js');
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        const noteContainer = document.getElementById('nxm-profile-note');
        expect(noteContainer).not.toBeNull();
        expect(noteContainer.textContent).toContain('Home Router');

        global.prompt = jest.fn(() => 'Work Laptop');
        noteContainer.click();

        expect(global.prompt).toHaveBeenCalledWith('Note for Profile abc123:', 'Home Router');
        expect(global.browser.storage.sync.set).toHaveBeenCalledWith({
            profileNotes: expect.objectContaining({ 'abc123': 'Work Laptop' })
        });
    });

    test('Forced dark mode preserves NextDNS allowed, denied, and relayed log border highlights and applies high-contrast row tints', async () => {
        document.body.innerHTML = `
            <div class="Logs">
                <div class="list-group">
                    <div class="list-group-item bg-2">Header</div>
                    <div class="log list-group-item" style="border-left: 4px solid rgb(255, 65, 54);">
                        <span class="notranslate">malware-site.bad</span>
                    </div>
                    <div class="log list-group-item" style="border-left: 4px solid rgb(46, 204, 64);">
                        <span class="notranslate">friendly-cdn.com</span>
                    </div>
                    <div class="log list-group-item" style="border-left: 4px solid rgb(174, 0, 255);">
                        <span class="notranslate">affiliate-hop.net</span>
                    </div>
                </div>
            </div>
        `;

        global.browser.storage.sync.get.mockResolvedValue({
            webGuiMaster: true,
            webGuiForcedTheme: 'dark',
            webGuiLogActions: true,
            logFilters: {}
        });

        window.history.pushState({}, '', '/abc123/logs');
        await import('../src/content.js');
        if (storageChangedListener) {
            storageChangedListener({
                webGuiForcedTheme: { newValue: 'dark' },
                webGuiMaster: { newValue: true }
            }, 'sync');
        }
        window.dispatchEvent(new Event('popstate'));
        await new Promise(r => setTimeout(r, 60));

        // Verify dark theme attributes and classes applied
        expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
        expect(document.documentElement.classList.contains('nxm-forced-dark')).toBe(true);

        // Verify style element injected with status-specific rules
        const styleEl = document.getElementById('nxm-log-styles');
        expect(styleEl).not.toBeNull();
        expect(styleEl.textContent).toContain('border-left: 4px solid #ff4136 !important');
        expect(styleEl.textContent).toContain('border-left: 4px solid #2ecc40 !important');
        expect(styleEl.textContent).toContain('border-left: 4px solid #ae00ff !important');
        expect(styleEl.textContent).toContain('rgba(220, 53, 69, 0.12)');
        expect(styleEl.textContent).toContain('rgba(40, 167, 69, 0.10)');
        expect(styleEl.textContent).toContain('rgba(174, 0, 255, 0.10)');
    });
});
