/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('Intelligent Debugger (Phase 4.1)', () => {
    let bg;
    let mockStorage = {};

    beforeEach(async () => {
        jest.resetModules();
        mockStorage = {};
        
        global.fetch = jest.fn();

        global.browser = {
            storage: {
                local: {
                    get: jest.fn(keys => Promise.resolve(mockStorage)),
                    set: jest.fn(obj => { Object.assign(mockStorage, obj); return Promise.resolve(); })
                },
                sync: {
                    get: jest.fn(keys => Promise.resolve(mockStorage)),
                    set: jest.fn(obj => { Object.assign(mockStorage, obj); return Promise.resolve(); })
                },
                onChanged: { addListener: jest.fn() }
            },
            runtime: { onMessage: { addListener: jest.fn() } },
            alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
            webRequest: { onBeforeRequest: { addListener: jest.fn(), hasListener: jest.fn(() => false) } },
            tabs: { onRemoved: { addListener: jest.fn() } },
            action: { setPopup: jest.fn().mockResolvedValue(), onClicked: { addListener: jest.fn() } },
            menus: { create: jest.fn(), removeAll: jest.fn().mockResolvedValue(), onClicked: { addListener: jest.fn() } }
        };

        global.storage = {
            init: jest.fn().mockResolvedValue(),
            get: jest.fn(key => Promise.resolve(mockStorage[key])),
            set: jest.fn((key, val) => { mockStorage[key] = val; return Promise.resolve(); })
        };

        const { messageHandlers } = await import('../src/background/handlers.js');
        const { requestListener } = await import('../src/background/requestListener.js');
        bg = { messageHandlers, requestListener };
    });

    test('DEBUG_TAB: Successfully correlates blocked domains from API logs', async () => {
        const tabId = 123;
        const profileId = 'p123';
        
        const { state } = await import('../src/background/state.js');
        state.currentProfileData.denylist = new Set(['example.com']);

        bg.requestListener({ url: 'https://example.com/home', tabId, type: 'main_frame' });

        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [
                    { domain: 'example.com', status: 'blocked', reasons: [{ name: 'OISD' }], timestamp: Date.now() }
                ]
            })
        });

        const result = await bg.messageHandlers.DEBUG_TAB({ tabId, profileId });

        expect(result.success).toBe(true);
        expect(result.correlations.length).toBe(1);
        expect(result.correlations[0].domain).toBe('example.com');
    });

    test('DEBUG_TAB: Returns empty if no requests in tab', async () => {
        const result = await bg.messageHandlers.DEBUG_TAB({ tabId: 999, profileId: 'p1' });
        expect(result.success).toBe(true);
        expect(result.correlations.length).toBe(0);
    });

    test('DEBUG_TAB: Correlates cloud blocklist blocks even if domain was default client-side', async () => {
        const tabId = 456;
        const profileId = 'p456';

        // Request without local manual denylist (status defaults to 'default')
        bg.requestListener({ url: 'https://ad-tracker.net/pixel.gif', tabId, type: 'xmlhttprequest' });

        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [
                    { domain: 'ad-tracker.net', status: 'blocked', reasons: [{ name: 'AdGuard Tracking Protection' }], timestamp: Date.now(), device: { name: 'Work Mac' } }
                ]
            })
        });

        const result = await bg.messageHandlers.DEBUG_TAB({ tabId, profileId });

        expect(result.success).toBe(true);
        expect(result.correlations.length).toBe(1);
        expect(result.correlations[0].domain).toBe('ad-tracker.net');
        expect(result.correlations[0].reasons[0].name).toBe('AdGuard Tracking Protection');
        expect(result.correlations[0].device).toBe('Work Mac');
    });

    test('requestListener: Gracefully ignores URLs without hostnames', () => {
        const tabId = 789;
        const res1 = bg.requestListener({ url: 'data:text/plain;base64,SGVsbG8=', tabId, type: 'xmlhttprequest' });
        expect(res1).toEqual({ cancel: false });

        const res2 = bg.requestListener({ url: 'about:blank', tabId, type: 'sub_frame' });
        expect(res2).toEqual({ cancel: false });
    });

    test('GET_NETWORK_STATUS: Returns current networkStatus from background state', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: () => Promise.resolve({
                status: 'ok',
                protocol: 'DOH',
                client: '1.2.3.4',
                server: 'anycast.ams',
                destIP: '45.90.28.0',
                profile: 'p123'
            })
        });

        const { state } = await import('../src/background/state.js');
        state.networkStatus = {
            isConnected: true,
            status: 'ok',
            protocol: 'DOH',
            popServer: 'anycast.ams',
            clientIp: '1.2.3.4',
            destIp: '45.90.28.0',
            profileId: 'p123',
            rttMs: 24,
            lastChecked: 1760000000000
        };

        const res = await bg.messageHandlers.GET_NETWORK_STATUS({});
        expect(res.success).toBe(true);
        expect(res.networkStatus.isConnected).toBe(true);
        expect(res.networkStatus.popServer).toBe('anycast.ams');
        expect(res.networkStatus.protocol).toBe('DOH');
    });

    test('RUN_DIAGNOSTICS: Executes live probe and returns diagnostic report', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => null },
                json: () => Promise.resolve({
                    status: 'ok',
                    protocol: 'DOH',
                    client: '198.51.100.1',
                    server: 'vultr-ewr-1',
                    destIP: '45.90.28.0',
                    profile: 'testprof'
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => null },
                json: () => Promise.resolve({
                    pop: 'ewr',
                    server: 'vultr-ewr-1',
                    ip: '198.51.100.1'
                })
            });

        const res = await bg.messageHandlers.RUN_DIAGNOSTICS({});
        expect(res.success).toBe(true);
        expect(res.diagnostics.isConnected).toBe(true);
        expect(res.diagnostics.popServer).toBe('vultr-ewr-1');
        expect(res.diagnostics.protocol).toBe('DOH');
        expect(typeof res.diagnostics.rttMs).toBe('number');
    });
});
