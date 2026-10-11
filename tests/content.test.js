/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://my.nextdns.io/abc123/security"}
 */

import { jest, beforeEach, describe, test, expect } from '@jest/globals';

describe('Content Script (NextDNS Web Console Enhancements)', () => {
    let storageChangedListener;
    let messageListener;

    beforeEach(() => {
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
            return Promise.resolve({ ok: true, json: async () => ({}) });
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
});
