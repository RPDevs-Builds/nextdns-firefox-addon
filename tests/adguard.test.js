/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, describe, test, expect } from '@jest/globals';
import {
    ADGUARD_API_BASE,
    getAdguardHeaders,
    fetchAdguardServers,
    fetchAdguardProfileData,
    manageAdguardDomain,
    fetchAdguardLogs,
    clearAdguardLogs
} from '../src/providers/adguard.js';
import { apiClient } from '../src/apiClient.js';
import { storage } from '../src/storage.js';

describe('AdGuard DNS Provider Module (src/providers/adguard.js)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.storage = {
            get: jest.fn(),
            set: jest.fn()
        };
        apiClient.fetchWithRetry = jest.fn();
    });

    describe('getAdguardHeaders', () => {
        test('uses apiKeyOverride when provided', async () => {
            const headers = await getAdguardHeaders('test-override-key');
            expect(headers['Authorization']).toBe('ApiKey test-override-key');
            expect(headers['Content-Type']).toBe('application/json');
            expect(headers['Accept']).toBe('application/json');
        });

        test('falls back to storage when apiKeyOverride is null', async () => {
            jest.spyOn(storage, 'get').mockResolvedValue('stored-api-key');
            const headers = await getAdguardHeaders(null);
            expect(headers['Authorization']).toBe('ApiKey stored-api-key');
        });

        test('handles empty key cleanly without Authorization header', async () => {
            jest.spyOn(storage, 'get').mockResolvedValue('');
            const headers = await getAdguardHeaders('');
            expect(headers['Authorization']).toBeUndefined();
        });
    });

    describe('fetchAdguardServers', () => {
        test('successfully fetches and maps server list array', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => [
                        { id: 'srv-1', name: 'Default', default: true, settings: { protection_enabled: true } },
                        { id: 'srv-2', name: 'Work', default: false }
                    ]
                }
            });

            const res = await fetchAdguardServers('test-key');
            expect(res.success).toBe(true);
            expect(res.data.length).toBe(2);
            expect(res.data[0].id).toBe('srv-1');
            expect(res.data[0].default).toBe(true);
            expect(res.data[1].id).toBe('srv-2');
            expect(res.data[1].default).toBe(false);
        });

        test('handles json.data wrapped payload', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({
                        data: [{ id: 'srv-1', name: 'Default' }]
                    })
                }
            });

            const res = await fetchAdguardServers('test-key');
            expect(res.success).toBe(true);
            expect(res.data.length).toBe(1);
        });

        test('returns failure when fetch fails', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({ success: false });
            const res = await fetchAdguardServers('test-key');
            expect(res.success).toBe(false);
            expect(res.data).toEqual([]);
        });

        test('catches exceptions and returns fallback', async () => {
            apiClient.fetchWithRetry.mockRejectedValue(new Error('Network offline'));
            const res = await fetchAdguardServers('test-key');
            expect(res.success).toBe(false);
            expect(res.data).toEqual([]);
        });
    });

    describe('fetchAdguardProfileData', () => {
        test('returns empty lists if serverId is invalid or missing', async () => {
            const res1 = await fetchAdguardProfileData('');
            expect(res1.success).toBe(false);
            expect(res1.allowlist).toEqual([]);

            const res2 = await fetchAdguardProfileData(null);
            expect(res2.success).toBe(false);
        });

        test('successfully parses @@|| for allowlist and || for denylist', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({
                        settings: {
                            user_rules_settings: {
                                rules: [
                                    '@@||allowed.com^',
                                    '||blocked.com^',
                                    '@@||trusted.org^',
                                    123, // non-string fallback check
                                    '# comment line'
                                ]
                            }
                        }
                    })
                }
            });

            const res = await fetchAdguardProfileData('srv-123');
            expect(res.success).toBe(true);
            expect(res.allowlist).toEqual(['allowed.com', 'trusted.org']);
            expect(res.denylist).toEqual(['blocked.com']);
        });

        test('handles failed fetch response', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({ success: false });
            const res = await fetchAdguardProfileData('srv-123');
            expect(res.success).toBe(false);
            expect(res.allowlist).toEqual([]);
            expect(res.denylist).toEqual([]);
        });

        test('catches error and returns empty lists', async () => {
            apiClient.fetchWithRetry.mockRejectedValue(new Error('Server error'));
            const res = await fetchAdguardProfileData('srv-123');
            expect(res.success).toBe(false);
            expect(res.allowlist).toEqual([]);
        });
    });

    describe('manageAdguardDomain', () => {
        test('rejects missing or invalid arguments', async () => {
            const res1 = await manageAdguardDomain('', 'allowlist', 'test.com', 'add');
            expect(res1.success).toBe(false);

            const res2 = await manageAdguardDomain('srv-1', 'allowlist', '', 'add');
            expect(res2.success).toBe(false);

            const res3 = await manageAdguardDomain('srv-1', 'allowlist', '   ', 'add');
            expect(res3.success).toBe(false);
        });

        test('fails if fetching current server settings fails', async () => {
            apiClient.fetchWithRetry.mockResolvedValueOnce({ success: false });
            const res = await manageAdguardDomain('srv-1', 'allowlist', 'example.com', 'add');
            expect(res.success).toBe(false);
            expect(res.error).toBe('Failed to fetch current AdGuard settings');
        });

        test('adds domain to allowlist with @@||domain^ format', async () => {
            apiClient.fetchWithRetry
                .mockResolvedValueOnce({
                    success: true,
                    response: {
                        json: async () => ({
                            settings: {
                                user_rules_settings: {
                                    rules: ['||other.com^']
                                }
                            }
                        })
                    }
                })
                .mockResolvedValueOnce({ success: true });

            const res = await manageAdguardDomain('srv-1', 'allowlist', 'example.com', 'add');
            expect(res.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                `${ADGUARD_API_BASE}/dns_servers/srv-1/settings`,
                expect.objectContaining({
                    method: 'PUT',
                    body: JSON.stringify({
                        user_rules_settings: {
                            enabled: true,
                            rules: ['||other.com^', '@@||example.com^']
                        }
                    })
                })
            );
        });

        test('adds domain to denylist with ||domain^ format', async () => {
            apiClient.fetchWithRetry
                .mockResolvedValueOnce({
                    success: true,
                    response: {
                        json: async () => ({
                            settings: { user_rules_settings: { rules: [] } }
                        })
                    }
                })
                .mockResolvedValueOnce({ success: true });

            const res = await manageAdguardDomain('srv-1', 'denylist', 'badsite.org', 'add');
            expect(res.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                `${ADGUARD_API_BASE}/dns_servers/srv-1/settings`,
                expect.objectContaining({
                    method: 'PUT',
                    body: JSON.stringify({
                        user_rules_settings: {
                            enabled: true,
                            rules: ['||badsite.org^']
                        }
                    })
                })
            );
        });

        test('deletes domain rule cleanly', async () => {
            apiClient.fetchWithRetry
                .mockResolvedValueOnce({
                    success: true,
                    response: {
                        json: async () => ({
                            settings: {
                                user_rules_settings: {
                                    rules: ['||remove-me.com^', '@@||stay.com^']
                                }
                            }
                        })
                    }
                })
                .mockResolvedValueOnce({ success: true });

            const res = await manageAdguardDomain('srv-1', 'denylist', 'remove-me.com', 'delete');
            expect(res.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                `${ADGUARD_API_BASE}/dns_servers/srv-1/settings`,
                expect.objectContaining({
                    method: 'PUT',
                    body: JSON.stringify({
                        user_rules_settings: {
                            enabled: true,
                            rules: ['@@||stay.com^']
                        }
                    })
                })
            );
        });

        test('handles exceptions and returns error message', async () => {
            apiClient.fetchWithRetry.mockRejectedValue(new Error('Network error'));
            const res = await manageAdguardDomain('srv-1', 'allowlist', 'example.com', 'add');
            expect(res.success).toBe(false);
            expect(res.error).toBe('Network error');
        });
    });

    describe('fetchAdguardLogs', () => {
        test('normalizes query log items into standard format', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({
                        items: [
                            {
                                domain: 'blocked.com',
                                time_millis: 1600000000000,
                                device_id: 'dev-1',
                                device_name: 'Work Phone',
                                filtering_info: { status: 'BLOCKED', rules: [{ text: 'AdGuard Base' }] }
                            },
                            {
                                domain: 'allowed.com',
                                time_millis: 1600000001000,
                                device_id: 'dev-2',
                                filtering_info: { status: 'WHITELISTED', rules: ['Custom Allow'] }
                            },
                            {
                                domain: 'standard.com',
                                time_millis: 1600000002000,
                                filtering_info: { status: 'UNKNOWN' }
                            }
                        ]
                    })
                }
            });

            const res = await fetchAdguardLogs('srv-1', 1000, 2000);
            expect(res.success).toBe(true);
            expect(res.data.length).toBe(3);
            expect(res.data[0].status).toBe('blocked');
            expect(res.data[0].device.name).toBe('Work Phone');
            expect(res.data[1].status).toBe('allowed');
            expect(res.data[2].status).toBe('default');
        });

        test('returns empty array on failed request', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({ success: false });
            const res = await fetchAdguardLogs();
            expect(res.success).toBe(false);
            expect(res.data).toEqual([]);
        });

        test('catches error and returns fallback', async () => {
            apiClient.fetchWithRetry.mockRejectedValue(new Error('Timeout'));
            const res = await fetchAdguardLogs('srv-1');
            expect(res.success).toBe(false);
            expect(res.data).toEqual([]);
        });

        test('handles missing items property and default timestamps', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({})
                }
            });

            const res = await fetchAdguardLogs('');
            expect(res.success).toBe(true);
            expect(res.data).toEqual([]);
        });
    });

    describe('additional edge cases for 100% coverage', () => {
        test('fetchAdguardServers default arg and empty data fallback', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({})
                }
            });
            const res = await fetchAdguardServers();
            expect(res.success).toBe(true);
            expect(res.data).toEqual([]);
        });

        test('fetchAdguardProfileData handles missing rules array', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({ settings: {} })
                }
            });
            const res = await fetchAdguardProfileData('srv-1');
            expect(res.success).toBe(true);
            expect(res.allowlist).toEqual([]);
            expect(res.denylist).toEqual([]);
        });

        test('manageAdguardDomain handles empty cleanDomain, missing rules, unknown action, and err without message', async () => {
            // Empty cleanDomain
            const res1 = await manageAdguardDomain('srv-1', 'allowlist', '...', 'add');
            expect(res1.success).toBe(false);
            expect(res1.error).toBe('Invalid domain format');

            // Missing user_rules_settings.rules and unknown action
            apiClient.fetchWithRetry
                .mockResolvedValueOnce({
                    success: true,
                    response: {
                        json: async () => ({ settings: {} })
                    }
                });

            const res2 = await manageAdguardDomain('srv-1', 'allowlist', 'valid.com', 'other-action');
            expect(res2.success).toBe(false);
            expect(res2.error).toBe('Unknown action');

            // Error with no message
            apiClient.fetchWithRetry.mockImplementationOnce(() => {
                throw 'string error';
            });
            const res3 = await manageAdguardDomain('srv-1', 'allowlist', 'valid.com', 'add');
            expect(res3.success).toBe(false);
            expect(res3.error).toBe('Action failed');
        });
    });

    describe('clearAdguardLogs', () => {
        test('deletes query log with success', async () => {
            apiClient.fetchWithRetry.mockResolvedValue({ success: true });
            const res = await clearAdguardLogs();
            expect(res.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                `${ADGUARD_API_BASE}/query_log`,
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        test('handles exceptions on clear', async () => {
            apiClient.fetchWithRetry.mockRejectedValue(new Error('Failed'));
            const res = await clearAdguardLogs();
            expect(res.success).toBe(false);
        });
    });
});
