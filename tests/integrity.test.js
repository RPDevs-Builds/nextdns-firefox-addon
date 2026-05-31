/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.resolve('src/popup.html'), 'utf8');

describe('System Integrity - End-to-End Wiring', () => {
    let state;

    beforeEach(async () => {
        document.body.innerHTML = html;
        jest.resetModules();

        // 1. Mock a standard browser environment
        global.browser = {
            storage: {
                sync: {
                    get: jest.fn().mockImplementation(() => new Promise(res => setTimeout(() => res({ apiKey: 'test' }), 10))),
                    set: jest.fn().mockResolvedValue({})
                },
                local: {
                    get: jest.fn().mockResolvedValue({}),
                    set: jest.fn().mockResolvedValue({})
                },
                onChanged: { addListener: jest.fn() }
            },
            runtime: {
                sendMessage: jest.fn().mockImplementation((msg) => {
                    if (msg.type === 'GET_PROFILE') return Promise.resolve({ id: 'p1', name: 'Test' });
                    if (msg.type === 'GET_LOGS') return Promise.resolve({ success: true, data: [] });
                    if (msg.type === 'GET_ALL_SETTINGS') return Promise.resolve({ success: true, data: {} });
                    return Promise.resolve({ success: true });
                }),
                getURL: jest.fn(p => p),
                getManifest: () => ({ version: '0.9.3' }),
                onMessage: { addListener: jest.fn() }
            },
            tabs: {
                query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
                create: jest.fn()
            },
            menus: { removeAll: jest.fn(), create: jest.fn(), onClicked: { addListener: jest.fn() } },
            action: { setPopup: jest.fn(), onClicked: { addListener: jest.fn() } }
        };

        // 2. Import the REAL main entry point
        await import('../src/ui/main.js');
        
        // Manually trigger DOMContentLoaded
        const event = new Event('DOMContentLoaded');
        document.dispatchEvent(event);
        
        // Wait for the async initializeApp to finish
        await new Promise(res => setTimeout(res, 50));
        
        const stateModule = await import('../src/ui/state.js');
        state = stateModule.state;
    });

    test('All main navigation tabs are clickable and update state', () => {
        const tabs = ['dashboard', 'logs', 'lists', 'toggles', 'presets', 'settings'];
        tabs.forEach(tabId => {
            const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
            expect(btn).not.toBeNull();
            
            btn.click();
            expect(state.activeTab).toBe(tabId);
            
            const content = document.getElementById(`tab-${tabId}`);
            expect(content.classList.contains('active')).toBe(true);
        });
    });

    test('Dashboard interactive buttons are wired to sendMessage', async () => {
        const allowBtn = document.getElementById('allow-btn');
        const domainInput = document.getElementById('domain-input');
        
        domainInput.value = 'blocked-site.com';
        allowBtn.click();

        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'MANAGE_DOMAIN',
            domain: 'blocked-site.com',
            action: 'add'
        }));
    });

    test('Logs sub-tab correctly loads analytics', async () => {
        const analyticsTab = document.querySelector('.sub-tab-btn[data-sub="analytics"]');
        analyticsTab.click();

        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'GET_ANALYTICS'
        }));
    });

    test('Fault Tolerance: UI remains responsive even if a service crashes', async () => {
        // Force a crash in the lists sync
        global.browser.runtime.sendMessage.mockImplementationOnce((msg) => {
            if (msg.type === 'GET_PROFILE_DATA') throw new Error('Crashed!');
            return Promise.resolve({ success: true });
        });

        // Click a tab to trigger a potential crash
        const logsTab = document.querySelector('.tab-btn[data-tab="logs"]');
        logsTab.click();

        // The tab should still be active despite the crash
        expect(state.activeTab).toBe('logs');
    });

    test('Cleanup: Sub-tab content switches visibility correctly', () => {
        const settingsTab = document.querySelector('.tab-btn[data-tab="settings"]');
        settingsTab.click();

        const customizeBtn = document.querySelector('.sub-tab-btn[data-sub="customize"]');
        customizeBtn.click();

        expect(document.getElementById('settings-customize').classList.contains('active')).toBe(true);
        expect(document.getElementById('settings-setup').classList.contains('active')).toBe(false);
    });
});
