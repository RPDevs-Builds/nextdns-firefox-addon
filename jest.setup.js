// jest.setup.js
require("@testing-library/jest-dom");
require("jest-webextension-mock");

const fetchMock = require("jest-fetch-mock");
fetchMock.enableMocks();

/**
 * Robust Browser Mock Extension
 * Ensures that storage.local and onChanged are fully available for all test suites.
 */
if (typeof browser !== 'undefined') {
    // Ensure storage areas exist
    if (!browser.storage.local) {
        browser.storage.local = {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue({}),
            remove: jest.fn().mockResolvedValue({}),
            clear: jest.fn().mockResolvedValue({})
        };
    }
    
    if (!browser.storage.sync) {
        browser.storage.sync = {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue({}),
            remove: jest.fn().mockResolvedValue({}),
            clear: jest.fn().mockResolvedValue({})
        };
    }

    // Ensure onChanged exists (common point of failure in background script tests)
    if (!browser.storage.onChanged) {
        browser.storage.onChanged = {
            addListener: jest.fn(),
            removeListener: jest.fn(),
            hasListener: jest.fn()
        };
    }

    // Ensure action/sidebarAction exist for Manifest V3 / Firefox compatibility
    if (!browser.action) {
        browser.action = {
            setPopup: jest.fn().mockResolvedValue({}),
            setIcon: jest.fn().mockResolvedValue({})
        };
    }
}
