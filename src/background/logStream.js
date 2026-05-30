/**
 * DNS Forge - SSE Log Streaming Manager
 */

import { storage } from '../storage.js';
import { API_BASE } from './state.js';

class LogStreamManager {
    constructor() {
        this.eventSource = null;
        this.currentProfileId = null;
        this.reconnectTimeout = null;
        this.isExplicitlyStopped = false;
    }

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

    stop() {
        this.isExplicitlyStopped = true;
        clearTimeout(this.reconnectTimeout);
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }
}

export const logStreamManager = new LogStreamManager();
