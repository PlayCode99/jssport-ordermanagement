import {
    PANTS_STYLE_LABELS,
    readSizeTier,
    SHIRT_STYLE_LABELS,
    SIZE_TIER_LABELS,
    SIZE_TIERS,
} from './Orders/garmentTables';
import type { GarmentKind, SizeTier } from './Orders/garmentTables';

/**
 * A bill read back the way the floor makes it: one sheet per garment, size
 * tier and length — เสื้อเด็ก · แขนสั้น, กางเกงผู้ใหญ่ · ขายาว — each with its
 * own sizes, its own money and the spec it is sewn from directly underneath.
 *
 * The key is `{garment}_{tier}_{length}`, spelled exactly as the order form,
 * the spec payload and the production sheet spell it, so the counter shows the
 * same sheets production prints and nothing has to translate between them.
 */

export type SpecRow = { label: string; value: string };

export type CounterSheetItem = {
    item_type?: string;
    size_group?: string;
    size_tier?: string | null;
    size_label?: string;
    shirt_style?: string | null;
    pants_style?: string | null;
    quantity?: number;
    unit_price?: number;
    total_price?: number;
};

export type GarmentSheetLine = {
    key: string;
    sizeLabel: string;
    quantity: number;
    unitPrice: number;
    total: number;
};

/**
 * A line saved before lengths were recorded has none, and production files it
 * under 'unspecified' rather than guessing short — the bill never said.
 */
export type SheetLength = 'short' | 'long' | 'sleeveless' | 'unspecified';

export type GarmentSheet = {
    key: string;
    garment: GarmentKind;
    tier: SizeTier;
    length: SheetLength;
    /** e.g. "เสื้อเด็ก · แขนสั้น"; a sheet with no length names none. */
    title: string;
    lines: GarmentSheetLine[];
    quantity: number;
    amount: number;
    spec: SpecRow[];
};

const SHIRT_ITEM_TYPES = ['separate_shirt', 'shirt'];
const PANTS_ITEM_TYPES = ['separate_pants', 'pants'];

const LENGTH_ORDER: readonly SheetLength[] = [
    'short',
    'long',
    'sleeveless',
    'unspecified',
];

/** Kids' sizes run before adults', so a junior sheet using both reads in order. */
const SIZE_ORDER = [
    'JSS',
    'JS',
    'JM',
    'JL',
    'JXL',
    'SS',
    'S',
    'M',
    'L',
    'XL',
    '2XL',
    '3XL',
    '4XL',
    '5XL',
    '6XL',
];

function garmentOf(itemType: string | undefined): GarmentKind | null {
    const type = (itemType ?? '').toLowerCase();

    if (SHIRT_ITEM_TYPES.includes(type)) {
        return 'shirt';
    }

    return PANTS_ITEM_TYPES.includes(type) ? 'pants' : null;
}

function lengthOf(garment: GarmentKind, style: unknown): SheetLength {
    const known = garment === 'pants' ? ['short', 'long'] : LENGTH_ORDER;

    return typeof style === 'string' && known.includes(style as SheetLength)
        ? (style as SheetLength)
        : 'unspecified';
}

function sheetTitle(
    garment: GarmentKind,
    tier: SizeTier,
    length: SheetLength,
): string {
    const name = `${garment === 'pants' ? 'กางเกง' : 'เสื้อ'}${SIZE_TIER_LABELS[tier]}`;
    const lengthLabel =
        length === 'unspecified'
            ? undefined
            : garment === 'pants'
              ? PANTS_STYLE_LABELS[length]
              : SHIRT_STYLE_LABELS[length];

    return lengthLabel ? `${name} · ${lengthLabel}` : name;
}

function sizeRank(label: string): number {
    const rank = SIZE_ORDER.indexOf(label.trim().toUpperCase());

    return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

/**
 * Splits a bill's lines into the sheets they are made on.
 *
 * Lines of one size are gathered into one only where the price agrees too —
 * Form 2 writes a line per person, so twenty-five people in M read as one line
 * of twenty-five, but two prices are two things to bill.
 *
 * Each sheet is given the spec saved under its own key. A bill written before
 * specs were split carries one per garment, and that is the spec every sheet
 * of that garment was sewn from, so it is the one shown.
 */
export function buildGarmentSheets(
    items: CounterSheetItem[],
    batches: Record<string, SpecRow[]> | undefined,
    fallbackShirt: SpecRow[],
    fallbackPants: SpecRow[],
): GarmentSheet[] {
    const sheets = new Map<string, GarmentSheet>();
    const lines = new Map<string, GarmentSheetLine>();

    for (const item of items) {
        const garment = garmentOf(item.item_type);

        if (garment === null) {
            continue;
        }

        const tier = readSizeTier(item.size_tier, item.size_group);
        const length = lengthOf(
            garment,
            garment === 'pants' ? item.pants_style : item.shirt_style,
        );
        const key = `${garment}_${tier}_${length}`;
        const sheet = sheets.get(key) ?? {
            key,
            garment,
            tier,
            length,
            title: sheetTitle(garment, tier, length),
            lines: [],
            quantity: 0,
            amount: 0,
            spec:
                batches?.[key] && batches[key].length > 0
                    ? batches[key]
                    : garment === 'pants'
                      ? fallbackPants
                      : fallbackShirt,
        };
        sheets.set(key, sheet);

        const quantity = Math.max(0, Number(item.quantity ?? 0));
        const unitPrice = Math.max(0, Number(item.unit_price ?? 0));
        // The total the bill was saved with wins, so a receipt reprinted
        // years later still reads what the customer paid.
        const total = Number(item.total_price ?? quantity * unitPrice);
        const sizeLabel = (item.size_label ?? '').trim() || '-';
        const lineKey = `${key}|${sizeLabel}|${unitPrice}`;
        const line = lines.get(lineKey);

        if (line) {
            line.quantity += quantity;
            line.total += total;
        } else {
            const created = {
                key: lineKey,
                sizeLabel,
                quantity,
                unitPrice,
                total,
            };
            lines.set(lineKey, created);
            sheet.lines.push(created);
        }

        sheet.quantity += quantity;
        sheet.amount += total;
    }

    const rankOf = (sheet: GarmentSheet): number[] => [
        sheet.garment === 'pants' ? 1 : 0,
        SIZE_TIERS.indexOf(sheet.tier),
        LENGTH_ORDER.indexOf(sheet.length),
    ];

    return [...sheets.values()]
        .map((sheet) => ({
            ...sheet,
            lines: [...sheet.lines].sort(
                (left, right) =>
                    sizeRank(left.sizeLabel) - sizeRank(right.sizeLabel) ||
                    left.sizeLabel.localeCompare(right.sizeLabel, 'th') ||
                    left.unitPrice - right.unitPrice,
            ),
        }))
        .sort((left, right) => {
            const a = rankOf(left);
            const b = rankOf(right);

            return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
        });
}

/** Pieces and money per garment, and for the bill, across every sheet. */
export function garmentSheetTotals(sheets: GarmentSheet[]): {
    shirt: { quantity: number; amount: number };
    pants: { quantity: number; amount: number };
    quantity: number;
    amount: number;
} {
    const sum = (garment: GarmentKind) =>
        sheets
            .filter((sheet) => sheet.garment === garment)
            .reduce(
                (totals, sheet) => ({
                    quantity: totals.quantity + sheet.quantity,
                    amount: totals.amount + sheet.amount,
                }),
                { quantity: 0, amount: 0 },
            );
    const shirt = sum('shirt');
    const pants = sum('pants');

    return {
        shirt,
        pants,
        quantity: shirt.quantity + pants.quantity,
        amount: shirt.amount + pants.amount,
    };
}

export type SpecGroup = { title: string; rows: SpecRow[] };

/**
 * The spec read the way a person writes one out: what garment it is and what
 * it is made of, how it is shaped, then what goes on it. The labels are the
 * ones the bill is saved with; one the groups do not know still prints, under
 * อื่นๆ, so nothing a bill says is ever left off the paper.
 */
const SPEC_GROUPS: Record<
    GarmentKind,
    Array<{ title: string; labels: string[] }>
> = {
    shirt: [
        {
            title: 'แพทเทิร์น · ผ้า',
            labels: ['แบบเสื้อ', 'แพทเทิร์น', 'เนื้อผ้า', 'สีผ้า'],
        },
        {
            title: 'ทรงเสื้อ',
            labels: [
                'แบบคอ',
                'สีแบบคอ',
                'ปก',
                'แบบสาบ',
                'สีสาบ (ใน)',
                'สีสาบ (นอก)',
                'แบบแขน',
                'ปลายแขน',
                'แบบกุ้น',
                'แบบลา',
            ],
        },
        {
            title: 'สกรีน · ปัก · ซับ',
            labels: [
                'สีสกรีน',
                'ข้อความสกรีน',
                'สีงานปัก',
                'รหัสงานปัก',
                'รายละเอียดปัก',
                'ซับลิเมชั่น',
            ],
        },
    ],
    pants: [
        {
            title: 'แพทเทิร์น · ผ้า',
            labels: ['แบบกางเกง', 'แพทเทิร์น', 'เนื้อผ้า', 'สีผ้า'],
        },
        {
            title: 'ทรงกางเกง',
            labels: ['แบบขา', 'ปลายขา', 'กุ้นกางเกง', 'แบบต่อ', 'แบบลา'],
        },
        {
            title: 'สกรีน · ปัก · ซับ',
            labels: [
                'สีสกรีน',
                'ข้อความสกรีน',
                'สีงานปัก',
                'รหัสงานปัก',
                'รายละเอียดปัก',
                'ซับลิเมชั่น',
            ],
        },
    ],
};

/** A sheet's spec dealt into its groups, empty groups left out. */
export function groupSpecRows(
    rows: SpecRow[],
    garment: GarmentKind,
): SpecGroup[] {
    const groups = SPEC_GROUPS[garment];
    const known = new Set(groups.flatMap((group) => group.labels));
    const byLabel = new Map(rows.map((row) => [row.label, row]));

    return [
        ...groups.map((group) => ({
            title: group.title,
            rows: group.labels
                .map((label) => byLabel.get(label))
                .filter((row): row is SpecRow => row !== undefined),
        })),
        { title: 'อื่นๆ', rows: rows.filter((row) => !known.has(row.label)) },
    ].filter((group) => group.rows.length > 0);
}

/**
 * The settings that are not the same on every sheet of one garment, as
 * `{key}|{label}`. A shirt sewn short-sleeved for the kids and long for the
 * adults usually differs in one or two settings, and those are what the
 * floor must not miss — so they are marked where they are printed.
 */
export function specDifferences(sheets: GarmentSheet[]): Set<string> {
    const marked = new Set<string>();

    for (const garment of ['shirt', 'pants'] as const) {
        const ofGarment = sheets.filter((sheet) => sheet.garment === garment);

        if (ofGarment.length < 2) {
            continue;
        }

        const labels = new Set(
            ofGarment.flatMap((sheet) => sheet.spec.map((row) => row.label)),
        );

        for (const label of labels) {
            const values = ofGarment.map(
                (sheet) =>
                    sheet.spec.find((row) => row.label === label)?.value ?? '',
            );

            if (new Set(values).size > 1) {
                ofGarment.forEach((sheet, index) => {
                    if (values[index] !== '') {
                        marked.add(`${sheet.key}|${label}`);
                    }
                });
            }
        }
    }

    return marked;
}

/** "JM 12 · JL 8" — the sizes a sheet covers, as the spec card states them. */
export function sheetSizeSummary(sheet: GarmentSheet): string {
    const counts = new Map<string, number>();

    for (const line of sheet.lines) {
        counts.set(
            line.sizeLabel,
            (counts.get(line.sizeLabel) ?? 0) + line.quantity,
        );
    }

    return [...counts]
        .map(
            ([size, quantity]) => `${size} ${quantity.toLocaleString('th-TH')}`,
        )
        .join(' · ');
}
