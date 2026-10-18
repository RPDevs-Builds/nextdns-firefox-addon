/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.resolve('src/popup.html'), 'utf8');

describe('Popup UI - Blocks Expansion Suite', () => {
    let state, blocks;

    beforeEach(async () => {
        document.body.innerHTML = html;
        jest.resetModules();

        global.browser = {
            storage: {
                sync: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue({}) },
                local: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue({}) }
            },
            runtime: {
                sendMessage: jest.fn().mockResolvedValue({ success: true, data: [] }),
                getURL: jest.fn(p => p)
            }
        };

        const stateModule = await import('../src/ui/state.js');
        state = stateModule.state;
        blocks = await import('../src/ui/blocks.js');
        
        state.activeProfile = 'p1';
        state.lastBlocksData = { security: {}, privacy: {}, settings: {}, parentalcontrol: {}, blocklists: [], tlds: [], natives: [], services: [] };
        state.blocksMeta = {
            tlds: ['com', 'co.uk', 'app'],
            blocklists: [
                { id: 'oisd', name: 'OISD', description: 'Aggressive' },
                { id: 'nextdns-recommended', name: 'NextDNS Ads & Trackers Blocklist', description: 'Balanced' }
            ],
            categories: [],
            parental_services: []
        };
    });

    test('Blocks UI - TLD Alphabetization and Multi-inclusion', async () => {
        state.activeBlocksSubTab = 'tlds';
        state.lastBlocksData.tlds = [{ id: 'com' }];

        await blocks.loadToggles();

        // Check for 'C' group (from 'com' and 'co.uk')
        const cGroup = document.getElementById('tld-group-C');
        expect(cGroup).not.toBeNull();
        const cHeader = cGroup.querySelector('strong');
        expect(cHeader.textContent).toBe('C');
    });

    test('Blocks UI - Blocklists Management and Search', async () => {
        state.activeBlocksSubTab = 'blocklists';
        await blocks.loadToggles();

        const container = document.getElementById('toggles-container');
        expect(container.textContent).toContain('NextDNS Ads & Trackers Blocklist');
        expect(container.textContent).not.toContain('Updated undefined');
        expect(container.textContent).not.toContain('undefined entries');

        await blocks.loadToggles('zxcvbnm');
        expect(container.textContent).not.toContain('NextDNS Ads & Trackers Blocklist');
        expect(container.textContent).toContain('No blocklists found.');
    });

    test('Blocks UI - Blocklists Metadata Formatting (entries & updated timestamp)', async () => {
        state.activeBlocksSubTab = 'blocklists';
        state.blocksMeta.blocklists = [
            {
                id: 'meta-test-1',
                name: 'List One',
                description: 'First test list',
                entries_text: '84,317 entries',
                updated_text: 'Updated 4 days ago'
            },
            {
                id: 'meta-test-2',
                name: 'List Two',
                description: 'Second test list',
                entries: 12500,
                updated_ts: 1700000000
            },
            {
                id: 'meta-test-3',
                name: 'List Three',
                description: 'Third test list',
                entries: 100,
                updated: 'Yesterday'
            }
        ];

        await blocks.loadToggles();

        const container = document.getElementById('toggles-container');
        expect(container.textContent).toContain('84,317 entries • Updated 4 days ago');
        expect(container.textContent).toContain('12,500 entries • Updated');
        expect(container.textContent).toContain('100 entries • Updated Yesterday');
        expect(container.textContent).not.toContain('undefined');
    });

    test('Blocks UI - Privacy Toggles Status and Category Binding', async () => {
        state.activeBlocksSubTab = 'privacy';
        state.lastBlocksData.privacy = {
            disguisedTrackers: true,
            allowAffiliate: false,
            natives: [{ id: 'apple' }]
        };

        await blocks.loadToggles();

        const disguisedInput = document.querySelector('input[data-id="disguisedTrackers"]');
        expect(disguisedInput).not.toBeNull();
        expect(disguisedInput.dataset.cat).toBe('privacy');
        expect(disguisedInput.checked).toBe(true);
        expect(disguisedInput.closest('.flex-between').textContent).toContain('Block Disguised Third-Party Trackers');
        expect(disguisedInput.closest('.flex-between').textContent).toContain('CNAME records');

        const affiliateInput = document.querySelector('input[data-id="allowAffiliate"]');
        expect(affiliateInput).not.toBeNull();
        expect(affiliateInput.dataset.cat).toBe('privacy');
        expect(affiliateInput.checked).toBe(false);

        const appleInput = document.querySelector('input[data-id="apple"]');
        expect(appleInput).not.toBeNull();
        expect(appleInput.dataset.cat).toBe('privacy/natives');
        expect(appleInput.checked).toBe(true);
    });

    test('Blocks UI - Privacy Toggles re-fetches when privacy section is missing in cache', async () => {
        state.activeBlocksSubTab = 'privacy';
        state.lastBlocksData = { security: {} }; // Missing privacy!
        global.browser.runtime.sendMessage.mockResolvedValueOnce({
            success: true,
            data: {
                privacy: { disguisedTrackers: true, allowAffiliate: true, natives: [] }
            }
        });

        await blocks.loadToggles();

        const disguisedInput = document.querySelector('input[data-id="disguisedTrackers"]');
        expect(disguisedInput).not.toBeNull();
        expect(disguisedInput.checked).toBe(true);
        expect(state.lastBlocksData.privacy.disguisedTrackers).toBe(true);
    });

    test('Blocks UI - Parental Services Unified Toggle and Category Binding', async () => {
        state.activeBlocksSubTab = 'parental';
        state.blocksMeta.parental_services = [
            { id: 'tiktok', name: 'TikTok' },
            { id: 'facebook', name: 'Facebook' }
        ];
        state.lastBlocksData.parentalcontrol = {
            safeSearch: true,
            categories: [{ id: 'dating' }],
            services: [{ id: 'tiktok' }]
        };

        await blocks.loadToggles();

        // TikTok is active (filter enabled) -> switch should be checked
        const tiktokInput = document.querySelector('input[data-id="tiktok"]');
        expect(tiktokInput).not.toBeNull();
        expect(tiktokInput.dataset.cat).toBe('parentalcontrol/services');
        expect(tiktokInput.dataset.type).toBe('list');
        expect(tiktokInput.checked).toBe(true);

        // Facebook is inactive (filter disabled) -> switch should be unchecked
        const facebookInput = document.querySelector('input[data-id="facebook"]');
        expect(facebookInput).not.toBeNull();
        expect(facebookInput.dataset.cat).toBe('parentalcontrol/services');
        expect(facebookInput.dataset.type).toBe('list');
        expect(facebookInput.checked).toBe(false);

        // Ensure no legacy button showing 'OFF' or 'ON' text exists for services
        const legacyBtn = document.querySelector('.api-toggle-btn[data-cat="parentalcontrol/services"]');
        expect(legacyBtn).toBeNull();
    });

    test('Blocks UI - TLDs Unified Switch Toggle and Status Binding', async () => {
        state.activeBlocksSubTab = 'tlds';
        state.blocksMeta.tlds = ['com', 'app'];
        state.lastBlocksData.security = {
            tlds: [{ id: 'com' }]
        };

        await blocks.loadToggles();

        const comInput = document.querySelector('input[data-id="com"]');
        expect(comInput).not.toBeNull();
        expect(comInput.dataset.cat).toBe('security/tlds');
        expect(comInput.dataset.type).toBe('list');
        expect(comInput.checked).toBe(true);

        const appInput = document.querySelector('input[data-id="app"]');
        expect(appInput).not.toBeNull();
        expect(appInput.dataset.cat).toBe('security/tlds');
        expect(appInput.dataset.type).toBe('list');
        expect(appInput.checked).toBe(false);

        // Ensure no legacy button showing 'OFF' or 'ON' text exists for TLDs
        const legacyBtn = document.querySelector('.api-toggle-btn[data-cat="security/tlds"]');
        expect(legacyBtn).toBeNull();
    });

    test('Blocks UI - updateLocalBlocksCache synchronizes sub-resource lists and booleans', async () => {
        const { updateLocalBlocksCache } = await import('../src/ui/main.js');

        state.lastBlocksData = {
            parentalcontrol: { services: [] },
            security: { threatIntelligenceFeeds: false, tlds: [{ id: 'zip' }] },
            privacy: { disguisedTrackers: false, natives: [] }
        };

        // Add service to list
        updateLocalBlocksCache('parentalcontrol/services', 'tiktok', 'add');
        expect(state.lastBlocksData.parentalcontrol.services).toEqual([{ id: 'tiktok' }]);

        // Delete service from list
        updateLocalBlocksCache('parentalcontrol/services', 'tiktok', 'delete');
        expect(state.lastBlocksData.parentalcontrol.services).toEqual([]);

        // Delete TLD from list
        updateLocalBlocksCache('security/tlds', 'zip', 'delete');
        expect(state.lastBlocksData.security.tlds).toEqual([]);

        // Boolean toggle update
        updateLocalBlocksCache('privacy', 'disguisedTrackers', 'add');
        expect(state.lastBlocksData.privacy.disguisedTrackers).toBe(true);
        updateLocalBlocksCache('privacy', 'disguisedTrackers', 'delete');
        expect(state.lastBlocksData.privacy.disguisedTrackers).toBe(false);

        // Performance sub-category update
        updateLocalBlocksCache('settings/performance', 'ecs', 'add');
        expect(state.lastBlocksData.settings.performance.ecs).toBe(true);
        expect(state.lastBlocksData.settings.ecs).toBe(true);
        updateLocalBlocksCache('settings/performance', 'ecs', 'delete');
        expect(state.lastBlocksData.settings.performance.ecs).toBe(false);
        expect(state.lastBlocksData.settings.ecs).toBe(false);

        // Settings toggle (Bypass Age Verification) update
        updateLocalBlocksCache('settings', 'bav', 'add');
        expect(state.lastBlocksData.settings.bav).toBe(true);
        updateLocalBlocksCache('settings', 'bav', 'delete');
        expect(state.lastBlocksData.settings.bav).toBe(false);
    });

    test('Blocks UI - Expert Performance Toggles Status and Category Binding', async () => {
        state.activeBlocksSubTab = 'performance';
        state.lastBlocksData.settings = {
            web3: true,
            bav: true,
            performance: {
                ecs: true,
                cnameFlattening: false,
                cacheBoost: true
            }
        };

        await blocks.loadToggles();

        const ecsInput = document.querySelector('input[data-id="ecs"]');
        expect(ecsInput).not.toBeNull();
        expect(ecsInput.dataset.cat).toBe('settings/performance');
        expect(ecsInput.dataset.type).toBe('boolean');
        expect(ecsInput.checked).toBe(true);

        const cnameInput = document.querySelector('input[data-id="cnameFlattening"]');
        expect(cnameInput).not.toBeNull();
        expect(cnameInput.dataset.cat).toBe('settings/performance');
        expect(cnameInput.dataset.type).toBe('boolean');
        expect(cnameInput.checked).toBe(false);

        const cacheBoostInput = document.querySelector('input[data-id="cacheBoost"]');
        expect(cacheBoostInput).not.toBeNull();
        expect(cacheBoostInput.dataset.cat).toBe('settings/performance');
        expect(cacheBoostInput.dataset.type).toBe('boolean');
        expect(cacheBoostInput.checked).toBe(true);

        const bavInput = document.querySelector('input[data-id="bav"]');
        expect(bavInput).not.toBeNull();
        expect(bavInput.dataset.cat).toBe('settings');
        expect(bavInput.dataset.type).toBe('boolean');
        expect(bavInput.checked).toBe(true);

        const web3Input = document.querySelector('input[data-id="web3"]');
        expect(web3Input).not.toBeNull();
        expect(web3Input.dataset.cat).toBe('settings');
        expect(web3Input.dataset.type).toBe('boolean');
        expect(web3Input.checked).toBe(true);
    });

    test('Blocks UI - Lists submenu displays custom allowlist/denylist', async () => {
        state.activeBlocksSubTab = 'lists';
        state.listsSynced = true;
        state.currentDenylist = new Set(['badsite.com', 'tracker.org']);
        state.currentAllowlist = new Set(['goodsite.com']);

        await blocks.loadToggles();

        const listsContainer = document.getElementById('toggles-lists-container');
        expect(listsContainer).not.toBeNull();
        expect(listsContainer.classList.contains('hidden')).toBe(false);

        const togglesContainer = document.getElementById('toggles-container');
        expect(togglesContainer.classList.contains('hidden')).toBe(true);

        const listItems = document.getElementById('list-items-container');
        expect(listItems.textContent).toContain('badsite.com');
        expect(listItems.textContent).toContain('tracker.org');
    });

    test('Blocks UI - List Remove button click handles success, failure, and exceptions', async () => {
        state.activeTab = 'lists';
        state.currentDenylist = new Set(['adsite.com', 'track.net', 'malware.ru']);
        blocks.renderLists();

        const container = document.getElementById('list-items-container');
        const deleteBtns = container.querySelectorAll('.list-delete-btn');
        expect(deleteBtns.length).toBe(3);

        // 1. Success delete
        global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });
        await deleteBtns[0].onclick();
        expect(state.currentDenylist.has('adsite.com')).toBe(false);

        // 2. API Failure delete
        global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'Permission denied' });
        await deleteBtns[1].onclick();
        expect(deleteBtns[1].textContent).toBe('Remove');
        expect(deleteBtns[1].disabled).toBe(false);

        // 3. Exception in delete
        global.browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Network disconnected'));
        await deleteBtns[2].onclick();
        expect(deleteBtns[2].textContent).toBe('Remove');
        expect(deleteBtns[2].disabled).toBe(false);
    });

    test('Blocks UI - Blocklists sorting by name, updated, popularity, and entries', async () => {
        state.activeBlocksSubTab = 'blocklists';
        state.blocksMeta.blocklists = [
            { id: 'b1', name: 'Zeta List', description: 'Desc', entries: 500, updated_ts: 100, popularity: 1 },
            { id: 'b2', name: 'Alpha List', description: 'Desc', entries: 2000, updated_ts: 500, popularity: 10 },
            { id: 'b3', name: 'Beta List', description: 'Desc', entries: 100, updated_ts: 300, popularity: 5 }
        ];

        // Sort by name
        state.activeBlocksSort = 'name';
        await blocks.loadToggles();
        let btns = Array.from(document.querySelectorAll('.api-toggle-btn')).map(b => b.dataset.id);
        expect(btns[0]).toBe('b2'); // Alpha
        expect(btns[1]).toBe('b3'); // Beta
        expect(btns[2]).toBe('b1'); // Zeta

        // Sort by updated
        state.activeBlocksSort = 'updated';
        await blocks.loadToggles();
        btns = Array.from(document.querySelectorAll('.api-toggle-btn')).map(b => b.dataset.id);
        expect(btns[0]).toBe('b2'); // ts: 500

        // Sort by popularity
        state.activeBlocksSort = 'popularity';
        await blocks.loadToggles();
        btns = Array.from(document.querySelectorAll('.api-toggle-btn')).map(b => b.dataset.id);
        expect(btns[0]).toBe('b2'); // pop: 10

        // Sort by entries
        state.activeBlocksSort = 'entries';
        await blocks.loadToggles();
        btns = Array.from(document.querySelectorAll('.api-toggle-btn')).map(b => b.dataset.id);
        expect(btns[0]).toBe('b2'); // 2000 entries
    });

    test('Blocks UI - Parental control categories and services rendering', async () => {
        state.activeBlocksSubTab = 'parental';
        state.lastBlocksData.parentalcontrol = {
            safeSearch: true,
            categories: [{ id: 'dating' }],
            services: [{ id: 'facebook' }]
        };
        state.blocksMeta.categories = [
            { id: 'dating', name: 'Dating' },
            { id: 'gambling', name: 'Gambling' }
        ];
        state.blocksMeta.parental_services = [
            { id: 'facebook', name: 'Facebook' },
            { id: 'tiktok', name: 'TikTok' }
        ];

        await blocks.loadToggles();
        const container = document.getElementById('toggles-container');
        expect(container.textContent).toContain('Global Settings');
        expect(container.textContent).toContain('Categories');
        expect(container.textContent).toContain('Services');
        expect(container.textContent).toContain('Dating');
        expect(container.textContent).toContain('Facebook');

        // Search with non-matching query shows empty services state
        await blocks.loadToggles('nonexistent_service_query');
        expect(container.textContent).toContain('No services found.');
    });

    test('Blocks UI - TLD grid search query filtering', async () => {
        state.activeBlocksSubTab = 'tlds';
        state.blocksMeta.tlds = ['com', 'org', 'net', 'io', 'dev'];
        await blocks.loadToggles('io');
        const container = document.getElementById('toggles-container');
        expect(container.textContent).toContain('.io');
        expect(container.textContent).not.toContain('.com');

        // Query matching no TLDs: triggers empty fallback in renderTldsGrid (line 384)
        await blocks.loadToggles('zzzznonexistent');
        expect(container.textContent).toContain('No TLDs match search.');
    });

    test('Blocks UI - syncLists handles force re-sync and message rejection', async () => {
        state.listsSynced = false;
        state.activeTab = 'lists';
        global.browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Sync failed'));
        await expect(blocks.syncLists(true)).resolves.not.toThrow();
    });

    test('Blocks UI - renderLists shows empty state when custom list search yields zero matches', () => {
        state.currentDenylist = new Set(['malware.test', 'tracker.test']);
        const container = document.getElementById('list-items-container');
        blocks.renderLists('xyznonexistent');
        expect(container.textContent).toContain('No domains match your search.');
    });

    test('Blocks UI - renderBlocklistsGrid with active blocklists and sorting', async () => {
        state.activeBlocksSubTab = 'blocklists';
        state.lastBlocksData = {
            privacy: {
                blocklists: [{ id: 'oisd' }, { id: 'adguard' }]
            }
        };
        state.blocksMeta = {
            blocklists: [
                { id: 'oisd', name: 'OISD', description: 'OISD blocklist', entries: 100000, updated_ts: 1700000000, popularity: 99 },
                { id: 'adguard', name: 'AdGuard DNS Filter', description: 'AdGuard list', entries: 50000, updated_ts: 1690000000, popularity: 95 }
            ]
        };

        await blocks.loadToggles();
        const container = document.getElementById('toggles-container');
        expect(container.textContent).toContain('OISD');
        expect(container.textContent).toContain('AdGuard DNS Filter');
        const removeBtns = container.querySelectorAll('.btn-deny');
        expect(removeBtns.length).toBe(2);
    });

    test('Blocks UI - renderLists branch hardening (missing container, allowlist delete, fallback error strings)', async () => {
        // 1. Missing container branch: line 41
        const container = document.getElementById('list-items-container');
        container.remove();
        expect(() => blocks.renderLists()).not.toThrow();

        // Restore container for subsequent tests
        const restored = document.createElement('div');
        restored.id = 'list-items-container';
        document.body.appendChild(restored);

        // 2. Missing list-type-select fallback (line 43)
        const typeSelect = document.getElementById('list-type-select');
        typeSelect.remove();
        state.currentDenylist = new Set(['denied.org']);
        blocks.renderLists();
        expect(restored.textContent).toContain('denied.org');

        // Restore select with 'allowlist'
        const restoredSelect = document.createElement('select');
        restoredSelect.id = 'list-type-select';
        const opt = document.createElement('option');
        opt.value = 'allowlist';
        restoredSelect.appendChild(opt);
        document.body.appendChild(restoredSelect);

        // 3. Allowlist delete branch (lines 46 & 84)
        state.currentAllowlist = new Set(['allowed.org', 'allowed2.org', 'allowed3.org']);
        blocks.renderLists();
        expect(restored.textContent).toContain('allowed.org');

        const deleteBtns = restored.querySelectorAll('.list-delete-btn');
        expect(deleteBtns.length).toBe(3);

        // 3a. Success delete allowlist
        global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });
        await deleteBtns[0].onclick();
        expect(state.currentAllowlist.has('allowed.org')).toBe(false);

        // 3b. API error fallback string branch (line 91: res?.error || 'Unknown error')
        global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: false }); // res.error is undefined
        await deleteBtns[1].onclick();
        expect(deleteBtns[1].textContent).toBe('Remove');

        // 3c. Catch error fallback string branch (line 96: err?.message || 'Unknown error')
        global.browser.runtime.sendMessage.mockRejectedValueOnce({}); // err.message is undefined
        await deleteBtns[2].onclick();
        expect(deleteBtns[2].textContent).toBe('Remove');
    });

    test('Blocks UI - renderBlocklistsGrid branch hardening (entries text variants, updated string, updated_ts branches)', async () => {
        state.activeBlocksSubTab = 'blocklists';
        state.blocksMeta.blocklists = [
            {
                id: 'b-str-no-entries',
                name: 'String No Entries',
                description: 'Tests string without "entries" word',
                entries: '50,000', // line 278: string without 'entries'
                updated: 'Updated yesterday' // line 281: string starting with 'Updated'
            },
            {
                id: 'b-str-with-entries',
                name: 'String With Entries',
                description: 'Tests string with "entries" word',
                entries: '75,000 entries', // line 278: string with 'entries'
                updated: '3 days ago' // line 281: string not starting with 'Updated'
            },
            {
                id: 'b-ms-ts',
                name: 'Millisecond Timestamp',
                description: 'Tests ts > 1e11',
                updated_ts: 1700000000000 // line 283: ts > 1e11
            },
            {
                id: 'b-sec-ts',
                name: 'Second Timestamp',
                description: 'Tests ts <= 1e11',
                updated_ts: 1700000000 // line 283: ts <= 1e11
            },
            {
                id: 'b-invalid-ts',
                name: 'Invalid Timestamp',
                description: 'Tests NaN date',
                updated_ts: 'not-a-timestamp' // line 282 truthy, line 285 isNaN true -> ''
            },
            {
                id: 'b-null-entries',
                name: 'Null Entries',
                description: 'Tests null entries and no updated',
                entries: null
            }
        ];

        await blocks.loadToggles();
        const container = document.getElementById('toggles-container');
        expect(container.textContent).toContain('String No Entries');
        expect(container.textContent).toContain('50,000 entries');
        expect(container.textContent).toContain('75,000 entries');
        expect(container.textContent).toContain('Updated yesterday');
        expect(container.textContent).toContain('Updated 3 days ago');
        expect(container.textContent).toContain('Millisecond Timestamp');
        expect(container.textContent).toContain('Second Timestamp');
        expect(container.textContent).toContain('Invalid Timestamp');
    });

    test('Blocks UI - renderPrivacyToggles branch hardening (activeProfile null url)', async () => {
        state.activeBlocksSubTab = 'privacy';
        state.activeProfile = 'temp';
        state.lastBlocksData = { privacy: { natives: [] } };
        await blocks.loadToggles();
        expect(document.getElementById('toggles-container').innerHTML).toContain('https://my.nextdns.io/temp/privacy');

        // Test line 247: activeProfile is null when renderPrivacyToggles runs
        // We set activeBlocksSubTab = 'privacy', blocksMeta = null so loadMetadata is invoked,
        // and we clear activeProfile during loadMetadata!
        state.blocksMeta = null;
        global.browser.storage.local.get.mockImplementationOnce(async () => {
            state.activeProfile = null; // side-effect: activeProfile cleared before renderPrivacyToggles()
            return {
                scrapedMeta: {
                    blocklists: [{ id: 'b1', name: 'Meta List', description: 'Desc' }],
                    tlds: ['com']
                }
            };
        });
        state.activeProfile = 'temp_trigger';
        await blocks.loadToggles();
        expect(document.getElementById('toggles-container').innerHTML).toContain('href="#"');
        state.activeProfile = 'temp';
    });

    test('Blocks UI - loadToggles branch hardening (loadMetadata fallback)', async () => {
        // Reset blocksMeta to empty blocklists array to trigger loadMetadata() (line 138-139)
        state.activeProfile = 'p1';
        state.activeBlocksSubTab = 'blocklists';
        state.blocksMeta = { blocklists: [] };
        
        // Mock storage so loadMetadata succeeds from local storage cache
        global.browser.storage.local.get.mockResolvedValueOnce({
            scrapedMeta: {
                blocklists: [{ id: 'b1', name: 'Meta List', description: 'Desc' }],
                tlds: ['com']
            }
        });
        global.browser.runtime.sendMessage.mockResolvedValueOnce({
            success: true,
            data: { privacy: { blocklists: [] } }
        });

        await blocks.loadToggles();
        expect(state.blocksMeta.blocklists.length).toBeGreaterThan(0);
    });

    test('Blocks UI - loadToggles branch hardening (missing section cache initializes empty object)', async () => {
        state.activeProfile = 'p1';
        state.activeBlocksSubTab = 'blocklists';
        state.lastBlocksData = null;

        // Force sendMessage to fail without data when lastBlocksData is null -> sets {}
        global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: false });
        await blocks.loadToggles(null, true);
        expect(state.lastBlocksData).toEqual({});

        // Force sendMessage to return success: false when lastBlocksData already exists -> skips line 151
        state.lastBlocksData = { privacy: {} };
        global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: false });
        await blocks.loadToggles(null, true);
        expect(state.lastBlocksData).toEqual({ privacy: {} });

        // Missing toggles-lists-container branch (line 134 false branch)
        const listsCont = document.getElementById("toggles-lists-container");
        listsCont.remove();
        await blocks.loadToggles(null, false);
    });

    test('Blocks UI - activeBlocksSort popularity and entries sorting', async () => {
        state.activeBlocksSubTab = 'blocklists';
        state.blocksMeta.blocklists = [
            { id: 'b-pop-1', name: 'Low Pop', description: 'Desc', popularity: 10, entries: 5000 },
            { id: 'b-pop-2', name: 'High Pop', description: 'Desc', popularity: 100, entries: 1000 }
        ];

        // 1. Sort by popularity (line 273)
        state.activeBlocksSort = 'popularity';
        await blocks.loadToggles();
        let btns = Array.from(document.querySelectorAll('.api-toggle-btn')).map(b => b.dataset.id);
        expect(btns[0]).toBe('b-pop-2');

        // 2. Sort by entries (line 274)
        state.activeBlocksSort = 'entries';
        await blocks.loadToggles();
        btns = Array.from(document.querySelectorAll('.api-toggle-btn')).map(b => b.dataset.id);
        expect(btns[0]).toBe('b-pop-1');

        // 3. Fallback when sort is neither name, updated, popularity, nor entries (line 274 false branch)
        state.activeBlocksSort = 'custom';
        await blocks.loadToggles();
        btns = Array.from(document.querySelectorAll('.api-toggle-btn')).map(b => b.dataset.id);
        expect(btns.length).toBe(2);
    });

    test('Blocks UI - parental controls with null/empty categories and parental services (lines 319, 326)', async () => {
        state.activeBlocksSubTab = 'parental';
        state.blocksMeta = {
            blocklists: [{ id: 'b1', name: 'B1' }],
            categories: null, // lines 319: (state.blocksMeta.categories || [])
            parental_services: null // line 326: (state.blocksMeta.parental_services || [])
        };
        state.lastBlocksData = {
            parentalcontrol: {
                categories: null,
                services: null
            }
        };

        await blocks.loadToggles();
        const container = document.getElementById('toggles-container');
        expect(container.textContent).toContain('No services found.');
    });

    test('Blocks UI - renderToggleRow fallback when label and name are missing (line 405)', async () => {
        state.activeBlocksSubTab = 'parental';
        state.blocksMeta = {
            blocklists: [{ id: 'b1', name: 'B1' }],
            categories: [{ id: 'id-only' }], // no label, no name
            parental_services: []
        };
        state.lastBlocksData = { parentalcontrol: {} };

        await blocks.loadToggles();
        const input = document.getElementById('toggle-id-only');
        expect(input).not.toBeNull();
        expect(input.getAttribute('aria-label')).toBe('Toggle id-only');
    });

    test('Blocks UI - syncLists branch hardening (activeTab toggles but subtab not lists)', async () => {
        state.activeTab = 'toggles';
        state.activeBlocksSubTab = 'privacy';
        state.listsSynced = false;
        global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: true, allowlist: ['allow-only.com'] });

        await blocks.syncLists();
        expect(state.listsSynced).toBe(true);
        expect(state.currentAllowlist.has('allow-only.com')).toBe(true);
        expect(state.currentDenylist.size).toBe(0);

        // Denylist only array
        state.listsSynced = false;
        global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: true, denylist: ['deny-only.com'] });
        await blocks.syncLists();
        expect(state.currentDenylist.has('deny-only.com')).toBe(true);
        expect(state.currentAllowlist.size).toBe(0);
    });

    test('Blocks UI - renderSecurityToggles full branch coverage', async () => {
        state.activeBlocksSubTab = 'security';
        state.lastBlocksData = {
            security: {
                threatIntelligenceFeeds: true,
                aiThreatDetection: false,
                googleSafeBrowsing: true,
                cryptojacking: true,
                dnsRebinding: false,
                idnHomographs: true,
                typosquatting: false,
                dga: true,
                nrd: false,
                ddns: true,
                parking: false,
                csam: true
            }
        };

        await blocks.loadToggles();
        const container = document.getElementById('toggles-container');
        expect(container.textContent).toContain('Threat Intelligence Feeds');
        expect(container.textContent).toContain('AI Threat Detection');
        expect(container.textContent).toContain('Google Safe Browsing');
        expect(container.textContent).toContain('Cryptojacking Protection');
        expect(container.textContent).toContain('DNS Rebinding Protection');
        expect(container.textContent).toContain('IDN Homograph Protection');
        expect(container.textContent).toContain('Typosquatting Protection');
        expect(container.textContent).toContain('Domain Generation Algorithms (DGAs) Protection');
        expect(container.textContent).toContain('Block Newly Registered Domains (NRDs)');
        expect(container.textContent).toContain('Block Dynamic DNS Hostnames');
        expect(container.textContent).toContain('Block Parked Domains');
        expect(container.textContent).toContain('Block Child Sexual Abuse Material');

        const threatFeed = document.querySelector('input[data-id="threatIntelligenceFeeds"]');
        expect(threatFeed.checked).toBe(true);
        const aiThreat = document.querySelector('input[data-id="aiThreatDetection"]');
        expect(aiThreat.checked).toBe(false);
    });

    test('Blocks UI - performance toggles category resolution fallbacks (settings/performance vs settings)', async () => {
        state.activeBlocksSubTab = 'performance';
        // Test fallback to state.lastBlocksData['settings/performance'] (line 209)
        state.lastBlocksData = {
            settings: {
                performance: null
            },
            'settings/performance': {
                ecs: true,
                cnameFlattening: false,
                cacheBoost: true
            }
        };

        await blocks.loadToggles();
        const ecs = document.querySelector('input[data-id="ecs"]');
        expect(ecs.checked).toBe(true);

        // Test fallback to state.lastBlocksData.settings?.[s.id] (line 209 fallback)
        state.lastBlocksData = {
            settings: {
                ecs: true,
                cnameFlattening: true,
                cacheBoost: false
            }
        };
        await blocks.loadToggles();
        const cname = document.querySelector('input[data-id="cnameFlattening"]');
        expect(cname.checked).toBe(true);
    });

    test('Blocks UI - TLDs grid empty split parts and toggle row with name vs label fallback', async () => {
        state.activeBlocksSubTab = 'tlds';
        // TLD with double dot (yields empty part in parts.forEach(p => if (p)...))
        state.blocksMeta.tlds = ['co..uk', 'com'];
        state.lastBlocksData = { security: { tlds: [] } };

        await blocks.loadToggles();
        const container = document.getElementById('toggles-container');
        expect(container.textContent).toContain('.co..uk');

        // Test renderToggleRow with item.name instead of item.label and without note
        state.activeBlocksSubTab = 'parental';
        state.blocksMeta.categories = [
            { id: 'cat-no-note', name: 'Category Without Note' } // name used, note undefined
        ];
        state.blocksMeta.parental_services = [];
        state.lastBlocksData = { parentalcontrol: { categories: [{ id: 'cat-no-note' }] } };

        await blocks.loadToggles();
        expect(container.textContent).toContain('Category Without Note');
    });

    test('Blocks UI - final branch hardening for 100% branch coverage in blocks.js', async () => {
        // Line 119: searchContainer is null
        const searchContainer = document.getElementById("blocks-search-container");
        searchContainer.remove();
        await blocks.loadToggles();

        // Recreate search container for subsequent tests
        const recreatedSearch = document.createElement("div");
        recreatedSearch.id = "blocks-search-container";
        document.body.appendChild(recreatedSearch);

        // Line 127: listsContainer is null when activeBlocksSubTab === 'lists'
        const listsCont = document.getElementById("toggles-lists-container");
        if (listsCont) listsCont.remove();
        state.activeBlocksSubTab = 'lists';
        await blocks.loadToggles();

        // Line 149: state.lastBlocksData is null when res.data is truthy
        state.activeBlocksSubTab = 'security';
        state.lastBlocksData = null;
        browser.runtime.sendMessage.mockResolvedValueOnce({ success: true, data: { security: { test: true } } });
        await blocks.loadToggles(null, true);
        expect(state.lastBlocksData).toEqual({ security: { test: true } });

        // Line 149: res.data is null/falsy when GET_ALL_SETTINGS succeeds, with state.lastBlocksData already an object
        state.activeBlocksSubTab = 'security';
        state.lastBlocksData = { privacy: { blocklists: [] } };
        browser.runtime.sendMessage.mockResolvedValueOnce({ success: true, data: null });
        await blocks.loadToggles(null, true);
        expect(state.lastBlocksData).toEqual({ privacy: { blocklists: [] } });

        // Line 109: state.activeProfile is falsy early return
        const savedProfile = state.activeProfile;
        state.activeProfile = null;
        await blocks.loadToggles();
        state.activeProfile = savedProfile;

        // Line 112: toggles-container element is missing early return
        const togglesContainer = document.getElementById("toggles-container");
        togglesContainer.remove();
        await blocks.loadToggles();
        // Recreate container
        const newTogglesContainer = document.createElement("div");
        newTogglesContainer.id = "toggles-container";
        document.body.appendChild(newTogglesContainer);

        // Lines 245-247: state.lastBlocksData?.privacy is null/undefined during renderPrivacyToggles
        state.activeBlocksSubTab = 'privacy';
        state.lastBlocksData = {};
        await blocks.loadToggles(null, false);
        expect(newTogglesContainer.textContent).toContain('Native Tracking Protection');

        // Line 285: updated_ts branch with updated_text and updated falsy, valid timestamp <= 1e11
        state.activeBlocksSubTab = 'blocklists';
        state.blocksMeta = {
            blocklists: [
                { id: 'b-sec-ts', name: 'Seconds Ts', description: 'Desc', updated_ts: 1600000000 },
                { id: 'b-invalid-date', name: 'Bad Date', description: 'Desc', updated_ts: NaN }
            ]
        };
        state.lastBlocksData = { privacy: { blocklists: [] } };
        await blocks.loadToggles("", false);
        expect(newTogglesContainer.textContent).toContain('Seconds Ts');
        expect(newTogglesContainer.textContent).toContain('Bad Date');
    });
});




