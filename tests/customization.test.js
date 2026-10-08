/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://my.nextdns.io/privacy"}
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('Website Customization Engine', () => {
    let storageListeners = [];
    let mockSync = { webGuiMaster: true, webGuiTlds: true, webGuiBlocklists: true, webGuiFilter: true, webGuiForcedTheme: 'default' };

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
            onChanged: {
                addListener: jest.fn(cb => {
                    if (!storageListeners.includes(cb)) storageListeners.push(cb);
                })
            }
        },
        runtime: {
            getURL: jest.fn(p => p),
            onMessage: { addListener: jest.fn() },
            sendMessage: jest.fn().mockResolvedValue({ success: true, data: [] })
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

    beforeEach(async () => {
        document.body.innerHTML = '<div class="container"></div>';
        document.documentElement.className = '';
        document.documentElement.removeAttribute('data-bs-theme');
        Object.assign(mockSync, { webGuiMaster: true, webGuiTlds: true, webGuiBlocklists: true, webGuiFilter: true, webGuiForcedTheme: 'default' });
        window.history.replaceState({}, '', '/privacy');

        // Load content script once
        await import('../src/content.js');
    });

    test('Blocklist injection and cleanup', async () => {
        window.history.replaceState({}, '', '/privacy');
        
        // Add target headers to DOM
        const h5 = document.createElement('h5');
        h5.textContent = 'Blocklists';
        document.body.appendChild(h5);

        // Wait for throttled evaluation
        await new Promise(r => setTimeout(r, 150));

        expect(document.querySelector('.nxm-collapsible-header')).not.toBeNull();
    });

    test('Header Filtered Logs Button Injection and Click', async () => {
        window.history.replaceState({}, '', '/settings');

        // Construct NextDNS header account dropdown structure
        const header = document.createElement('div');
        header.className = 'd-flex';
        const ddContainer = document.createElement('div');
        const dropdown = document.createElement('div');
        dropdown.className = 'dropdown';

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'dropdown-toggle btn btn-light';
        toggleBtn.innerHTML = '<span class="d-none d-lg-inline notranslate">user@example.com</span><svg class="svg-inline--fa fa-user" data-icon="user"></svg>';

        const menu = document.createElement('div');
        menu.className = 'dropdown-menu';
        menu.innerHTML = '<a class="dropdown-item" href="/account">Account</a>';

        dropdown.appendChild(toggleBtn);
        dropdown.appendChild(menu);
        ddContainer.appendChild(dropdown);
        header.appendChild(ddContainer);
        document.body.appendChild(header);

        // Allow evaluation
        await new Promise(r => setTimeout(r, 150));

        const headerBtn = document.getElementById('nxm-header-filtered-logs-btn');
        expect(headerBtn).not.toBeNull();
        expect(headerBtn.textContent).toBe('👁️‍🗨️');
        expect(headerBtn.title).toBe('Manage Filtered Logs');

        const dropdownItem = document.getElementById('nxm-dropdown-filtered-logs-item');
        expect(dropdownItem).not.toBeNull();
        expect(dropdownItem.textContent).toContain('Manage Filtered Logs');

        // Click the button to open Filtered Logs Modal
        headerBtn.click();
        await new Promise(r => setTimeout(r, 50));

        const modal = document.getElementById('nxm-filter-modal-backdrop');
        expect(modal).not.toBeNull();
        expect(document.querySelector('.nxm-modal-title').textContent).toContain('Manage Filtered Logs');

        // Close modal
        document.querySelector('.nxm-modal-close').click();
        expect(document.getElementById('nxm-filter-modal-backdrop')).toBeNull();
    });

    test('Forced Dark Mode enforces data-bs-theme and class on my.nextdns.io', async () => {
        window.history.replaceState({}, '', '/settings');

        mockSync.webGuiForcedTheme = 'dark';
        mockSync.webGuiMaster = true;

        // Trigger storage change listener
        storageListeners.forEach(cb => cb({ webGuiForcedTheme: { newValue: 'dark' } }, 'sync'));

        await new Promise(r => setTimeout(r, 150));

        expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
        expect(document.documentElement.classList.contains('nxm-forced-dark')).toBe(true);
        expect(document.documentElement.classList.contains('nxm-forced-light')).toBe(false);
    });

    test('Forced Light Mode enforces data-bs-theme and class on my.nextdns.io', async () => {
        mockSync.webGuiForcedTheme = 'light';
        mockSync.webGuiMaster = true;

        storageListeners.forEach(cb => cb({ webGuiForcedTheme: { newValue: 'light' } }, 'sync'));

        await new Promise(r => setTimeout(r, 150));

        expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
        expect(document.documentElement.classList.contains('nxm-forced-light')).toBe(true);
        expect(document.documentElement.classList.contains('nxm-forced-dark')).toBe(false);
    });

    test('Disabling webGuiMaster cleans up forced theme and header button', async () => {
        mockSync.webGuiMaster = false;

        storageListeners.forEach(cb => cb({ webGuiMaster: { newValue: false } }, 'sync'));

        await new Promise(r => setTimeout(r, 150));

        expect(document.getElementById('nxm-header-filtered-logs-btn')).toBeNull();
        expect(document.getElementById('nxm-dropdown-filtered-logs-item')).toBeNull();
        expect(document.documentElement.classList.contains('nxm-forced-dark')).toBe(false);
        expect(document.documentElement.classList.contains('nxm-forced-light')).toBe(false);
    });
});
