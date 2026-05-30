/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import { apiClient } from '../src/apiClient.js';

describe('Security Auditor (Phase 4.4)', () => {
    let bg;
    let mockStorage = {};

    beforeEach(async () => {
        mockStorage = {};
        apiClient.fetchWithRetry = jest.fn();

        global.browser = {
            storage: {
                sync: {
                    get: jest.fn(keys => {
                        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
                        return Promise.resolve(mockStorage);
                    }),
                    set: jest.fn(obj => {
                        Object.assign(mockStorage, obj);
                        return Promise.resolve();
                    })
                },
                local: {
                    get: jest.fn(keys => {
                        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorage[keys] });
                        return Promise.resolve(mockStorage);
                    }),
                    set: jest.fn(obj => {
                        Object.assign(mockStorage, obj);
                        return Promise.resolve();
                    })
                },
                onChanged: { addListener: jest.fn() }
            },
            runtime: {
                onMessage: { addListener: jest.fn() },
                getURL: jest.fn(path => path)
            },
            alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
            webRequest: { onBeforeRequest: { addListener: jest.fn(), hasListener: jest.fn(() => false) } },
            tabs: { onRemoved: { addListener: jest.fn() } },
            menus: { create: jest.fn(), removeAll: jest.fn().mockResolvedValue(), onClicked: { addListener: jest.fn() } },
            action: { setPopup: jest.fn().mockResolvedValue(), onClicked: { addListener: jest.fn() } }
        };

        global.storage = {
            init: jest.fn().mockResolvedValue(),
            get: jest.fn(key => Promise.resolve(mockStorage[key])),
            set: jest.fn((key, val) => { mockStorage[key] = val; return Promise.resolve(); })
        };

        // Mock fetch for audit metadata
        global.fetch = jest.fn().mockImplementation((url) => {
            if (url.includes('deprecated_lists.json')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        deprecated: [{ id: 'dep-1', name: 'Old List', reason: 'Outdated' }],
                        recommended: []
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        const { messageHandlers } = await import('../src/background/handlers.js');
        bg = { messageHandlers };
    });

    test('RUN_AUDIT: Detects disabled security settings', async () => {
        const profileId = 'p1';
        
        // Mock config with all security off (multiple calls)
        apiClient.fetchWithRetry.mockImplementation((url) => Promise.resolve({
            success: true,
            response: {
                json: () => {
                    if (url.includes('/security')) return Promise.resolve({ dga: false, nrd: false, parkedDomains: false, csam: false });
                    return Promise.resolve({});
                }
            }
        }));

        const result = await bg.messageHandlers.RUN_AUDIT({ profileId });

        expect(result.success).toBe(true);
        expect(result.score).toBeLessThan(100);
        expect(result.recommendations.some(r => r.message.includes('DGA'))).toBe(true);
    });

    test('RUN_AUDIT: Detects deprecated blocklists', async () => {
        const profileId = 'p1';
        
        // Mock config with a deprecated list (multiple calls)
        apiClient.fetchWithRetry.mockImplementation((url) => Promise.resolve({
            success: true,
            response: {
                json: () => {
                    if (url.includes('/security')) return Promise.resolve({ dga: true, nrd: true, parkedDomains: true, csam: true });
                    if (url.includes('/privacy')) return Promise.resolve({ blocklists: [{ id: 'dep-1', name: 'Old List' }] });
                    return Promise.resolve({});
                }
            }
        }));

        const result = await bg.messageHandlers.RUN_AUDIT({ profileId });

        expect(result.success).toBe(true);
        expect(result.recommendations.some(r => r.message.includes('deprecated'))).toBe(true);
        expect(result.recommendations[0].fix.action).toBe('delete');
    });
});
