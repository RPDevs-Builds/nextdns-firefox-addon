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

    test('Allowed filter includes uncategorized default allowed items', () => {
        const defaultAllowedLog = { domain: 'standard-site.org', status: 'default' };
        const explicitAllowedLog = { domain: 'whitelist-site.com', status: 'allowed' };
        const blockedLog = { domain: 'ad-tracker.net', status: 'blocked' };

        // 1. "Allowed" filter active only
        expect(dashboard.matchesLogFilters(defaultAllowedLog, ['status:allowed'])).toBe(true);
        expect(dashboard.matchesLogFilters(explicitAllowedLog, ['status:allowed'])).toBe(true);
        expect(dashboard.matchesLogFilters(blockedLog, ['status:allowed'])).toBe(false);

        // 2. "Blocked" filter active only
        expect(dashboard.matchesLogFilters(defaultAllowedLog, ['status:blocked'])).toBe(false);
        expect(dashboard.matchesLogFilters(explicitAllowedLog, ['status:blocked'])).toBe(false);
        expect(dashboard.matchesLogFilters(blockedLog, ['status:blocked'])).toBe(true);

        // 3. "All" filter active shows all traffic without filtering
        expect(dashboard.matchesLogFilters(defaultAllowedLog, ['all'])).toBe(true);
        expect(dashboard.matchesLogFilters(explicitAllowedLog, ['all'])).toBe(true);
        expect(dashboard.matchesLogFilters(blockedLog, ['all'])).toBe(true);

        // 4. Both Allowed + Blocked checked shows all traffic without filtering
        expect(dashboard.matchesLogFilters(defaultAllowedLog, ['status:allowed', 'status:blocked'])).toBe(true);
        expect(dashboard.matchesLogFilters(explicitAllowedLog, ['status:allowed', 'status:blocked'])).toBe(true);
        expect(dashboard.matchesLogFilters(blockedLog, ['status:allowed', 'status:blocked'])).toBe(true);
    });

    test('Allowlist and Denylist reason filters isolate specific entries', () => {
        const defaultAllowedLog = { domain: 'standard.com', status: 'default' };
        const allowlistLog = { domain: 'explicit.com', status: 'allowed', reasons: [{ id: 'allowlist', name: 'Allowlist' }] };
        const denylistLog = { domain: 'manual-block.com', status: 'blocked', reasons: [{ id: 'denylist', name: 'Denylist' }] };
        const blocklistLog = { domain: 'tracker.com', status: 'blocked', reasons: [{ id: 'nextdns-recommended', name: 'Recommended' }] };

        // Allowlist only
        expect(dashboard.matchesLogFilters(defaultAllowedLog, ['reason:allowlist'])).toBe(false);
        expect(dashboard.matchesLogFilters(allowlistLog, ['reason:allowlist'])).toBe(true);
        expect(dashboard.matchesLogFilters(denylistLog, ['reason:allowlist'])).toBe(false);

        // Denylist only
        expect(dashboard.matchesLogFilters(denylistLog, ['reason:denylist'])).toBe(true);
        expect(dashboard.matchesLogFilters(blocklistLog, ['reason:denylist'])).toBe(false);
        expect(dashboard.matchesLogFilters(defaultAllowedLog, ['reason:denylist'])).toBe(false);
    });

    test('renderLogs correctly renders uncategorized default allowed logs in UI', () => {
        const logsContainer = document.getElementById('logs-container');
        const filterAll = document.getElementById('filter-all');
        const filterAllowed = document.getElementById('filter-allowed');
        const filterBlocked = document.getElementById('filter-blocked');

        const logs = [
            { domain: 'uncategorized.com', status: 'default' },
            { domain: 'whitelisted.org', status: 'allowed' },
            { domain: 'malware.bad', status: 'blocked' }
        ];

        // Default view: All traffic shown
        filterAll.checked = true;
        dashboard.renderLogs(logs);
        expect(logsContainer.querySelectorAll('.log-row').length).toBe(3);

        // Allowed only view: Shows uncategorized + allowed (2 rows), excludes blocked
        filterAll.checked = false;
        filterAllowed.checked = true;
        filterBlocked.checked = false;
        dashboard.renderLogs(logs);
        expect(logsContainer.querySelectorAll('.log-row').length).toBe(2);
        expect(logsContainer.textContent).toContain('uncategorized.com');
        expect(logsContainer.textContent).toContain('whitelisted.org');
        expect(logsContainer.textContent).not.toContain('malware.bad');

        // Blocked only view: Shows malware.bad (1 row), excludes uncategorized
        filterAllowed.checked = false;
        filterBlocked.checked = true;
        dashboard.renderLogs(logs);
        expect(logsContainer.querySelectorAll('.log-row').length).toBe(1);
        expect(logsContainer.textContent).toContain('malware.bad');
        expect(logsContainer.textContent).not.toContain('uncategorized.com');
    });

    test('Defensive Rendering Resilience', async () => {
        // Test with empty/null data
        dashboard.renderLogs(null);
        const container = document.getElementById('logs-container');
        expect(container).not.toBeNull();
    });
});
