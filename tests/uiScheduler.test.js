/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, describe, test, expect } from '@jest/globals';
import { loadRules, saveAutomationRule } from '../src/ui/scheduler.js';

describe('UI Scheduler Module (ui/scheduler.js)', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="rules-list"></div>
            <input id="rule-name" value="" />
            <input id="rule-trigger" value="" />
            <select id="rule-action">
                <option value="enable">Enable</option>
                <option value="disable">Disable</option>
            </select>
            <select id="rule-target">
                <option value="">Select target</option>
                <option value="security:block-dga">Block DGA</option>
                <option value="parentalcontrol/services:facebook">Facebook</option>
            </select>
            <button id="add-rule-btn">Add Rule</button>
        `;
        jest.clearAllMocks();
    });

    test('loadRules: Renders empty state when no rules exist', async () => {
        global.browser.runtime.sendMessage = jest.fn().mockResolvedValue({ success: true, rules: [] });

        await loadRules();

        const list = document.getElementById('rules-list');
        expect(list.innerHTML).toContain('No automation rules scheduled');
    });

    test('loadRules: Renders rules list and handles rule deletion', async () => {
        const rules = [
            { id: 'r1', name: 'Night Mode', trigger: '22:00', action: 'enable', targetId: 'block-dga' }
        ];

        global.browser.runtime.sendMessage = jest.fn()
            .mockResolvedValueOnce({ success: true, rules }) // initial load
            .mockResolvedValueOnce({ success: true }) // delete rule
            .mockResolvedValueOnce({ success: true, rules: [] }); // reload after delete

        await loadRules();

        const list = document.getElementById('rules-list');
        expect(list.innerHTML).toContain('Night Mode');
        expect(list.innerHTML).toContain('22:00 • enable block-dga');

        const delBtn = list.querySelector('.delete-rule-btn');
        expect(delBtn).not.toBeNull();
        expect(delBtn.getAttribute('data-id')).toBe('r1');

        await delBtn.onclick();

        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'DELETE_RULE',
            ruleId: 'r1'
        });
    });

    test('loadRules: Handles delete errors gracefully', async () => {
        const rules = [{ id: 'r1', name: 'Rule 1', trigger: '12:00', action: 'disable', targetId: 't1' }];
        global.browser.runtime.sendMessage = jest.fn()
            .mockResolvedValueOnce({ success: true, rules })
            .mockResolvedValueOnce({ success: false, error: 'Database locked' });

        await loadRules();

        const delBtn = document.querySelector('.delete-rule-btn');
        await delBtn.onclick();
        expect(delBtn.disabled).toBe(false);

        // Test exception thrown
        global.browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Network dead'));
        await delBtn.onclick();
        expect(delBtn.disabled).toBe(false);

        // Test delRes.error fallback (line 42)
        global.browser.runtime.sendMessage.mockResolvedValueOnce({ success: false });
        await delBtn.onclick();
        expect(delBtn.disabled).toBe(false);

        // Test err.message fallback (line 45)
        global.browser.runtime.sendMessage.mockRejectedValueOnce({});
        await delBtn.onclick();
        expect(delBtn.disabled).toBe(false);
    });

    test('saveAutomationRule: Validates required inputs', async () => {
        await saveAutomationRule();
        let toasts = document.querySelectorAll('.toast-text');
        expect(toasts[toasts.length - 1]?.textContent).toContain('Please enter name and time');

        document.getElementById('rule-name').value = 'Test Rule';
        document.getElementById('rule-trigger').value = '10:00';
        document.getElementById('rule-target').value = '';

        await saveAutomationRule();
        toasts = document.querySelectorAll('.toast-text');
        expect(toasts[toasts.length - 1]?.textContent).toContain('Please select a target setting');
    });

    test('saveAutomationRule: Saves rule successfully for standard boolean setting', async () => {
        document.getElementById('rule-name').value = 'Block Threats';
        document.getElementById('rule-trigger').value = '08:00';
        document.getElementById('rule-action').value = 'enable';
        document.getElementById('rule-target').value = 'security:block-dga';

        global.browser.runtime.sendMessage = jest.fn()
            .mockResolvedValueOnce({ success: true }) // SAVE_RULE
            .mockResolvedValueOnce({ success: true, rules: [] }); // loadRules reload

        await saveAutomationRule();

        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'SAVE_RULE',
            rule: {
                name: 'Block Threats',
                trigger: '08:00',
                action: 'enable',
                category: 'security',
                targetId: 'block-dga',
                settingType: 'boolean'
            }
        });

        expect(document.getElementById('rule-name').value).toBe('');
        expect(document.getElementById('rule-trigger').value).toBe('');
    });

    test('saveAutomationRule: Sets settingType to list for parental services', async () => {
        document.getElementById('rule-name').value = 'Block FB';
        document.getElementById('rule-trigger').value = '20:00';
        document.getElementById('rule-action').value = 'enable';
        document.getElementById('rule-target').value = 'parentalcontrol/services:facebook';

        global.browser.runtime.sendMessage = jest.fn()
            .mockResolvedValueOnce({ success: true })
            .mockResolvedValueOnce({ success: true, rules: [] });

        await saveAutomationRule();

        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            rule: expect.objectContaining({ settingType: 'list' })
        }));
    });

    test('saveAutomationRule: Handles save errors and exceptions', async () => {
        document.getElementById('rule-name').value = 'Err Rule';
        document.getElementById('rule-trigger').value = '11:00';
        document.getElementById('rule-target').value = 'security:block-dga';

        global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({ success: false, error: 'Quota exceeded' });
        await saveAutomationRule();

        expect(document.getElementById('add-rule-btn').disabled).toBe(false);

        // Exception path
        document.getElementById('rule-name').value = 'Err Rule 2';
        document.getElementById('rule-trigger').value = '12:00';
        document.getElementById('rule-target').value = 'security:block-dga';
        global.browser.runtime.sendMessage = jest.fn().mockRejectedValueOnce(new Error('Connection abort'));
        await saveAutomationRule();
        expect(document.getElementById('add-rule-btn').disabled).toBe(false);

        // Fallback error without message / string
        document.getElementById('rule-name').value = 'Err Rule 3';
        document.getElementById('rule-trigger').value = '13:00';
        document.getElementById('rule-target').value = 'security:block-dga';
        global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({ success: false }); // hits || 'Unknown error'
        await saveAutomationRule();

        document.getElementById('rule-name').value = 'Err Rule 4';
        document.getElementById('rule-trigger').value = '14:00';
        document.getElementById('rule-target').value = 'security:block-dga';
        global.browser.runtime.sendMessage = jest.fn().mockRejectedValueOnce({}); // err without message hits || 'Unknown error'
        await saveAutomationRule();

        // Branches where DOM inputs or add-rule-btn are missing
        const btn = document.getElementById('add-rule-btn');
        btn.remove();
        document.getElementById('rule-name').value = 'No Btn';
        document.getElementById('rule-trigger').value = '15:00';
        document.getElementById('rule-target').value = 'security:block-dga';
        global.browser.runtime.sendMessage = jest.fn().mockResolvedValueOnce({ success: true, rules: [] });
        await saveAutomationRule();

        // Branches where rule-name and rule-trigger are removed after success
        document.body.innerHTML = `
            <select id="rule-action"><option value="enable">Enable</option></select>
            <select id="rule-target"><option value="security:block-dga">Block DGA</option></select>
            <button id="add-rule-btn">Add</button>
        `;
        // Pass validation by mocking getElementById temporarily
        const origGetEl = document.getElementById.bind(document);
        document.getElementById = (id) => {
            if (id === 'rule-name' || id === 'rule-trigger') {
                return { value: 'Valid' };
            }
            return origGetEl(id);
        };
        global.browser.runtime.sendMessage = jest.fn()
            .mockResolvedValueOnce({ success: true })
            .mockResolvedValueOnce({ success: true, rules: [] });
        // Restore getElementById before save completes so nameInput and triggerEl are null at lines 80 & 82
        const savePromise = saveAutomationRule();
        document.getElementById = origGetEl;
        await savePromise;

        // Test loadRules when list element is missing (line 16)
        document.body.innerHTML = '';
        await loadRules();
    });
});
