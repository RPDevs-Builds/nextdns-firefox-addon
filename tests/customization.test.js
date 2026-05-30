/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// No path resolve needed here

describe('Website Customization Engine', () => {
    let mockSync = {};
    let contentScript;

    beforeEach(async () => {
        document.body.innerHTML = '<div class="container"></div>';
        jest.resetModules();
        mockSync = { webGuiMaster: true, webGuiTlds: true, webGuiBlocklists: true };

        global.browser = {
            storage: {
                sync: {
                    get: jest.fn(keys => Promise.resolve(mockSync)),
                    set: jest.fn(obj => { Object.assign(mockSync, obj); return Promise.resolve(); })
                },
                local: {
                    get: jest.fn().mockResolvedValue({}),
                    set: jest.fn().mockResolvedValue({})
                },
                onChanged: { addListener: jest.fn() }
            },
            runtime: {
                getURL: jest.fn(p => p),
                onMessage: { addListener: jest.fn() }
            }
        };

        // Mock fetch for domSelectors.json
        global.fetch = jest.fn().mockImplementation((url) => {
            if (url.includes('domSelectors.json')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        dashboard: {
                            tldHeader: { selector: 'h5', textMatches: 'TLDs' },
                            blocklistHeader: { selector: 'h5', textMatches: 'Blocklists' }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        // Load content script
        await import('../src/content.js');
    });

    test('Blocklist injection and cleanup', async () => {
        // Trigger evaluatePage by mocking correct URL
        delete window.location;
        window.location = new URL('https://my.nextdns.io/privacy');
        
        // Add target headers to DOM
        const h5 = document.createElement('h5');
        h5.textContent = 'Blocklists';
        document.body.appendChild(h5);

        // In a real environment, initConfig and evaluatePage run.
        // We need to wait for the throttled evaluation.
        await new Promise(r => setTimeout(r, 200));

        expect(document.querySelector('.nxm-collapsible-header')).not.toBeNull();
    });
});
