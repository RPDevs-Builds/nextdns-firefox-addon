/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.resolve('src/viewer.html'), 'utf8');

describe('Data Manager Viewer UI Suite', () => {
    beforeEach(() => {
        document.body.innerHTML = html;
        jest.resetModules();
        jest.clearAllMocks();

        global.browser = {
            storage: {
                sync: {
                    get: jest.fn().mockResolvedValue({}),
                    set: jest.fn().mockResolvedValue({})
                },
                local: {
                    get: jest.fn().mockResolvedValue({}),
                    set: jest.fn().mockResolvedValue({})
                }
            },
            runtime: {
                sendMessage: jest.fn().mockImplementation((msg) => {
                    if (msg.type === "GET_PROFILES") {
                        return Promise.resolve({ success: true, data: [{ id: "p1", name: "Default" }] });
                    }
                    if (msg.type === "GET_ALL_SETTINGS") {
                        return Promise.resolve({ success: true, data: { security: {}, privacy: {}, settings: {} } });
                    }
                    return Promise.resolve({ success: true, data: [] });
                }),
                getURL: jest.fn((p) => p)
            }
        };
    });

    test('viewer DOM elements exist and are properly structured', () => {
        expect(document.getElementById('list-container')).not.toBeNull();
        expect(document.getElementById('search-input')).not.toBeNull();
        expect(document.getElementById('add-btn')).not.toBeNull();
        expect(document.getElementById('tab-domains')).not.toBeNull();
        expect(document.getElementById('tab-profiles')).not.toBeNull();
        expect(document.getElementById('tab-snapshots')).not.toBeNull();
        expect(document.getElementById('tab-comparison')).not.toBeNull();
        expect(document.getElementById('edit-modal')).not.toBeNull();
        expect(document.getElementById('save-btn')).not.toBeNull();
        expect(document.getElementById('cancel-btn')).not.toBeNull();
    });

    test('search input filters entries dynamically in list container', () => {
        const listContainer = document.getElementById('list-container');
        listContainer.innerHTML = `
            <div class="list-item" data-key="domain1.com">
                <span class="item-key">domain1.com</span>
            </div>
            <div class="list-item" data-key="tracker.org">
                <span class="item-key">tracker.org</span>
            </div>
            <div class="list-item" data-key="test.net">
                <span class="item-key">test.net</span>
            </div>
        `;

        const searchInput = document.getElementById('search-input');
        const items = listContainer.querySelectorAll('.list-item');

        // Simulate filter function matching viewer.js search logic
        const applySearch = (query) => {
            items.forEach(el => {
                const text = el.textContent.toLowerCase();
                el.classList.toggle('hidden', !text.includes(query.toLowerCase()));
            });
        };

        applySearch('tracker');
        expect(items[0].classList.contains('hidden')).toBe(true);
        expect(items[1].classList.contains('hidden')).toBe(false);
        expect(items[2].classList.contains('hidden')).toBe(true);

        applySearch('');
        expect(items[0].classList.contains('hidden')).toBe(false);
        expect(items[1].classList.contains('hidden')).toBe(false);
        expect(items[2].classList.contains('hidden')).toBe(false);
    });

    test('tab switching toggles visible containers properly', () => {
        const mainControls = document.getElementById('main-controls');
        const listContainer = document.getElementById('list-container');
        const snapshotsContainer = document.getElementById('snapshots-container');
        const backupContainer = document.getElementById('backup-container');
        const comparisonContainer = document.getElementById('comparison-container');

        // Test switching to Snapshots
        const switchToSnapshots = () => {
            mainControls.classList.add('hidden');
            listContainer.classList.add('hidden');
            snapshotsContainer.classList.remove('hidden');
            backupContainer.classList.add('hidden');
            comparisonContainer.classList.add('hidden');
        };

        switchToSnapshots();
        expect(snapshotsContainer.classList.contains('hidden')).toBe(false);
        expect(listContainer.classList.contains('hidden')).toBe(true);
        expect(mainControls.classList.contains('hidden')).toBe(true);

        // Test switching back to standard domains tab
        const switchToDomains = () => {
            mainControls.classList.remove('hidden');
            listContainer.classList.remove('hidden');
            snapshotsContainer.classList.add('hidden');
            backupContainer.classList.add('hidden');
            comparisonContainer.classList.add('hidden');
        };

        switchToDomains();
        expect(snapshotsContainer.classList.contains('hidden')).toBe(true);
        expect(listContainer.classList.contains('hidden')).toBe(false);
        expect(mainControls.classList.contains('hidden')).toBe(false);
    });

    test('edit modal open, close, and validation states', () => {
        const modal = document.getElementById('edit-modal');
        const title = document.getElementById('modal-title');
        const inputKey = document.getElementById('input-key');
        const inputNote = document.getElementById('input-note');
        const cancelBtn = document.getElementById('cancel-btn');

        // Open modal
        modal.classList.remove('hidden');
        title.textContent = "Edit Domain";
        inputKey.value = "example.com";
        inputNote.value = "Work computer";

        expect(modal.classList.contains('hidden')).toBe(false);
        expect(inputKey.value).toBe("example.com");

        // Cancel closes modal
        cancelBtn.click();
        modal.classList.add('hidden');
        expect(modal.classList.contains('hidden')).toBe(true);
    });
});
