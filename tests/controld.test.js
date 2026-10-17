/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, describe, test, expect } from '@jest/globals';
import {
    CONTROLD_API_BASE,
    getControldHeaders,
    fetchControldProfiles,
    fetchControldProfileData,
    manageControldDomain,
    fetchControldLogs,
    clearControldLogs
} from '../src/providers/controld.js';
import { apiClient } from '../src/apiClient.js';
import { storage } from '../src/storage.js';

describe('Control D DNS Provider Module (src/providers/controld.js)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.storage = {
            get: jest.fn(),
            set: jest.fn()
        };
        apiClient.fetchWithRetry = jest.fn();
    });

    describe('getControldHeaders', () => {
        test('uses apiKeyOverride when provided', async () => {
            const headers = await getControldHeaders('test-controld-key');
            expect(headers['Authorization']).toBe('Bearer test-controld-key');
            expect(headers['Content-Type']).toBe('application/json');
            expect(headers['Accept']).toBe('application/json');
        });

        test('falls back to storage when apiKeyOverride is null', async () => {
            jest.spyOn(storage, 'get').mockResolvedValue('stored-controld-key');
            const headers = await getControldHeaders(null);
            expect(headers['Authorization']).toBe('Bearer stored-controld-key');
        });

        test('handles empty key cleanly without Authorization header', async () => {
            jest.spyOn(storage, 'get').mockResolvedValue('');
            const headers = await getControldHeaders('');
            expect(headers['Authorization']).toBeUndefined();
        });
    });

    describe('fetchControldProfiles', () => {
        test('successfully fetches and maps profiles list', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({
                        body: {
                            profiles: [
                                { PK: 'p-1', name: 'Home', updated: 1000 },
                                { PK: 'p-2', updated: 2000 }
                            ]
                        }
                    })
                }
            });

            const res = await fetchControldProfiles('my-key');
            expect(res.success).toBe(true);
            expect(res.data).toEqual([
                { id: 'p-1', name: 'Home', updated: 1000 },
                { id: 'p-2', name: 'p-2', updated: 2000 }
            ]);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                `${CONTROLD_API_BASE}/profiles`,
                expect.objectContaining({ cache: 'no-store' })
            );
        });

        test('handles non-array profiles or empty body safely', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({ body: null })
                }
            });

            const res = await fetchControldProfiles();
            expect(res.success).toBe(true);
            expect(res.data).toEqual([]);
        });

        test('returns failure when API response success is false', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({ success: false });
            const res = await fetchControldProfiles();
            expect(res.success).toBe(false);
            expect(res.data).toEqual([]);
        });

        test('catches fetch exceptions gracefully', async () => {
            apiClient.fetchWithRetry.mockRejectedValue(new Error('Network offline'));
            const res = await fetchControldProfiles();
            expect(res.success).toBe(false);
            expect(res.data).toEqual([]);
        });
    });

    describe('fetchControldProfileData', () => {
        test('returns empty lists when profileId is missing', async () => {
            const res = await fetchControldProfileData('');
            expect(res.success).toBe(false);
            expect(res.allowlist).toEqual([]);
            expect(res.denylist).toEqual([]);
        });

        test('fetches and categorizes rules into allowlist (do: 1) and denylist (do: 0)', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({
                        body: {
                            rules: [
                                { PK: 'allowed.com', action: { do: 1, status: 1 } },
                                { PK: 'blocked.com', action: { do: 0, status: 1 } },
                                { PK: 'redirected.com', action: { do: 2, status: 1 } },
                                { PK: '' } // missing PK
                            ]
                        }
                    })
                }
            });

            const res = await fetchControldProfileData('prof-123');
            expect(res.success).toBe(true);
            expect(res.allowlist).toEqual(['allowed.com']);
            expect(res.denylist).toEqual(['blocked.com']);
        });

        test('handles non-array rules gracefully', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({ body: {} })
                }
            });

            const res = await fetchControldProfileData('prof-123');
            expect(res.success).toBe(true);
            expect(res.allowlist).toEqual([]);
            expect(res.denylist).toEqual([]);
        });

        test('returns failure when network response is unsuccessful', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({ success: false });
            const res = await fetchControldProfileData('prof-123');
            expect(res.success).toBe(false);
            expect(res.allowlist).toEqual([]);
            expect(res.denylist).toEqual([]);
        });

        test('catches network errors gracefully', async () => {
            apiClient.fetchWithRetry.mockRejectedValue(new Error('Fetch timeout'));
            const res = await fetchControldProfileData('prof-123');
            expect(res.success).toBe(false);
            expect(res.allowlist).toEqual([]);
            expect(res.denylist).toEqual([]);
        });
    });

    describe('manageControldDomain', () => {
        test('validates required parameters', async () => {
            expect(await manageControldDomain('', 'allowlist', 'example.com', 'add')).toEqual({
                success: false,
                error: 'Missing profile ID or domain'
            });
            expect(await manageControldDomain('p1', 'allowlist', '', 'add')).toEqual({
                success: false,
                error: 'Missing profile ID or domain'
            });
            expect(await manageControldDomain('p1', 'allowlist', 12345, 'add')).toEqual({
                success: false,
                error: 'Missing profile ID or domain'
            });
            expect(await manageControldDomain('p1', 'allowlist', '   ...   ', 'add')).toEqual({
                success: false,
                error: 'Invalid domain format'
            });
        });

        test('adds domain to allowlist with do: 1', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({ success: true });
            const res = await manageControldDomain('prof-1', 'allowlist', 'Example.COM', 'add');
            expect(res.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                `${CONTROLD_API_BASE}/profiles/prof-1/rules`,
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ hostnames: ['example.com'], do: 1 })
                })
            );
        });

        test('adds domain to denylist with do: 0', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({ success: true });
            const res = await manageControldDomain('prof-1', 'denylist', '*.badsite.org', 'add');
            expect(res.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                `${CONTROLD_API_BASE}/profiles/prof-1/rules`,
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ hostnames: ['badsite.org'], do: 0 })
                })
            );
        });

        test('deletes domain rule using DELETE endpoint', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({ success: true });
            const res = await manageControldDomain('prof-1', 'allowlist', 'removeme.com', 'delete');
            expect(res.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                `${CONTROLD_API_BASE}/profiles/prof-1/rules/removeme.com`,
                expect.objectContaining({
                    method: 'DELETE'
                })
            );
        });

        test('rejects unknown action', async () => {
            const res = await manageControldDomain('prof-1', 'allowlist', 'test.com', 'snooze');
            expect(res.success).toBe(false);
            expect(res.error).toBe('Unknown action');
        });

        test('catches errors and returns failure response', async () => {
            apiClient.fetchWithRetry.mockRejectedValue(new Error('API rate limited'));
            const res = await manageControldDomain('prof-1', 'allowlist', 'test.com', 'add');
            expect(res.success).toBe(false);
            expect(res.error).toBe('API rate limited');

            apiClient.fetchWithRetry.mockRejectedValueOnce({});
            const resNoMsg = await manageControldDomain('prof-1', 'allowlist', 'test.com', 'add');
            expect(resNoMsg.success).toBe(false);
            expect(resNoMsg.error).toBe('Action failed');
        });
    });

    describe('fetchControldLogs & clearControldLogs', () => {
        test('fetchControldLogs returns success with empty data array', async () => {
            const res = await fetchControldLogs('p1');
            expect(res.success).toBe(true);
            expect(res.data).toEqual([]);

            const resDefault = await fetchControldLogs();
            expect(resDefault.success).toBe(true);
        });

        test('clearControldLogs returns success true', async () => {
            const res = await clearControldLogs('p1');
            expect(res.success).toBe(true);

            const resDefault = await clearControldLogs();
            expect(resDefault.success).toBe(true);
        });
    });
});
