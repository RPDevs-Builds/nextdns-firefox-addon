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
        this.reconnectTimeout = null;
        this.isExplicitlyStopped = false;
    }

    /**
     * Starts the log stream for a specific profile.
     * Closes any existing connection before starting a new one.
     * @async
     * @param {string} profileId - The NextDNS profile ID to stream logs for.
     * @returns {Promise<{success: boolean, error: string}>} Success status or error message (error only present on failure).
     */
    async start(profileId) {
        if (this.eventSource && this.currentProfileId === profileId) return { success: true };
        this.stop();
        this.isExplicitlyStopped = false;

        const apiKey = await storage.get("apiKey");
        if (!apiKey) return { success: false, error: "API Key required" };

        this.currentProfileId = profileId;
        const url = `${API_BASE}/profiles/${profileId}/logs/stream?api_key=${apiKey}`;

        try {
            this.eventSource = new EventSource(url);
            
            this.eventSource.onmessage = (e) => {
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
                } catch (err) {}
            };

            this.eventSource.onerror = (e) => {
                console.warn("[SSE] Stream error, attempting reconnect in 5s...", e);
                this.eventSource.close();
                this.eventSource = null;
                
                if (!this.isExplicitlyStopped) {
                    clearTimeout(this.reconnectTimeout);
                    this.reconnectTimeout = setTimeout(() => this.start(profileId), 5000);
                }
            };

            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Stops the current log stream and cancels any pending reconnection attempts.
     */
    stop() {
        this.isExplicitlyStopped = true;
        clearTimeout(this.reconnectTimeout);
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }
}

/**
 * Singleton instance of LogStreamManager.
 * @type {LogStreamManager}
 */
export const logStreamManager = new LogStreamManager();
