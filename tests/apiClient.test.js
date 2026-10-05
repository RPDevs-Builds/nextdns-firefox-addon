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
});
