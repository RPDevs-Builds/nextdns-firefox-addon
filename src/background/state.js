/**
 * DNS Forge - Background State
 */

export const state = {
    tabRequests: {},
    blockedTabRequests: {},
    currentProfileData: {
        allowlist: new Set(),
        denylist: new Set()
    },
    lastNotificationTimes: {},
    isInitialized: false
};

export const API_BASE = "https://api.nextdns.io";
export const TEST_URL = "https://test.nextdns.io/";
export const ALARM_PREFIX = "tempAllow?";
