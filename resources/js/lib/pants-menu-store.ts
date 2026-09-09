const PANTS_MENU_KEY = 'jssport.pants-menu-items';
const PANTS_MENU_UPDATED_EVENT = 'pants-menu-updated';

type KnownCatalogConfig = {
    title: string;
    storageKey: string;
};

const KNOWN_CATALOGS: Record<string, KnownCatalogConfig> = {
    patterns: { title: 'แพทเทิร์น', storageKey: 'jssport.pants-patterns' },
    'leg-style': { title: 'แบบขา', storageKey: 'jssport.pants-leg-style' },
    'leg-hem': { title: 'ปลายขา', storageKey: 'jssport.pants-leg-hem' },
};

const DEFAULT_MENU_SLUGS = ['patterns', 'leg-style', 'leg-hem'] as const;

export type PantsMenuItem = {
    id: string;
    slug: string;
    title: string;
    createdAt: string;
    createdBy: string;
    active: boolean;
    storageKey: string;
};

export type PantsMenuLink = {
    title: string;
    href: string;
};

function safeWindow(): Window | null {
    if (typeof window === 'undefined') {
        return null;
    }

    return window;
}

function slugify(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-ก-๙]/g, '')
        .replace(/-+/g, '-');
}

function buildMenuHref(slug: string, title: string): string {
    return `/settings/data/pants/catalog/${slug}?title=${encodeURIComponent(title)}`;
}

function storageKeyBySlug(slug: string): string {
    const known = KNOWN_CATALOGS[slug];

    if (known) {
        return known.storageKey;
    }

    return `jssport.pants-catalog-${slug}`;
}

function defaultMenuItems(): PantsMenuItem[] {
    const now = new Date().toISOString();

    return DEFAULT_MENU_SLUGS.map((slug) => ({
        id: `default-${slug}`,
        slug,
        title: KNOWN_CATALOGS[slug].title,
        createdAt: now,
        createdBy: 'system',
        active: true,
        storageKey: KNOWN_CATALOGS[slug].storageKey,
    }));
}

function normalizeItems(items: PantsMenuItem[]): PantsMenuItem[] {
    return items.filter(
        (item) =>
            typeof item.id === 'string' &&
            typeof item.slug === 'string' &&
            item.slug.trim().length > 0 &&
            typeof item.title === 'string' &&
            item.title.trim().length > 0 &&
            typeof item.createdAt === 'string' &&
            typeof item.createdBy === 'string' &&
            typeof item.active === 'boolean' &&
            typeof item.storageKey === 'string',
    );
}

function persistItems(win: Window, items: PantsMenuItem[]) {
    win.localStorage.setItem(PANTS_MENU_KEY, JSON.stringify(items));
    win.dispatchEvent(new Event(PANTS_MENU_UPDATED_EVENT));
}

export function getPantsMenuItems(): PantsMenuItem[] {
    const win = safeWindow();

    if (!win) {
        return defaultMenuItems();
    }

    try {
        const raw = win.localStorage.getItem(PANTS_MENU_KEY);

        if (!raw) {
            const seeded = defaultMenuItems();
            persistItems(win, seeded);

            return seeded;
        }

        const parsed = JSON.parse(raw) as PantsMenuItem[];

        if (!Array.isArray(parsed)) {
            const seeded = defaultMenuItems();
            persistItems(win, seeded);

            return seeded;
        }

        const normalized = normalizeItems(parsed);

        if (normalized.length !== parsed.length) {
            persistItems(win, normalized);
        }

        return normalized;
    } catch {
        const seeded = defaultMenuItems();
        persistItems(win, seeded);

        return seeded;
    }
}

export function savePantsMenuItems(items: PantsMenuItem[]): void {
    const win = safeWindow();

    if (!win) {
        return;
    }

    const normalized = normalizeItems(items);
    persistItems(win, normalized);
}

export function addPantsMenuItem(
    title: string,
    createdBy: string,
): PantsMenuItem | null {
    const normalizedTitle = title.trim();

    if (normalizedTitle.length === 0) {
        return null;
    }

    const slug = slugify(normalizedTitle);

    if (!slug) {
        return null;
    }

    const current = getPantsMenuItems();
    const alreadyExists = current.some(
        (item) =>
            item.slug === slug ||
            item.title.toLowerCase() === normalizedTitle.toLowerCase(),
    );

    if (alreadyExists) {
        return null;
    }

    const newItem: PantsMenuItem = {
        id: `${Date.now()}-${slug}`,
        slug,
        title: normalizedTitle,
        createdAt: new Date().toISOString(),
        createdBy,
        active: true,
        storageKey: storageKeyBySlug(slug),
    };

    savePantsMenuItems([...current, newItem]);

    return newItem;
}

export function getActivePantsMenuLinks(): PantsMenuLink[] {
    return getPantsMenuItems()
        .filter((item) => item.active)
        .map((item) => ({
            title: item.title,
            href: buildMenuHref(item.slug, item.title),
        }));
}

export function pantsMenuUpdatedEventName(): string {
    return PANTS_MENU_UPDATED_EVENT;
}

export function updatePantsMenuItemTitle(
    items: PantsMenuItem[],
    id: string,
    title: string,
): PantsMenuItem[] {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
        return items;
    }

    return items.map((item) =>
        item.id === id ? { ...item, title: normalizedTitle } : item,
    );
}

export function togglePantsMenuItem(
    items: PantsMenuItem[],
    id: string,
): PantsMenuItem[] {
    return items.map((item) =>
        item.id === id ? { ...item, active: !item.active } : item,
    );
}

export function deletePantsMenuItem(
    items: PantsMenuItem[],
    id: string,
): PantsMenuItem[] {
    return items.filter((item) => item.id !== id);
}

export function hasDuplicatePantsMenuTitle(
    items: PantsMenuItem[],
    title: string,
    ignoreId?: string,
): boolean {
    const normalizedTitle = title.trim().toLowerCase();

    if (!normalizedTitle) {
        return false;
    }

    return items.some(
        (item) =>
            item.id !== ignoreId &&
            item.title.trim().toLowerCase() === normalizedTitle,
    );
}
