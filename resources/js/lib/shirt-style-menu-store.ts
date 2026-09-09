const SHIRT_MENU_KEY = 'jssport.shirt-menu-items';
const LEGACY_SHIRT_STYLE_MENU_KEY = 'jssport.shirt-style-menus';
const SHIRT_MENU_UPDATED_EVENT = 'shirt-menu-updated';
const REMOVED_MENU_TITLES = new Set(['ทดสอบ']);

type KnownCatalogConfig = {
    title: string;
    storageKey: string;
};

const KNOWN_CATALOGS: Record<string, KnownCatalogConfig> = {
    patterns: { title: 'แพทเทิร์น', storageKey: 'jssport.shirt-patterns' },
    fabrics: { title: 'เนื้อผ้า', storageKey: 'jssport.shirt-fabrics' },
    colors: { title: 'สีเสื้อ', storageKey: 'jssport.shirt-colors' },
    collars: { title: 'ปก', storageKey: 'jssport.shirt-collars' },
    plackets: { title: 'แบบสาป', storageKey: 'jssport.shirt-plackets' },
    sleeves: { title: 'แบบแขน', storageKey: 'jssport.shirt-sleeves' },
    cuffs: { title: 'ปลายแขน', storageKey: 'jssport.shirt-cuffs' },
    panels: { title: 'แบบต่อ', storageKey: 'jssport.shirt-panels' },
    sublimation: {
        title: 'ซับลิเมชั่น',
        storageKey: 'jssport.shirt-sublimation',
    },
};

const DEFAULT_MENU_SLUGS = [
    'patterns',
    'fabrics',
    'colors',
    'collars',
    'plackets',
    'sleeves',
    'cuffs',
    'panels',
    'sublimation',
] as const;

export type ShirtMenuItem = {
    id: string;
    slug: string;
    title: string;
    createdAt: string;
    createdBy: string;
    active: boolean;
    storageKey: string;
};

export type ShirtMenuLink = {
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
    return `/settings/data/shirts/catalog/${slug}?title=${encodeURIComponent(title)}`;
}

function storageKeyBySlug(slug: string): string {
    const known = KNOWN_CATALOGS[slug];

    if (known) {
        return known.storageKey;
    }

    return `jssport.shirt-catalog-${slug}`;
}

function defaultMenuItems(): ShirtMenuItem[] {
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

function normalizeItems(items: ShirtMenuItem[]): ShirtMenuItem[] {
    return items.filter(
        (item) =>
            typeof item.id === 'string' &&
            typeof item.slug === 'string' &&
            item.slug.trim().length > 0 &&
            typeof item.title === 'string' &&
            item.title.trim().length > 0 &&
            !REMOVED_MENU_TITLES.has(item.title.trim()) &&
            typeof item.createdAt === 'string' &&
            typeof item.createdBy === 'string' &&
            typeof item.active === 'boolean' &&
            typeof item.storageKey === 'string',
    );
}

function persistItems(win: Window, items: ShirtMenuItem[]) {
    win.localStorage.setItem(SHIRT_MENU_KEY, JSON.stringify(items));
    win.dispatchEvent(new Event(SHIRT_MENU_UPDATED_EVENT));
}

function migrateLegacyMenus(
    win: Window,
    current: ShirtMenuItem[],
): ShirtMenuItem[] {
    const legacyRaw = win.localStorage.getItem(LEGACY_SHIRT_STYLE_MENU_KEY);

    if (!legacyRaw) {
        return current;
    }

    try {
        const legacyParsed = JSON.parse(legacyRaw) as Array<{ title: string }>;

        if (!Array.isArray(legacyParsed)) {
            win.localStorage.removeItem(LEGACY_SHIRT_STYLE_MENU_KEY);

            return current;
        }

        const next = [...current];

        for (const entry of legacyParsed) {
            if (typeof entry.title !== 'string') {
                continue;
            }

            const title = entry.title.trim();

            if (!title || REMOVED_MENU_TITLES.has(title)) {
                continue;
            }

            const slug = slugify(title);

            if (
                !slug ||
                next.some(
                    (item) =>
                        item.slug === slug ||
                        item.title.toLowerCase() === title.toLowerCase(),
                )
            ) {
                continue;
            }

            next.push({
                id: `legacy-${Date.now()}-${slug}`,
                slug,
                title,
                createdAt: new Date().toISOString(),
                createdBy: 'legacy',
                active: true,
                storageKey: storageKeyBySlug(slug),
            });
        }

        win.localStorage.removeItem(LEGACY_SHIRT_STYLE_MENU_KEY);

        return next;
    } catch {
        win.localStorage.removeItem(LEGACY_SHIRT_STYLE_MENU_KEY);

        return current;
    }
}

export function getShirtMenuItems(): ShirtMenuItem[] {
    const win = safeWindow();

    if (!win) {
        return defaultMenuItems();
    }

    try {
        const raw = win.localStorage.getItem(SHIRT_MENU_KEY);

        if (!raw) {
            const seeded = defaultMenuItems();
            persistItems(win, seeded);

            return seeded;
        }

        const parsed = JSON.parse(raw) as ShirtMenuItem[];

        if (!Array.isArray(parsed)) {
            const seeded = defaultMenuItems();
            persistItems(win, seeded);

            return seeded;
        }

        const normalized = normalizeItems(parsed);
        const withLegacy = migrateLegacyMenus(win, normalized);

        if (withLegacy.length !== parsed.length || withLegacy !== normalized) {
            persistItems(win, withLegacy);
        }

        return withLegacy;
    } catch {
        const seeded = defaultMenuItems();
        persistItems(win, seeded);

        return seeded;
    }
}

export function saveShirtMenuItems(items: ShirtMenuItem[]): void {
    const win = safeWindow();

    if (!win) {
        return;
    }

    const normalized = normalizeItems(items);
    persistItems(win, normalized);
}

export function addShirtMenuItem(
    title: string,
    createdBy: string,
): ShirtMenuItem | null {
    const normalizedTitle = title.trim();

    if (normalizedTitle.length === 0) {
        return null;
    }

    const slug = slugify(normalizedTitle);

    if (!slug) {
        return null;
    }

    const current = getShirtMenuItems();
    const alreadyExists = current.some(
        (item) =>
            item.slug === slug ||
            item.title.toLowerCase() === normalizedTitle.toLowerCase(),
    );

    if (alreadyExists) {
        return null;
    }

    const newItem: ShirtMenuItem = {
        id: `${Date.now()}-${slug}`,
        slug,
        title: normalizedTitle,
        createdAt: new Date().toISOString(),
        createdBy,
        active: true,
        storageKey: storageKeyBySlug(slug),
    };

    saveShirtMenuItems([...current, newItem]);

    return newItem;
}

export function getActiveShirtMenuLinks(): ShirtMenuLink[] {
    return getShirtMenuItems()
        .filter((item) => item.active)
        .map((item) => ({
            title: item.title,
            href: buildMenuHref(item.slug, item.title),
        }));
}

export function shirtMenuUpdatedEventName(): string {
    return SHIRT_MENU_UPDATED_EVENT;
}

export function withStorageKey(item: ShirtMenuItem): ShirtMenuItem {
    if (item.storageKey.trim().length > 0) {
        return item;
    }

    return {
        ...item,
        storageKey: storageKeyBySlug(item.slug),
    };
}

export function getKnownCatalogBySlug(slug: string): KnownCatalogConfig | null {
    return KNOWN_CATALOGS[slug] ?? null;
}

export function buildShirtCatalogHref(slug: string, title: string): string {
    return buildMenuHref(slug, title);
}

export function updateShirtMenuItemTitle(
    items: ShirtMenuItem[],
    id: string,
    title: string,
): ShirtMenuItem[] {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
        return items;
    }

    return items.map((item) =>
        item.id === id ? { ...item, title: normalizedTitle } : item,
    );
}

export function toggleShirtMenuItem(
    items: ShirtMenuItem[],
    id: string,
): ShirtMenuItem[] {
    return items.map((item) =>
        item.id === id ? { ...item, active: !item.active } : item,
    );
}

export function deleteShirtMenuItem(
    items: ShirtMenuItem[],
    id: string,
): ShirtMenuItem[] {
    return items.filter((item) => item.id !== id);
}

export function hasDuplicateShirtMenuTitle(
    items: ShirtMenuItem[],
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

export function getCatalogStorageKey(slug: string): string {
    return storageKeyBySlug(slug);
}

export function isRemovedMenuTitle(title: string): boolean {
    return REMOVED_MENU_TITLES.has(title.trim());
}

export function ensureMenuItemsStored(items: ShirtMenuItem[]): ShirtMenuItem[] {
    const normalized = normalizeItems(items).map(withStorageKey);

    if (normalized.length > 0) {
        return normalized;
    }

    return defaultMenuItems();
}

export function createShirtMenuItemInput(
    title: string,
    createdBy: string,
): ShirtMenuItem | null {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
        return null;
    }

    const slug = slugify(normalizedTitle);

    if (!slug) {
        return null;
    }

    return {
        id: `${Date.now()}-${slug}`,
        slug,
        title: normalizedTitle,
        createdAt: new Date().toISOString(),
        createdBy,
        active: true,
        storageKey: storageKeyBySlug(slug),
    };
}
