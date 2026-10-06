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
 * Helper to recursively sanitize a DOM node tree by stripping
 * dangerous tags, event handlers (on*), and javascript: URIs.
 * @param {Node} node - DOM node to sanitize.
 */
function sanitizeNode(node) {
    if (node.nodeType !== 1) return;

    const dangerousTags = ['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'BASE'];
    if (dangerousTags.includes(node.tagName)) {
        node.remove();
        return;
    }

    const attrs = Array.from(node.attributes);
    for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();

        if (name.startsWith('on')) {
            node.removeAttribute(attr.name);
            continue;
        }

        if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name)) {
            const cleanVal = value.replace(/[\x00-\x1F\x7F-\x9F\s]/g, '');
            if (cleanVal.startsWith('javascript:') || cleanVal.startsWith('vbscript:') || cleanVal.startsWith('data:')) {
                node.removeAttribute(attr.name);
            }
        }
    }

    const children = Array.from(node.childNodes);
    for (const child of children) {
        sanitizeNode(child);
    }
}

/**
 * Helper to safely set HTML from a string (AMO compliance).
 * Sanitizes input through DOMParser and active node sanitization.
 * @param {HTMLElement} el - Target element.
 * @param {string} html - HTML content to inject safely.
 */
export function setSafeHTML(el, html) {
    if (!el) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const rootNodes = Array.from(doc.body.childNodes);
    for (const node of rootNodes) {
        sanitizeNode(node);
    }

    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
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
