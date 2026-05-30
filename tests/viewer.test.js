/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

describe('Data Manager (Viewer) Audit', () => {
  let mockStorage = {};

  beforeEach(() => {
    jest.resetModules();
    mockStorage = {
        apiKey: 'test-key',
        scrapedMeta: {
            blocklists: [{ id: 'scraped-b1', name: 'Scraped Blocklist' }],
            tlds: ['scraped-tld']
        }
    };

    global.browser = {
      storage: {
        local: {
          get: jest.fn(keys => {
            if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
            const res = {};
            (keys || []).forEach(k => res[k] = mockStorage[k]);
            return Promise.resolve(res);
          }),
          set: jest.fn(obj => {
            Object.assign(mockStorage, obj);
            return Promise.resolve();
          })
        },
        sync: {
            get: jest.fn(keys => Promise.resolve({}))
        }
      },
      runtime: {
        getURL: jest.fn(path => path),
        sendMessage: jest.fn(async (msg) => {
            if (msg.type === "GET_PROFILE") return { id: 'p1', name: 'Test' };
            if (msg.type === "GET_ALL_SETTINGS") return { 
                success: true, 
                data: { blocklists: [], tlds: [] } 
            };
            if (msg.type === "GET_PROFILES_LIST") return { data: [{ id: 'p1', name: 'Test' }] };
            return { success: true };
        })
      }
    };

    global.fetch = jest.fn().mockImplementation((url) => {
        if (url.includes('blocks_meta.json')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ 
                    blocklists: [{ id: 'bundled-b1', name: 'Bundled Blocklist' }],
                    tlds: ['bundled-tld']
                })
            });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    document.body.innerHTML = `
        <div class="tabs">
            <button id="tab-blocklists" class="tab-btn">Blocklist Manager</button>
            <button id="tab-tlds" class="tab-btn">TLD Manager</button>
            <button id="tab-backup" class="tab-btn">Backup</button>
        </div>
        <div class="controls-row" id="main-controls">
            <input type="text" id="search-input" class="search-bar">
            <button id="add-btn" class="btn btn-add">+ Add New Entry</button>
        </div>
        <div id="list-container" class="list-container"></div>

        <!-- Phase 3.1: Profile Cloning UI -->
        <div id="backup-container" class="hidden">
            <button id="export-profile-btn"></button>
            <button id="import-profile-btn"></button>
            <select id="clone-target-profile"></select>
            <input type="file" id="import-profile-file">
            <div id="cloning-log"></div>
        </div>

        <!-- Phase 4.2: Profile Snapshots UI -->
        <div id="snapshots-container" class="hidden">
            <button id="create-snapshot-btn"></button>
            <div id="snapshots-list"></div>
            <div id="snapshot-diff-container" class="hidden">
                <button id="close-diff-btn"></button>
                <div id="diff-content"></div>
            </div>
        </div>

        <div id="edit-modal" class="modal">
            <h2 id="modal-title"></h2>
            <div id="key-section">
                <label id="label-key"></label>
                <input type="text" id="input-key">
                <select id="select-profile"></select>
            </div>
            <textarea id="input-note"></textarea>
            <button id="cancel-btn"></button>
            <button id="save-btn"></button>
        </div>
    `;
    // Mock window.location
    delete window.location;
    window.location = { 
        pathname: '/viewer.html',
        search: '?tab=blocklists'
    };
  });

  test('Viewer: Loads scraped metadata preferentially', async () => {
    require('../src/viewer.js');
    
    await new Promise(r => setTimeout(r, 400));

    const container = document.getElementById('list-container');
    expect(container.innerHTML).toContain('Scraped Blocklist');
  });

  test('Viewer: Falls back to bundled JSON if scraped data is missing', async () => {
    mockStorage.scrapedMeta = null;
    
    require('../src/viewer.js');

    await new Promise(r => setTimeout(r, 400));

    const container = document.getElementById('list-container');
    expect(container.innerHTML).toContain('Bundled Blocklist');
  });
});
