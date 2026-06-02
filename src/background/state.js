/**
 * DNS Forge - Background State
 * This module maintains the runtime state of the background script, including 
 * tab-specific network requests, profile data, and initialization status.
 * 
 * @module background/state
 */

/**
 * Global background state object.
 * @type {Object}
 * @property {Object} tabRequests - Mapping of tab IDs to their current network request logs.
 * @property {Object} blockedTabRequests - Mapping of tab IDs to their blocked request logs.
 * @property {Object} currentProfileData - Cached allowlist and denylist for the active profile.
 * @property {Object} lastNotificationTimes - Timestamp tracking for throttled notifications.
 * @property {boolean} isInitialized - Whether the background services have finished bootstrapping.
 * @property {Array} notifications - List of recent security and maintenance notifications.
 */
export const state = {
    tabRequests: {},
    blockedTabRequests: {},
    currentProfileData: {
        allowlist: new Set(),
        denylist: new Set()
    },
    lastNotificationTimes: {},
    isInitialized: false,
    notifications: []
};

/** @constant {string} Base URL for the NextDNS API */
export const API_BASE = "https://api.nextdns.io";

/** @constant {string} NextDNS diagnostic test URL */
export const TEST_URL = "https://test.nextdns.io/";

/** @constant {string} Prefix for temporary allowlist alarms */
export const ALARM_PREFIX = "tempAllow?";
