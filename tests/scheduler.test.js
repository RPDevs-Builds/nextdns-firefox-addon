/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import { storage } from '../src/storage.js';

describe('Background Scheduler & Automation Rules', () => {
    let checkAutomationRules;
    let handlersMock;
    let storedData;

    beforeEach(async () => {
        jest.clearAllMocks();

        storedData = {
            activeProfile: 'profile-123',
            forgeRules: []
        };

        jest.spyOn(storage, 'get').mockImplementation(async (key, def) => {
            return storedData[key] !== undefined ? storedData[key] : def;
        });

        jest.spyOn(storage, 'set').mockImplementation(async (key, val) => {
            storedData[key] = val;
        });

        const { messageHandlers } = await import('../src/background/handlers.js');
        handlersMock = messageHandlers;
        jest.spyOn(handlersMock, 'TOGGLE_SETTING').mockImplementation(jest.fn().mockResolvedValue({ success: true }));

        const schedulerMod = await import('../src/background/scheduler.js');
        checkAutomationRules = schedulerMod.checkAutomationRules;
    });

    test('Executes active rule matching current time', async () => {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        storedData.activeProfile = 'profile-123';
        storedData.forgeRules = [{
            id: 'rule-1',
            name: 'Night Mode',
            trigger: currentTime,
            action: 'enable',
            category: 'security',
            targetId: 'block-dga',
            active: true
        }];

        await checkAutomationRules();

        expect(handlersMock.TOGGLE_SETTING).toHaveBeenCalledWith(expect.objectContaining({
            profileId: 'profile-123',
            category: 'security',
            id: 'block-dga',
            action: 'add'
        }));
        expect(storage.set).toHaveBeenCalledWith('forgeRules', expect.any(Array));
    });

    test('Prevents duplicate execution on same day', async () => {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        storedData.activeProfile = 'profile-123';
        storedData.forgeRules = [{
            id: 'rule-1',
            name: 'Night Mode',
            trigger: currentTime,
            action: 'enable',
            category: 'security',
            targetId: 'block-dga',
            active: true,
            lastRunDate: todayStr
        }];

        await checkAutomationRules();

        expect(handlersMock.TOGGLE_SETTING).not.toHaveBeenCalled();
    });

    test('Ignores inactive rules', async () => {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        storedData.activeProfile = 'profile-123';
        storedData.forgeRules = [{
            id: 'rule-1',
            name: 'Night Mode',
            trigger: currentTime,
            action: 'enable',
            category: 'security',
            targetId: 'block-dga',
            active: false
        }];

        await checkAutomationRules();

        expect(handlersMock.TOGGLE_SETTING).not.toHaveBeenCalled();
    });

    test('Ignores malformed rules with invalid triggers, missing targets, or illegal actions', async () => {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        storedData.activeProfile = 'profile-123';
        storedData.forgeRules = [
            { id: 'bad-1', name: 'Bad Trigger Type', trigger: 1234, action: 'enable', targetId: 't1', active: true },
            { id: 'bad-2', name: 'Bad Time Format', trigger: 'invalid-time', action: 'enable', targetId: 't1', active: true },
            { id: 'bad-3', name: 'Out of Range Hour', trigger: '25:00', action: 'enable', targetId: 't1', active: true },
            { id: 'bad-4', name: 'Out of Range Min', trigger: '12:65', action: 'enable', targetId: 't1', active: true },
            { id: 'bad-5', name: 'Missing Target', trigger: currentTime, action: 'enable', targetId: '', active: true },
            { id: 'bad-6', name: 'Illegal Action', trigger: currentTime, action: 'purge', targetId: 't1', active: true }
        ];

        await checkAutomationRules();

        expect(handlersMock.TOGGLE_SETTING).not.toHaveBeenCalled();
    });
});
