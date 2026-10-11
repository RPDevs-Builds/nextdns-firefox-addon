/**
 * @jest-environment jsdom
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { setSafeHTML, escapeHTML, setActiveTab, downloadAsFile, showToast, renderEmptyStateHTML } from '../src/ui/utils.js';
import { state } from '../src/ui/state.js';

describe('Sanitization & Safe HTML (AMO Compliance)', () => {
    let container;

    beforeEach(() => {
        document.body.innerHTML = '';
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    test('Removes explicit <script> tags', () => {
        setSafeHTML(container, '<div>Hello <script>alert("XSS")</script>World</div>');
        expect(container.querySelector('script')).toBeNull();
        expect(container.textContent).toContain('Hello');
        expect(container.textContent).toContain('World');
    });

    test('Strips inline event handlers (onerror, onload, onclick)', () => {
        setSafeHTML(container, '<img src="x" onerror="alert(1)" onload="alert(2)" onclick="alert(3)">');
        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        expect(img.getAttribute('onerror')).toBeNull();
        expect(img.getAttribute('onload')).toBeNull();
        expect(img.getAttribute('onclick')).toBeNull();
        expect(img.getAttribute('src')).toBe('x');
    });

    test('Strips javascript:, vbscript:, and data: URIs', () => {
        setSafeHTML(container, '<a href="javascript:alert(1)">Click Me</a><form action="javascript:steal()"><button formaction="vbscript:run()"></button></form><a xlink:href="data:text/html,evil">Link</a>');
        const a = container.querySelector('a');
        expect(a).not.toBeNull();
        expect(a.getAttribute('href')).toBeNull();
        expect(a.textContent).toBe('Click Me');

        const form = container.querySelector('form');
        expect(form).not.toBeNull();
        expect(form.getAttribute('action')).toBeNull();

        const btn = container.querySelector('button');
        expect(btn.getAttribute('formaction')).toBeNull();
    });

    test('Strips dangerous CSS in style attributes (position: fixed, url, expression)', () => {
        setSafeHTML(container, '<div id="fixed-el" style="position: fixed; top: 0;">Fixed</div><div id="url-el" style="background: url(\'evil.png\');">URL</div><div id="expr-el" style="width: expression(1);">Expr</div>');
        expect(container.querySelector('#fixed-el')?.getAttribute('style')).toBeNull();
        expect(container.querySelector('#url-el')?.getAttribute('style')).toBeNull();
        expect(container.querySelector('#expr-el')?.getAttribute('style')).toBeNull();
    });

    test('Removes dangerous object, embed, iframe, base, svg, math, portal tags', () => {
        setSafeHTML(container, '<iframe src="http://evil.com"></iframe><embed src="evil.swf"><object data="evil"></object><svg><circle/></svg><math></math><portal src="x"></portal>');
        expect(container.querySelector('iframe')).toBeNull();
        expect(container.querySelector('embed')).toBeNull();
        expect(container.querySelector('object')).toBeNull();
        expect(container.querySelector('svg')).toBeNull();
        expect(container.querySelector('math')).toBeNull();
        expect(container.querySelector('portal')).toBeNull();
    });

    test('Preserves safe formatting, classes, and attributes', () => {
        setSafeHTML(container, '<div class="panel-box" style="color: red;"><span class="badge">PRO</span> <strong>Safe Domain</strong></div>');
        const div = container.querySelector('.panel-box');
        expect(div).not.toBeNull();
        expect(div.querySelector('.badge')).not.toBeNull();
        expect(div.querySelector('strong').textContent).toBe('Safe Domain');
    });

    test('setSafeHTML handles null element or re-populating existing children', () => {
        // null element
        expect(() => setSafeHTML(null, '<div>test</div>')).not.toThrow();

        // existing children replaced
        container.innerHTML = '<p>Old</p><p>Older</p>';
        setSafeHTML(container, '<span>New</span>');
        expect(container.innerHTML).toBe('<span>New</span>');
    });

    test('escapeHTML properly escapes HTML special characters and handles non-strings', () => {
        expect(escapeHTML('<script>')).toBe('&lt;script&gt;');
        expect(escapeHTML('"test" & \'single\'')).toBe('&quot;test&quot; &amp; &#39;single&#39;');
        expect(escapeHTML(null)).toBeNull();
        expect(escapeHTML(undefined)).toBeUndefined();
        expect(escapeHTML(123)).toBe(123);
    });

    test('renderEmptyStateHTML generates sanitized markup with icon and message', () => {
        const html = renderEmptyStateHTML('No profiles found', '⚠️');
        expect(html).toContain('empty-state');
        expect(html).toContain('No profiles found');
        expect(html).toContain('⚠️');

        const defaultHtml = renderEmptyStateHTML('Empty');
        expect(defaultHtml).toContain('📭');
    });

    test('setActiveTab updates state and toggles active classes and accessibility attributes', () => {
        document.body.innerHTML = `
            <button class="tab-btn" data-tab="dashboard">Dashboard</button>
            <button class="tab-btn" data-tab="security">Security</button>
            <div id="tab-dashboard" class="tab-content">Dashboard View</div>
            <div id="tab-security" class="tab-content">Security View</div>
        `;

        setActiveTab('security');
        expect(state.activeTab).toBe('security');

        const dashBtn = document.querySelector('.tab-btn[data-tab="dashboard"]');
        const secBtn = document.querySelector('.tab-btn[data-tab="security"]');
        expect(dashBtn.classList.contains('active')).toBe(false);
        expect(dashBtn.getAttribute('aria-selected')).toBe('false');
        expect(dashBtn.tabIndex).toBe(-1);

        expect(secBtn.classList.contains('active')).toBe(true);
        expect(secBtn.getAttribute('aria-selected')).toBe('true');
        expect(secBtn.tabIndex).toBe(0);

        const dashContent = document.getElementById('tab-dashboard');
        const secContent = document.getElementById('tab-security');
        expect(dashContent.style.display).toBe('none');
        expect(dashContent.hasAttribute('hidden')).toBe(true);

        expect(secContent.style.display).toBe('flex');
        expect(secContent.hasAttribute('hidden')).toBe(false);

        // Falsy tabId returns early
        setActiveTab(null);
        expect(state.activeTab).toBe('security');
    });

    test('setActiveTab warns gracefully when elements are missing', () => {
        document.body.innerHTML = '';
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        setActiveTab('nonexistent');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    test('downloadAsFile triggers anchor click and revokes object URL', () => {
        jest.useFakeTimers();
        global.URL.createObjectURL = jest.fn().mockReturnValue('blob:test-data');
        global.URL.revokeObjectURL = jest.fn();

        const clickSpy = jest.fn();
        const origCreateElement = document.createElement.bind(document);
        jest.spyOn(document, 'createElement').mockImplementation((tag) => {
            const el = origCreateElement(tag);
            if (tag === 'a') el.click = clickSpy;
            return el;
        });

        downloadAsFile('export.json', '{"test":true}');
        expect(global.URL.createObjectURL).toHaveBeenCalled();
        expect(clickSpy).toHaveBeenCalled();

        jest.advanceTimersByTime(150);
        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-data');
        jest.useRealTimers();
    });

    test('showToast displays toasts with various severity icons and handles timeouts', () => {
        jest.useFakeTimers();

        showToast('Info alert', 'info');
        showToast('Success alert', 'success');
        showToast('Warning alert', 'warning');
        showToast('Error alert', 'error');

        const toasts = document.querySelectorAll('.toast');
        expect(toasts.length).toBe(4);

        expect(toasts[0].querySelector('.toast-icon').textContent).toBe('ℹ️');
        expect(toasts[1].querySelector('.toast-icon').textContent).toBe('✅');
        expect(toasts[2].querySelector('.toast-icon').textContent).toBe('⚡');
        expect(toasts[3].querySelector('.toast-icon').textContent).toBe('⚠️');

        // Fast forward duration
        jest.advanceTimersByTime(3000);
        expect(toasts[0].style.opacity).toBe('0');

        // Fast forward cleanup animation
        jest.advanceTimersByTime(300);
        expect(document.querySelectorAll('.toast').length).toBe(0);

        jest.useRealTimers();
    });
});
