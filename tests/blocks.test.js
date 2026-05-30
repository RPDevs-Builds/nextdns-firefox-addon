/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../src/popup.html'), 'utf8');

describe('Popup UI - Blocks Expansion Suite', () => {
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
      uiTheme: 'default-dark'
    };

    mockRuntimeSendMessage = jest.fn(async (msg) => {
      if (msg.type === 'GET_PROFILE') return { id: 'profile123', name: 'Test Profile' };
      if (msg.type === 'MANAGE_DOMAIN' && msg.action === 'list') {
        return { data: [{ id: 'item.com' }] };
      }
      if (msg.type === 'GET_ALL_SETTINGS') return { 
        success: true, 
        data: { 
          security: { dga: true, nrd: false }, 
          privacy: { disguisedTrackers: true }, 
          parentalcontrol: { safeSearch: true },
          services: [{ id: 'tiktok', active: true }],
          categories: [{ id: 'porn', active: true }],
          natives: [{ id: 'windows', active: true }],
          blocklists: [{ id: 'nextdns-recommended', name: 'NextDNS Ads & Trackers Blocklist' }],
          tlds: [{ id: 'com' }, { id: 'co.uk' }]
        } 
      };
      return { success: true };
    });

    global.browser = {
      runtime: {
        getURL: jest.fn(path => path),
        sendMessage: mockRuntimeSendMessage,
        onMessage: { addListener: jest.fn() }
      },
      storage: {
        sync: {
          get: jest.fn(keys => {
            if (keys === null) return Promise.resolve(mockStorage);
            if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
            return Promise.resolve(mockStorage);
          }),
          set: jest.fn(obj => { Object.assign(mockStorage, obj); return Promise.resolve(); })
        },
        local: {
          get: jest.fn(keys => {
            if (keys === null) return Promise.resolve(mockStorage);
            if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
            return Promise.resolve(mockStorage);
          }),
          set: jest.fn(obj => { Object.assign(mockStorage, obj); return Promise.resolve(); })
        },
        onChanged: { addListener: jest.fn() }
      },
      action: {
        setPopup: jest.fn().mockResolvedValue({})
      },
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 1 }]),
        onActivated: { addListener: jest.fn() },
        onUpdated: { addListener: jest.fn() }
      }
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        blocklists: [{ id: 'nextdns-recommended', name: 'NextDNS Ads & Trackers Blocklist', description: 'desc', entries: '100', updated: 'now' }],
        parental_services: [{ id: 'tiktok', name: 'TikTok' }, { id: 'facebook', name: 'Facebook' }],
        tlds: ['com', 'org', 'co.uk'],
        categories: [{ id: 'porn', name: 'Porn' }]
      })
    });
    
    global.URL.createObjectURL = jest.fn();
  });

  test('Blocks UI - TLD Alphabetization and Multi-inclusion', async () => {
    global.storage = require('../src/storage.js');
    require('../src/popup.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise(r => setTimeout(r, 100));

    // Navigate to Toggles -> TLDs
    document.querySelector('.tab-btn[data-tab="toggles"]').click();
    document.querySelector('.sub-tab-btn[data-sub="tlds"]').click();
    await new Promise(r => setTimeout(r, 100));

    const container = document.getElementById('toggles-container');
    
    // Check for 'C' group (from 'com' and 'co.uk')
    const cGroup = document.getElementById('tld-group-C');
    expect(cGroup).not.toBeNull();
    const cHeader = cGroup.querySelector('strong');
    expect(cHeader.textContent).toBe('C');
    
    // Check for 'U' group (from 'co.uk')
    const uGroup = document.getElementById('tld-group-U');
    expect(uGroup).not.toBeNull();
    
    // Verify .co.uk is in both
    const coUkInC = Array.from(cGroup.querySelectorAll('span')).find(el => el.textContent === '.co.uk');
    const coUkInU = Array.from(uGroup.querySelectorAll('span')).find(el => el.textContent === '.co.uk');
    expect(coUkInC).not.toBeUndefined();
    expect(coUkInU).not.toBeUndefined();
  });

  test('Blocks UI - Blocklists Management and Search', async () => {
    global.storage = require('../src/storage.js');
    require('../src/popup.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise(r => setTimeout(r, 100));

    document.querySelector('.tab-btn[data-tab="toggles"]').click();
    document.querySelector('.sub-tab-btn[data-sub="blocklists"]').click();
    await new Promise(r => setTimeout(r, 100));

    const container = document.getElementById('toggles-container');
    const searchInput = document.getElementById('blocks-search-input');

    // Initial render
    expect(container.textContent).toContain('NextDNS Ads & Trackers Blocklist');

    // Search for something non-existent
    searchInput.value = 'zxcvbnm';
    searchInput.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 100));
    expect(container.textContent).not.toContain('NextDNS Ads & Trackers Blocklist');
  });

  test('Blocks UI - Parental Categories and Services', async () => {
    global.storage = require('../src/storage.js');
    require('../src/popup.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise(r => setTimeout(r, 100));

    document.querySelector('.tab-btn[data-tab="toggles"]').click();
    document.querySelector('.sub-tab-btn[data-sub="parental"]').click();
    await new Promise(r => setTimeout(r, 100));

    const container = document.getElementById('toggles-container');
    expect(container.textContent).toContain('Categories');
    expect(container.textContent).toContain('Porn');
    expect(container.textContent).toContain('Services');
    expect(container.textContent).toContain('TikTok');
  });

  test('Security Tab - Missing Settings Present', async () => {
    global.storage = require('../src/storage.js');
    require('../src/popup.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise(r => setTimeout(r, 100));

    document.querySelector('.tab-btn[data-tab="toggles"]').click();
    document.querySelector('.sub-tab-btn[data-sub="security"]').click();
    await new Promise(r => setTimeout(r, 100));

    const container = document.getElementById('toggles-container');
    
    expect(container.textContent).toContain('Domain Generation Algorithms (DGAs) Protection');
    expect(container.textContent).toContain('Block Newly Registered Domains (NRDs)');
    expect(container.textContent).toContain('Block Parked Domains');
  });
});
