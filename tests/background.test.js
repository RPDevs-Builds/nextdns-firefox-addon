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
  let actionClickListenerRef;
  let alarmListenerRef;
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
        onClicked: { addListener: jest.fn(cb => actionClickListenerRef = cb) }
      },
      sidebarAction: {
        open: jest.fn()
      },
      windows: {
        create: jest.fn()
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
        id: 'dns-forge-extension-id',
        getURL: jest.fn(path => `moz-extension://dns-forge-extension-id/${path}`),
        onInstalled: { addListener: jest.fn() },
        onStartup: { addListener: jest.fn() },
        openOptionsPage: jest.fn(),
        onMessage: {
          addListener: jest.fn(cb => messageHandlerRef = cb)
        }
      },
      alarms: {
        create: jest.fn(),
        onAlarm: { addListener: jest.fn(cb => alarmListenerRef = cb) }
      },
      webRequest: {
        onBeforeRequest: {
          hasListener: jest.fn().mockReturnValue(false),
          addListener: jest.fn(cb => blockingListenerRef = cb),
          removeListener: jest.fn()
        }
      },
      tabs: {
        create: jest.fn(),
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
    expect(fetchMock).toHaveBeenCalledWith('https://test.nextdns.io/', expect.objectContaining({
      headers: expect.objectContaining({ 'Accept': 'application/json' })
    }));
    expect(mockStorage.activeProfile).toBe('profile123');
  });

  test('Profile Detection - Deduplicates concurrent in-flight requests', async () => {
    const { detectActiveProfile, _resetDetectInFlight } = await import('../src/background/api.js');
    _resetDetectInFlight();
    mockStorage.activeProfile = '';
    mockStorage.overrideProfileId = '';
    global.storage.cache = { ...mockStorage };
    fetchMock.mockClear();

    const [p1, p2] = await Promise.all([detectActiveProfile(), detectActiveProfile()]);
    expect(p1).toEqual(p2);
    // test.nextdns.io should only be fetched once despite concurrent calls
    const testCalls = fetchMock.mock.calls.filter(c => c[0] === 'https://test.nextdns.io/');
    expect(testCalls.length).toBe(1);
  });

  test('Profile Detection - Single profile matches fp fingerprint when connected', async () => {
    const { detectActiveProfile, _resetDetectInFlight } = await import('../src/background/api.js');
    _resetDetectInFlight();
    mockStorage.activeProfile = '';
    mockStorage.overrideProfileId = '';
    global.storage.cache = { ...mockStorage };

    // Mock test.nextdns.io returning a random fingerprint string
    fetchMock.mockImplementation(async (url, options) => {
      if (url.includes('/profiles') && !url.includes('profile123') && (!options?.method || options?.method === 'GET')) {
        return { ok: true, json: async () => ({ data: [{ id: 'singleProf', name: 'Home Network' }] }) };
      }
      if (url === 'https://test.nextdns.io/') {
        return { ok: true, json: async () => ({ status: 'ok', profile: 'fp9988776655443322' }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const prof = await detectActiveProfile();
    expect(prof.id).toBe('singleProf');
    expect(prof.name).toBe('Home Network (singleProf)');
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

    // Test clearing tab stats
    const clearRes = await new Promise(resolve => {
      messageHandlerRef({ type: 'CLEAR_TAB_STATS', tabId: 99 }, {}, resolve);
    });
    expect(clearRes).toEqual({ success: true });

    const clearedStats = await new Promise(resolve => {
      messageHandlerRef({ type: 'GET_TAB_STATS', tabId: 99 }, {}, resolve);
    });
    expect(clearedStats.blockedCount).toBe(0);
    expect(clearedStats.requests).toEqual({});
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

  test('Tab Lifecycle - LRU 300 domain limit per tab', async () => {
    await bg.initializeBackground();
    blockingListenerRef({ url: 'https://domain0.com/page', tabId: 102, type: 'main_frame' });
    
    for (let i = 1; i < 305; i++) {
      blockingListenerRef({ url: `https://domain${i}.com/page`, tabId: 102, type: 'sub_frame' });
    }
    
    const stats = await new Promise(resolve => messageHandlerRef({ type: 'GET_TAB_STATS', tabId: 102 }, {}, resolve));
    const trackedDomains = Object.keys(stats.requests);
    expect(trackedDomains.length).toBe(300);
    expect(stats.requests['domain0.com']).toBeUndefined();
    expect(stats.requests['domain304.com']).toBeDefined();
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

  test('Context Menus - Rejects non-HTTP/HTTPS URLs and malformed links', async () => {
    await bg.initializeBackground();
    await new Promise(r => setTimeout(r, 50));
    fetchMock.mockClear();

    // Non-http schemes
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'about:blank' }, { id: 1 });
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'ftp://ftp.example.com' }, { id: 1 });
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'javascript:alert(1)' }, { id: 1 });
    // Malformed URL
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'not_a_valid_url' }, { id: 1 });

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/allowlist'), expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/denylist'), expect.anything());
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

    // Internal extension page in a tab (e.g. Android or tab mode) should succeed
    const tabExtRes = await new Promise(resolve => {
      messageHandlerRef(
        { type: 'TOGGLE_SETTING', profileId: 'profile123', category: 'privacy', id: 'disguisedTrackers', action: 'delete', settingType: 'boolean' },
        { tab: { id: 5 }, url: 'moz-extension://test-uuid/src/popup.html?mode=tab' },
        resolve
      );
    });
    expect(tabExtRes.success).toBe(true);

    // Untrusted web tab content script should be blocked
    const webTabRes = await new Promise(resolve => {
      messageHandlerRef(
        { type: 'TOGGLE_SETTING', profileId: 'profile123', category: 'privacy', id: 'disguisedTrackers', action: 'add', settingType: 'boolean' },
        { tab: { id: 5 }, url: 'https://my.nextdns.io/setup' },
        resolve
      );
    });
    expect(webTabRes.success).toBe(false);
    expect(webTabRes.error).toBe('Unauthorized action from web tab');

    // Fallback profile resolution from storage if msg.profileId is omitted
    await storage.set('activeProfile', 'storedProfile99');
    const fallbackRes = await new Promise(resolve => {
      messageHandlerRef(
        { type: 'TOGGLE_SETTING', category: 'privacy', id: 'disguisedTrackers', action: 'add', settingType: 'boolean' },
        {},
        resolve
      );
    });
    expect(fallbackRes.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/profiles/storedProfile99/privacy'), expect.anything());
  });

  test('Message Handler - TEMP_ALLOW with custom duration', async () => {
    await bg.initializeBackground();

    const tempRes = await new Promise(resolve => {
      messageHandlerRef({ type: 'TEMP_ALLOW', profileId: 'profile123', domain: 'temp-work.org', durationInMinutes: 15 }, {}, resolve);
    });

    expect(tempRes.success).toBe(true);
    expect(global.browser.alarms.create).toHaveBeenCalledWith(
      expect.stringContaining('tempAllow?'),
      { delayInMinutes: 15 }
    );
  });

  test('Message Handler - MANAGE_DOMAIN with Mirror Mode replication', async () => {
    await global.storage.set('mirrorProfiles', ['profile123', 'profileMirror456']);
    await bg.initializeBackground();

    const addRes = await new Promise(resolve => {
      messageHandlerRef({ type: 'MANAGE_DOMAIN', profileId: 'profile123', listType: 'allowlist', domain: 'mirrored.com', action: 'add' }, {}, resolve);
    });

    expect(addRes.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/profiles/profile123/allowlist'), expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/profiles/profileMirror456/allowlist'), expect.anything());
  });

  test('Message Handler - GET_ANALYTICS with custom endpoint', async () => {
    await bg.initializeBackground();

    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/analytics/domains?status=blocked')) {
        return { ok: true, json: async () => ({ data: [{ root: 'ads.com', queries: 42 }] }) };
      }
      return { ok: false, statusText: 'Not Found', json: async () => ({}) };
    });

    const analyticsRes = await new Promise(resolve => {
      messageHandlerRef({ type: 'GET_ANALYTICS', profileId: 'profile123', endpoint: 'domains?status=blocked' }, {}, resolve);
    });

    expect(analyticsRes.success).toBe(true);
    expect(analyticsRes.data).toEqual([{ root: 'ads.com', queries: 42 }]);
  });

  test('Message Handler - SAVE_REWRITE and DELETE_REWRITE with validation and encoding', async () => {
    await bg.initializeBackground();

    // Invalid parameters for SAVE_REWRITE
    const invalidSave1 = await new Promise(resolve => {
      messageHandlerRef({ type: 'SAVE_REWRITE', profileId: '', name: 'example.com', content: '1.2.3.4' }, {}, resolve);
    });
    expect(invalidSave1).toEqual({ success: false, error: 'Invalid profile ID' });

    const invalidSave2 = await new Promise(resolve => {
      messageHandlerRef({ type: 'SAVE_REWRITE', profileId: 'profile123', name: '', content: '1.2.3.4' }, {}, resolve);
    });
    expect(invalidSave2).toEqual({ success: false, error: 'Invalid domain name' });

    const invalidSave3 = await new Promise(resolve => {
      messageHandlerRef({ type: 'SAVE_REWRITE', profileId: 'profile123', name: 'example.com', content: '' }, {}, resolve);
    });
    expect(invalidSave3).toEqual({ success: false, error: 'Invalid rewrite target' });

    // Valid SAVE_REWRITE
    const validSave = await new Promise(resolve => {
      messageHandlerRef({ type: 'SAVE_REWRITE', profileId: 'profile123', name: '  service.local  ', content: '  10.0.0.1  ' }, {}, resolve);
    });
    expect(validSave.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/profiles/profile123/rewrites'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'service.local', content: '10.0.0.1' })
      })
    );

    // Invalid parameters for DELETE_REWRITE
    const invalidDel1 = await new Promise(resolve => {
      messageHandlerRef({ type: 'DELETE_REWRITE', profileId: 'bad/profile', name: 'service.local' }, {}, resolve);
    });
    expect(invalidDel1).toEqual({ success: false, error: 'Invalid profile ID' });

    const invalidDel2 = await new Promise(resolve => {
      messageHandlerRef({ type: 'DELETE_REWRITE', profileId: 'profile123', name: '' }, {}, resolve);
    });
    expect(invalidDel2).toEqual({ success: false, error: 'Invalid domain name' });

    // Valid DELETE_REWRITE with path encoding
    const validDel = await new Promise(resolve => {
      messageHandlerRef({ type: 'DELETE_REWRITE', profileId: 'profile123', name: 'foo.com/bar' }, {}, resolve);
    });
    expect(validDel.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/profiles/profile123/rewrites/foo.com%2Fbar'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('Message Handler - TEMP_ALLOW parameter validation and duration clamping', async () => {
    await bg.initializeBackground();

    // Missing profileId or domain
    const missingRes = await new Promise(resolve => {
      messageHandlerRef({ type: 'TEMP_ALLOW', profileId: '', domain: 'temp.com' }, {}, resolve);
    });
    expect(missingRes).toEqual({ success: false, error: 'Missing parameters' });

    // Clamping low/negative duration to 1
    const lowRes = await new Promise(resolve => {
      messageHandlerRef({ type: 'TEMP_ALLOW', profileId: 'profile123', domain: 'temp-min.com', durationInMinutes: -5 }, {}, resolve);
    });
    expect(lowRes.success).toBe(true);
    expect(global.browser.alarms.create).toHaveBeenCalledWith(
      expect.stringContaining('tempAllow?'),
      { delayInMinutes: 1 }
    );

    // Clamping excessive duration to 1440
    const highRes = await new Promise(resolve => {
      messageHandlerRef({ type: 'TEMP_ALLOW', profileId: 'profile123', domain: 'temp-max.com', durationInMinutes: 5000 }, {}, resolve);
    });
    expect(highRes.success).toBe(true);
    expect(global.browser.alarms.create).toHaveBeenCalledWith(
      expect.stringContaining('tempAllow?'),
      { delayInMinutes: 1440 }
    );
  });

  test('Message Handler - MANAGE_DOMAIN parameter validation and error propagation', async () => {
    await bg.initializeBackground();

    // Invalid profileId
    const badProfile = await new Promise(resolve => {
      messageHandlerRef({ type: 'MANAGE_DOMAIN', profileId: '../escape', listType: 'allowlist', domain: 'test.com', action: 'add' }, {}, resolve);
    });
    expect(badProfile.success).toBe(false);
    expect(badProfile.error).toBe('Invalid profile ID');

    // Invalid listType
    const badList = await new Promise(resolve => {
      messageHandlerRef({ type: 'MANAGE_DOMAIN', profileId: 'profile123', listType: 'customlist', domain: 'test.com', action: 'add' }, {}, resolve);
    });
    expect(badList.success).toBe(false);
    expect(badList.error).toBe('Invalid list type');

    // Invalid domain
    const badDomain = await new Promise(resolve => {
      messageHandlerRef({ type: 'MANAGE_DOMAIN', profileId: 'profile123', listType: 'allowlist', domain: '', action: 'add' }, {}, resolve);
    });
    expect(badDomain.success).toBe(false);
    expect(badDomain.error).toBe('Invalid domain');
  });

  test('Message Handler - CLEAR_LOGS profile ID validation', async () => {
    await bg.initializeBackground();

    const badClear = await new Promise(resolve => {
      messageHandlerRef({ type: 'CLEAR_LOGS', profileId: 'invalid/id' }, {}, resolve);
    });
    expect(badClear).toEqual({ success: false, error: 'Invalid profile ID' });

    const goodClear = await new Promise(resolve => {
      messageHandlerRef({ type: 'CLEAR_LOGS', profileId: 'profile123' }, {}, resolve);
    });
    expect(goodClear.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/profiles/profile123/logs'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('Message Handler - TOGGLE_SETTING error propagation on failure', async () => {
    await bg.initializeBackground();

    fetchMock.mockImplementation(async (url, options) => {
      if (url.includes('/profiles/profile123/security') && options?.method === 'PATCH') {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          clone: () => ({
            json: async () => ({ errors: [{ message: "Setting not supported" }] })
          })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const res = await new Promise(resolve => {
      messageHandlerRef({
        type: 'TOGGLE_SETTING',
        profileId: 'profile123',
        category: 'security',
        id: 'bad-setting',
        action: 'add',
        settingType: 'boolean'
      }, {}, resolve);
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("Setting not supported");
  });

  test('Message Handler - GET_ALL_SETTINGS succeeds even if one category has empty/malformed json', async () => {
    await bg.initializeBackground();

    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/security')) {
        return { ok: true, json: async () => { throw new Error("Malformed JSON"); } };
      }
      return { ok: true, json: async () => ({ data: { test: true } }) };
    });

    const res = await new Promise(resolve => {
      messageHandlerRef({ type: 'GET_ALL_SETTINGS', profileId: 'profile123' }, {}, resolve);
    });

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data.security).toEqual({});
  });

  test('Message Handler - SNAPSHOTS CRUD & Quota Management', async () => {
    await bg.initializeBackground();

    // Invalid profile ID
    const invRes = await new Promise(r => messageHandlerRef({ type: 'CREATE_SNAPSHOT', profileId: '' }, {}, r));
    expect(invRes.success).toBe(false);

    // Mock GET_ALL_SETTINGS fetch
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ data: { block_dga: true } }) }));

    // Create Snapshot 1
    const snap1 = await new Promise(r => messageHandlerRef({ type: 'CREATE_SNAPSHOT', profileId: 'profile123', name: 'My Snapshot' }, {}, r));
    expect(snap1.success).toBe(true);
    expect(snap1.snapshot.name).toBe('My Snapshot');

    // List snapshots
    const listRes = await new Promise(r => messageHandlerRef({ type: 'LIST_SNAPSHOTS', profileId: 'profile123' }, {}, r));
    expect(listRes.success).toBe(true);
    expect(listRes.snapshots.length).toBe(1);

    // Delete snapshot
    const delRes = await new Promise(r => messageHandlerRef({ type: 'DELETE_SNAPSHOT', profileId: 'profile123', snapshotId: snap1.snapshot.id }, {}, r));
    expect(delRes.success).toBe(true);

    const afterDel = await new Promise(r => messageHandlerRef({ type: 'LIST_SNAPSHOTS', profileId: 'profile123' }, {}, r));
    expect(afterDel.snapshots.length).toBe(0);
  });

  test('Message Handler - AUTOMATION RULES CRUD', async () => {
    await bg.initializeBackground();

    // List rules (initially empty)
    const list1 = await new Promise(r => messageHandlerRef({ type: 'LIST_RULES' }, {}, r));
    expect(list1.success).toBe(true);
    expect(list1.rules).toEqual([]);

    // Save rule validation
    const badSave = await new Promise(r => messageHandlerRef({ type: 'SAVE_RULE', rule: null }, {}, r));
    expect(badSave.success).toBe(false);

    // Save valid rule
    const saved = await new Promise(r => messageHandlerRef({
      type: 'SAVE_RULE',
      rule: { name: 'Auto Block', trigger: '23:00', action: 'enable', targetId: 'block-dga' }
    }, {}, r));
    expect(saved.success).toBe(true);
    expect(saved.rule.id).toBeDefined();

    // List rules has new rule
    const list2 = await new Promise(r => messageHandlerRef({ type: 'LIST_RULES' }, {}, r));
    expect(list2.rules.length).toBe(1);

    // Delete rule validation
    const badDel = await new Promise(r => messageHandlerRef({ type: 'DELETE_RULE', ruleId: '' }, {}, r));
    expect(badDel.success).toBe(false);

    // Delete valid rule
    const del = await new Promise(r => messageHandlerRef({ type: 'DELETE_RULE', ruleId: saved.rule.id }, {}, r));
    expect(del.success).toBe(true);
  });

  test('Message Handler - REWRITES LIST, SAVE, and DELETE', async () => {
    await bg.initializeBackground();

    fetchMock.mockImplementation(async (url, options) => {
      if (url.includes('/rewrites') && options?.method === 'POST') {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.includes('/rewrites') && options?.method === 'DELETE') {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.includes('/rewrites')) {
        return { ok: true, json: async () => ({ data: [{ name: 'local.lan', content: '192.168.1.1' }] }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    // List rewrites
    const list = await new Promise(r => messageHandlerRef({ type: 'LIST_REWRITES', profileId: 'profile123' }, {}, r));
    expect(list.success).toBe(true);
    expect(list.data.length).toBe(1);

    // Save rewrite
    const saved = await new Promise(r => messageHandlerRef({
      type: 'SAVE_REWRITE',
      profileId: 'profile123',
      name: 'srv.lan',
      content: '10.0.0.1'
    }, {}, r));
    expect(saved.success).toBe(true);

    // Delete rewrite
    const del = await new Promise(r => messageHandlerRef({
      type: 'DELETE_REWRITE',
      profileId: 'profile123',
      name: 'srv.lan'
    }, {}, r));
    expect(del.success).toBe(true);
  });

  test('Message Handler - GET_PROFILES_LIST, START_STREAM, and STOP_STREAM', async () => {
    await bg.initializeBackground();

    fetchMock.mockImplementation(async (url, options) => {
      if (url.endsWith('/profiles')) {
        return { ok: true, json: async () => ({ data: [{ id: 'p1', name: 'Profile 1' }] }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    // Get profiles with custom apiKey
    const res = await new Promise(r => messageHandlerRef({ type: 'GET_PROFILES_LIST', apiKey: 'custom-key-xyz' }, {}, r));
    expect(res.success).toBe(true);
    expect(res.data.length).toBe(1);

    // Stream start / stop
    const startRes = await new Promise(r => messageHandlerRef({ type: 'START_STREAM', profileId: 'profile123' }, {}, r));
    expect(startRes).toBeDefined();

    const stopRes = await new Promise(r => messageHandlerRef({ type: 'STOP_STREAM' }, {}, r));
    expect(stopRes.success).toBe(true);
  });

  test('Message Handler - SAVE_SCRAPED_META, TAB STATS, and GET_PROFILE_DATA', async () => {
    await bg.initializeBackground();

    // SAVE_SCRAPED_META validation & success
    const badMeta = await new Promise(r => messageHandlerRef({ type: 'SAVE_SCRAPED_META', payload: null }, {}, r));
    expect(badMeta.success).toBe(false);

    const goodMeta = await new Promise(r => messageHandlerRef({
      type: 'SAVE_SCRAPED_META',
      payload: { metaType: 'blocklists', data: [{ id: 'oisd', name: 'OISD' }] }
    }, {}, r));
    expect(goodMeta.success).toBe(true);

    // TAB STATS
    const stats = await new Promise(r => messageHandlerRef({ type: 'GET_TAB_STATS', tabId: 99 }, {}, r));
    expect(stats.requests).toBeDefined();

    const clearStats = await new Promise(r => messageHandlerRef({ type: 'CLEAR_TAB_STATS', tabId: 99 }, {}, r));
    expect(clearStats.success).toBe(true);

    // GET_PROFILE_DATA
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/allowlist')) return { ok: true, json: async () => ({ data: [{ id: 'good.com' }] }) };
      if (url.includes('/denylist')) return { ok: true, json: async () => ({ data: [{ id: 'bad.com' }] }) };
      return { ok: true, json: async () => ({}) };
    });

    const profData = await new Promise(r => messageHandlerRef({ type: 'GET_PROFILE_DATA', profileId: 'profile123' }, {}, r));
    expect(profData.success).toBe(true);
    expect(profData.allowlist).toContain('good.com');
    expect(profData.denylist).toContain('bad.com');
  });

  test('Message Handler - DEBUG_TAB and GET_LOGS', async () => {
    await bg.initializeBackground();

    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/logs')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { domain: 'tracker.com', status: 'blocked', reason: 'EasyList', timestamp: 1000 }
            ]
          })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // GET_LOGS with local log merging
    const { state } = await import('../src/background/state.js');
    state.localLogs = [{ domain: 'local-blocked.com', status: 'blocked', timestamp: 2000 }];

    const logsRes = await new Promise(r => messageHandlerRef({ type: 'GET_LOGS', profileId: 'profile123' }, {}, r));
    expect(logsRes.success).toBe(true);
    expect(logsRes.data.length).toBe(2);

    // DEBUG_TAB
    state.tabRequests[10] = {
      'tracker.com': { status: 'blocked', timestamp: 1000 },
      'local-blocked.com': { status: 'blocked', timestamp: 2000, reason: 'Custom Denylist' }
    };

    const debugRes = await new Promise(r => messageHandlerRef({ type: 'DEBUG_TAB', tabId: 10, profileId: 'profile123' }, {}, r));
    expect(debugRes.success).toBe(true);
    expect(debugRes.correlations.length).toBe(2);
  });

  test('DDNS - checkAndUpdateLinkedIP edge cases and IP transitions', async () => {
    const { checkAndUpdateLinkedIP, runNetworkDiagnostics } = await import('../src/background/api.js');
    const { storage } = await import('../src/storage.js');

    // 1. Returns early if profile starts with 'fp'
    await storage.set({ activeProfile: 'fp12345' });
    await checkAndUpdateLinkedIP();

    // 2. Returns early if profile has no linkedIp
    await storage.set({ activeProfile: 'profile123' });
    fetchMock.mockImplementationOnce(async (url) => {
      if (url.includes('/profiles/profile123')) {
        return { ok: true, json: async () => ({ data: { linkedIp: null } }) };
      }
      return { ok: false };
    });
    await checkAndUpdateLinkedIP();

    // 3. IPv4 change detected via TEST_URL
    let postedEndpoint = null;
    fetchMock.mockImplementation(async (url, options) => {
      if (url.includes('/profiles/profile123/linked-ip')) {
        postedEndpoint = url;
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.includes('/profiles/profile123')) {
        return { ok: true, json: async () => ({ data: { linkedIp: '198.51.100.1' } }) };
      }
      if (url === 'https://test.nextdns.io/') {
        return { ok: true, json: async () => ({ client: '203.0.113.50' }) };
      }
      return { ok: false };
    });
    await checkAndUpdateLinkedIP();
    expect(postedEndpoint).toContain('/profiles/profile123/linked-ip/203.0.113.50');

    // 4. Same IP does not trigger update
    postedEndpoint = null;
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/profiles/profile123')) {
        return { ok: true, json: async () => ({ data: { linkedIp: '203.0.113.50' } }) };
      }
      if (url === 'https://test.nextdns.io/') {
        return { ok: true, json: async () => ({ client: '203.0.113.50' }) };
      }
      return { ok: false };
    });
    await checkAndUpdateLinkedIP();
    expect(postedEndpoint).toBeNull();

    // 5. IPv6 change detected via info fallback
    postedEndpoint = null;
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/profiles/profile123/linked-ip')) {
        postedEndpoint = url;
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.includes('/profiles/profile123')) {
        return { ok: true, json: async () => ({ data: { linkedIp: '198.51.100.1' } }) };
      }
      if (url === 'https://test.nextdns.io/') {
        return { ok: false };
      }
      if (url === 'https://dns.nextdns.io/info') {
        return { ok: true, json: async () => ({ ip: '2001:db8::1' }) };
      }
      return { ok: false };
    });
    await checkAndUpdateLinkedIP();
    expect(postedEndpoint).toContain('/profiles/profile123/linked-ip/2001%3Adb8%3A%3A1');

    // 6. External ipify fallback
    postedEndpoint = null;
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/profiles/profile123/linked-ip')) {
        postedEndpoint = url;
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.includes('/profiles/profile123')) {
        return { ok: true, json: async () => ({ data: { linkedIp: '198.51.100.1' } }) };
      }
      if (url === 'https://test.nextdns.io/' || url === 'https://dns.nextdns.io/info') {
        return { ok: false };
      }
      if (url.includes('api.ipify.org')) {
        return { ok: true, json: async () => ({ ip: '198.51.100.99' }) };
      }
      return { ok: false };
    });
    await checkAndUpdateLinkedIP();
    expect(postedEndpoint).toContain('/profiles/profile123/linked-ip/198.51.100.99');

    // 7. Invalid IP format rejects without posting
    postedEndpoint = null;
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/profiles/profile123')) {
        return { ok: true, json: async () => ({ data: { linkedIp: '198.51.100.1' } }) };
      }
      if (url === 'https://test.nextdns.io/') {
        return { ok: true, json: async () => ({ client: 'invalid-not-an-ip' }) };
      }
      return { ok: false };
    });
    await checkAndUpdateLinkedIP();
    expect(postedEndpoint).toBeNull();

    // 8. runNetworkDiagnostics handles JSON parse failure on test endpoint
    fetchMock.mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        return {
          ok: true,
          json: async () => { throw new Error('Bad JSON'); }
        };
      }
      if (url === 'https://dns.nextdns.io/info') {
        return { ok: true, json: async () => ({ pop: 'cdg-1' }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    const diag = await runNetworkDiagnostics();
    expect(diag.isConnected).toBe(true);
    expect(diag.popServer).toBe('cdg-1');
  });

  test('Alarms listener triggers snooze expiry, rule engine, and ddns check', async () => {
    await bg.initializeBackground();
    expect(alarmListenerRef).toBeDefined();

    // 1. Snooze alarm expiry
    let deletedDomain = null;
    fetchMock.mockImplementation(async (url, opts) => {
      if (url.includes('/profiles/pSnooze/allowlist/snooze.com') && opts?.method === 'DELETE') {
        deletedDomain = 'snooze.com';
        return { ok: true };
      }
      return { ok: true, json: async () => ({}) };
    });

    await alarmListenerRef({ name: 'tempAllow?p=pSnooze&d=snooze.com' });
    expect(deletedDomain).toBe('snooze.com');

    // 2. Rule engine alarm
    const { checkAutomationRules } = await import('../src/background/scheduler.js');
    expect(() => alarmListenerRef({ name: 'rule-engine' })).not.toThrow();

    // 3. DDNS check alarm
    expect(() => alarmListenerRef({ name: 'ddns-check' })).not.toThrow();
  });

  test('Tabs onRemoved listener prunes in-flight tab request caches', async () => {
    await bg.initializeBackground();
    const { state } = await import('../src/background/state.js');

    state.tabRequests[999] = { 'example.com': { count: 1 } };
    state.blockedTabRequests[999] = { 'bad.com': { count: 2 } };

    tabRemovedListenerRef(999);

    expect(state.tabRequests[999]).toBeUndefined();
    expect(state.blockedTabRequests[999]).toBeUndefined();
  });

  test('Action onClicked listener routes to sidebar, popout, or fallback tabs', async () => {
    await bg.initializeBackground();
    expect(actionClickListenerRef).toBeDefined();

    // 1. Sidebar mode with sidebarAction.open available
    await global.storage.set('iconClickAction', 'sidebar');
    await actionClickListenerRef();
    expect(browser.sidebarAction.open).toHaveBeenCalled();

    // 2. Sidebar mode fallback to tab
    delete browser.sidebarAction.open;
    await actionClickListenerRef();
    expect(browser.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('mode=tab') })
    );

    // 3. Popout mode with windows.create
    await global.storage.set('iconClickAction', 'popout');
    await actionClickListenerRef();
    expect(browser.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'popup',
        width: 380,
        height: 600,
        url: expect.stringContaining('mode=popout')
      })
    );

    // 4. Popout mode fallback to tab
    delete browser.windows.create;
    await actionClickListenerRef();
    expect(browser.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('mode=popout') })
    );

    // 5. Error handling in onClicked
    global.storage.get = jest.fn().mockRejectedValue(new Error('Storage failure'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await actionClickListenerRef();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[Background] onClicked handler failed:'), expect.any(Error));
    errSpy.mockRestore();
  });

  test('Context menus onClicked listener handles validation, allow/deny actions, and errors', async () => {
    await bg.initializeBackground();
    expect(menuClickListenerRef).toBeDefined();
    fetchMock.mockClear();

    // 1. No URL provided
    await menuClickListenerRef({}, {});
    expect(fetchMock.mock.calls.some(([url, opts]) => opts?.method === 'POST')).toBe(false);

    // 2. Invalid URL string
    await menuClickListenerRef({ linkUrl: 'not_a_valid_url' }, {});
    expect(fetchMock.mock.calls.some(([url, opts]) => opts?.method === 'POST')).toBe(false);

    // 3. Non-http/https URL (e.g. ftp or about:)
    await menuClickListenerRef({ linkUrl: 'ftp://ftp.example.org/file.iso' }, {});
    expect(fetchMock.mock.calls.some(([url, opts]) => opts?.method === 'POST')).toBe(false);

    // 4. Profile not valid (starts with fp or auto)
    await global.storage.set('overrideProfileId', 'fp-unconfigured');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await menuClickListenerRef({ linkUrl: 'https://testdomain.com' }, {});
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot apply menu action'));
    warnSpy.mockRestore();

    // 5. Valid allow action
    await global.storage.set('overrideProfileId', 'profile123');
    let allowManaged = null;
    fetchMock.mockImplementation(async (url, opts) => {
      if (url.includes('/profiles/profile123/allowlist') && opts?.method === 'POST') {
        allowManaged = JSON.parse(opts.body);
        return { ok: true };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'https://allowme.com/sub' }, {});
    expect(allowManaged).toEqual({ id: 'allowme.com' });

    // 6. Valid deny action
    let denyManaged = null;
    fetchMock.mockImplementation(async (url, opts) => {
      if (url.includes('/profiles/profile123/denylist') && opts?.method === 'POST') {
        denyManaged = JSON.parse(opts.body);
        return { ok: true };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });
    await menuClickListenerRef({ menuItemId: 'dns-forge-deny', pageUrl: 'https://denyme.com' }, {});
    expect(denyManaged).toEqual({ id: 'denyme.com' });

    // 7. Click error handling
    global.storage.get = jest.fn().mockRejectedValue(new Error('Storage crash'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'https://crash.com' }, {});
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[ContextMenus] Error handling click:'), expect.any(Error));
    errSpy.mockRestore();
  });

  test('Runtime onMessage security filter enforces sender ID and restrictions on web tabs', async () => {
    await bg.initializeBackground();
    expect(messageHandlerRef).toBeDefined();

    // 1. Foreign sender ID rejected
    let res = null;
    messageHandlerRef({ type: 'GET_PROFILE' }, { id: 'imposter-extension-id' }, r => res = r);
    expect(res).toEqual({ success: false, error: 'Unauthorized sender' });

    // 2. Web tab sender attempting privileged action blocked
    res = null;
    messageHandlerRef(
      { type: 'TOGGLE_SETTING', profileId: 'profile123' },
      { tab: { id: 1, url: 'https://example.com' } },
      r => res = r
    );
    expect(res).toEqual({ success: false, error: 'Unauthorized action from web tab' });

    // 3. Web tab sender allowed safe message (e.g. MANAGE_DOMAIN)
    let handlerExecuted = false;
    res = null;
    messageHandlerRef(
      { type: 'MANAGE_DOMAIN', profileId: 'profile123', listType: 'allowlist', domain: 'web.com', action: 'add' },
      { tab: { id: 1, url: 'https://example.com' } },
      r => res = r
    );
    // Asynchronous channel returns true
    expect(res).toBeNull(); // Will be fulfilled asynchronously by messageHandlers
  });

  test('Background Handlers - Detailed edge case coverage', async () => {
    const { messageHandlers } = await import('../src/background/handlers.js');
    const { state } = await import('../src/background/state.js');

    // 1. GET_ANALYTICS validation and endpoints
    expect(await messageHandlers.GET_ANALYTICS({ profileId: 'invalid..id' })).toEqual({ success: false, error: 'Invalid profile ID' });
    expect(await messageHandlers.GET_ANALYTICS({ profileId: 'p123', endpoint: 'bad/endpoint/..' })).toEqual({ success: false, error: 'Invalid analytics endpoint' });

    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/analytics/domains')) {
        return { ok: true, json: async () => ({ data: [{ domain: 'd1.com', queries: 5 }] }) };
      }
      if (url.includes('/analytics/status;series')) {
        return { ok: true, json: async () => ({ data: [{ timestamp: 100, queries: 10 }] }) };
      }
      if (url.includes('/analytics/status')) {
        throw new Error('Analytics fetch error');
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });

    const domainsRes = await messageHandlers.GET_ANALYTICS({ profileId: 'p123', endpoint: 'domains' });
    expect(domainsRes.success).toBe(true);
    expect(domainsRes.data.length).toBe(1);

    const seriesRes = await messageHandlers.GET_ANALYTICS({ profileId: 'p123', series: true });
    expect(seriesRes.success).toBe(true);

    const errRes = await messageHandlers.GET_ANALYTICS({ profileId: 'p123', endpoint: 'status' });
    expect(errRes.success).toBe(false);

    // 2. GET_PROFILE and DETECT_PROFILE
    await global.storage.set('overrideProfileId', 'p123');
    const prof = await messageHandlers.GET_PROFILE();
    expect(prof).toBeDefined();
    const detectProf = await messageHandlers.DETECT_PROFILE();
    expect(detectProf.success).toBe(true);

    // 3. GET_NETWORK_STATUS
    state.networkStatus = null;
    const netRes = await messageHandlers.GET_NETWORK_STATUS();
    expect(netRes.success).toBe(true);

    // 4. TOGGLE_SETTING input validation & Mirror mode replication
    expect(await messageHandlers.TOGGLE_SETTING({ profileId: 'invalid..id' })).toEqual({ success: false, error: 'Invalid profile ID' });
    expect(await messageHandlers.TOGGLE_SETTING({ profileId: 'p123', category: 'bad\\cat' })).toEqual({ success: false, error: 'Invalid setting category' });
    expect(await messageHandlers.TOGGLE_SETTING({ profileId: 'p123', category: 'security', id: 'bad/id' })).toEqual({ success: false, error: 'Invalid setting ID' });

    await global.storage.set('mirrorProfiles', ['p123', 'pMirror1']);
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/profiles/pMirror1/security')) {
        throw new Error('Mirror replication failed');
      }
      return { ok: true, json: async () => ({ success: true }) };
    });
    const toggleRes = await messageHandlers.TOGGLE_SETTING({
      profileId: 'p123',
      category: 'security',
      id: 'block_ai',
      settingType: 'boolean',
      value: true
    });
    expect(toggleRes.success).toBe(true);

    // 5. GET_ALL_SETTINGS profileId fallback and performance normalization
    await global.storage.set('activeProfile', 'pFallback');
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/profiles/pFallback/settings/performance')) {
        return { ok: false };
      }
      if (url.includes('/profiles/pFallback/settings')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              performance: { ecs: true, cacheBoost: false, cnameFlattening: true }
            }
          })
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });
    const allSettingsRes = await messageHandlers.GET_ALL_SETTINGS({});
    expect(allSettingsRes.success).toBe(true);
    expect(allSettingsRes.data.settings.ecs).toBe(true);

    // 6. DEBUG_TAB validation & failure
    expect(await messageHandlers.DEBUG_TAB({ profileId: 'invalid..id' })).toEqual({ success: false, error: 'Invalid profile ID', correlations: [] });
    state.tabRequests[99] = {};
    expect(await messageHandlers.DEBUG_TAB({ profileId: 'p123', tabId: 99 })).toEqual({ success: true, correlations: [] });

    state.tabRequests[99] = { 'faildomain.com': { status: 'blocked' } };
    fetchMock.mockImplementation(async () => ({ ok: false, status: 500 }));
    expect(await messageHandlers.DEBUG_TAB({ profileId: 'p123', tabId: 99 })).toEqual({ success: false, error: 'Failed to fetch logs' });

    // 7. LIST_SNAPSHOTS & DELETE_SNAPSHOT validation
    expect(await messageHandlers.LIST_SNAPSHOTS({ profileId: 'bad!id' })).toEqual({ success: false, snapshots: [], error: 'Invalid profile ID' });
    expect(await messageHandlers.DELETE_SNAPSHOT({ profileId: 'bad!id' })).toEqual({ success: false, error: 'Invalid profile ID' });

    // 8. LIST_REWRITES, SAVE_REWRITE, DELETE_REWRITE
    expect(await messageHandlers.LIST_REWRITES({ profileId: 'bad!id' })).toEqual({ success: false, error: 'Invalid profile ID' });
    fetchMock.mockImplementation(async () => ({ ok: false, status: 500 }));
    expect(await messageHandlers.LIST_REWRITES({ profileId: 'p123' })).toEqual({ success: false, error: 'HTTP 500' });

    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ data: [{ name: 'myrouter.local', content: '192.168.1.1' }] }) }));
    const rewritesRes = await messageHandlers.LIST_REWRITES({ profileId: 'p123' });
    expect(rewritesRes.success).toBe(true);
    expect(rewritesRes.data.length).toBe(1);

    expect(await messageHandlers.SAVE_REWRITE({ profileId: 'bad!id' })).toEqual({ success: false, error: 'Invalid profile ID' });
    expect(await messageHandlers.SAVE_REWRITE({ profileId: 'p123', name: '' })).toEqual({ success: false, error: 'Invalid domain name' });
    expect(await messageHandlers.SAVE_REWRITE({ profileId: 'p123', name: 'valid.lan', content: '' })).toEqual({ success: false, error: 'Invalid rewrite target' });

    expect(await messageHandlers.DELETE_REWRITE({ profileId: 'bad!id' })).toEqual({ success: false, error: 'Invalid profile ID' });
    expect(await messageHandlers.DELETE_REWRITE({ profileId: 'p123', name: '' })).toEqual({ success: false, error: 'Invalid domain name' });

    // 9. PUSH_NOTIFICATION triggers
    await global.storage.set('alertSettings', { enabled: false });
    expect(await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', message: 'Test' } })).toEqual({ success: false, reason: 'alerts_disabled' });

    await global.storage.set('alertSettings', { enabled: true, triggerParental: false });
    expect(await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'parental', message: 'Test' } })).toEqual({ success: false, reason: 'trigger_type_disabled' });

    await global.storage.set('alertSettings', { enabled: true, triggerThreats: true, desktop: true, actionCenter: true });
    global.browser.notifications = {
      create: jest.fn().mockRejectedValue(new Error('Desktop notif error'))
    };
    expect(await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', severity: 'high', message: 'Alert!' } })).toEqual({ success: true });

    // 10. SAVE_SCRAPED_META validation
    expect(await messageHandlers.SAVE_SCRAPED_META(null)).toEqual({ success: false, error: 'Invalid payload' });
    expect(await messageHandlers.SAVE_SCRAPED_META({ payload: { metaType: 'invalid_type', data: [] } })).toEqual({ success: false, error: 'Invalid metaType or data format' });
  });

  test('Background API - manageDomain and detectActiveProfile comprehensive paths', async () => {
    const { manageDomain, _resetDetectInFlight, _resetUpdateCacheInFlight, detectActiveProfile } = await import('../src/background/api.js');
    _resetDetectInFlight();
    _resetUpdateCacheInFlight();

    // 1. manageDomain validation & actions
    expect(await manageDomain('p123', 'allowlist', '', 'add')).toEqual({ success: false, error: 'Invalid domain' });
    expect(await manageDomain('p123', 'denylist', '', 'delete')).toEqual({ success: false, error: 'Invalid domain' });

    fetchMock.mockImplementationOnce(async () => ({ ok: true }));
    expect(await manageDomain('p123', 'denylist', 'bad.com', 'delete')).toEqual({ success: true });

    fetchMock.mockImplementation(async () => ({ ok: false, status: 500 }));
    expect(await manageDomain('p123', 'allowlist', null, 'list')).toEqual({ error: 'HTTP 500' });

    fetchMock.mockImplementation(async () => { throw new Error('API failure'); });
    expect(await manageDomain('p123', 'allowlist', 'bad.com', 'add')).toEqual({ success: false, error: 'API failure' });

    // 2. detectActiveProfile manual matching accountProfiles name
    await global.storage.set('overrideProfileId', 'pManual');
    await global.storage.set('apiKey', 'test-api-key');
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/profiles')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 'pManual', name: 'Matched Manual Profile' }]
          })
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    _resetDetectInFlight();
    const detectedManual = await detectActiveProfile();
    expect(detectedManual.name).toBe('Matched Manual Profile (pManual)');

    // 3. detectActiveProfile auto-detection fallbacks
    await global.storage.set('overrideProfileId', 'auto');
    await global.storage.set('activeProfile', 'auto');
    fetchMock.mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        return { ok: false };
      }
      if (url === 'https://dns.nextdns.io/info') {
        return { ok: true, json: async () => ({ pop: 'lhr-1', ip: '192.0.2.1' }) };
      }
      if (url.includes('/profiles')) {
        return { ok: true, json: async () => ({ data: [{ id: 'pFallback1', name: 'First Account Profile' }] }) };
      }
      return { ok: false };
    });
    _resetDetectInFlight();
    const detectedAuto = await detectActiveProfile();
    expect(detectedAuto.id).toBe('pFallback1');

    // 4. detectActiveProfile account profile fetch warning catch
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/profiles')) {
        throw new Error('Network failure');
      }
      return { ok: false };
    });
    _resetDetectInFlight();
    await detectActiveProfile();
  });

  test('initializeBackground covers Android platform errors, menu fallbacks, and action errors', async () => {
    const { initializeBackground } = await import('../src/background/main.js');
    const { state } = await import('../src/background/state.js');
    const { messageHandlers } = await import('../src/background/handlers.js');

    // 1. Android platform error on webRequestBlocking (line 66)
    state.isInitialized = false;
    const origAddListener = browser.webRequest.onBeforeRequest.addListener;
    browser.webRequest.onBeforeRequest.addListener = jest.fn(() => {
      throw new Error('webRequestBlocking not supported on Android');
    });
    await initializeBackground();
    expect(state.isInitialized).toBe(true);
    browser.webRequest.onBeforeRequest.addListener = origAddListener;

    // 2. Context menus not supported on platform (lines 213-214)
    state.isInitialized = false;
    const origCreate = browser.menus.create;
    delete browser.menus.create;
    await initializeBackground();
    expect(state.isInitialized).toBe(true);
    browser.menus.create = origCreate;

    // 3. Failed to setup context menus (line 229)
    state.isInitialized = false;
    browser.menus.removeAll = jest.fn().mockRejectedValueOnce(new Error('Menu remove error'));
    await initializeBackground();
    expect(state.isInitialized).toBe(true);

    // 4. Failed to apply icon action (line 170)
    state.isInitialized = false;
    browser.action.setPopup = jest.fn().mockRejectedValueOnce(new Error('Action setPopup failed'));
    await initializeBackground();
    expect(state.isInitialized).toBe(true);

    // 5. Message handler error catch (lines 105-106)
    const origToggle = messageHandlers.TOGGLE_SETTING;
    messageHandlers.TOGGLE_SETTING = jest.fn().mockRejectedValueOnce(new Error('Handler toggle failure'));
    const responsePromise = new Promise(resolve => {
      messageHandlerRef({ type: 'TOGGLE_SETTING' }, { id: browser.runtime.id }, resolve);
    });
    const handlerRes = await responsePromise;
    expect(handlerRes.success).toBe(false);
    expect(handlerRes.error).toBe('Handler toggle failure');
    messageHandlers.TOGGLE_SETTING = origToggle;
  });

  test('Background API and Handlers comprehensive paths for 100% line coverage', async () => {
    const { detectActiveProfile, _resetDetectInFlight, checkAndUpdateLinkedIP } = await import('../src/background/api.js');
    const { messageHandlers } = await import('../src/background/handlers.js');

    // 1. detectActiveProfile matches networkProfile with accountProfiles (lines 156-157)
    await global.storage.set('overrideProfileId', '');
    await global.storage.set('activeProfile', 'auto');
    await global.storage.set('apiKey', 'valid-api-key');
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/profiles') && !url.includes('pMatched123')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 'pMatched123', name: 'Matched Home Network' }]
          })
        };
      }
      if (url === 'https://test.nextdns.io/') {
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            profile: 'pMatched123',
            protocol: 'DOH',
            server: 'ams-1',
            client: '198.51.100.1'
          })
        };
      }
      return { ok: false };
    });
    _resetDetectInFlight();
    const matchedProfile = await detectActiveProfile();
    expect(matchedProfile.id).toBe('pMatched123');
    expect(matchedProfile.name).toBe('Matched Home Network (pMatched123)');

    // 2. detectActiveProfile test URL crash catch block (line 192)
    const { apiClient } = await import('../src/apiClient.js');
    const origFetchRetry = apiClient.fetchWithRetry;
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        throw new Error('Test URL connection crashed');
      }
      if (url.includes('/profiles')) {
        return {
          success: true,
          response: {
            json: async () => ({ data: [{ id: 'pFallback99', name: 'Fallback Net' }] })
          }
        };
      }
      return { success: false };
    });
    _resetDetectInFlight();
    const crashFallback = await detectActiveProfile();
    expect(crashFallback.id).toBe('pFallback99');
    apiClient.fetchWithRetry = origFetchRetry;

    // 3. checkAndUpdateLinkedIP catch block (line 314)
    await global.storage.set('activeProfile', 'pMatched123');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    apiClient.fetchWithRetry = jest.fn().mockRejectedValueOnce(new Error('DDNS crash'));
    await checkAndUpdateLinkedIP();
    expect(warnSpy.mock.calls.some(call => call[0] === '[DDNS] Check failed')).toBe(true);
    warnSpy.mockRestore();
    apiClient.fetchWithRetry = origFetchRetry;

    // 4. Handlers: GET_LOGS catch block (lines 115-116)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValueOnce({
      success: true,
      response: { json: async () => { throw new Error('Corrupt logs JSON'); } }
    });
    const logsRes = await messageHandlers.GET_LOGS({ profileId: 'pMatched123' });
    expect(logsRes.success).toBe(false);

    // 5. Handlers: GET_PROFILE_DATA catch block (lines 138-139)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValueOnce({
      success: true,
      response: { json: async () => { throw new Error('Corrupt profile data JSON'); } }
    });
    const pDataRes = await messageHandlers.GET_PROFILE_DATA({ profileId: 'pMatched123' });
    expect(pDataRes.success).toBe(false);

    // 6. Handlers: GET_ANALYTICS status endpoint series=false calculation and catch block (lines 162-164, 173-174)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValueOnce({
      success: true,
      response: {
        json: async () => ({
          data: [
            { status: 'allowed', queries: 80 },
            { status: 'blocked', queries: 20 }
          ]
        })
      }
    });
    const analyticsRes = await messageHandlers.GET_ANALYTICS({
      profileId: 'pMatched123',
      endpoint: 'status',
      series: false
    });
    expect(analyticsRes.success).toBe(true);
    expect(analyticsRes.data.queries).toBe(100);
    expect(analyticsRes.data.blockedQueries).toBe(20);
    expect(analyticsRes.data.blockedPercent).toBe(20);

    apiClient.fetchWithRetry = jest.fn().mockResolvedValueOnce({
      success: true,
      response: { json: async () => { throw new Error('Corrupt analytics JSON'); } }
    });
    const analyticsFail = await messageHandlers.GET_ANALYTICS({
      profileId: 'pMatched123',
      endpoint: 'status'
    });
    expect(analyticsFail.success).toBe(false);

    // 7. Handlers: GET_PROFILES_LIST catch block (lines 222-223)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValueOnce({
      success: true,
      response: { json: async () => { throw new Error('Corrupt profiles list JSON'); } }
    });
    const listFail = await messageHandlers.GET_PROFILES_LIST({});
    expect(listFail.success).toBe(false);

    // 8. detectActiveProfile account profiles catch and test URL corrupt json (lines 101, 134)
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/profiles')) {
        throw new Error('Account profiles crash');
      }
      if (url === 'https://test.nextdns.io/') {
        return {
          success: true,
          response: {
            json: async () => { throw new Error('Bad test URL json'); }
          }
        };
      }
      return { success: false };
    });
    _resetDetectInFlight();
    await detectActiveProfile();
    apiClient.fetchWithRetry = origFetchRetry;

    // 9. Handlers: TOGGLE_SETTING with custom value and mirror failure (lines 260, 284)
    await global.storage.set('mirrorProfiles', ['pMatched123', 'pMirror1']);
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const origToggleSetting = messageHandlers.TOGGLE_SETTING;
    messageHandlers.TOGGLE_SETTING = jest.fn(async (msg) => {
      if (msg._mirrored) {
        throw new Error('Mirrored toggle crash');
      }
      return origToggleSetting(msg);
    });
    const toggleCustom = await messageHandlers.TOGGLE_SETTING({
      profileId: 'pMatched123',
      category: 'settings',
      id: 'customSetting',
      settingType: 'string',
      value: 'customValue'
    });
    expect(toggleCustom.success).toBe(true);
    await new Promise(r => setTimeout(r, 30));
    messageHandlers.TOGGLE_SETTING = origToggleSetting;

    // 9. Handlers: MANAGE_DOMAIN mirror replication rejection (line 46)
    const bgApi = await import('../src/background/api.js');
    const origManageDomain = bgApi.manageDomain;
    const manageDomainSpy = jest.spyOn(bgApi, 'manageDomain').mockImplementation(async (pId, listType, domain, action) => {
      if (pId === 'pMirror1') {
        throw new Error('Mirrored domain manage crash');
      }
      return origManageDomain(pId, listType, domain, action);
    });
    await messageHandlers.MANAGE_DOMAIN({
      profileId: 'pMatched123',
      listType: 'denylist',
      domain: 'sync-mirror.com',
      action: 'add'
    });
    await new Promise(r => setTimeout(r, 30));
    manageDomainSpy.mockRestore();
    errSpy.mockRestore();

    // 10. Handlers: CREATE_SNAPSHOT large quota pruning and error catch (lines 405-408, 413-414)
    const hugeSnapshots = {
      pMatched123: Array.from({ length: 9 }, (_, i) => ({
        id: `snap-${i}`,
        timestamp: Date.now(),
        data: 'X'.repeat(300 * 1024)
      }))
    };
    await global.storage.set('profileSnapshots', hugeSnapshots);
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ data: [] })
    }));
    const snapRes = await messageHandlers.CREATE_SNAPSHOT({ profileId: 'pMatched123' });
    expect(snapRes.success).toBe(true);

    const origStorageSet = global.storage.set;
    global.storage.set = jest.fn().mockRejectedValueOnce(new Error('QuotaExceeded'));
    const snapFail = await messageHandlers.CREATE_SNAPSHOT({ profileId: 'pMatched123' });
    expect(snapFail.success).toBe(false);
    expect(snapFail.error).toContain('QuotaExceeded');
    global.storage.set = origStorageSet;

    // 11. api.js manageDomain catch block (line 47)
    apiClient.fetchWithRetry = jest.fn().mockRejectedValueOnce(new Error('Hard Network Failure'));
    const manageDomainErr = await bgApi.manageDomain('pMatched123', 'allowlist', 'fail.com', 'add');
    expect(manageDomainErr.success).toBe(false);
    expect(manageDomainErr.error).toBe('Hard Network Failure');
    apiClient.fetchWithRetry = origFetchRetry;

    // 12. api.js detectActiveProfile storedActive manual override fallback (line 86)
    await global.storage.set('overrideProfileId', null);
    await global.storage.set('activeProfile', 'pStoredManualOnly');
    bgApi._resetDetectInFlight();
    const storedManualProfile = await bgApi.detectActiveProfile();
    expect(storedManualProfile.id).toBe('pStoredManualOnly');
    expect(storedManualProfile.manual).toBe(true);
  });

  test('handlers.js & api.js - Exhaustive Statement, Function & Branch Coverage Deep Dive', async () => {
    const { messageHandlers } = await import('../src/background/handlers.js');
    const bgApi = await import('../src/background/api.js');
    const { apiClient } = await import('../src/apiClient.js');
    const { state } = await import('../src/background/state.js');

    // 1. Guard check branches for invalid profile IDs across all handlers
    const invalidProfileCases = [
      { fn: 'GET_LOGS', msg: { profileId: '' }, check: res => expect(res.error).toBe('Invalid profile ID') },
      { fn: 'GET_LOGS', msg: { profileId: 'bad!id' }, check: res => expect(res.error).toBe('Invalid profile ID') },
      { fn: 'GET_PROFILE_DATA', msg: { profileId: null }, check: res => expect(res.error).toBe('Invalid profile ID') },
      { fn: 'GET_ANALYTICS', msg: { profileId: '$$' }, check: res => expect(res.error).toBe('Invalid profile ID') },
      { fn: 'GET_ALL_SETTINGS', msg: { profileId: 'bad!id' }, check: res => expect(res.error).toBe('Invalid profile ID') },
      { fn: 'CREATE_SNAPSHOT', msg: { profileId: '' }, check: res => expect(res.error).toBe('Profile ID required') },
      { fn: 'LIST_SNAPSHOTS', msg: { profileId: '' }, check: res => expect(res.error).toBe('Invalid profile ID') },
      { fn: 'DELETE_SNAPSHOT', msg: { profileId: '' }, check: res => expect(res.error).toBe('Invalid profile ID') },
      { fn: 'LIST_REWRITES', msg: { profileId: '' }, check: res => expect(res.error).toBe('Invalid profile ID') },
      { fn: 'SAVE_REWRITE', msg: { profileId: '' }, check: res => expect(res.error).toBe('Invalid profile ID') },
      { fn: 'SAVE_REWRITE', msg: { profileId: 'valid1', name: '' }, check: res => expect(res.error).toBe('Invalid domain name') },
      { fn: 'SAVE_REWRITE', msg: { profileId: 'valid1', name: 'domain.com', content: '' }, check: res => expect(res.error).toBe('Invalid rewrite target') },
      { fn: 'DELETE_REWRITE', msg: { profileId: '' }, check: res => expect(res.error).toBe('Invalid profile ID') },
      { fn: 'DELETE_REWRITE', msg: { profileId: 'valid1', name: '' }, check: res => expect(res.error).toBe('Invalid domain name') }
    ];

    for (const testCase of invalidProfileCases) {
      const res = await messageHandlers[testCase.fn](testCase.msg);
      testCase.check(res);
    }

    // 2. GET_LOGS with raw: false and missing/present local logs merging branches
    const origFetch = apiClient.fetchWithRetry;
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: {
        json: async () => ({
          data: [
            { domain: 'exist.com', timestamp: 100 },
            { name: 'exist2.com', timestamp: 200 }
          ]
        })
      }
    });

    state.localLogs = [
      { domain: 'exist.com', timestamp: 150 }, // duplicate, should be skipped
      { domain: 'unique-local.com', timestamp: 300 } // unique, should be prepended
    ];

    const rawFalseRes = await messageHandlers.GET_LOGS({ profileId: 'prof123', raw: false });
    expect(rawFalseRes.success).toBe(true);
    expect(rawFalseRes.data.some(d => (d.domain || d.name) === 'unique-local.com')).toBe(true);

    // 3. GET_PROFILE_DATA with direct array response instead of { data: [...] }
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('allowlist')) {
        return { success: true, response: { json: async () => [{ id: 'direct-allow.com' }] } };
      }
      return { success: true, response: { json: async () => [{ id: 'direct-deny.com' }] } };
    });
    const directArrayRes = await messageHandlers.GET_PROFILE_DATA({ profileId: 'prof123' });
    expect(directArrayRes.allowlist).toEqual(['direct-allow.com']);
    expect(directArrayRes.denylist).toEqual(['direct-deny.com']);

    // 4. DEBUG_TAB corrupt json response (exercises line 342 json().catch(() => ({})))
    state.tabRequests[42] = { 'malicious.com': { status: 'blocked' } };
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: {
        json: async () => { throw new Error('Corrupt json'); }
      }
    });
    const secRes = await messageHandlers.DEBUG_TAB({ profileId: 'prof123', tabId: 42 });
    expect(secRes.success).toBe(true);
    delete state.tabRequests[42];

    // 5. LIST_REWRITES corrupt json response (exercises line 504 json().catch(() => ({})))
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: {
        json: async () => { throw new Error('Corrupt rewrites'); }
      }
    });
    const rewriteRes = await messageHandlers.LIST_REWRITES({ profileId: 'prof123' });
    expect(rewriteRes.success).toBe(true);
    expect(rewriteRes.data).toEqual([]);

    // 6. api.js detectActiveProfile Anycast info probe JSON parse failure (exercises line 175)
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('test.nextdns.io')) return { success: false };
      if (url.includes('/info')) {
        return {
          success: true,
          response: {
            json: async () => { throw new Error('Info parse failure'); }
          }
        };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();

    // 7. api.js checkAndUpdateLinkedIP IP detection JSON parse failures (exercises lines 273, 283, 294)
    await global.storage.set('activeProfile', 'prof123');
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/profiles/prof123')) {
        return { success: true, response: { json: async () => ({ data: { linkedIp: '1.2.3.4' } }) } };
      }
      if (url.includes('test.nextdns.io')) {
        return {
          success: true,
          response: { json: async () => { throw new Error('test parse fail'); } }
        };
      }
      if (url.includes('/info')) {
        return {
          success: true,
          response: { json: async () => { throw new Error('info parse fail'); } }
        };
      }
      return { success: false };
    });

    const origGlobalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('ipify parse fail'); }
    });

    await bgApi.checkAndUpdateLinkedIP();

    // 8. api.js runNetworkDiagnostics infoData JSON parse failure (exercises line 349)
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/info')) {
        return {
          success: true,
          response: { json: async () => { throw new Error('Info parse failure'); } }
        };
      }
      return { success: false };
    });
    const diagRes = await bgApi.runNetworkDiagnostics();
    expect(diagRes).toBeDefined();

    // 9. handlers.js TOGGLE_SETTING input validations & settingType branches
    // Invalid category
    const catErr = await messageHandlers.TOGGLE_SETTING({ profileId: 'prof123', category: '' });
    expect(catErr.error).toBe('Invalid setting category');
    const catErr2 = await messageHandlers.TOGGLE_SETTING({ profileId: 'prof123', category: 'bad!cat' });
    expect(catErr2.error).toBe('Invalid setting category');

    // Invalid id with traversal
    const idErr = await messageHandlers.TOGGLE_SETTING({ profileId: 'prof123', category: 'security', id: '../evil' });
    expect(idErr.error).toBe('Invalid setting ID');

    // settingType === 'list' with action delete
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true, response: { json: async () => ({}) } });
    const listDelRes = await messageHandlers.TOGGLE_SETTING({
      profileId: 'prof123',
      category: 'security',
      id: 'item1',
      settingType: 'list',
      action: 'delete'
    });
    expect(listDelRes.success).toBe(true);
    expect(apiClient.fetchWithRetry).toHaveBeenCalledWith('/profiles/prof123/security/item1', expect.objectContaining({ method: 'DELETE' }));

    // settingType === 'boolean' with action delete (false)
    const boolDelRes = await messageHandlers.TOGGLE_SETTING({
      profileId: 'prof123',
      category: 'security',
      id: 'block_ai',
      settingType: 'boolean',
      action: 'delete'
    });
    expect(boolDelRes.success).toBe(true);

    // TOGGLE_SETTING fallback to storage.get("activeProfile") when profileId omitted
    await global.storage.set('activeProfile', 'profActiveFallback');
    const noProfRes = await messageHandlers.TOGGLE_SETTING({
      category: 'security',
      id: 'block_ai',
      settingType: 'boolean',
      action: 'add'
    });
    expect(noProfRes.success).toBe(true);

    // 10. handlers.js TEMP_ALLOW durationInMinutes branches & missing parameters
    const tempMissing = await messageHandlers.TEMP_ALLOW({ profileId: '' });
    expect(tempMissing.error).toBe('Missing parameters');

    // TEMP_ALLOW with custom duration and invalid duration fallback
    const tempValid = await messageHandlers.TEMP_ALLOW({ profileId: 'prof123', domain: 'temp-ok.com', durationInMinutes: 15 });
    expect(tempValid.success).toBe(true);

    const tempBadDuration = await messageHandlers.TEMP_ALLOW({ profileId: 'prof123', domain: 'temp-bad.com', durationInMinutes: -5 });
    expect(tempBadDuration.success).toBe(true);

    // 11. handlers.js GET_ANALYTICS status endpoint vs custom endpoint
    const statusAnalytics = await messageHandlers.GET_ANALYTICS({ profileId: 'prof123', endpoint: 'status', series: true });
    expect(statusAnalytics.success).toBe(true);

    const customAnalytics = await messageHandlers.GET_ANALYTICS({ profileId: 'prof123', endpoint: 'reasons' });
    expect(customAnalytics.success).toBe(true);

    // 12. handlers.js PUSH_NOTIFICATION trigger filters & alert settings branches
    // Alert disabled completely
    await global.storage.set('alertSettings', { enabled: false });
    const pushDisabled = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'ddns', severity: 'low', message: 'test' } });
    expect(pushDisabled.reason).toBe('alerts_disabled');

    // Specific trigger type disabled (threats, denylist, parental)
    await global.storage.set('alertSettings', { enabled: true, triggerThreats: false, triggerDenylist: false, triggerParental: false });
    const pushSecDisabled = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', severity: 'high', message: 'test' } });
    expect(pushSecDisabled.reason).toBe('trigger_type_disabled');
    const pushDenyDisabled = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'denylist', severity: 'high', message: 'test' } });
    expect(pushDenyDisabled.reason).toBe('trigger_type_disabled');
    const pushBlockDisabled = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'block', severity: 'high', message: 'test' } });
    expect(pushBlockDisabled.reason).toBe('trigger_type_disabled');
    const pushParentalDisabled = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'parental', severity: 'high', message: 'test' } });
    expect(pushParentalDisabled.reason).toBe('trigger_type_disabled');

    // Desktop notification branch with browser.notifications and action center pruning > 50
    state.notifications = Array.from({ length: 50 }, (_, i) => ({ id: `n_${i}` }));
    global.browser.notifications = {
      create: jest.fn().mockImplementation((opts) => {
        if (opts.title.includes('Throw')) throw new Error('Notification creation failed');
        return Promise.resolve('notif1');
      })
    };
    await global.storage.set('alertSettings', { enabled: true, triggerThreats: true, desktop: true, actionCenter: true });
    const pushDesktopOk = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', severity: 'high', message: 'alert message' } });
    expect(pushDesktopOk.success).toBe(true);
    expect(state.notifications.length).toBe(50);
    expect(global.browser.notifications.create).toHaveBeenCalled();

    // Desktop notification branch with error catch
    await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', severity: 'low', message: 'Throw err' } });

    // 13. handlers.js SAVE_SCRAPED_META invalid payload & metaType checks
    const badScrapedPayload = await messageHandlers.SAVE_SCRAPED_META({});
    expect(badScrapedPayload.error).toBe('Invalid payload');

    const badMetaType = await messageHandlers.SAVE_SCRAPED_META({ payload: { metaType: 'invalid_type', data: [] } });
    expect(badMetaType.error).toBe('Invalid metaType or data format');

    // 14. handlers.js MANAGE_DOMAIN mirror mode with empty mirror list and self-only mirror list
    await global.storage.set('mirrorProfiles', ['prof123']); // only self in mirrors
    const manageMirrorSelfOnly = await messageHandlers.MANAGE_DOMAIN({ profileId: 'prof123', listType: 'allowlist', domain: 'selfonly.com', action: 'add' });
    expect(manageMirrorSelfOnly.success).toBe(true);

    // 15. handlers.js GET_ALL_SETTINGS settings/performance structure branches
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/settings/performance')) {
        return { success: true, response: { json: async () => ({ ecs: true, cacheBoost: true, cnameFlattening: false }) } };
      }
      return { success: true, response: { json: async () => ({}) } };
    });
    const settingsFlatPerf = await messageHandlers.GET_ALL_SETTINGS({ profileId: 'prof123' });
    expect(settingsFlatPerf.success).toBe(true);
    expect(settingsFlatPerf.data.settings.ecs).toBe(true);

    // Test alternate branch: data.settings.performance already present and settings/performance missing
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.endsWith('/settings')) {
        return { success: true, response: { json: async () => ({ performance: { ecs: false, cacheBoost: false, cnameFlattening: true } }) } };
      }
      if (url.includes('/settings/performance')) {
        return { success: false };
      }
      return { success: true, response: { json: async () => ({}) } };
    });
    const settingsNestedPerf = await messageHandlers.GET_ALL_SETTINGS({ profileId: 'prof123' });
    expect(settingsNestedPerf.success).toBe(true);
    expect(settingsNestedPerf.data.settings.ecs).toBe(false);

    // 16. handlers.js CREATE_SNAPSHOT default generated name and quota byte pruning
    const largeObj = { chunk: 'x'.repeat(600000) };
    await global.storage.set('profileSnapshots', {
      prof123: [
        { id: 'old1', name: 'Snap 1', timestamp: 1, data: largeObj },
        { id: 'old2', name: 'Snap 2', timestamp: 2, data: largeObj },
        { id: 'old3', name: 'Snap 3', timestamp: 3, data: largeObj },
        { id: 'old4', name: 'Snap 4', timestamp: 4, data: largeObj }
      ]
    });
    // Create unnamed snapshot triggering default fallback name and 2MB byte pruning
    const unnamedSnap = await messageHandlers.CREATE_SNAPSHOT({ profileId: 'prof123', name: '' });
    expect(unnamedSnap.success).toBe(true);
    expect(unnamedSnap.snapshot.name).toMatch(/Snapshot /);

    // 17. handlers.js SAVE_REWRITE & DELETE_REWRITE error propagation
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false, error: 'Rewrite save failed' });
    const saveErr = await messageHandlers.SAVE_REWRITE({ profileId: 'prof123', name: 'domain.com', content: '1.2.3.4' });
    expect(saveErr.success).toBe(false);
    expect(saveErr.error).toBe('Rewrite save failed');

    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true });
    const delById = await messageHandlers.DELETE_REWRITE({ profileId: 'prof123', id: 'target-rewrite-id' });
    expect(delById.success).toBe(true);
    expect(apiClient.fetchWithRetry).toHaveBeenCalledWith('/profiles/prof123/rewrites/target-rewrite-id', { method: 'DELETE' });

    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false, error: 'Rewrite deletion failed' });
    const delErr = await messageHandlers.DELETE_REWRITE({ profileId: 'prof123', id: 'target-rewrite-id' });
    expect(delErr.success).toBe(false);
    expect(delErr.error).toBe('Rewrite deletion failed');

    // 18. handlers.js RUN_DIAGNOSTICS, GET_NOTIFICATIONS, CLEAR_NOTIFICATIONS
    const runDiagRes = await messageHandlers.RUN_DIAGNOSTICS();
    expect(runDiagRes.success).toBe(true);

    const notifsRes = await messageHandlers.GET_NOTIFICATIONS();
    expect(notifsRes.success).toBe(true);
    expect(Array.isArray(notifsRes.notifications)).toBe(true);

    // Test GET_NOTIFICATIONS when state.notifications is undefined/falsy
    const origNotifs = state.notifications;
    state.notifications = null;
    const notifsNullRes = await messageHandlers.GET_NOTIFICATIONS();
    expect(notifsNullRes.notifications).toEqual([]);
    state.notifications = origNotifs;

    const clearNotifsRes = await messageHandlers.CLEAR_NOTIFICATIONS();
    expect(clearNotifsRes.success).toBe(true);
    expect(state.notifications).toEqual([]);

    // Test PUSH_NOTIFICATION when browser.notifications is undefined
    const origBrowserNotifs = global.browser.notifications;
    delete global.browser.notifications;
    await global.storage.set('alertSettings', { enabled: true, triggerThreats: true, desktop: true, actionCenter: false });
    const pushNoNotifApi = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', severity: 'high', message: 'No browser API' } });
    expect(pushNoNotifApi.success).toBe(true);
    global.browser.notifications = origBrowserNotifs;

    // Restore mocks
    apiClient.fetchWithRetry = origFetch;
    global.fetch = origGlobalFetch;
  });

  test('handlers.js - Targeted Branch Hardening for 90%+ Branch Coverage', async () => {
    const { messageHandlers } = await import('../src/background/handlers.js');
    const { apiClient } = await import('../src/apiClient.js');
    const { state } = await import('../src/background/state.js');
    const origFetch = apiClient.fetchWithRetry;

    // 1. GET_ANALYTICS branches
    // 1a. endpoint status with series: true
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: { json: async () => ({ data: [{ queries: 100, timestamp: 123 }] }) }
    });
    const seriesStatusRes = await messageHandlers.GET_ANALYTICS({ profileId: 'prof123', endpoint: 'status', series: true });
    expect(seriesStatusRes.success).toBe(true);
    expect(seriesStatusRes.data[0].queries).toBe(100);

    // 1b. endpoint !== 'status' with series flag
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: { json: async () => ({ data: [{ name: 'device1', queries: 50 }] }) }
    });
    const nonStatusRes = await messageHandlers.GET_ANALYTICS({ profileId: 'prof123', endpoint: 'devices', series: false });
    expect(nonStatusRes.success).toBe(true);
    expect(nonStatusRes.data[0].name).toBe('device1');

    // 1c. non-status with fetch failure
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false });
    const nonStatusFail = await messageHandlers.GET_ANALYTICS({ profileId: 'prof123', endpoint: 'protocols' });
    expect(nonStatusFail.success).toBe(false);
    expect(nonStatusFail.data).toEqual([]);

    // 1d. status with total === 0 (blockedPercent: 0)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: { json: async () => ({ data: [] }) }
    });
    const zeroQueriesRes = await messageHandlers.GET_ANALYTICS({ profileId: 'prof123', endpoint: 'status' });
    expect(zeroQueriesRes.success).toBe(true);
    expect(zeroQueriesRes.data.blockedPercent).toBe(0);

    // 1e. fetch rejection / exception in GET_ANALYTICS
    apiClient.fetchWithRetry = jest.fn().mockRejectedValue(new Error('Network offline'));
    const analyticsExceptStatus = await messageHandlers.GET_ANALYTICS({ profileId: 'prof123', endpoint: 'status' });
    expect(analyticsExceptStatus.success).toBe(false);
    expect(analyticsExceptStatus.data).toEqual({});

    const analyticsExceptOther = await messageHandlers.GET_ANALYTICS({ profileId: 'prof123', endpoint: 'devices' });
    expect(analyticsExceptOther.success).toBe(false);
    expect(analyticsExceptOther.data).toEqual([]);

    // 2. TOGGLE_SETTING branches
    // 2a. Category invalid validation branch
    const badCatRes = await messageHandlers.TOGGLE_SETTING({ profileId: 'prof123', category: 'bad/cat/invalid!' });
    expect(badCatRes.success).toBe(false);
    expect(badCatRes.error).toBe('Invalid setting category');

    // 2b. ID path traversal validation branches
    const badIdRes1 = await messageHandlers.TOGGLE_SETTING({ profileId: 'prof123', category: 'security', id: 'path/traversal' });
    expect(badIdRes1.success).toBe(false);
    expect(badIdRes1.error).toBe('Invalid setting ID');

    const badIdRes2 = await messageHandlers.TOGGLE_SETTING({ profileId: 'prof123', category: 'security', id: 'path\\traversal' });
    expect(badIdRes2.success).toBe(false);
    const badIdRes3 = await messageHandlers.TOGGLE_SETTING({ profileId: 'prof123', category: 'security', id: 'path..traversal' });
    expect(badIdRes3.success).toBe(false);

    // 2c. Custom settingType (not 'list' and not 'boolean')
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true });
    const customSettingRes = await messageHandlers.TOGGLE_SETTING({
      profileId: 'prof123',
      category: 'settings',
      id: 'logRetention',
      value: 30,
      settingType: 'number'
    });
    expect(customSettingRes.success).toBe(true);

    // 2d. TOGGLE_SETTING fallback profile from overrideProfileId when activeProfile is absent
    await global.storage.set('activeProfile', null);
    await global.storage.set('overrideProfileId', 'profOverrideFallback');
    const overrideToggleRes = await messageHandlers.TOGGLE_SETTING({
      category: 'security',
      id: 'block_ai',
      action: 'add',
      settingType: 'boolean'
    });
    expect(overrideToggleRes.success).toBe(true);

    // 3. DEBUG_TAB branches
    // 3a. requestedDomains length 0
    state.tabRequests[999] = {};
    const debugEmptyDomains = await messageHandlers.DEBUG_TAB({ tabId: 999, profileId: 'prof123' });
    expect(debugEmptyDomains.success).toBe(true);
    expect(debugEmptyDomains.correlations).toEqual([]);

    // 3b. fetch fails
    state.tabRequests[998] = { 'example.com': { status: 'blocked', reason: 'Blocked' } };
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false });
    const debugFetchFail = await messageHandlers.DEBUG_TAB({ tabId: 998, profileId: 'prof123' });
    expect(debugFetchFail.success).toBe(false);
    expect(debugFetchFail.error).toBe('Failed to fetch logs');

    // 3c. logs json parsing error
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: { json: async () => { throw new Error('Bad json'); } }
    });
    const debugJsonError = await messageHandlers.DEBUG_TAB({ tabId: 998, profileId: 'prof123' });
    expect(debugJsonError.success).toBe(true);

    // 3d. logs match with l.domain and fallback reason string
    state.tabRequests[997] = {
      'matched-domain.com': { status: 'blocked', timestamp: 100 },
      'local-only.com': { status: 'blocked', reason: 'Custom Local Reason' },
      'allowed-domain.com': { status: 'allowed' }
    };
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: {
        json: async () => ({
          data: [
            { domain: 'matched-domain.com', status: 'denied', reason: 'Explicit Denial', clientIp: '1.2.3.4' }
          ]
        })
      }
    });
    const debugMatchRes = await messageHandlers.DEBUG_TAB({ tabId: 997, profileId: 'prof123' });
    expect(debugMatchRes.success).toBe(true);
    expect(debugMatchRes.correlations.length).toBe(2);
    expect(debugMatchRes.correlations[0].device).toBe('1.2.3.4');

    // 4. SAVE_RULE & DELETE_RULE branches
    // 4a. SAVE_RULE with invalid rule definition
    const saveRuleInvalid = await messageHandlers.SAVE_RULE({ rule: null });
    expect(saveRuleInvalid.success).toBe(false);
    expect(saveRuleInvalid.error).toBe('Invalid rule definition');

    // 4b. DELETE_RULE with missing ruleId
    const delRuleMissing = await messageHandlers.DELETE_RULE({});
    expect(delRuleMissing.success).toBe(false);
    expect(delRuleMissing.error).toBe('Missing ruleId');

    // 4c. LIST_RULES when storage returns non-array
    await global.storage.set('forgeRules', null);
    const listRulesNull = await messageHandlers.LIST_RULES();
    expect(listRulesNull.rules).toEqual([]);

    // 5. PUSH_NOTIFICATION trigger filter branches
    // 5a. Empty msg.payload (line 545 fallback)
    const pushEmptyPayload = await messageHandlers.PUSH_NOTIFICATION({});
    expect(pushEmptyPayload.success).toBe(true);

    // 5b. alerts_disabled (line 557)
    await global.storage.set('alertSettings', { enabled: false });
    const pushDisabled = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security' } });
    expect(pushDisabled.success).toBe(false);
    expect(pushDisabled.reason).toBe('alerts_disabled');

    // 5c. trigger filters disabled
    await global.storage.set('alertSettings', {
      enabled: true,
      desktop: true,
      actionCenter: true,
      triggerThreats: false,
      triggerDenylist: false,
      triggerParental: false
    });
    const pushThreatBlocked = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security' } });
    expect(pushThreatBlocked.success).toBe(false);
    expect(pushThreatBlocked.reason).toBe('trigger_type_disabled');

    const pushDenyBlocked = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'denylist' } });
    expect(pushDenyBlocked.success).toBe(false);

    // type 'block' (line 564)
    const pushBlockBlocked = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'block' } });
    expect(pushBlockBlocked.success).toBe(false);

    const pushParentalBlocked = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'parental' } });
    expect(pushParentalBlocked.success).toBe(false);

    // 5d. Delivery to Action Center and Desktop notification (lines 585 & 592)
    await global.storage.set('alertSettings', {
      enabled: true,
      desktop: true,
      actionCenter: true,
      triggerThreats: true
    });
    global.browser.notifications = { create: jest.fn().mockResolvedValue('notif-id-1') };
    const pushDelivered = await messageHandlers.PUSH_NOTIFICATION({
      payload: { type: 'security', severity: 'high', message: 'Threat blocked' }
    });
    expect(pushDelivered.success).toBe(true);
    expect(global.browser.notifications.create).toHaveBeenCalled();

    // 6. SAVE_SCRAPED_META branches
    const saveMetaNull = await messageHandlers.SAVE_SCRAPED_META(null);
    expect(saveMetaNull.success).toBe(false);
    expect(saveMetaNull.error).toBe('Invalid payload');

    const saveMetaInvalidType = await messageHandlers.SAVE_SCRAPED_META({ payload: { metaType: 'unknown_type', data: [] } });
    expect(saveMetaInvalidType.success).toBe(false);
    expect(saveMetaInvalidType.error).toBe('Invalid metaType or data format');

    const saveMetaNonArrayData = await messageHandlers.SAVE_SCRAPED_META({ payload: { metaType: 'blocklists', data: 'not_array' } });
    expect(saveMetaNonArrayData.success).toBe(false);

    // 7. CLEAR_TAB_STATS branches
    state.tabRequests[12345] = { 'test.com': {} };
    state.blockedTabRequests[12345] = 2;
    await messageHandlers.CLEAR_TAB_STATS({ tabId: 12345 });
    expect(state.tabRequests[12345]).toEqual({});
    expect(state.blockedTabRequests[12345]).toBe(0);

    // CLEAR_TAB_STATS when tabId does not exist in state
    await messageHandlers.CLEAR_TAB_STATS({ tabId: 999999 });
    // CLEAR_TAB_STATS when tabId is undefined
    await messageHandlers.CLEAR_TAB_STATS({});

    // 8. GET_PROFILES_LIST branches (custom apiKey trimming, direct array vs data property)
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (endpoint, opts) => {
      if (opts?.headers?.['X-Api-Key']) {
        return { success: true, response: { json: async () => [{ id: 'pCustom' }] } };
      }
      return { success: true, response: { json: async () => ({}) } };
    });
    const profilesWithKey = await messageHandlers.GET_PROFILES_LIST({ apiKey: '  custom-key  ' });
    expect(profilesWithKey.success).toBe(true);
    expect(profilesWithKey.data[0].id).toBe('pCustom');

    const profilesNoData = await messageHandlers.GET_PROFILES_LIST({});
    expect(profilesNoData.success).toBe(true);
    expect(profilesNoData.data).toEqual([]);

    // 9. DELETE_SNAPSHOT when profile exists vs does not exist
    await global.storage.set('profileSnapshots', {
      prof123: [{ id: 'snap1', name: 'Snap 1' }]
    });
    const delSnapSuccess = await messageHandlers.DELETE_SNAPSHOT({ profileId: 'prof123', snapshotId: 'snap1' });
    expect(delSnapSuccess.success).toBe(true);

    const delSnapNonExistentProfile = await messageHandlers.DELETE_SNAPSHOT({ profileId: 'prof99999', snapshotId: 'snap1' });
    expect(delSnapNonExistentProfile.success).toBe(true);

    // 10. CLEAR_LOGS error propagation (line 461)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false, error: 'Clear logs failed' });
    const clearLogsErr = await messageHandlers.CLEAR_LOGS({ profileId: 'prof123' });
    expect(clearLogsErr.success).toBe(false);
    expect(clearLogsErr.error).toBe('Clear logs failed');

    // 11. SAVE_RULE and DELETE_RULE when storage returns non-array (lines 478, 491)
    await global.storage.set('forgeRules', 'not-an-array');
    const saveRuleNonArray = await messageHandlers.SAVE_RULE({ rule: { name: 'New Rule' } });
    expect(saveRuleNonArray.success).toBe(true);

    await global.storage.set('forgeRules', 'not-an-array');
    const delRuleNonArray = await messageHandlers.DELETE_RULE({ ruleId: 'some-id' });
    expect(delRuleNonArray.success).toBe(true);

    // 12. LIST_REWRITES fetch failure and error propagation (line 503)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false, error: 'Rewrite list error' });
    const listRewritesErr = await messageHandlers.LIST_REWRITES({ profileId: 'prof123' });
    expect(listRewritesErr.success).toBe(false);
    expect(listRewritesErr.error).toBe('Rewrite list error');

    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false }); // r.error undefined fallback
    const listRewritesFallbackErr = await messageHandlers.LIST_REWRITES({ profileId: 'prof123' });
    expect(listRewritesFallbackErr.success).toBe(false);
    expect(listRewritesFallbackErr.error).toBe('Failed to fetch rewrites');

    // 13. PUSH_NOTIFICATION Action Center feed delivery when actionCenter: false (line 584)
    await global.storage.set('alertSettings', {
      enabled: true,
      desktop: false,
      actionCenter: false,
      triggerThreats: true
    });
    const pushNoActionCenter = await messageHandlers.PUSH_NOTIFICATION({
      payload: { type: 'security', severity: 'low', message: 'Silent alert' }
    });
    expect(pushNoActionCenter.success).toBe(true);

    // 14. CREATE_SNAPSHOT branches (configRes failure, profileSnapshots length > 10)
    const origGetAllSettings = messageHandlers.GET_ALL_SETTINGS;
    messageHandlers.GET_ALL_SETTINGS = jest.fn().mockResolvedValue({ success: false, error: 'Config fetch error' });
    const snapConfigErr = await messageHandlers.CREATE_SNAPSHOT({ profileId: 'prof123' });
    expect(snapConfigErr.success).toBe(false);
    expect(snapConfigErr.error).toBe('Config fetch error');

    // Also test fallback error string when error is undefined (line 388: error || "Failed to fetch current config")
    messageHandlers.GET_ALL_SETTINGS = jest.fn().mockResolvedValue({ success: false });
    const snapConfigFallbackErr = await messageHandlers.CREATE_SNAPSHOT({ profileId: 'prof123' });
    expect(snapConfigFallbackErr.success).toBe(false);
    expect(snapConfigFallbackErr.error).toBe('Failed to fetch current config');
    messageHandlers.GET_ALL_SETTINGS = origGetAllSettings;

    // CREATE_SNAPSHOT when msg is empty/null (line 384 fallback)
    const snapNullMsg = await messageHandlers.CREATE_SNAPSHOT();
    expect(snapNullMsg.success).toBe(false);
    expect(snapNullMsg.error).toBe('Profile ID required');

    // CREATE_SNAPSHOT catch block fallback error string (line 414: e.message || "Failed to save snapshot")
    const origStorageSet = global.storage.set;
    global.storage.set = jest.fn().mockRejectedValue({}); // e.message is undefined
    const snapSaveCatchErr = await messageHandlers.CREATE_SNAPSHOT({ profileId: 'prof123', name: 'Catch Test' });
    expect(snapSaveCatchErr.success).toBe(false);
    expect(snapSaveCatchErr.error).toBe('Failed to save snapshot');
    global.storage.set = origStorageSet;

    // DEBUG_TAB fallback timestamp (line 358: tabData[domain]?.timestamp || Date.now())
    state.tabRequests[994] = {
      'fallback-ts.com': { status: 'blocked' } // no timestamp
    };
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: {
        json: async () => ({
          data: [{ domain: 'fallback-ts.com', status: 'blocked' }] // no timestamp, no reasons, no device
        })
      }
    });
    const debugFallbackTs = await messageHandlers.DEBUG_TAB({ tabId: 994, profileId: 'prof123' });
    expect(debugFallbackTs.success).toBe(true);
    expect(debugFallbackTs.correlations[0].timestamp).toBeGreaterThan(0);
    expect(debugFallbackTs.correlations[0].device).toBe('NextDNS Profile');
    expect(debugFallbackTs.correlations[0].reasons).toEqual(['Cloud Blocklist']);

    // 15. LIST_SNAPSHOTS when profile not in profileSnapshots (line 424 fallback)
    const listSnapEmpty = await messageHandlers.LIST_SNAPSHOTS({ profileId: 'profNonExistent' });
    expect(listSnapEmpty.success).toBe(true);
    expect(listSnapEmpty.snapshots).toEqual([]);

    // 16. DEBUG_TAB seenDomains branch for duplicate local blocked domains and cloud logs (lines 335, 353, 363)
    // Line 335: tabId not in state.tabRequests (fallback to {})
    const debugMissingTab = await messageHandlers.DEBUG_TAB({ tabId: 999999, profileId: 'prof123' });
    expect(debugMissingTab.success).toBe(true);
    expect(debugMissingTab.correlations).toEqual([]);

    // Line 353 & 363: duplicate domains in requestedDomains where seenDomains.has(domain) is true
    // In JavaScript Object.keys() cannot have duplicate keys, but we can exercise seenDomains.has()
    // if requestedDomains contains duplicates or if we test the branches directly.
    // Wait, let's also test CREATE_SNAPSHOT when profileSnapshots[profileId].length > 10 (line 400 pop())
    const tenSnapshots = Array.from({ length: 10 }, (_, i) => ({ id: `snap_${i}`, timestamp: Date.now() }));
    await global.storage.set('profileSnapshots', { prof123: tenSnapshots });
    const snapOverTen = await messageHandlers.CREATE_SNAPSHOT({ profileId: 'prof123', name: 'Over Ten' });
    expect(snapOverTen.success).toBe(true);
    const storedSnaps = await global.storage.get('profileSnapshots', {});
    expect(storedSnaps.prof123.length).toBe(10);

    // PUSH_NOTIFICATION when state.notifications.length > 50 (line 587 pop())
    state.notifications = Array.from({ length: 50 }, (_, i) => ({ id: `notif_${i}`, message: `msg ${i}` }));
    await global.storage.set('alertSettings', {
      enabled: true,
      actionCenter: true,
      triggerThreats: true
    });
    const pushOverFifty = await messageHandlers.PUSH_NOTIFICATION({
      payload: { type: 'security', severity: 'high', message: 'Fifty first alert' }
    });
    expect(pushOverFifty.success).toBe(true);
    expect(state.notifications.length).toBe(50);

    // 17. GET_NETWORK_STATUS cache expiration (> 300000ms)
    state.networkStatus = { lastChecked: Date.now() - 400000 };
    const netStatusFresh = await messageHandlers.GET_NETWORK_STATUS();
    expect(netStatusFresh.success).toBe(true);

    // Restore fetch mock
    apiClient.fetchWithRetry = origFetch;
  });

  test('requestListener - Exhaustive Branch Coverage to 100%', async () => {
    const { requestListener } = await import('../src/background/requestListener.js');
    const { state } = await import('../src/background/state.js');

    // 1. Line 18: details.tabId < 0 (e.g. background request) -> returns { cancel: false }
    const bgReq = requestListener({ tabId: -1, url: 'https://example.com' });
    expect(bgReq).toEqual({ cancel: false });

    // 2. Line 22: malformed URL / missing domain -> returns { cancel: false }
    const badUrl = requestListener({ tabId: 1, url: 'javascript:void(0)' });
    expect(badUrl).toEqual({ cancel: false });

    // 3. Line 46: tabDomains keys >= 300 triggers LRU delete
    state.tabRequests[2] = {};
    for (let i = 0; i < 305; i++) {
      state.tabRequests[2][`domain${i}.com`] = { status: 'default', reason: 'Default', timestamp: Date.now() };
    }
    const lruReq = requestListener({ tabId: 2, url: 'https://newdomain.com' });
    expect(lruReq).toEqual({ cancel: false });
    expect(Object.keys(state.tabRequests[2]).length).toBeLessThanOrEqual(305);

    // 4. Line 58: state.localLogs is non-array / uninitialized
    state.localLogs = null;
    requestListener({ tabId: 2, url: 'https://init-logs.com' });
    expect(Array.isArray(state.localLogs)).toBe(true);

    // Pre-seed recentLogTimestamps with 305 entries where some are > 10000ms old (lines 64-67)
    state.recentLogTimestamps = new Map();
    const now = Date.now();
    for (let i = 0; i < 305; i++) {
      state.recentLogTimestamps.set(`old${i}.com`, now - 15000);
    }
    // Seed state.localLogs with exactly 200 items so unshift (201) + pop leaves 200 (line 80 pop())
    state.localLogs = Array.from({ length: 200 }, (_, i) => ({ domain: `d${i}.com` }));

    const pruneReq = requestListener({ tabId: 2, url: 'https://eviction-test.com' });
    expect(pruneReq).toEqual({ cancel: false });
    expect(state.localLogs.length).toBe(200);
    expect(state.recentLogTimestamps.size).toBeLessThan(300);

    // 5. Line 62: now - lastLogTime < 3000ms (debounce branch)
    state.recentLogTimestamps.set('debounced.com', Date.now());
    const debouncedReq = requestListener({ tabId: 2, url: 'https://debounced.com' });
    expect(debouncedReq).toEqual({ cancel: false });

    // 6. Line 44: tabDomains[domain] already exists (line 44 false branch)
    state.recentLogTimestamps.delete('existing-domain.com');
    requestListener({ tabId: 2, url: 'https://existing-domain.com' });
    // Second request for same domain exercises line 44 false branch
    state.recentLogTimestamps.delete('existing-domain.com');
    const repeatReq = requestListener({ tabId: 2, url: 'https://existing-domain.com' });
    expect(repeatReq).toEqual({ cancel: false });

    // 7. Line 81: browser.runtime.sendMessage is a function
    global.browser.runtime.sendMessage = jest.fn().mockRejectedValue(new Error('Send error'));
    state.recentLogTimestamps.delete('broadcast.com');
    const broadcastReq = requestListener({ tabId: 2, url: 'https://broadcast.com' });
    expect(broadcastReq).toEqual({ cancel: false });
    expect(global.browser.runtime.sendMessage).toHaveBeenCalled();

    // 7b. Line 76: url.protocol fallback ('HTTP' when falsy)
    const origURL = global.URL;
    class MockProtoURL extends origURL {
      constructor(u) {
        super(u);
        if (typeof u === 'string' && u.includes('no-proto.com')) {
          Object.defineProperty(this, 'protocol', { value: '' });
        }
      }
    }
    global.URL = MockProtoURL;
    state.recentLogTimestamps.delete('no-proto.com');
    const noProtoReq = requestListener({ tabId: 2, url: 'https://no-proto.com' });
    expect(noProtoReq).toEqual({ cancel: false });
    expect(state.localLogs[0].protocol).toBe('HTTP');
    global.URL = origURL;

    // 8. Line 91: exception handling in URL parsing / processing
    const errReq = requestListener({ tabId: 2, url: null });
    expect(errReq).toEqual({ cancel: false });
  });

  test('background api.js & main.js - 100% Branch and Function Coverage', async () => {
    const bgApi = await import('../src/background/api.js');
    const bgMain = await import('../src/background/main.js');
    const { apiClient } = await import('../src/apiClient.js');
    const { state } = await import('../src/background/state.js');
    const origFetch = apiClient.fetchWithRetry;

    // --- src/background/api.js hardening ---

    // 1. _resetUpdateCacheInFlight
    bgApi._resetUpdateCacheInFlight();
    bgApi._resetDetectInFlight();

    // 2. manageDomain: action === 'list' with falsy res.error (line 42)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false, error: '' });
    const listErrFallback = await bgApi.manageDomain('p123', 'allowlist', null, 'list');
    expect(listErrFallback).toEqual({ error: 'Fetch Error' });

    // 3. manageDomain: catch error without error.message (line 47)
    apiClient.fetchWithRetry = jest.fn().mockRejectedValue({});
    const manageNetErrFallback = await bgApi.manageDomain('p123', 'allowlist', 'domain.com', 'add');
    expect(manageNetErrFallback).toEqual({ success: false, error: 'Network Error' });

    // 4. detectActiveProfile: pData.data is not an array (line 98)
    await global.storage.set('apiKey', 'test-key');
    await global.storage.set('overrideProfileId', '');
    await global.storage.set('activeProfile', '');
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/profiles')) {
        return { success: true, response: { json: async () => ({ data: 'not-an-array' }) } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();

    // 5. detectActiveProfile: test.nextdns.io data.status falsy (line 142)
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        return { success: true, response: { json: async () => ({ status: '' }) } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();
    expect(state.networkStatus.status).toBe('unconfigured');

    // 6. detectActiveProfile: info fallback with infoData.client (no ip), then state.networkStatus.clientIp, then '' (line 183)
    state.networkStatus = { clientIp: '10.0.0.1' };
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/info')) {
        return { success: true, response: { json: async () => ({ pop: 'cdg', client: '1.2.3.4' }) } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();
    expect(state.networkStatus.clientIp).toBe('1.2.3.4');

    // infoData without ip or client, falling back to state.networkStatus.clientIp
    state.networkStatus.clientIp = '10.0.0.1';
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/info')) {
        return { success: true, response: { json: async () => ({ pop: 'cdg' }) } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();
    expect(state.networkStatus.clientIp).toBe('10.0.0.1');

    // infoData without ip or client, state.networkStatus.clientIp falsy -> fallback to ''
    state.networkStatus.clientIp = '';
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();
    expect(state.networkStatus.clientIp).toBe('');

    // 7. updateProfileCache: activeProfileId.startsWith('fp') (line 228)
    await global.storage.set('activeProfile', 'fp-guest');
    bgApi._resetUpdateCacheInFlight();
    await bgApi.updateProfileCache();

    // 8. checkAndUpdateLinkedIP: activeProfileId.startsWith('fp') (line 257)
    await global.storage.set('activeProfile', 'fp-guest');
    await bgApi.checkAndUpdateLinkedIP();

    // 9. checkAndUpdateLinkedIP: detected IP is invalid format (line 303-305)
    await global.storage.set('activeProfile', 'pValid123');
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/profiles/pValid123')) {
        return { success: true, response: { json: async () => ({ data: { linkedIp: '1.1.1.1' } }) } };
      }
      if (url === 'https://test.nextdns.io/') {
        return { success: true, response: { json: async () => ({ client: 'invalid-ip-string' }) } };
      }
      return { success: false };
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await bgApi.checkAndUpdateLinkedIP();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[DDNS] Detected invalid IP format:'), 'invalid-ip-string');
    warnSpy.mockRestore();

    // 10. runNetworkDiagnostics: performance is undefined or has no now (lines 326, 347)
    const origPerf = global.performance;
    global.performance = { now: null };
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true, response: { json: async () => ({}) } });
    const noPerfDiag = await bgApi.runNetworkDiagnostics();
    expect(noPerfDiag).toBeDefined();

    delete global.performance;
    const undefPerfDiag = await bgApi.runNetworkDiagnostics();
    expect(undefPerfDiag).toBeDefined();
    global.performance = origPerf;

    // 11. runNetworkDiagnostics: activeProfile fallback to detectedProfileId, activeProfileName fallback to Unknown (lines 352-353)
    await global.storage.set('activeProfile', null);
    await global.storage.set('detectedProfileId', 'pDetFallback');
    await global.storage.set('activeProfileName', null);
    const diagDetProfile = await bgApi.runNetworkDiagnostics();
    expect(diagDetProfile.activeProfileId).toBe('pDetFallback');
    expect(diagDetProfile.activeProfileName).toBe('pDetFallback');

    await global.storage.set('detectedProfileId', null);
    const diagUnknownProfile = await bgApi.runNetworkDiagnostics();
    expect(diagUnknownProfile.activeProfileName).toBe('Unknown');

    // 12. runNetworkDiagnostics: activeProfileId fallback to testData.profile, manifest version fallback (lines 369-371)
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        return { success: true, response: { json: async () => ({ profile: 'pFromTestData' }) } };
      }
      return { success: true, response: { json: async () => ({}) } };
    });
    const origGetManifest = global.browser.runtime.getManifest;
    global.browser.runtime.getManifest = () => ({}); // no version property
    const diagManifestFallback = await bgApi.runNetworkDiagnostics();
    expect(diagManifestFallback.activeProfileId).toBe('pFromTestData');
    expect(diagManifestFallback.extensionVersion).toBe('1.2.2');

    // browser.runtime.getManifest with valid version
    global.browser.runtime.getManifest = () => ({ version: '2.0.0' });
    const diagManifestWithVersion = await bgApi.runNetworkDiagnostics();
    expect(diagManifestWithVersion.extensionVersion).toBe('2.0.0');

    // browser.runtime.getManifest is undefined
    delete global.browser.runtime.getManifest;
    const diagNoManifestFn = await bgApi.runNetworkDiagnostics();
    expect(diagNoManifestFn.extensionVersion).toBe('1.2.2');
    global.browser.runtime.getManifest = origGetManifest;

    // browser is undefined
    const origBrowser = global.browser;
    delete global.browser;
    const diagNoBrowser = await bgApi.runNetworkDiagnostics();
    expect(diagNoBrowser.extensionVersion).toBe('1.2.2');
    global.browser = origBrowser;

    // --- src/background/main.js hardening ---

    // 13. initializeBackground: state.isInitialized is already true (line 38)
    state.isInitialized = true;
    await bgMain.initializeBackground();

    // 14. onMessage: handler throws error without message (line 106)
    const { messageHandlers } = await import('../src/background/handlers.js');
    const origGetLogs = messageHandlers.GET_LOGS;
    messageHandlers.GET_LOGS = jest.fn().mockRejectedValue({});
    let msgResponse = null;
    messageHandlerRef({ type: 'GET_LOGS' }, { id: browser.runtime.id }, r => msgResponse = r);
    await new Promise(r => setTimeout(r, 20));
    expect(msgResponse).toEqual({ success: false, error: 'Handler error' });
    messageHandlers.GET_LOGS = origGetLogs;

    // 15. onMessage: sender with tab.url but no sender.url (line 85)
    let webTabResponse = null;
    messageHandlerRef({ type: 'DISALLOWED_ACTION' }, { tab: { url: 'https://evil.com' } }, r => webTabResponse = r);
    expect(webTabResponse).toEqual({ success: false, error: 'Unauthorized action from web tab' });

    // onMessage: sender with no url and no tab.url
    let emptySenderResponse = null;
    messageHandlerRef({ type: 'DISALLOWED_ACTION' }, { tab: {} }, r => emptySenderResponse = r);
    expect(emptySenderResponse).toEqual({ success: false, error: 'Unauthorized action from web tab' });

    // 16. action.onClicked: sidebar fallback when sidebarAction.open is falsy (line 185)
    await global.storage.set('iconClickAction', 'sidebar');
    const origSidebarOpen = global.browser.sidebarAction.open;
    delete global.browser.sidebarAction.open;
    await actionClickListenerRef();
    expect(global.browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('mode=tab') }));
    global.browser.sidebarAction.open = origSidebarOpen;

    // Sidebar fallback when both sidebarAction.open and tabs.create are falsy
    const origTabsCreate = global.browser.tabs.create;
    delete global.browser.tabs.create;
    delete global.browser.sidebarAction.open;
    await global.storage.set('iconClickAction', 'sidebar');
    await actionClickListenerRef();
    global.browser.tabs.create = origTabsCreate;
    global.browser.sidebarAction.open = origSidebarOpen;

    // 17. action.onClicked: popout fallback when windows.create is falsy (line 197)
    await global.storage.set('iconClickAction', 'popout');
    const origWinCreate = global.browser.windows.create;
    delete global.browser.windows.create;
    await actionClickListenerRef();
    expect(global.browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('mode=popout') }));
    global.browser.windows.create = origWinCreate;

    // Popout fallback when both windows.create and tabs.create are falsy
    delete global.browser.windows.create;
    delete global.browser.tabs.create;
    await global.storage.set('iconClickAction', 'popout');
    await actionClickListenerRef();
    global.browser.tabs.create = origTabsCreate;
    global.browser.windows.create = origWinCreate;

    // action.onClicked: unknown iconClickAction
    await global.storage.set('iconClickAction', 'other-unknown');
    await actionClickListenerRef();

    // applyIconAction branches (lines 164-165)
    await global.storage.set('iconClickAction', 'sidebar');
    await bg.applyIconAction();
    expect(global.browser.action.setPopup).toHaveBeenCalledWith({ popup: "" });

    await global.storage.set('iconClickAction', 'popout');
    await bg.applyIconAction();
    expect(global.browser.action.setPopup).toHaveBeenCalledWith({ popup: "" });

    await global.storage.set('iconClickAction', 'popup');
    await bg.applyIconAction();
    expect(global.browser.action.setPopup).toHaveBeenCalledWith({ popup: "src/popup.html" });

    // applyIconAction error handling
    global.browser.action.setPopup.mockRejectedValueOnce(new Error('setPopup failed'));
    await expect(bg.applyIconAction()).resolves.not.toThrow();

    // 18. menus.onClicked: info with pageUrl (no linkUrl), and tab with url (no linkUrl, no pageUrl) (line 240)
    await global.storage.set('overrideProfileId', 'profMenuTest');
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true });
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', pageUrl: 'https://page-url.com' }, {});
    expect(apiClient.fetchWithRetry).toHaveBeenCalledWith('/profiles/profMenuTest/allowlist', expect.objectContaining({ body: expect.stringContaining('page-url.com') }));

    await menuClickListenerRef({ menuItemId: 'dns-forge-allow' }, { url: 'https://tab-url.com' });
    expect(apiClient.fetchWithRetry).toHaveBeenCalledWith('/profiles/profMenuTest/allowlist', expect.objectContaining({ body: expect.stringContaining('tab-url.com') }));

    // 19. menus.onClicked: URL with empty domain (line 250)
    const origURL = global.URL;
    class MockEmptyHostURL extends origURL {
      constructor(u) {
        super(u);
        Object.defineProperty(this, 'hostname', { value: '' });
      }
    }
    global.URL = MockEmptyHostURL;
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'https://empty-host.com' }, {});
    global.URL = origURL;

    // 20. menus.onClicked: activeProfileId from detectedProfileId (line 252)
    await global.storage.set('overrideProfileId', null);
    await global.storage.set('activeProfile', null);
    await global.storage.set('detectedProfileId', 'profDetectedMenu');
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'https://detected-profile.com' }, {});
    expect(apiClient.fetchWithRetry).toHaveBeenCalledWith('/profiles/profDetectedMenu/allowlist', expect.any(Object));

    // menus.onClicked: activeProfileId === 'auto' (line 253)
    await global.storage.set('detectedProfileId', 'auto');
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'https://auto-profile.com' }, {});

    // menus.onClicked: activeProfileId starts with 'fp' (line 253)
    await global.storage.set('detectedProfileId', 'fp-fingerprint');
    await menuClickListenerRef({ menuItemId: 'dns-forge-allow', linkUrl: 'https://fp-profile.com' }, {});

    // menus.onClicked: non-allow, non-deny menuItemId (line 260)
    await global.storage.set('detectedProfileId', 'profDetectedMenu');
    await menuClickListenerRef({ menuItemId: 'dns-forge-other', linkUrl: 'https://other-action.com' }, {});

    // 21. main.js top-level fallback when browser.menus is undefined & storage.onChanged listeners
    await jest.isolateModulesAsync(async () => {
      let mainStorageListener = null;
      const origAddListener = global.browser.storage.onChanged.addListener;
      global.browser.storage.onChanged.addListener = jest.fn(cb => {
        mainStorageListener = cb;
        if (origAddListener) origAddListener(cb);
      });

      const savedMenus = global.browser.menus;
      delete global.browser.menus;
      await import('../src/background/main.js');
      const { storage: isolatedStorage } = await import('../src/storage.js');
      global.browser.menus = savedMenus;
      global.browser.storage.onChanged.addListener = origAddListener;

      if (mainStorageListener) {
        global.browser.action.setPopup.mockClear();
        mockStorage.iconClickAction = 'sidebar';
        if (isolatedStorage.cache) isolatedStorage.cache.iconClickAction = 'sidebar';
        mainStorageListener({ iconClickAction: { newValue: 'sidebar' } }, 'sync');
        await new Promise(r => setTimeout(r, 25));
        expect(global.browser.action.setPopup).toHaveBeenCalledWith({ popup: "" });

        global.browser.action.setPopup.mockClear();
        mockStorage.iconClickAction = 'popup';
        if (isolatedStorage.cache) isolatedStorage.cache.iconClickAction = 'popup';
        mainStorageListener({ iconClickAction: { newValue: 'popup' } }, 'local');
        await new Promise(r => setTimeout(r, 25));
        expect(global.browser.action.setPopup).toHaveBeenCalledWith({ popup: "src/popup.html" });

        global.browser.action.setPopup.mockClear();
        mainStorageListener({ iconClickAction: { newValue: 'popup' } }, 'managed');
        await new Promise(r => setTimeout(r, 25));
        expect(global.browser.action.setPopup).not.toHaveBeenCalled();

        global.browser.action.setPopup.mockClear();
        mainStorageListener({ otherKey: { newValue: 'foo' } }, 'sync');
        await new Promise(r => setTimeout(r, 25));
        expect(global.browser.action.setPopup).not.toHaveBeenCalled();
      }
    });

    // main.js top-level fallback when browser.storage is undefined
    await jest.isolateModulesAsync(async () => {
      const savedStorage = global.browser.storage;
      delete global.browser.storage;
      await import('../src/background/main.js');
      global.browser.storage = savedStorage;
    });

    // main.js top-level fallback when browser.storage.onChanged is undefined
    await jest.isolateModulesAsync(async () => {
      const savedOnChanged = global.browser.storage.onChanged;
      delete global.browser.storage.onChanged;
      await import('../src/background/main.js');
      global.browser.storage.onChanged = savedOnChanged;
    });

    // 22. Additional detectActiveProfile edge cases (lines 154-165)
    // Case A: fingerprint match in accountProfiles
    await global.storage.set('overrideProfileId', '');
    await global.storage.set('activeProfile', '');
    await global.storage.set('apiKey', 'valid-key');
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        return { success: true, response: { json: async () => ({ status: 'ok', profile: 'fp123' }) } };
      }
      if (url.includes('/profiles')) {
        return { success: true, response: { json: async () => ({ data: [{ id: 'p1', name: 'Profile 1', fingerprint: 'fp123' }] }) } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    const fpMatch = await bgApi.detectActiveProfile();
    expect(fpMatch.id).toBe('p1');

    // Case B: accountProfiles.length === 1 and isConnected === false
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        return { success: true, response: { json: async () => ({ status: 'unconfigured', profile: 'differentProf' }) } };
      }
      if (url.includes('/profiles')) {
        return { success: true, response: { json: async () => ({ data: [{ id: 'p1', name: 'Profile 1' }] }) } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();

    // Case C: accountProfiles.length > 1, none matched
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        return { success: true, response: { json: async () => ({ status: 'ok', profile: 'differentProf' }) } };
      }
      if (url.includes('/profiles')) {
        return { success: true, response: { json: async () => ({ data: [{ id: 'p1', name: 'Profile 1' }, { id: 'p2', name: 'Profile 2' }] }) } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();

    // Case D: accountProfiles.length === 0, networkProfile.startsWith('fp')
    await global.storage.set('apiKey', '');
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        return { success: true, response: { json: async () => ({ status: 'ok', profile: 'fp-unconfigured' }) } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();

    // Case E: accountProfiles.length === 0, !networkProfile.startsWith('fp')
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        return { success: true, response: { json: async () => ({ status: 'ok', profile: 'directNetProf' }) } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    const directProf = await bgApi.detectActiveProfile();
    expect(directProf.id).toBe('directNetProf');

    // 23. Additional checkAndUpdateLinkedIP edge cases (lines 293, 309)
    // Case F: ipify res.ok is false (line 293)
    await global.storage.set('activeProfile', 'pValid123');
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/profiles/pValid123')) {
        return { success: true, response: { json: async () => ({ data: { linkedIp: '1.1.1.1' } }) } };
      }
      return { success: false };
    });
    const origGlobalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    await bgApi.checkAndUpdateLinkedIP();

    // Case G: updateRes.success is false (line 309)
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ip: '2.2.2.2' }) });
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/profiles/pValid123/linked-ip')) {
        return { success: false };
      }
      if (url.includes('/profiles/pValid123')) {
        return { success: true, response: { json: async () => ({ data: { linkedIp: '1.1.1.1' } }) } };
      }
      return { success: false };
    });
    await bgApi.checkAndUpdateLinkedIP();
    global.fetch = origGlobalFetch;

    // 24. updateProfileCache filter items without id (lines 235-236)
    await global.storage.set('activeProfile', 'pValidCache');
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('allowlist')) {
        return { success: true, response: { json: async () => ({ data: [{ id: 'good.com' }, {}, null] }) } };
      }
      if (url.includes('denylist')) {
        return { success: true, response: { json: async () => ({ data: [{ id: 'bad.com' }, { id: '' }] }) } };
      }
      return { success: false };
    });
    bgApi._resetUpdateCacheInFlight();
    await bgApi.updateProfileCache();

    // 25. runNetworkDiagnostics when state.networkStatus is null (line 374)
    state.networkStatus = null;
    const diagNullNetStatus = await bgApi.runNetworkDiagnostics();
    expect(diagNullNetStatus).toBeDefined();

    // 26. manageDomain list with JSON parse error (line 41 .catch callback)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: { json: async () => { throw new Error('Corrupt JSON'); } }
    });
    const listCorruptRes = await bgApi.manageDomain('p123', 'allowlist', null, 'list');
    expect(listCorruptRes).toEqual({ data: [] });

    // 27. manageDomain with unrecognized action (line 39 false branch)
    const badActionRes = await bgApi.manageDomain('p123', 'allowlist', 'domain.com', 'unknown_action');
    expect(badActionRes.success).toBe(false);

    // 28. detectActiveProfile when state.networkStatus is null (line 138 false branch)
    state.networkStatus = null;
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url === 'https://test.nextdns.io/') {
        return { success: true, response: { json: async () => ({ status: 'ok', profile: 'pNet' }) } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();

    // 29. alarmListenerRef with missing parameters (line 122 false branch)
    const { ALARM_PREFIX } = await import('../src/background/state.js');
    await alarmListenerRef({ name: `${ALARM_PREFIX}?p=profOnly` });

    // 30. messageHandlerRef with unrecognized message type (line 101 false branch)
    const unknownTypeHandled = messageHandlerRef({ type: 'UNKNOWN_MSG_TYPE' }, { id: browser.runtime.id }, () => {});
    expect(unknownTypeHandled).toBeUndefined();

    // 31. initializeBackground when browser.webRequest is undefined (line 58 false branch)
    state.isInitialized = false;
    const origWebRequest = global.browser.webRequest;
    delete global.browser.webRequest;
    await bgMain.initializeBackground();
    global.browser.webRequest = origWebRequest;

    // 32. detectActiveProfile accountProfiles json parsing error (line 97 catch callback)
    await global.storage.set('apiKey', 'test-key');
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/profiles')) {
        return { success: true, response: { json: async () => { throw new Error('pRes JSON corrupt'); } } };
      }
      return { success: false };
    });
    bgApi._resetDetectInFlight();
    await bgApi.detectActiveProfile();

    // Restore fetch
    apiClient.fetchWithRetry = origFetch;
  });

  test('handlers.js - 100% Branch Coverage Final Push', async () => {
    const { messageHandlers } = await import('../src/background/handlers.js');
    const { apiClient } = await import('../src/apiClient.js');
    const { state } = await import('../src/background/state.js');
    const origFetch = apiClient.fetchWithRetry;

    // 1. TEMP_ALLOW branches (lines 60, 61)
    // msg.domain falsy
    const tempNoDomain = await messageHandlers.TEMP_ALLOW({ profileId: 'prof123' });
    expect(tempNoDomain.success).toBe(false);

    // msg.duration provided without durationInMinutes
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true });
    const tempWithDuration = await messageHandlers.TEMP_ALLOW({ profileId: 'prof123', domain: 'temp-dur.com', duration: 15 });
    expect(tempWithDuration.success).toBe(true);

    // msg.duration is non-numeric string, falls back to 5
    const tempNaN = await messageHandlers.TEMP_ALLOW({ profileId: 'prof123', domain: 'temp-nan.com', duration: 'invalid-dur' });
    expect(tempNaN.success).toBe(true);

    // line 60: manageDomain fails (res.success is false)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false });
    const tempFail = await messageHandlers.TEMP_ALLOW({ profileId: 'prof123', domain: 'temp-fail.com' });
    expect(tempFail.success).toBe(false);

    // 2. GET_LOGS branches (lines 93, 103, 108-110, 116)
    // line 93: state.localLogs is null on invalid profileId
    const origLocalLogs = state.localLogs;
    state.localLogs = null;
    const getLogsBadProfile = await messageHandlers.GET_LOGS({ profileId: '' });
    expect(getLogsBadProfile.success).toBe(false);
    expect(getLogsBadProfile.data).toEqual([]);

    // line 101: r.success is false with state.localLogs = null
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false });
    const getLogsFetchFail = await messageHandlers.GET_LOGS({ profileId: 'prof123' });
    expect(getLogsFetchFail.success).toBe(true);
    expect(getLogsFetchFail.data).toEqual([]);

    // line 116: catch block when fetchWithRetry throws and state.localLogs is null
    apiClient.fetchWithRetry = jest.fn().mockRejectedValue(new Error('fetch error'));
    const getLogsCatchFail = await messageHandlers.GET_LOGS({ profileId: 'prof123' });
    expect(getLogsCatchFail.success).toBe(false);
    expect(getLogsCatchFail.data).toEqual([]);
    state.localLogs = origLocalLogs;

    // line 103: json is an array directly (json.data is undefined)
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: { json: async () => [{ domain: 'direct-array.com', timestamp: 10 }] }
    });
    const logsDirectArray = await messageHandlers.GET_LOGS({ profileId: 'prof123', raw: true });
    expect(logsDirectArray.success).toBe(true);
    expect(logsDirectArray.data[0].domain).toBe('direct-array.com');

    // line 103: json is an object without data and not an array
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: { json: async () => ({ status: 'ok' }) }
    });
    const logsEmptyObj = await messageHandlers.GET_LOGS({ profileId: 'prof123', raw: true });
    expect(logsEmptyObj.success).toBe(true);
    expect(logsEmptyObj.data).toEqual([]);

    // lines 108-110: log items without domain or name, and sorting items without timestamp
    state.localLogs = [
      { timestamp: 100 },
      { domain: 'local-domain.com' }
    ];
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: {
        json: async () => ({
          data: [
            {},
            { name: 'remote.com' }
          ]
        })
      }
    });
    const logsSorting = await messageHandlers.GET_LOGS({ profileId: 'prof123', raw: false });
    expect(logsSorting.success).toBe(true);

    // 3. GET_PROFILE_DATA branches (lines 130, 131, 134, 135)
    // allow.success is false
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('allowlist')) return { success: false };
      return { success: true, response: { json: async () => ({ data: [{ id: 'deny1.com' }] }) } };
    });
    const pDataAllowFail = await messageHandlers.GET_PROFILE_DATA({ profileId: 'prof123' });
    expect(pDataAllowFail.allowlist).toEqual([]);
    expect(pDataAllowFail.denylist).toEqual(['deny1.com']);

    // deny.success is false
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('denylist')) return { success: false };
      return { success: true, response: { json: async () => ({ data: [{ id: 'allow1.com' }] }) } };
    });
    const pDataDenyFail = await messageHandlers.GET_PROFILE_DATA({ profileId: 'prof123' });
    expect(pDataDenyFail.allowlist).toEqual(['allow1.com']);
    expect(pDataDenyFail.denylist).toEqual([]);

    // aJson and dJson are objects without data array and not arrays (fallback to [])
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async () => {
      return { success: true, response: { json: async () => ({ status: 'ok' }) } };
    });
    const pDataEmptyObj = await messageHandlers.GET_PROFILE_DATA({ profileId: 'prof123' });
    expect(pDataEmptyObj.allowlist).toEqual([]);
    expect(pDataEmptyObj.denylist).toEqual([]);

    // 4. GET_ANALYTICS branches (lines 147, 162, 163)
    // msg is null/undefined
    const analyticsNullMsg = await messageHandlers.GET_ANALYTICS(null);
    expect(analyticsNullMsg.success).toBe(false);

    // json.data is null/empty for status endpoint
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: { json: async () => ({}) }
    });
    const analyticsEmptyData = await messageHandlers.GET_ANALYTICS({ profileId: 'prof123', endpoint: 'status' });
    expect(analyticsEmptyData.success).toBe(true);
    expect(analyticsEmptyData.data.queries).toBe(0);

    // curr.queries is undefined in reduce, find returns item without queries
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
      success: true,
      response: {
        json: async () => ({
          data: [
            { status: 'allowed' },
            { status: 'blocked' }
          ]
        })
      }
    });
    const analyticsNoQueriesProp = await messageHandlers.GET_ANALYTICS({ profileId: 'prof123', endpoint: 'status' });
    expect(analyticsNoQueriesProp.success).toBe(true);
    expect(analyticsNoQueriesProp.data.blockedQueries).toBe(0);

    // 5. GET_NETWORK_STATUS branches (line 192)
    // state.networkStatus is fresh with lastChecked missing (falsy || 0)
    state.networkStatus = { lastChecked: null };
    const netStatusNoLastChecked = await messageHandlers.GET_NETWORK_STATUS();
    expect(netStatusNoLastChecked.success).toBe(true);

    // state.networkStatus is fresh (lastChecked recent)
    state.networkStatus = { lastChecked: Date.now(), isConnected: true, status: 'ok' };
    const netStatusRecent = await messageHandlers.GET_NETWORK_STATUS();
    expect(netStatusRecent.success).toBe(true);
    expect(netStatusRecent.networkStatus.status).toBe('ok');

    // 6. GET_PROFILES_LIST branches (line 217)
    // r.success is false
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false });
    const profilesListFail = await messageHandlers.GET_PROFILES_LIST({});
    expect(profilesListFail.success).toBe(false);
    expect(profilesListFail.data).toEqual([]);

    // 7. TOGGLE_SETTING branches (lines 232, 269)
    // msg is null/undefined
    const toggleNullMsg = await messageHandlers.TOGGLE_SETTING(null);
    expect(toggleNullMsg.success).toBe(false);

    // r.error is undefined / falsy on error
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false, error: '' });
    const toggleNoErrStr = await messageHandlers.TOGGLE_SETTING({ profileId: 'prof123', category: 'security', id: 'block_ai' });
    expect(toggleNoErrStr.success).toBe(false);

    // 8. GET_ALL_SETTINGS branches (lines 299, 301, 315, 320-325)
    // msg is null/undefined with no profiles in storage
    await global.storage.set('activeProfile', null);
    await global.storage.set('overrideProfileId', null);
    const allSettingsNullMsg = await messageHandlers.GET_ALL_SETTINGS(null);
    expect(allSettingsNullMsg.success).toBe(false);

    // profileId omitted, activeProfile present in storage (line 301)
    await global.storage.set('activeProfile', 'profActive');
    await global.storage.set('overrideProfileId', null);
    apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true, response: { json: async () => ({}) } });
    const allSettingsFromActive = await messageHandlers.GET_ALL_SETTINGS({});
    expect(allSettingsFromActive.success).toBe(true);

    // profileId omitted, activeProfile null, overrideProfileId null (invalid profile ID)
    await global.storage.set('activeProfile', null);
    await global.storage.set('overrideProfileId', null);
    const allSettingsNoProf = await messageHandlers.GET_ALL_SETTINGS({});
    expect(allSettingsNoProf.success).toBe(false);

    // profileId omitted, activeProfile null, overrideProfileId present in storage
    await global.storage.set('activeProfile', null);
    await global.storage.set('overrideProfileId', 'profFromOverride');
    const allSettingsFromOverride = await messageHandlers.GET_ALL_SETTINGS({});
    expect(allSettingsFromOverride.success).toBe(true);

    // line 315: data['settings/performance'] present, but data.settings missing (!data.settings is true)
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('settings/performance')) return { success: true, response: { json: async () => ({ ecs: true, cacheBoost: true, cnameFlattening: true }) } };
      if (url.endsWith('/settings')) return { success: false };
      return { success: true, response: { json: async () => ({}) } };
    });
    const allSettingsNoSettingsObj = await messageHandlers.GET_ALL_SETTINGS({ profileId: 'prof123' });
    expect(allSettingsNoSettingsObj.data.settings.ecs).toBe(true);

    // line 315-319: data['settings/performance'] present, data.settings already exists (!data.settings is false), flags missing in settings/performance
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('settings/performance')) return { success: true, response: { json: async () => ({}) } };
      if (url.endsWith('/settings')) return { success: true, response: { json: async () => ({ ecs: false, cacheBoost: false, cnameFlattening: false, performance: { old: true } }) } };
      return { success: true, response: { json: async () => ({}) } };
    });
    const allSettingsPerfMissingFlags = await messageHandlers.GET_ALL_SETTINGS({ profileId: 'prof123' });
    expect(allSettingsPerfMissingFlags.data.settings.ecs).toBe(false);

    // lines 320-325: data['settings/performance'] missing, but data.settings.performance has flags
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('settings/performance')) return { success: false };
      if (url.endsWith('/settings')) return { success: true, response: { json: async () => ({ performance: { ecs: true, cacheBoost: true, cnameFlattening: true } }) } };
      return { success: true, response: { json: async () => ({}) } };
    });
    const allSettingsPerfFromNested = await messageHandlers.GET_ALL_SETTINGS({ profileId: 'prof123' });
    expect(allSettingsPerfFromNested.data['settings/performance'].ecs).toBe(true);

    // lines 320-325: data['settings/performance'] missing, data.settings.performance is empty object, falls back to data.settings.*
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('settings/performance')) return { success: false };
      if (url.endsWith('/settings')) return { success: true, response: { json: async () => ({ ecs: false, cacheBoost: false, cnameFlattening: false, performance: {} }) } };
      return { success: true, response: { json: async () => ({}) } };
    });
    const allSettingsPerfNestedFallback = await messageHandlers.GET_ALL_SETTINGS({ profileId: 'prof123' });
    expect(allSettingsPerfNestedFallback.data.settings.ecs).toBe(false);

    // line 320: neither data['settings/performance'] nor data.settings.performance exists
    apiClient.fetchWithRetry = jest.fn().mockImplementation(async (url) => {
      if (url.includes('settings/performance')) return { success: false };
      if (url.endsWith('/settings')) return { success: true, response: { json: async () => ({}) } };
      return { success: true, response: { json: async () => ({}) } };
    });
    const allSettingsNoPerf = await messageHandlers.GET_ALL_SETTINGS({ profileId: 'prof123' });
    expect(allSettingsNoPerf.data['settings/performance']).toBeUndefined();

    // 9. DEBUG_TAB branches (line 333)
    // msg is null/undefined
    const debugNullMsg = await messageHandlers.DEBUG_TAB(null);
    expect(debugNullMsg.success).toBe(false);

    // 10. PUSH_NOTIFICATION branches (lines 538, 578, 585-597)
    // state.notifications is null (line 578)
    state.notifications = null;
    await global.storage.set('alertSettings', { enabled: true, actionCenter: true, desktop: false });
    const pushNullNotifs = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', message: 'Alert' } });
    expect(pushNullNotifs.success).toBe(true);
    expect(state.notifications.length).toBe(1);

    // payload is undefined/falsy (line 538)
    const pushEmptyPayload = await messageHandlers.PUSH_NOTIFICATION({});
    expect(pushEmptyPayload.success).toBe(true);

    // desktop notifications: severity === 'high' (lines 585-594)
    browser.notifications = {
      create: jest.fn().mockResolvedValue('notif-id-1')
    };
    await global.storage.set('alertSettings', { enabled: true, actionCenter: true, desktop: true });
    const pushDesktopHigh = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', severity: 'high', message: 'Critical threat' } });
    expect(pushDesktopHigh.success).toBe(true);
    expect(browser.notifications.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'NextDNS Alert' }));

    // desktop notifications: severity !== 'high' (line 591)
    const pushDesktopLow = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', severity: 'low', message: 'Minor notice' } });
    expect(pushDesktopLow.success).toBe(true);
    expect(browser.notifications.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'NextDNS Notice' }));

    // desktop notifications: create throws error (catch block lines 595-597)
    browser.notifications.create = jest.fn().mockRejectedValue(new Error('Notification failed'));
    const pushDesktopErr = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', severity: 'high', message: 'Alert' } });
    expect(pushDesktopErr.success).toBe(true);

    // desktop notifications: browser.notifications.create is undefined
    delete browser.notifications.create;
    const pushNoCreate = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', message: 'Alert' } });
    expect(pushNoCreate.success).toBe(true);

    // actionCenter is explicitly false (line 577)
    await global.storage.set('alertSettings', { enabled: true, actionCenter: false, desktop: false });
    const pushNoActionCenter = await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', message: 'No Action Center' } });
    expect(pushNoActionCenter.success).toBe(true);

    // notification buffer length > 50 triggers pop() (line 580)
    state.notifications = new Array(51).fill({ id: 'dummy' });
    await global.storage.set('alertSettings', { enabled: true, actionCenter: true, desktop: false });
    await messageHandlers.PUSH_NOTIFICATION({ payload: { type: 'security', message: 'Pop test' } });
    expect(state.notifications.length).toBe(51);

    // Restore fetch
    apiClient.fetchWithRetry = origFetch;
  });

  test('Handlers - AdGuard DNS Provider integration full coverage', async () => {
    const { messageHandlers } = await import('../src/background/handlers.js');
    const { state } = await import('../src/background/state.js');
    const { apiClient } = await import('../src/apiClient.js');

    const origFetch = apiClient.fetchWithRetry;
    apiClient.fetchWithRetry = jest.fn(async (url, opts) => {
      if (url.includes('/dns_servers/adg-1/settings') && opts?.method === 'PUT') {
        return { success: true };
      }
      if (url.includes('/dns_servers/adg-1')) {
        return {
          success: true,
          response: {
            json: async () => ({
              settings: {
                user_rules_settings: {
                  rules: ['@@||allowed.com^', '||blocked.com^']
                }
              }
            })
          }
        };
      }
      if (url.includes('/dns_servers/adg-2')) {
        throw new Error('Mirror fail');
      }
      if (url.includes('/dns_servers')) {
        return {
          success: true,
          response: {
            json: async () => [
              { id: 'adg-1', name: 'Server 1', default: true }
            ]
          }
        };
      }
      if (url.includes('/query_log') && opts?.method === 'DELETE') {
        return { success: true };
      }
      if (url.includes('/query_log')) {
        return {
          success: true,
          response: {
            json: async () => ({
              items: [
                { domain: 'adg-log.com', time_millis: 1000, filtering_info: { status: 'BLOCKED' }, device_id: 'd1' },
                { time_millis: 500 },
                { domain: 'no-time.com' }
              ]
            })
          }
        };
      }
      return { success: false };
    });

    await global.storage.set('dnsProvider', 'adguard');
    await global.storage.set('adguardApiKey', 'test-adg-key');

    // 1. GET_PROFILES_LIST with adguard
    const listRes = await messageHandlers.GET_PROFILES_LIST({ apiKey: 'custom-adg-key' });
    expect(listRes.success).toBe(true);
    expect(listRes.data[0].id).toBe('adg-1');

    // 2. GET_PROFILE_DATA with adguard
    const dataRes = await messageHandlers.GET_PROFILE_DATA({ profileId: 'adg-1' });
    expect(dataRes.success).toBe(true);
    expect(dataRes.allowlist).toContain('allowed.com');
    expect(dataRes.denylist).toContain('blocked.com');

    // 3. MANAGE_DOMAIN with adguard + Mirror Mode replication (including mirror rejection catch)
    await global.storage.set('mirrorProfiles', ['adg-1', 'adg-2']);
    const manageRes = await messageHandlers.MANAGE_DOMAIN({
      profileId: 'adg-1',
      listType: 'allowlist',
      domain: 'newsite.com',
      action: 'add'
    });
    expect(manageRes.success).toBe(true);

    // 4. GET_LOGS with adguard (including merging state.localLogs)
    state.localLogs = [
      { name: 'local-only.com', timestamp: 2000 },
      { domain: 'local-domain.com' },
      { timestamp: 100 },
      { name: 'adg-log.com', timestamp: 500 }
    ];
    const logsRes = await messageHandlers.GET_LOGS({ profileId: 'adg-1' });
    expect(logsRes.success).toBe(true);
    expect(logsRes.data.length).toBe(5);

    // GET_LOGS with adguard when localLogs is empty or null
    state.localLogs = [];
    const logsEmptyRes = await messageHandlers.GET_LOGS({ profileId: 'adg-1' });
    expect(logsEmptyRes.success).toBe(true);

    state.localLogs = null;
    const logsNullRes = await messageHandlers.GET_LOGS({ profileId: 'adg-1' });
    expect(logsNullRes.success).toBe(true);

    // GET_LOGS with adguard when adgRes.data is falsy
    apiClient.fetchWithRetry.mockResolvedValueOnce({ success: false });
    const logsFailRes = await messageHandlers.GET_LOGS({ profileId: 'adg-1' });
    expect(logsFailRes.success).toBe(true);
    expect(logsFailRes.data).toEqual([]);

    // 5. CLEAR_LOGS with adguard
    const clearRes = await messageHandlers.CLEAR_LOGS({ profileId: 'adg-1' });
    expect(clearRes.success).toBe(true);

    // Reset storage and state
    state.localLogs = [];
    await global.storage.set('dnsProvider', 'nextdns');
    await global.storage.set('mirrorProfiles', []);
    apiClient.fetchWithRetry = origFetch;
  });

  test('handles controld provider actions across all handlers (GET_PROFILES_LIST, GET_PROFILE_DATA, MANAGE_DOMAIN, GET_LOGS, CLEAR_LOGS)', async () => {
    const { messageHandlers } = await import('../src/background/handlers.js');
    const { state } = await import('../src/background/state.js');
    const { apiClient } = await import('../src/apiClient.js');

    const origFetch = apiClient.fetchWithRetry;
    apiClient.fetchWithRetry = jest.fn(async (url, opts = {}) => {
      if (url.includes('/profiles') && !url.includes('/rules')) {
        return {
          success: true,
          response: {
            json: async () => ({
              body: {
                profiles: [
                  { PK: 'cd-1', name: 'Home Network', updated: 12345 }
                ]
              }
            })
          }
        };
      }
      if (url.includes('/rules') && (!opts.method || opts.method === 'GET')) {
        return {
          success: true,
          response: {
            json: async () => ({
              body: {
                rules: [
                  { PK: 'allowed.com', action: { do: 1 } },
                  { PK: 'blocked.com', action: { do: 0 } }
                ]
              }
            })
          }
        };
      }
      if (url.includes('/rules') && opts.method === 'POST') {
        if (opts.body && opts.body.includes('bad-mirror')) {
          return { success: false, error: 'Mirror failed' };
        }
        return {
          success: true,
          response: {
            json: async () => ({ body: { rules: [{ PK: 'newsite.com' }] } })
          }
        };
      }
      return { success: false };
    });

    await global.storage.set('dnsProvider', 'controld');
    await global.storage.set('controldApiKey', 'test-cd-key');

    // 1. GET_PROFILES_LIST with controld
    const listRes = await messageHandlers.GET_PROFILES_LIST({ apiKey: 'custom-cd-key' });
    expect(listRes.success).toBe(true);
    expect(listRes.data[0].id).toBe('cd-1');

    // 2. GET_PROFILE_DATA with controld
    const dataRes = await messageHandlers.GET_PROFILE_DATA({ profileId: 'cd-1' });
    expect(dataRes.success).toBe(true);
    expect(dataRes.allowlist).toContain('allowed.com');
    expect(dataRes.denylist).toContain('blocked.com');

    // 3. MANAGE_DOMAIN with controld + Mirror Mode replication
    await global.storage.set('mirrorProfiles', ['cd-1', 'cd-2']);
    const manageRes = await messageHandlers.MANAGE_DOMAIN({
      profileId: 'cd-1',
      listType: 'allowlist',
      domain: 'newsite.com',
      action: 'add'
    });
    expect(manageRes.success).toBe(true);

    // 4. GET_LOGS with controld (merging state.localLogs)
    state.localLogs = [
      { name: 'local-only.com', timestamp: 2000 },
      { domain: 'local-domain.com' },
      { timestamp: 100 }
    ];
    const logsRes = await messageHandlers.GET_LOGS({ profileId: 'cd-1' });
    expect(logsRes.success).toBe(true);
    expect(logsRes.data.length).toBe(3);

    // 5. CLEAR_LOGS with controld
    const clearRes = await messageHandlers.CLEAR_LOGS({ profileId: 'cd-1' });
    expect(clearRes.success).toBe(true);

    // Reset storage and state
    state.localLogs = [];
    await global.storage.set('dnsProvider', 'nextdns');
    await global.storage.set('mirrorProfiles', []);
    apiClient.fetchWithRetry = origFetch;
  });
});



