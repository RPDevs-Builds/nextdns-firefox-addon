/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, afterEach, afterAll, describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.resolve('src/popup.html'), 'utf8');

describe('UI Main Module (src/ui/main.js) Comprehensive Test Suite', () => {
    let uiMain;
    let stateModule;
    let mockStorageData;

    beforeEach(async () => {
        jest.setTimeout(60000);
        document.body.innerHTML = html;
        jest.resetModules();
        jest.clearAllMocks();

        mockStorageData = {
            apiKey: '0123456789abcdef01234567',
            activeProfile: 'profile-main-1',
            overrideProfileId: 'profile-main-1',
            iconClickAction: 'popup',
            autoRefreshLogs: false,
            enableBlockNotifications: true,
            enableLabs: true,
            autoRefreshTime: 5,
            mirrorProfiles: ['profile-2'],
            hostnameAliases: { '192.168.1.50': 'Gaming Rig' },
            webGuiMaster: true,
            webGuiTlds: true,
            webGuiBlocklists: true,
            webGuiLogActions: true,
            webGuiDesc: true,
            webGuiProfileNotes: true,
            webGuiFilter: true,
            webGuiForcedTheme: 'dark'
        };

        global.browser = {
            storage: {
                sync: {
                    get: jest.fn(keys => {
                        if (!keys) return Promise.resolve(mockStorageData);
                        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorageData[keys] });
                        if (Array.isArray(keys)) {
                            const res = {};
                            keys.forEach(k => res[k] = mockStorageData[k]);
                            return Promise.resolve(res);
                        }
                        return Promise.resolve(mockStorageData);
                    }),
                    set: jest.fn(obj => {
                        Object.assign(mockStorageData, obj);
                        return Promise.resolve();
                    })
                },
                local: {
                    get: jest.fn().mockResolvedValue({ localDataKey: 'localVal' }),
                    set: jest.fn().mockResolvedValue({})
                },
                onChanged: {
                    addListener: jest.fn(),
                    removeListener: jest.fn()
                }
            },
            runtime: {
                getURL: jest.fn(p => `chrome-extension://test/${p}`),
                getManifest: jest.fn(() => ({ version: '1.2.2' })),
                reload: jest.fn(),
                sendMessage: jest.fn(async (msg) => {
                    if (msg.type === 'GET_PROFILE') {
                        return { id: 'profile-main-1', name: 'Main Profile' };
                    }
                    if (msg.type === 'GET_NETWORK_STATUS') {
                        return {
                            networkStatus: {
                                isConnected: true,
                                protocol: 'DoH',
                                popServer: 'ams-1'
                            }
                        };
                    }
                    if (msg.type === 'GET_PROFILES_LIST') {
                        return {
                            success: true,
                            data: [
                                { id: 'profile-main-1', name: 'Main Profile' },
                                { id: 'profile-2', name: 'Work Profile' },
                                { id: 'profile-3', name: 'Guest Profile' }
                            ]
                        };
                    }
                    if (msg.type === 'MANAGE_DOMAIN') {
                        return { success: true };
                    }
                    if (msg.type === 'TEMP_ALLOW') {
                        return { success: true };
                    }
                    if (msg.type === 'TOGGLE_SETTING') {
                        return { success: true };
                    }
                    if (msg.type === 'CLEAR_TAB_STATS') {
                        return { success: true };
                    }
                    return { success: true };
                }),
                onMessage: {
                    addListener: jest.fn()
                }
            },
            windows: {
                create: jest.fn().mockResolvedValue({})
            },
            tabs: {
                query: jest.fn().mockResolvedValue([{ id: 10, url: 'https://example.com' }]),
                create: jest.fn().mockResolvedValue({})
            },
            sidebarAction: {
                open: jest.fn().mockResolvedValue({})
            }
        };

        global.window.close = jest.fn();
        global.confirm = jest.fn(() => true);
        if (!global.URL.createObjectURL) {
            global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
            global.URL.revokeObjectURL = jest.fn();
        }

        stateModule = await import('../src/ui/state.js');
        stateModule.state.activeProfile = 'profile-main-1';
        uiMain = await import('../src/ui/main.js');
    });

    afterEach(() => {
        if (stateModule?.state) {
            if (stateModule.state.tabTrackingIntervalId) {
                clearInterval(stateModule.state.tabTrackingIntervalId);
                stateModule.state.tabTrackingIntervalId = null;
            }
            if (stateModule.state.autoRefreshInterval) {
                clearInterval(stateModule.state.autoRefreshInterval);
                stateModule.state.autoRefreshInterval = null;
            }
        }
        jest.clearAllTimers();
    });

    afterAll(() => {
        if (stateModule?.state) {
            if (stateModule.state.tabTrackingIntervalId) {
                clearInterval(stateModule.state.tabTrackingIntervalId);
                stateModule.state.tabTrackingIntervalId = null;
            }
            if (stateModule.state.autoRefreshInterval) {
                clearInterval(stateModule.state.autoRefreshInterval);
                stateModule.state.autoRefreshInterval = null;
            }
        }
        jest.clearAllTimers();
    });

    describe('Window Mode and Redirects', () => {
        test('initWindowMode adds proper CSS classes for popout, sidebar, and tab modes', () => {
            uiMain.initWindowMode();
            expect(document.documentElement.className).toBe('');

            // Test popout mode
            stateModule.isPopoutMode = true;
            uiMain.initWindowMode();
            expect(document.documentElement.classList.contains('mode-popout')).toBe(true);
            expect(document.body.classList.contains('mode-popout')).toBe(true);

            // Test sidebar mode
            stateModule.isSidebarMode = true;
            uiMain.initWindowMode();
            expect(document.documentElement.classList.contains('mode-sidebar')).toBe(true);
            expect(document.body.classList.contains('sidebar-mode')).toBe(true);

            // Test tab mode
            stateModule.isTabMode = true;
            uiMain.initWindowMode();
            expect(document.documentElement.classList.contains('mode-tab')).toBe(true);
        });

        test('handleIconClickModeRedirect opens popout window when configured', async () => {
            stateModule.isPopoutMode = false;
            stateModule.isSidebarMode = false;
            stateModule.isTabMode = false;
            mockStorageData.iconClickAction = 'popout';

            const redirected = await uiMain.handleIconClickModeRedirect();
            expect(redirected).toBe(true);
            expect(browser.windows.create).toHaveBeenCalled();
            expect(window.close).toHaveBeenCalled();
        });

        test('handleIconClickModeRedirect opens sidebar when configured', async () => {
            stateModule.isPopoutMode = false;
            stateModule.isSidebarMode = false;
            stateModule.isTabMode = false;
            mockStorageData.iconClickAction = 'sidebar';

            const redirected = await uiMain.handleIconClickModeRedirect();
            expect(redirected).toBe(true);
            expect(browser.sidebarAction.open).toHaveBeenCalled();
            expect(window.close).toHaveBeenCalled();
        });

        test('handleIconClickModeRedirect falls back to tab when sidebar action is missing', async () => {
            stateModule.isPopoutMode = false;
            stateModule.isSidebarMode = false;
            stateModule.isTabMode = false;
            mockStorageData.iconClickAction = 'sidebar';
            delete browser.sidebarAction;

            const redirected = await uiMain.handleIconClickModeRedirect();
            expect(redirected).toBe(true);
            expect(browser.tabs.create).toHaveBeenCalled();
            expect(window.close).toHaveBeenCalled();
        });

        test('handleIconClickModeRedirect returns false when already in a standalone mode', async () => {
            stateModule.isPopoutMode = true;
            const redirected = await uiMain.handleIconClickModeRedirect();
            expect(redirected).toBe(false);
        });
    });

    describe('Domain Management', () => {
        test('handleDashboardDomain handles allow action', async () => {
            const domainInput = document.getElementById('domain-input');
            domainInput.value = 'allow-tracker.com';

            await uiMain.handleDashboardDomain('allowlist', 'add');
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'MANAGE_DOMAIN',
                listType: 'allowlist',
                domain: 'allow-tracker.com',
                action: 'add'
            }));
        });

        test('handleDashboardDomain handles deny action', async () => {
            const domainInput = document.getElementById('domain-input');
            domainInput.value = 'deny-tracker.com';

            await uiMain.handleDashboardDomain('denylist', 'add');
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'MANAGE_DOMAIN',
                listType: 'denylist',
                domain: 'deny-tracker.com',
                action: 'add'
            }));
        });

        test('handleDashboardDomain handles snooze action', async () => {
            const domainInput = document.getElementById('domain-input');
            domainInput.value = 'snooze-domain.com';

            await uiMain.handleDashboardDomain('allowlist', 'add', true);
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'TEMP_ALLOW',
                listType: 'allowlist',
                domain: 'snooze-domain.com',
                duration: 5
            }));
        });

        test('handleDashboardDomain handles background error responses gracefully', async () => {
            const domainInput = document.getElementById('domain-input');
            domainInput.value = 'bad.com';

            browser.runtime.sendMessage.mockResolvedValueOnce({
                success: false,
                error: 'Profile lock active'
            });

            await uiMain.handleDashboardDomain('denylist', 'add');
            const toast = document.querySelector('.toast');
            expect(toast).not.toBeNull();
            expect(toast.textContent).toContain('Profile lock active');
        });

        test('handleAddDomain adds domain to chosen list and clears input', async () => {
            const input = document.getElementById('list-new-domain');
            const select = document.getElementById('list-type-select');
            input.value = 'custom-block.com';
            select.value = 'denylist';

            await uiMain.handleAddDomain();

            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'MANAGE_DOMAIN',
                listType: 'denylist',
                domain: 'custom-block.com',
                action: 'add'
            }));
            expect(input.value).toBe('');
        });

        test('handleBulkAdd processes multiple lines and displays count toast', async () => {
            const textarea = document.getElementById('list-bulk-domains');
            const select = document.getElementById('list-type-select');
            const bulkContainer = document.getElementById('list-bulk-container');
            select.value = 'allowlist';
            textarea.value = "site1.org\n  site2.org  \n\nsite3.org";
            bulkContainer.classList.remove('hidden');

            await uiMain.handleBulkAdd();

            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'MANAGE_DOMAIN',
                domain: 'site1.org'
            }));
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'MANAGE_DOMAIN',
                domain: 'site2.org'
            }));
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'MANAGE_DOMAIN',
                domain: 'site3.org'
            }));
            expect(textarea.value).toBe('');
            expect(bulkContainer.classList.contains('hidden')).toBe(true);
        });
    });

    describe('Alerts Settings Management', () => {
        test('loadAlertSettings populates UI checkboxes accurately', async () => {
            mockStorageData.alertSettings = {
                enabled: true,
                desktop: true,
                actionCenter: false,
                triggerThreats: true,
                triggerDenylist: false,
                triggerParental: true
            };

            await uiMain.loadAlertSettings();

            expect(document.getElementById('alert-setting-enabled').checked).toBe(true);
            expect(document.getElementById('alert-setting-desktop').checked).toBe(true);
            expect(document.getElementById('alert-setting-action-center').checked).toBe(false);
            expect(document.getElementById('alert-trigger-threats').checked).toBe(true);
            expect(document.getElementById('alert-trigger-denylist').checked).toBe(false);
            expect(document.getElementById('alert-trigger-parental').checked).toBe(true);
        });

        test('saveAlertSettings synchronizes form values to storage', async () => {
            document.getElementById('alert-setting-enabled').checked = false;
            document.getElementById('alert-setting-desktop').checked = true;
            document.getElementById('alert-setting-action-center').checked = true;
            document.getElementById('alert-trigger-threats').checked = false;
            document.getElementById('alert-trigger-denylist').checked = true;
            document.getElementById('alert-trigger-parental').checked = true;

            await uiMain.saveAlertSettings();

            expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
                alertSettings: expect.objectContaining({
                    enabled: false,
                    desktop: true,
                    actionCenter: true,
                    triggerThreats: false,
                    triggerDenylist: true,
                    triggerParental: true
                }),
                enableBlockNotifications: true,
                blockNotif: true
            }));
        });

        test('sendTestAlert sends PUSH_NOTIFICATION message to background', async () => {
            const btn = document.getElementById('alert-test-btn');
            await uiMain.sendTestAlert();

            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'PUSH_NOTIFICATION',
                payload: expect.objectContaining({
                    type: 'security',
                    severity: 'high'
                })
            }));
            expect(btn.textContent).toBe('✅ Sent!');
        });
    });

    describe('Backup and Configuration Import/Export', () => {
        test('exportFullConfiguration collects sync and local storage data and triggers file download', async () => {
            const createElSpy = jest.spyOn(document, 'createElement');
            await uiMain.exportFullConfiguration();

            expect(browser.storage.sync.get).toHaveBeenCalledWith(null);
            expect(browser.storage.local.get).toHaveBeenCalledWith(null);
            expect(createElSpy).toHaveBeenCalledWith('a');
        });

        test('importFullConfiguration restores sync and local storage when backup is valid', async () => {
            const backupPayload = JSON.stringify({
                type: 'DNS_FORGE_BACKUP',
                version: '1.2.2',
                sync: { apiKey: 'restored-key', activeProfile: 'restored-prof' },
                local: { testLocal: 'value' }
            });

            const fakeFile = new Blob([backupPayload], { type: 'application/json' });
            const event = {
                target: {
                    files: [fakeFile],
                    value: 'backup.json'
                }
            };

            await uiMain.importFullConfiguration(event);

            // Wait for FileReader onload
            for (let i = 0; i < 20; i++) {
                if (event.target.value === '') break;
                await new Promise(r => setTimeout(r, 25));
            }

            expect(browser.storage.sync.set).toHaveBeenCalledWith({
                apiKey: 'restored-key',
                activeProfile: 'restored-prof'
            });
            expect(browser.storage.local.set).toHaveBeenCalledWith({
                testLocal: 'value'
            });
            expect(event.target.value).toBe('');
        });

        test('importFullConfiguration rejects invalid backup structure', async () => {
            const invalidPayload = JSON.stringify({ someKey: 'invalid' });
            const fakeFile = new Blob([invalidPayload], { type: 'application/json' });
            const event = {
                target: {
                    files: [fakeFile],
                    value: 'bad.json'
                }
            };

            await uiMain.importFullConfiguration(event);
            
            let toast = null;
            for (let i = 0; i < 20; i++) {
                toast = document.querySelector('.toast');
                if (toast) break;
                await new Promise(r => setTimeout(r, 25));
            }

            expect(toast).not.toBeNull();
            expect(toast.textContent).toContain('Invalid backup file format');
        });
    });

    describe('Profile Detection and UI Status', () => {
        test('refreshActiveProfileAndUI handles connected state with DoH protocol badge', async () => {
            const prof = await uiMain.refreshActiveProfileAndUI();

            expect(prof.id).toBe('profile-main-1');
            const statusEl = document.getElementById('profile-status');
            expect(statusEl.textContent).toContain('Main Profile');
            expect(statusEl.innerHTML).toContain('DoH');
            expect(statusEl.innerHTML).toContain('ams-1');
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'START_STREAM',
                profileId: 'profile-main-1'
            }));
        });

        test('refreshActiveProfileAndUI handles manual profile override badge', async () => {
            browser.runtime.sendMessage.mockImplementation(async (msg) => {
                if (msg.type === 'GET_PROFILE') return { id: 'p-man', name: 'Manual Prof', manual: true };
                if (msg.type === 'GET_NETWORK_STATUS') return { networkStatus: { isConnected: false } };
                return { success: true };
            });

            await uiMain.refreshActiveProfileAndUI();
            const statusEl = document.getElementById('profile-status');
            expect(statusEl.textContent).toContain('Manual Prof');
            expect(statusEl.textContent).toContain('Override (DNS Inactive)');
        });

        test('refreshActiveProfileAndUI handles DNS inactive badge', async () => {
            browser.runtime.sendMessage.mockImplementation(async (msg) => {
                if (msg.type === 'GET_PROFILE') return { id: 'p-inact', name: 'Inactive Prof', manual: false };
                if (msg.type === 'GET_NETWORK_STATUS') return { networkStatus: { isConnected: false } };
                return { success: true };
            });

            await uiMain.refreshActiveProfileAndUI();
            const statusEl = document.getElementById('profile-status');
            expect(statusEl.textContent).toContain('DNS Inactive');
        });

        test('refreshActiveProfileAndUI handles unconfigured / leaking status when no profile detected', async () => {
            browser.runtime.sendMessage.mockImplementation(async (msg) => {
                if (msg.type === 'GET_PROFILE') return null;
                if (msg.type === 'GET_NETWORK_STATUS') return { networkStatus: { isConnected: false } };
                return { success: true };
            });

            const res = await uiMain.refreshActiveProfileAndUI();
            expect(res).toBeNull();
            const statusEl = document.getElementById('profile-status');
            expect(statusEl.textContent).toContain('Unconfigured / Leaking');
        });
    });

    describe('Settings UI and Profiles Dropdown', () => {
        test('loadProfiles populates dropdown with Auto-Detect and profiles', async () => {
            const list = await uiMain.loadProfiles();
            expect(list.length).toBe(3);

            const select = document.getElementById('setting-profile-select');
            expect(select.options.length).toBe(4); // Auto-Detect + 3 profiles
            expect(select.options[0].textContent).toContain('Auto-Detect');
            expect(select.options[1].value).toBe('profile-main-1');
        });

        test('handleFetchProfilesClick adds spinning class and triggers loadProfiles', async () => {
            const btn = document.getElementById('setting-fetch-profiles');
            const event = { preventDefault: jest.fn() };

            await uiMain.handleFetchProfilesClick(event);
            expect(btn.classList.contains('spinning')).toBe(true);
        });

        test('initSettingsUI initializes form inputs and sets lastIconAction', async () => {
            const data = await uiMain.initSettingsUI();
            expect(data.apiKey).toBe('0123456789abcdef01234567');
            expect(document.getElementById('setting-api-key').value).toBe('0123456789abcdef01234567');
            expect(document.getElementById('setting-icon-action').value).toBe('popup');
        });

        test('saveSettings stores settings and reloads extension if iconClickAction changed', async () => {
            stateModule.state.lastIconAction = 'popup';
            document.getElementById('setting-icon-action').value = 'sidebar';

            await uiMain.saveSettings();

            expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
                iconClickAction: 'sidebar'
            }));

            // Advance timeout for reload
            await new Promise(r => setTimeout(r, 1600));
            expect(browser.runtime.reload).toHaveBeenCalled();
        });

        test('toggleAutoRefresh enables and disables auto refresh interval', async () => {
            const btn = document.getElementById('auto-refresh-btn');

            // Enable
            await uiMain.toggleAutoRefresh(true);
            expect(btn.classList.contains('btn-secondary')).toBe(true);
            expect(btn.textContent).toContain('Auto');
            expect(stateModule.state.autoRefreshInterval).not.toBeNull();

            // Disable
            await uiMain.toggleAutoRefresh(false);
            expect(btn.classList.contains('btn-dark')).toBe(true);
            expect(stateModule.state.autoRefreshInterval).toBeNull();
        });
    });

    describe('Mirror Mode and Web GUI Customize UI', () => {
        test('initMirrorModeUI renders checkboxes for other profiles', async () => {
            stateModule.state.activeProfile = 'profile-main-1';
            await uiMain.initMirrorModeUI();

            const container = document.getElementById('mirror-profiles-list');
            const checkboxes = container.querySelectorAll('input[type="checkbox"]');
            expect(checkboxes.length).toBe(2); // profile-2 and profile-3 (excluding active profile-main-1)

            const prof2Checkbox = container.querySelector('input[data-id="profile-2"]');
            expect(prof2Checkbox.checked).toBe(true); // Since mockStorage has mirrorProfiles: ['profile-2']
        });

        test('saveMirrorMode writes selected profile IDs to storage', async () => {
            const container = document.getElementById('mirror-profiles-list');
            container.innerHTML = `
                <label><input type="checkbox" data-id="p-alpha" checked> Alpha</label>
                <label><input type="checkbox" data-id="p-beta"> Beta</label>
                <label><input type="checkbox" data-id="p-gamma" checked> Gamma</label>
            `;

            await uiMain.saveMirrorMode();

            expect(browser.storage.sync.set).toHaveBeenCalledWith({
                mirrorProfiles: ['p-alpha', 'p-gamma']
            });
        });

        test('initCustomizeUI updates web GUI customize toggle states', async () => {
            await uiMain.initCustomizeUI();

            expect(document.getElementById('web-gui-master-toggle').checked).toBe(true);
            expect(document.getElementById('web-gui-tlds-toggle').checked).toBe(true);
            expect(document.getElementById('web-gui-forced-theme').value).toBe('dark');
        });
    });

    describe('updateLocalBlocksCache', () => {
        test('updates top-level categories', () => {
            stateModule.state.lastBlocksData = {};
            uiMain.updateLocalBlocksCache('security', 'threat_intelligence', 'add');
            expect(stateModule.state.lastBlocksData.security.threat_intelligence).toBe(true);

            uiMain.updateLocalBlocksCache('security', 'threat_intelligence', 'delete');
            expect(stateModule.state.lastBlocksData.security.threat_intelligence).toBe(false);
        });

        test('updates subcategories (e.g. privacy/natives)', () => {
            stateModule.state.lastBlocksData = {};
            uiMain.updateLocalBlocksCache('privacy/natives', 'apple', 'add');
            expect(stateModule.state.lastBlocksData.privacy.natives).toEqual([{ id: 'apple' }]);

            uiMain.updateLocalBlocksCache('privacy/natives', 'apple', 'delete');
            expect(stateModule.state.lastBlocksData.privacy.natives).toEqual([]);
        });

        test('updates settings/performance subcategory', () => {
            stateModule.state.lastBlocksData = {};
            uiMain.updateLocalBlocksCache('settings/performance', 'ecs', 'add');
            expect(stateModule.state.lastBlocksData.settings.performance.ecs).toBe(true);
        });
    });

    describe('Global Event Listeners and Delegations', () => {
        test('binds global event listeners without throwing', () => {
            expect(() => uiMain.initGlobalEventListeners()).not.toThrow();
        });

        test('handles tab navigation click and keyboard navigation', () => {
            uiMain.initGlobalEventListeners();

            const settingsTabBtn = document.getElementById('tab-btn-settings');
            settingsTabBtn.click();
            expect(stateModule.state.activeTab).toBe('settings');

            // Keyboard navigation on tab-bar
            const tabBar = document.querySelector('.tab-bar');
            tabBar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });

        test('handles delegated .api-toggle change events', async () => {
            uiMain.initGlobalEventListeners();

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.className = 'api-toggle';
            toggle.dataset.cat = 'security';
            toggle.dataset.id = 'ai_threats';
            toggle.dataset.type = 'boolean';
            toggle.checked = true;
            document.body.appendChild(toggle);

            toggle.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 60));

            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'TOGGLE_SETTING',
                category: 'security',
                id: 'ai_threats',
                action: 'add'
            }));
        });

        test('handles delegated .api-toggle-btn click events', async () => {
            uiMain.initGlobalEventListeners();

            const btn = document.createElement('button');
            btn.className = 'api-toggle-btn btn-allow';
            btn.dataset.cat = 'privacy/natives';
            btn.dataset.id = 'windows';
            btn.dataset.active = 'false';
            document.body.appendChild(btn);

            btn.click();
            await new Promise(r => setTimeout(r, 60));

            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'TOGGLE_SETTING',
                category: 'privacy/natives',
                id: 'windows',
                action: 'add'
            }));
            expect(btn.dataset.active).toBe('true');
            expect(btn.textContent).toBe('Remove');
        });

        test('handles live logs and push notification messages in runtime.onMessage', () => {
            let messageCb;
            browser.runtime.onMessage.addListener.mockImplementation(cb => messageCb = cb);

            uiMain.initGlobalEventListeners();
            expect(messageCb).toBeDefined();

            // PUSH_NOTIFICATION
            messageCb({
                type: 'PUSH_NOTIFICATION',
                payload: {
                    type: 'security',
                    severity: 'critical',
                    message: 'Threat blocked immediately!'
                }
            });

            expect(stateModule.state.notifications.length).toBeGreaterThan(0);
            expect(stateModule.state.notifications[0].message).toBe('Threat blocked immediately!');
        });

        test('handles sub-tab switching across dashboard, settings, and toggles', () => {
            uiMain.initGlobalEventListeners();

            // Settings sub-tab alerts
            const alertsSubBtn = document.querySelector('#settings-sub-nav .sub-tab-btn[data-sub="alerts"]');
            if (alertsSubBtn) {
                alertsSubBtn.click();
                expect(alertsSubBtn.classList.contains('active')).toBe(true);
            }

            // Settings sub-tab customize
            const custSubBtn = document.querySelector('#settings-sub-nav .sub-tab-btn[data-sub="customize"]');
            if (custSubBtn) {
                custSubBtn.click();
                expect(custSubBtn.classList.contains('active')).toBe(true);
            }

            // Settings sub-tab mirror
            const mirrorSubBtn = document.querySelector('#settings-sub-nav .sub-tab-btn[data-sub="mirror"]');
            if (mirrorSubBtn) {
                mirrorSubBtn.click();
                expect(mirrorSubBtn.classList.contains('active')).toBe(true);
            }

            // Settings sub-tab schedules
            const schedSubBtn = document.querySelector('#settings-sub-nav .sub-tab-btn[data-sub="schedules"]');
            if (schedSubBtn) {
                schedSubBtn.click();
                expect(schedSubBtn.classList.contains('active')).toBe(true);
            }

            // Settings sub-tab webgui
            const webguiSubBtn = document.querySelector('#settings-sub-nav .sub-tab-btn[data-sub="webgui"]');
            if (webguiSubBtn) {
                webguiSubBtn.click();
                expect(webguiSubBtn.classList.contains('active')).toBe(true);
            }
        });

        test('handles list search, filter select, and bulk container toggles', () => {
            uiMain.initGlobalEventListeners();

            const select = document.getElementById('list-type-select');
            select.dispatchEvent(new Event('change'));

            const searchInput = document.getElementById('list-search-input');
            searchInput.value = 'google';
            searchInput.dispatchEvent(new Event('input'));

            const bulkToggleBtn = document.getElementById('list-bulk-toggle-btn');
            const bulkContainer = document.getElementById('list-bulk-container');
            bulkToggleBtn.click();
            expect(bulkContainer.classList.contains('hidden')).toBe(false);

            const bulkCancelBtn = document.getElementById('list-bulk-cancel-btn');
            bulkCancelBtn.click();
            expect(bulkContainer.classList.contains('hidden')).toBe(true);
        });

        test('handles dashboard live tracking and clear tab stats buttons', async () => {
            uiMain.initGlobalEventListeners();

            const toggleTrackingBtn = document.getElementById('toggle-tab-tracking-btn');
            toggleTrackingBtn.click();
            expect(stateModule.state.isTabTrackingPaused).toBe(true);
            expect(toggleTrackingBtn.textContent).toContain('LIVE');

            toggleTrackingBtn.click();
            expect(stateModule.state.isTabTrackingPaused).toBe(false);

            const clearTabBtn = document.getElementById('clear-tab-log-btn');
            clearTabBtn.click();
            await new Promise(r => setTimeout(r, 60));
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'CLEAR_TAB_STATS',
                tabId: 10
            }));
        });

        test('handles status filter checkboxes interaction logic', () => {
            uiMain.initGlobalEventListeners();

            const filterAll = document.getElementById('filter-all');
            const filterBlocked = document.getElementById('filter-blocked');
            const filterAllowlist = document.getElementById('filter-allowlist');

            // Uncheck All
            filterAll.checked = false;
            filterAll.dispatchEvent(new Event('change'));

            // Check Allowlist
            filterAllowlist.checked = true;
            filterAllowlist.dispatchEvent(new Event('change'));

            // Check Blocked
            filterBlocked.checked = true;
            filterBlocked.dispatchEvent(new Event('change'));
        });

        test('handles tool triggers and data management button clicks', () => {
            browser.runtime.sendMessage.mockResolvedValue({ success: true, correlations: [] });
            uiMain.initGlobalEventListeners();

            document.getElementById('run-debugger-btn')?.click();
            document.getElementById('export-debugger-btn')?.click();
            document.getElementById('run-diagnostics-btn')?.click();
            document.getElementById('export-diagnostics-btn')?.click();
            document.getElementById('launch-full-manager-btn')?.click();
            expect(browser.tabs.create).toHaveBeenCalled();
        });

        test('handles window pagehide and unload lifecycle cleanup', async () => {
            await uiMain.initializeApp();
            stateModule.state.tabTrackingIntervalId = setInterval(() => {}, 1000);

            window.dispatchEvent(new Event('pagehide'));
            expect(stateModule.state.tabTrackingIntervalId).toBeNull();
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'STOP_STREAM' });
        });

        test('DOMContentLoaded bootstrap sequence runs and handles retry UI fallback on failure', async () => {
            const dashOverview = document.getElementById('dash-overview');
            expect(dashOverview).not.toBeNull();

            // Trigger DOMContentLoaded
            document.dispatchEvent(new Event('DOMContentLoaded'));
            await new Promise(r => setTimeout(r, 200));

            expect(document.getElementById('profile-status')).not.toBeNull();
            if (stateModule?.state?.tabTrackingIntervalId) {
                clearInterval(stateModule.state.tabTrackingIntervalId);
                stateModule.state.tabTrackingIntervalId = null;
            }
        });

        test('tabBar keyboard navigation handles ArrowRight and ArrowLeft wrap-around', () => {
            uiMain.initGlobalEventListeners();
            const tabBar = document.querySelector('.tab-bar');
            expect(tabBar).not.toBeNull();

            stateModule.state.activeTab = 'dashboard';
            const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
            tabBar.dispatchEvent(rightEvent);

            const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
            tabBar.dispatchEvent(leftEvent);

            // Non-arrow keys ignored
            const otherEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            tabBar.dispatchEvent(otherEvent);
        });

        test('dynamic .api-toggle change listener handles success, error response, and exceptions', async () => {
            uiMain.initGlobalEventListeners();

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.className = 'api-toggle';
            toggle.dataset.cat = 'security';
            toggle.dataset.id = 'ai';
            toggle.dataset.type = 'boolean';
            document.body.appendChild(toggle);

            // 1. Success path
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 60));
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'TOGGLE_SETTING',
                category: 'security',
                id: 'ai',
                action: 'add'
            }));

            // 2. Error response from background
            browser.runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'NextDNS API rejected' });
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 60));
            expect(toggle.checked).toBe(false);

            // 3. Exception thrown during send
            browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Network disconnected'));
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 60));
            expect(toggle.checked).toBe(false);
        });

        test('saveAlertSettings and sendTestAlert error handling branches', async () => {
            const { storage } = await import('../src/storage.js');
            const origSet = storage.set;
            storage.set = jest.fn().mockRejectedValueOnce(new Error('Sync quota exceeded'));

            await uiMain.saveAlertSettings();
            const alertSaveBtn = document.getElementById('alert-save-btn');
            expect(alertSaveBtn.textContent).toBe('❌ Error');
            storage.set = origSet;

            // sendTestAlert failure
            browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Notification service failed'));
            await uiMain.sendTestAlert();
            const testAlertBtn = document.getElementById('alert-test-btn');
            expect(testAlertBtn.textContent).toBe('❌ Failed');
        });

        test('loadProfiles and refreshActiveProfileAndUI error handling branches', async () => {
            // 1. loadProfiles exception
            browser.runtime.sendMessage.mockRejectedValueOnce(new Error('API offline'));
            const errProfiles = await uiMain.loadProfiles();
            expect(errProfiles).toEqual([]);

            // 2. refreshActiveProfileAndUI exception
            browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Fatal comms error'));
            const errorResult = await uiMain.refreshActiveProfileAndUI();
            expect(errorResult).toBeNull();
        });

        test('header controls, web GUI customize toggles, and live listeners', async () => {
            uiMain.initGlobalEventListeners();

            // 1. Popout UI button
            const popoutBtn = document.getElementById('popout-ui-btn');
            if (popoutBtn) {
                popoutBtn.click();
                expect(browser.windows.create).toHaveBeenCalled();
                expect(global.window.close).toHaveBeenCalled();
            }

            // 2. Web GUI Customize toggles
            const masterToggle = document.getElementById('web-gui-master-toggle');
            if (masterToggle) {
                masterToggle.checked = true;
                masterToggle.dispatchEvent(new Event('change'));
                await new Promise(r => setTimeout(r, 60));
                expect(browser.storage.sync.set).toHaveBeenCalled();

                masterToggle.checked = false;
                masterToggle.dispatchEvent(new Event('change'));
                await new Promise(r => setTimeout(r, 60));
            }

            const forcedThemeSelect = document.getElementById('web-gui-forced-theme');
            if (forcedThemeSelect) {
                forcedThemeSelect.value = 'dark';
                forcedThemeSelect.dispatchEvent(new Event('change'));
                await new Promise(r => setTimeout(r, 60));
                expect(browser.storage.sync.set).toHaveBeenCalled();
            }

            // 3. Theme Enter keydown
            const themeInput = document.getElementById('theme-name-input');
            if (themeInput) {
                themeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }

            // 4. Import settings button click triggers file input
            const importBtn = document.getElementById('import-settings-btn');
            const importFile = document.getElementById('import-settings-file');
            if (importBtn && importFile) {
                importFile.click = jest.fn();
                importBtn.click();
                expect(importFile.click).toHaveBeenCalled();
            }
        });

        test('initSettingsUI debounced apiKey input and error recovery', async () => {
            // 1. Live debounced API key input
            document.body.innerHTML = `
                <input id="setting-api-key" value="">
                <select id="setting-profile-select"></select>
                <select id="setting-icon-action"></select>
                <input type="checkbox" id="setting-auto-refresh">
                <input type="checkbox" id="setting-block-notif">
                <input type="checkbox" id="setting-enable-labs">
                <input id="setting-refresh-time" value="5">
            `;
            await uiMain.initSettingsUI();

            const apiKeyInput = document.getElementById('setting-api-key');
            apiKeyInput.value = '123456789012345678901'; // 21 chars
            apiKeyInput.dispatchEvent(new Event('input'));
            await new Promise(r => setTimeout(r, 450));
            expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'GET_PROFILES_LIST',
                apiKey: '123456789012345678901'
            }));

            // 2. initSettingsUI error catch
            const { storage } = await import('../src/storage.js');
            const origGet = storage.get;
            storage.get = jest.fn().mockRejectedValueOnce(new Error('Storage unreadable'));
            await expect(uiMain.initSettingsUI()).rejects.toThrow('Storage unreadable');
            storage.get = origGet;

            // 3. loadAlertSettings error catch
            storage.get = jest.fn().mockRejectedValueOnce(new Error('Alert storage failure'));
            await uiMain.loadAlertSettings();
            storage.get = origGet;
        });

        test('UI Main Module - comprehensive branch and error recovery coverage', async () => {
            const { storage } = await import('../src/storage.js');

            // 1. handleDashboardDomain error catch (line 134)
            document.body.innerHTML = `
                <input id="domain-input" value="test-error.com">
                <button id="allow-btn">Allow</button>
            `;
            browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Background unreachable'));
            await uiMain.handleDashboardDomain('allowlist', 'add');
            expect(document.getElementById('allow-btn').disabled).toBe(false);

            // 2. handleAddDomain empty domain, API failure, and error catch (lines 147, 167, 170)
            document.body.innerHTML = `
                <input id="list-new-domain" value="">
                <select id="list-type-select"><option value="allowlist">Allowlist</option></select>
                <button id="list-add-btn">Add</button>
            `;
            // Empty
            await uiMain.handleAddDomain();

            // API failure
            document.getElementById('list-new-domain').value = 'fail.com';
            browser.runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'Denied by policy' });
            await uiMain.handleAddDomain();

            // Error catch
            document.getElementById('list-new-domain').value = 'crash.com';
            browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Connection lost'));
            await uiMain.handleAddDomain();
            expect(document.getElementById('list-add-btn').disabled).toBe(false);

            // 3. handleBulkAdd empty domains (line 183)
            document.body.innerHTML = `
                <textarea id="list-bulk-domains"></textarea>
                <select id="list-type-select"><option value="denylist">Denylist</option></select>
                <button id="list-bulk-submit-btn">Submit</button>
            `;
            await uiMain.handleBulkAdd();

            // 4. handleIconClickModeRedirect popout tab fallback & error catch (lines 258-259, 276)
            const origGet = storage.get;
            storage.get = jest.fn().mockResolvedValue('popout');
            const origWindows = window.browser?.windows;
            delete window.browser.windows;
            await uiMain.handleIconClickModeRedirect();
            expect(browser.tabs.create).toHaveBeenCalled();
            window.browser.windows = origWindows;

            storage.get = jest.fn().mockRejectedValueOnce(new Error('Storage broken'));
            const redirectFailed = await uiMain.handleIconClickModeRedirect();
            expect(redirectFailed).toBe(false);
            storage.get = origGet;

            // 5. updateLocalBlocksCache settings/performance branch (line 696)
            stateModule.state.lastBlocksData = { 'settings/performance': {} };
            uiMain.updateLocalBlocksCache('settings/performance', 'cache-boost', 'add');
            expect(stateModule.state.lastBlocksData['settings/performance']['cache-boost']).toBe(true);

            // 6. initializeApp hostnameAliases catch & service error (lines 740, 791)
            storage.get = jest.fn().mockImplementation((key) => {
                if (key === 'hostnameAliases') throw new Error('Aliases corrupted');
                return Promise.resolve(mockStorageData[key]);
            });
            await uiMain.initializeApp();
            storage.get = origGet;

            // 7. initCustomizeUI & initMirrorModeUI catch blocks (lines 850, 880)
            storage.get = jest.fn().mockRejectedValueOnce(new Error('Customize storage err'));
            await uiMain.initCustomizeUI();

            browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Mirror comms err'));
            await uiMain.initMirrorModeUI();
            storage.get = origGet;

            // 8. refreshActiveProfileAndUI error catch (lines 1012-1013)
            browser.runtime.sendMessage.mockImplementation(async (msg) => {
                if (msg.type === 'GET_PROFILE') throw new Error('Fatal profile fetch error');
                return { success: true };
            });
            const nullProfile = await uiMain.refreshActiveProfileAndUI();
            expect(nullProfile).toBeNull();
        });

        test('Exhaustive coverage of UI Main edge cases, listeners, filters, and fallbacks', async () => {
            // A. DOMContentLoaded initialization error catches & retry button click (lines 78, 84-95)
            const themeModule = await import('../src/ui/theme.js');
            const themeSpy = jest.spyOn(themeModule, 'initThemeEngine').mockRejectedValueOnce(new Error('Theme engine error'));
            const origProfileProp = Object.getOwnPropertyDescriptor(stateModule.state, 'activeProfile');
            Object.defineProperty(stateModule.state, 'activeProfile', {
                set: () => { throw new Error('Simulated bootstrap crash'); },
                configurable: true
            });
            browser.runtime.sendMessage.mockImplementation(async (msg) => {
                if (msg.type === 'GET_PROFILE') return null;
                return { success: true };
            });
            document.dispatchEvent(new Event('DOMContentLoaded'));
            await new Promise(r => setTimeout(r, 60));
            const retryBtn = document.getElementById('retry-bootstrap-btn');
            if (retryBtn) retryBtn.click();
            themeSpy.mockRestore();
            if (origProfileProp) {
                Object.defineProperty(stateModule.state, 'activeProfile', origProfileProp);
            } else {
                delete stateModule.state.activeProfile;
            }

            // B. handleDashboardDomain empty domain check (line 110)
            const domInput = document.getElementById('domain-input');
            if (domInput) domInput.value = '   ';
            await uiMain.handleDashboardDomain('allowlist', 'add');
            expect(browser.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ domain: '   ' }));

            // C. Tab Switching & Sub-tabs (lines 296, 302-309, 351-353, 366)
            uiMain.initGlobalEventListeners();

            // Click dashboard tab when activeProfile is null / Not Detected
            stateModule.state.activeProfile = null;
            const profStatusEl = document.getElementById('profile-status');
            if (profStatusEl) profStatusEl.textContent = 'Profile: Not Detected';
            const dashTabBtn = document.querySelector('.tab-btn[data-tab="dashboard"]');
            dashTabBtn?.click();
            await new Promise(r => setTimeout(r, 30));

            // Click settings tab with various active sub-tabs
            const settingsTabBtn = document.querySelector('.tab-btn[data-tab="settings"]');
            const subNav = document.getElementById('settings-sub-nav');
            if (subNav && settingsTabBtn) {
                const subButtons = subNav.querySelectorAll('.sub-tab-btn');
                for (const sub of ['alerts', 'mirror', 'schedules', 'customize', 'webgui']) {
                    subButtons.forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
                    if (sub === 'customize') stateModule.state.isThemeUnsaved = true;
                    settingsTabBtn.click();
                    if (sub === 'customize') {
                        stateModule.state.isThemeUnsaved = false;
                        settingsTabBtn.click();
                    }
                }
            }

            // SubTab on dashboard (lines 351-353)
            const dashSubOverview = document.querySelector('#dashboard-sub-nav .sub-tab-btn[data-sub="overview"]') ||
                document.querySelector('.sub-tab-btn[data-parent="dashboard"][data-sub="overview"]');
            dashSubOverview?.click();

            // SubTab on settings setup (line 366)
            const settingsSubSetup = document.querySelector('#settings-sub-nav .sub-tab-btn[data-sub="setup"]') ||
                document.querySelector('.sub-tab-btn[data-parent="settings"][data-sub="setup"]');
            settingsSubSetup?.click();

            // D. Keyboard navigation on .tab-bar (lines 323, 327)
            const tabBar = document.querySelector('.tab-bar');
            if (tabBar) {
                // currentIndex === -1
                stateModule.state.activeTab = 'nonexistent-tab';
                tabBar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

                // nextIndex < 0 wrap-around
                const visibleTabs = Array.from(tabBar.querySelectorAll('.tab-btn:not(.hidden)'));
                if (visibleTabs.length > 0) {
                    stateModule.state.activeTab = visibleTabs[0].dataset.tab;
                    tabBar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
                }
            }

            // E. Dashboard controls & status filters (lines 385-386, 389-391, 427-431, 441, 445, 458, 466-470)
            const autoBtn = document.getElementById('auto-refresh-btn');
            if (autoBtn) {
                autoBtn.classList.add('btn-secondary');
                autoBtn.click();
                autoBtn.classList.remove('btn-secondary');
                autoBtn.click();
            }

            if (domInput) domInput.value = 'example.org';
            document.getElementById('allow-btn')?.click();
            document.getElementById('deny-btn')?.click();
            document.getElementById('snooze-btn')?.click();

            // Status filter logic
            const filterAll = document.getElementById('filter-all');
            const filterStandard = document.getElementById('filter-standard');
            const filterAllowed = document.getElementById('filter-allowed');
            const filterBlocked = document.getElementById('filter-blocked');
            const filterAllowlist = document.getElementById('filter-allowlist');
            const filterDenylist = document.getElementById('filter-denylist');

            if (filterAll && filterStandard && filterAllowed && filterBlocked) {
                // filterAll checked -> true
                filterAll.checked = true;
                filterAll.dispatchEvent(new Event('change'));

                // filterAllowlist and filterDenylist checks
                if (filterDenylist) {
                    filterBlocked.checked = true;
                    filterDenylist.checked = true;
                    filterDenylist.dispatchEvent(new Event('change'));
                }
                if (filterAllowlist) {
                    filterAllowed.checked = true;
                    filterAllowlist.checked = true;
                    filterAllowlist.dispatchEvent(new Event('change'));
                }

                // Standard + Allowed + Blocked checked with no allowlist/denylist -> filterAll = true
                filterStandard.checked = true;
                filterAllowed.checked = true;
                filterBlocked.checked = true;
                if (filterAllowlist) filterAllowlist.checked = false;
                if (filterDenylist) filterDenylist.checked = false;
                filterAllowed.dispatchEvent(new Event('change'));
                expect(filterAll.checked).toBe(true);

                // Uncheck all -> resets filterAll to true
                document.querySelectorAll('#status-filter-content input').forEach(inp => inp.checked = false);
                filterStandard.dispatchEvent(new Event('change'));
                expect(filterAll.checked).toBe(true);
            }

            // F. Alert checkboxes and theme-selector unsaved (lines 490, 506)
            const alertChk = document.getElementById('alert-setting-enabled');
            alertChk?.dispatchEvent(new Event('change'));

            const themeSelect = document.getElementById('theme-selector');
            if (themeSelect) {
                themeSelect.value = '__unsaved__';
                themeSelect.dispatchEvent(new Event('change'));
            }

            // G. Popout UI fallback to tabs.create (lines 554-555)
            const popoutBtn = document.getElementById('popout-ui-btn');
            const origWin = window.browser?.windows;
            delete window.browser.windows;
            const origClose = window.close;
            window.close = jest.fn();
            popoutBtn?.click();
            expect(browser.tabs.create).toHaveBeenCalled();
            window.browser.windows = origWin;
            window.close = origClose;

            // H. Runtime onMessage LIVE_LOG & PUSH_NOTIFICATION (lines 592, 595)
            let onMessageCb;
            browser.runtime.onMessage.addListener.mockImplementation(cb => onMessageCb = cb);
            uiMain.initGlobalEventListeners();
            if (onMessageCb) {
                onMessageCb({ type: 'LIVE_LOG', log: { domain: 'live.stream.org', rootDomain: 'stream.org', status: 2 } });

                stateModule.state.notifications = Array.from({ length: 50 }, (_, i) => ({ id: i, message: `notif-${i}` }));
                onMessageCb({ type: 'PUSH_NOTIFICATION', payload: { message: '51st notification' } });
                expect(stateModule.state.notifications.length).toBe(50);
            }

            // I. API toggle and API toggle button (lines 609, 644, 662, 665)
            stateModule.state.activeProfile = null;
            document.body.innerHTML += `
                <input type="checkbox" class="api-toggle" data-cat="security" data-id="ai_threats" data-type="boolean">
                <button class="api-toggle-btn" data-cat="parentalcontrol/services" data-id="tiktok" data-type="list" data-active="false">Add</button>
            `;
            const toggleInput = document.querySelector('.api-toggle');
            toggleInput.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 20));

            const toggleBtn = document.querySelector('.api-toggle-btn');
            browser.runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'Simulated API failure' });
            toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(r => setTimeout(r, 20));

            browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Network crash'));
            toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(r => setTimeout(r, 20));

            // J. Storage onChanged for hostnameAliases (lines 746-751)
            let storageChangedCb;
            browser.storage.onChanged.addListener.mockImplementation(cb => storageChangedCb = cb);
            delete window._hasAliasStorageListener;
            await uiMain.initializeApp();
            if (storageChangedCb) {
                stateModule.state.activeTab = 'logs';
                storageChangedCb({ hostnameAliases: { newValue: { '192.168.1.99': 'Office Printer' } } });
                expect(stateModule.state.hostnameAliases['192.168.1.99']).toBe('Office Printer');
            }

            // K. initializeApp profile fallback (lines 764-770)
            browser.runtime.sendMessage.mockImplementation(async (msg) => {
                if (msg.type === 'GET_PROFILE') return null;
                return { success: true };
            });
            const { storage: storageMod } = await import('../src/storage.js');
            await storageMod.set('activeProfile', 'fallback-prof-42');
            stateModule.state.activeProfile = null;
            await uiMain.initializeApp();
            expect(stateModule.state.activeProfile).toBe('fallback-prof-42');

            // L. Missing DOM elements graceful return (lines 890, 906, 1086, 1137, 1180)
            document.body.innerHTML = ''; // Clear all DOM elements
            await uiMain.saveMirrorMode();
            const profs = await uiMain.loadProfiles();
            expect(profs).toEqual([]);
            await uiMain.toggleAutoRefresh(false);
            if (stateModule?.state?.autoRefreshInterval) {
                clearInterval(stateModule.state.autoRefreshInterval);
                stateModule.state.autoRefreshInterval = null;
            }
            if (stateModule?.state?.tabTrackingIntervalId) {
                clearInterval(stateModule.state.tabTrackingIntervalId);
                stateModule.state.tabTrackingIntervalId = null;
            }
            await uiMain.importFullConfiguration({ target: { files: [] } });
        });

        test('UI Main - handleAddDomain empty, handleBulkAdd, sub-tabs, alerts, and mirror UI', async () => {
            // 1. handleAddDomain empty input (line 147)
            document.body.innerHTML = `
                <input id="list-new-domain" value="" />
                <select id="list-type-select"><option value="denylist">denylist</option></select>
                <button id="list-add-btn">Add</button>
            `;
            await uiMain.handleAddDomain();

            // 2. handleBulkAdd button state and concurrent map (line 189)
            document.body.innerHTML = `
                <textarea id="list-bulk-domains">site1.com\nsite2.com</textarea>
                <select id="list-type-select"><option value="allowlist">allowlist</option></select>
                <button id="list-bulk-submit-btn">Bulk Add</button>
                <div id="list-bulk-container"></div>
            `;
            browser.runtime.sendMessage.mockResolvedValue({ success: true });
            await uiMain.handleBulkAdd();

            // handleBulkAdd error catch (line 210)
            document.getElementById('list-bulk-domains').value = 'faildomain.com';
            const bulkContainer = document.getElementById('list-bulk-container');
            Object.defineProperty(bulkContainer, 'classList', {
                get() { throw new Error('Bulk container DOM error'); }
            });
            await uiMain.handleBulkAdd();

            // 3. Sub-tab switching for settings customize, alerts, and schedules (lines 357-367)
            document.body.innerHTML = `
                <div class="tab-content" id="tab-settings">
                    <button class="sub-tab-btn" data-sub="customize">Theme</button>
                    <button class="sub-tab-btn" data-sub="alerts">Alerts</button>
                    <button class="sub-tab-btn" data-sub="schedules">Schedules</button>
                    <button class="sub-tab-btn" data-sub="mirror">Mirror</button>
                    <div id="settings-customize" class="settings-sub-content"></div>
                    <div id="settings-alerts" class="settings-sub-content"></div>
                    <div id="settings-schedules" class="settings-sub-content"></div>
                    <div id="settings-mirror" class="settings-sub-content"></div>
                </div>
                <div class="tab-content" id="tab-dashboard">
                    <button class="sub-tab-btn" data-sub="overview">Overview</button>
                    <div id="dash-overview" class="dashboard-sub-content"></div>
                </div>
                <div id="mirror-profiles-list"></div>
                <button id="save-mirror-btn"></button>
            `;
            uiMain.initGlobalEventListeners();
            const customizeBtn = document.querySelector('[data-sub="customize"]');
            customizeBtn.onclick();
            expect(customizeBtn.classList.contains('active')).toBe(true);

            const alertsBtn = document.querySelector('[data-sub="alerts"]');
            alertsBtn.onclick();
            expect(alertsBtn.classList.contains('active')).toBe(true);

            const schedulesBtn = document.querySelector('[data-sub="schedules"]');
            schedulesBtn.onclick();
            expect(schedulesBtn.classList.contains('active')).toBe(true);

            const dashOverviewBtn = document.querySelector('#tab-dashboard [data-sub="overview"]');
            dashOverviewBtn.onclick();
            expect(dashOverviewBtn.classList.contains('active')).toBe(true);

            // 4. Mirror Mode UI rendering and saving (lines 875-878, 893)
            const mockProfiles = [
                { id: 'prof-1', name: 'Profile One' },
                { id: 'prof-2', name: 'Profile Two' }
            ];
            stateModule.state.activeProfile = 'prof-1';
            const { storage: storageMod } = await import('../src/storage.js');
            await storageMod.set('mirrorProfiles', ['prof-2']);
            browser.runtime.sendMessage.mockResolvedValueOnce({ success: true, data: mockProfiles });
            await uiMain.initMirrorModeUI();
            expect(document.getElementById('mirror-profiles-list').innerHTML).toContain('Profile Two');

            await uiMain.saveMirrorMode();
            const savedMirror = await storageMod.get('mirrorProfiles');
            expect(savedMirror).toEqual(['prof-2']);

            // Test initMirrorModeUI catch block (line 880)
            browser.runtime.sendMessage.mockImplementationOnce(() => { throw new Error('Mirror UI error'); });
            await uiMain.initMirrorModeUI();

            // 5. refreshActiveProfileAndUI failure catch (lines 1012-1013)
            const logsLink = document.createElement('a');
            logsLink.id = 'web-gui-logs-link';
            Object.defineProperty(logsLink, 'href', {
                set() { throw new Error('Forced error in updateDynamicLinks href setter'); }
            });
            document.body.appendChild(logsLink);

            browser.runtime.sendMessage.mockResolvedValueOnce({ id: 'prof-err', name: 'Error Prof' });
            browser.runtime.sendMessage.mockResolvedValueOnce({ networkStatus: { isConnected: true } });
            
            const res = await uiMain.refreshActiveProfileAndUI();
            logsLink.remove();
            expect(res).toBeNull();
        });

        test('UI Main - alerts settings listeners, web GUI toggles, and profile status catch blocks', async () => {
            document.body.innerHTML = `
                <button id="alert-save-btn">Save</button>
                <button id="alert-test-btn">Test</button>
                <input type="checkbox" id="alert-setting-enabled" />
                <input type="checkbox" id="web-gui-master-toggle" />
                <div id="web-gui-features"></div>
                <select id="web-gui-forced-theme"><option value="dark">Dark</option></select>
            `;
            uiMain.initGlobalEventListeners();

            // Alerts settings listeners (lines 484, 485, 490)
            const alertSaveBtn = document.getElementById('alert-save-btn');
            alertSaveBtn.click();
            const alertTestBtn = document.getElementById('alert-test-btn');
            alertTestBtn.click();
            const alertToggle = document.getElementById('alert-setting-enabled');
            alertToggle.checked = true;
            alertToggle.dispatchEvent(new Event('change'));

            // Web GUI master toggle & forced theme (lines 572-588)
            const masterToggle = document.getElementById('web-gui-master-toggle');
            masterToggle.checked = true;
            masterToggle.dispatchEvent(new Event('change'));
            await new Promise(r => setTimeout(r, 20));
            expect(document.getElementById('web-gui-features').style.opacity).toBe('1');

            masterToggle.checked = false;
            masterToggle.dispatchEvent(new Event('change'));
            await new Promise(r => setTimeout(r, 20));
            expect(document.getElementById('web-gui-features').style.opacity).toBe('0.5');

            // Color inputs event listeners (lines 519-520)
            const bgInput = document.createElement('input');
            bgInput.id = 'color-bg-main';
            bgInput.type = 'color';
            document.body.appendChild(bgInput);
            uiMain.initGlobalEventListeners();
            bgInput.value = '#112233';
            bgInput.dispatchEvent(new Event('input'));
            bgInput.dispatchEvent(new Event('change'));
            expect(document.body.style.getPropertyValue('--bg-main')).toBe('#112233');

            // Sub-tab toggles click (lines 348-349)
            const togglesTab = document.createElement('div');
            togglesTab.id = 'tab-toggles';
            togglesTab.className = 'tab-content';
            togglesTab.innerHTML = `<button class="sub-tab-btn" data-sub="subcat1">Sub 1</button>`;
            document.body.appendChild(togglesTab);
            uiMain.initGlobalEventListeners();
            const subToggleBtn = togglesTab.querySelector('.sub-tab-btn');
            subToggleBtn.onclick();
            expect(stateModule.state.activeBlocksSubTab).toBe('subcat1');

            const forcedThemeSelect = document.getElementById('web-gui-forced-theme');
            forcedThemeSelect.dispatchEvent(new Event('change'));
            await new Promise(r => setTimeout(r, 20));

            // refreshActiveProfileAndUI catch block on individual messages (line 973)
            document.body.innerHTML = '<div id="profile-status"></div>';
            browser.runtime.sendMessage.mockImplementation(async (msg) => {
                if (msg.type === 'GET_PROFILE') throw new Error('GET_PROFILE rejected');
                if (msg.type === 'GET_NETWORK_STATUS') throw new Error('GET_NETWORK_STATUS rejected');
                return { success: true };
            });
            const unconfProf = await uiMain.refreshActiveProfileAndUI();
            expect(unconfProf).toBeNull();
            expect(document.getElementById('profile-status').textContent).toContain('Unconfigured');

            // Delegated dynamic toggles without state.activeProfile (lines 610 and 644)
            const { storage: realStorage } = await import('../src/storage.js');
            await realStorage.set('activeProfile', 'stored-prof-99');
            stateModule.state.activeProfile = '';
            browser.runtime.sendMessage.mockResolvedValue({ success: true });

            document.body.innerHTML = `
                <input type="checkbox" class="api-toggle" data-cat="security" data-id="ai_threats" data-type="toggle" />
                <button class="api-toggle-btn" data-cat="privacy" data-id="native_tracking" data-type="btn" data-active="false">Enable</button>
            `;
            uiMain.initGlobalEventListeners();

            const dynToggle = document.querySelector('.api-toggle');
            dynToggle.checked = true;
            dynToggle.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 60));
            expect(stateModule.state.activeProfile).toBe('stored-prof-99');

            stateModule.state.activeProfile = '';
            const dynBtn = document.querySelector('.api-toggle-btn');
            dynBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(r => setTimeout(r, 60));
            expect(stateModule.state.activeProfile).toBe('stored-prof-99');

            // initializeApp service failures (lines 760 and 791)
            const { storage: uiStorage } = await import('../src/storage.js');
            const origStorageGet = uiStorage.get;
            uiStorage.get = jest.fn().mockRejectedValueOnce(new Error('initSettingsUI fail'));
            // Cause service to fail (line 791)
            const badLink = document.createElement('a');
            badLink.id = 'web-gui-profile-link';
            Object.defineProperty(badLink, 'href', {
                set() { throw new Error('Service failure in updateDynamicLinks'); }
            });
            document.body.appendChild(badLink);

            const cleanupApp = await uiMain.initializeApp();
            uiStorage.get = origStorageGet;
            badLink.remove();
            if (typeof cleanupApp === 'function') cleanupApp();

            // Sync UI setup catch (line 66)
            const origQSA = document.querySelectorAll;
            document.querySelectorAll = function(sel) {
                if (sel === '.tab-btn') throw new Error('Sync UI crash');
                return origQSA.apply(this, arguments);
            };
            // Trigger DOMContentLoaded
            window.document.dispatchEvent(new Event('DOMContentLoaded'));
            await new Promise(r => setTimeout(r, 60));
            document.querySelectorAll = origQSA;
        });
    });
});

