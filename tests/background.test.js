/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('Background Script - Full Coverage Suite', () => {
  let blockingListenerRef;
  let tabUpdatedListenerRef;
  let tabRemovedListenerRef;
  let messageHandlerRef;
  let menuClickListenerRef;
  let storageListenerRef;
  let mockStorage;
  let fetchMock;
  let bg;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    mockStorage = {
      apiKey: 'test-key',
      activeProfile: 'profile123',
      overrideProfileId: '',
      regexBlocklist: '.*malware.*\n.*tracker.*',
      enableLabs: true,
      iconAction: 'popup'
    };

    fetchMock = jest.fn(async (url, options) => {
      if (url.includes('/profiles/profile123/allowlist') && options?.method === 'GET') {
        return { ok: true, json: async () => ({ data: [{ id: 'good.com' }] }) };
      }
      if (url.includes('/profiles/profile123/denylist') && options?.method === 'GET') {
        return { ok: true, json: async () => ({ data: [{ id: 'bad.com' }] }) };
      }
      if (url.includes('/profiles') && !url.includes('profile123') && options?.method === 'GET') {
        return { ok: true, json: async () => ({ data: [{ id: 'profile123', name: 'Test Profile' }] }) };
      }
      if (url === 'https://test.nextdns.io/') {
        return { ok: true, json: async () => ({ profile: 'profile123' }) };
      }
      if (options?.method === 'POST' || options?.method === 'DELETE' || options?.method === 'PATCH') {
        return { ok: true };
      }
      return { ok: false, statusText: 'Not Found', json: async () => ({}) };
    });
    global.fetch = fetchMock;

    global.browser = {
      menus: {
        removeAll: jest.fn(),
        create: jest.fn(),
        onClicked: { addListener: jest.fn(cb => menuClickListenerRef = cb) }
      },
      action: {
        setPopup: jest.fn(),
        onClicked: { addListener: jest.fn() }
      },
      sidebarAction: {
        open: jest.fn()
      },
      storage: {
        sync: {
          get: jest.fn(keys => {
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
        onChanged: {
          addListener: jest.fn(cb => storageListenerRef = cb),
          removeListener: jest.fn()
        }
      },
      runtime: {
        onInstalled: { addListener: jest.fn() },
        onStartup: { addListener: jest.fn() },
        openOptionsPage: jest.fn(),
        onMessage: {
          addListener: jest.fn(cb => messageHandlerRef = cb)
        }
      },
      alarms: {
        create: jest.fn(),
        onAlarm: { addListener: jest.fn() }
      },
      webRequest: {
        onBeforeRequest: {
          hasListener: jest.fn().mockReturnValue(false),
          addListener: jest.fn(cb => blockingListenerRef = cb),
          removeListener: jest.fn()
        }
      },
      tabs: {
        onUpdated: { addListener: jest.fn(cb => tabUpdatedListenerRef = cb) },
        onRemoved: { addListener: jest.fn(cb => tabRemovedListenerRef = cb) }
      }
    };

    const { storage } = await import('../src/storage.js');
    const { apiClient } = await import('../src/apiClient.js');
    const { state } = await import('../src/background/state.js');
    
    global.storage = storage;
    global.apiClient = apiClient;
    global.apiClient.setStorage(global.storage);
    
    // ESM cache workaround for tests
    state.isInitialized = false;
    storage.initialized = false;
    storage.initPromise = null;
    
    bg = await import('../src/background/main.js');
  });

  test('Initialization sequence', async () => {
    await bg.initializeBackground();
    expect(global.browser.menus.removeAll).toHaveBeenCalled();
    expect(global.browser.menus.create).toHaveBeenCalled();
    expect(global.browser.webRequest.onBeforeRequest.addListener).toHaveBeenCalled();
  });

  test('Profile Detection', async () => {
    const { detectActiveProfile } = await import('../src/background/api.js');
    mockStorage.activeProfile = '';
    mockStorage.overrideProfileId = '';
    global.storage.cache = { ...mockStorage };
    await detectActiveProfile();
    expect(fetchMock).toHaveBeenCalledWith('https://test.nextdns.io/', expect.any(Object));
    expect(mockStorage.activeProfile).toBe('profile123');
  });

  test('Message Handler - MANAGE_DOMAIN (Add)', async () => {
    await bg.initializeBackground();
    const response = await new Promise(resolve => {
      messageHandlerRef({ type: 'MANAGE_DOMAIN', profileId: 'profile123', listType: 'allowlist', domain: 'example.com', action: 'add' }, {}, resolve);
    });
    expect(response).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/allowlist'), expect.objectContaining({ method: 'POST' }));
  });

  test('Message Handler - MANAGE_DOMAIN (Delete)', async () => {
    await bg.initializeBackground();
    const response = await new Promise(resolve => {
      messageHandlerRef({ type: 'MANAGE_DOMAIN', profileId: 'profile123', listType: 'denylist', domain: 'bad.com', action: 'delete' }, {}, resolve);
    });
    expect(response).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/denylist/bad.com'), expect.objectContaining({ method: 'DELETE' }));
  });

  test('Network Request Listener - Color Coding & Blocking', async () => {
    await bg.initializeBackground();
    expect(blockingListenerRef).toBeDefined();

    // Trigger main_frame event to initialize tab
    blockingListenerRef({ url: 'https://example.com', tabId: 99, type: 'main_frame' });
    
    // Test explicitly allowed domain
    const allowRes = blockingListenerRef({ url: 'https://good.com/script.js', tabId: 99 });
    expect(allowRes).toEqual({ cancel: false });

    // Test explicitly denied domain
    const denyRes = blockingListenerRef({ url: 'https://bad.com/tracker.js', tabId: 99 });
    expect(denyRes).toEqual({ cancel: true });

    // Fetch tab stats
    const stats = await new Promise(resolve => {
      messageHandlerRef({ type: 'GET_TAB_STATS', tabId: 99 }, {}, resolve);
    });

    expect(stats.blockedCount).toBe(1);
    expect(stats.requests['good.com']).toMatchObject({ status: 'allowed', reason: 'Allow List' });
    expect(stats.requests['bad.com']).toMatchObject({ status: 'blocked', reason: 'Deny List' });
  });

  test('Tab Lifecycle - Memory Cleanup', async () => {
    await bg.initializeBackground();
    blockingListenerRef({ url: 'https://example.com', tabId: 101, type: 'main_frame' });
    
    let stats = await new Promise(resolve => messageHandlerRef({ type: 'GET_TAB_STATS', tabId: 101 }, {}, resolve));
    expect(stats.requests['example.com']).toBeDefined();

    // Remove tab
    tabRemovedListenerRef(101);

    stats = await new Promise(resolve => messageHandlerRef({ type: 'GET_TAB_STATS', tabId: 101 }, {}, resolve));
    expect(stats.requests).toEqual({});
  });

  test('Context Menus - Allow/Deny Actions', async () => {
    await bg.initializeBackground();
    expect(menuClickListenerRef).toBeDefined();

    // Click allow on a link
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'https://new-good.com/path' }, { id: 1 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/allowlist'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ id: 'new-good.com' }) }));

    // Click deny on a page
    await menuClickListenerRef({ menuItemId: 'dns-forge-deny', pageUrl: 'https://new-bad.com' }, { id: 1 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/denylist'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ id: 'new-bad.com' }) }));
  });

  test('Message Handler - TOGGLE_SETTING', async () => {
    await bg.initializeBackground();
    
    // Toggle Boolean (PATCH)
    const boolRes = await new Promise(resolve => {
      messageHandlerRef({ type: 'TOGGLE_SETTING', profileId: 'profile123', category: 'privacy', id: 'disguisedTrackers', action: 'add', settingType: 'boolean' }, {}, resolve);
    });
    expect(boolRes.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/privacy'), expect.objectContaining({ method: 'PATCH' }));

    // Toggle Service (POST)
    const srvAddRes = await new Promise(resolve => {
      messageHandlerRef({ type: 'TOGGLE_SETTING', profileId: 'profile123', category: 'parentalcontrol/services', id: 'tiktok', action: 'add', settingType: 'list' }, {}, resolve);
    });
    expect(srvAddRes.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/parentalcontrol/services'), expect.objectContaining({ method: 'POST' }));
  });
});
