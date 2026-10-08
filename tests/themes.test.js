/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.resolve('src/popup.html'), 'utf8');

describe('Theme Engine & Custom Palette (Phase 8.1)', () => {
    let main, stateModule, state, storage;

    beforeEach(async () => {
        document.body.innerHTML = html;
        jest.resetModules();

        const mockStorageData = {};
        global.browser = {
            storage: {
                sync: {
                    get: jest.fn(keys => {
                        const res = {};
                        if (Array.isArray(keys)) {
                            keys.forEach(k => { if (k in mockStorageData) res[k] = mockStorageData[k]; });
                        } else if (typeof keys === 'string') {
                            if (keys in mockStorageData) res[keys] = mockStorageData[keys];
                        }
                        return Promise.resolve(res);
                    }),
                    set: jest.fn(obj => {
                        Object.assign(mockStorageData, obj);
                        return Promise.resolve();
                    })
                },
                local: {
                    get: jest.fn().mockResolvedValue({}),
                    set: jest.fn().mockResolvedValue({})
                },
                onChanged: { addListener: jest.fn() }
            },
            runtime: {
                sendMessage: jest.fn().mockResolvedValue({ success: true, data: [] }),
                getURL: jest.fn(p => p),
                getManifest: () => ({ version: '1.1.3' }),
                onMessage: { addListener: jest.fn() }
            },
            tabs: { query: jest.fn().mockResolvedValue([]) },
            action: { setPopup: jest.fn(), onClicked: { addListener: jest.fn() } }
        };

        stateModule = await import('../src/ui/state.js');
        state = stateModule.state;
        state.activeThemeId = 'default-dark';
        state.isThemeUnsaved = false;
        state.savedThemes = {};

        const storageModule = await import('../src/storage.js');
        storage = storageModule.storage;

        main = await import('../src/ui/main.js');

        // Dispatch DOMContentLoaded so initializeApp and initGlobalEventListeners run
        const event = new Event('DOMContentLoaded');
        document.dispatchEvent(event);
        await new Promise(res => setTimeout(res, 100));
    });

    test('normalizeHexColor handles 3, 4, 6, 8 hex and rgb correctly', () => {
        expect(main.normalizeHexColor('#fff')).toBe('#ffffff');
        expect(main.normalizeHexColor('#ff0a')).toBe('#ffff00');
        expect(main.normalizeHexColor('#0F172A')).toBe('#0f172a');
        expect(main.normalizeHexColor('#50fa7b20')).toBe('#50fa7b');
        expect(main.normalizeHexColor('rgb(15, 23, 42)')).toBe('#0f172a');
        expect(main.normalizeHexColor('invalid', '#123456')).toBe('#123456');
    });

    test('Default Light Theme has distinct light colors and does NOT match Default Dark', () => {
        const darkColors = main.getThemeColors('default-dark');
        const lightColors = main.getThemeColors('default-light');

        expect(darkColors['bg-main']).toBe('#0f172a');
        expect(lightColors['bg-main']).toBe('#f1f5f9');
        expect(darkColors['bg-panel']).toBe('#1e293b');
        expect(lightColors['bg-panel']).toBe('#ffffff');
        expect(darkColors['text-main']).toBe('#f8fafc');
        expect(lightColors['text-main']).toBe('#0f172a');

        expect(lightColors['bg-main']).not.toBe(darkColors['bg-main']);
        expect(lightColors['bg-panel']).not.toBe(darkColors['bg-panel']);
        expect(lightColors['text-main']).not.toBe(darkColors['text-main']);
    });

    test('Custom Color Palette inputs display the active theme colors', async () => {
        state.activeThemeId = 'default-light';
        main.applyTheme('default-light');
        main.updateColorPaletteInputs('default-light');

        expect(document.getElementById('color-bg-main').value).toBe('#f1f5f9');
        expect(document.getElementById('color-bg-panel').value).toBe('#ffffff');
        expect(document.getElementById('color-border-color').value).toBe('#cbd5e1');
        expect(document.getElementById('color-hover-bg').value).toBe('#e2e8f0');
        expect(document.getElementById('color-text-main').value).toBe('#0f172a');
        expect(document.getElementById('color-text-muted').value).toBe('#64748b');

        // Switch to Dracula and verify inputs update
        state.activeThemeId = 'Dracula';
        main.applyTheme('Dracula');
        main.updateColorPaletteInputs('Dracula');

        expect(document.getElementById('color-bg-main').value).toBe('#282a36');
        expect(document.getElementById('color-bg-panel').value).toBe('#44475a');
        expect(document.getElementById('color-hover-bg').value).toBe('#50fa7b');
    });

    test('Changing a palette color sets theme to (unsaved)', () => {
        state.activeThemeId = 'default-dark';
        main.populateThemeDropdown();

        const badge = document.getElementById('theme-unsaved-badge');
        expect(badge.style.display).toBe('none');

        // Simulate changing color input
        const bgInput = document.getElementById('color-bg-main');
        bgInput.value = '#123456';
        bgInput.dispatchEvent(new Event('input'));

        expect(state.isThemeUnsaved).toBe(true);
        expect(document.body.style.getPropertyValue('--bg-main')).toBe('#123456');

        const select = document.getElementById('theme-selector');
        expect(select.value).toBe('__unsaved__');
        expect(select.options[0].textContent).toContain('(unsaved)');
        expect(badge.style.display).toBe('inline');
    });

    test('Saving template clears unsaved state and records new theme', async () => {
        state.activeThemeId = 'default-dark';
        main.setThemeUnsaved(true);

        const nameInput = document.getElementById('theme-name-input');
        nameInput.value = 'Cyan Frost';

        document.getElementById('color-bg-main').value = '#001122';
        document.getElementById('color-bg-panel').value = '#002233';

        await main.saveCustomTheme();

        expect(state.isThemeUnsaved).toBe(false);
        expect(state.activeThemeId).toBe('Cyan Frost');
        expect(state.savedThemes['Cyan Frost']).toBeDefined();
        expect(state.savedThemes['Cyan Frost']['--bg-main']).toBe('#001122');

        const select = document.getElementById('theme-selector');
        expect(select.value).toBe('Cyan Frost');
        expect(select.textContent).not.toContain('(unsaved)');

        const badge = document.getElementById('theme-unsaved-badge');
        expect(badge.style.display).toBe('none');

        // Delete button should now be visible for custom saved theme
        const delBtn = document.getElementById('delete-theme-btn');
        expect(delBtn.style.display).toBe('inline-block');
    });

    test('Save rejects blank name and reserved preset names', async () => {
        state.isThemeUnsaved = true;
        const nameInput = document.getElementById('theme-name-input');
        
        // Blank
        nameInput.value = '   ';
        await main.saveCustomTheme();
        expect(state.isThemeUnsaved).toBe(true);

        // Reserved
        nameInput.value = 'Dracula';
        await main.saveCustomTheme();
        expect(state.isThemeUnsaved).toBe(true);
    });

    test('Selecting another theme clears unsaved state and restores target palette', async () => {
        state.activeThemeId = 'default-dark';
        main.setThemeUnsaved(true);

        const select = document.getElementById('theme-selector');
        select.value = 'Nord';
        select.dispatchEvent(new Event('change'));

        expect(state.isThemeUnsaved).toBe(false);
        expect(state.activeThemeId).toBe('Nord');
        expect(document.getElementById('color-bg-main').value).toBe('#2e3440');
        expect(select.value).toBe('Nord');
    });

    test('Deleting custom theme reverts to default-dark', async () => {
        state.savedThemes['My Theme'] = { '--bg-main': '#111111' };
        state.activeThemeId = 'My Theme';
        state.isThemeUnsaved = false;
        main.populateThemeDropdown();

        await main.deleteCustomTheme();

        expect(state.activeThemeId).toBe('default-dark');
        expect(state.savedThemes['My Theme']).toBeUndefined();
        expect(document.getElementById('color-bg-main').value).toBe('#0f172a');
        expect(document.getElementById('delete-theme-btn').style.display).toBe('none');
    });
});
