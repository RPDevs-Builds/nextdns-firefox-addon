/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, describe, test, expect } from '@jest/globals';
import {
    formatLogRow,
    handleLiveLog,
    matchesLogFilters,
    renderLogs,
    loadAnalytics,
    loadNativeLogs,
    initTabLogEvents,
    updateDashboardTabInfo,
    updateDynamicLinks,
    downloadLogsCSV,
    wipeLogs
} from '../src/ui/dashboard.js';
import { state } from '../src/ui/state.js';
import * as utils from '../src/ui/utils.js';

describe('Dashboard UI Module (src/ui/dashboard.js)', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="logs-container"></div>
            <input id="log-search" value="" />
            <select id="log-device-filter">
                <option value="">All Devices</option>
            </select>
            <select id="log-type-filter">
                <option value="">All Types</option>
            </select>
            <div id="status-filter-content">
                <input type="checkbox" id="filter-all" value="all" checked />
                <input type="checkbox" id="filter-standard" value="status:default" />
                <input type="checkbox" id="filter-allowed" value="status:allowed" />
                <input type="checkbox" id="filter-blocked" value="status:blocked" />
                <input type="checkbox" id="filter-allowlist" value="reason:allowlist" />
                <input type="checkbox" id="filter-denylist" value="reason:denylist" />
            </div>
            <div id="analytics-overview"></div>
            <div id="tab-log-header">Tab Requests:</div>
            <div id="tab-log"></div>
            <input id="domain-input" value="" />
            <span id="tab-blocked-count">0</span>
            <a id="web-gui-profile-link" href="#"></a>
            <a id="web-gui-logs-link" href="#"></a>
            <a id="web-gui-security-link" href="#"></a>
            <a id="web-gui-privacy-link" href="#"></a>
            <button id="wipe-logs-btn">Clear Logs</button>
        `;

        state.cachedLogs = [];
        state.activeTab = 'dashboard';
        state.activeProfile = 'test-profile-1';
        state.hostnameAliases = {};
        state.currentAllowlist = new Set();
        state.currentDenylist = new Set();

        global.browser = {
            runtime: {
                sendMessage: jest.fn()
            },
            tabs: {
                query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://www.example.com/test' }])
            }
        };

        jest.clearAllMocks();
    });

    describe('formatLogRow', () => {
        test('formats blocked log with reasons array and device model', () => {
            state.hostnameAliases = { 'dev-1': 'Work Laptop' };
            const log = {
                status: 'blocked',
                name: 'malware.bad',
                timestamp: '2026-10-11T12:00:00Z',
                device: { id: 'dev-1', model: 'MacBookPro' },
                reasons: [{ name: 'Security Threat' }]
            };

            const row = formatLogRow(log);
            expect(row.className).toBe('log-row');
            expect(row.innerHTML).toContain('BLOCKED');
            expect(row.innerHTML).toContain('Work Laptop (MacBookPro)');
            expect(row.innerHTML).toContain('Security Threat');
            expect(row.innerHTML).toContain('malware.bad');
            expect(row.style.color).toBe('var(--danger)');
        });

        test('formats allowlist log with reason id', () => {
            const log = {
                status: 'allowed',
                domain: 'trusted.org',
                clientIp: '192.168.1.50',
                reasons: [{ id: 'allowlist' }]
            };

            const row = formatLogRow(log);
            expect(row.innerHTML).toContain('ALLOWLIST');
            expect(row.innerHTML).toContain('192.168.1.50');
            expect(row.innerHTML).toContain('trusted.org');
            expect(row.style.color).toBe('var(--success)');
        });

        test('formats relayed log status', () => {
            const log = {
                status: 'relayed',
                name: 'relay.dns',
                device: { name: 'iPhone' }
            };

            const row = formatLogRow(log);
            expect(row.innerHTML).toContain('RELAYED');
            expect(row.innerHTML).toContain('iPhone');
            expect(row.style.color).toBe('var(--accent)');
        });

        test('formats standard log with fallback device and invalid timestamp', () => {
            const log = {
                status: 'default',
                name: 'neutral.com',
                timestamp: 'invalid-time'
            };

            const row = formatLogRow(log);
            expect(row.innerHTML).toContain('STANDARD');
            expect(row.innerHTML).toContain('🕒 ---');
            expect(row.innerHTML).toContain('Unknown Device');
            expect(row.style.color).toBe('var(--text-main)');
        });
    });

    describe('matchesLogFilters', () => {
        test('returns false for null/undefined log', () => {
            expect(matchesLogFilters(null)).toBe(false);
            expect(matchesLogFilters(undefined)).toBe(false);
        });

        test('matches everything when all is checked or filters empty', () => {
            const log = { status: 'blocked', name: 'ad.com' };
            expect(matchesLogFilters(log, ['all'])).toBe(true);
            expect(matchesLogFilters(log, [])).toBe(true);
        });

        test('handles status:default, status:allowed, status:blocked, reason:allowlist, reason:denylist', () => {
            const standardLog = { status: 'default', name: 'news.com' };
            const blockedLog = { status: 'blocked', name: 'ad.com' };
            const allowlistLog = { status: 'allowed', name: 'bank.com', reasons: [{ id: 'allowlist' }] };
            const denylistLog = { status: 'blocked', name: 'tracker.com', reason: 'denylist' };

            // Standard filter
            expect(matchesLogFilters(standardLog, ['status:default'])).toBe(true);
            expect(matchesLogFilters(blockedLog, ['status:default'])).toBe(false);

            // Blocked filter
            expect(matchesLogFilters(blockedLog, ['status:blocked'])).toBe(true);
            expect(matchesLogFilters(standardLog, ['status:blocked'])).toBe(false);

            // Allowed filter
            expect(matchesLogFilters(allowlistLog, ['status:allowed'])).toBe(true);

            // Denylist reason filter
            expect(matchesLogFilters(denylistLog, ['reason:denylist'])).toBe(true);
            expect(matchesLogFilters(standardLog, ['reason:denylist'])).toBe(false);

            // Allowlist reason filter
            expect(matchesLogFilters(allowlistLog, ['reason:allowlist'])).toBe(true);
            expect(matchesLogFilters(blockedLog, ['reason:allowlist'])).toBe(false);

            // Coverage for anonymous functions at line 129 and 134: reasons array with name property
            const logWithAllowReason = { status: 'default', name: 'safe.org', reasons: [{ name: 'Custom Allow' }] };
            expect(matchesLogFilters(logWithAllowReason, ['reason:allowlist'])).toBe(true);

            const logWithDenyReason = { status: 'blocked', name: 'bad.org', reasons: [{ name: 'Custom Deny Rule' }] };
            expect(matchesLogFilters(logWithDenyReason, ['reason:denylist'])).toBe(true);

            // All three top categories active matches everything
            expect(matchesLogFilters(standardLog, ['status:default', 'status:allowed', 'status:blocked'])).toBe(true);
        });
    });

    describe('handleLiveLog and renderLogs', () => {
        test('handleLiveLog updates cachedLogs and prepends to UI if logs tab active', () => {
            state.activeTab = 'logs';
            const log = { status: 'blocked', name: 'live.tracker.com', device: { id: 'phone' } };

            handleLiveLog(log);

            expect(state.cachedLogs.length).toBe(1);
            expect(state.cachedLogs[0].name).toBe('live.tracker.com');

            const container = document.getElementById('logs-container');
            expect(container.children.length).toBe(1);
            expect(container.innerHTML).toContain('live.tracker.com');
        });

        test('handleLiveLog caps cachedLogs at 200 items', () => {
            for (let i = 0; i < 205; i++) {
                handleLiveLog({ status: 'default', name: `log-${i}.com` });
            }
            expect(state.cachedLogs.length).toBe(200);
            expect(state.cachedLogs[0].name).toBe('log-204.com');
        });

        test('renderLogs displays empty state when no logs exist', () => {
            state.cachedLogs = [];
            renderLogs();
            const container = document.getElementById('logs-container');
            expect(container.innerHTML).toContain('No logs found.');
        });

        test('renderLogs filters logs by search query, device, and protocol', () => {
            state.cachedLogs = [
                { name: 'alpha.com', device: { id: 'd1' }, protocol: 'doh', status: 'default' },
                { name: 'beta.org', device: { id: 'd2' }, protocol: 'dot', status: 'blocked' },
                { name: 'gamma.net', device: { id: 'd1' }, protocol: 'doh', status: 'blocked' }
            ];

            // 1. Search query filter
            document.getElementById('log-search').value = 'alpha';
            renderLogs();
            let container = document.getElementById('logs-container');
            expect(container.innerHTML).toContain('alpha.com');
            expect(container.innerHTML).not.toContain('beta.org');

            // 2. Device filter
            document.getElementById('log-search').value = '';
            document.getElementById('log-device-filter').value = 'd2';
            renderLogs();
            expect(container.innerHTML).toContain('beta.org');
            expect(container.innerHTML).not.toContain('alpha.com');

            // 3. No match filter
            document.getElementById('log-search').value = 'nonexistent';
            document.getElementById('log-device-filter').value = '';
            renderLogs();
            expect(container.innerHTML).toContain('No logs match the current filter.');
        });
    });

    describe('loadAnalytics', () => {
        test('warns and returns when activeProfile is missing', async () => {
            state.activeProfile = null;
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await loadAnalytics();

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot load analytics: No active profile.'));
            warnSpy.mockRestore();
        });

        test('fetches and renders analytics summary and trend data', async () => {
            browser.runtime.sendMessage
                .mockResolvedValueOnce({
                    data: { queries: 1000, blockedQueries: 250, blockedPercent: 25.0 }
                })
                .mockResolvedValueOnce({
                    data: [
                        { queries: 10 }, { queries: 10 }, { queries: 10 }, { queries: 10 }, { queries: 10 },
                        { queries: 20 }, { queries: 20 }, { queries: 20 }, { queries: 20 }, { queries: 20 }
                    ]
                });

            await loadAnalytics();

            const overview = document.getElementById('analytics-overview');
            expect(overview.innerHTML).toContain('1,000');
            expect(overview.innerHTML).toContain('250');
            expect(overview.innerHTML).toContain('Block Rate: <strong>25%</strong>');
            expect(overview.innerHTML).toContain('traffic');
        });

        test('handles loadAnalytics errors gracefully', async () => {
            browser.runtime.sendMessage.mockRejectedValue(new Error('Network error'));
            const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await loadAnalytics();

            const overview = document.getElementById('analytics-overview');
            expect(overview.innerHTML).toContain('Error: Network error');
            errSpy.mockRestore();
        });
    });

    describe('loadNativeLogs', () => {
        test('warns when no profile is active', async () => {
            state.activeProfile = null;
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await loadNativeLogs();

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot load logs: No active profile.'));
            warnSpy.mockRestore();
        });

        test('fetches and stores native logs on success', async () => {
            const logsData = [
                { name: 'remote1.com', status: 'default' },
                { name: 'remote2.com', status: 'blocked' }
            ];
            browser.runtime.sendMessage.mockResolvedValue({ success: true, data: logsData });

            await loadNativeLogs();

            expect(state.cachedLogs).toEqual(logsData);
            const container = document.getElementById('logs-container');
            expect(container.innerHTML).toContain('remote1.com');
            expect(container.innerHTML).toContain('remote2.com');
        });

        test('renders error state on API failure', async () => {
            browser.runtime.sendMessage.mockResolvedValue({ success: false, error: 'Invalid API Key' });

            await loadNativeLogs();

            const container = document.getElementById('logs-container');
            expect(container.innerHTML).toContain('Failed to load logs: Invalid API Key');
        });
    });

    describe('Tab Requests and initTabLogEvents', () => {
        test('updateDashboardTabInfo populates domain input and tab requests', async () => {
            browser.runtime.sendMessage.mockResolvedValue({
                blockedCount: 3,
                requests: {
                    'tracker.com': { status: 'blocked', reason: 'Threat' },
                    'cdn.example.com': { status: 'allowed' }
                }
            });

            await updateDashboardTabInfo();

            const domainInput = document.getElementById('domain-input');
            expect(domainInput.value).toBe('example.com');

            const header = document.getElementById('tab-log-header');
            expect(header.textContent).toContain('Tab Requests: (2)');

            const container = document.getElementById('tab-log');
            expect(container.innerHTML).toContain('tracker.com');
            expect(container.innerHTML).toContain('cdn.example.com');
            expect(document.getElementById('tab-blocked-count').textContent).toBe('3');
        });

        test('tab action buttons trigger allow and deny domain updates', async () => {
            browser.runtime.sendMessage
                .mockResolvedValueOnce({
                    requests: { 'site.com': { status: 'default' } }
                })
                .mockResolvedValueOnce({ success: true }) // MANAGE_DOMAIN
                .mockResolvedValueOnce({ requests: { 'site.com': { status: 'allowed' } } }); // Refresh stats

            await updateDashboardTabInfo();

            const container = document.getElementById('tab-log');
            const allowBtn = container.querySelector('.tab-btn-add-allow');
            expect(allowBtn).not.toBeNull();

            await allowBtn.click();

            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'MANAGE_DOMAIN',
                    profileId: 'test-profile-1',
                    listType: 'allowlist',
                    domain: 'site.com',
                    action: 'add'
                })
            );
            expect(state.currentAllowlist.has('site.com')).toBe(true);
        });

        test('clicking domain name sets domain input value', async () => {
            browser.runtime.sendMessage.mockResolvedValue({
                requests: { 'clicked-domain.com': { status: 'default' } }
            });

            await updateDashboardTabInfo();

            const domainEl = document.querySelector('.tab-domain-name');
            domainEl.click();

            expect(document.getElementById('domain-input').value).toBe('clicked-domain.com');
        });
    });

    describe('Dynamic Links, CSV Export, and Wipe Logs', () => {
        test('updateDynamicLinks updates anchor href attributes', () => {
            updateDynamicLinks();

            expect(document.getElementById('web-gui-profile-link').href).toContain('/test-profile-1');
            expect(document.getElementById('web-gui-logs-link').href).toContain('/test-profile-1/logs');
            expect(document.getElementById('web-gui-security-link').href).toContain('/test-profile-1/security');
            expect(document.getElementById('web-gui-privacy-link').href).toContain('/test-profile-1/privacy');
        });

        test('downloadLogsCSV warns when no logs to export', () => {
            state.cachedLogs = [];
            const toastSpy = jest.spyOn(utils, 'showToast');

            downloadLogsCSV();

            expect(toastSpy).toHaveBeenCalledWith('No logs to export.', 'warning');
        });

        test('downloadLogsCSV exports logs as formatted CSV', () => {
            state.cachedLogs = [
                {
                    timestamp: '2026-10-11T10:00:00Z',
                    device: { id: 'd1', name: 'Laptop' },
                    name: 'test.com',
                    status: 'blocked',
                    reasons: [{ name: 'Ad' }]
                }
            ];
            const downloadSpy = jest.spyOn(utils, 'downloadAsFile').mockImplementation(() => {});

            downloadLogsCSV();

            expect(downloadSpy).toHaveBeenCalledWith(
                expect.stringContaining('dns_forge_logs_'),
                expect.stringContaining('"Timestamp","Device","Domain","Status","Reason"'),
                'text/csv'
            );
            downloadSpy.mockRestore();
        });

        test('wipeLogs clears remote and local logs when confirmed', async () => {
            state.cachedLogs = [{ name: 'log1.com' }];
            global.confirm = jest.fn().mockReturnValue(true);
            browser.runtime.sendMessage.mockResolvedValue({ success: true });
            const toastSpy = jest.spyOn(utils, 'showToast');

            await wipeLogs();

            expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'CLEAR_LOGS',
                profileId: 'test-profile-1'
            });
            expect(state.cachedLogs.length).toBe(0);
            expect(toastSpy).toHaveBeenCalledWith('Logs cleared successfully.', 'success');
        });

        test('wipeLogs aborts when user cancels confirmation or when profile is missing', async () => {
            global.confirm = jest.fn().mockReturnValue(false);
            await wipeLogs();
            expect(browser.runtime.sendMessage).not.toHaveBeenCalled();

            // When activeProfile is falsy
            state.activeProfile = null;
            global.confirm.mockReturnValue(true);
            await wipeLogs();
            expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
        });

        test('tab log actions: add to denylist, failure handling, and domain click input fill', async () => {
            initTabLogEvents();
            const container = document.getElementById('tab-log');
            container.innerHTML = `
                <div class="tab-request-row">
                    <span class="tab-domain-name" data-domain="ad-tracker.com">ad-tracker.com</span>
                    <button class="tab-action-btn tab-btn-add-deny" data-domain="ad-tracker.com" data-list="denylist" data-action="add">+ Deny</button>
                    <button class="tab-action-btn tab-btn-add-allow" data-domain="failing.com" data-list="allowlist" data-action="add">+ Allow</button>
                    <button class="tab-action-btn tab-btn-remove-deny" data-domain="error.com" data-list="denylist" data-action="delete">✕ Deny</button>
                </div>
            `;

            // 1. Click domain name to populate domain input
            const domainEl = container.querySelector('.tab-domain-name');
            domainEl.click();
            const domainInput = document.getElementById('domain-input');
            expect(domainInput.value).toBe('ad-tracker.com');

            // 2. Click deny button (success)
            browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });
            const denyBtn = container.querySelector('.tab-btn-add-deny');
            await denyBtn.click();
            expect(state.currentDenylist.has('ad-tracker.com')).toBe(true);

            // 3. Click allow button (API failure)
            browser.runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'Denied by server' });
            const failBtn = container.querySelector('.tab-btn-add-allow');
            await failBtn.click();
            expect(failBtn.textContent).toBe('Err');

            // 4. Click button (Throws exception)
            browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Fatal comms error'));
            const errorBtn = container.querySelector('.tab-btn-remove-deny');
            await errorBtn.click();
            expect(errorBtn.textContent).toBe('Err');
        });

        test('updateDashboardTabInfo handles URL parse warnings and top-level errors', async () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            // Invalid tab URL
            browser.tabs.query.mockResolvedValueOnce([{ id: 2, url: 'http://[invalid-url' }]);
            browser.runtime.sendMessage.mockResolvedValueOnce({ requests: {}, blockedCount: 0 });
            await updateDashboardTabInfo();
            expect(warnSpy).toHaveBeenCalledWith('[Dashboard] Failed to parse tab URL:', expect.anything());

            // Query throws error
            browser.tabs.query.mockRejectedValueOnce(new Error('Tab query error'));
            await updateDashboardTabInfo();
            expect(errorSpy).toHaveBeenCalledWith('[Dashboard] updateDashboardTabInfo failed:', expect.anything());

            warnSpy.mockRestore();
            errorSpy.mockRestore();
        });

        test('handleLiveLog clears placeholder when container displays "No logs"', () => {
            state.activeTab = 'logs';
            const container = document.getElementById('logs-container');
            container.innerHTML = '<div>No logs recorded yet.</div>';
            handleLiveLog({
                timestamp: Date.now(),
                name: 'live.example.com',
                status: 'allowed',
                protocol: 'DoH'
            });
            expect(container.innerHTML).not.toContain('No logs recorded yet.');
            expect(container.innerHTML).toContain('live.example.com');
        });

        test('loadAnalytics calculates rawBlockedPercent when summary data blockedPercent is NaN', async () => {
            browser.runtime.sendMessage.mockImplementation(async (msg) => {
                if (msg.type === 'GET_ANALYTICS') {
                    if (msg.series) return { data: [] };
                    return {
                        data: {
                            queries: 100,
                            blockedQueries: 25,
                            blockedPercent: NaN
                        }
                    };
                }
                return { success: true };
            });

            await loadAnalytics();
            const container = document.getElementById('analytics-overview');
            expect(container.textContent).toContain('25%');
        });

        test('loadNativeLogs catches exception when sendMessage rejects', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Connection dropped'));
            await loadNativeLogs();
            expect(errorSpy).toHaveBeenCalledWith(
                '[Dashboard] sendMessage failed in loadNativeLogs:',
                expect.any(Error)
            );
            errorSpy.mockRestore();
        });

        test('dashboard.js - Exhaustive Statement & Branch Coverage Deep Dive', async () => {
            // 1. handleLiveLog with null log (line 76)
            handleLiveLog(null);

            // 2. handleLiveLog with container child count > 100 pruning (line 104)
            state.activeTab = 'logs';
            const container = document.getElementById('logs-container');
            container.innerHTML = '';
            for (let i = 0; i < 105; i++) {
                const el = document.createElement('div');
                el.textContent = `Log ${i}`;
                container.appendChild(el);
            }
            handleLiveLog({
                timestamp: Date.now(),
                name: 'live-prune.com',
                status: 'default',
                protocol: 'udp'
            });
            expect(container.children.length).toBeLessThanOrEqual(105);

            // 3. renderLogs with non-array override (line 169) and null entries in logs (line 182)
            renderLogs("not-an-array");
            expect(container.textContent).toContain('No logs found');

            renderLogs([null, { name: 'valid.com', status: 'default' }]);

            // 4. renderLogs with protocolFilter mismatch (line 189)
            const protoSelect = document.getElementById('log-type-filter');
            if (protoSelect) {
                const opt = document.createElement('option');
                opt.value = 'doh';
                opt.textContent = 'DoH';
                protoSelect.appendChild(opt);
                protoSelect.value = 'doh';
                renderLogs([{ name: 'test.com', protocol: 'udp', status: 'default' }]);
                expect(container.textContent).toContain('No logs match');
                protoSelect.value = '';
            }

            // 5. Tab action button click with missing data attributes (line 365)
            const tabLogContainer = document.getElementById('tab-log');
            initTabLogEvents();
            const badBtn = document.createElement('button');
            badBtn.className = 'tab-action-btn';
            tabLogContainer.appendChild(badBtn);
            badBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            badBtn.remove();

            // 6. updateDashboardTabInfo when isTabActionPending is true (line 432)
            const actionBtn = document.createElement('button');
            actionBtn.className = 'tab-action-btn';
            actionBtn.setAttribute('data-domain', 'pause.com');
            actionBtn.setAttribute('data-list', 'allowlist');
            actionBtn.setAttribute('data-action', 'add');
            tabLogContainer.appendChild(actionBtn);

            let resolveMsg;
            global.browser.runtime.sendMessage = jest.fn(() => new Promise(r => { resolveMsg = r; }));
            actionBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            // While action is pending, call updateDashboardTabInfo (hits line 432)
            await updateDashboardTabInfo();

            resolveMsg({ success: true });
            await new Promise(r => setTimeout(r, 20));
            actionBtn.remove();

            // 7. Tab action button with rejected syncLists callback (line 396)
            const origTab = state.activeTab;
            const origDenylist = state.currentDenylist;
            const origAllowlist = state.currentAllowlist;
            state.activeTab = 'lists';
            state.currentDenylist = null;
            state.currentAllowlist = null;

            const listContainer = document.createElement('div');
            listContainer.id = 'list-items-container';
            document.body.appendChild(listContainer);

            const listSelect = document.createElement('select');
            listSelect.id = 'list-type-select';
            const opt = document.createElement('option');
            opt.value = 'denylist';
            listSelect.appendChild(opt);
            document.body.appendChild(listSelect);

            const syncFailBtn = document.createElement('button');
            syncFailBtn.className = 'tab-action-btn';
            syncFailBtn.setAttribute('data-domain', 'sync-fail.com');
            syncFailBtn.setAttribute('data-list', 'denylist');
            syncFailBtn.setAttribute('data-action', 'delete');
            tabLogContainer.appendChild(syncFailBtn);

            global.browser.runtime.sendMessage = jest.fn((msg) => {
                if (msg.type === "MANAGE_DOMAIN" && msg.action === "delete") {
                    return Promise.resolve({ success: true });
                }
                if (msg.type === "MANAGE_DOMAIN" && msg.action === "list") {
                    // return success with null data so state.currentDenylist remains null
                    return Promise.resolve({ success: true, data: null });
                }
                if (msg.type === "GET_TAB_STATS") {
                    return Promise.resolve({ requests: {} });
                }
                return Promise.resolve({ success: true });
            });

            syncFailBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(r => setTimeout(r, 100));

            syncFailBtn.remove();
            listContainer.remove();
            listSelect.remove();
            state.activeTab = origTab;
            state.currentDenylist = origDenylist;
            state.currentAllowlist = origAllowlist;
        });
    });
});

