/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../src/popup.html'), 'utf8');

describe('Popup UI - Advanced Coverage Suite', () => {
  let mockStorage;
  let mockRuntimeSendMessage;
  
  beforeEach(() => {
    document.documentElement.innerHTML = html;
    jest.resetModules();
    jest.clearAllMocks();

    mockStorage = {
      apiKey: 'test-key',
      activeProfile: 'profile123',
      activeProfileName: 'Test Profile',
      autoRefreshDefault: false,
      enableLabs: true,
      customThemes: {},
      uiTheme: 'default-dark',
      autoRefreshTime: 5
    };

    mockRuntimeSendMessage = jest.fn(async (msg) => {
      if (msg.type === 'GET_PROFILE') return { id: 'profile123', name: 'Test Profile' };
      if (msg.type === 'MANAGE_DOMAIN' && msg.action === 'list') {
        return { data: [{ id: 'item.com' }] };
      }
      if (msg.type === 'GET_TAB_STATS') return { requests: {}, blockedCount: 0 };
      if (msg.type === 'GET_LOGS') {
        return {
          success: true,
          data: [
            { domain: 'allowed.com', status: 'allowed', timestamp: 1716800000000 },
            { domain: 'blocked.com', status: 'blocked', timestamp: 1716800000000, reasons: [{ name: 'Deny List' }] },
            { domain: 'whitelisted.com', status: 'whitelisted', timestamp: 1716800000000, reasons: [{ name: 'Allow List' }] }
          ]
        };
      }
      if (msg.type === 'GET_ALL_SETTINGS') return { 
        success: true, 
        data: { security: {}, privacy: {}, parentalcontrol: {}, services: [], categories: [], natives: [], blocklists: [], tlds: [] } 
      };
      return { success: true, data: [] };
    });

    global.browser = {
      storage: {
        sync: {
          get: jest.fn(keys => {
            if (keys === null) return Promise.resolve(mockStorage);
            if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
            if (Array.isArray(keys)) {
              let res = {};
              keys.forEach(k => res[k] = mockStorage[k]);
              return Promise.resolve(res);
            }
            return Promise.resolve(mockStorage);
          }),
          set: jest.fn(obj => {
            Object.assign(mockStorage, obj);
            return Promise.resolve();
          })
        },
        local: {
          get: jest.fn(keys => {
            if (keys === null) return Promise.resolve(mockStorage);
            if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
            if (Array.isArray(keys)) {
              let res = {};
              keys.forEach(k => res[k] = mockStorage[k]);
              return Promise.resolve(res);
            }
            return Promise.resolve(mockStorage);
          }),
          set: jest.fn(obj => {
            Object.assign(mockStorage, obj);
            return Promise.resolve();
          })
        },
        onChanged: { addListener: jest.fn() }
      },
      action: {
        setPopup: jest.fn().mockResolvedValue({})
      },
      runtime: {
        sendMessage: mockRuntimeSendMessage,
        onMessage: { addListener: jest.fn() }
      },
      tabs: {
        onActivated: { addListener: jest.fn() },
        onUpdated: { addListener: jest.fn() },
        query: jest.fn().mockResolvedValue([{ id: 99, url: 'https://example.com' }]),
        reload: jest.fn().mockResolvedValue()
      },
      windows: {
        getCurrent: jest.fn().mockResolvedValue({ left: 0, top: 0, width: 800 }),
        create: jest.fn().mockResolvedValue({ id: 2 }),
        update: jest.fn().mockResolvedValue()
      },
      sidebarAction: { open: jest.fn().mockResolvedValue() }
    };
    
    window.close = jest.fn();
    global.alert = jest.fn();
    global.confirm = jest.fn().mockReturnValue(true);
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:test');

    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes('blocks_meta.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            blocklists: [{ id: 'test', name: 'Test Blocklist', description: 'desc', entries: 100, updated: 'now' }],
            categories: [],
            services: [],
            tlds: ['com']
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  test('Sub-nav Scoping', async () => {
    global.storage = require('../src/storage.js');
    require('../src/popup.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise(r => setTimeout(r, 100));

    document.querySelector('.tab-btn[data-tab="toggles"]').click();
    await new Promise(r => setTimeout(r, 100));

    const privacyBtn = document.querySelector('#blocks-sub-nav .sub-tab-btn[data-sub="privacy"]');
    privacyBtn.click();
    await new Promise(r => setTimeout(r, 100));

    expect(privacyBtn.classList.contains('active')).toBe(true);
    const setupBtn = document.querySelector('#settings-sub-nav .sub-tab-btn[data-sub="setup"]');
    expect(setupBtn.classList.contains('active')).toBe(true);
  });

  test('Log Filter State interaction', async () => {
    global.storage = require('../src/storage.js');
    require('../src/popup.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise(r => setTimeout(r, 300));

    // Ensure tab is active so listeners are bound
    const logsTab = document.querySelector('.tab-btn[data-tab="logs"]');
    logsTab.click();
    await new Promise(r => setTimeout(r, 300));

    // Force check all status filters to ensure logs render
    const filters = document.querySelectorAll('#status-filter-content input');
    filters.forEach(i => {
      i.checked = true;
      i.setAttribute('checked', 'checked'); // Extra insurance for JSDOM
    });

    // Re-render logs after checking filters
    const statusFilters = document.getElementById("status-filter-content");
    if (statusFilters) statusFilters.dispatchEvent(new Event('change'));
    
    await new Promise(r => setTimeout(r, 300));

    const logsContainer = document.getElementById('logs-container');
    expect(logsContainer).not.toBeNull();
    
    // We check for the presence of ANY log entry to verify the rendering engine is alive
    const rows = logsContainer.querySelectorAll('.log-row');
    expect(rows.length).toBeGreaterThan(0);
  });

  test('Defensive Rendering Resilience', async () => {
    mockRuntimeSendMessage.mockImplementation(async (msg) => {
      if (msg.type === 'GET_LOGS') return { data: [{ domain: 'ok.com', status: 'allowed' }, null, { status: 'blocked' }] };
      if (msg.type === 'GET_PROFILE') return { id: 'p', name: 'p' };
      if (msg.type === 'MANAGE_DOMAIN' && msg.action === 'list') return { data: [] };
      return { success: true };
    });

    global.storage = require('../src/storage.js');
    require('../src/popup.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise(r => setTimeout(r, 100));

    document.querySelector('.tab-btn[data-tab="logs"]').click();
    await new Promise(r => setTimeout(r, 200));

    const container = document.getElementById('logs-container');
    // Verify that the UI doesn't crash and renders SOMETHING (either logs or empty state)
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
