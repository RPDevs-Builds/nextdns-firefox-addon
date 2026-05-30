/**
 * APIClient Utility
 * Handles resilient fetching from the NextDNS API, including authentication, retries, and rate limiting.
 */
class APIClient {
    constructor(baseURL = "https://api.nextdns.io") {
        this.baseURL = baseURL;
    }

    // Dependency injection to avoid circular imports. Will be set to the StorageManager instance.
    setStorage(storage) {
        this.storage = storage;
    }

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

export const apiClient = new APIClient();
