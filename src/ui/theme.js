/**
 * DNS Forge - Theme Engine & Custom Palette Management
 * Manages preset palettes, user custom themes, CSS variable application, and theme synchronization across views.
 * 
 * @module ui/theme
 */

import { state, PRESET_THEMES, THEME_VARS, DEFAULT_THEME_COLORS } from './state.js';
import { storage } from '../storage.js';
import { setSafeHTML } from './utils.js';

/**
 * Normalizes any hex/rgb color string into a valid 7-character #rrggbb string for HTML color inputs.
 * @param {string} val - Color string to normalize.
 * @param {string} [fallback='#000000'] - Fallback hex if parsing fails.
 * @returns {string} 7-character lowercase hex string.
 */
export function normalizeHexColor(val, fallback = '#000000') {
    if (!val || typeof val !== 'string') return fallback;
    val = val.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        return val.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{8}$/.test(val)) {
        return val.slice(0, 7).toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(val)) {
        const r = val[1], g = val[2], b = val[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{4}$/.test(val)) {
        const r = val[1], g = val[2], b = val[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    const rgbMatch = val.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
        const r = Math.min(255, parseInt(rgbMatch[1], 10)).toString(16).padStart(2, '0');
        const g = Math.min(255, parseInt(rgbMatch[2], 10)).toString(16).padStart(2, '0');
        const b = Math.min(255, parseInt(rgbMatch[3], 10)).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toLowerCase();
    }
    return fallback;
}

/**
 * Returns the color palette dictionary for a given theme identifier.
 * @param {string} id - Theme identifier.
 * @param {Object} [customThemes=null] - Optional dictionary of custom themes.
 * @returns {Object.<string, string>} Mapping of CSS variable names to hex colors.
 */
export function getThemeColors(id, customThemes = null) {
    if (DEFAULT_THEME_COLORS && DEFAULT_THEME_COLORS[id]) {
        const defaults = DEFAULT_THEME_COLORS[id];
        const res = {};
        THEME_VARS.forEach(v => {
            res[v] = normalizeHexColor(defaults[`--${v}`] || defaults[v]);
        });
        return res;
    }
    const theme = PRESET_THEMES[id] || (customThemes && customThemes[id]) || (state.savedThemes && state.savedThemes[id]);
    const fallback = getThemeColors('default-dark');
    const colors = {};
    THEME_VARS.forEach(v => {
        const raw = theme ? (theme[`--${v}`] || theme[v]) : null;
        colors[v] = raw ? normalizeHexColor(raw, fallback[v]) : fallback[v];
    });
    return colors;
}

/**
 * Returns human-readable display label for a theme ID.
 * @param {string} id - Theme identifier.
 * @returns {string} Human readable label.
 */
export function getThemeDisplayName(id) {
    if (id === 'default-dark') return 'Default Dark';
    if (id === 'default-light') return 'Default Light';
    return id || 'Custom';
}

/**
 * Synchronizes the Custom Color Palette inputs (<input type="color">) to match the specified theme.
 * @param {string} themeId - Theme identifier to pull colors from.
 */
export function updateColorPaletteInputs(themeId) {
    const colors = getThemeColors(themeId);
    THEME_VARS.forEach(v => {
        const input = document.getElementById(`color-${v}`);
        if (input && colors[v]) {
            input.value = normalizeHexColor(colors[v]);
        }
    });
}

/**
 * Updates the visibility of the delete theme button (🗑️).
 * Visible only for user-saved custom themes that are currently saved (not unsaved / preset).
 */
export function updateDeleteThemeBtnVisibility() {
    const delBtn = document.getElementById('delete-theme-btn');
    if (!delBtn) return;
    if (!state.isThemeUnsaved && state.savedThemes && state.savedThemes[state.activeThemeId]) {
        delBtn.style.display = 'inline-block';
    } else {
        delBtn.style.display = 'none';
    }
}

/**
 * Updates the visibility of the (unsaved) badge next to Active Theme label.
 */
export function updateUnsavedBadge() {
    const badge = document.getElementById('theme-unsaved-badge');
    if (!badge) return;
    badge.style.display = state.isThemeUnsaved ? 'inline' : 'none';
}

/**
 * Sets the theme unsaved state and refreshes dropdown / badges.
 * @param {boolean} isUnsaved - Whether changes are currently unsaved.
 */
export function setThemeUnsaved(isUnsaved) {
    if (state.isThemeUnsaved === isUnsaved) return;
    state.isThemeUnsaved = isUnsaved;
    populateThemeDropdown();
}

/**
 * Applies a specific theme ID to the document body.
 * Handles standard light/dark modes, preset themes, and custom CSS variable-based themes.
 * @param {string} id - The unique identifier of the theme to apply.
 * @param {Object} [customThemes=null] - Optional dictionary of custom themes.
 */
export function applyTheme(id, customThemes = null) {
    THEME_VARS.forEach(v => document.body.style.removeProperty(`--${v}`));
    if (id === 'default-light') {
        document.body.classList.add('light-mode');
        const lightColors = getThemeColors('default-light');
        THEME_VARS.forEach(v => document.body.style.setProperty(`--${v}`, lightColors[v]));
    } else {
        document.body.classList.remove('light-mode');
        if (id === 'default-dark') {
            const darkColors = getThemeColors('default-dark');
            THEME_VARS.forEach(v => document.body.style.setProperty(`--${v}`, darkColors[v]));
        } else {
            const theme = PRESET_THEMES[id] || (customThemes && customThemes[id]) || (state.savedThemes && state.savedThemes[id]);
            if (theme) {
                Object.entries(theme).forEach(([key, val]) => {
                    const prop = key.startsWith('--') ? key : `--${key}`;
                    document.body.style.setProperty(prop, val);
                });
            }
        }
    }
}

/**
 * Populates the theme selector dropdown with preset, custom user themes, and unsaved indicators.
 * Utilizes setSafeHTML and DOM nodes for AMO compliance.
 */
export function populateThemeDropdown() {
    const select = document.getElementById("theme-selector");
    if (!select) return;

    setSafeHTML(select, '');

    // If currently unsaved, render unsaved option reflecting base theme
    if (state.isThemeUnsaved) {
        const unsavedOpt = document.createElement('option');
        unsavedOpt.value = '__unsaved__';
        const baseName = getThemeDisplayName(state.activeThemeId);
        unsavedOpt.textContent = `🎨 ${baseName} (unsaved)`;
        select.appendChild(unsavedOpt);
    }

    const optDark = document.createElement('option');
    optDark.value = 'default-dark';
    optDark.textContent = '🌙 Default Dark';
    select.appendChild(optDark);

    const optLight = document.createElement('option');
    optLight.value = 'default-light';
    optLight.textContent = '☀️ Default Light';
    select.appendChild(optLight);

    Object.keys(PRESET_THEMES).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = `✨ ${t}`;
        select.appendChild(opt);
    });

    Object.keys(state.savedThemes || {}).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = `🎨 ${t}`;
        select.appendChild(opt);
    });

    if (state.isThemeUnsaved) {
        select.value = '__unsaved__';
    } else {
        select.value = state.activeThemeId || 'default-dark';
    }

    updateDeleteThemeBtnVisibility();
    updateUnsavedBadge();
}

/**
 * Initializes the theme engine by loading the active theme and custom themes from storage.
 * Synchronizes the internal state and triggers theme application and dropdown population.
 * @async
 */
export async function initThemeEngine() {
    try {
        const { activeTheme, customThemes = {} } = await storage.get(["activeTheme", "customThemes"], { customThemes: {} });
        state.savedThemes = customThemes;
        state.isThemeUnsaved = false;
        if (activeTheme) {
            state.activeThemeId = activeTheme;
            applyTheme(activeTheme);
        } else {
            applyTheme('default-dark');
        }
        populateThemeDropdown();
        updateColorPaletteInputs(state.activeThemeId);
    } catch (e) {
        console.warn("[Theme] Engine initialization warning:", e);
    }
}

/**
 * Initializes and synchronizes theme for the full-screen Data Manager (viewer.html).
 * Loads current theme from storage, applies it, and listens for live updates.
 * @async
 */
export async function initViewerTheme() {
    try {
        await storage.init();
        const { activeTheme = 'default-dark', customThemes = {} } = await storage.get(["activeTheme", "customThemes"], { customThemes: {} });
        applyTheme(activeTheme, customThemes);

        if (typeof browser !== 'undefined' && browser.storage?.onChanged?.addListener) {
            browser.storage.onChanged.addListener(async (changes) => {
                if (changes.activeTheme || changes.customThemes) {
                    const data = await storage.get(["activeTheme", "customThemes"], { customThemes: {} });
                    applyTheme(data.activeTheme || 'default-dark', data.customThemes || {});
                }
            });
        }
    } catch (e) {
        console.warn("[Theme] Viewer theme initialization failed:", e);
    }
}

/**
 * Saves current custom palette under a user-defined theme name.
 * Validates against empty names and reserved presets.
 * @async
 */
export async function saveCustomTheme() {
    const nameInput = document.getElementById('theme-name-input');
    const saveBtn = document.getElementById('save-theme-btn');
    if (!nameInput) return;

    const themeName = nameInput.value.trim();
    if (!themeName) {
        nameInput.focus();
        nameInput.placeholder = 'Please enter a theme name...';
        nameInput.style.borderColor = 'var(--danger)';
        setTimeout(() => {
            if (nameInput) {
                nameInput.placeholder = 'New theme name...';
                nameInput.style.borderColor = '';
            }
        }, 2000);
        return;
    }

    if (['default-dark', 'default-light'].includes(themeName) || PRESET_THEMES[themeName]) {
        nameInput.value = '';
        nameInput.placeholder = 'Name reserved. Choose another...';
        nameInput.style.borderColor = 'var(--danger)';
        setTimeout(() => {
            if (nameInput) {
                nameInput.placeholder = 'New theme name...';
                nameInput.style.borderColor = '';
            }
        }, 2500);
        return;
    }

    const newPalette = {};
    THEME_VARS.forEach(v => {
        const input = document.getElementById(`color-${v}`);
        newPalette[`--${v}`] = input ? input.value : (getThemeColors('default-dark')[v]);
    });

    if (!state.savedThemes) state.savedThemes = {};
    state.savedThemes[themeName] = newPalette;
    await storage.set('customThemes', state.savedThemes);

    state.activeThemeId = themeName;
    state.isThemeUnsaved = false;
    await storage.set('activeTheme', themeName);

    applyTheme(themeName);
    updateColorPaletteInputs(themeName);
    populateThemeDropdown();

    nameInput.value = '';
    if (saveBtn) {
        saveBtn.textContent = '✅';
        saveBtn.disabled = true;
        setTimeout(() => {
            if (saveBtn) {
                saveBtn.textContent = '💾';
                saveBtn.disabled = false;
            }
        }, 1500);
    }
}

/**
 * Deletes the currently selected custom theme and reverts to default dark.
 * @async
 */
export async function deleteCustomTheme() {
    if (state.isThemeUnsaved || !state.savedThemes || !state.savedThemes[state.activeThemeId]) return;

    const themeToDelete = state.activeThemeId;
    delete state.savedThemes[themeToDelete];
    await storage.set('customThemes', state.savedThemes);

    state.activeThemeId = 'default-dark';
    state.isThemeUnsaved = false;
    await storage.set('activeTheme', 'default-dark');

    applyTheme('default-dark');
    updateColorPaletteInputs('default-dark');
    populateThemeDropdown();
}
