/**
 * DNS Forge - UI Utilities
 */

import { state } from './state.js';

export function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

/**
 * Helper to safely set HTML from a string (AMO compliance)
 */
export function setSafeHTML(el, html) {
    if (!el) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    el.innerHTML = '';
    while (doc.body.firstChild) {
        el.appendChild(doc.body.firstChild);
    }
}

export function setActiveTab(tabId) {
    if (!tabId) return;
    console.log(`[DNS Forge] Switching to tab: ${tabId}`);
    state.activeTab = tabId;

    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    if (tabButtons.length === 0) console.warn("[DNS Forge] No .tab-btn elements found.");
    if (tabContents.length === 0) console.warn("[DNS Forge] No .tab-content elements found.");

    tabButtons.forEach(btn => {
        const isActive = btn.dataset.tab === tabId;
        btn.classList.toggle('active', isActive);
    });

    tabContents.forEach(content => {
        const isActive = content.id === `tab-${tabId}`;
        content.classList.toggle('active', isActive);
        if (isActive) {
            content.style.display = 'flex'; // Ensure it's visible if using flex layout
        } else {
            content.style.display = 'none';
        }
    });
}

/**
 * Utility to download a string/object as a file.
 * @param {string} filename - Name of the file.
 * @param {string} content - Stringified content.
 * @param {string} [type='application/json'] - MIME type.
 */
export function downloadAsFile(filename, content, type = 'application/json') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}
