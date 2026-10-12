/**
 * DNS Forge - LogStreamManager Unit Tests
 */

import { jest } from '@jest/globals';
import { logStreamManager } from '../src/background/logStream.js';
import { storage } from '../src/storage.js';

describe('LogStreamManager', () => {
    beforeEach(async () => {
        logStreamManager.stop();
        fetchMock.resetMocks();
        jest.clearAllMocks();
        await storage.init();
        await storage.set('apiKey', 'test-api-key-12345');
    });

    afterEach(() => {
        logStreamManager.stop();
    });

    test('rejects invalid or missing profile IDs', async () => {
        const resNull = await logStreamManager.start(null);
        expect(resNull.success).toBe(false);
        expect(resNull.error).toBe('Invalid profile ID');

        const resInvalid = await logStreamManager.start('invalid/profile!#');
        expect(resInvalid.success).toBe(false);
        expect(resInvalid.error).toBe('Invalid profile ID');
    });

    test('returns error when API key is missing', async () => {
        await storage.set('apiKey', '');
        const res = await logStreamManager.start('p12345');
        expect(res.success).toBe(false);
        expect(res.error).toBe('API Key required');
    });

    test('parses and broadcasts valid SSE chunk lines', () => {
        const sendSpy = jest.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({});

        const chunk = `data: {"status":"blocked","domain":"malicious.example","category":"malware","name":"malicious.example"}\n\n`;
        logStreamManager.parseSSEChunk(chunk);

        expect(sendSpy).toHaveBeenCalledWith({
            type: 'LIVE_LOG',
            log: expect.objectContaining({
                status: 'blocked',
                domain: 'malicious.example',
                category: 'malware'
            })
        });

        // Verifies high-severity threat notification dispatch
        expect(sendSpy).toHaveBeenCalledWith({
            type: 'PUSH_NOTIFICATION',
            payload: expect.objectContaining({
                type: 'security',
                severity: 'high'
            })
        });

        sendSpy.mockRestore();
    });

    test('gracefully ignores malformed JSON in SSE chunk', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        logStreamManager.parseSSEChunk('data: not-a-json-object\n\n');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    test('starts streaming fetch with X-Api-Key headers', async () => {
        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode('data: {"domain":"test.com","status":"allowed"}\n\n'));
                controller.close();
            }
        });

        fetchMock.mockResponseOnce(() => Promise.resolve({
            ok: true,
            body: stream,
            headers: { 'Content-Type': 'text/event-stream' }
        }));

        const res = await logStreamManager.start('p12345');
        expect(res.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/profiles/p12345/logs/stream?raw=1'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'X-Api-Key': 'test-api-key-12345',
                    'Accept': 'text/event-stream'
                })
            })
        );
    });

    test('stop clears timers, aborts controller, and resets state', () => {
        logStreamManager.reconnectTimeout = setTimeout(() => {}, 10000);
        logStreamManager.currentProfileId = 'p12345';
        logStreamManager.currentApiKey = 'key';

        logStreamManager.stop();

        expect(logStreamManager.isExplicitlyStopped).toBe(true);
        expect(logStreamManager.reconnectTimeout).toBeNull();
        expect(logStreamManager.currentProfileId).toBeNull();
        expect(logStreamManager.currentApiKey).toBeNull();
    });

    test('schedules reconnect with exponential backoff on failure', () => {
        jest.useFakeTimers();
        const startSpy = jest.spyOn(logStreamManager, 'start').mockResolvedValue({ success: true });

        logStreamManager._scheduleReconnect('p12345');
        expect(logStreamManager.reconnectAttempts).toBe(1);
        expect(logStreamManager.reconnectTimeout).not.toBeNull();

        jest.advanceTimersByTime(8000);
        expect(startSpy).toHaveBeenCalledWith('p12345');

        startSpy.mockRestore();
        jest.useRealTimers();
    });

    test('avoids restart if already streaming for identical profile and key', async () => {
        logStreamManager.currentProfileId = 'p12345';
        logStreamManager.currentApiKey = 'test-api-key-12345';
        logStreamManager.abortController = new AbortController();

        const res = await logStreamManager.start('p12345');
        expect(res.success).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('falls back to EventSource if fetch streaming is unsupported or returns not ok', async () => {
        fetchMock.mockResponseOnce(() => Promise.resolve({ ok: false, status: 500 }));

        const originalEventSource = global.EventSource;
        let eventSourceInstance = null;
        global.EventSource = jest.fn().mockImplementation((url) => {
            eventSourceInstance = {
                url,
                close: jest.fn(),
                onmessage: null,
                onerror: null
            };
            return eventSourceInstance;
        });

        const res = await logStreamManager.start('p12345');
        expect(res.success).toBe(true);
        expect(global.EventSource).toHaveBeenCalledWith(
            expect.stringContaining('/profiles/p12345/logs/stream?raw=1&api_key=test-api-key-12345')
        );

        // Test EventSource onmessage handling
        const sendSpy = jest.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({});
        eventSourceInstance.onmessage({
            data: JSON.stringify({ domain: 'event.example.com', status: 'allowed' })
        });
        expect(sendSpy).toHaveBeenCalledWith({
            type: 'LIVE_LOG',
            log: expect.objectContaining({ domain: 'event.example.com' })
        });

        // Test EventSource onerror triggers reconnect
        const reconnectSpy = jest.spyOn(logStreamManager, '_scheduleReconnect').mockImplementation(() => {});
        eventSourceInstance.onerror();
        expect(eventSourceInstance.close).toHaveBeenCalled();
        expect(reconnectSpy).toHaveBeenCalledWith('p12345');

        reconnectSpy.mockRestore();
        sendSpy.mockRestore();
        global.EventSource = originalEventSource;
    });

    test('returns error when streaming is completely unsupported in environment', async () => {
        fetchMock.mockResponseOnce(() => Promise.resolve({ ok: false }));
        const originalEventSource = global.EventSource;
        delete global.EventSource;

        const res = await logStreamManager.start('p12345');
        expect(res.success).toBe(false);
        expect(res.error).toBe('Streaming unsupported in environment');

        global.EventSource = originalEventSource;
    });

    test('handleLogPayload ignores invalid or non-object payloads', () => {
        const sendSpy = jest.spyOn(browser.runtime, 'sendMessage');
        logStreamManager.handleLogPayload(null);
        logStreamManager.handleLogPayload("string");
        logStreamManager.handleLogPayload(123);
        expect(sendSpy).not.toHaveBeenCalled();
    });

    test('parseSSEChunk gracefully handles empty or non-string inputs', () => {
        expect(() => logStreamManager.parseSSEChunk(null)).not.toThrow();
        expect(() => logStreamManager.parseSSEChunk('')).not.toThrow();
        expect(() => logStreamManager.parseSSEChunk(123)).not.toThrow();
    });

    test('stop cancels active reader and eventSource safely', () => {
        const cancelMock = jest.fn();
        const closeMock = jest.fn();
        logStreamManager.currentReader = { cancel: cancelMock };
        logStreamManager.eventSource = { close: closeMock, onmessage: () => {}, onerror: () => {} };

        logStreamManager.stop();
        expect(cancelMock).toHaveBeenCalled();
        expect(closeMock).toHaveBeenCalled();
        expect(logStreamManager.currentReader).toBeNull();
        expect(logStreamManager.eventSource).toBeNull();
    });

    test('_startFetchStream returns false when fetch or AbortController is missing', async () => {
        const origFetch = global.fetch;
        delete global.fetch;
        const res = await logStreamManager._startFetchStream('p12345', 'key');
        expect(res).toBe(false);
        global.fetch = origFetch;
    });

    test('_startFetchStream handles fetch AbortError and generic network errors', async () => {
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        fetchMock.mockRejectOnce(abortErr);
        const resAbort = await logStreamManager._startFetchStream('p12345', 'key');
        expect(resAbort).toBe(false);

        fetchMock.mockRejectOnce(new Error('Network offline'));
        const resNet = await logStreamManager._startFetchStream('p12345', 'key');
        expect(resNet).toBe(false);
    });

    test('_startFetchStream stream reader error schedules reconnect', async () => {
        logStreamManager.isExplicitlyStopped = false;
        const reconnectSpy = jest.spyOn(logStreamManager, '_scheduleReconnect').mockImplementation(() => {});
        const mockReader = {
            read: jest.fn().mockRejectedValue(new Error('Stream interrupted')),
            cancel: jest.fn()
        };
        const origFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            body: { getReader: () => mockReader }
        });

        const started = await logStreamManager._startFetchStream('p12345', 'key');
        expect(started).toBe(true);

        await new Promise(r => setTimeout(r, 50));
        expect(reconnectSpy).toHaveBeenCalledWith('p12345');
        reconnectSpy.mockRestore();
        global.fetch = origFetch;
    });

    test('_startEventSourceStream logs warning on invalid JSON', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const originalEventSource = global.EventSource;
        let eventSourceInstance = null;
        global.EventSource = jest.fn().mockImplementation(() => {
            eventSourceInstance = {
                onmessage: null,
                onerror: null,
                close: jest.fn()
            };
            return eventSourceInstance;
        });

        logStreamManager._startEventSourceStream('p12345', 'key');
        eventSourceInstance.onmessage({ data: 'NOT_VALID_JSON{[' });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[SSE] Failed to parse EventSource event data:'),
            expect.any(Error)
        );

        warnSpy.mockRestore();
        global.EventSource = originalEventSource;
    });

    test('start logs error and returns failure if initialization throws', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const origStartFetch = logStreamManager._startFetchStream;
        logStreamManager._startFetchStream = jest.fn().mockImplementation(() => {
            throw new Error('Fatal stream failure');
        });

        const res = await logStreamManager.start('p12345');
        expect(res.success).toBe(false);
        expect(res.error).toBe('Fatal stream failure');
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[SSE] Failed to initialize log stream:'),
            expect.any(Error)
        );

        logStreamManager._startFetchStream = origStartFetch;
        errorSpy.mockRestore();
    });

    test('handleLogPayload safely swallows rejected sendMessage promises', async () => {
        const sendSpy = jest.spyOn(browser.runtime, 'sendMessage').mockReturnValue(Promise.reject(new Error('Port closed')));
        expect(() => {
            logStreamManager.handleLogPayload({
                status: 'blocked',
                category: 'malware',
                domain: 'bad.example'
            });
        }).not.toThrow();
        await new Promise(r => setTimeout(r, 10));
        sendSpy.mockRestore();
    });
});

