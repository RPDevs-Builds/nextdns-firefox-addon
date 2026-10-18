/**
 * DNS Forge - Provider Registry & Implementations
 * Manages provider registration and dispatches unified provider calls.
 * 
 * @module providers/index
 */

import { BaseProvider } from './base.js';
import { apiClient } from '../apiClient.js';
import { storage } from '../storage.js';
import { manageDomain as manageNextdnsDomain } from '../background/api.js';

import {
    fetchAdguardServers,
    fetchAdguardProfileData,
    manageAdguardDomain,
    fetchAdguardLogs,
    clearAdguardLogs
} from './adguard.js';

import {
    fetchControldProfiles,
    fetchControldProfileData,
    manageControldDomain,
    fetchControldLogs,
    clearControldLogs
} from './controld.js';

import {
    fetchPiholeProfiles,
    fetchPiholeProfileData,
    managePiholeDomain,
    fetchPiholeLogs,
    clearPiholeLogs
} from './pihole.js';

export { BaseProvider };
export {
    fetchAdguardServers,
    fetchAdguardProfileData,
    manageAdguardDomain,
    fetchAdguardLogs,
    clearAdguardLogs,
    fetchControldProfiles,
    fetchControldProfileData,
    manageControldDomain,
    fetchControldLogs,
    clearControldLogs,
    fetchPiholeProfiles,
    fetchPiholeProfileData,
    managePiholeDomain,
    fetchPiholeLogs,
    clearPiholeLogs
};

/**
 * NextDNS Provider Implementation
 */
export class NextDnsProvider extends BaseProvider {
    constructor() {
        super('nextdns');
    }

    async fetchProfiles(apiKey) {
        const fetchOptions = { cache: 'no-store' };
        if (apiKey) {
            fetchOptions.headers = {
                "Content-Type": "application/json",
                "X-Api-Key": apiKey.trim()
            };
        }
        const r = await apiClient.fetchWithRetry(`/profiles`, fetchOptions);
        if (!r.success) return { success: false, data: [] };
        const json = await r.response.json();
        const data = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
        return { success: true, data };
    }

    async fetchProfileData(profileId) {
        const [allow, deny] = await Promise.all([
            apiClient.fetchWithRetry(`/profiles/${profileId}/allowlist`),
            apiClient.fetchWithRetry(`/profiles/${profileId}/denylist`)
        ]);
        const aJson = allow.success ? await allow.response.json() : { data: [] };
        const dJson = deny.success ? await deny.response.json() : { data: [] };
        return { 
            success: true, 
            allowlist: (Array.isArray(aJson.data) ? aJson.data : (Array.isArray(aJson) ? aJson : [])).map(d => d.id),
            denylist: (Array.isArray(dJson.data) ? dJson.data : (Array.isArray(dJson) ? dJson : [])).map(d => d.id)
        };
    }

    async manageDomain(profileId, listType, domain, action) {
        return await manageNextdnsDomain(profileId, listType, domain, action);
    }

    async fetchLogs(profileId, options = {}) {
        const rawParam = options?.raw === false ? '' : '?raw=1';
        const apiKey = await storage.get("apiKey", "");
        const r = await apiClient.fetchWithRetry(`/profiles/${profileId}/logs${rawParam}`, { 
            cache: 'no-store', 
            headers: { "Accept": "application/json", "X-Api-Key": apiKey } 
        });
        let data = [];
        if (r.success) {
            const json = await r.response.json();
            data = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
        }
        return { success: true, data };
    }

    async clearLogs(profileId) {
        const r = await apiClient.fetchWithRetry(`/profiles/${profileId}/logs`, { method: 'DELETE' });
        const out = { success: r.success };
        if (r.error) out.error = r.error;
        return out;
    }
}

/**
 * AdGuard DNS Provider Implementation
 */
export class AdguardProvider extends BaseProvider {
    constructor() {
        super('adguard');
    }

    async fetchProfiles(apiKey) {
        return await fetchAdguardServers(apiKey);
    }

    async fetchProfileData(profileId) {
        return await fetchAdguardProfileData(profileId);
    }

    async manageDomain(profileId, listType, domain, action) {
        return await manageAdguardDomain(profileId, listType, domain, action);
    }

    async fetchLogs(profileId) {
        return await fetchAdguardLogs(profileId);
    }

    async clearLogs(profileId) {
        return await clearAdguardLogs(profileId);
    }
}

/**
 * Control D Provider Implementation
 */
export class ControldProvider extends BaseProvider {
    constructor() {
        super('controld');
    }

    async fetchProfiles(apiKey) {
        return await fetchControldProfiles(apiKey);
    }

    async fetchProfileData(profileId) {
        return await fetchControldProfileData(profileId);
    }

    async manageDomain(profileId, listType, domain, action) {
        return await manageControldDomain(profileId, listType, domain, action);
    }

    async fetchLogs(profileId) {
        return await fetchControldLogs(profileId);
    }

    async clearLogs(profileId) {
        return await clearControldLogs(profileId);
    }
}

/**
 * Pi-hole Provider Implementation
 */
export class PiholeProvider extends BaseProvider {
    constructor() {
        super('pihole');
    }

    async fetchProfiles(apiKey) {
        return await fetchPiholeProfiles(apiKey);
    }

    async fetchProfileData(profileId) {
        return await fetchPiholeProfileData(profileId);
    }

    async manageDomain(profileId, listType, domain, action) {
        return await managePiholeDomain(profileId, listType, domain, action);
    }

    async fetchLogs(profileId) {
        return await fetchPiholeLogs(profileId);
    }

    async clearLogs(profileId) {
        return await clearPiholeLogs(profileId);
    }
}

/**
 * Provider Registry for dynamically managing and retrieving DNS providers.
 */
export class ProviderRegistry {
    constructor() {
        this.providers = new Map();
    }

    /**
     * Registers a DNS provider.
     * @param {BaseProvider} provider - The provider instance.
     */
    register(provider) {
        if (!(provider instanceof BaseProvider)) {
            throw new TypeError("Provider must extend BaseProvider.");
        }
        this.providers.set(provider.name, provider);
    }

    /**
     * Retrieves a provider by name, defaulting to 'nextdns'.
     * @param {string} [name='nextdns'] - Provider identifier.
     * @returns {BaseProvider}
     */
    get(name = 'nextdns') {
        return this.providers.get(name) || this.providers.get('nextdns');
    }

    /**
     * Checks if a provider identifier is registered.
     * @param {string} name - Provider identifier.
     * @returns {boolean}
     */
    has(name) {
        return this.providers.has(name);
    }

    /**
     * Lists all registered provider names.
     * @returns {Array<string>}
     */
    list() {
        return Array.from(this.providers.keys());
    }
}

export const providerRegistry = new ProviderRegistry();
providerRegistry.register(new NextDnsProvider());
providerRegistry.register(new AdguardProvider());
providerRegistry.register(new ControldProvider());
providerRegistry.register(new PiholeProvider());
