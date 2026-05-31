/**
 * @jest-environment jsdom
 */

import { jest, beforeEach, test, expect, describe } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.resolve('src/popup.html'), 'utf8');

describe('Exportable Reports & Snapshots (Phase 7.2)', () => {
    let tools, utils, state;

    beforeEach(async () => {
        document.body.innerHTML = html;
        jest.resetModules();

        global.browser = {
            runtime: {
                sendMessage: jest.fn(),
                getManifest: () => ({ version: '0.9.3' })
            },
            storage: {
                sync: { 
                    get: jest.fn().mockResolvedValue({}),
                    set: jest.fn().mockResolvedValue({})
                },
                local: { 
                    get: jest.fn().mockResolvedValue({}),
                    set: jest.fn().mockResolvedValue({})
                }
            },
            tabs: { query: jest.fn().mockResolvedValue([{ id: 1 }]) }
        };

        // Mock URL APIs
        global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = jest.fn();

        const stateModule = await import('../src/ui/state.js');
        state = stateModule.state;
        state.activeProfile = 'p1';

        utils = await import('../src/ui/utils.js');
        tools = await import('../src/ui/tools.js');
    });

    test('downloadAsFile utility creates a link and triggers click', () => {
        const clickSpy = jest.fn();
        const oldCreateElement = document.createElement;
        
        jest.spyOn(document, 'createElement').mockImplementation((tag) => {
            const el = oldCreateElement.call(document, tag);
            if (tag === 'a') el.click = clickSpy;
            return el;
        });

        utils.downloadAsFile('test.json', '{"test":true}');
        
        expect(clickSpy).toHaveBeenCalled();
        expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    test('runIntelligentDebugger displays export button when correlations exist', async () => {
        const exportBtn = document.getElementById('export-debugger-btn');
        
        global.browser.runtime.sendMessage.mockResolvedValue({
            success: true,
            correlations: [{ domain: 'blocked.com', reasons: [{name:'List A'}], timestamp: Date.now(), device: 'Device' }]
        });

        await tools.runIntelligentDebugger();
        
        expect(exportBtn.classList.contains('hidden')).toBe(false);
    });

    test('runSecurityAudit displays export button when results exist', async () => {
        const exportBtn = document.getElementById('export-audit-btn');
        
        global.browser.runtime.sendMessage.mockResolvedValue({
            success: true,
            score: 95,
            recommendations: []
        });

        await tools.runSecurityAudit();
        
        expect(exportBtn.classList.contains('hidden')).toBe(false);
    });
});
