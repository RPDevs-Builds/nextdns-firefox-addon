/**
 * DNS Forge - Action Center UI
 * @module ui/notifications
 */

import { state } from './state.js';
import { escapeHTML, setSafeHTML, renderEmptyStateHTML } from './utils.js';

/**
 * Updates the visibility of the red indicator badge on the header alerts button.
 */
export function updateAlertsBadge() {
    const badge = document.getElementById('alerts-badge');
    if (!badge) return;
    if (state.notifications && state.notifications.length > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

/**
 * Renders the notification list in the action center popover.
 */
export function renderNotifications() {
    updateAlertsBadge();
    const container = document.getElementById('notifications-container');
    if (!container) return;

    if (!state.notifications || state.notifications.length === 0) {
        setSafeHTML(container, renderEmptyStateHTML('No new alerts.', '🔔'));
        return;
    }

    const html = state.notifications.map(notif => `
        <div class="panel-box" style="margin-bottom: 8px; border-left: 4px solid ${notif.severity === 'high' ? 'var(--danger)' : 'var(--warning)'}">
            <div style="font-size: 0.7em; text-transform: uppercase; color: var(--text-muted);">${escapeHTML(notif.type || 'alert')} • ${!isNaN(new Date(notif.timestamp).getTime()) ? new Date(notif.timestamp).toLocaleTimeString() : 'Recent'}</div>
            <div style="font-size: 0.9em; margin-top: 4px;">${escapeHTML(notif.message || '')}</div>
        </div>
    `).join('');
    setSafeHTML(container, html);
}

/**
 * Initializes notification UI event listeners, header dropdown toggling, and initial sync.
 */
export function initNotifications() {
    const toggleBtn = document.getElementById('alerts-toggle-btn');
    const popover = document.getElementById('alerts-popover');
    const clearBtn = document.getElementById('notifications-clear-btn');

    if (toggleBtn && popover) {
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = popover.classList.contains('hidden');
            if (isHidden) {
                renderNotifications();
                popover.classList.remove('hidden');
            } else {
                popover.classList.add('hidden');
            }
        };

        // Close dropdown when clicking outside
        if (!document.__alertsClickListenerAdded) {
            document.__alertsClickListenerAdded = true;
            document.addEventListener('click', (e) => {
                const p = document.getElementById('alerts-popover');
                const b = document.getElementById('alerts-toggle-btn');
                if (p && !p.classList.contains('hidden') && !p.contains(e.target) && b && !b.contains(e.target)) {
                    p.classList.add('hidden');
                }
            });

            document.addEventListener('keydown', (e) => {
                const p = document.getElementById('alerts-popover');
                if (e.key === 'Escape' && p && !p.classList.contains('hidden')) {
                    p.classList.add('hidden');
                }
            });
        }
    }

    if (clearBtn) {
        clearBtn.onclick = async (e) => {
            e.stopPropagation();
            state.notifications = [];
            renderNotifications();
            showToast("Alerts cleared.", "info");
            try {
                await browser.runtime.sendMessage({ type: "CLEAR_NOTIFICATIONS" });
            } catch (err) {
                console.warn("[Notifications] Clear sync failed:", err);
            }
        };
    }

    // Initial fetch of persisted notifications from background
    browser.runtime.sendMessage({ type: "GET_NOTIFICATIONS" }).then(res => {
        if (res?.success && Array.isArray(res.notifications)) {
            state.notifications = res.notifications;
            updateAlertsBadge();
        }
    }).catch(() => {});
}
