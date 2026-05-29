/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

describe('Storage Persistence & Auto-Heal', () => {
  let mockSync = {};
  let mockLocal = {};
  let storageListeners = [];

  beforeEach(() => {
    jest.resetModules();
    mockSync = { apiKey: 'sync-key-123', webGuiMaster: true };
    mockLocal = {}; // Simulate fresh install
    storageListeners = [];

    global.browser = {
      storage: {
        sync: {
          get: jest.fn(keys => {
            if (keys === null) return Promise.resolve(mockSync);
            if (typeof keys === 'string') return Promise.resolve({ [keys]: mockSync[keys] });
            const res = {};
            (keys || []).forEach(k => res[k] = mockSync[k]);
            return Promise.resolve(res);
          }),
          set: jest.fn(obj => {
            const changes = {};
            for (let [k, v] of Object.entries(obj)) {
                changes[k] = { oldValue: mockSync[k], newValue: v };
                mockSync[k] = v;
            }
            storageListeners.forEach(l => l(changes, 'sync'));
            return Promise.resolve();
          })
        },
        local: {
          get: jest.fn(keys => {
            if (keys === null) return Promise.resolve(mockLocal);
            if (typeof keys === 'string') return Promise.resolve({ [keys]: mockLocal[keys] });
            const res = {};
            (keys || []).forEach(k => res[k] = mockLocal[k]);
            return Promise.resolve(res);
          }),
          set: jest.fn(obj => {
            const changes = {};
            for (let [k, v] of Object.entries(obj)) {
                changes[k] = { oldValue: mockLocal[k], newValue: v };
                mockLocal[k] = v;
            }
            storageListeners.forEach(l => l(changes, 'local'));
            return Promise.resolve();
          })
        },
        onChanged: {
          addListener: jest.fn(l => storageListeners.push(l))
        }
      },
      tabs: {
        onRemoved: { addListener: jest.fn() },
        onActivated: { addListener: jest.fn() },
        onUpdated: { addListener: jest.fn() },
        query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }])
      },
      action: {
        setPopup: jest.fn().mockResolvedValue({}),
        setIcon: jest.fn().mockResolvedValue({}),
        setBadgeText: jest.fn().mockResolvedValue({}),
        onClicked: { addListener: jest.fn() }
      },
      runtime: {
        getURL: jest.fn(path => path),
        onMessage: { addListener: jest.fn() },
        sendMessage: jest.fn().mockResolvedValue({ success: true })
      },
      alarms: {
        create: jest.fn(),
        onAlarm: { addListener: jest.fn() }
      },
      webRequest: {
        onBeforeRequest: { addListener: jest.fn(), hasListener: jest.fn(() => false) }
      },
      notifications: { create: jest.fn() },
      menus: { 
        removeAll: jest.fn().mockResolvedValue(), 
        create: jest.fn(),
        onClicked: { addListener: jest.fn() }
      },
      sidebarAction: { open: jest.fn().mockResolvedValue({}) }
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ profile: 'p1', data: [{ id: 'p1', name: 'Test' }] })
    });

    global.console.log = jest.fn();
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:test');
  });

  test('Background: Heals local storage from sync on startup', async () => {
    const backgroundJs = fs.readFileSync(path.resolve(__dirname, '../background.js'), 'utf8');
    global.storage = require('../src/storage.js');
    global.apiClient = require('../src/apiClient.js');
    global.apiClient.setStorage(global.storage);
    eval(backgroundJs);

    // Give it time to run initializeBackground
    await new Promise(r => setTimeout(r, 100));

    expect(mockLocal.apiKey).toBe('sync-key-123');
    expect(mockLocal.webGuiMaster).toBe(true);
  });

  test('Popup: Auto-heals local storage from sync', async () => {
    // Mock enough DOM for initializeApp
    document.body.innerHTML = `
        <div id="tab-btn-labs"></div>
        <input id="setting-api-key">
        <div id="web-gui-features"></div>
        <input id="web-gui-master-toggle">
        <button id="allow-btn"></button>
        <button id="deny-btn"></button>
        <button id="snooze-btn"></button>
    `;

    
    // Require popup.js (it will run initializeApp)
    global.storage = require('../src/storage.js');
    require('../popup.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    
    await new Promise(r => setTimeout(r, 100));

    expect(mockLocal.apiKey).toBe('sync-key-123');
  });

  test('Content Script: Auto-extracts API key and syncs to both areas', async () => {
    // Clear mocks for this specific test
    mockSync = {};
    mockLocal = {};
    
    const realLookingKey = 'a1b2c3d4e5f6a1b2c3d4e5f6';
    document.body.innerHTML = `<div><code>${realLookingKey}</code></div>`;
    
    delete window.location;
    window.location = { pathname: '/abcd/account' };

    const content = require('../content.js');
    await content.evaluatePage();
    
    await new Promise(r => setTimeout(r, 100));

    expect(mockSync.apiKey).toBe(realLookingKey);
    expect(mockLocal.apiKey).toBe(realLookingKey);
  });
});
