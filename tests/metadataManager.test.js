/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('MetadataManager Unit Tests', () => {
    let loadMetadata;

    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();
        global.fetch = jest.fn();

        global.browser = {
            storage: {
                local: {
                    get: jest.fn(),
                    set: jest.fn().mockResolvedValue({})
                }
            },
            runtime: {
                getURL: jest.fn((p) => `chrome-extension://test/${p}`)
            }
        };

        const module = await import('../src/metadataManager.js');
        loadMetadata = module.loadMetadata;
    });

    test('returns cached metadata from storage.local if present and complete', async () => {
        const cached = {
            tlds: [{ id: 'xyz', name: 'XYZ' }],
            blocklists: [{ id: 'oisd', name: 'OISD' }]
        };
        global.browser.storage.local.get.mockResolvedValueOnce({ scrapedMeta: cached });

        const result = await loadMetadata();
        expect(result).toEqual(cached);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('falls back to remote GitHub fetch when local cache is incomplete', async () => {
        // Cache exists but is empty/incomplete
        global.browser.storage.local.get.mockResolvedValueOnce({ scrapedMeta: { tlds: [] } });

        const remoteData = {
            tlds: [{ id: 'com', name: 'Commercial' }],
            blocklists: [{ id: 'adguard', name: 'AdGuard' }]
        };
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => remoteData
        });

        const result = await loadMetadata();
        expect(result).toEqual(remoteData);
        expect(global.browser.storage.local.set).toHaveBeenCalledWith({ scrapedMeta: remoteData });
    });

    test('falls back to local bundled data when remote fetch fails', async () => {
        global.browser.storage.local.get.mockResolvedValueOnce({});
        // Remote fetch returns null/fails
        global.fetch.mockRejectedValueOnce(new Error("Network offline"));

        const bundleData = {
            tlds: [{ id: 'net' }],
            blocklists: [{ id: 'easylist' }]
        };
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => bundleData
        });

        const result = await loadMetadata();
        expect(result).toEqual(bundleData);
        expect(global.browser.runtime.getURL).toHaveBeenCalledWith('data/blocks_meta.json');
    });

    test('returns default safe structure on critical failure', async () => {
        global.browser.storage.local.get.mockRejectedValueOnce(new Error("Storage unavailable"));
        global.fetch.mockRejectedValue(new Error("All fetch failed"));

        const result = await loadMetadata();
        expect(result).toEqual({
            blocklists: [],
            parental_services: [],
            tlds: [],
            categories: []
        });
    });
});
