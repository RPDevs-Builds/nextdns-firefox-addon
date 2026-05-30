/**
 * DNS Forge - Main Popup Entry Point (ES Module)
 */

import { state, isPopoutMode, isSidebarMode, PRESET_THEMES, THEME_VARS, urlParams } from './state.js';
import { setActiveTab, setSafeHTML, escapeHTML } from './utils.js';
import { handleLiveLog, renderLogs, loadAnalytics, updateDashboardTabInfo, updateDynamicLinks, loadNativeLogs } from './dashboard.js';
import { loadToggles, syncLists } from './blocks.js';
import { runSecurityAudit, runIntelligentDebugger } from './tools.js';
import { loadRules, saveAutomationRule } from './scheduler.js';
import { loadPresets } from './presets.js';

document.addEventListener("DOMContentLoaded", async () => {
    initWindowMode();
    await initThemeEngine();
    initGlobalEventListeners();
    initTabNavigation();
    await initializeApp();
});

function initWindowMode() {
    if (isPopoutMode) document.body.classList.add('mode-popout');
    if (isSidebarMode) document.body.classList.add('mode-sidebar');
    if (isSidebarMode) document.body.classList.add('sidebar-mode');
}

async function initThemeEngine() {
    const { activeTheme, customThemes = {} } = await browser.storage.sync.get(["activeTheme", "customThemes"]);
    state.savedThemes = customThemes;
    if (activeTheme) {
        state.activeThemeId = activeTheme;
        applyTheme(activeTheme);
    }
    populateThemeDropdown();
}

function applyTheme(id) {
    THEME_VARS.forEach(v => document.body.style.removeProperty(`--${v}`));
    if (id === 'default-light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
        const theme = PRESET_THEMES[id] || state.savedThemes[id];
        if (theme) {
            Object.entries(theme).forEach(([key, val]) => {
                document.body.style.setProperty(key, val);
            });
        }
    }
}

function populateThemeDropdown() {
    const select = document.getElementById("theme-selector");
    if (!select) return;
    
    setSafeHTML(select, '<option value="default-dark">🌙 Default Dark</option><option value="default-light">☀️ Default Light</option>');
    
    Object.keys(PRESET_THEMES).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = `✨ ${t}`;
        select.appendChild(opt);
    });
    Object.keys(state.savedThemes).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = `🎨 ${t}`;
        select.appendChild(opt);
    });
    
    select.value = state.activeThemeId;
}

function initGlobalEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            const tabId = btn.dataset.tab;
            setActiveTab(tabId);
            if (tabId === 'presets') loadPresets();
        };
    });

    // Dashboard Actions
    document.getElementById("auto-refresh-btn")?.addEventListener('click', (e) => {
        const isEnabled = e.target.classList.contains('btn-secondary');
        toggleAutoRefresh(!isEnabled);
    });

    // Tools
    document.getElementById('run-audit-btn')?.addEventListener('click', runSecurityAudit);
    document.getElementById('run-debugger-btn')?.addEventListener('click', runIntelligentDebugger);
    document.getElementById('add-rule-btn')?.addEventListener('click', saveAutomationRule);

    // Logs SSE listener
    browser.runtime.onMessage.addListener((msg) => {
        if (msg.type === "LIVE_LOG") handleLiveLog(msg.log);
    });
}

function initTabNavigation() {
    const initialTab = urlParams.get('tab') || 'dashboard';
    setActiveTab(initialTab);
}

async function initializeApp() {
    const profile = await browser.runtime.sendMessage({ type: "GET_PROFILE" }).catch(() => null);
    if (profile) {
        state.activeProfile = profile.id;
        const profStatus = document.getElementById("profile-status");
        if (profStatus) {
            const html = `
                <span style="display:inline-block; width:8px; height:8px; background:var(--success); border-radius:50%; box-shadow: 0 0 6px var(--success);"></span>
                Profile: ${escapeHTML(profile.name)}
            `;
            setSafeHTML(profStatus, html);
        }
        browser.runtime.sendMessage({ type: "START_STREAM", profileId: state.activeProfile });
    }

    window.addEventListener("unload", () => {
        browser.runtime.sendMessage({ type: "STOP_STREAM" });
    });

    updateDynamicLinks();
    await syncLists();
    await loadAnalytics();
    await loadToggles();
    await loadRules();
    await initMirrorModeUI();
    updateDashboardTabInfo();
}

async function initMirrorModeUI() {
    const list = document.getElementById('mirror-profiles-list');
    const saveBtn = document.getElementById('save-mirror-btn');
    if (!list || !saveBtn) return;

    const res = await browser.runtime.sendMessage({ type: "GET_PROFILES_LIST" });
    const { mirrorProfiles = [] } = await browser.storage.sync.get("mirrorProfiles");

    if (res?.success) {
        list.textContent = '';
        res.data.forEach(p => {
            if (p.id === state.activeProfile) return;
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.style.display = 'block';
            label.style.marginBottom = '6px';
            const isChecked = mirrorProfiles.includes(p.id);
            setSafeHTML(label, `<input type="checkbox" data-id="${p.id}" ${isChecked ? 'checked' : ''}> ${escapeHTML(p.name)}`);
            list.appendChild(label);
        });
    }

    saveBtn.onclick = async () => {
        const selected = Array.from(list.querySelectorAll('input:checked')).map(i => i.getAttribute('data-id'));
        await browser.storage.sync.set({ mirrorProfiles: selected });
        saveBtn.textContent = "✅ Saved!";
        setTimeout(() => { saveBtn.textContent = "💾 Save Mirror Config"; }, 2000);
    };
}

async function toggleAutoRefresh(enable) {
    const btn = document.getElementById("auto-refresh-btn");
    if (!btn) return;
    if (state.autoRefreshInterval) clearInterval(state.autoRefreshInterval);
    state.autoRefreshInterval = null;

    if (enable) {
        btn.classList.replace("btn-dark", "btn-secondary"); btn.textContent = "⏸️ Auto";
        loadNativeLogs();
        const { autoRefreshTime } = await browser.storage.sync.get("autoRefreshTime");
        state.autoRefreshInterval = setInterval(loadNativeLogs, (parseInt(autoRefreshTime) || 5) * 1000);
    } else { 
        btn.classList.replace("btn-secondary", "btn-dark"); btn.textContent = "▶️ Auto"; 
    }
}
