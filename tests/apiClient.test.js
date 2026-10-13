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

    test('getHeaders injects apiKey from storage if available and sets Accept application/json', async () => {
        const client = new APIClient();
        const headersNoStorage = await client.getHeaders();
        expect(headersNoStorage['Content-Type']).toBe("application/json");
        expect(headersNoStorage['Accept']).toBe("application/json");
        expect(headersNoStorage['X-Api-Key']).toBe("");

        const mockStorage = {
            get: jest.fn().mockResolvedValue("test-secret-key-123")
        };
        client.setStorage(mockStorage);

        const headersWithStorage = await client.getHeaders();
        expect(headersWithStorage['X-Api-Key']).toBe("test-secret-key-123");
        expect(headersWithStorage['Accept']).toBe("application/json");
        expect(mockStorage.get).toHaveBeenCalledWith("apiKey", "");

        // Verify public endpoints never receive X-Api-Key
        const testHeaders = await client.getHeaders("https://test.nextdns.io/");
        expect(testHeaders['X-Api-Key']).toBeUndefined();
        expect(testHeaders['Accept']).toBe("application/json");

        const infoHeaders = await client.getHeaders("https://dns.nextdns.io/info");
        expect(infoHeaders['X-Api-Key']).toBeUndefined();

        const routerHeaders = await client.getHeaders("https://router.nextdns.io");
        expect(routerHeaders['X-Api-Key']).toBeUndefined();
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

    test('getHeaders handles malformed URLs gracefully', async () => {
        const client = new APIClient();
        const headers = await client.getHeaders("::invalid-url::");
        expect(headers['Content-Type']).toBe('application/json');
        expect(headers['Accept']).toBe('application/json');
    });

    test('fetchWithRetry throws when fetch returns null', async () => {
        const client = new APIClient();
        global.fetch.mockResolvedValueOnce(null);

        const res = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(res.success).toBe(false);
        expect(res.error).toBe("No response returned from fetch");
    });

    test('fetchWithRetry extracts errors[0].message on 500 server error exhaust', async () => {
        const client = new APIClient();
        global.fetch.mockResolvedValueOnce({
            status: 500,
            ok: false,
            clone: () => ({
                json: async () => ({ errors: [{ message: "Internal server outage" }] })
            })
        });

        const res = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(res.success).toBe(false);
        expect(res.error).toBe("Internal server outage");
    });

    test('fetchWithRetry extracts error.message object on 429 rate limit exhaust', async () => {
        const client = new APIClient();
        global.fetch.mockResolvedValueOnce({
            status: 429,
            ok: false,
            clone: () => ({
                json: async () => ({ error: { message: "Rate limit exhausted" } })
            })
        });

        const res = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(res.success).toBe(false);
        expect(res.error).toBe("Rate limit exhausted");
    });

    test('fetchWithRetry extracts string error and errData.message on 400', async () => {
        const client = new APIClient();
        global.fetch.mockResolvedValueOnce({
            status: 400,
            ok: false,
            clone: () => ({
                json: async () => ({ errors: ["Direct string failure"] })
            })
        });

        const res1 = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(res1.error).toBe("Direct string failure");

        global.fetch.mockResolvedValueOnce({
            status: 400,
            ok: false,
            clone: () => ({
                json: async () => ({ message: "Direct message field" })
            })
        });

        const res2 = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(res2.error).toBe("Direct message field");

        // Clone error fallback
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => { throw new Error("Broken stream"); }
        });

        const res3 = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(res3.error).toBe("HTTP 400 Bad Request");
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

    test('APIClient - Exhaustive Branch Hardening for 100% Branch Coverage', async () => {
        const client = new APIClient();

        // 1. Line 41 & 63: endpoint starts with http, and Line 62 default parameters
        global.fetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: async () => ({ success: true })
        });
        const defaultParamsRes = await client.fetchWithRetry("/profiles");
        expect(defaultParamsRes.success).toBe(true);

        global.fetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: async () => ({ success: true })
        });
        const httpEndpointRes = await client.fetchWithRetry("https://api.nextdns.io/profiles", undefined, 1, 10);
        expect(httpEndpointRes.success).toBe(true);

        // 2. Line 83-88: 500 error exhausted with clone not function, json not function, errData.error as string, errData.error object without message, and errData empty
        global.fetch.mockResolvedValueOnce({
            status: 500,
            ok: false,
            json: null
        });
        const errNoClone = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errNoClone.error).toBe("HTTP 500");

        // 500 error with json() throwing error (line 89 catch)
        global.fetch.mockResolvedValueOnce({
            status: 500,
            ok: false,
            clone: () => ({ json: async () => { throw new Error("JSON fail"); } })
        });
        const errJsonFail = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errJsonFail.error).toBe("HTTP 500");

        // 500 error with errData.error as string (line 87)
        global.fetch.mockResolvedValueOnce({
            status: 500,
            ok: false,
            clone: () => ({ json: async () => ({ error: "Server string error" }) })
        });
        const errString500 = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errString500.error).toBe("Server string error");

        // 500 error with errData.error as object without message
        global.fetch.mockResolvedValueOnce({
            status: 500,
            ok: false,
            clone: () => ({ json: async () => ({ error: {} }) })
        });
        const errObjNoMsg500 = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errObjNoMsg500.error).toBe("undefined");

        // 500 error with errData having neither errors nor error
        global.fetch.mockResolvedValueOnce({
            status: 500,
            ok: false,
            clone: () => ({ json: async () => ({ otherKey: 123 }) })
        });
        const errNoKeys500 = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errNoKeys500.error).toBe("HTTP 500");

        // 3. Line 93-94: 500/429 retry where headers is null (no .get) and retryAfter is null
        global.fetch
            .mockResolvedValueOnce({
                status: 500,
                ok: false,
                headers: null
            })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ ok: true })
            });
        const retryNoHeaders = await client.fetchWithRetry("/profiles", {}, 2, 5);
        expect(retryNoHeaders.success).toBe(true);

        // 4. Line 102-120: !response.ok branches
        // statusText falsy (line 102)
        global.fetch.mockResolvedValueOnce({
            status: 404,
            statusText: '',
            ok: false,
            clone: null,
            json: null
        });
        const errNoStatusText = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errNoStatusText.error).toBe("HTTP 404");

        // clone not a function on 400
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: null,
            json: async () => ({ error: "Direct json" })
        });
        const errCloneNotFn = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errCloneNotFn.error).toBe("Direct json");

        // json is not a function on 400
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => ({ json: null })
        });
        const errJsonNotFn = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errJsonNotFn.error).toBe("HTTP 400 Bad Request");

        // errData is null/falsy
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => ({ json: async () => null })
        });
        const errDataNull = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errDataNull.error).toBe("HTTP 400 Bad Request");

        // errData.errors is empty array []
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => ({ json: async () => ({ errors: [] }) })
        });
        const errErrorsEmpty = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errErrorsEmpty.error).toBe("HTTP 400 Bad Request");

        // errData.errors[0] is object with detail (no message) (line 111)
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => ({ json: async () => ({ errors: [{ detail: "Detailed field problem" }] }) })
        });
        const errDetailOnly = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errDetailOnly.error).toBe("Detailed field problem");

        // errData.errors[0] is object with neither message nor detail
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => ({ json: async () => ({ errors: [{}] }) })
        });
        const errObjNoDetail = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errObjNoDetail.error).toBe("HTTP 400 Bad Request");

        // errData.errors[0] is null
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => ({ json: async () => ({ errors: [null] }) })
        });
        const errNullFirst = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errNullFirst.error).toBe("HTTP 400 Bad Request");

        // errData.error is object with message (line 114)
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => ({ json: async () => ({ error: { message: "Nested error object" } }) })
        });
        const errObjMsg = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errObjMsg.error).toBe("Nested error object");

        // errData.error is object without message
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => ({ json: async () => ({ error: {} }) })
        });
        const errObjWithoutMsg = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errObjWithoutMsg.error).toBe("HTTP 400 Bad Request");

        // errData has no errors, error, or message
        global.fetch.mockResolvedValueOnce({
            status: 400,
            statusText: 'Bad Request',
            ok: false,
            clone: () => ({ json: async () => ({ statusCode: 400 }) })
        });
        const errOtherFields = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(errOtherFields.error).toBe("HTTP 400 Bad Request");

        // 5. Line 125-128: Last-Modified header fallback (when X-Conf-Last-Modified is null)
        global.fetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            headers: {
                get: (h) => (h.toLowerCase() === 'last-modified' ? 'Mon, 12 Oct 2026 10:00:00 GMT' : null)
            },
            json: async () => ({})
        });
        const resLastMod = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(resLastMod.success).toBe(true);
        expect(client.lastModified).toBe('Mon, 12 Oct 2026 10:00:00 GMT');

        // Headers has .get but neither Last-Modified nor X-Conf-Last-Modified exists
        global.fetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            headers: { get: () => null },
            json: async () => ({})
        });
        const resNoMod = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(resNoMod.success).toBe(true);

        // Headers is undefined/null (line 125 false branch)
        global.fetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            headers: null,
            json: async () => ({})
        });
        const resNullHeaders = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(resNullHeaders.success).toBe(true);

        // 6. Line 133: Network error without message (fallback to "Network Error")
        global.fetch.mockRejectedValueOnce({});
        const netErrNoMsg = await client.fetchWithRetry("/profiles", {}, 1, 10);
        expect(netErrNoMsg.success).toBe(false);
        expect(netErrNoMsg.error).toBe("Network Error");

        // 7. Line 150 & 160: mapConcurrent with default concurrency and error without message
        const { mapConcurrent } = await import('../src/apiClient.js');
        const defaultConcRes = await mapConcurrent([1, 2], undefined, async (x) => x * 10);
        expect(defaultConcRes).toEqual([10, 20]);

        const workerErrNoMsg = await mapConcurrent(['bad'], 2, async () => { throw 'String exception'; });
        expect(workerErrNoMsg[0]).toEqual({ error: 'String exception' });
    });
});
