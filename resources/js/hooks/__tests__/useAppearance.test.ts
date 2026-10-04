import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The app is drawn light. Its pages set their own slate and white directly,
 * and only the shared controls — buttons, inputs, selects — read the theme
 * tokens. Following the machine's preference therefore did not darken the
 * page; it darkened the controls sitting on a white page, and every
 * selected/unselected pair came out reading backwards: the chosen delivery
 * method looked untouched while the two others looked chosen.
 *
 * So a browser that has never been told otherwise gets light, whatever the
 * machine prefers. Someone who wants dark can still ask for it.
 */
const STORAGE_KEY = 'jssport.appearance';

/** This runtime has no localStorage of its own, so the tests bring one. */
const useMemoryStorage = () => {
    const store = new Map<string, string>();

    vi.stubGlobal('localStorage', {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() {
            return store.size;
        },
    });
};

const setSystemPrefersDark = (dark: boolean) => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
            matches: dark && query.includes('dark'),
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
            onchange: null,
        })),
    );
};

const freshModule = async () => {
    vi.resetModules();

    return import('../use-appearance');
};

beforeEach(() => {
    vi.unstubAllGlobals();
    useMemoryStorage();
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
});

describe('which appearance the app opens in', () => {
    it('stays light on a machine that prefers dark', async () => {
        setSystemPrefersDark(true);

        const { initializeTheme } = await freshModule();
        initializeTheme();

        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('honours dark when the browser was told to use it', async () => {
        setSystemPrefersDark(false);
        localStorage.setItem(STORAGE_KEY, 'dark');

        const { initializeTheme } = await freshModule();
        initializeTheme();

        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('still follows the machine for anyone who picked "system"', async () => {
        setSystemPrefersDark(true);
        localStorage.setItem(STORAGE_KEY, 'system');

        const { initializeTheme } = await freshModule();
        initializeTheme();

        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
});
