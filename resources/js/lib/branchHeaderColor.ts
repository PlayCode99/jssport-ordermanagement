export type BranchHeaderColorOption = {
    label: string;
    value: string;
};

export const DEFAULT_BRANCH_HEADER_COLOR = '#174395';

export const BRANCH_HEADER_COLOR_OPTIONS: BranchHeaderColorOption[] = [
    { label: 'น้ำเงินกรม', value: '#174395' },
    { label: 'แดงเข้ม', value: '#B91C1C' },
    { label: 'เขียวเข้ม', value: '#166534' },
    { label: 'ม่วงเข้ม', value: '#6D28D9' },
    { label: 'ส้มอิฐ', value: '#C2410C' },
    { label: 'เทาเข้ม', value: '#334155' },
    { label: 'ชมพูเข้ม', value: '#BE185D' },
    { label: 'ฟ้าเข้ม', value: '#0369A1' },
];

type StoredBranchRow = {
    branchName?: unknown;
    headerColor?: unknown;
};

function isHexColor(value: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function normalizeBranchHeaderColor(color: unknown): string {
    if (typeof color !== 'string') {
        return DEFAULT_BRANCH_HEADER_COLOR;
    }

    const trimmed = color.trim();

    return isHexColor(trimmed) ? trimmed : DEFAULT_BRANCH_HEADER_COLOR;
}

export function loadBranchHeaderColorMap(
    storageKey = 'jssport.data-branches',
): Map<string, string> {
    if (typeof window === 'undefined') {
        return new Map<string, string>();
    }

    try {
        const raw = window.localStorage.getItem(storageKey);

        if (!raw) {
            return new Map<string, string>();
        }

        const parsed = JSON.parse(raw) as StoredBranchRow[];

        if (!Array.isArray(parsed)) {
            return new Map<string, string>();
        }

        const map = new Map<string, string>();

        parsed.forEach((item) => {
            const branchName =
                typeof item.branchName === 'string'
                    ? item.branchName.trim()
                    : '';

            if (!branchName) {
                return;
            }

            map.set(branchName, normalizeBranchHeaderColor(item.headerColor));
        });

        return map;
    } catch {
        return new Map<string, string>();
    }
}

export function resolveBranchHeaderColor(
    branchName: string | null | undefined,
    fallbackColor = DEFAULT_BRANCH_HEADER_COLOR,
): string {
    const normalizedBranchName = String(branchName ?? '').trim();

    if (!normalizedBranchName) {
        return normalizeBranchHeaderColor(fallbackColor);
    }

    const map = loadBranchHeaderColorMap();

    return (
        map.get(normalizedBranchName) ??
        normalizeBranchHeaderColor(fallbackColor)
    );
}
