/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import { BaseProvider } from '../src/providers/base.js';
import {
    NextDnsProvider,
    AdguardProvider,
    ControldProvider,
    PiholeProvider,
    ProviderRegistry,
    providerRegistry
} from '../src/providers/index.js';
import { apiClient } from '../src/apiClient.js';
import { storage } from '../src/storage.js';

describe('Providers Architecture & Registry (src/providers)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('BaseProvider Abstract Class', () => {
        class MockSubProvider extends BaseProvider {
            constructor() {
                super('mock');
            }
        }

        test('throws when instantiating BaseProvider directly', () => {
            expect(() => new BaseProvider('test')).toThrow('Cannot instantiate BaseProvider directly.');
        });

        test('throws when name is invalid', () => {
            class InvalidNameProvider extends BaseProvider {
                constructor() {
                    super('');
                }
            }
            expect(() => new InvalidNameProvider()).toThrow('Provider name must be a non-empty string.');
        });

        test('base methods throw not implemented error', async () => {
            const p = new MockSubProvider();
            await expect(p.fetchProfiles()).rejects.toThrow('fetchProfiles not implemented in mock');
            await expect(p.fetchProfileData('p1')).rejects.toThrow('fetchProfileData not implemented in mock');
            await expect(p.manageDomain('p1', 'allowlist', 'ex.com', 'add')).rejects.toThrow('manageDomain not implemented in mock');
            await expect(p.fetchLogs('p1')).rejects.toThrow('fetchLogs not implemented in mock');
            await expect(p.clearLogs('p1')).rejects.toThrow('clearLogs not implemented in mock');
        });
    });

    describe('ProviderRegistry', () => {
        test('registers providers and enforces BaseProvider subclassing', () => {
            const registry = new ProviderRegistry();
            expect(() => registry.register({})).toThrow('Provider must extend BaseProvider.');
            
            const nextdns = new NextDnsProvider();
            registry.register(nextdns);
            expect(registry.has('nextdns')).toBe(true);
            expect(registry.has('unknown')).toBe(false);
            expect(registry.get('nextdns')).toBe(nextdns);
            expect(registry.get('unknown')).toBe(nextdns); // Fallbacks to nextdns
            expect(registry.get()).toBe(nextdns); // Default argument
            expect(registry.list()).toEqual(['nextdns']);
        });

        test('default providerRegistry singleton is initialized with all 4 providers', () => {
            expect(providerRegistry.list()).toEqual(['nextdns', 'adguard', 'controld', 'pihole']);
            expect(providerRegistry.get('nextdns')).toBeInstanceOf(NextDnsProvider);
            expect(providerRegistry.get()).toBeInstanceOf(NextDnsProvider);
            expect(providerRegistry.get('adguard')).toBeInstanceOf(AdguardProvider);
            expect(providerRegistry.get('controld')).toBeInstanceOf(ControldProvider);
            expect(providerRegistry.get('pihole')).toBeInstanceOf(PiholeProvider);
        });
    });

    describe('NextDnsProvider', () => {
        let provider;
        beforeEach(() => {
            provider = new NextDnsProvider();
        });

        test('fetchProfiles with and without apiKey override, handling success and failure', async () => {
            const spy = jest.spyOn(apiClient, 'fetchWithRetry').mockResolvedValueOnce({
                success: true,
                response: { json: async () => ({ data: [{ id: 'p1', name: 'Profile 1' }] }) }
            });

            const res = await provider.fetchProfiles('custom-key');
            expect(res.success).toBe(true);
            expect(res.data).toEqual([{ id: 'p1', name: 'Profile 1' }]);
            expect(spy).toHaveBeenCalledWith('/profiles', expect.objectContaining({
                headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'custom-key' }
            }));

            // Array payload without .data wrapper
            spy.mockResolvedValueOnce({
                success: true,
                response: { json: async () => [{ id: 'p2' }] }
            });
            const res2 = await provider.fetchProfiles();
            expect(res2.success).toBe(true);
            expect(res2.data).toEqual([{ id: 'p2' }]);

            // Failure branch
            spy.mockResolvedValueOnce({ success: false });
            const res3 = await provider.fetchProfiles();
            expect(res3.success).toBe(false);
            expect(res3.data).toEqual([]);
        });

        test('fetchProfileData handles allowlist and denylist mapping', async () => {
            jest.spyOn(apiClient, 'fetchWithRetry')
                .mockResolvedValueOnce({
                    success: true,
                    response: { json: async () => ({ data: [{ id: 'allow.com' }] }) }
                })
                .mockResolvedValueOnce({
                    success: true,
                    response: { json: async () => [{ id: 'deny.com' }] }
                });

            const res = await provider.fetchProfileData('p1');
            expect(res.success).toBe(true);
            expect(res.allowlist).toEqual(['allow.com']);
            expect(res.denylist).toEqual(['deny.com']);

            // Both fail
            jest.spyOn(apiClient, 'fetchWithRetry')
                .mockResolvedValueOnce({ success: false })
                .mockResolvedValueOnce({ success: false });
            const res2 = await provider.fetchProfileData('p1');
            expect(res2.success).toBe(true);
            expect(res2.allowlist).toEqual([]);
            expect(res2.denylist).toEqual([]);
        });

        test('manageDomain delegates to manageDomain helper', async () => {
            jest.spyOn(apiClient, 'fetchWithRetry').mockResolvedValueOnce({ success: true });
            const res = await provider.manageDomain('p1', 'allowlist', 'ex.com', 'add');
            expect(res.success).toBe(true);
        });

        test('fetchLogs handles raw parameter options and success/failure parsing', async () => {
            const spy = jest.spyOn(apiClient, 'fetchWithRetry').mockResolvedValueOnce({
                success: true,
                response: { json: async () => ({ data: [{ domain: 'ex.com' }] }) }
            });
            jest.spyOn(storage, 'get').mockResolvedValueOnce('api-key-123');

            const res = await provider.fetchLogs('p1', { raw: true });
            expect(res.success).toBe(true);
            expect(res.data).toEqual([{ domain: 'ex.com' }]);
            expect(spy).toHaveBeenCalledWith('/profiles/p1/logs?raw=1', expect.anything());

            // raw === false
            spy.mockResolvedValueOnce({
                success: true,
                response: { json: async () => [{ domain: 'array.com' }] }
            });
            const res2 = await provider.fetchLogs('p1', { raw: false });
            expect(res2.success).toBe(true);
            expect(res2.data).toEqual([{ domain: 'array.com' }]);
            expect(spy).toHaveBeenCalledWith('/profiles/p1/logs', expect.anything());

            // Failure branch
            spy.mockResolvedValueOnce({ success: false });
            const res3 = await provider.fetchLogs('p1');
            expect(res3.success).toBe(true);
            expect(res3.data).toEqual([]);
        });

        test('clearLogs deletes logs endpoint', async () => {
            const spy = jest.spyOn(apiClient, 'fetchWithRetry').mockResolvedValueOnce({ success: true });
            const res = await provider.clearLogs('p1');
            expect(res.success).toBe(true);
            expect(spy).toHaveBeenCalledWith('/profiles/p1/logs', { method: 'DELETE' });

            spy.mockResolvedValueOnce({ success: false, error: 'Network error' });
            const res2 = await provider.clearLogs('p1');
            expect(res2.success).toBe(false);
            expect(res2.error).toBe('Network error');
        });
    });

    describe('AdguardProvider', () => {
        let provider;
        beforeEach(() => {
            provider = new AdguardProvider();
        });

        test('delegates all methods to adguard module', async () => {
            const spy = jest.spyOn(apiClient, 'fetchWithRetry').mockResolvedValue({
                success: true,
                response: { json: async () => ({}) }
            });

            expect(provider.name).toBe('adguard');
            const pRes = await provider.fetchProfiles();
            expect(pRes.success).toBe(true);

            const dRes = await provider.fetchProfileData('srv-1');
            expect(dRes.success).toBe(true);

            const mRes = await provider.manageDomain('srv-1', 'allowlist', 'test.com', 'add');
            expect(mRes.success).toBe(true);

            const lRes = await provider.fetchLogs('srv-1');
            expect(lRes.success).toBe(true);

            const cRes = await provider.clearLogs('srv-1');
            expect(cRes.success).toBe(true);
            expect(spy).toHaveBeenCalled();
        });
    });

    describe('ControldProvider', () => {
        let provider;
        beforeEach(() => {
            provider = new ControldProvider();
        });

        test('delegates all methods to controld module', async () => {
            const spy = jest.spyOn(apiClient, 'fetchWithRetry').mockResolvedValue({
                success: true,
                response: { json: async () => ({}) }
            });

            expect(provider.name).toBe('controld');
            const pRes = await provider.fetchProfiles();
            expect(pRes.success).toBe(true);

            const dRes = await provider.fetchProfileData('cd-1');
            expect(dRes.success).toBe(true);

            const mRes = await provider.manageDomain('cd-1', 'allowlist', 'test.com', 'add');
            expect(mRes.success).toBe(true);

            const lRes = await provider.fetchLogs('cd-1');
            expect(lRes.success).toBe(true);

            const cRes = await provider.clearLogs('cd-1');
            expect(cRes.success).toBe(true);
            expect(spy).toHaveBeenCalled();
        });
    });

    describe('PiholeProvider', () => {
        let provider;
        beforeEach(() => {
            provider = new PiholeProvider();
        });

        test('delegates all methods to pihole module', async () => {
            const spy = jest.spyOn(apiClient, 'fetchWithRetry').mockResolvedValue({
                success: true,
                response: { json: async () => ({}) }
            });

            expect(provider.name).toBe('pihole');
            const pRes = await provider.fetchProfiles();
            expect(pRes.success).toBe(true);

            const dRes = await provider.fetchProfileData('pihole-1');
            expect(dRes.success).toBe(true);

            const mRes = await provider.manageDomain('pihole-1', 'allowlist', 'test.com', 'add');
            expect(mRes.success).toBe(true);

            const lRes = await provider.fetchLogs('pihole-1');
            expect(lRes.success).toBe(true);

            const cRes = await provider.clearLogs('pihole-1');
            expect(cRes.success).toBe(true);
            expect(spy).toHaveBeenCalled();
        });
    });
});
