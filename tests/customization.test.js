/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

describe('Website Customization Engine', () => {
  let mockStorage = {};
  let storageListeners = [];

  beforeEach(() => {
    jest.resetModules();
    mockStorage = {
      webGuiMaster: true,
      webGuiTlds: true,
      webGuiBlocklists: true,
      webGuiLogActions: true,
      webGuiDesc: true,
      webGuiProfileNotes: true,
      webGuiFilter: true
    };
    storageListeners = [];

    global.browser = {
      storage: {
        sync: {
          get: jest.fn(keys => {
            if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
            const res = {};
            keys.forEach(k => res[k] = mockStorage[k]);
            return Promise.resolve(res);
          }),
          set: jest.fn(obj => {
            const changes = {};
            for (let k in obj) {
              changes[k] = { oldValue: mockStorage[k], newValue: obj[k] };
              mockStorage[k] = obj[k];
            }
            storageListeners.forEach(l => l(changes, 'sync'));
            return Promise.resolve();
          })
        },
        local: {
          get: jest.fn(keys => {
            if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
            const res = {};
            keys.forEach(k => res[k] = mockStorage[k]);
            return Promise.resolve(res);
          }),
          set: jest.fn(obj => {
            const changes = {};
            for (let k in obj) {
              changes[k] = { oldValue: mockStorage[k], newValue: obj[k] };
              mockStorage[k] = obj[k];
            }
            storageListeners.forEach(l => l(changes, 'local'));
            return Promise.resolve();
          })
        },
        onChanged: {
          addListener: jest.fn(l => storageListeners.push(l))
        }
      },
      runtime: {
        getURL: jest.fn(path => path),
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        onMessage: { addListener: jest.fn() }
      }
    };

    // Mock NextDNS DOM for Security page
    document.body.innerHTML = `
      <div id="root">
        <div class="Security">
          <div class="card">
            <div class="list-group">
                <div class="py-3 list-group-item">
                    <h5>Block Top-Level Domains (TLDs)</h5>
                    <div style="opacity: 0.6; font-size: 0.9em;">Block all domains and subdomains belonging to specific TLDs.</div>
                </div>
                <div class="list-group-item">.com</div>
                <div class="list-group-item">.net</div>
            </div>
          </div>
        </div>
        <div class="Privacy">
            <div class="card">
                <div class="list-group">
                    <div class="py-3 list-group-item">
                        <h5>Blocklists</h5>
                        <div style="opacity: 0.6; font-size: 0.9em;">Block ads &amp; trackers using the most popular blocklists available — all updated in real-time.</div>
                    </div>
                    <div class="list-group-item">EasyList</div>
                    <div class="list-group-item">NextDNS Recommended</div>
                </div>
            </div>
        </div>
      </div>
    `;

    // Mock window.location
    delete window.location;
    window.location = { pathname: '/abcd/security' };

    const content = require('../content.js');
    global.evaluatePage = content.evaluatePage;
    global.cleanupUI = content.cleanupUI;
    
    // Initial trigger
    global.evaluatePage();
  });

  test('TLD injection, cleanup, and re-injection', async () => {
    expect(document.getElementById('nxm-tld-controls')).not.toBeNull();
    const headerItem = document.querySelector('.Security .py-3.list-group-item');
    const siblings = Array.from(headerItem.parentElement.children).filter(el => el !== headerItem);
    expect(siblings[0].style.display).toBe('none');

    // Disable TLD Rollup
    await global.browser.storage.sync.set({ webGuiTlds: false });
    expect(document.getElementById('nxm-tld-controls')).toBeNull();
    expect(siblings[0].style.display).toBe('');

    // Re-enable TLD Rollup
    await global.browser.storage.sync.set({ webGuiTlds: true });
    expect(document.getElementById('nxm-tld-controls')).not.toBeNull();
    expect(siblings[0].style.display).toBe('none');
  });

  test('Master toggle cleanup', async () => {
    expect(document.getElementById('nxm-tld-controls')).not.toBeNull();

    // Disable Master Toggle
    await global.browser.storage.sync.set({ webGuiMaster: false });

    expect(document.getElementById('nxm-tld-controls')).toBeNull();
    const headerItem = document.querySelector('.Security .py-3.list-group-item');
    const siblings = Array.from(headerItem.parentElement.children).filter(el => el !== headerItem);
    expect(siblings[0].style.display).toBe('');
  });

  test('Blocklist injection and cleanup', async () => {
    window.location.pathname = '/abcd/privacy';
    evaluatePage();

    expect(document.getElementById('nxm-toggle-blocklists')).not.toBeNull();
    
    // Disable Blocklist Rollup
    await global.browser.storage.sync.set({ webGuiBlocklists: false });
    
    expect(document.getElementById('nxm-toggle-blocklists')).toBeNull();
  });
});
