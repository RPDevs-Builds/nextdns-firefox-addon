/**
 * APIClient Utility
 * Handles resilient fetching from the NextDNS API, including authentication, retries, and rate limiting.
 * Implements exponential backoff for network errors and server-side rate limits.
 * 
 * @module apiClient
 */
export class APIClient {
    /**
     * @param {string} [baseURL="https://api.nextdns.io"] - The base URL for the NextDNS API.
     */
    constructor(baseURL = "https://api.nextdns.io") {
        this.baseURL = baseURL;
    }

    /**
     * Injects a StorageManager instance to avoid circular imports.
     * Used for retrieving the API key required for requests.
     * @param {StorageManager} storage - An instance of the StorageManager.
     */
    setStorage(storage) {
        this.storage = storage;
    }

    /**
     * Generates request headers, including the 'X-Api-Key' fetched from storage.
     * @async
     * @returns {Promise<Object>} An object containing the required headers.
     */
    async getHeaders(url = "") {
        let apiKey = "";
        if (this.storage) {
            apiKey = await this.storage.get("apiKey", "");
        }
        const headers = { 
            "Content-Type": "application/json"
        };
        if (!url.includes('test.nextdns.io')) {
            headers["X-Api-Key"] = apiKey || "";
        }
        return headers;
    }

    /**
     * Performs a fetch request with automatic retry logic and exponential backoff.
     * Handles 429 (Rate Limited) and 50x (Server Error) status codes specifically.
     * @async
     * @param {string} endpoint - The API endpoint (relative or absolute) to fetch.
     * @param {Object} [options={}] - Standard fetch options.
     * @param {number} [retries=3] - Maximum number of retry attempts.
     * @param {number} [backoffMs=1000] - Initial delay in milliseconds for backoff.
     * @returns {Promise<Object>} A result object containing success status and optional response or error.
     */
    async fetchWithRetry(endpoint, options = {}, retries = 3, backoffMs = 1000) {
        const url = endpoint.startsWith("http") ? endpoint : `${this.baseURL}${endpoint}`;
        
        for (let i = 0; i < retries; i++) {
            try {
                const defaultHeaders = await this.getHeaders(url);
                const requestOptions = {
                    ...options,
                    headers: { ...defaultHeaders, ...(options.headers || {}) }
                };

                const response = await fetch(url, requestOptions);
                if (!response) {
                    throw new Error("No response returned from fetch");
                }

                // If Rate Limited (429) or Server Error (50x), retry
                if (response.status === 429 || response.status >= 500) {
                    if (i === retries - 1) {
                        let errMsg = `HTTP ${response.status}`;
                        try {
                            const cloned = typeof response.clone === 'function' ? response.clone() : response;
                            if (typeof cloned.json === 'function') {
                                const errData = await cloned.json();
                                if (errData?.errors?.[0]?.message) errMsg = String(errData.errors[0].message);
                                else if (errData?.error) errMsg = String(typeof errData.error === 'object' ? errData.error.message : errData.error);
                            }
                        } catch (_) {}
                        return { success: false, response, error: errMsg };
                    }
                    
                    const retryAfter = response.headers?.get ? response.headers.get("Retry-After") : null;
                    const delay = retryAfter ? parseInt(retryAfter) * 1000 : backoffMs * Math.pow(2, i);
                    
                    console.warn(`[APIClient] HTTP ${response.status} on ${endpoint}. Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                if (!response.ok) {
                    const statusText = response.statusText ? ` ${response.statusText}` : '';
                    let errMsg = `HTTP ${response.status}${statusText}`;
                    try {
                        const cloned = typeof response.clone === 'function' ? response.clone() : response;
                        if (typeof cloned.json === 'function') {
                            const errData = await cloned.json();
                            if (errData) {
                                if (Array.isArray(errData.errors) && errData.errors.length > 0) {
                                    const first = errData.errors[0];
                                    const detail = typeof first === 'object' && first ? (first.message || first.detail) : first;
                                    if (detail) errMsg = String(detail);
                                } else if (errData.error) {
                                    const detail = typeof errData.error === 'object' && errData.error ? errData.error.message : errData.error;
                                    if (detail) errMsg = String(detail);
                                } else if (errData.message) {
                                    errMsg = String(errData.message);
                                }
                            }
                        }
                    } catch (_) {}
                    return { success: false, response, error: errMsg };
                }

                if (response.headers?.get) {
                    const mod = response.headers.get("X-Conf-Last-Modified") || response.headers.get("Last-Modified");
                    if (mod) this.lastModified = mod;
                }

                return { success: true, response };
            } catch (error) {
                // Network error (e.g. offline)
                if (i === retries - 1) return { success: false, error: error.message || "Network Error" };
                const delay = backoffMs * Math.pow(2, i);
                console.warn(`[APIClient] Network error on ${endpoint}. Retrying in ${delay}ms...`, error);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
}

/**
 * Executes an async task across an array of items with bounded concurrency.
 * Inspired by NextDNS CLI's max-inflight-upstream-requests semaphore.
 * @param {Array} items - Items to process.
 * @param {number} [concurrency=4] - Max concurrent promises.
 * @param {Function} fn - Async worker function (item, index).
 * @returns {Promise<Array>} Results corresponding to each item.
 */
export async function mapConcurrent(items, concurrency = 4, fn) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const limit = Math.max(1, Math.min(16, concurrency));
    const results = new Array(items.length);
    const executing = new Set();

    for (let i = 0; i < items.length; i++) {
        const p = Promise.resolve()
            .then(() => fn(items[i], i))
            .then(res => { results[i] = res; })
            .catch(err => { results[i] = { error: err?.message || String(err) }; });

        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);

        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }
    await Promise.all(executing);
    return results;
}

/**
 * Single instance of the APIClient exported for project-wide use.
 */
export const apiClient = new APIClient();
