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

        await blocks.loadToggles('zxcvbnm');
        expect(container.textContent).not.toContain('NextDNS Ads & Trackers Blocklist');
        expect(container.textContent).toContain('No blocklists found.');
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

        const affiliateInput = document.querySelector('input[data-id="allowAffiliate"]');
        expect(affiliateInput).not.toBeNull();
        expect(affiliateInput.dataset.cat).toBe('privacy');
        expect(affiliateInput.checked).toBe(false);

        const appleInput = document.querySelector('input[data-id="apple"]');
        expect(appleInput).not.toBeNull();
        expect(appleInput.dataset.cat).toBe('privacy/natives');
        expect(appleInput.checked).toBe(true);
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
});



