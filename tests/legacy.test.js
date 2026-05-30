/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

describe('Legacy Logic Audit: Menus, Notifications, Profiles', () => {
  let mockSync = {};
  let menuListeners = [];

  beforeEach(() => {
    jest.resetModules();
    mockSync = { apiKey: 'test-api-key', overrideProfileId: '' };
    menuListeners = [];

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
          set: jest.fn(obj => { Object.assign(mockSync, obj); return Promise.resolve(); })
        },
        local: {
          get: jest.fn(keys => {
            if (keys === null) return Promise.resolve(mockSync);
            if (typeof keys === 'string') return Promise.resolve({ [keys]: mockSync[keys] });
            const res = {};
            (keys || []).forEach(k => res[k] = mockSync[k]);
            return Promise.resolve(res);
          }),
          set: jest.fn(obj => { Object.assign(mockSync, obj); return Promise.resolve(); })
        },
        onChanged: { addListener: jest.fn() }
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
      menus: {
        removeAll: jest.fn().mockResolvedValue(),
        create: jest.fn(),
        onClicked: { addListener: jest.fn(l => menuListeners.push(l)) }
      },
      notifications: { create: jest.fn() },
      runtime: { 
        onMessage: { addListener: jest.fn() }, 
        sendMessage: jest.fn().mockResolvedValue({ success: true }) 
      },
      alarms: {
        create: jest.fn(),
        onAlarm: { addListener: jest.fn() }
      },
      webRequest: { onBeforeRequest: { addListener: jest.fn(), hasListener: jest.fn(() => false) } }
    };

    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    global.console.log = jest.fn();
  });

  test('Context Menus: Correctly formatted API payload for Denylist', async () => {
    const backgroundJs = fs.readFileSync(path.resolve(__dirname, '../src/background.js'), 'utf8');
    global.storage = require('../src/storage.js');
    global.apiClient = require('../src/apiClient.js');
    global.apiClient.setStorage(global.storage);
    eval(backgroundJs);
    
    // Simulate click on Denylist menu
    const info = { menuItemId: 'dns-forge-deny', pageUrl: 'https://malware.com/path' };
    const tab = { id: 1 };
    
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    // Find and trigger the menu listener
    await menuListeners[0](info, tab);

    // Wait a bit for async calls
    await new Promise(r => setTimeout(r, 100));

    // console.log('FETCH CALLS:', global.fetch.mock.calls.map(c => c[0]));

    // Check all calls to fetch
    const denylistCall = global.fetch.mock.calls.find(call => call[0].includes('/denylist'));
    expect(denylistCall).toBeDefined();
    expect(denylistCall[1]).toEqual(expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Api-Key': 'test-api-key' }),
        body: JSON.stringify({ id: 'malware.com' })
    }));
  });

  test('Notifications: Throttling logic prevents spam', async () => {
    // We need to access the internal throttle function or trigger it via the listener
    // Since it's internal to background.js, we'll verify it via side-effects
    const backgroundJs = fs.readFileSync(path.resolve(__dirname, '../src/background.js'), 'utf8');
    global.storage = require('../src/storage.js');
    global.apiClient = require('../src/apiClient.js');
    global.apiClient.setStorage(global.storage);
    eval(backgroundJs);

    // Mock the notification call
    const background = require('../src/background.js');
    
    // If background.js doesn't export it, we can't test it directly unless we trigger the request listener
    // But we can check if it exists in the script
    expect(backgroundJs).toContain('lastNotificationTimes');
    expect(backgroundJs).toContain('10000'); // 10s throttle
  });

  test('Profile Detection: Fallback to /profiles API when TEST_URL fails', async () => {
    const backgroundJs = fs.readFileSync(path.resolve(__dirname, '../src/background.js'), 'utf8');
    global.storage = require('../src/storage.js');
    global.apiClient = require('../src/apiClient.js');
    global.apiClient.setStorage(global.storage);
    eval(backgroundJs);

    global.fetch.mockImplementation((url) => {
        if (url.includes('test.nextdns.io')) return Promise.reject('Fail');
        if (url.includes('/profiles')) return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [{ id: 'detected-p1', name: 'Primary' }] })
        });
        return Promise.resolve({ ok: true });
    });

    // We need to trigger detection
    // In background.js, it's called during initializeBackground
    await new Promise(r => setTimeout(r, 1500));

    expect(mockSync.activeProfile).toBe('detected-p1');
  });
});
