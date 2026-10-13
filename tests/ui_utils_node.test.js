/**
 * @jest-environment node
 */

beforeAll(() => {
    global.window = { location: { search: '' } };
});

afterAll(() => {
    delete global.window;
});

describe('UI utils - Headless / Node Environment Branch Coverage', () => {
    test('showToast exits early when typeof document is undefined (line 148)', async () => {
        const { showToast } = await import('../src/ui/utils.js');
        expect(typeof document).toBe('undefined');
        expect(() => showToast('headless toast', 'info')).not.toThrow();
    });

    test('setSafeHTML exits early when parser is undefined (line 76)', async () => {
        const { setSafeHTML } = await import('../src/ui/utils.js');
        expect(typeof DOMParser).toBe('undefined');
        const dummyElement = { childNodes: [] };
        expect(() => setSafeHTML(dummyElement, '<p>Test</p>')).not.toThrow();
    });
});
