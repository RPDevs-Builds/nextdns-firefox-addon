/**
 * DNS Forge - Base DNS Provider Interface
 * Abstract class defining the required contract for all DNS providers
 * (NextDNS, AdGuard DNS, Control D, Pi-hole, and future providers).
 * 
 * @module providers/base
 */

export class BaseProvider {
    /**
     * @param {string} name - Internal identifier of the provider.
     */
    constructor(name) {
        if (new.target === BaseProvider) {
            throw new TypeError("Cannot instantiate BaseProvider directly.");
        }
        if (!name || typeof name !== 'string') {
            throw new TypeError("Provider name must be a non-empty string.");
        }
        this.name = name;
    }

    /**
     * Fetches list of profiles/servers available to the account.
     * @param {string} [_apiKey] - Optional API key override.
     * @returns {Promise<{ success: boolean, data: Array<Object> }>}
     */
    async fetchProfiles(_apiKey) {
        throw new Error(`fetchProfiles not implemented in ${this.name}`);
    }

    /**
     * Fetches allowlist and denylist domains for a given profile/server.
     * @param {string} _profileId - Profile or server ID.
     * @returns {Promise<{ success: boolean, allowlist: Array<string>, denylist: Array<string> }>}
     */
    async fetchProfileData(_profileId) {
        throw new Error(`fetchProfileData not implemented in ${this.name}`);
    }

    /**
     * Adds or removes a domain in the provider's allowlist or denylist.
     * @param {string} _profileId - Profile or server ID.
     * @param {'allowlist'|'denylist'} _listType - List category.
     * @param {string} _domain - Domain name.
     * @param {'add'|'delete'} _action - Action to perform.
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async manageDomain(_profileId, _listType, _domain, _action) {
        throw new Error(`manageDomain not implemented in ${this.name}`);
    }

    /**
     * Fetches query logs for a profile.
     * @param {string} _profileId - Profile or server ID.
     * @param {Object} [_options] - Additional options (e.g. raw, limit).
     * @returns {Promise<{ success: boolean, data: Array<Object> }>}
     */
    async fetchLogs(_profileId, _options) {
        throw new Error(`fetchLogs not implemented in ${this.name}`);
    }

    /**
     * Clears query logs for a profile.
     * @param {string} _profileId - Profile or server ID.
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async clearLogs(_profileId) {
        throw new Error(`clearLogs not implemented in ${this.name}`);
    }
}
