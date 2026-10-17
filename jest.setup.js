// jest.setup.js
import { jest } from '@jest/globals';
import "@testing-library/jest-dom";
import "jest-webextension-mock";
import fetchMock from "jest-fetch-mock";

fetchMock.enableMocks();
jest.setTimeout(30000);

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

if (typeof afterEach === 'function') {
    afterEach(() => {
        if (typeof window !== 'undefined' && typeof window.setInterval === 'function') {
            const highestId = window.setInterval(() => {}, 1000);
            for (let i = 1; i <= highestId; i++) {
                if (typeof window.clearInterval === 'function') window.clearInterval(i);
                if (typeof window.clearTimeout === 'function') window.clearTimeout(i);
            }
        }
    });
}
