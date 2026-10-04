/**
 * @jest-environment jsdom
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { setSafeHTML, escapeHTML } from '../src/ui/utils.js';

describe('Sanitization & Safe HTML (AMO Compliance)', () => {
    let container;

    beforeEach(() => {
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

    test('Strips javascript: and vbscript: URIs', () => {
        setSafeHTML(container, '<a href="javascript:alert(1)">Click Me</a><form action="javascript:steal()"></form>');
        const a = container.querySelector('a');
        expect(a).not.toBeNull();
        expect(a.getAttribute('href')).toBeNull();
        expect(a.textContent).toBe('Click Me');

        const form = container.querySelector('form');
        expect(form).not.toBeNull();
        expect(form.getAttribute('action')).toBeNull();
    });

    test('Removes dangerous object, embed, iframe, base tags', () => {
        setSafeHTML(container, '<iframe src="http://evil.com"></iframe><embed src="evil.swf"><object data="evil"></object>');
        expect(container.querySelector('iframe')).toBeNull();
        expect(container.querySelector('embed')).toBeNull();
        expect(container.querySelector('object')).toBeNull();
    });

    test('Preserves safe formatting, classes, and attributes', () => {
        setSafeHTML(container, '<div class="panel-box" style="color: red;"><span class="badge">PRO</span> <strong>Safe Domain</strong></div>');
        const div = container.querySelector('.panel-box');
        expect(div).not.toBeNull();
        expect(div.querySelector('.badge')).not.toBeNull();
        expect(div.querySelector('strong').textContent).toBe('Safe Domain');
    });

    test('escapeHTML properly escapes HTML special characters', () => {
        expect(escapeHTML('<script>')).toBe('&lt;script&gt;');
        expect(escapeHTML('"test" & \'single\'')).toBe('&quot;test&quot; &amp; &#39;single&#39;');
    });
});
