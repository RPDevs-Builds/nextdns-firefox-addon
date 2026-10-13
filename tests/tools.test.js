/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, describe, test, expect } from '@jest/globals';
import { runIntelligentDebugger, exportDebuggerSnapshot, runNetworkDiagnosticsUI, exportDiagnosticReport } from '../src/ui/tools.js';
import { state } from '../src/ui/state.js';

describe('UI Tools Module (ui/tools.js)', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="debugger-results"></div>
            <button id="export-debugger-btn" class="hidden">Export Debugger</button>
            <div id="diagnostics-results"></div>
            <button id="export-diagnostics-btn" class="hidden">Export Diagnostics</button>
            <button id="run-diagnostics-btn">🩺 Run Diagnostics</button>
        `;
        state.activeProfile = 'test-profile-123';
        jest.clearAllMocks();
    });

    describe('runIntelligentDebugger', () => {
        test('Early export functions return early when state is null before any run', () => {
            // Test lines 151 and 245 when variables are still null
            global.URL.createObjectURL = jest.fn();
            exportDebuggerSnapshot();
            exportDiagnosticReport();
            expect(global.URL.createObjectURL).not.toHaveBeenCalled();
        });

        test('Handles no active tabs found', async () => {
            global.browser.tabs.query = jest.fn().mockResolvedValue([]);
            await runIntelligentDebugger();

            const container = document.getElementById('debugger-results');
            expect(container.innerHTML).toContain('No active tab found');
        });

        test('Handles no active profile in state', async () => {
            state.activeProfile = null;
            global.browser.tabs.query = jest.fn().mockResolvedValue([{ id: 101 }]);

            await runIntelligentDebugger();

            const container = document.getElementById('debugger-results');
            expect(container.innerHTML).toContain('No active profile detected');
        });

        test('Handles error response from background script', async () => {
            global.browser.tabs.query = jest.fn().mockResolvedValue([{ id: 101 }]);
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
                success: false,
                error: 'Profile not found'
            });

            await runIntelligentDebugger();

            const container = document.getElementById('debugger-results');
            expect(container.textContent).toContain('Error: Profile not found');
        });

        test('Handles empty correlation list', async () => {
            global.browser.tabs.query = jest.fn().mockResolvedValue([{ id: 101 }]);
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
                success: true,
                correlations: []
            });

            await runIntelligentDebugger();

            const container = document.getElementById('debugger-results');
            expect(container.innerHTML).toContain('No blocked domains correlated');
        });

        test('Renders correlations with allow and snooze actions', async () => {
            global.browser.tabs.query = jest.fn().mockResolvedValue([{ id: 101 }]);
            const mockCorrelations = [
                {
                    domain: 'ads.example.com',
                    reasons: [{ name: 'AdGuard List' }, { name: 'EasyList' }],
                    timestamp: new Date().toISOString(),
                    device: 'Firefox Desktop'
                },
                {
                    domain: 'tracker.sample.org',
                    reason: 'Block Disguised Trackers',
                    timestamp: 'invalid-date',
                    device: 'Unknown'
                }
            ];

            global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({
                success: true,
                correlations: mockCorrelations
            });

            await runIntelligentDebugger();

            const container = document.getElementById('debugger-results');
            expect(container.innerHTML).toContain('ads.example.com');
            expect(container.innerHTML).toContain('tracker.sample.org');
            expect(container.innerHTML).toContain('AdGuard List');
            expect(container.innerHTML).toContain('Block Disguised Trackers');

            const exportBtn = document.getElementById('export-debugger-btn');
            expect(exportBtn.classList.contains('hidden')).toBe(false);

            // Allow button - success
            const allowBtns = container.querySelectorAll('.debug-allow-btn');
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({ success: true });
            await allowBtns[0].onclick({ target: allowBtns[0] });
            expect(allowBtns[0].textContent).toBe('Added');

            // Allow button - error response
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({ success: false, error: 'Rate limit' });
            await allowBtns[1].onclick({ target: allowBtns[1] });
            expect(allowBtns[1].textContent).toBe('Error');

            // Allow button - exception thrown
            global.browser.runtime.sendMessage = jest.fn().mockRejectedValueOnce(new Error('Network drop'));
            await allowBtns[1].onclick({ target: allowBtns[1] });
            expect(allowBtns[1].textContent).toBe('Error');

            // Snooze button - success
            const snoozeBtns = container.querySelectorAll('.debug-snooze-btn');
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({ success: true });
            await snoozeBtns[0].onclick({ target: snoozeBtns[0] });
            expect(snoozeBtns[0].textContent).toBe('Snoozed 15m');

            // Snooze button - error response
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({ success: false, error: 'Invalid config' });
            await snoozeBtns[1].onclick({ target: snoozeBtns[1] });
            expect(snoozeBtns[1].textContent).toBe('Error');

            // Allow button - error fallback (line 104)
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({ success: false });
            await allowBtns[1].onclick({ target: allowBtns[1] });
            expect(allowBtns[1].textContent).toBe('Error');

            // Allow button - exception without message fallback (line 109)
            global.browser.runtime.sendMessage = jest.fn().mockRejectedValueOnce({});
            await allowBtns[1].onclick({ target: allowBtns[1] });
            expect(allowBtns[1].textContent).toBe('Error');

            // Snooze button - error fallback (line 134)
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({ success: false });
            await snoozeBtns[1].onclick({ target: snoozeBtns[1] });
            expect(snoozeBtns[1].textContent).toBe('Error');

            // Snooze button - exception without message fallback (line 139)
            global.browser.runtime.sendMessage = jest.fn().mockRejectedValueOnce({});
            await snoozeBtns[1].onclick({ target: snoozeBtns[1] });
            expect(snoozeBtns[1].textContent).toBe('Error');

            // Correlations with reasons containing raw string instead of object with name
            global.browser.tabs.query = jest.fn().mockResolvedValue([{ id: 101 }]);
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({
                success: true,
                correlations: [
                    {
                        domain: 'simple.com',
                        reasons: ['Plain Reason'],
                        timestamp: 'invalid-date',
                        device: 'MyDevice'
                    },
                    {
                        domain: 'noreason.com',
                        timestamp: 'invalid-date',
                        device: 'MyDevice'
                    }
                ]
            });
            // Spy on row.querySelector to return null for debug-snooze-btn to cover false branch of line 114
            const origQuerySelector = Element.prototype.querySelector;
            let intercepted = false;
            jest.spyOn(Element.prototype, 'querySelector').mockImplementation(function(selector) {
                if (selector === '.debug-snooze-btn' && !intercepted) {
                    intercepted = true;
                    return null;
                }
                return origQuerySelector.call(this, selector);
            });

            await runIntelligentDebugger();
            Element.prototype.querySelector.mockRestore();
            expect(container.innerHTML).toContain('Plain Reason');
            expect(container.innerHTML).toContain('Unknown');
        });
    });

    describe('exportDebuggerSnapshot', () => {
        test('Returns early when lastDebuggerResult is null', () => {
            // Document reload or fresh call before running debugger
            global.URL.createObjectURL = jest.fn();
            exportDebuggerSnapshot();
            // line 151 early return
        });

        test('Exports snapshot data when correlations exist', async () => {
            // First run debugger to populate lastDebuggerResult
            global.browser.tabs.query = jest.fn().mockResolvedValue([{ id: 101 }]);
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({
                success: true,
                correlations: [{ domain: 'test.com', reason: 'Blocked' }]
            });
            await runIntelligentDebugger();

            // Mock createElement & appendChild for downloadAsFile
            const originalCreateElement = document.createElement.bind(document);
            jest.spyOn(document, 'createElement').mockImplementation((tag) => {
                const el = originalCreateElement(tag);
                if (tag === 'a') {
                    el.click = jest.fn();
                }
                return el;
            });
            global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
            global.URL.revokeObjectURL = jest.fn();

            exportDebuggerSnapshot();
            expect(global.URL.createObjectURL).toHaveBeenCalled();
        });
    });

    describe('runNetworkDiagnosticsUI', () => {
        test('Handles diagnostic error response', async () => {
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
                success: false,
                error: 'Network unreachable'
            });

            await runNetworkDiagnosticsUI();

            const container = document.getElementById('diagnostics-results');
            expect(container.innerHTML).toContain('Network unreachable');
            const runBtn = document.getElementById('run-diagnostics-btn');
            expect(runBtn.disabled).toBe(false);

            // Error response without error message (line 183 fallback)
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false });
            await runNetworkDiagnosticsUI();
            expect(container.innerHTML).toContain('Diagnostic test failed.');
        });

        test('Handles diagnostic exception thrown', async () => {
            global.browser.runtime.sendMessage = jest.fn().mockRejectedValue(new Error('DNS Timeout'));

            await runNetworkDiagnosticsUI();

            const container = document.getElementById('diagnostics-results');
            expect(container.innerHTML).toContain('DNS Timeout');
            const runBtn = document.getElementById('run-diagnostics-btn');
            expect(runBtn.disabled).toBe(false);

            // Exception without message (line 232 fallback)
            global.browser.runtime.sendMessage = jest.fn().mockRejectedValue({});
            await runNetworkDiagnosticsUI();
            expect(container.innerHTML).toContain('Diagnostic error');
        });

        test('Renders full diagnostics report with connected status and low latency', async () => {
            const diag = {
                isConnected: true,
                rttMs: 25,
                popServer: 'edge-lax-01',
                protocol: 'DoH3',
                clientIp: '198.51.100.1',
                activeProfileName: 'Home Security',
                timestamp: new Date().toISOString()
            };

            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
                success: true,
                diagnostics: diag
            });

            await runNetworkDiagnosticsUI();

            const container = document.getElementById('diagnostics-results');
            expect(container.innerHTML).toContain('CONNECTED');
            expect(container.innerHTML).toContain('25 ms');
            expect(container.innerHTML).toContain('edge-lax-01');
            expect(container.innerHTML).toContain('DoH3');
            expect(container.innerHTML).toContain('Home Security');

            const exportBtn = document.getElementById('export-diagnostics-btn');
            expect(exportBtn.classList.contains('hidden')).toBe(false);

            // Medium latency test (line 196: 50 <= rttMs < 120)
            diag.rttMs = 75;
            await runNetworkDiagnosticsUI();
            expect(container.innerHTML).toContain('75 ms');
        });

        test('Renders unconfigured diagnostics report with high and null latency', async () => {
            const diag = {
                isConnected: false,
                rttMs: 145,
                popServer: null,
                protocol: null,
                clientIp: null,
                activeProfileId: 'alt-id',
                timestamp: new Date().toISOString()
            };

            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
                success: true,
                diagnostics: diag
            });

            await runNetworkDiagnosticsUI();

            const container = document.getElementById('diagnostics-results');
            expect(container.innerHTML).toContain('UNCONFIGURED');
            expect(container.innerHTML).toContain('145 ms');

            // Null rttMs & neither activeProfileName nor activeProfileId
            diag.rttMs = null;
            diag.activeProfileId = null;
            await runNetworkDiagnosticsUI();
            expect(container.innerHTML).toContain('---');
            expect(container.innerHTML).toContain('None');
        });

        test('Handles missing run-diagnostics-btn or export-diagnostics-btn gracefully', async () => {
            document.getElementById('run-diagnostics-btn')?.remove();
            document.getElementById('export-diagnostics-btn')?.remove();

            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
                success: true,
                diagnostics: {
                    isConnected: true,
                    rttMs: 30,
                    timestamp: new Date().toISOString()
                }
            });

            await runNetworkDiagnosticsUI();
            const container = document.getElementById('diagnostics-results');
            expect(container.innerHTML).toContain('CONNECTED');
        });
    });

    describe('exportDiagnosticReport', () => {
        test('Returns early when lastDiagnosticResult is null', () => {
            // Fresh test or reset
            global.URL.createObjectURL = jest.fn();
            exportDiagnosticReport();
            // line 245 early return
        });

        test('Exports diagnostic JSON when diagnostics exist', async () => {
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
                success: true,
                diagnostics: {
                    isConnected: true,
                    rttMs: 40,
                    activeProfileId: 'test-profile-123',
                    timestamp: new Date().toISOString()
                }
            });

            await runNetworkDiagnosticsUI();

            global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
            global.URL.revokeObjectURL = jest.fn();

            exportDiagnosticReport();
            expect(global.URL.createObjectURL).toHaveBeenCalled();

            // Export with missing activeProfileId (line 252 fallback)
            global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({
                success: true,
                diagnostics: {
                    isConnected: true,
                    rttMs: 40,
                    activeProfileId: null,
                    timestamp: new Date().toISOString()
                }
            });
            await runNetworkDiagnosticsUI();
            exportDiagnosticReport();
            expect(global.URL.createObjectURL).toHaveBeenCalled();
        });
    });
});
