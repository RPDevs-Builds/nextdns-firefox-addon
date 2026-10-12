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
    });

    test('Blocks UI - syncLists handles force re-sync and message rejection', async () => {
        state.listsSynced = false;
        state.activeTab = 'lists';
        global.browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Sync failed'));
        await expect(blocks.syncLists(true)).resolves.not.toThrow();
    });
});



