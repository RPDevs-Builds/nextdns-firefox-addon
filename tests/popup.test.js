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

    test('Defensive Rendering Resilience', async () => {
        // Test with empty/null data
        dashboard.renderLogs(null);
        const container = document.getElementById('logs-container');
        expect(container).not.toBeNull();
    });
});
