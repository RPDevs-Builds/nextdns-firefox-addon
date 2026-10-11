/**
 * DNS Forge - SSE Log Streaming Manager
 * @module background/logStream
 */

import { storage } from '../storage.js';
import { API_BASE } from './state.js';

/**
 * Manages Server-Sent Events (SSE) connections for live log streaming from the NextDNS API.
 * Uses authenticated fetch with ReadableStream when available to pass credentials via headers,
 * falling back to EventSource if streaming fetch is unsupported.
 * Implements automatic reconnection logic with exponential backoff.
 */
class LogStreamManager {
    constructor() {
        this.eventSource = null;
        this.abortController = null;
        this.currentReader = null;
        this.currentProfileId = null;
        this.currentApiKey = null;
        this.reconnectTimeout = null;
        this.isExplicitlyStopped = false;
        this.reconnectAttempts = 0;
    }

    /**
     * Broadcasts a parsed log message to extension views and triggers security notifications if needed.
     * @param {Object} log - The log payload.
     */
    handleLogPayload(log) {
        if (!log || typeof log !== 'object') return;
        if (typeof browser !== 'undefined' && typeof browser.runtime?.sendMessage === 'function') {
            try {
                const p1 = browser.runtime.sendMessage({ type: "LIVE_LOG", log });
                if (p1 && typeof p1.catch === 'function') p1.catch(() => {});
            } catch (_) {}
            
            if (log.status === 'blocked' && ['malware', 'cryptojacking', 'c2'].includes(log.category)) {
                try {
                    const p2 = browser.runtime.sendMessage({
                        type: "PUSH_NOTIFICATION",
                        payload: {
                            type: "security",
                            severity: "high",
                            message: `Blocked ${log.category} request: ${log.name || log.domain}`
                        }
                    });
                    if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
                } catch (_) {}
            }
        }
    }

    /**
     * Parses chunks of Server-Sent Events data and processes valid payloads.
     * @param {string} rawChunk - Text chunk containing SSE data.
     */
    parseSSEChunk(rawChunk) {
        if (!rawChunk || typeof rawChunk !== 'string') return;
        const lines = rawChunk.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
                const jsonStr = trimmed.slice(5).trim();
                if (jsonStr) {
                    try {
                        const log = JSON.parse(jsonStr);
                        this.handleLogPayload(log);
                    } catch (err) {
                        console.warn("[SSE] Failed to parse stream event data:", err);
                    }
                }
            }
        }
    }

    /**
     * Initiates a streaming connection using fetch with ReadableStream (header-based auth).
     * @private
     * @param {string} profileId - The profile ID.
     * @param {string} apiKey - The NextDNS API key.
     * @returns {Promise<boolean>} True if stream successfully started.
     */
    async _startFetchStream(profileId, apiKey) {
        if (typeof fetch === 'undefined' || typeof AbortController === 'undefined') {
            return false;
        }

        this.abortController = new AbortController();
        const url = `${API_BASE}/profiles/${encodeURIComponent(profileId)}/logs/stream?raw=1`;

        try {
            console.log(`[SSE] Connecting via secure streaming fetch for profile: ${profileId}`);
            const res = await fetch(url, {
                headers: {
                    "Accept": "text/event-stream",
                    "X-Api-Key": apiKey
                },
                signal: this.abortController.signal
            });

            if (!res.ok || !res.body || typeof res.body.getReader !== 'function') {
                return false;
            }

            const reader = res.body.getReader();
            this.currentReader = reader;
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            (async () => {
                while (!this.isExplicitlyStopped) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    this.reconnectAttempts = 0;
                    buffer += decoder.decode(value, { stream: true });
                    const events = buffer.split("\n\n");
                    buffer = events.pop() || "";
                    for (const event of events) {
                        this.parseSSEChunk(event);
                    }
                }
            })().catch(err => {
                if (!this.isExplicitlyStopped && err.name !== 'AbortError') {
                    console.warn(`[SSE] Fetch stream interrupted:`, err);
                    this._scheduleReconnect(profileId);
                }
            });

            return true;
        } catch (e) {
            if (e.name === 'AbortError') return false;
            console.warn("[SSE] Streaming fetch failed or unsupported, evaluating fallback:", e.message);
            return false;
        }
    }

    /**
     * Starts the log stream using EventSource fallback.
     * @private
     * @param {string} profileId - Profile ID.
     * @param {string} apiKey - API Key.
     */
    _startEventSourceStream(profileId, apiKey) {
        const url = `${API_BASE}/profiles/${encodeURIComponent(profileId)}/logs/stream?raw=1&api_key=${encodeURIComponent(apiKey)}`;
        console.log(`[SSE] Connecting via EventSource fallback for profile: ${profileId}`);
        this.eventSource = new EventSource(url);

        this.eventSource.onmessage = (e) => {
            this.reconnectAttempts = 0;
            try {
                const log = JSON.parse(e.data);
                this.handleLogPayload(log);
            } catch (err) {
                console.warn("[SSE] Failed to parse EventSource event data:", err);
            }
        };

        this.eventSource.onerror = () => {
            if (this.eventSource) {
                this.eventSource.onmessage = null;
                this.eventSource.onerror = null;
                this.eventSource.close();
                this.eventSource = null;
            }
            if (!this.isExplicitlyStopped) {
                this._scheduleReconnect(profileId);
            }
        };
    }

    /**
     * Schedules exponential backoff reconnection.
     * @private
     * @param {string} profileId - Target profile ID.
     */
    _scheduleReconnect(profileId) {
        const backoffDelay = Math.min(30000, Math.round(5000 * Math.pow(1.5, this.reconnectAttempts)));
        this.reconnectAttempts++;
        console.warn(`[SSE] Reconnecting in ${backoffDelay}ms... (attempt ${this.reconnectAttempts})`);
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.start(profileId), backoffDelay);
    }

    /**
     * Starts the log stream for a specific profile.
     * Closes any existing connection before starting a new one.
     * @async
     * @param {string} profileId - The NextDNS profile ID to stream logs for.
     * @returns {Promise<{success: boolean, error: string}>} Success status or error message.
     */
    async start(profileId) {
        if (!profileId || typeof profileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(profileId)) {
            return { success: false, error: "Invalid profile ID" };
        }

        const apiKey = await storage.get("apiKey");
        if (!apiKey) return { success: false, error: "API Key required" };

        if ((this.abortController || this.eventSource) && this.currentProfileId === profileId && this.currentApiKey === apiKey) {
            return { success: true };
        }
        this.stop();
        this.isExplicitlyStopped = false;

        this.currentProfileId = profileId;
        this.currentApiKey = apiKey;

        try {
            // 1. Try secure fetch with X-Api-Key header (avoids API key in URL query parameter)
            const fetchSuccess = await this._startFetchStream(profileId, apiKey);
            if (fetchSuccess) return { success: true };

            // 2. Fall back to EventSource if supported
            if (typeof EventSource !== 'undefined') {
                this._startEventSourceStream(profileId, apiKey);
                return { success: true };
            }

            return { success: false, error: "Streaming unsupported in environment" };
        } catch (e) {
            console.error("[SSE] Failed to initialize log stream:", e);
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

        if (this.abortController) {
            try { this.abortController.abort(); } catch (_) {}
            this.abortController = null;
        }

        if (this.currentReader) {
            try { this.currentReader.cancel(); } catch (_) {}
            this.currentReader = null;
        }

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
