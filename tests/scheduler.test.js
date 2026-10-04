/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';

describe('Background Scheduler & Automation Rules', () => {
    let checkAutomationRules;
    let storageMock;
    let handlersMock;

    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();

        const storedData = {
            activeProfile: 'profile-123',
            forgeRules: []
        };

        storageMock = {
            get: jest.fn(async (key, def) => storedData[key] !== undefined ? storedData[key] : def),
            set: jest.fn(async (key, val) => { storedData[key] = val; })
        };

        handlersMock = {
            TOGGLE_SETTING: jest.fn().mockResolvedValue({ success: true })
        };

        jest.unstable_mockModule('../src/storage.js', () => ({
            storage: storageMock
        }));

        jest.unstable_mockModule('../src/background/handlers.js', () => ({
            messageHandlers: handlersMock
        }));

        const schedulerMod = await import('../src/background/scheduler.js');
        checkAutomationRules = schedulerMod.checkAutomationRules;
    });

    test('Executes active rule matching current time', async () => {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        storageMock.get.mockImplementation(async (key, def) => {
            if (key === 'activeProfile') return 'profile-123';
            if (key === 'forgeRules') return [{
                id: 'rule-1',
                name: 'Night Mode',
                trigger: currentTime,
                action: 'enable',
                category: 'security',
                targetId: 'block-dga',
                active: true
            }];
            return def;
        });

        await checkAutomationRules();

        expect(handlersMock.TOGGLE_SETTING).toHaveBeenCalledWith(expect.objectContaining({
            profileId: 'profile-123',
            category: 'security',
            id: 'block-dga',
            action: 'add'
        }));
        expect(storageMock.set).toHaveBeenCalledWith('forgeRules', expect.any(Array));
    });

    test('Prevents duplicate execution on same day', async () => {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        storageMock.get.mockImplementation(async (key, def) => {
            if (key === 'activeProfile') return 'profile-123';
            if (key === 'forgeRules') return [{
                id: 'rule-1',
                name: 'Night Mode',
                trigger: currentTime,
                action: 'enable',
                category: 'security',
                targetId: 'block-dga',
                active: true,
                lastRunDate: todayStr
            }];
            return def;
        });

        await checkAutomationRules();

        expect(handlersMock.TOGGLE_SETTING).not.toHaveBeenCalled();
    });

    test('Ignores inactive rules', async () => {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        storageMock.get.mockImplementation(async (key, def) => {
            if (key === 'activeProfile') return 'profile-123';
            if (key === 'forgeRules') return [{
                id: 'rule-1',
                name: 'Night Mode',
                trigger: currentTime,
                action: 'enable',
                category: 'security',
                targetId: 'block-dga',
                active: false
            }];
            return def;
        });

        await checkAutomationRules();

        expect(handlersMock.TOGGLE_SETTING).not.toHaveBeenCalled();
    });
});
