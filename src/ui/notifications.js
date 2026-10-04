/**
 * DNS Forge - Action Center UI
 * @module ui/notifications
 */

import { state } from './state.js';
import { escapeHTML, setSafeHTML } from './utils.js';

/**
 * Renders the notification list in the popup.
 */
export function renderNotifications() {
    const container = document.getElementById('notifications-container');
    if (!container) return;

    if (state.notifications.length === 0) {
        setSafeHTML(container, '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No new alerts.</div>');
        return;
    }

    const html = state.notifications.map(notif => `
        <div class="panel-box" style="margin-bottom: 8px; border-left: 4px solid ${notif.severity === 'high' ? 'var(--danger)' : 'var(--warning)'}">
            <div style="font-size: 0.7em; text-transform: uppercase; color: var(--text-muted);">${escapeHTML(notif.type || 'alert')} • ${new Date(notif.timestamp).toLocaleTimeString()}</div>
            <div style="font-size: 0.9em; margin-top: 4px;">${escapeHTML(notif.message || '')}</div>
        </div>
    `).join('');
    setSafeHTML(container, html);
}

/**
 * Initializes notification UI event listeners.
 */
export function initNotifications() {
    document.getElementById('notifications-clear-btn').addEventListener('click', () => {
        state.notifications = [];
        renderNotifications();
    });
}
