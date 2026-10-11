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
});
