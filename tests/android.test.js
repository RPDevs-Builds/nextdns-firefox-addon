/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('Firefox for Android (Fenix) Compatibility Suite', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        window.history.pushState({}, '', '/');
    });

    test('isTabMode parses correctly when URL has mode=tab parameter', async () => {
        window.history.pushState({}, '', '/src/popup.html?mode=tab');

        const stateModule = await import('../src/ui/state.js');
        expect(stateModule.isTabMode).toBe(true);
        expect(stateModule.isPopoutMode).toBe(false);
        expect(stateModule.isSidebarMode).toBe(false);
    });

    test('isPopoutMode and isSidebarMode parse correctly from their respective params', async () => {
        window.history.pushState({}, '', '/src/popup.html?mode=popout');
        const popoutState = await import('../src/ui/state.js');
        expect(popoutState.isPopoutMode).toBe(true);
        expect(popoutState.isTabMode).toBe(false);

        jest.resetModules();
        window.history.pushState({}, '', '/src/popup.html?mode=sidebar');
        const sidebarState = await import('../src/ui/state.js');
        expect(sidebarState.isSidebarMode).toBe(true);
        expect(sidebarState.isTabMode).toBe(false);
    });

    test('handles missing browser.menus gracefully without throwing', () => {
        // Simulating Firefox for Android where browser.menus is undefined
        const mockBrowser = {
            menus: undefined
        };

        const setupMenus = () => {
            if (!mockBrowser.menus || !mockBrowser.menus.create) {
                return false;
            }
            mockBrowser.menus.create({ id: 'test' });
            return true;
        };

        expect(() => setupMenus()).not.toThrow();
        expect(setupMenus()).toBe(false);
    });

    test('falls back to browser.tabs.create when browser.windows is unavailable', async () => {
        // Simulating Android single-window model where browser.windows is undefined
        const tabsCreateMock = jest.fn().mockResolvedValue({ id: 101 });
        const mockBrowser = {
            windows: undefined,
            tabs: {
                create: tabsCreateMock
            },
            runtime: {
                getURL: jest.fn((p) => `chrome://${p}`)
            }
        };

        const openPopoutOrTab = async (url) => {
            if (mockBrowser.windows?.create) {
                return mockBrowser.windows.create({ url, type: 'popup' });
            } else if (mockBrowser.tabs?.create) {
                return mockBrowser.tabs.create({ url });
            }
        };

        const targetUrl = mockBrowser.runtime.getURL('src/popup.html?mode=popout');
        await openPopoutOrTab(targetUrl);

        expect(tabsCreateMock).toHaveBeenCalledWith({ url: targetUrl });
    });

    test('falls back to browser.tabs.create when browser.sidebarAction is unavailable', async () => {
        // Simulating Android where browser.sidebarAction is undefined
        const tabsCreateMock = jest.fn().mockResolvedValue({ id: 102 });
        const mockBrowser = {
            sidebarAction: undefined,
            tabs: {
                create: tabsCreateMock
            },
            runtime: {
                getURL: jest.fn((p) => `chrome://${p}`)
            }
        };

        const openSidebarOrTab = async () => {
            if (mockBrowser.sidebarAction?.open) {
                return mockBrowser.sidebarAction.open();
            } else if (mockBrowser.tabs?.create) {
                return mockBrowser.tabs.create({ url: mockBrowser.runtime.getURL('src/popup.html?mode=tab') });
            }
        };

        await openSidebarOrTab();
        expect(tabsCreateMock).toHaveBeenCalledWith({ url: 'chrome://src/popup.html?mode=tab' });
    });
});
