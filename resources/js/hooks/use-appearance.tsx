import { useSyncExternalStore } from 'react';

export type ResolvedAppearance = 'light' | 'dark';
export type Appearance = ResolvedAppearance | 'system';

export type UseAppearanceReturn = {
    readonly appearance: Appearance;
    readonly resolvedAppearance: ResolvedAppearance;
    readonly updateAppearance: (mode: Appearance) => void;
};

const listeners = new Set<() => void>();
const APPEARANCE_STORAGE_KEY = 'jssport.appearance';
let currentAppearance: Appearance = 'system';

const resolveAppearance = (mode: Appearance): ResolvedAppearance => {
    if (mode === 'system') {
        if (typeof window === 'undefined') {
            return 'light';
        }

        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
    }

    return mode;
};

const applyTheme = (): void => {
    if (typeof document === 'undefined') {
        return;
    }

    const resolved = resolveAppearance(currentAppearance);

    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;
};

const subscribe = (callback: () => void) => {
    listeners.add(callback);

    return () => listeners.delete(callback);
};

const notify = (): void => listeners.forEach((listener) => listener());

export function initializeTheme(): void {
    if (typeof window === 'undefined') {
        return;
    }

    const saved = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);

    if (saved === 'light' || saved === 'dark' || saved === 'system') {
        currentAppearance = saved;
    } else {
        currentAppearance = 'system';
    }

    applyTheme();

    window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
            if (currentAppearance === 'system') {
                applyTheme();
                notify();
            }
        });
}

export function useAppearance(): UseAppearanceReturn {
    const appearance: Appearance = useSyncExternalStore(
        subscribe,
        () => currentAppearance,
        () => 'system',
    );

    const resolvedAppearance: ResolvedAppearance =
        resolveAppearance(appearance);

    const updateAppearance = (mode: Appearance): void => {
        currentAppearance = mode;

        if (typeof window !== 'undefined') {
            window.localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
        }

        applyTheme();
        notify();
    };

    return { appearance, resolvedAppearance, updateAppearance } as const;
}
