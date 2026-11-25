/**
 * The unit a bill is written in.
 *
 * One table is one garment, cut at one size tier, in one length — and that is
 * also one spec, one set of artwork and one sheet on the production floor. The
 * four used to be separate ideas: a bill carried a single spec for every
 * garment on it, so two shirts cut to different patterns were sewn from the
 * same instructions. Tying them to one key is what lets a bill say that a
 * ประถม long-sleeve polo is a different thing to make than a kids' short-sleeve
 * one.
 *
 * The key is spelled exactly as production spells it, so a table, its pictures
 * and its sheet all answer to the same name without anything having to
 * translate between them.
 */

/**
 * How a garment is cut. A shirt can be sleeveless, which is not a short sleeve
 * at another price but its own set of steps — nothing to attach at the
 * shoulder, an armhole to bind instead. Trousers have only the two lengths.
 */
export type GarmentStyle = string;
export type PantsStyle = string;

export type GarmentKind = 'shirt' | 'pants';

/**
 * The tier a garment is cut at. ประถม - มัธยมต้น has a pattern of its own but no
 * rate of its own: it is billed at the child's rate, which is why the two are
 * kept apart here and joined only by pricingGroupForTier().
 */
export type SizeTier = 'kids' | 'junior' | 'adults';

export const SIZE_TIERS: readonly SizeTier[] = ['kids', 'junior', 'adults'];

export const SIZE_TIER_LABELS: Record<SizeTier, string> = {
    kids: 'เด็ก',
    junior: 'ประถม - มัธยมต้น',
    adults: 'ผู้ใหญ่',
};

/** The rate a tier is billed at. The shop keeps two, not three. */
export function pricingGroupForTier(tier: SizeTier): 'kids' | 'adults' {
    return tier === 'adults' ? 'adults' : 'kids';
}

/** One length as the shop keeps it: the code bills store, and its name. */
export type GarmentStyleOption = {
    code: string;
    name: string;
    is_active: boolean;
};

/**
 * The lengths the shop sells.
 *
 * These used to be three words written here, which meant a shop could not
 * start selling a three-quarter sleeve without a developer. They are the
 * shop's own list now, shared onto every page by the server and poured in
 * once when the app boots.
 *
 * The five the shop has always had are the starting value, so anything that
 * runs before the server has spoken — a unit test, a module loaded on its
 * own — reads exactly as it did before.
 */
const DEFAULT_STYLES: Record<GarmentKind, GarmentStyleOption[]> = {
    shirt: [
        { code: 'short', name: 'แขนสั้น', is_active: true },
        { code: 'long', name: 'แขนยาว', is_active: true },
        { code: 'sleeveless', name: 'แขนกุด', is_active: true },
    ],
    pants: [
        { code: 'short', name: 'ขาสั้น', is_active: true },
        { code: 'long', name: 'ขายาว', is_active: true },
    ],
};

let styleRegistry: Record<GarmentKind, GarmentStyleOption[]> = {
    shirt: [...DEFAULT_STYLES.shirt],
    pants: [...DEFAULT_STYLES.pants],
};

/**
 * Pour in the list the server shared. Called once where the app boots, so
 * every module that labels a length reads the same answer without each page
 * having to pass it down.
 */
export function setGarmentStyles(
    shared:
        | { SHIRT?: GarmentStyleOption[]; PANTS?: GarmentStyleOption[] }
        | null
        | undefined,
): void {
    const shirt = shared?.SHIRT ?? [];
    const pants = shared?.PANTS ?? [];

    styleRegistry = {
        // An empty list means the server said nothing — on a page served
        // before the table existed, say. The old five are better than none.
        shirt: shirt.length > 0 ? shirt : [...DEFAULT_STYLES.shirt],
        pants: pants.length > 0 ? pants : [...DEFAULT_STYLES.pants],
    };
}

/** Every length on file for a garment, switched-off ones included. */
export function garmentStyleOptions(
    garment: GarmentKind,
): readonly GarmentStyleOption[] {
    return styleRegistry[garment];
}

/** The lengths a counter may pick from when writing a bill. */
export function activeGarmentStyleOptions(
    garment: GarmentKind,
): readonly GarmentStyleOption[] {
    return styleRegistry[garment].filter((style) => style.is_active);
}

/**
 * The length codes for a garment, rebuilt from the shop's list each time.
 *
 * Plain arrays and objects rather than anything clever: these are spread,
 * iterated and had their keys read all over the app, and a value that only
 * answers direct lookups breaks all three in ways no type checker catches.
 */
export function shirtStyles(): GarmentStyle[] {
    return styleRegistry.shirt.map((style) => style.code);
}

export function pantsStyles(): PantsStyle[] {
    return styleRegistry.pants.map((style) => style.code);
}

/** The lengths a garment can be cut in, and so the tables it can have. */
export function stylesFor(garment: GarmentKind): readonly GarmentStyle[] {
    return styleRegistry[garment].map((style) => style.code);
}

/** Every length of a garment as {code: name}, for a direct lookup. */
export function styleLabelsOf(garment: GarmentKind): Record<string, string> {
    return Object.fromEntries(
        styleRegistry[garment].map((style) => [style.code, style.name]),
    );
}

export function shirtStyleLabels(): Record<string, string> {
    return styleLabelsOf('shirt');
}

export function pantsStyleLabels(): Record<string, string> {
    return styleLabelsOf('pants');
}

/**
 * What a length is called, for a garment, in a way that never comes back
 * empty.
 *
 * Every screen that names a length used to keep its own table of three, so
 * the first length the shop added itself read as "undefined" on the costing
 * sheet and crashed the room that printed it. There is one lookup now, and
 * it answers for the lengths on file, for 'unspecified' lines recorded
 * before lengths existed, and for a length deleted since a bill was sold at
 * it — that one by its code, which at least says which it was.
 */
export function productionStyleLabel(
    garment: GarmentKind,
    style: string | null | undefined,
): string {
    const code = (style ?? '').trim();

    if (code === '' || code === 'unspecified') {
        return garment === 'pants' ? 'ไม่ระบุขา' : 'ไม่ระบุแขน';
    }

    return styleLabelsOf(garment)[code] ?? code;
}

/**
 * The same, with the garment named in front: "เสื้อแขนสั้น", for a column
 * heading that has to stand on its own.
 */
export function garmentStyleColumnLabel(
    garment: GarmentKind,
    style: string | null | undefined,
): string {
    const prefix = garment === 'pants' ? 'กางเกง' : 'เสื้อ';

    return prefix + productionStyleLabel(garment, style);
}

export function styleLabel(garment: GarmentKind, style: GarmentStyle): string {
    const name = styleLabelsOf(garment)[style];

    if (name !== undefined) {
        return name;
    }

    // A length the shop has since deleted still has to print on the bill
    // that was sold at it, so its code is shown rather than nothing.
    return style === '' ? '' : style;
}

/**
 * The length a saved row was sold at.
 *
 * A bill reopened for editing must come back as what it was. The lengths are
 * the shop's own list, so this cannot be a check against spelled-out codes:
 * reading anything unrecognised as 'short' turned a bill sold at a length the
 * shop added — a three-quarter sleeve — into a short-sleeved one the next time
 * it was saved, which is the bill being rewritten behind the counter's back.
 *
 * So the saved code is kept as it stands. A row carrying a code the shop no
 * longer keeps still reopens as itself; the server's own validation is what
 * decides whether it may be saved again, and it reads the same list.
 */
function readStyle(garment: GarmentKind, value: unknown): string {
    const code = typeof value === 'string' ? value.trim() : '';

    // Checked against the shop's list for THIS garment, so a sleeve length can
    // never come back as a leg length and a table can never ask for sleeveless
    // legs. The list is read rather than spelled out: against three written-in
    // codes, a bill sold at a length the shop added came back as the first one
    // and the next save rewrote the bill into a garment nobody ordered.
    if (stylesFor(garment).includes(code)) {
        return code;
    }

    // Nothing was recorded, or a code this garment does not have. The first
    // length the shop lists is the one it sells by default, and 'short' is
    // what that has always been.
    return stylesFor(garment)[0] ?? 'short';
}

export function readShirtStyle(value: unknown): GarmentStyle {
    return readStyle('shirt', value);
}

export function readPantsStyle(value: unknown): PantsStyle {
    return readStyle('pants', value);
}

/**
 * The tier a saved line was cut at. Lines written before tiers existed name
 * only the rate they were billed at, and that is the tier they were cut at.
 */
export function readSizeTier(tier: unknown, sizeGroup: unknown): SizeTier {
    if (tier === 'kids' || tier === 'junior' || tier === 'adults') {
        return tier;
    }

    return sizeGroup === 'kids' ? 'kids' : 'adults';
}

export type ShirtSpecsForm = {
    shirt_type_id: string;
    pattern_id: string;
    fabric_id: string;
    fabric_color_id: string;
    neck_style_id: string;
    neck_color_id: string;
    collar_id: string;
    placket_style_id: string;
    placket_outer_color_id: string;
    placket_inner_color_id: string;
    sleeve_cuff_id: string;
    /**
     * Retired from the form: no longer asked for and no longer shown. The
     * value bills were saved with is still carried in and out, so reopening
     * one of the bills that has it does not quietly erase it.
     */
    panel_style_id: string;
    screen_color_id: string;
    embroidery_color_id: string;
    sublimation_id: string;
    sleeve_style_text: string;
    piping_style_text: string;
    stripe_style_text: string;
    screen_text: string;
    embroidery_code_text: string;
    embroidery_note_text: string;
};

export type PantsSpecsForm = {
    pants_type_id: string;
    pattern_id: string;
    fabric_id: string;
    fabric_color_id: string;
    leg_style_id: string;
    leg_cuff_id: string;
    screen_color_id: string;
    embroidery_color_id: string;
    sublimation_id: string;
    seat_style_text: string;
    panel_style_text: string;
    stripe_style_text: string;
    screen_text: string;
    embroidery_code_text: string;
    embroidery_note_text: string;
};

export function emptyShirtSpecs(shirtTypeId = ''): ShirtSpecsForm {
    return {
        shirt_type_id: shirtTypeId,
        pattern_id: '',
        fabric_id: '',
        fabric_color_id: '',
        neck_style_id: '',
        neck_color_id: '',
        collar_id: '',
        placket_style_id: '',
        placket_outer_color_id: '',
        placket_inner_color_id: '',
        sleeve_cuff_id: '',
        panel_style_id: '',
        screen_color_id: '',
        embroidery_color_id: '',
        sublimation_id: '',
        sleeve_style_text: '',
        piping_style_text: '',
        stripe_style_text: '',
        screen_text: '',
        embroidery_code_text: '',
        embroidery_note_text: '',
    };
}

export function emptyPantsSpecs(pantsTypeId = ''): PantsSpecsForm {
    return {
        pants_type_id: pantsTypeId,
        pattern_id: '',
        fabric_id: '',
        fabric_color_id: '',
        leg_style_id: '',
        leg_cuff_id: '',
        screen_color_id: '',
        embroidery_color_id: '',
        sublimation_id: '',
        seat_style_text: '',
        panel_style_text: '',
        stripe_style_text: '',
        screen_text: '',
        embroidery_code_text: '',
        embroidery_note_text: '',
    };
}

export type GarmentTableRow = {
    id: string;
    size_label: string;
    quantity: number;
    unit_price: number;
};

type TableBase = {
    id: string;
    tier: SizeTier;
    rows: GarmentTableRow[];
};

export type ShirtTable = TableBase & {
    garment: 'shirt';
    style: GarmentStyle;
    specs: ShirtSpecsForm;
};

export type PantsTable = TableBase & {
    garment: 'pants';
    /** Spelled apart from the shirt's so a table cannot ask for sleeveless legs. */
    style: PantsStyle;
    specs: PantsSpecsForm;
};

export type GarmentTable = ShirtTable | PantsTable;

/** The one name a table, its pictures and its production sheet all share. */
export function garmentTableKey(table: GarmentTable): string {
    return `${table.garment}_${table.tier}_${table.style}`;
}

/** The heading on the table's card, which names what the counter is filling in. */
export function garmentTableTitle(table: GarmentTable): string {
    const garment = table.garment === 'pants' ? 'ตารางกางเกง' : 'ตารางเสื้อ';

    return `${garment}ไซซ์${SIZE_TIER_LABELS[table.tier]} · ${styleLabel(table.garment, table.style)}`;
}

/**
 * What the production floor calls this sheet, spelled exactly as the board and
 * the costing spell it. The counter pins artwork by this name, so the two have
 * to read the same or nobody can tell which picture belongs to which sheet.
 */
const BATCH_GARMENT_LABELS: Record<GarmentKind, Record<SizeTier, string>> = {
    shirt: {
        kids: 'เสื้อไซต์เด็ก',
        junior: 'เสื้อไซต์ประถม - มัธยมต้น',
        adults: 'เสื้อไซต์ผู้ใหญ่',
    },
    pants: {
        kids: 'กางเกงเด็ก',
        junior: 'กางเกงประถม - มัธยมต้น',
        adults: 'กางเกงผู้ใหญ่',
    },
};

export function garmentTableBatchLabel(table: GarmentTable): string {
    return `${BATCH_GARMENT_LABELS[table.garment][table.tier]} ${styleLabel(table.garment, table.style)}`;
}

/** A fresh table always opens with somewhere to type. */
export const NEW_GARMENT_TABLE_ROWS = 3;

export function createGarmentTableRow(sizeLabel = ''): GarmentTableRow {
    return {
        id: uid('row'),
        size_label: sizeLabel,
        quantity: 0,
        unit_price: 0,
    };
}

export function createShirtTable(
    tier: SizeTier,
    style: GarmentStyle,
    specs: ShirtSpecsForm,
): ShirtTable {
    return {
        id: uid(`table-shirt-${tier}-${style}`),
        garment: 'shirt',
        tier,
        style,
        rows: Array.from({ length: NEW_GARMENT_TABLE_ROWS }, () =>
            createGarmentTableRow(),
        ),
        specs,
    };
}

export function createPantsTable(
    tier: SizeTier,
    style: PantsStyle,
    specs: PantsSpecsForm,
): PantsTable {
    return {
        id: uid(`table-pants-${tier}-${style}`),
        garment: 'pants',
        tier,
        style,
        rows: Array.from({ length: NEW_GARMENT_TABLE_ROWS }, () =>
            createGarmentTableRow(),
        ),
        specs,
    };
}

/**
 * Whether a bill already has the sheet a new table would name. Two tables with
 * the same key would be two specs for one sheet, and nothing could say which
 * of them the floor is meant to sew from.
 */
export function hasGarmentTableFor(
    tables: GarmentTable[],
    garment: GarmentKind,
    tier: SizeTier,
    style: GarmentStyle,
): boolean {
    return tables.some(
        (table) =>
            table.garment === garment &&
            table.tier === tier &&
            table.style === style,
    );
}

export function isBlankGarmentTableRow(row: GarmentTableRow): boolean {
    return (
        row.size_label.trim() === '' && row.quantity <= 0 && row.unit_price <= 0
    );
}

export function garmentTableRowTotal(row: GarmentTableRow): number {
    return Math.max(row.quantity, 0) * Math.max(row.unit_price, 0);
}

export function garmentTableTotals(table: GarmentTable): {
    quantity: number;
    amount: number;
} {
    return table.rows.reduce(
        (totals, row) => ({
            quantity: totals.quantity + Math.max(row.quantity, 0),
            amount: totals.amount + garmentTableRowTotal(row),
        }),
        { quantity: 0, amount: 0 },
    );
}

export type GarmentTableItem = {
    item_type: string;
    /** The rate the line is billed at, of which the shop keeps two. */
    size_group: 'kids' | 'adults';
    /** The tier it is cut at, of which there are three. */
    size_tier: SizeTier;
    size_label: string;
    shirt_style?: GarmentStyle;
    pants_style?: PantsStyle;
    quantity: number;
    unit_price: number;
};

/**
 * The lines a bill is sent to the server as. A row with nothing in it is not a
 * line.
 *
 * A price of nothing IS a line. The shop gives garments away — a replacement
 * for one it got wrong, a sample, the extra shirt thrown in on a big order —
 * and the floor still has to cut and sew them, so they belong on the bill and
 * on the sheet at ฿0. Reading an unpriced row as no row at all meant the
 * counter typed it, saw it in the table, and watched it vanish on save.
 */
export function buildItemsFromGarmentTables(
    tables: GarmentTable[],
): GarmentTableItem[] {
    return tables.flatMap((table) =>
        table.rows
            .filter((row) => row.quantity > 0)
            .map((row) => ({
                item_type:
                    table.garment === 'pants'
                        ? 'separate_pants'
                        : 'separate_shirt',
                size_group: pricingGroupForTier(table.tier),
                size_tier: table.tier,
                size_label: row.size_label.trim() || '-',
                ...(table.garment === 'pants'
                    ? { pants_style: table.style }
                    : { shirt_style: table.style }),
                quantity: Math.max(row.quantity, 0),
                unit_price: Math.max(row.unit_price, 0),
            })),
    );
}

export type GarmentTableBatch = {
    key: string;
    garment: GarmentKind;
    label: string;
    quantity: number;
};

/**
 * The sheets a bill will produce, in the order they come off the printer:
 * shirts before trousers, youngest tier first, short before long. Derived from
 * the tiers and lengths themselves, so a tier added later takes its place
 * without anyone having to remember a list.
 */
function batchRank(key: string): number {
    const order: string[] = [];

    for (const garment of ['shirt', 'pants'] as const) {
        for (const tier of SIZE_TIERS) {
            for (const style of stylesFor(garment)) {
                order.push(`${garment}_${tier}_${style}`);
            }
        }
    }

    return order.indexOf(key);
}

export function resolveGarmentTableBatches(
    tables: GarmentTable[],
): GarmentTableBatch[] {
    const totals = new Map<string, GarmentTableBatch>();

    for (const table of tables) {
        const { quantity } = garmentTableTotals(table);

        // A table nobody is billed for is not a sheet, and asking for artwork
        // for it would be asking for a picture that never gets printed.
        if (quantity <= 0) {
            continue;
        }

        const key = garmentTableKey(table);
        const existing = totals.get(key);

        if (existing) {
            existing.quantity += quantity;

            continue;
        }

        totals.set(key, {
            key,
            garment: table.garment,
            label: garmentTableBatchLabel(table),
            quantity,
        });
    }

    return [...totals.values()].sort(
        (left, right) => batchRank(left.key) - batchRank(right.key),
    );
}

function uid(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function asString(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    return typeof value === 'string' ? value : String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/**
 * Reads a saved spec onto the shape the form works in. Only the fields the
 * form knows are taken, and a field the bill never carried keeps whatever the
 * fallback holds — so a spec that arrives half-filled is completed rather than
 * blanked.
 */
function readSpecsOnto<T extends Record<string, string>>(
    shape: T,
    raw: unknown,
): T {
    const source = asRecord(raw);
    const result = { ...shape };

    for (const field of Object.keys(shape) as Array<keyof T & string>) {
        if (source[field] !== undefined && source[field] !== null) {
            result[field] = asString(source[field]) as T[keyof T & string];
        }
    }

    return result;
}

export function readShirtSpecs(
    raw: unknown,
    fallback: ShirtSpecsForm = emptyShirtSpecs(),
): ShirtSpecsForm {
    return readSpecsOnto(fallback, raw);
}

export function readPantsSpecs(
    raw: unknown,
    fallback: PantsSpecsForm = emptyPantsSpecs(),
): PantsSpecsForm {
    return readSpecsOnto(fallback, raw);
}

/** Every table's spec, keyed by the sheet it belongs to. */
export function buildGarmentSpecsPayload(
    tables: GarmentTable[],
): Record<string, ShirtSpecsForm | PantsSpecsForm> {
    const payload: Record<string, ShirtSpecsForm | PantsSpecsForm> = {};

    for (const table of tables) {
        payload[garmentTableKey(table)] = table.specs;
    }

    return payload;
}

/**
 * A bill written before specs were split carries one shirt spec and one
 * trouser spec for the whole order. Reopening it has to give every table the
 * spec it was actually sewn from, which is that single one — anything else
 * would invent instructions the shop never wrote.
 */
export function specsForKey(
    decoded: Record<string, unknown>,
    key: string,
    garment: GarmentKind,
    defaults: { shirt: ShirtSpecsForm; pants: PantsSpecsForm },
): ShirtSpecsForm | PantsSpecsForm {
    const perTable = asRecord(decoded.garment_specs);
    const legacy =
        garment === 'pants' ? decoded.pants_specs : decoded.shirt_specs;
    const raw = perTable[key] ?? legacy;

    return garment === 'pants'
        ? readPantsSpecs(raw, defaults.pants)
        : readShirtSpecs(raw, defaults.shirt);
}

/**
 * The spec a bill is written from when only one will do.
 *
 * `order_specifications` keeps a handful of flat columns — pattern, fabric,
 * collar and so on — and the server still requires them. Forms 1 and 4 keep
 * their spec on the tables, so reading the retired bill-wide card for those
 * columns sent nothing at all and the bill was refused for a pattern and a
 * fabric the counter had in fact filled in. The first table of each garment
 * stands for the bill, which is what the whole bill used to be written as.
 *
 * Forms 2 and 3 sell one spec for the whole bill and keep using the card.
 */
export function representativeSpecs(
    usesTables: boolean,
    tables: GarmentTable[],
    shirtSpecs: ShirtSpecsForm,
    pantsSpecs: PantsSpecsForm,
): { shirt: ShirtSpecsForm; pants: PantsSpecsForm } {
    if (!usesTables) {
        return { shirt: shirtSpecs, pants: pantsSpecs };
    }

    const firstShirt = tables.find((table) => table.garment === 'shirt');
    const firstPants = tables.find((table) => table.garment === 'pants');

    return {
        shirt: firstShirt?.garment === 'shirt' ? firstShirt.specs : shirtSpecs,
        pants: firstPants?.garment === 'pants' ? firstPants.specs : pantsSpecs,
    };
}

export type SavedOrderItem = {
    item_type?: string | null;
    size_group?: string | null;
    size_tier?: string | null;
    size_label?: string | null;
    shirt_style?: string | null;
    pants_style?: string | null;
    quantity?: number | string | null;
    unit_price?: number | string | null;
};

const SHIRT_ITEM_TYPES = ['separate_shirt', 'shirt'];
const PANTS_ITEM_TYPES = ['separate_pants', 'pants'];

function garmentOfItem(itemType: string): GarmentKind | null {
    const normalized = itemType.toLowerCase();

    if (SHIRT_ITEM_TYPES.includes(normalized)) {
        return 'shirt';
    }

    return PANTS_ITEM_TYPES.includes(normalized) ? 'pants' : null;
}

function asNumber(value: unknown): number {
    const parsed = Number(value ?? 0);

    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Rebuilds the tables a saved bill was written on.
 *
 * Lines are grouped by the sheet they belong to, so a bill that mixed two
 * lengths in one table reopens as the two tables it was always going to be
 * cut as. Order follows the printer, not the order the lines happen to sit in
 * the database.
 */
export function hydrateGarmentTables(
    items: SavedOrderItem[],
    decoded: Record<string, unknown>,
    defaults: { shirt: ShirtSpecsForm; pants: PantsSpecsForm },
): GarmentTable[] {
    const tables = new Map<string, GarmentTable>();

    for (const item of items) {
        const garment = garmentOfItem(asString(item.item_type));

        if (garment === null) {
            continue;
        }

        const tier = readSizeTier(item.size_tier, item.size_group);
        const style =
            garment === 'pants'
                ? readPantsStyle(item.pants_style)
                : readShirtStyle(item.shirt_style);
        const key = `${garment}_${tier}_${style}`;

        let table = tables.get(key);

        if (!table) {
            table =
                garment === 'pants'
                    ? {
                          id: uid(`table-${key}`),
                          garment: 'pants',
                          tier,
                          style: style as PantsStyle,
                          rows: [],
                          specs: specsForKey(
                              decoded,
                              key,
                              'pants',
                              defaults,
                          ) as PantsSpecsForm,
                      }
                    : {
                          id: uid(`table-${key}`),
                          garment: 'shirt',
                          tier,
                          style,
                          rows: [],
                          specs: specsForKey(
                              decoded,
                              key,
                              'shirt',
                              defaults,
                          ) as ShirtSpecsForm,
                      };
            tables.set(key, table);
        }

        table.rows.push({
            id: uid(`row-${key}`),
            size_label: asString(item.size_label),
            quantity: Math.max(0, asNumber(item.quantity)),
            unit_price: asNumber(item.unit_price),
        });
    }

    return [...tables.values()].sort(
        (left, right) =>
            batchRank(garmentTableKey(left)) -
            batchRank(garmentTableKey(right)),
    );
}
