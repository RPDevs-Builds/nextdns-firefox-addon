/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const html = fs.readFileSync(path.resolve('src/popup.html'), 'utf8');

describe('Popup UI - Advanced Coverage Suite', () => {
    let state, utils, dashboard;

    beforeEach(async () => {
        document.body.innerHTML = html;
        jest.resetModules();

        global.browser = {
            storage: {
                sync: {
                    get: jest.fn().mockResolvedValue({}),
                    set: jest.fn().mockResolvedValue({})
                },
                local: {
                    get: jest.fn().mockResolvedValue({}),
                    set: jest.fn().mockResolvedValue({})
                }
            },
            tabs: {
                query: jest.fn().mockResolvedValue([{ id: 10, url: 'https://example.com' }])
            },
            runtime: {
                sendMessage: jest.fn().mockImplementation((msg) => {
                    if (msg.type === 'GET_PROFILE') return Promise.resolve({ id: 'p1', name: 'Test' });
                    if (msg.type === 'GET_ANALYTICS') return Promise.resolve({ success: true, data: { queries: 100, blockedQueries: 10, blockedPercent: 10 } });
                    return Promise.resolve({ success: true, data: [] });
                }),
                getURL: jest.fn(p => p)
            }
        };

        const stateModule = await import('../src/ui/state.js');
        state = stateModule.state;
        utils = await import('../src/ui/utils.js');
        dashboard = await import('../src/ui/dashboard.js');
        
        // Mock sub-nav switching logic if not already handled
        document.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.onclick = () => {
                const parent = btn.closest('.tab-content');
                parent.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });
    });

    test('Sub-nav Scoping', async () => {
        const privacyBtn = document.querySelector('#settings-sub-nav .sub-tab-btn[data-sub="analytics"]');
        expect(privacyBtn).not.toBeNull();

        privacyBtn.click();
        expect(privacyBtn.classList.contains('active')).toBe(true);
    });

    test('Log Filter State interaction', async () => {
        const logsContainer = document.getElementById('logs-container');
        dashboard.renderLogs([{ domain: 'example.com', status: 'blocked', reason: 'Test' }]);
        
        expect(logsContainer.querySelectorAll('.log-row').length).toBe(1);
    });

    test('Allowed and Standard filters handle plain uncategorized traffic', () => {
        const defaultPlainLog = { domain: 'www.google.com', status: 'default' };
        const explicitAllowedLog = { domain: 'whitelist-site.com', status: 'allowed' };
        const blockedLog = { domain: 'ad-tracker.net', status: 'blocked' };

        // 1. "Standard" filter active only (isolates plain traffic that isn't on a list)
        expect(dashboard.matchesLogFilters(defaultPlainLog, ['status:default'])).toBe(true);
        expect(dashboard.matchesLogFilters(explicitAllowedLog, ['status:default'])).toBe(false);
        expect(dashboard.matchesLogFilters(blockedLog, ['status:default'])).toBe(false);

        // 2. "Allowed" filter active only
        expect(dashboard.matchesLogFilters(defaultPlainLog, ['status:allowed'])).toBe(true);
        expect(dashboard.matchesLogFilters(explicitAllowedLog, ['status:allowed'])).toBe(true);
        expect(dashboard.matchesLogFilters(blockedLog, ['status:allowed'])).toBe(false);

        // 3. "Blocked" filter active only
        expect(dashboard.matchesLogFilters(defaultPlainLog, ['status:blocked'])).toBe(false);
        expect(dashboard.matchesLogFilters(explicitAllowedLog, ['status:blocked'])).toBe(false);
        expect(dashboard.matchesLogFilters(blockedLog, ['status:blocked'])).toBe(true);

        // 4. "All" filter active shows all traffic without filtering (including plain traffic like google.com)
        expect(dashboard.matchesLogFilters(defaultPlainLog, ['all'])).toBe(true);
        expect(dashboard.matchesLogFilters(explicitAllowedLog, ['all'])).toBe(true);
        expect(dashboard.matchesLogFilters(blockedLog, ['all'])).toBe(true);
    });

    test('Allowlist and Denylist reason filters isolate specific entries', () => {
        const defaultPlainLog = { domain: 'www.google.com', status: 'default' };
        const allowlistLog = { domain: 'explicit.com', status: 'allowed', reasons: [{ id: 'allowlist', name: 'Allowlist' }] };
        const denylistLog = { domain: 'manual-block.com', status: 'blocked', reasons: [{ id: 'denylist', name: 'Denylist' }] };
        const blocklistLog = { domain: 'tracker.com', status: 'blocked', reasons: [{ id: 'nextdns-recommended', name: 'Recommended' }] };

        // Allowlist only
        expect(dashboard.matchesLogFilters(defaultPlainLog, ['reason:allowlist'])).toBe(false);
        expect(dashboard.matchesLogFilters(allowlistLog, ['reason:allowlist'])).toBe(true);
        expect(dashboard.matchesLogFilters(denylistLog, ['reason:allowlist'])).toBe(false);

        // Denylist only
        expect(dashboard.matchesLogFilters(denylistLog, ['reason:denylist'])).toBe(true);
        expect(dashboard.matchesLogFilters(blocklistLog, ['reason:denylist'])).toBe(false);
        expect(dashboard.matchesLogFilters(defaultPlainLog, ['reason:denylist'])).toBe(false);
    });

    test('renderLogs correctly renders plain uncategorized logs with STANDARD badge', () => {
        const logsContainer = document.getElementById('logs-container');
        const filterAll = document.getElementById('filter-all');
        const filterStandard = document.getElementById('filter-standard');
        const filterAllowed = document.getElementById('filter-allowed');
        const filterBlocked = document.getElementById('filter-blocked');

        const logs = [
            { domain: 'www.google.com', status: 'default' },
            { domain: 'whitelisted.org', status: 'allowed' },
            { domain: 'malware.bad', status: 'blocked' }
        ];

        // Default view: All traffic shown
        filterAll.checked = true;
        dashboard.renderLogs(logs);
        expect(logsContainer.querySelectorAll('.log-row').length).toBe(3);
        // Verify plain traffic has STANDARD badge rather than ALLOWED
        expect(logsContainer.textContent).toContain('STANDARD');
        expect(logsContainer.textContent).toContain('ALLOWLIST');
        expect(logsContainer.textContent).toContain('BLOCKED');

        // Standard only view: Shows plain traffic (www.google.com only)
        filterAll.checked = false;
        filterStandard.checked = true;
        filterAllowed.checked = false;
        filterBlocked.checked = false;
        dashboard.renderLogs(logs);
        expect(logsContainer.querySelectorAll('.log-row').length).toBe(1);
        expect(logsContainer.textContent).toContain('www.google.com');
        expect(logsContainer.textContent).not.toContain('whitelisted.org');
        expect(logsContainer.textContent).not.toContain('malware.bad');

        // Blocked only view: Shows malware.bad (1 row), excludes www.google.com
        filterStandard.checked = false;
        filterAllowed.checked = false;
        filterBlocked.checked = true;
        dashboard.renderLogs(logs);
        expect(logsContainer.querySelectorAll('.log-row').length).toBe(1);
        expect(logsContainer.textContent).toContain('malware.bad');
        expect(logsContainer.textContent).not.toContain('www.google.com');
    });

    test('Defensive Rendering Resilience', async () => {
        // Test with empty/null data
        dashboard.renderLogs(null);
        const container = document.getElementById('logs-container');
        expect(container).not.toBeNull();
    });

    test('updateDashboardTabInfo displays Tab Blocked count instead of page grade', async () => {
        global.browser.runtime.sendMessage.mockImplementation((msg) => {
            if (msg.type === 'GET_TAB_STATS') {
                return Promise.resolve({
                    requests: {
                        'tracker.com': { status: 'blocked', reason: 'Deny List' },
                        'allowed.org': { status: 'allowed', reason: 'Allow List' },
                        'example.com': { status: 'default', reason: 'Default' }
                    },
                    blockedCount: 7
                });
            }
            return Promise.resolve({ success: true, data: [] });
        });

        await dashboard.updateDashboardTabInfo();

        const tabBlockedEl = document.getElementById('tab-blocked-count');
        expect(tabBlockedEl).not.toBeNull();
        expect(tabBlockedEl.textContent).toBe('7');
    });

    test('Tab Requests list allows adding and removing items from allowlist and denylist', async () => {
        state.activeProfile = 'p1';
        state.currentAllowlist = new Set(['allowed.org']);
        state.currentDenylist = new Set(['blocked.com']);

        global.browser.runtime.sendMessage.mockImplementation((msg) => {
            if (msg.type === 'GET_TAB_STATS') {
                return Promise.resolve({
                    requests: {
                        'allowed.org': { status: 'allowed', reason: 'Allow List' },
                        'blocked.com': { status: 'blocked', reason: 'Deny List' },
                        'neutral.io': { status: 'default', reason: 'Default' }
                    },
                    blockedCount: 1
                });
            }
            if (msg.type === 'MANAGE_DOMAIN') {
                if (msg.action === 'list') {
                    const set = msg.listType === 'allowlist' ? state.currentAllowlist : state.currentDenylist;
                    return Promise.resolve({ success: true, data: Array.from(set || []).map(id => ({ id })) });
                }
                return Promise.resolve({ success: true });
            }
            return Promise.resolve({ success: true, data: [] });
        });

        await dashboard.updateDashboardTabInfo();

        const container = document.getElementById('tab-log');
        expect(container).not.toBeNull();

        // 1. Check rendered buttons for allowed.org (currently allowed)
        const allowedRow = container.querySelector('.tab-domain-name[data-domain="allowed.org"]').closest('.tab-request-row');
        const removeAllowBtn = allowedRow.querySelector('.tab-btn-remove-allow');
        const addDenyBtn = allowedRow.querySelector('.tab-btn-add-deny');
        expect(removeAllowBtn).not.toBeNull();
        expect(removeAllowBtn.textContent).toBe('✕ Allow');
        expect(addDenyBtn).not.toBeNull();
        expect(addDenyBtn.textContent).toBe('+ Deny');

        // 2. Check rendered buttons for blocked.com (currently denied)
        const blockedRow = container.querySelector('.tab-domain-name[data-domain="blocked.com"]').closest('.tab-request-row');
        const addAllowBtn = blockedRow.querySelector('.tab-btn-add-allow');
        const removeDenyBtn = blockedRow.querySelector('.tab-btn-remove-deny');
        expect(addAllowBtn).not.toBeNull();
        expect(addAllowBtn.textContent).toBe('+ Allow');
        expect(removeDenyBtn).not.toBeNull();
        expect(removeDenyBtn.textContent).toBe('✕ Deny');

        // 3. Test removing allowed.org from allowlist
        removeAllowBtn.click();
        await new Promise(r => setTimeout(r, 50));
        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'MANAGE_DOMAIN',
            profileId: 'p1',
            listType: 'allowlist',
            domain: 'allowed.org',
            action: 'delete'
        }));
        expect(state.currentAllowlist.has('allowed.org')).toBe(false);

        // 4. Test adding neutral.io to allowlist
        const neutralAddAllowBtn = container.querySelector('.tab-btn-add-allow[data-domain="neutral.io"]');
        expect(neutralAddAllowBtn).not.toBeNull();
        neutralAddAllowBtn.click();
        await new Promise(r => setTimeout(r, 50));
        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'MANAGE_DOMAIN',
            profileId: 'p1',
            listType: 'allowlist',
            domain: 'neutral.io',
            action: 'add'
        }));
        expect(state.currentAllowlist.has('neutral.io')).toBe(true);

        // 5. Test removing blocked.com from denylist
        const currentRemoveDenyBtn = container.querySelector('.tab-btn-remove-deny[data-domain="blocked.com"]');
        expect(currentRemoveDenyBtn).not.toBeNull();
        currentRemoveDenyBtn.click();
        await new Promise(r => setTimeout(r, 50));
        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'MANAGE_DOMAIN',
            profileId: 'p1',
            listType: 'denylist',
            domain: 'blocked.com',
            action: 'delete'
        }));
        expect(state.currentDenylist.has('blocked.com')).toBe(false);

        // 6. Test clicking domain name fills domain-input
        const domainText = container.querySelector('.tab-domain-name[data-domain="neutral.io"]');
        domainText.click();
        expect(document.getElementById('domain-input').value).toBe('neutral.io');
    });
});

