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
    wipeLogs,
    getLogDeviceIdentifier,
    updateDeviceFilterOptions,
    openBuiltinAllowlistModal,
    closeBuiltinAllowlistModal,
    handleBuiltinDomainAction,
    handleBuiltinHideAction,
    handleBatchLogsAction,
    initBuiltinLogsEvents
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

        test('dashboard.js - 100% Branch Coverage Final Push', async () => {
            const downloadSpy = jest.spyOn(utils, 'downloadAsFile').mockImplementation(() => {});

            // 1. formatLogRow branches
            // log.status === 'relayed' (line 34)
            const rowRelayed = formatLogRow({ status: 'relayed', name: 'relay.com' });
            expect(rowRelayed.textContent).toContain('RELAYED');

            // log.status === 'whitelisted' (line 22)
            const rowWhitelisted = formatLogRow({ status: 'whitelisted', name: 'white.com' });
            expect(rowWhitelisted.textContent).toContain('ALLOWLIST');

            // log.reasons contains item with name including 'allow' (line 23)
            const rowReasonAllowName = formatLogRow({
                status: 'unknown',
                name: 'reason-allow.com',
                reasons: [{ name: 'Allowed by admin' }]
            });
            expect(rowReasonAllowName.textContent).toContain('ALLOWLIST');

            // device resolution branches (lines 43-47)
            state.hostnameAliases = {
                '192.168.1.50': 'AliasFromIP',
                '10.0.0.1': 'AliasFromClientIP'
            };
            // alias from log.device.ip
            const rowAliasDevIp = formatLogRow({
                name: 'devip.com',
                device: { ip: '192.168.1.50' }
            });
            expect(rowAliasDevIp.textContent).toContain('AliasFromIP');

            // alias from log.clientIp
            const rowAliasClientIp = formatLogRow({
                name: 'clientip.com',
                clientIp: '10.0.0.1'
            });
            expect(rowAliasClientIp.textContent).toContain('AliasFromClientIP');

            // baseName from log.device.id
            const rowBaseDevId = formatLogRow({
                name: 'devid.com',
                device: { id: 'dev-123' }
            });
            expect(rowBaseDevId.textContent).toContain('dev-123');

            // baseName from log.clientIp (no device)
            const rowBaseClientIp = formatLogRow({
                name: 'clientip2.com',
                clientIp: '8.8.8.8'
            });
            expect(rowBaseClientIp.textContent).toContain('8.8.8.8');

            // baseName fallback to 'Unknown Device'
            const rowUnknownDev = formatLogRow({ name: 'nodev.com' });
            expect(rowUnknownDev.textContent).toContain('Unknown Device');

            // model already included in baseName (line 46)
            const rowModelIncluded = formatLogRow({
                name: 'model-inc.com',
                device: { name: 'Pixel 7 Pro', model: 'Pixel 7' }
            });
            expect(rowModelIncluded.textContent).not.toContain('(Pixel 7)');

            // timestamp missing (line 48)
            const rowNoTimestamp = formatLogRow({ name: 'notime.com', timestamp: null });
            expect(rowNoTimestamp.textContent).toContain('🕒 ---');

            // reasons array with various item structures (line 55): r.id only, r as string
            const rowReasonVariants = formatLogRow({
                name: 'reasons.com',
                status: 'blocked',
                reasons: [{ id: 'block-id' }, 'raw-reason-string']
            });
            expect(rowReasonVariants.textContent).toContain('block-id, raw-reason-string');

            // log.reason === 'Default' (line 56)
            const rowReasonDefault = formatLogRow({
                name: 'default-reason.com',
                status: 'blocked',
                reason: 'Default'
            });
            expect(rowReasonDefault.textContent).not.toContain('(Default)');

            // log.reason is not a string (line 56)
            const rowReasonNonString = formatLogRow({
                name: 'nonstring-reason.com',
                status: 'blocked',
                reason: 12345
            });
            expect(rowReasonNonString.textContent).not.toContain('(');

            // log.reason custom string (line 56 truthy)
            const rowReasonCustom = formatLogRow({
                name: 'custom-reason.com',
                status: 'blocked',
                reason: 'CustomSecurityRule'
            });
            expect(rowReasonCustom.textContent).toContain('(CustomSecurityRule)');

            // log.reason undefined (line 56)
            const rowReasonUndefined = formatLogRow({
                name: 'undef-reason.com',
                status: 'blocked',
                reason: undefined
            });
            expect(rowReasonUndefined.textContent).not.toContain('(');

            // log.name missing, falls back to log.domain (line 64)
            const rowDomainFallback = formatLogRow({ domain: 'domain-fallback.com' });
            expect(rowDomainFallback.textContent).toContain('domain-fallback.com');

            // 2. handleLiveLog branches
            // state.cachedLogs length > 200 (line 80)
            state.cachedLogs = new Array(201).fill({ name: 'seed.com' });
            handleLiveLog({ name: 'live-overflow.com' });
            expect(state.cachedLogs.length).toBe(201);

            // state.activeTab is not 'logs' (line 83 false branch)
            state.activeTab = 'settings';
            handleLiveLog({ name: 'not-logs-tab.com' });

            // state.activeTab is 'logs', container is missing (line 85 false branch)
            state.activeTab = 'logs';
            const logsContainer = document.getElementById('logs-container');
            logsContainer.remove();
            handleLiveLog({ name: 'no-container.com' });

            // Restore logsContainer
            const newLogsContainer = document.createElement('div');
            newLogsContainer.id = 'logs-container';
            document.body.appendChild(newLogsContainer);

            // handleLiveLog query matching via log.name, log.domain, and missing domain (line 98)
            document.getElementById('log-search').value = 'target';
            document.getElementById('filter-all').checked = true;

            // 1. log.name is present and matches query
            handleLiveLog({ name: 'target-name.com', protocol: 'udp', status: 'default' });
            expect(newLogsContainer.textContent).toContain('target-name.com');

            // 2. log.name is present but does NOT match query (line 98 false branch)
            handleLiveLog({ name: 'unrelated-name.com', protocol: 'udp', status: 'default' });
            expect(newLogsContainer.textContent).not.toContain('unrelated-name.com');

            // 3. log.name is missing, log.domain is present and matches query
            handleLiveLog({ domain: 'target-domain.com', protocol: 'udp', status: 'default' });
            expect(newLogsContainer.textContent).toContain('target-domain.com');

            // 4. log.name is missing, log.domain is present but does NOT match query
            handleLiveLog({ domain: 'unrelated-domain.com', protocol: 'udp', status: 'default' });
            expect(newLogsContainer.textContent).not.toContain('unrelated-domain.com');

            // 5. fails query when neither name nor domain is present
            handleLiveLog({ status: 'default' });

            // 6. log matches query, but matchesLogFilters returns false (line 101 false branch)
            document.getElementById('filter-all').checked = false;
            document.getElementById('filter-blocked').checked = true;
            handleLiveLog({ name: 'target-allowed.com', status: 'default' });
            document.getElementById('filter-all').checked = true;

            // reset query
            document.getElementById('log-search').value = '';

            // Device filter matching and mismatching (lines 98-100)
            const devFilterSelect = document.getElementById('log-device-filter');
            devFilterSelect.innerHTML = '<option value="">All</option><option value="my-device-id">Dev 1</option>';
            devFilterSelect.value = 'my-device-id';
            handleLiveLog({ name: 'dev-match.com', device: { id: 'my-device-id' }, status: 'default' });
            handleLiveLog({ name: 'dev-mismatch.com', device: { id: 'other-device-id' }, status: 'default' });
            handleLiveLog({ name: 'dev-clientip.com', clientIp: 'my-device-id', status: 'default' });
            devFilterSelect.value = '';

            // Protocol filter matching and mismatching (lines 98-100)
            const protoFilterSelect = document.getElementById('log-type-filter');
            protoFilterSelect.innerHTML = '<option value="">All</option><option value="doh">DOH</option>';
            protoFilterSelect.value = 'doh';
            handleLiveLog({ name: 'proto-match.com', protocol: 'doh', status: 'default' });
            handleLiveLog({ name: 'proto-mismatch.com', protocol: 'udp', status: 'default' });
            protoFilterSelect.value = '';

            // Optional chaining on input elements missing in DOM (lines 91-93)
            const searchInput = document.getElementById('log-search');
            searchInput.remove();
            devFilterSelect.remove();
            protoFilterSelect.remove();
            handleLiveLog({ name: 'no-inputs.com', status: 'default' });

            // Restore inputs
            document.body.appendChild(searchInput);
            document.body.appendChild(devFilterSelect);
            document.body.appendChild(protoFilterSelect);

            // 3. matchesLogFilters branches (lines 129-155)
            // isAllowlist via string reason containing 'allow' (line 130)
            const logReasonAllowStr = { status: 'default', reason: 'Allowlisted by policy' };
            expect(matchesLogFilters(logReasonAllowStr, ['status:allowed'])).toBe(true);

            // isDenylist via log.reasons array with r.name containing 'deny' (line 134)
            const logDenyReasonName = { status: 'blocked', reasons: [{ name: 'Deny rule active' }] };
            expect(matchesLogFilters(logDenyReasonName, ['reason:denylist'])).toBe(true);

            // isDenylist via log.reason string containing 'deny' (line 135)
            const logDenyReasonStr = { status: 'blocked', reason: 'Custom Denylist' };
            expect(matchesLogFilters(logDenyReasonStr, ['reason:denylist'])).toBe(true);

            // hasAllowed and (!hasStandard && isStandard) (line 151)
            const logStandardTraffic = { status: 'default' };
            expect(matchesLogFilters(logStandardTraffic, ['status:allowed'])).toBe(true);

            // hasStandard and hasAllowed and hasBlocked and !hasAllowlist and !hasDenylist (line 145)
            expect(matchesLogFilters(logStandardTraffic, ['status:default', 'status:allowed', 'status:blocked'])).toBe(true);

            // none match (line 156 returns false)
            expect(matchesLogFilters(logStandardTraffic, ['status:blocked'])).toBe(false);

            // 4. renderLogs branches
            // container missing (line 166)
            newLogsContainer.remove();
            renderLogs([]);
            document.body.appendChild(newLogsContainer);

            // logsOverride === null (uses state.cachedLogs) (line 168)
            state.cachedLogs = [{ name: 'cached-log.com', status: 'default' }];
            document.getElementById('filter-all').checked = true;
            renderLogs(null);
            expect(newLogsContainer.textContent).toContain('cached-log.com');

            // renderLogs matchesLogFilters filtering (line 190 true and false branches)
            document.getElementById('filter-all').checked = false;
            document.getElementById('filter-blocked').checked = true;
            document.getElementById('filter-allowed').checked = false;
            document.getElementById('filter-standard').checked = false;
            document.getElementById('filter-allowlist').checked = false;
            document.getElementById('filter-denylist').checked = false;
            renderLogs([
                { name: 'blocked.com', status: 'blocked' },
                { name: 'allowed.com', status: 'allowed' }
            ]);
            expect(newLogsContainer.textContent).toContain('blocked.com');
            expect(newLogsContainer.textContent).not.toContain('allowed.com');
            document.getElementById('filter-all').checked = true;

            // 5. updateDeviceFilterOptions branches (lines 217, 220, 222, 228-229)
            // dropdown missing in DOM (line 217)
            const devDropdown = document.getElementById('log-device-filter');
            devDropdown.remove();
            renderLogs([]);
            document.body.appendChild(devDropdown);

            // state.cachedLogs is not an array reaching updateDeviceFilterOptions (line 220 false branch)
            state.cachedLogs = null;
            devDropdown.innerHTML = '<option value="">All</option>';
            renderLogs([{ name: 'dummy.com', status: 'default' }]);

            // state.cachedLogs items have neither device.id nor clientIp (line 222 false branch)
            state.cachedLogs = [{}, { device: {} }];
            devDropdown.innerHTML = '<option value="">All</option>';
            renderLogs(state.cachedLogs);

            // device resolution in dropdown by clientIp and device.id (lines 228-229)
            state.hostnameAliases = {};
            state.cachedLogs = [
                { clientIp: '1.2.3.4', name: 'dev1.com' },
                { device: { id: 'dev-2', name: 'MyDevice' }, name: 'dev2.com' }
            ];
            devDropdown.innerHTML = '<option value="">All</option>';
            renderLogs(state.cachedLogs);
            expect(devDropdown.innerHTML).toContain('1.2.3.4');
            expect(devDropdown.innerHTML).toContain('MyDevice');

            // 6. loadAnalytics branches (lines 249, 260, 264, 269, 271-280, 305)
            state.activeProfile = 'p-analytics';
            // container missing during fetch (line 249)
            const analyticsContainer = document.getElementById('analytics-overview');
            analyticsContainer.remove();
            global.browser.runtime.sendMessage = jest.fn()
                .mockResolvedValueOnce({ data: { queries: 10, blockedQueries: 2, blockedPercent: 20 } })
                .mockResolvedValueOnce({ data: [] });
            await loadAnalytics();
            document.body.appendChild(analyticsContainer);

            // series with null/empty data (line 269: series?.data || [])
            global.browser.runtime.sendMessage = jest.fn()
                .mockResolvedValueOnce({ data: { queries: 10, blockedQueries: 1, blockedPercent: 10 } })
                .mockResolvedValueOnce({});
            await loadAnalytics();
            expect(analyticsContainer.textContent).toContain('Block Rate: 10%');

            // rawBlockedPercent is NaN and queries === 0 (line 265: falls back to 0)
            global.browser.runtime.sendMessage = jest.fn()
                .mockResolvedValueOnce({ data: { queries: 0, blockedQueries: 0, blockedPercent: NaN } })
                .mockResolvedValueOnce({ data: [] });
            await loadAnalytics();
            expect(analyticsContainer.textContent).toContain('Block Rate: 0%');

            // sData.length > 5 with diff <= 0 (decrease) (lines 271-280)
            const seriesDecrease = [
                { queries: 10 }, { queries: 10 }, { queries: 10 }, { queries: 10 }, { queries: 10 },
                { queries: 0 }, { queries: 0 }, { queries: 0 }, { queries: 0 }, { queries: 0 }
            ];
            global.browser.runtime.sendMessage = jest.fn()
                .mockResolvedValueOnce({ data: { queries: 50, blockedQueries: 5, blockedPercent: 10 } })
                .mockResolvedValueOnce({ data: seriesDecrease });
            await loadAnalytics();
            expect(analyticsContainer.textContent).toContain('decrease in traffic');

            // sData.length > 5 with previous === 0 (line 275: previous > 0 is false)
            const seriesZeroPrev = [
                { queries: 0 }, { queries: 0 }, { queries: 0 }, { queries: 0 }, { queries: 0 },
                { queries: 10 }, { queries: 10 }, { queries: 10 }, { queries: 10 }, { queries: 10 }
            ];
            global.browser.runtime.sendMessage = jest.fn()
                .mockResolvedValueOnce({ data: { queries: 50, blockedQueries: 5, blockedPercent: 10 } })
                .mockResolvedValueOnce({ data: seriesZeroPrev });
            await loadAnalytics();
            expect(analyticsContainer.textContent).toContain('0% increase in traffic');

            // summary.data is null and container exists (line 300)
            global.browser.runtime.sendMessage = jest.fn()
                .mockResolvedValueOnce({ data: null })
                .mockResolvedValueOnce({ data: null });
            await loadAnalytics();
            expect(analyticsContainer.textContent).toContain('No analytics data available');

            // loadAnalytics throws when container is missing in catch (line 306)
            analyticsContainer.remove();
            global.browser.runtime.sendMessage = jest.fn().mockRejectedValue(new Error('Fetch failed'));
            await loadAnalytics();
            document.body.appendChild(analyticsContainer);

            // 7. loadNativeLogs branches (lines 324, 332, 336-339)
            state.activeProfile = 'p-logs';
            // container exists and cachedLogs has items (line 324 false branch)
            state.cachedLogs = [{ name: 'existing.com' }];
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ success: true, data: [{ name: 'new.com' }] });
            await loadNativeLogs();

            // res.data is not an array (line 332 falls back to [])
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ success: true, data: "not-an-array" });
            await loadNativeLogs();
            expect(state.cachedLogs).toEqual([]);

            // res.success is false with cachedLogs.length > 0 (line 337 false branch)
            state.cachedLogs = [{ name: 'still-here.com' }];
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false, error: 'Rate limited' });
            await loadNativeLogs();

            // res.success is false without error string (line 336/338 fallback to "Unknown error" / "Check API Key")
            state.cachedLogs = [];
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false, error: null });
            await loadNativeLogs();
            expect(newLogsContainer.textContent).toContain('Check API Key');

            // 8. updateDashboardTabInfo branches (lines 434, 439, 443, 452, 454, 457, 461, 464, 470-495)
            // tab has no url (line 435)
            global.browser.tabs.query = jest.fn().mockResolvedValue([{}]);
            await updateDashboardTabInfo();

            // tab url does not start with http (line 439)
            global.browser.tabs.query = jest.fn().mockResolvedValue([{ id: 1, url: 'about:blank' }]);
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ requests: {} });
            await updateDashboardTabInfo();

            // domainInput already matches currentDomain (line 443 false branch)
            const domainInput = document.getElementById('domain-input');
            domainInput.value = 'example.com';
            global.browser.tabs.query = jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com/page' }]);
            await updateDashboardTabInfo();

            // domainInput has focus (line 443 false branch)
            domainInput.value = 'other.com';
            domainInput.matches = jest.fn((sel) => sel === ':focus');
            await updateDashboardTabInfo();
            domainInput.matches = () => false;

            // stats is null (line 452)
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue(null);
            await updateDashboardTabInfo();

            // stats.requests is null (line 454 falls back to {})
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ requests: null });
            await updateDashboardTabInfo();

            // tab requests container contains 'capturing' text (line 464 false branch)
            const tabLog = document.getElementById('tab-log');
            tabLog.textContent = 'currently capturing packets...';
            await updateDashboardTabInfo();

            // tab requests with isAllowed, isDenied, blocked with custom reason, blocked with default reason, unblocked with custom reason (lines 470-495)
            state.currentAllowlist = new Set(['allowed.com']);
            state.currentDenylist = new Set(['denied.com']);
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
                requests: {
                    'allowed.com': { status: 'default' },
                    'denied.com': { status: 'default' },
                    'blocked-sec.com': { status: 'blocked', reason: 'Security' },
                    'blocked-def.com': { status: 'blocked', reason: 'Default' },
                    'allowed-custom.com': { status: 'default', reason: 'CustomRule' },
                    'plain.com': { status: 'default', reason: 'Default' },
                    'null-request.com': null
                }
            });
            tabLog.textContent = '';
            await updateDashboardTabInfo();
            expect(tabLog.innerHTML).toContain('[Allowed]');
            expect(tabLog.innerHTML).toContain('[Denied]');
            expect(tabLog.innerHTML).toContain('[Security]');
            expect(tabLog.innerHTML).toContain('[Blocked]');
            expect(tabLog.innerHTML).toContain('[CustomRule]');

            // header and container missing (lines 457, 461 false branches)
            document.getElementById('tab-log-header').remove();
            tabLog.remove();
            await updateDashboardTabInfo();

            // Total blocked items count resolution (lines 513-516)
            // privacy-score fallback when tab-blocked-count is removed
            const tabBlockedCountEl = document.getElementById('tab-blocked-count');
            if (tabBlockedCountEl) tabBlockedCountEl.remove();
            const privacyScoreEl = document.createElement('span');
            privacyScoreEl.id = 'privacy-score';
            document.body.appendChild(privacyScoreEl);
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ requests: {}, blockedCount: 42 });
            await updateDashboardTabInfo();
            expect(privacyScoreEl.textContent).toBe('42');

            // neither element exists, and blockedCount is falsy (0)
            privacyScoreEl.remove();
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ requests: {}, blockedCount: 0 });
            await updateDashboardTabInfo();

            // Tab action: delete from allowlist (lines 390-394)
            const tabLogContainer = document.createElement('div');
            tabLogContainer.id = 'tab-log';
            document.body.appendChild(tabLogContainer);
            initTabLogEvents();
            // Call again when _hasTabLogListeners is already true (line 354)
            initTabLogEvents();

            // Click empty element (neither button nor domain name, line 415 false branch)
            const emptyEl = document.createElement('div');
            tabLogContainer.appendChild(emptyEl);
            emptyEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            // Click domain name without domainInput or without data-domain (line 418)
            const domainSpanNoInput = document.createElement('span');
            domainSpanNoInput.className = 'tab-domain-name';
            domainSpanNoInput.setAttribute('data-domain', 'no-input.com');
            tabLogContainer.appendChild(domainSpanNoInput);
            const origDomainInput = document.getElementById('domain-input');
            if (origDomainInput) origDomainInput.remove();
            domainSpanNoInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            if (origDomainInput) document.body.appendChild(origDomainInput);

            const domainSpanNoAttr = document.createElement('span');
            domainSpanNoAttr.className = 'tab-domain-name';
            tabLogContainer.appendChild(domainSpanNoAttr);
            domainSpanNoAttr.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            // Exhaustive Tab Action Matrix covering lines 381-395
            const testTabAction = async (action, listType, withSets) => {
                const btn = document.createElement('button');
                btn.className = 'tab-action-btn';
                btn.setAttribute('data-domain', `matrix-${action}-${listType}-${withSets}.com`);
                btn.setAttribute('data-list', listType);
                btn.setAttribute('data-action', action);
                tabLogContainer.appendChild(btn);

                if (withSets) {
                    state.currentAllowlist = new Set();
                    state.currentDenylist = new Set();
                } else {
                    state.currentAllowlist = null;
                    state.currentDenylist = null;
                }

                global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ success: true });
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                await new Promise(r => setTimeout(r, 10));
                btn.remove();
            };

            await testTabAction('add', 'allowlist', true);
            await testTabAction('add', 'allowlist', false);
            await testTabAction('add', 'denylist', true);
            await testTabAction('add', 'denylist', false);
            await testTabAction('delete', 'allowlist', true);
            await testTabAction('delete', 'allowlist', false);
            await testTabAction('delete', 'denylist', true);
            await testTabAction('delete', 'denylist', false);
            await testTabAction('unknown', 'allowlist', true);

            tabLogContainer.remove();
            // Call initTabLogEvents when container is missing in DOM (line 354)
            initTabLogEvents();

            // 9. updateDynamicLinks branches (lines 532-537)
            // state.activeProfile is null
            state.activeProfile = null;
            const profLink = document.getElementById('web-gui-profile-link');
            updateDynamicLinks();
            expect(profLink.href).toBe('https://my.nextdns.io/');

            // links missing in DOM
            profLink.remove();
            document.getElementById('web-gui-logs-link').remove();
            document.getElementById('web-gui-security-link').remove();
            document.getElementById('web-gui-privacy-link').remove();
            updateDynamicLinks();

            // 10. downloadLogsCSV branches (lines 548-555)
            state.hostnameAliases = { 'client-ip-only': 'ClientAlias' };
            state.cachedLogs = [
                // invalid timestamp (line 548)
                { timestamp: 'invalid-date-string', name: 'inv.com', status: 'blocked' },
                // alias via clientIp (line 549)
                { timestamp: 1000, clientIp: 'client-ip-only', domain: 'alias.com' },
                // reasons is array with name, id, and string (line 552)
                { timestamp: 2000, clientIp: '1.1.1.1', name: 'reason-arr.com', reasons: [{ name: 'Name1' }, { id: 'Id2' }, 'Str3'] },
                // reasons is null, reason string present (line 552)
                { timestamp: 3000, clientIp: '1.1.1.1', name: 'reason-str.com', reason: 'Blocked' },
                // reasons is null, reason is empty (line 552)
                { timestamp: 4000, clientIp: '1.1.1.1', name: 'reason-empty.com', reason: '' },
                // all empty/null fields
                {}
            ];
            downloadLogsCSV();

            // 11. wipeLogs branches (lines 564, 565, 567, 577, 580, 582)
            // state.activeProfile is null (line 564)
            state.activeProfile = null;
            await wipeLogs();

            // confirm is false (line 565)
            state.activeProfile = 'p-wipe';
            const origConfirm = global.confirm;
            global.confirm = jest.fn(() => false);
            await wipeLogs();

            // confirm is true, btn is missing in DOM (line 567 false branch)
            global.confirm = jest.fn(() => true);
            const wipeBtn = document.getElementById('wipe-logs-btn');
            wipeBtn.remove();
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ success: true });
            await wipeLogs();

            // res.success is false with no error property (line 577 fallback to "Unknown error")
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false, error: null });
            await wipeLogs();

            // runtime.sendMessage throws error without message (line 580 fallback to "Unknown error")
            global.browser.runtime.sendMessage = jest.fn().mockRejectedValue({});
            await wipeLogs();

            global.confirm = origConfirm;
            downloadSpy.mockRestore();
        });
    });

    describe('getLogDeviceIdentifier', () => {
        test('resolves device id, client ip, or device name in priority order', () => {
            expect(getLogDeviceIdentifier(null)).toBe('');
            expect(getLogDeviceIdentifier({})).toBe('');
            expect(getLogDeviceIdentifier({ device: { name: 'My Phone' } })).toBe('My Phone');
            expect(getLogDeviceIdentifier({ clientIp: '192.168.1.100', device: { name: 'My Phone' } })).toBe('192.168.1.100');
            expect(getLogDeviceIdentifier({ device: { id: 'dev-99', name: 'My Phone' }, clientIp: '192.168.1.100' })).toBe('dev-99');
        });
    });

    describe('Built-in Allowlist Modal & Actions', () => {
        test('openBuiltinAllowlistModal exits with toast when no active profile', () => {
            state.activeProfile = null;
            const toastSpy = jest.spyOn(utils, 'showToast').mockImplementation(() => {});
            openBuiltinAllowlistModal('test.com');
            expect(toastSpy).toHaveBeenCalledWith('No active profile detected.', 'warning');
            toastSpy.mockRestore();
        });

        test('openBuiltinAllowlistModal renders dialog, responds to typing, and closes on Escape/close button', () => {
            state.activeProfile = 'test-profile';
            openBuiltinAllowlistModal('sub.example.com');

            const backdrop = document.getElementById('builtin-allow-modal-backdrop');
            expect(backdrop).not.toBeNull();
            const input = document.getElementById('builtin-allow-domain-input');
            expect(input.value).toBe('sub.example.com');
            const hint = document.getElementById('builtin-allow-modal-hint');
            expect(hint.textContent).toContain('Root domain: example.com');

            // Input changes to root domain
            input.value = 'example.com';
            input.dispatchEvent(new Event('input'));
            expect(hint.textContent).toContain('automatically allows all of its subdomains');

            // Input changes to another subdomain
            input.value = 'news.bbc.co.uk';
            input.dispatchEvent(new Event('input'));
            expect(hint.textContent).toContain('Root domain: bbc.co.uk');

            // Escape key closes modal
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            expect(document.getElementById('builtin-allow-modal-backdrop')).toBeNull();

            // Re-open and click cancel
            openBuiltinAllowlistModal('sub.example.com');
            const cancelBtn = document.getElementById('builtin-allow-cancel-btn');
            cancelBtn.click();
            expect(document.getElementById('builtin-allow-modal-backdrop')).toBeNull();

            // Re-open and click closeBtn
            openBuiltinAllowlistModal('sub.example.com');
            const closeBtn = document.getElementById('builtin-allow-modal-close');
            closeBtn.click();
            expect(document.getElementById('builtin-allow-modal-backdrop')).toBeNull();

            // Re-open and click backdrop directly
            openBuiltinAllowlistModal('sub.example.com');
            const bd = document.getElementById('builtin-allow-modal-backdrop');
            bd.click();
            expect(document.getElementById('builtin-allow-modal-backdrop')).toBeNull();
        });

        test('submits domain via Add button with validation and handles errors', async () => {
            state.activeProfile = 'test-profile';
            const toastSpy = jest.spyOn(utils, 'showToast').mockImplementation(() => {});

            // Empty domain validation
            openBuiltinAllowlistModal('');
            const addBtn = document.getElementById('builtin-allow-add-btn');
            addBtn.click();
            expect(toastSpy).toHaveBeenCalledWith('Please enter a valid domain.', 'warning');

            // Invalid domain format
            const input = document.getElementById('builtin-allow-domain-input');
            input.value = '...';
            addBtn.click();
            expect(toastSpy).toHaveBeenCalledWith('Invalid domain format.', 'warning');

            // Successful submit
            input.value = 'valid-domain.com';
            global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });
            addBtn.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(state.currentAllowlist.has('valid-domain.com')).toBe(true);
            expect(toastSpy).toHaveBeenCalledWith('Added valid-domain.com to allowlist', 'success');
            expect(document.getElementById('builtin-allow-modal-backdrop')).toBeNull();

            // Root domain submit
            openBuiltinAllowlistModal('a.b.c.root-test.com');
            const addRootBtn = document.getElementById('builtin-allow-add-root-btn');
            global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });
            addRootBtn.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(state.currentAllowlist.has('root-test.com')).toBe(true);
            expect(toastSpy).toHaveBeenCalledWith('Added root domain root-test.com to allowlist', 'success');

            // API error response
            openBuiltinAllowlistModal('err-domain.com');
            global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'Custom API Error' });
            document.getElementById('builtin-allow-add-btn').click();
            await Promise.resolve();
            await Promise.resolve();
            expect(toastSpy).toHaveBeenCalledWith('Error: Custom API Error', 'error');

            // Network rejection error
            global.browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Network offline'));
            document.getElementById('builtin-allow-add-btn').click();
            await Promise.resolve();
            await Promise.resolve();
            expect(toastSpy).toHaveBeenCalledWith('Error: Network offline', 'error');

            // Enter key trigger when focused on input
            input.focus();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

            toastSpy.mockRestore();
        });

        test('handleBuiltinDomainAction handles add and delete for allowlist and denylist', async () => {
            state.activeProfile = 'p-action';
            const toastSpy = jest.spyOn(utils, 'showToast').mockImplementation(() => {});

            // Missing domain or profile returns early
            await handleBuiltinDomainAction('', 'denylist', 'add');
            state.activeProfile = null;
            await handleBuiltinDomainAction('test.com', 'denylist', 'add');
            state.activeProfile = 'p-action';

            // Add to denylist
            global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });
            await handleBuiltinDomainAction('bad.org', 'denylist', 'add');
            expect(state.currentDenylist.has('bad.org')).toBe(true);

            // Add to allowlist
            global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });
            await handleBuiltinDomainAction('good.org', 'allowlist', 'add');
            expect(state.currentAllowlist.has('good.org')).toBe(true);

            // Delete from denylist
            global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });
            await handleBuiltinDomainAction('bad.org', 'denylist', 'delete');
            expect(state.currentDenylist.has('bad.org')).toBe(false);

            // Delete from allowlist
            global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });
            await handleBuiltinDomainAction('good.org', 'allowlist', 'delete');
            expect(state.currentAllowlist.has('good.org')).toBe(false);

            // API failure
            global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'Rate limit' });
            await handleBuiltinDomainAction('bad.org', 'denylist', 'add');
            expect(toastSpy).toHaveBeenCalledWith('Error: Rate limit', 'error');

            // Exception
            global.browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Fetch failed'));
            await handleBuiltinDomainAction('bad.org', 'denylist', 'add');
            expect(toastSpy).toHaveBeenCalledWith('Error: Fetch failed', 'error');

            toastSpy.mockRestore();
        });

        test('handleBuiltinHideAction filters log domain from cache', () => {
            const toastSpy = jest.spyOn(utils, 'showToast').mockImplementation(() => {});
            handleBuiltinHideAction(''); // empty domain early return

            state.cachedLogs = [
                { name: 'hide-me.com' },
                { domain: 'stay.com' }
            ];
            handleBuiltinHideAction('hide-me.com');
            expect(state.cachedLogs.length).toBe(1);
            expect(state.cachedLogs[0].domain).toBe('stay.com');
            expect(toastSpy).toHaveBeenCalledWith('Hidden hide-me.com from logs view', 'info');
            toastSpy.mockRestore();
        });

        test('handleBatchLogsAction processes visible rows', async () => {
            state.activeProfile = null;
            const toastSpy = jest.spyOn(utils, 'showToast').mockImplementation(() => {});

            // No active profile
            await handleBatchLogsAction('allowlist', 'add');
            expect(toastSpy).toHaveBeenCalledWith('No active profile detected.', 'warning');

            state.activeProfile = 'p-batch';
            const container = document.getElementById('logs-container');
            container.innerHTML = '';

            // No visible logs
            await handleBatchLogsAction('allowlist', 'add');
            expect(toastSpy).toHaveBeenCalledWith('No logs visible to process.', 'warning');

            // Visible rows with domains
            container.innerHTML = `
                <div class="log-row">
                    <button class="builtin-allow-btn" data-domain="a.example.com"></button>
                </div>
                <div class="log-row">
                    <button class="builtin-allow-btn" data-domain="b.example.com"></button>
                </div>
                <div class="log-row">
                    <button class="builtin-allow-btn" data-domain=""></button>
                </div>
            `;

            global.browser.runtime.sendMessage.mockResolvedValue({ success: true });
            await handleBatchLogsAction('allowlist', 'add', false);
            expect(toastSpy).toHaveBeenCalledWith('Successfully processed 2/2 domains in allowlist.', 'success');

            // Use root domain extraction
            await handleBatchLogsAction('allowlist', 'add', true);
            expect(toastSpy).toHaveBeenCalledWith('Successfully processed 1/1 domains in allowlist.', 'success');

            toastSpy.mockRestore();
        });

        test('initBuiltinLogsEvents sets up delegated clicks on container and batch toolbar', () => {
            const batchBar = document.createElement('div');
            batchBar.id = 'logs-batch-bar';
            batchBar.innerHTML = `
                <button id="batch-allow-all-btn"></button>
                <button id="batch-allow-roots-btn"></button>
                <button id="batch-deny-all-btn"></button>
                <button id="batch-remove-allow-btn"></button>
                <button id="batch-remove-deny-btn"></button>
            `;
            document.body.appendChild(batchBar);

            const container = document.getElementById('logs-container');
            container._hasBuiltinLogEvents = false;
            initBuiltinLogsEvents();

            container.innerHTML = `
                <div class="log-row">
                    <button class="builtin-allow-btn" data-domain="test-allow.com"></button>
                    <button class="builtin-deny-btn" data-domain="test-deny.com"></button>
                    <button class="builtin-hide-btn" data-domain="test-hide.com"></button>
                </div>
            `;

            state.activeProfile = 'p-events';
            container.querySelector('.builtin-allow-btn').click();
            expect(document.getElementById('builtin-allow-modal-backdrop')).not.toBeNull();
            closeBuiltinAllowlistModal();

            container.querySelector('.builtin-deny-btn').click();
            container.querySelector('.builtin-hide-btn').click();

            document.getElementById('batch-allow-all-btn').click();
            document.getElementById('batch-allow-roots-btn').click();
            document.getElementById('batch-deny-all-btn').click();
            document.getElementById('batch-remove-allow-btn').click();
            document.getElementById('batch-remove-deny-btn').click();
        });

        test('Built-in logs additional branches and edge cases for 100% coverage', async () => {
            // 1. updateDeviceFilterOptions when dropdown does not exist
            const origDropdown = document.getElementById('log-device-filter');
            if (origDropdown) origDropdown.remove();
            updateDeviceFilterOptions();
            if (origDropdown) document.body.appendChild(origDropdown);

            // 2. openBuiltinAllowlistModal backdrop click vs dialog click
            openBuiltinAllowlistModal('test.com');
            const backdrop = document.getElementById('builtin-allow-modal-backdrop');
            const dialog = document.getElementById('builtin-allow-modal-dialog');
            // Click dialog (should NOT close)
            dialog.click();
            backdrop.onclick({ target: dialog });
            expect(document.getElementById('builtin-allow-modal-backdrop')).not.toBeNull();
            // Keydown other keys (e.g. 'Tab', 'Enter' when activeElement is not domainInput)
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            // Click backdrop directly (should close)
            backdrop.click();
            expect(document.getElementById('builtin-allow-modal-backdrop')).toBeNull();

            // 3. Modal submit with state.currentAllowlist/state.currentDenylist not Sets, error without message
            openBuiltinAllowlistModal('noset.com');
            state.activeProfile = 'prof-noset';
            state.currentAllowlist = null;
            state.currentDenylist = null;
            browser.runtime.sendMessage.mockResolvedValueOnce({ success: true });
            const modalAddBtn = document.getElementById('builtin-allow-modal-dialog').querySelector('.btn-primary');
            modalAddBtn.click();
            await new Promise(r => setTimeout(r, 10));

            // Error without message in modal submit
            openBuiltinAllowlistModal('err.com');
            browser.runtime.sendMessage.mockRejectedValueOnce({});
            const modalAddBtn2 = document.getElementById('builtin-allow-modal-dialog').querySelector('.btn-primary');
            modalAddBtn2.click();
            await new Promise(r => setTimeout(r, 10));
            closeBuiltinAllowlistModal();

            // 4. handleBuiltinDomainAction delete branches and non-Set branches
            state.activeProfile = 'p-del';
            state.currentAllowlist = null;
            state.currentDenylist = null;
            browser.runtime.sendMessage.mockResolvedValue({ success: true });
            await handleBuiltinDomainAction('test.com', 'denylist', 'add');
            await handleBuiltinDomainAction('test.com', 'denylist', 'delete');
            await handleBuiltinDomainAction('test.com', 'allowlist', 'delete');

            state.currentAllowlist = null;
            state.currentDenylist = null;
            await handleBuiltinDomainAction('test.com', 'allowlist', 'add');

            state.currentAllowlist = new Set(['test.com']);
            state.currentDenylist = new Set(['test.com']);
            await handleBuiltinDomainAction('test.com', 'allowlist', 'add');
            await handleBuiltinDomainAction('test.com', 'denylist', 'delete');
            await handleBuiltinDomainAction('test.com', 'allowlist', 'delete');
            await handleBuiltinDomainAction('test.com', 'allowlist', 'unknown_action');

            // handleBuiltinDomainAction error with no message
            browser.runtime.sendMessage.mockRejectedValueOnce({});
            await handleBuiltinDomainAction('err.com', 'allowlist', 'add');

            // 5. handleBuiltinHideAction with domain-only log (no name) and null cachedLogs
            state.cachedLogs = null;
            handleBuiltinHideAction('test.com');
            state.cachedLogs = [{ domain: 'domainonly.com' }];
            handleBuiltinHideAction('domainonly.com');
            expect(state.cachedLogs.length).toBe(0);

            // 6. handleBatchLogsAction with empty domains and all failures
            const container = document.getElementById('logs-container');
            container.innerHTML = `
                <div class="log-row">
                    <button class="builtin-allow-btn" data-domain="   "></button>
                </div>
            `;
            await handleBatchLogsAction('allowlist', 'add', false);

            container.innerHTML = `
                <div class="log-row">
                    <button class="builtin-allow-btn" data-domain="failed.com"></button>
                </div>
            `;
            browser.runtime.sendMessage.mockResolvedValueOnce({ success: false });
            await handleBatchLogsAction('allowlist', 'add', false);

            // 7. initBuiltinLogsEvents random click in container
            container._hasBuiltinLogEvents = false;
            initBuiltinLogsEvents();
            container.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
    });
});


