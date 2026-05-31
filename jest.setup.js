// jest.setup.js
import { jest } from '@jest/globals';
import "@testing-library/jest-dom";
import "jest-webextension-mock";
import fetchMock from "jest-fetch-mock";

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

    // Ensure onChanged exists
    if (!browser.storage.onChanged) {
        browser.storage.onChanged = {
            addListener: jest.fn(),
            removeListener: jest.fn(),
            hasListener: jest.fn()
        };
    }

    // Ensure menus exist
    if (!browser.menus) {
        browser.menus = {
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            removeAll: jest.fn().mockResolvedValue({}),
            onClicked: {
                addListener: jest.fn(),
                removeListener: jest.fn(),
                hasListener: jest.fn()
            }
        };
    }

    // Ensure action/sidebarAction exist
    if (!browser.action) {
        browser.action = {
            setPopup: jest.fn().mockResolvedValue({}),
            setIcon: jest.fn().mockResolvedValue({}),
            onClicked: {
                addListener: jest.fn(),
                removeListener: jest.fn(),
                hasListener: jest.fn()
            }
        };
    }

    if (!browser.sidebarAction) {
        browser.sidebarAction = {
            open: jest.fn().mockResolvedValue({}),
            toggle: jest.fn().mockResolvedValue({}),
            setPanel: jest.fn().mockResolvedValue({})
        };
    }

    if (!browser.alarms) {
        browser.alarms = {
            create: jest.fn(),
            clear: jest.fn(),
            onAlarm: {
                addListener: jest.fn(),
                removeListener: jest.fn(),
                hasListener: jest.fn()
            }
        };
    }
}
