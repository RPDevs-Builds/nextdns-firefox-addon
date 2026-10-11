/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('APIClient Unit Tests', () => {
    let APIClient;

    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();
        global.fetch = jest.fn();

        const module = await import('../src/apiClient.js');
        APIClient = module.APIClient;
    });

    test('initializes with default and custom base URLs', () => {
        const clientDefault = new APIClient();
        expect(clientDefault.baseURL).toBe("https://api.nextdns.io");

        const clientCustom = new APIClient("https://custom.dns.io");
        expect(clientCustom.baseURL).toBe("https://custom.dns.io");
    });

    test('getHeaders injects apiKey from storage if available', async () => {
        const client = new APIClient();
        const headersNoStorage = await client.getHeaders();
        expect(headersNoStorage['Content-Type']).toBe("application/json");
        expect(headersNoStorage['X-Api-Key']).toBe("");

        const mockStorage = {
            get: jest.fn().mockResolvedValue("test-secret-key-123")
        };
        client.setStorage(mockStorage);

        const headersWithStorage = await client.getHeaders();
        expect(headersWithStorage['X-Api-Key']).toBe("test-secret-key-123");
        expect(mockStorage.get).toHaveBeenCalledWith("apiKey", "");
    });

    test('fetchWithRetry succeeds on first attempt for 200 OK', async () => {
        const client = new APIClient();
        global.fetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: async () => ({ data: [{ id: "profile1" }] })
        });

        const res = await client.fetchWithRetry("/profiles", {}, 2, 10);
        expect(res.success).toBe(true);
        expect(res.response.status).toBe(200);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith("https://api.nextdns.io/profiles", expect.any(Object));
    });

    test('fetchWithRetry retries on 500 server error and succeeds', async () => {
        const client = new APIClient();
        global.fetch
            .mockResolvedValueOnce({ status: 500, ok: false, headers: { get: () => null } })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ success: true })
            });

        const res = await client.fetchWithRetry("/profiles", {}, 3, 10);
        expect(res.success).toBe(true);
        expect(res.response.status).toBe(200);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('fetchWithRetry respects 429 rate limiting with Retry-After header', async () => {
        const client = new APIClient();
        global.fetch
            .mockResolvedValueOnce({
                status: 429,
                ok: false,
                headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '1' : null) }
            })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ success: true })
            });

        const res = await client.fetchWithRetry("/profiles", {}, 2, 10);
        expect(res.success).toBe(true);
        expect(res.response.status).toBe(200);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('fetchWithRetry returns last response when all retries are exhausted', async () => {
        const client = new APIClient();
        global.fetch.mockResolvedValue({
            status: 503,
            ok: false,
            headers: { get: () => null }
        });

        const res = await client.fetchWithRetry("/profiles", {}, 2, 10);
        expect(res.success).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('fetchWithRetry handles network exceptions and retries', async () => {
        const client = new APIClient();
        global.fetch
            .mockRejectedValueOnce(new Error("Network connection dropped"))
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ success: true })
            });

        const res = await client.fetchWithRetry("/profiles", {}, 2, 10);
        expect(res.success).toBe(true);
        expect(res.response.status).toBe(200);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('fetchWithRetry extracts detailed message from JSON errors array on 400 Bad Request', async () => {
        const client = new APIClient();
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => ({
                json: async () => ({ errors: [{ message: "Domain name is invalid" }] })
            })
        });

        const res = await client.fetchWithRetry("/profiles/xyz/rewrites", { method: 'POST' }, 1, 10);
        expect(res.success).toBe(false);
        expect(res.error).toBe("Domain name is invalid");
    });

    test('fetchWithRetry extracts error string from JSON error field on 403 Forbidden', async () => {
        const client = new APIClient();
        global.fetch.mockResolvedValueOnce({
            status: 403,
            statusText: 'Forbidden',
            ok: false,
            clone: () => ({
                json: async () => ({ error: "Invalid API key" })
            })
        });

        const res = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(res.success).toBe(false);
        expect(res.error).toBe("Invalid API key");
    });

    test('fetchWithRetry captures X-Conf-Last-Modified and Last-Modified headers', async () => {
        const client = new APIClient();
        global.fetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            headers: {
                get: (h) => {
                    const lower = h.toLowerCase();
                    if (lower === 'x-conf-last-modified') return 'Sun, 11 Oct 2026 01:20:00 GMT';
                    return null;
                }
            },
            json: async () => ({ success: true })
        });

        const res = await client.fetchWithRetry("/profiles/xyz", {}, 1, 10);
        expect(res.success).toBe(true);
        expect(client.lastModified).toBe('Sun, 11 Oct 2026 01:20:00 GMT');
    });

    describe('mapConcurrent', () => {
        let mapConcurrent;

        beforeEach(async () => {
            const module = await import('../src/apiClient.js');
            mapConcurrent = module.mapConcurrent;
        });

        test('returns empty array when given empty or non-array input', async () => {
            expect(await mapConcurrent([], 4, async () => {})).toEqual([]);
            expect(await mapConcurrent(null, 4, async () => {})).toEqual([]);
        });

        test('preserves result order across items', async () => {
            const items = [10, 20, 30, 40];
            const results = await mapConcurrent(items, 2, async (item) => item * 2);
            expect(results).toEqual([20, 40, 60, 80]);
        });

        test('strictly bounds maximum active concurrency', async () => {
            const items = [1, 2, 3, 4, 5, 6];
            let active = 0;
            let maxActive = 0;

            const results = await mapConcurrent(items, 2, async (item) => {
                active++;
                maxActive = Math.max(maxActive, active);
                await new Promise(r => setTimeout(r, 20));
                active--;
                return item;
            });

            expect(results).toEqual(items);
            expect(maxActive).toBeLessThanOrEqual(2);
        });

        test('captures worker exceptions without failing other tasks', async () => {
            const items = ['ok1', 'fail', 'ok2'];
            const results = await mapConcurrent(items, 2, async (item) => {
                if (item === 'fail') throw new Error("Boom");
                return `processed_${item}`;
            });

            expect(results[0]).toBe('processed_ok1');
            expect(results[1]).toEqual({ error: 'Boom' });
            expect(results[2]).toBe('processed_ok2');
        });
    });
});
