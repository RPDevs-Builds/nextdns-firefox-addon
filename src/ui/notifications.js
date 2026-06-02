/**
 * DNS Forge - Action Center UI
 * @module ui/notifications
 */

import { state } from './state.js';

/**
 * Renders the notification list in the popup.
 */
export function renderNotifications() {
    const container = document.getElementById('notifications-container');
    if (!container) return;

    if (state.notifications.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No new alerts.</div>';
        return;
    }

    container.innerHTML = state.notifications.map(notif => `
        <div class="panel-box" style="margin-bottom: 8px; border-left: 4px solid ${notif.severity === 'high' ? 'var(--danger)' : 'var(--warning)'}">
            <div style="font-size: 0.7em; text-transform: uppercase; color: var(--text-muted);">${notif.type} • ${new Date(notif.timestamp).toLocaleTimeString()}</div>
            <div style="font-size: 0.9em; margin-top: 4px;">${notif.message}</div>
        </div>
    `).join('');
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
