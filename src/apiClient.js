/**
 * APIClient Utility
 * Handles resilient fetching from the NextDNS API, including authentication, retries, and rate limiting.
 * Implements exponential backoff for network errors and server-side rate limits.
 * 
 * @module apiClient
 */
class APIClient {
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
    async getHeaders() {
        let apiKey = "";
        if (this.storage) {
            apiKey = await this.storage.get("apiKey", "");
        }
        return { 
            "Content-Type": "application/json", 
            "X-Api-Key": apiKey 
        };
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
                if (!options.headers) {
                    options.headers = await this.getHeaders();
                }

                const response = await fetch(url, options);

                // If Rate Limited (429) or Server Error (50x), retry
                if (response.status === 429 || response.status >= 500) {
                    if (i === retries - 1) return { success: false, error: `HTTP ${response.status}` };
                    
                    const retryAfter = response.headers.get("Retry-After");
                    const delay = retryAfter ? parseInt(retryAfter) * 1000 : backoffMs * Math.pow(2, i);
                    
                    console.warn(`[APIClient] HTTP ${response.status} on ${endpoint}. Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                return { success: response.ok, response };
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
 * Single instance of the APIClient exported for project-wide use.
 */
export const apiClient = new APIClient();
