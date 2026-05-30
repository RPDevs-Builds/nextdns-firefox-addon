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
    state.activeTab = tabId;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
}
