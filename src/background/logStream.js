/**
 * DNS Forge - SSE Log Streaming Manager
 * @module background/logStream
 */

import { storage } from '../storage.js';
import { API_BASE } from './state.js';

/**
 * Manages Server-Sent Events (SSE) connections for live log streaming from the NextDNS API.
 * Implements automatic reconnection logic and profile-switching awareness.
 */
class LogStreamManager {
    constructor() {
        this.eventSource = null;
        this.currentProfileId = null;
        this.currentApiKey = null;
        this.reconnectTimeout = null;
        this.isExplicitlyStopped = false;
        this.reconnectAttempts = 0;
    }

    /**
     * Starts the log stream for a specific profile.
     * Closes any existing connection before starting a new one.
     * @async
     * @param {string} profileId - The NextDNS profile ID to stream logs for.
     * @returns {Promise<{success: boolean, error: string}>} Success status or error message (error only present on failure).
     */
    async start(profileId) {
        if (!profileId || typeof profileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(profileId)) {
            return { success: false, error: "Invalid profile ID" };
        }

        const apiKey = await storage.get("apiKey");
        if (!apiKey) return { success: false, error: "API Key required" };

        if (this.eventSource && this.currentProfileId === profileId && this.currentApiKey === apiKey) {
            return { success: true };
        }
        this.stop();
        this.isExplicitlyStopped = false;

        this.currentProfileId = profileId;
        this.currentApiKey = apiKey;
        const url = `${API_BASE}/profiles/${profileId}/logs/stream?raw=1&api_key=${encodeURIComponent(apiKey)}`;

        try {
            console.log(`[SSE] Connecting to live log stream for profile: ${profileId}`);
            this.eventSource = new EventSource(url);
            
            this.eventSource.onmessage = (e) => {
                this.reconnectAttempts = 0;
                try {
                    const log = JSON.parse(e.data);
                    browser.runtime.sendMessage({ type: "LIVE_LOG", log }).catch(() => {});
                    
                    if (log.status === 'blocked' && ['malware', 'cryptojacking', 'c2'].includes(log.category)) {
                        browser.runtime.sendMessage({
                            type: "PUSH_NOTIFICATION",
                            payload: {
                                type: "security",
                                severity: "high",
                                message: `Blocked ${log.category} request: ${log.name || log.domain}`
                            }
                        }).catch(() => {});
                    }
                } catch (err) {
                    console.warn("[SSE] Failed to parse stream event data:", err);
                }
            };

            this.eventSource.onerror = (e) => {
                const backoffDelay = Math.min(30000, Math.round(5000 * Math.pow(1.5, this.reconnectAttempts)));
                this.reconnectAttempts++;
                console.warn(`[SSE] Stream disconnected for profile ${profileId}, attempting reconnect in ${backoffDelay}ms... (attempt ${this.reconnectAttempts})`);
                if (this.eventSource) {
                    this.eventSource.onmessage = null;
                    this.eventSource.onerror = null;
                    this.eventSource.close();
                    this.eventSource = null;
                }
                
                if (!this.isExplicitlyStopped) {
                    clearTimeout(this.reconnectTimeout);
                    this.reconnectTimeout = setTimeout(() => this.start(profileId), backoffDelay);
                }
            };

            return { success: true };
        } catch (e) {
            console.error("[SSE] Failed to initialize EventSource:", e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Stops the current log stream and cancels any pending reconnection attempts.
     */
    stop() {
        this.isExplicitlyStopped = true;
        this.reconnectAttempts = 0;
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
        if (this.eventSource) {
            this.eventSource.onmessage = null;
            this.eventSource.onerror = null;
            this.eventSource.close();
            this.eventSource = null;
        }
        this.currentProfileId = null;
        this.currentApiKey = null;
    }
}

/**
 * Singleton instance of LogStreamManager.
 * @type {LogStreamManager}
 */
export const logStreamManager = new LogStreamManager();
