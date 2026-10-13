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

    test('initViewerTheme: Initializes viewer theme and responds to storage onChanged', async () => {
        const themeModule = await import('../src/ui/theme.js');
        let storageListener;
        global.browser.storage.onChanged.addListener = jest.fn((fn) => { storageListener = fn; });

        await storage.set({
            activeTheme: 'Dracula',
            customThemes: { 'CustomV': { '--bg-main': '#333333' } }
        });

        await themeModule.initViewerTheme();
        expect(document.body.style.getPropertyValue('--bg-main')).toBe('#282a36');

        // Simulate storage change
        if (storageListener) {
            await storage.set('activeTheme', 'Nord');
            await storageListener({ activeTheme: { newValue: 'Nord' } }, 'sync');
            expect(document.body.style.getPropertyValue('--bg-main')).toBe('#2e3440');
        }

        // Test exception handling in initViewerTheme
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const origGet = storage.get;
        storage.get = jest.fn(() => { throw new Error('Viewer storage failure'); });
        await themeModule.initViewerTheme();
        expect(warnSpy).toHaveBeenCalledWith('[Theme] Viewer theme initialization failed:', expect.any(Error));
        storage.get = origGet;
        warnSpy.mockRestore();
    });

    test('saveCustomTheme: Timers reset placeholder and button state correctly', async () => {
        jest.useFakeTimers();
        const nameInput = document.getElementById('theme-name-input');
        const saveBtn = document.getElementById('save-theme-btn');

        // 1. Blank name error reset
        nameInput.value = '';
        await main.saveCustomTheme();
        expect(nameInput.placeholder).toContain('Please enter a theme name');
        jest.advanceTimersByTime(2100);
        expect(nameInput.placeholder).toBe('New theme name...');

        // 2. Reserved name error reset
        nameInput.value = 'default-dark';
        await main.saveCustomTheme();
        expect(nameInput.placeholder).toContain('Name reserved');
        jest.advanceTimersByTime(2600);
        expect(nameInput.placeholder).toBe('New theme name...');

        // 3. Successful save button text reset
        nameInput.value = 'TestTimerTheme';
        await main.saveCustomTheme();
        expect(saveBtn.textContent).toBe('✅');
        jest.advanceTimersByTime(1600);
        expect(saveBtn.textContent).toBe('💾');
        expect(saveBtn.disabled).toBe(false);

        jest.useRealTimers();
    });

    test('initThemeEngine: Catches and logs initialization warnings gracefully', async () => {
        const themeModule = await import('../src/ui/theme.js');
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const origGet = storage.get;
        storage.get = jest.fn(() => { throw new Error('Theme init error'); });
        await themeModule.initThemeEngine();
        expect(warnSpy).toHaveBeenCalledWith('[Theme] Engine initialization warning:', expect.any(Error));
        storage.get = origGet;
        warnSpy.mockRestore();
    });

    test('theme.js - Exhaustive Statement & Branch Coverage Deep Dive', async () => {
        const themeModule = await import('../src/ui/theme.js');

        // 1. normalizeHexColor branches (lines 19-35)
        expect(themeModule.normalizeHexColor(null)).toBe('#000000');
        expect(themeModule.normalizeHexColor(12345)).toBe('#000000');
        expect(themeModule.normalizeHexColor('')).toBe('#000000');
        expect(themeModule.normalizeHexColor('#abc')).toBe('#aabbcc');
        expect(themeModule.normalizeHexColor('#abcd')).toBe('#aabbcc');
        expect(themeModule.normalizeHexColor('#11223344')).toBe('#112233');
        expect(themeModule.normalizeHexColor('rgb(255, 128, 0)')).toBe('#ff8000');
        expect(themeModule.normalizeHexColor('rgba(0, 255, 64, 0.5)')).toBe('#00ff40');
        expect(themeModule.normalizeHexColor('invalid-color', '#123456')).toBe('#123456');

        // 2. updateDeleteThemeBtnVisibility with missing DOM element (line 101)
        const delBtn = document.getElementById('delete-theme-btn');
        delBtn.remove();
        themeModule.updateDeleteThemeBtnVisibility(); // should not throw

        // 3. updateUnsavedBadge with missing DOM element (line 114)
        const badge = document.getElementById('theme-unsaved-badge');
        badge.remove();
        themeModule.updateUnsavedBadge(); // should not throw

        // 4. saveCustomTheme with missing nameInput (line 268)
        const nameInput = document.getElementById('theme-name-input');
        nameInput.remove();
        await themeModule.saveCustomTheme(); // should return early without throwing

        // 5. deleteCustomTheme guard when theme is unsaved or not in savedThemes (line 333)
        state.isThemeUnsaved = true;
        await themeModule.deleteCustomTheme();
        state.isThemeUnsaved = false;
        state.savedThemes = {};
        state.activeThemeId = 'nonexistent-theme';
        await themeModule.deleteCustomTheme();

        // 6. getThemeDisplayName fallback branch (line 78)
        expect(themeModule.getThemeDisplayName('')).toBe('Custom');
        expect(themeModule.getThemeDisplayName(null)).toBe('Custom');
        expect(themeModule.getThemeDisplayName('my-custom-theme')).toBe('my-custom-theme');

        // 7. getThemeColors without customThemes parameter (line 60)
        expect(themeModule.getThemeColors('nonexistent', null)).toBeDefined();

        // 8. initThemeEngine with default-dark fallback when activeTheme is null (line 226-228)
        const origGetStorage = storage.get;
        storage.get = jest.fn().mockResolvedValue({ activeTheme: null, customThemes: {} });
        await themeModule.initThemeEngine();
        expect(document.body.style.getPropertyValue('--bg-main')).toBe('#0f172a');
        storage.get = origGetStorage;

        // 9. initViewerTheme default arguments (line 244) & storage change without properties (line 249)
        let viewerListener;
        global.browser.storage.onChanged.addListener = jest.fn((fn) => { viewerListener = fn; });
        storage.get = jest.fn().mockResolvedValue({}); // activeTheme and customThemes undefined
        await themeModule.initViewerTheme();

        // Simulate storage event where neither activeTheme nor customThemes changed
        if (viewerListener) {
            await viewerListener({ otherKey: { newValue: 123 } });
            // Simulate storage event where activeTheme has fallback
            storage.get = jest.fn().mockResolvedValue({ activeTheme: null, customThemes: null });
            await viewerListener({ activeTheme: { newValue: 'default-dark' } });
        }
        storage.get = origGetStorage;

        // 10. saveCustomTheme with missing saveBtn (line 316) and color input missing (line 300)
        document.body.innerHTML = `
            <input id="theme-name-input" value="NoSaveBtnTheme" />
        `;
        await themeModule.saveCustomTheme();
        expect(state.savedThemes['NoSaveBtnTheme']).toBeDefined();

        // 11. Timers in saveCustomTheme
        jest.useFakeTimers();
        document.body.innerHTML = `
            <input id="theme-name-input" value="" />
            <button id="save-theme-btn"></button>
        `;
        const savePromise1 = themeModule.saveCustomTheme();
        jest.advanceTimersByTime(2100);
        await savePromise1;
        expect(document.getElementById('theme-name-input').placeholder).toBe('New theme name...');

        document.body.innerHTML = `
            <input id="theme-name-input" value="default-dark" />
            <button id="save-theme-btn"></button>
        `;
        const savePromise2 = themeModule.saveCustomTheme();
        jest.advanceTimersByTime(2600);
        await savePromise2;
        expect(document.getElementById('theme-name-input').placeholder).toBe('New theme name...');
        jest.useRealTimers();
    });

    test('theme.js - 100% Branch Coverage Target', async () => {
        const themeModule = await import('../src/ui/theme.js');
        const { DEFAULT_THEME_COLORS } = await import('../src/ui/state.js');

        // 1. Line 56: defaults[v] without '--' prefix
        DEFAULT_THEME_COLORS['test-no-prefix'] = {
            'bg-main': '#111111',
            'bg-panel': '#222222',
            'border-color': '#333333',
            'text-main': '#444444',
            'text-muted': '#555555',
            'hover-bg': '#666666'
        };
        const noPrefixColors = themeModule.getThemeColors('test-no-prefix');
        expect(noPrefixColors['bg-main']).toBe('#111111');
        delete DEFAULT_THEME_COLORS['test-no-prefix'];

        // 2. Line 60 & 64: theme from state.savedThemes with keys without '--'
        state.savedThemes = {
            'saved-no-prefix': {
                'bg-main': '#121212'
            }
        };
        const savedColors = themeModule.getThemeColors('saved-no-prefix', null);
        expect(savedColors['bg-main']).toBe('#121212');

        // 3. Line 76 & 77: getThemeDisplayName
        expect(themeModule.getThemeDisplayName('default-dark')).toBe('Default Dark');
        expect(themeModule.getThemeDisplayName('default-light')).toBe('Default Light');

        // 4. Line 102 & 103: updateDeleteThemeBtnVisibility (true branch)
        document.body.innerHTML = '<button id="delete-theme-btn"></button>';
        state.isThemeUnsaved = false;
        state.activeThemeId = 'custom-del';
        state.savedThemes = { 'custom-del': { '--bg-main': '#000000' } };
        themeModule.updateDeleteThemeBtnVisibility();
        expect(document.getElementById('delete-theme-btn').style.display).toBe('inline-block');

        // 5. Line 115: updateUnsavedBadge (true branch)
        document.body.innerHTML = '<span id="theme-unsaved-badge"></span>';
        state.isThemeUnsaved = true;
        themeModule.updateUnsavedBadge();
        expect(document.getElementById('theme-unsaved-badge').style.display).toBe('inline');

        // 6. Line 123: setThemeUnsaved early return
        state.isThemeUnsaved = true;
        themeModule.setThemeUnsaved(true); // matches current state -> returns early

        // 7. Line 136: applyTheme('default-light')
        themeModule.applyTheme('default-light');
        expect(document.body.classList.contains('light-mode')).toBe(true);

        // 8. Line 146 & 150: applyTheme with key without '--' in savedThemes
        state.savedThemes = {
            'no-dash-theme': {
                'bg-main': '#aabbcc'
            }
        };
        themeModule.applyTheme('no-dash-theme', null);
        expect(document.body.style.getPropertyValue('--bg-main')).toBe('#aabbcc');

        // 9. Line 171, 203, 206: populateThemeDropdown with isThemeUnsaved = true
        document.body.innerHTML = '<select id="theme-selector"></select><span id="theme-unsaved-badge"></span><button id="delete-theme-btn"></button>';
        state.isThemeUnsaved = true;
        state.activeThemeId = 'Nord';
        themeModule.populateThemeDropdown();
        const sel = document.getElementById('theme-selector');
        expect(sel.value).toBe('__unsaved__');

        // populateThemeDropdown with activeThemeId = null (line 206 fallback 'default-dark')
        state.isThemeUnsaved = false;
        state.activeThemeId = null;
        state.savedThemes = null; // line 196 fallback || {}
        themeModule.populateThemeDropdown();
        expect(sel.value).toBe('default-dark');

        // 10. Line 220 & 223: initThemeEngine with activeTheme and missing customThemes
        const origGet = storage.get;
        storage.get = jest.fn().mockResolvedValue({ activeTheme: 'Nord' }); // customThemes undefined
        await themeModule.initThemeEngine();
        expect(state.activeThemeId).toBe('Nord');
        storage.get = origGet;

        // 11. Line 300, 303, 320: saveCustomTheme with color inputs, state.savedThemes null, and saveBtn timer
        jest.useFakeTimers();
        document.body.innerHTML = `
            <input id="theme-name-input" value="CleanTheme" />
            <button id="save-theme-btn"></button>
            <input id="color-bg-main" value="#112233" />
            <select id="theme-selector"></select>
            <span id="theme-unsaved-badge"></span>
            <button id="delete-theme-btn"></button>
        `;
        state.savedThemes = null; // triggers line 303 `if (!state.savedThemes) state.savedThemes = {};`
        await themeModule.saveCustomTheme();
        expect(document.getElementById('save-theme-btn').textContent).toBe('✅');
        jest.advanceTimersByTime(1600);
        expect(document.getElementById('save-theme-btn').textContent).toBe('💾');
        expect(document.getElementById('save-theme-btn').disabled).toBe(false);
        jest.useRealTimers();

        // 12. deleteCustomTheme successful path
        state.isThemeUnsaved = false;
        state.activeThemeId = 'CleanTheme';
        await themeModule.deleteCustomTheme();
        expect(state.activeThemeId).toBe('default-dark');

        // 13. Line 60 & 146 & 148: applyTheme and getThemeColors when theme does not exist anywhere
        state.savedThemes = {};
        expect(themeModule.getThemeColors('completely-unknown-theme', {})).toBeDefined();
        themeModule.applyTheme('completely-unknown-theme', {}); // hits line 148 if (theme) false branch

        // 14. Line 151: applyTheme with non-string and invalid color values
        state.savedThemes = {
            'invalid-colors-theme': {
                '--bg-main': 'not-a-hex-color',
                '--bg-panel': 12345
            }
        };
        themeModule.applyTheme('invalid-colors-theme');

        // 15. Line 247: initViewerTheme when browser.storage.onChanged.addListener is missing
        const origBrowser = global.browser;
        global.browser = {};
        await themeModule.initViewerTheme();
        global.browser = origBrowser;
    });
});
