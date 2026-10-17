/**
 * Tests for Pi-hole DNS Provider Adapter
 * @module tests/pihole.test
 */

import {
    DEFAULT_PIHOLE_URL,
    normalizePiholeUrl,
    getPiholeConfig,
    extractDomains,
    fetchPiholeProfiles,
    fetchPiholeProfileData,
    managePiholeDomain,
    fetchPiholeLogs,
    clearPiholeLogs,
    disablePiholeBlocking
} from '../src/providers/pihole.js';
import { apiClient } from '../src/apiClient.js';
import { storage } from '../src/storage.js';

describe('Pi-hole DNS Provider Adapter', () => {
    let origFetch;

    beforeEach(() => {
        origFetch = apiClient.fetchWithRetry;
        jest.clearAllMocks();
    });

    afterEach(() => {
        apiClient.fetchWithRetry = origFetch;
    });

    describe('normalizePiholeUrl', () => {
        test('returns DEFAULT_PIHOLE_URL for falsy, empty, or non-string inputs', () => {
            expect(normalizePiholeUrl()).toBe(DEFAULT_PIHOLE_URL);
            expect(normalizePiholeUrl(null)).toBe(DEFAULT_PIHOLE_URL);
            expect(normalizePiholeUrl('')).toBe(DEFAULT_PIHOLE_URL);
            expect(normalizePiholeUrl('   ')).toBe(DEFAULT_PIHOLE_URL);
            expect(normalizePiholeUrl(12345)).toBe(DEFAULT_PIHOLE_URL);
        });

        test('prepends http:// if protocol is omitted', () => {
            expect(normalizePiholeUrl('pi.hole/admin')).toBe('http://pi.hole/admin');
            expect(normalizePiholeUrl('192.168.1.10')).toBe('http://192.168.1.10/admin');
        });

        test('strips trailing slashes and /api.php path', () => {
            expect(normalizePiholeUrl('http://pi.hole/admin/api.php')).toBe('http://pi.hole/admin');
            expect(normalizePiholeUrl('http://pi.hole/api.php/')).toBe('http://pi.hole/admin');
            expect(normalizePiholeUrl('https://custom-pi.hole///')).toBe('https://custom-pi.hole/admin');
        });

        test('preserves existing https and /admin suffix', () => {
            expect(normalizePiholeUrl('https://pi.hole/admin')).toBe('https://pi.hole/admin');
        });
    });

    describe('extractDomains', () => {
        test('handles null, undefined, empty, and non-array structures', () => {
            expect(extractDomains()).toEqual([]);
            expect(extractDomains(null)).toEqual([]);
            expect(extractDomains({})).toEqual([]);
            expect(extractDomains({ data: null })).toEqual([]);
        });

        test('extracts domains from mixed arrays of strings, objects, and nested arrays', () => {
            const data = [
                'direct.com',
                { domain: 'obj-domain.com' },
                { name: 'obj-name.com' },
                ['nested-array.com'],
                { invalid: 123 },
                null,
                123,
                true
            ];
            expect(extractDomains(data)).toEqual([
                'direct.com',
                'obj-domain.com',
                'obj-name.com',
                'nested-array.com'
            ]);
        });
    });

    describe('getPiholeConfig', () => {
        test('uses overrides when provided', async () => {
            const config = await getPiholeConfig('my-token-123', 'https://lan.pihole/admin');
            expect(config.baseUrl).toBe('https://lan.pihole/admin');
            expect(config.apiKey).toBe('my-token-123');

            const partialKey = await getPiholeConfig('only-key', null);
            expect(partialKey.apiKey).toBe('only-key');

            const partialUrl = await getPiholeConfig(null, 'http://only-url');
            expect(partialUrl.baseUrl).toBe('http://only-url/admin');
        });

        test('reads from storage when overrides are null', async () => {
            await storage.set({
                piholeApiKey: 'stored-pihole-token',
                piholeUrl: 'http://192.168.1.100'
            });

            const config = await getPiholeConfig();
            expect(config.baseUrl).toBe('http://192.168.1.100/admin');
            expect(config.apiKey).toBe('stored-pihole-token');
        });

        test('falls back to defaults if storage values are missing', async () => {
            await storage.set({
                piholeApiKey: '',
                piholeUrl: ''
            });

            const config = await getPiholeConfig();
            expect(config.baseUrl).toBe(DEFAULT_PIHOLE_URL);
            expect(config.apiKey).toBe('');

            const nonStringKeyConfig = await getPiholeConfig(12345);
            expect(nonStringKeyConfig.apiKey).toBe('');
        });
    });

    describe('fetchPiholeProfiles', () => {
        test('successfully fetches status and returns normalized profile', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({ status: 'enabled' })
                }
            });

            const res = await fetchPiholeProfiles('test-token');
            expect(res.success).toBe(true);
            expect(res.data).toEqual([
                {
                    id: 'pihole-default',
                    name: 'Pi-hole (enabled)',
                    status: 'enabled'
                }
            ]);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                expect.stringContaining('/api.php?status&auth=test-token'),
                expect.any(Object)
            );

            // Test when json has no status property
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({ otherProp: 'value' })
                }
            });
            const noStatusRes = await fetchPiholeProfiles('test-token');
            expect(noStatusRes.success).toBe(true);
            expect(noStatusRes.data[0].status).toBe('enabled');
        });

        test('handles success response when json parsing fails or status is missing', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
                success: true,
                response: {
                    json: async () => { throw new Error('Bad JSON'); }
                }
            });

            const res = await fetchPiholeProfiles('');
            expect(res.success).toBe(true);
            expect(res.data[0].status).toBe('enabled');

            const noArgsRes = await fetchPiholeProfiles();
            expect(noArgsRes.success).toBe(true);

            const urlOverrideRes = await fetchPiholeProfiles(null, 'http://lan-pi.hole');
            expect(urlOverrideRes.success).toBe(true);
        });

        test('returns failure if fetchWithRetry returns unsuccessful', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false });

            const res = await fetchPiholeProfiles('tok');
            expect(res.success).toBe(false);
            expect(res.data).toEqual([]);
        });

        test('catches exceptions and returns failure', async () => {
            apiClient.fetchWithRetry = jest.fn().mockRejectedValue(new Error('Network error'));

            const res = await fetchPiholeProfiles('tok');
            expect(res.success).toBe(false);
            expect(res.data).toEqual([]);
        });
    });

    describe('fetchPiholeProfileData', () => {
        test('returns empty lists if profileId is falsy', async () => {
            const res = await fetchPiholeProfileData('');
            expect(res.success).toBe(false);
            expect(res.allowlist).toEqual([]);
            expect(res.denylist).toEqual([]);
        });

        test('handles when whiteRes or blackRes returns unsuccessful', async () => {
            apiClient.fetchWithRetry = jest.fn((url) => {
                if (url.includes('list=white')) {
                    return Promise.resolve({ success: false });
                }
                return Promise.resolve({
                    success: true,
                    response: {
                        json: async () => ['blocked1.com']
                    }
                });
            });

            const res = await fetchPiholeProfileData('pihole-default');
            expect(res.success).toBe(true);
            expect(res.allowlist).toEqual([]);
            expect(res.denylist).toEqual(['blocked1.com']);

            apiClient.fetchWithRetry = jest.fn((url) => {
                if (url.includes('list=black')) {
                    return Promise.resolve({ success: false });
                }
                return Promise.resolve({
                    success: true,
                    response: {
                        json: async () => ['allowed1.com']
                    }
                });
            });

            const res2 = await fetchPiholeProfileData('pihole-default');
            expect(res2.success).toBe(true);
            expect(res2.allowlist).toEqual(['allowed1.com']);
            expect(res2.denylist).toEqual([]);

            // Default parameter invocation with no args
            const resNoArgs = await fetchPiholeProfileData();
            expect(resNoArgs.success).toBe(true);
        });

        test('successfully fetches and parses allowlist and denylist across data formats', async () => {
            apiClient.fetchWithRetry = jest.fn((url) => {
                if (url.includes('list=white')) {
                    return Promise.resolve({
                        success: true,
                        response: {
                            json: async () => ({
                                data: [
                                    'whitelist1.com',
                                    { domain: 'whitelist2.com' },
                                    { name: 'whitelist3.com' },
                                    ['whitelist4.com'],
                                    123 // invalid domain ignored
                                ]
                            })
                        }
                    });
                }
                if (url.includes('list=black')) {
                    return Promise.resolve({
                        success: true,
                        response: {
                            json: async () => [
                                'blacklist1.com',
                                { domain: 'blacklist2.com' }
                            ]
                        }
                    });
                }
                return Promise.resolve({ success: false });
            });

            const res = await fetchPiholeProfileData('pihole-default', 'auth-tok', 'http://override');
            expect(res.success).toBe(true);
            expect(res.allowlist).toEqual([
                'whitelist1.com',
                'whitelist2.com',
                'whitelist3.com',
                'whitelist4.com'
            ]);
            expect(res.denylist).toEqual([
                'blacklist1.com',
                'blacklist2.com'
            ]);
        });

        test('handles json failure gracefully', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
                success: true,
                response: {
                    json: async () => { throw new Error('Invalid JSON'); }
                }
            });

            const res = await fetchPiholeProfileData('pihole-default');
            expect(res.success).toBe(true);
            expect(res.allowlist).toEqual([]);
            expect(res.denylist).toEqual([]);
        });

        test('catches unexpected exceptions', async () => {
            apiClient.fetchWithRetry = jest.fn().mockRejectedValue(new Error('Fatal connection drop'));

            const res = await fetchPiholeProfileData('pihole-default');
            expect(res.success).toBe(false);
            expect(res.allowlist).toEqual([]);
            expect(res.denylist).toEqual([]);
        });
    });

    describe('managePiholeDomain', () => {
        test('returns failure if profileId or domain is missing or invalid', async () => {
            expect(await managePiholeDomain('', 'allowlist', 'domain.com', 'add')).toEqual({
                success: false,
                error: 'Missing profile ID or domain'
            });
            expect(await managePiholeDomain('pihole-default', 'allowlist', null, 'add')).toEqual({
                success: false,
                error: 'Missing profile ID or domain'
            });
            expect(await managePiholeDomain('pihole-default', 'allowlist', '   ', 'add')).toEqual({
                success: false,
                error: 'Invalid domain format'
            });
            expect(await managePiholeDomain('pihole-default', 'allowlist', '...', 'add')).toEqual({
                success: false,
                error: 'Invalid domain format'
            });
        });

        test('returns failure for unknown action', async () => {
            const res = await managePiholeDomain('pihole-default', 'allowlist', 'domain.com', 'unknown_action');
            expect(res.success).toBe(false);
            expect(res.error).toBe('Unknown action');
        });

        test('adds domain to whitelist', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true });

            const res = await managePiholeDomain('pihole-default', 'allowlist', '*.Allowed.COM.', 'add', 'tok');
            expect(res.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                expect.stringContaining('list=white&add=allowed.com&auth=tok'),
                expect.any(Object)
            );
        });

        test('deletes domain from whitelist', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true });

            const res = await managePiholeDomain('pihole-default', 'allowlist', 'allowed.com', 'delete', 'tok');
            expect(res.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                expect.stringContaining('list=white&sub=allowed.com&auth=tok'),
                expect.any(Object)
            );
        });

        test('adds and deletes domain from blacklist', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true });

            const addRes = await managePiholeDomain('pihole-default', 'denylist', 'blocked.com', 'add', 'tok');
            expect(addRes.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                expect.stringContaining('list=black&add=blocked.com&auth=tok'),
                expect.any(Object)
            );

            const delRes = await managePiholeDomain('pihole-default', 'denylist', 'blocked.com', 'delete', 'tok');
            expect(delRes.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                expect.stringContaining('list=black&sub=blocked.com&auth=tok'),
                expect.any(Object)
            );
        });

        test('handles fetch errors and exceptions', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false });
            const failRes = await managePiholeDomain('pihole-default', 'allowlist', 'allowed.com', 'add');
            expect(failRes.success).toBe(false);

            apiClient.fetchWithRetry = jest.fn().mockRejectedValue(new Error('Network offline'));
            const errRes = await managePiholeDomain('pihole-default', 'allowlist', 'allowed.com', 'add');
            expect(errRes.success).toBe(false);
            expect(errRes.error).toBe('Network offline');

            apiClient.fetchWithRetry = jest.fn().mockRejectedValue({});
            const errFallbackRes = await managePiholeDomain('pihole-default', 'allowlist', 'allowed.com', 'add');
            expect(errFallbackRes.success).toBe(false);
            expect(errFallbackRes.error).toBe('Action failed');
        });
    });

    describe('fetchPiholeLogs', () => {
        test('parses and maps Pi-hole query logs with status mapping', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({
                        data: [
                            ['1600000000', 'A', 'ads.google.com', '192.168.1.50', '1'], // blocked by gravity
                            ['1600000001', 'AAAA', 'blocked-regex.com', '192.168.1.51', 4], // blocked by regex
                            ['1600000002', 'A', 'blocked-black.com', '192.168.1.52', 5], // blocked by exact blacklist
                            ['1600000003', 'A', 'allowed.org', '192.168.1.53', '2'], // forwarded (allowed)
                            ['not-a-number', 'A', 'fallback-time.com', '192.168.1.54', '3'],
                            ['1600000004', 'A', null, null, '2'], // null domain and client fallback
                            'invalid-row' // non-array row filtered
                        ]
                    })
                }
            });

            const res = await fetchPiholeLogs('pihole-default', 'tok');
            expect(res.success).toBe(true);
            expect(res.data.length).toBe(6);

            expect(res.data[0]).toMatchObject({
                timestamp: 1600000000000,
                domain: 'ads.google.com',
                client: '192.168.1.50',
                status: 'blocked'
            });
            expect(res.data[1].status).toBe('blocked');
            expect(res.data[2].status).toBe('blocked');
            expect(res.data[3].status).toBe('allowed');
            expect(typeof res.data[4].timestamp).toBe('number');
            expect(res.data[5].domain).toBe('');
            expect(res.data[5].client).toBe('');
        });

        test('returns empty array when response is unsuccessful or data is missing', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false });
            const res = await fetchPiholeLogs();
            expect(res.success).toBe(true);
            expect(res.data).toEqual([]);

            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({
                success: true,
                response: {
                    json: async () => ({ data: 'not-array' })
                }
            });
            const notArrayRes = await fetchPiholeLogs();
            expect(notArrayRes.success).toBe(true);
            expect(notArrayRes.data).toEqual([]);
        });

        test('catches fetch exceptions and returns empty array', async () => {
            apiClient.fetchWithRetry = jest.fn().mockRejectedValue(new Error('Connection refused'));
            const res = await fetchPiholeLogs();
            expect(res.success).toBe(true);
            expect(res.data).toEqual([]);
        });
    });

    describe('clearPiholeLogs', () => {
        test('returns success', async () => {
            const res = await clearPiholeLogs();
            expect(res).toEqual({ success: true });
        });
    });

    describe('disablePiholeBlocking', () => {
        test('calls disable endpoint with duration and token', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: true });

            const res = await disablePiholeBlocking(300, 'tok', 'http://pi.hole/admin');
            expect(res.success).toBe(true);
            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                expect.stringContaining('/api.php?disable=300&auth=tok'),
                expect.any(Object)
            );
        });

        test('handles failures and exceptions', async () => {
            apiClient.fetchWithRetry = jest.fn().mockResolvedValue({ success: false });
            const res = await disablePiholeBlocking();
            expect(res.success).toBe(false);

            apiClient.fetchWithRetry = jest.fn().mockRejectedValue(new Error('Disable failed'));
            const errRes = await disablePiholeBlocking(60);
            expect(errRes.success).toBe(false);
            expect(errRes.error).toBe('Disable failed');

            apiClient.fetchWithRetry = jest.fn().mockRejectedValue({});
            const errFallbackRes = await disablePiholeBlocking(60);
            expect(errFallbackRes.success).toBe(false);
            expect(errFallbackRes.error).toBe('Disable failed');
        });
    });
});
