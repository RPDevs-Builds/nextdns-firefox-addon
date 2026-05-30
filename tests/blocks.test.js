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
});
