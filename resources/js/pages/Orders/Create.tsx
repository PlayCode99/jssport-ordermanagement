import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    CalendarClock,
    ChevronDown,
    Copy,
    ImagePlus,
    Link2,
    Link2Off,
    Loader2,
    Plus,
    Shirt,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import type {
    ChangeEvent,
    FormEvent,
    KeyboardEvent,
    ReactNode,
    WheelEvent,
} from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArtworkBatchDialog,
    ARTWORK_SCOPE_ALL,
    batchesMissingArtwork,
    savedImageScope,
} from '@/components/domain/orders/ArtworkBatchDialog';
import type { ArtworkGarment } from '@/components/domain/orders/ArtworkBatchDialog';
import { DeliveryDatePicker } from '@/components/domain/orders/DeliveryDatePicker';
import type { DeliveryDateLoad } from '@/components/domain/orders/DeliveryDatePicker';
import { MasterDataComboBox } from '@/components/domain/orders/MasterDataComboBox';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useWebpCompress } from '@/hooks/useWebpCompress';
import {
    PANTS_STYLE_LABELS,
    PANTS_STYLES,
    readPantsStyle,
    readShirtStyle,
    SHIRT_STYLE_LABELS,
    SHIRT_STYLES,
    SIZE_TIER_LABELS,
    SIZE_TIERS,
    pricingGroupForTier,
    readSizeTier,
    stylesFor,
    styleLabel,
    buildGarmentSpecsPayload,
    buildItemsFromGarmentTables,
    createGarmentTableRow,
    createPantsTable,
    createShirtTable,
    emptyPantsSpecs,
    emptyShirtSpecs,
    garmentTableKey,
    garmentTableRowTotal,
    garmentTableTitle,
    garmentTableTotals,
    hasGarmentTableFor,
    hydrateGarmentTables,
    representativeSpecs,
    resolveGarmentTableBatches,
    specsForKey,
} from './garmentTables';
import type {
    GarmentKind,
    GarmentStyle,
    GarmentTable,
    GarmentTableRow,
    PantsSpecsForm,
    PantsStyle,
    ShirtSpecsForm,
    SizeTier,
} from './garmentTables';

type DeliveryMethod = 'pickup' | 'shipping' | 'onsite';
type PaymentMethod = 'cash' | 'transfer';
type PaymentStatus = 'deposit' | 'pending' | 'paid';
type SpecTab = 'shirt' | 'pants';
type SizeTableType = 'kids' | 'adults';
type SizeFormMode = 'matrix' | 'individual' | 'sports_day' | 'pe_uniform';

/**
 * ชุดพละ is Form 1 under another name on the bill: the same size tables, the
 * same artwork dialog, the same production sheets. The mode is kept so a bill
 * reopens as what it was sold as, not because the form behaves differently.
 */
export function usesSizeTables(mode: SizeFormMode): boolean {
    return mode === 'matrix' || mode === 'pe_uniform';
}

/**
 * Every form takes its artwork through the one Art Work dialog, pinned to the
 * sheets the bill will produce. The modes differ only in where the sheets are
 * read from — a size table, a list of people, or a set of colour houses.
 */
export function usesArtworkBatches(mode: SizeFormMode): boolean {
    return (
        usesSizeTables(mode) || mode === 'individual' || mode === 'sports_day'
    );
}

type OptionItem = {
    id: number;
    name: string;
    /** False for a catalog row hidden from the choices; see MasterDataOption. */
    active?: boolean;
    /**
     * For a garment type, the length it is cut in. A table is one length, so
     * it only offers the types that are made in it.
     */
    style?: string | null;
};

/**
 * The garment types a table can be made from: the ones cut in its length.
 * Whatever the bill already names stays on the list however it is
 * categorised, so reopening an older bill never quietly drops its type.
 */
function garmentTypesForStyle(
    types: OptionItem[],
    style: GarmentStyle,
    selectedId: string,
): OptionItem[] {
    return types.filter(
        (type) => type.style === style || String(type.id) === selectedId,
    );
}

type CustomerOption = {
    id: number;
    name: string;
    code: string;
    phone: string | null;
    line_fb: string | null;
};

type BranchOption = {
    id: number;
    name: string;
    code: string;
    phone: string | null;
};

type CatalogMap = Record<string, OptionItem[]>;

/**
 * Which catalog each spec dropdown reads and writes, per garment, keyed by the
 * field's "source" name. The server owns this table (OrderController) and
 * sends it with the form so the two sides cannot drift apart.
 */
type CatalogKeyMap = Record<string, string>;

/**
 * What this form has done to a catalog since the page loaded: rows added,
 * renamed or hidden from the manage dialog. Applied over the options the
 * server sent so every field backed by the same catalog sees the change at
 * once, without a reload.
 */
type CatalogPatch = {
    added: OptionItem[];
    renamed: Record<string, string>;
    hidden: number[];
};

const EMPTY_CATALOG_PATCH: CatalogPatch = {
    added: [],
    renamed: {},
    hidden: [],
};

function applyCatalogPatch(
    baseOptions: OptionItem[],
    patch: CatalogPatch | undefined,
): OptionItem[] {
    if (!patch) {
        return baseOptions;
    }

    const merged = baseOptions.map((option) => {
        const renamed = patch.renamed[String(option.id)];
        const hidden = patch.hidden.includes(option.id);

        if (renamed === undefined && !hidden) {
            return option;
        }

        return {
            ...option,
            name: renamed ?? option.name,
            active: hidden ? false : option.active,
        };
    });

    for (const item of patch.added) {
        if (!merged.some((existing) => existing.id === item.id)) {
            merged.push(
                patch.hidden.includes(item.id)
                    ? { ...item, active: false }
                    : item,
            );
        }
    }

    return merged;
}

type SavedArtwork = { id: number; url: string };

/**
 * How a garment is cut. A shirt can be sleeveless, which is not a short sleeve
 * at another price but its own set of steps — nothing to attach at the
 * shoulder, an armhole to bind instead — so it prints its own sheet and is
 * priced from its own card. Trousers have only the two lengths.
 */
export {
    PANTS_STYLES,
    readPantsStyle,
    readShirtStyle,
    SHIRT_STYLES,
} from './garmentTables';

type SizeRowForm = {
    id: string;
    size_label: string;
    // Chosen once per row on the set columns. The separate-piece columns bill at
    // their own prices but are the same garment, so they inherit these.
    shirt_style: GarmentStyle;
    pants_style: GarmentStyle;
    set_shirt_qty: number;
    set_pants_qty: number;
    set_price: number;
    separate_shirt_qty: number;
    separate_pants_qty: number;
    separate_shirt_price: number;
    separate_pants_price: number;
};

/**
 * One line of a garment table on Form 1 / Form 4: a size, the length it is cut
 * in, how many, and what a single piece costs. Shirts and trousers keep their
 * own lists, so a bill can order four shirt sizes against two trouser sizes.
 */
type GarmentRowForm = {
    id: string;
    size_label: string;
    style: GarmentStyle;
    quantity: number;
    unit_price: number;
};

/** Which of a table's two garment lists a row belongs to. */
type GarmentList = 'shirt_rows' | 'pants_rows';

type SizeTableForm = {
    id: string;
    table_type: SizeTableType;
    title: string;
    /**
     * Shirts and trousers, each priced per piece. This is what Form 1 and
     * Form 4 bill on.
     */
    shirt_rows: GarmentRowForm[];
    pants_rows: GarmentRowForm[];
    /**
     * The set-and-separate columns bills were written on before the set was
     * retired. Kept so a bill that was saved with sets still opens, prints and
     * totals exactly as it was sold; new bills never fill this in.
     */
    rows: SizeRowForm[];
};

/** A keeper wears the same shirt as the team in a different colour. */
export type IndividualRole = 'player' | 'keeper';

export const INDIVIDUAL_ROLE_LABELS: Record<IndividualRole, string> = {
    player: 'ผู้เล่น',
    keeper: 'ผู้รักษาประตู',
};

type PersonalizationRowForm = {
    id: string;
    role: IndividualRole;
    name: string;
    size_group: 'kids' | 'adults';
    size: string;
    /**
     * Sleeve length for this person's shirt. Production batches by it, so a
     * keeper in long sleeves gets sewn on their own sheet.
     */
    shirt_style: GarmentStyle;
    number: string;
    quantity: number;
    unit_price: number;
    /** Pants for this person, used only when the order includes pants. */
    pants_size: string;
    /** Leg length for this person's pants, batched like the sleeve above. */
    pants_style: GarmentStyle;
    /** Printed on the pants, which is not always the shirt number. */
    pants_number: string;
    pants_quantity: number;
    pants_unit_price: number;
};

/**
 * Form 3 (กีฬาสี). One order, several colour houses that share the same shirt
 * spec but each have their own fabric colour and their own size breakdown.
 * Shirt and pants carry their own price, exactly like the "แยกชิ้น" half of
 * Form 1, so the money maths below is the same shape as rowSeparateTotal().
 */
type SportsDayRowForm = {
    id: string;
    /**
     * The size range the row is cut in. ประถม - มัธยมต้น is its own sheet on
     * the floor and is charged at the child's rate, as on Forms 1 and 4.
     */
    size_group: SizeTier;
    size_label: string;
    shirt_qty: number;
    shirt_price: number;
    pants_qty: number;
    pants_price: number;
};

type SportsDayGroupForm = {
    id: string;
    team_name: string;
    fabric_color_id: string;
    rows: SportsDayRowForm[];
    /**
     * Artwork saved against this house before artwork was pinned to sheets.
     * Kept with its media id so an old bill's pictures can still be taken off.
     */
    saved_artwork: SavedArtwork[];
};

type OrderLineItemPayload = {
    quantity: number;
    unit_price: number;
    discount_id: number | null;
};

type OrderCreateFormData = {
    customer_id: string;
    branch_id: string;
    customer_name: string;
    customer_phone: string;
    contact_detail: string;
    job_type_id: string;
    job_name: string;
    billing_date: string;
    billing_time: string;
    due_date: string;
    delivery_method: DeliveryMethod;
    shipping_address: string;
    discount_percent: string;
    deposit_amount: number;
    payment_method: PaymentMethod;
    payment_status: PaymentStatus;
    shirt_artwork_files: File[];
    /**
     * Artwork drawn for one production batch only, keyed by that batch.
     * Files outside this go on every sheet of their garment, which is how
     * most bills are drawn up.
     */
    shirt_artwork_scoped: Record<string, File[]>;
    pants_artwork_scoped: Record<string, File[]>;
    /**
     * Form 3: pictures newly attached to a colour house, keyed by the house's
     * id so they stay with it when houses are added or removed. They are sent
     * by the house's position, which is what the server and the production
     * sheet key a house by.
     */
    sports_day_artwork_files: Record<string, File[]>;
    /** Batch each saved image is pinned to, keyed by media id. '' = every sheet. */
    artwork_scopes: Record<string, string>;
    pants_artwork_files: File[];
    // Media ids of saved artwork the user removed while editing.
    removed_media_ids: number[];
    transfer_slip_file: File | null;
    /**
     * The spec a bill was written with before each table carried its own.
     * Still saved so a reader that has not been taught about per-table specs
     * keeps seeing something sensible, and still shown by Forms 2 and 3, which
     * sell one garment spec for the whole bill.
     */
    shirt_specs: ShirtSpecsForm;
    pants_specs: PantsSpecsForm;
    /**
     * One table per garment, tier and length — which is also one spec, one set
     * of artwork and one production sheet. Forms 1 and 4 are written on these.
     */
    garment_tables: GarmentTable[];
    /**
     * The set-and-separate rows bills were written on before the set was
     * retired. Carried so such a bill still opens, prints and totals exactly
     * as it was sold; new bills never fill this in.
     */
    size_tables: SizeTableForm[];
    personalization_rows: PersonalizationRowForm[];
    /**
     * Shirt colour for the keepers. One per bill, not per person: the spec is
     * the team's, and only the colour changes.
     */
    individual_keeper_color: string;
    /** Form 2 only: the customer also wants pants for each person. */
    individual_include_pants: boolean;
    /**
     * Form 2's spec per production sheet, keyed `{garment}_{tier}_{length}`
     * exactly as Form 1's tables are — a long-sleeved shirt is sewn from
     * different instructions than a short one, so each sheet the list of
     * people produces carries its own. A sheet nobody has filled in yet is
     * absent and is read from its seed (see sheetSpecFor in the page).
     */
    individual_sheet_specs: Record<string, ShirtSpecsForm | PantsSpecsForm>;
    sports_day_groups: SportsDayGroupForm[];
    line_items: OrderLineItemPayload[];
};

type EditOrderPayload = {
    id?: number;
    order_code?: string | null;
    /** Set when the form was opened via "เปิดบิลอีกครั้ง" — the id of the source order. */
    duplicate_from_id?: number | null;
    customer_id?: number | null;
    branch_id?: number | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    contact_detail?: string | null;
    job_name?: string | null;
    job_type?: string | null;
    billing_date?: string | null;
    billing_time?: string | null;
    due_date?: string | null;
    delivery_method?: string | null;
    shipping_address?: string | null;
    discount_percent?: string | number | null;
    deposit_amount?: number | string | null;
    payment_method?: string | null;
    order_status?: string | null;
    artwork_url?: string | null;
    shirt_artwork_urls?: string[] | null;
    sports_day_artwork_urls?: Record<string, string[]> | null;
    sports_day_artwork_media?: Record<string, SavedArtwork[]> | null;
    pe_uniform_artwork_media?: Record<string, SavedArtwork[]> | null;
    pe_uniform_artwork_urls?: Record<string, string[]> | null;
    pants_artwork_urls?: string[] | null;
    reference_designs?: string[] | null;
    artwork_media?: SavedArtwork[] | null;
    shirt_artwork_media?: SavedArtwork[] | null;
    pants_artwork_media?: SavedArtwork[] | null;
    reference_design_media?: SavedArtwork[] | null;
    items?: Array<{
        item_type?: string | null;
        size_group?: string | null;
        size_label?: string | null;
        shirt_style?: string | null;
        pants_style?: string | null;
        quantity?: number | null;
        unit_price?: number | null;
        total_price?: number | null;
    }>;
    specification?: {
        pattern_id?: number | string | null;
        fabric_id?: number | string | null;
        neck_style_id?: number | string | null;
        screen_print_detail?: string | null;
        decoded?: Record<string, unknown> | null;
    } | null;
};

type OrderCreatePageProps = {
    customers?: CustomerOption[];
    branches?: BranchOption[];
    jobTypes?: OptionItem[];
    jobNames?: OptionItem[];
    shirtCatalogs?: CatalogMap;
    pantsCatalogs?: CatalogMap;
    shirtCatalogKeys?: CatalogKeyMap;
    pantsCatalogKeys?: CatalogKeyMap;
    shirtTypes?: OptionItem[];
    pantsTypes?: OptionItem[];
    kidsSizes?: string[];
    juniorSizes?: string[];
    adultSizes?: string[];
    defaultBranchId?: number | null;
    dailyProductionCapacity?: number;
    deliveryDateLoads?: DeliveryDateLoad[];
    order?: EditOrderPayload | null;
};

const discountPercentOptions = [
    '0',
    '5',
    '10',
    '15',
    '20',
    '25',
    '30',
    '35',
    '40',
    '45',
    '50',
];
const SIZE_LABEL_MAX_LENGTH = 50;

type RequestOrderItem = {
    item_type: string;
    /** The rate the line is billed at. */
    size_group: 'kids' | 'adults' | 'oversize';
    /**
     * The tier it is cut at, which is what the floor batches by. Absent on the
     * forms that do not offer tiers, and read there as the rate it was billed
     * at — the tier it was cut at.
     */
    size_tier?: SizeTier;
    size_label: string;
    shirt_style?: GarmentStyle;
    pants_style?: GarmentStyle;
    quantity: number;
    unit_price: number;
};

/**
 * Which catalog each spec field picks from. Used to record the master-data name
 * an order was saved with, so renaming a colour later cannot rewrite what an
 * already-printed work sheet says.
 */
const SPEC_FIELD_CATALOG_SOURCE: Record<string, string> = {
    pattern_id: 'patterns',
    fabric_id: 'fabrics',
    fabric_color_id: 'fabric_colors',
    neck_style_id: 'neck_styles',
    neck_color_id: 'neck_colors',
    collar_id: 'collars',
    placket_style_id: 'placket_styles',
    placket_outer_color_id: 'placket_outer_colors',
    placket_inner_color_id: 'placket_inner_colors',
    sleeve_cuff_id: 'sleeve_cuffs',
    panel_style_id: 'panel_styles',
    screen_color_id: 'screen_colors',
    embroidery_color_id: 'embroidery_colors',
    sublimation_id: 'sublimations',
    leg_style_id: 'leg_styles',
    leg_cuff_id: 'leg_cuffs',
};

function snapshotSpecLabels(
    specs: Record<string, string>,
    catalogs: CatalogMap,
): Record<string, string> {
    const labels: Record<string, string> = {};

    Object.entries(SPEC_FIELD_CATALOG_SOURCE).forEach(([field, source]) => {
        const selected = specs[field];

        if (!selected || selected === '-') {
            return;
        }

        const match = (catalogs[source] ?? []).find(
            (option) => String(option.id) === String(selected),
        );

        if (match?.name) {
            labels[field] = match.name;
        }
    });

    return labels;
}

function uid(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function currentDateISO(): string {
    return new Date().toISOString().slice(0, 10);
}

// Local wall-clock time (not UTC) — this is shown to staff as "what time is
// it right now", so it must match the clock on the wall, not toISOString().
function currentTimeHHmm(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
}

function toNumber(value: string): number {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
    return value.toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export { PANTS_STYLE_LABELS, SHIRT_STYLE_LABELS } from './garmentTables';

/**
 * Number inputs default to 0, and a literal "0" sitting in the box means every
 * entry has to be cleared first. Showing an empty box with a 0 placeholder keeps
 * the value semantics identical while making the field typeable.
 */
export function numberFieldValue(value: number): string | number {
    return value === 0 ? '' : value;
}

const EMPTY_INVALID_FIELDS: ReadonlySet<string> = new Set<string>();

/** The three price columns a size table can hold the same value down. */
const PRICE_COLUMNS = [
    'set_price',
    'separate_shirt_price',
    'separate_pants_price',
] as const;

type PriceColumn = (typeof PRICE_COLUMNS)[number];

/** The two price columns a colour house can hold one price down. */
type SportsDayPriceColumn = 'shirt_price' | 'pants_price';

/**
 * Columns the "รายตัว" list can hold the first person's value down. A team
 * normally shares one price and one sleeve length, with the odd person
 * differing, so every one of these starts linked and can be broken per column.
 */
const INDIVIDUAL_LINKED_COLUMNS = [
    'unit_price',
    'pants_unit_price',
    'shirt_style',
    'pants_style',
] as const;

type IndividualLinkedColumn = (typeof INDIVIDUAL_LINKED_COLUMNS)[number];

function isIndividualLinkedColumn(
    key: PropertyKey,
): key is IndividualLinkedColumn {
    return (INDIVIDUAL_LINKED_COLUMNS as readonly PropertyKey[]).includes(key);
}

function isPriceColumn(key: PropertyKey): key is PriceColumn {
    return (PRICE_COLUMNS as readonly PropertyKey[]).includes(key);
}

/**
 * A column heading with a toggle for holding the first row's value down the
 * whole table. Linked is the default because most bills repeat one value for
 * every row; switching it off lets each row stand on its own.
 */
function LinkToggleHeader({
    label,
    name = label,
    linked,
    onToggle,
    linkedHint,
    unlinkedHint,
}: {
    label: string;
    /**
     * What the toggle is called out loud, when the column heading alone would
     * not say which table it belongs to (two garment tables sit side by side,
     * both headed "ราคา/ตัว").
     */
    name?: string;
    linked: boolean;
    onToggle: () => void;
    linkedHint: string;
    unlinkedHint: string;
}) {
    return (
        <span className="flex items-center justify-center gap-1">
            {label}
            <button
                type="button"
                onClick={onToggle}
                aria-pressed={linked}
                title={linked ? linkedHint : unlinkedHint}
                aria-label={
                    linked ? `ยกเลิกลิงก์${name}` : `ลิงก์${name}กับแถวแรก`
                }
                className={`rounded p-0.5 transition-colors ${
                    linked
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'text-slate-400 hover:text-slate-600'
                }`}
            >
                {linked ? (
                    <Link2 className="size-3.5" />
                ) : (
                    <Link2Off className="size-3.5" />
                )}
            </button>
        </span>
    );
}

/** The price flavour of the heading above, used by every size table. */
function PriceLinkHeader({
    label,
    linked,
    onToggle,
}: {
    label: string;
    linked: boolean;
    onToggle: () => void;
}) {
    return (
        <LinkToggleHeader
            label={label}
            linked={linked}
            onToggle={onToggle}
            linkedHint={`${label}: ทุกแถวใช้ราคาตามแถวแรก (กดเพื่อยกเลิก)`}
            unlinkedHint={`${label}: แต่ละแถวกรอกราคาเอง (กดเพื่อลิงก์)`}
        />
    );
}

function createSizeRow(sizeLabel: string): SizeRowForm {
    return {
        id: uid('row'),
        size_label: sizeLabel,
        shirt_style: 'short',
        pants_style: 'short',
        set_shirt_qty: 0,
        set_pants_qty: 0,
        set_price: 0,
        separate_shirt_qty: 0,
        separate_pants_qty: 0,
        separate_shirt_price: 0,
        separate_pants_price: 0,
    };
}

/**
 * The production batches a bill will be split into, in the order the floor
 * reads them. A sheet is printed per batch, so this is also the list of
 * places a piece of artwork can be pinned to.
 *
 * Derived from the size tables rather than stored: the batches a bill has are
 * whatever it was typed as, and they change the moment a row does.
 */
export type ArtworkBatch = {
    key: string;
    garment: ProductionGarment;
    label: string;
    quantity: number;
};

type ProductionGarment = 'shirt' | 'pants';

const BATCH_BASE_LABELS: Record<string, string> = {
    shirt_kids: 'เสื้อไซต์เด็ก',
    shirt_junior: 'เสื้อไซต์ประถม - มัธยมต้น',
    shirt_adults: 'เสื้อไซต์ผู้ใหญ่',
    pants_kids: 'กางเกงเด็ก',
    pants_junior: 'กางเกงประถม - มัธยมต้น',
    pants_adults: 'กางเกงผู้ใหญ่',
};

const BATCH_STYLE_LABELS: Record<
    ProductionGarment,
    Partial<Record<GarmentStyle, string>>
> = {
    shirt: { short: 'แขนสั้น', long: 'แขนยาว', sleeveless: 'แขนกุด' },
    pants: { short: 'ขาสั้น', long: 'ขายาว' },
};

/**
 * Collects the sheets a bill will produce, keyed the way production keys them:
 * garment, size group and length. Every form that ends up as plain order items
 * — Form 1, Form 2 and Form 4 — batches the same way, so they all count into
 * one of these.
 */
function createBatchTotals() {
    const totals = new Map<string, ArtworkBatch>();

    const add = (
        garment: ProductionGarment,
        sizeGroup: SizeTableType,
        style: GarmentStyle,
        quantity: number,
    ) => {
        const base = `${garment}_${sizeGroup === 'kids' ? 'kids' : 'adults'}`;
        const key = `${base}_${style}`;
        const existing = totals.get(key);

        if (existing) {
            existing.quantity += quantity;

            return;
        }

        totals.set(key, {
            key,
            garment,
            label: `${BATCH_BASE_LABELS[base]} ${BATCH_STYLE_LABELS[garment][style]}`,
            quantity,
        });
    };

    // Shirts before trousers, kids before adults, short before long — the same
    // order the sheets come off the printer in.
    const rank = (batch: ArtworkBatch): number =>
        [
            'shirt_kids_short',
            'shirt_kids_long',
            'shirt_kids_sleeveless',
            'shirt_adults_short',
            'shirt_adults_long',
            'shirt_adults_sleeveless',
            'pants_kids_short',
            'pants_kids_long',
            'pants_adults_short',
            'pants_adults_long',
        ].indexOf(batch.key);

    const sorted = (): ArtworkBatch[] =>
        [...totals.values()].sort((left, right) => rank(left) - rank(right));

    return { add, sorted };
}

/**
 * Form 2 sells to a list of people rather than a size table, but each person
 * carries their own sleeve and leg length, so the bill still comes out as the
 * same eight possible sheets. The conditions below are the ones that decide
 * whether a person's line is sent to production at all: a batch nobody is
 * billed for is not a sheet, and asking for artwork for it would be asking
 * for a picture that never gets printed.
 */
export function resolveIndividualArtworkBatches(
    rows: PersonalizationRowForm[],
    includePants: boolean,
): ArtworkBatch[] {
    const { add, sorted } = createBatchTotals();

    rows.filter((row) => !isBlankPersonalizationRow(row)).forEach((row) => {
        const shirtQuantity = Math.max(row.quantity, 0);

        if (shirtQuantity > 0 || row.unit_price > 0) {
            add(
                'shirt',
                row.size_group,
                row.shirt_style,
                Math.max(shirtQuantity, 1),
            );
        }

        if (
            includePants &&
            row.pants_quantity > 0 &&
            row.pants_unit_price > 0
        ) {
            add('pants', row.size_group, row.pants_style, row.pants_quantity);
        }
    });

    return sorted();
}

/**
 * One production sheet of a Form 2 bill: the people on it share a garment, a
 * size range and a length, and so a pattern, a spec and a page on the floor.
 * Keyed exactly as Form 1 keys a table, so the counter, the production board
 * and the costing all read the same name.
 */
export type IndividualSheet = {
    key: string;
    garment: GarmentKind;
    tier: SizeTableType;
    style: GarmentStyle;
    /** How many people on the list are on this sheet. */
    people: number;
    /** e.g. "เสื้อผู้ใหญ่ · แขนยาว". */
    title: string;
};

/**
 * The sheets a list of people is cut on. Everyone typed in is billed a shirt,
 * so every person is on a shirt sheet; trousers only when the bill orders
 * them and that person has some. Shirts first, kids before adults, short
 * before long — the order the sheets come off the printer in.
 */
export function individualSheets(
    rows: PersonalizationRowForm[],
    includePants: boolean,
): IndividualSheet[] {
    const sheets = new Map<string, IndividualSheet>();

    const add = (
        garment: GarmentKind,
        tier: SizeTableType,
        style: GarmentStyle,
    ) => {
        const key = `${garment}_${tier}_${style}`;
        const found = sheets.get(key);

        if (found) {
            found.people += 1;

            return;
        }

        sheets.set(key, {
            key,
            garment,
            tier,
            style,
            people: 1,
            title: `${garment === 'pants' ? 'กางเกง' : 'เสื้อ'}${SIZE_TIER_LABELS[tier]} · ${styleLabel(garment, style)}`,
        });
    };

    rows.filter((row) => !isBlankPersonalizationRow(row)).forEach((row) => {
        const tier: SizeTableType =
            row.size_group === 'kids' ? 'kids' : 'adults';

        add('shirt', tier, readShirtStyle(row.shirt_style));

        if (includePants && row.pants_quantity > 0) {
            add('pants', tier, readPantsStyle(row.pants_style));
        }
    });

    const rank = (sheet: IndividualSheet): number[] => [
        sheet.garment === 'pants' ? 1 : 0,
        sheet.tier === 'kids' ? 0 : 1,
        (sheet.garment === 'pants' ? PANTS_STYLES : SHIRT_STYLES).indexOf(
            sheet.style as PantsStyle,
        ),
    ];

    return [...sheets.values()].sort((left, right) => {
        const a = rank(left);
        const b = rank(right);

        return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    });
}

/**
 * The sheets Form 2 asks a spec for. Those the list produces, and — so the
 * spec can be filled in before anyone is typed — a shirt sheet in the first
 * row's size range and sleeve while the list has none, and a trousers sheet
 * the same way once the bill sells trousers. Such a sheet has nobody on it
 * yet; it becomes a real one, spec and all, as soon as someone is.
 */
export function individualSpecSheets(
    rows: PersonalizationRowForm[],
    includePants: boolean,
): IndividualSheet[] {
    const sheets = individualSheets(rows, includePants);
    const first = rows[0];
    const tier: SizeTableType =
        first?.size_group === 'kids' ? 'kids' : 'adults';
    const empty = (
        garment: GarmentKind,
        style: GarmentStyle,
    ): IndividualSheet => ({
        key: `${garment}_${tier}_${style}`,
        garment,
        tier,
        style,
        people: 0,
        title: `${garment === 'pants' ? 'กางเกง' : 'เสื้อ'}${SIZE_TIER_LABELS[tier]} · ${styleLabel(garment, style)}`,
    });

    if (!sheets.some((sheet) => sheet.garment === 'shirt')) {
        sheets.unshift(empty('shirt', readShirtStyle(first?.shirt_style)));
    }

    if (includePants && !sheets.some((sheet) => sheet.garment === 'pants')) {
        sheets.push(empty('pants', readPantsStyle(first?.pants_style)));
    }

    return sheets;
}

/**
 * The spec each sheet of a reopened Form 2 bill was saved with. A bill written
 * before sheets had specs of their own carries one shirt and one trousers
 * spec, and that is what every sheet of it was sewn from, so each sheet is
 * given that one — the same rule Form 1 reopens its tables by.
 */
export function savedIndividualSheetSpecs(
    sheets: IndividualSheet[],
    decoded: Record<string, unknown>,
    saved: { shirt: ShirtSpecsForm; pants: PantsSpecsForm },
): Record<string, ShirtSpecsForm | PantsSpecsForm> {
    return Object.fromEntries(
        sheets.map((sheet) => [
            sheet.key,
            specsForKey(decoded, sheet.key, sheet.garment, saved),
        ]),
    );
}

/**
 * The trousers size choice that means "the same as this person's shirt" — the
 * default. Radix Select cannot hold an empty value, so it stands for one.
 */
const PANTS_FOLLOWS_SHIRT = '__follows_shirt__';

/**
 * Form 3 is cut per colour house, and a house's sheet carries no sleeve
 * length: the board prints one sheet per house, garment and size group. The
 * house is named by its position on the bill, which is what the production
 * sheet keys itself by, so renaming a house does not orphan its artwork.
 */
export function resolveSportsDayArtworkBatches(
    groups: SportsDayGroupForm[],
): ArtworkBatch[] {
    const batches: ArtworkBatch[] = [];

    groups.forEach((group, index) => {
        const houseName =
            group.team_name.trim() !== ''
                ? group.team_name.trim()
                : `คณะที่ ${index + 1}`;

        (['shirt', 'pants'] as const).forEach((garment) => {
            SIZE_TIERS.forEach((sizeGroup) => {
                const quantity = group.rows
                    .filter((row) => row.size_group === sizeGroup)
                    .reduce(
                        (sum, row) =>
                            sum +
                            Math.max(
                                garment === 'shirt'
                                    ? row.shirt_qty
                                    : row.pants_qty,
                                0,
                            ),
                        0,
                    );

                // A sheet nobody is billed for is never printed, so there is
                // nothing to ask for a picture of.
                if (quantity <= 0) {
                    return;
                }

                batches.push({
                    key: `sports_day_${index}_${garment}_${sizeGroup}`,
                    garment,
                    label: `${houseName} · ${BATCH_BASE_LABELS[`${garment}_${sizeGroup}`]}`,
                    quantity,
                });
            });
        });
    });

    return batches;
}

/**
 * The pictures newly attached to each colour house, as the server takes them:
 * keyed by the house's position on the bill, which is what the media is stored
 * against and what the production sheet reads a house's pictures back by. The
 * form holds them by the house's id instead, so a house added or removed
 * before saving takes its own pictures with it. A house with none is left out.
 */
export function sportsDayArtworkPayload(
    groups: Array<{ id: string }>,
    filesByGroupId: Record<string, File[]>,
): Record<string, File[]> {
    return Object.fromEntries(
        groups
            .map((group, index): [string, File[]] => [
                String(index),
                filesByGroupId[group.id] ?? [],
            ])
            .filter(([, files]) => files.length > 0),
    );
}

export function resolveArtworkBatches(
    sizeTables: SizeTableForm[],
): ArtworkBatch[] {
    const { add, sorted } = createBatchTotals();

    sizeTables.forEach((table) => {
        table.shirt_rows
            .filter((row) => !isBlankGarmentRow(row))
            .forEach((row) =>
                add(
                    'shirt',
                    table.table_type,
                    row.style,
                    Math.max(row.quantity, 0),
                ),
            );
        table.pants_rows
            .filter((row) => !isBlankGarmentRow(row))
            .forEach((row) =>
                add(
                    'pants',
                    table.table_type,
                    row.style,
                    Math.max(row.quantity, 0),
                ),
            );
    });

    return sorted();
}

/**
 * One garment's lines on Form 1 / Form 4: shirts in one of these, trousers in
 * another beside it. Each list keeps its own sizes, so a bill can order four
 * shirt sizes against two trouser sizes, and prices per piece with the line
 * total worked out beside it — the figure the counter reads back to the
 * customer without doing the multiplication in their head.
 */
function GarmentTable({
    title,
    garment,
    rows,
    sizeOptions,
    priceLinked,
    onTogglePriceLink,
    onChange,
    onAdd,
    onRemove,
}: {
    title: string;
    garment: 'shirt' | 'pants';
    rows: GarmentRowForm[];
    sizeOptions: string[];
    priceLinked: boolean;
    onTogglePriceLink: () => void;
    onChange: <K extends keyof GarmentRowForm>(
        rowId: string,
        key: K,
        value: GarmentRowForm[K],
    ) => void;
    onAdd: () => void;
    onRemove: (rowId: string) => void;
}) {
    const isShirt = garment === 'shirt';
    const styleLabels = isShirt ? SHIRT_STYLE_LABELS : PANTS_STYLE_LABELS;
    const sizeHeading = isShirt ? 'ไซซ์เสื้อ' : 'ไซซ์กางเกง';
    const styleHeading = isShirt ? 'แขน' : 'ขา';
    const totals = garmentRowsTotals(rows);
    const accent = isShirt
        ? { bar: 'bg-[#174395]', head: 'bg-blue-50/70' }
        : { bar: 'bg-[#E21E26]', head: 'bg-rose-50/70' };

    return (
        <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200">
            <div
                className={`flex items-center justify-between gap-2 border-b border-slate-200 px-2.5 py-1.5 ${accent.head}`}
            >
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <span className={`h-3 w-1 rounded-full ${accent.bar}`} />
                    {title}
                </span>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[11px]"
                    onClick={onAdd}
                >
                    <Plus className="size-3" />
                    เพิ่มแถว
                </Button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] table-fixed border-collapse text-xs">
                    <thead>
                        <tr className="bg-slate-100 text-slate-700">
                            <th className="w-[24%] border border-slate-200 px-1.5 py-1.5 font-semibold">
                                {sizeHeading}
                            </th>
                            <th className="w-[22%] border border-slate-200 px-1.5 py-1.5 font-semibold">
                                {styleHeading}
                            </th>
                            <th className="w-[16%] border border-slate-200 px-1.5 py-1.5 font-semibold">
                                จำนวน
                            </th>
                            <th className="w-[20%] border border-slate-200 px-1.5 py-1.5 font-semibold">
                                <LinkToggleHeader
                                    label="ราคา/ตัว"
                                    name={`ราคาต่อตัว${title}`}
                                    linked={priceLinked}
                                    onToggle={onTogglePriceLink}
                                    linkedHint={`ราคา${title}: ทุกแถวใช้ราคาตามแถวแรก (กดเพื่อยกเลิก)`}
                                    unlinkedHint={`ราคา${title}: แต่ละแถวกรอกราคาเอง (กดเพื่อลิงก์)`}
                                />
                            </th>
                            <th className="w-[18%] border border-slate-200 px-1.5 py-1.5 font-semibold">
                                รวม
                            </th>
                            <th className="w-[8%] border border-slate-200 px-1 py-1.5" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr
                                key={row.id}
                                className="odd:bg-white even:bg-slate-50/50"
                            >
                                <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                    <Select
                                        value={row.size_label}
                                        onValueChange={(value) =>
                                            onChange(
                                                row.id,
                                                'size_label',
                                                value,
                                            )
                                        }
                                    >
                                        <SelectTrigger
                                            className="h-8 w-full bg-white text-xs"
                                            aria-label={`${sizeHeading} แถวที่ ${rowIndex + 1}`}
                                        >
                                            <SelectValue placeholder="ไม่ระบุ" />
                                        </SelectTrigger>
                                        <SelectContent
                                            position="popper"
                                            side="bottom"
                                            sideOffset={4}
                                            avoidCollisions
                                            collisionPadding={12}
                                        >
                                            {sizeOptions.map((sizeOption) => (
                                                <SelectItem
                                                    key={`${row.id}-${sizeOption}`}
                                                    value={sizeOption}
                                                >
                                                    {sizeOption}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </td>
                                <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                    <Select
                                        value={row.style}
                                        onValueChange={(value) =>
                                            onChange(
                                                row.id,
                                                'style',
                                                value as GarmentStyle,
                                            )
                                        }
                                    >
                                        <SelectTrigger
                                            className="h-8 w-full bg-white px-1.5 text-[11px]"
                                            aria-label={`${styleHeading}${isShirt ? 'เสื้อ' : 'กางเกง'} แถวที่ ${rowIndex + 1}`}
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(isShirt
                                                ? SHIRT_STYLES
                                                : PANTS_STYLES
                                            ).map((styleOption) => (
                                                <SelectItem
                                                    key={styleOption}
                                                    value={styleOption}
                                                >
                                                    {styleLabels[styleOption]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </td>
                                <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                    <Input
                                        type="number"
                                        inputMode="numeric"
                                        onWheel={blurOnWheel}
                                        min={0}
                                        value={numberFieldValue(row.quantity)}
                                        placeholder="0"
                                        onChange={(event) =>
                                            onChange(
                                                row.id,
                                                'quantity',
                                                toNumber(event.target.value),
                                            )
                                        }
                                        className="h-8 w-full min-w-0 text-right text-xs md:text-xs"
                                        aria-label={`จำนวน${isShirt ? 'เสื้อ' : 'กางเกง'} แถวที่ ${rowIndex + 1}`}
                                    />
                                </td>
                                <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                    <Input
                                        type="number"
                                        inputMode="decimal"
                                        onWheel={blurOnWheel}
                                        min={0}
                                        value={numberFieldValue(row.unit_price)}
                                        placeholder="0"
                                        onChange={(event) =>
                                            onChange(
                                                row.id,
                                                'unit_price',
                                                toNumber(event.target.value),
                                            )
                                        }
                                        className="h-8 w-full min-w-0 text-right text-xs md:text-xs"
                                        aria-label={`ราคาต่อตัว${isShirt ? 'เสื้อ' : 'กางเกง'} แถวที่ ${rowIndex + 1}`}
                                    />
                                </td>
                                <td className="border border-slate-200 px-1.5 py-1.5 text-right align-middle font-semibold text-slate-800 tabular-nums">
                                    {formatMoney(garmentRowTotal(row))}
                                </td>
                                <td className="border border-slate-200 px-1 py-1.5 text-center align-middle">
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="size-7 text-slate-400 hover:text-rose-600"
                                        aria-label={`ลบแถวที่ ${rowIndex + 1} ของ${title}`}
                                        disabled={rows.length <= 1}
                                        onClick={() => onRemove(row.id)}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-slate-100 font-bold text-slate-800">
                            <td
                                className="border border-slate-200 px-1.5 py-1.5"
                                colSpan={2}
                            >
                                รวม
                            </td>
                            <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">
                                {totals.quantity.toLocaleString('th-TH')} ตัว
                            </td>
                            <td className="border border-slate-200 px-1.5 py-1.5" />
                            <td
                                className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums"
                                colSpan={2}
                            >
                                {formatMoney(totals.amount)} บ.
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

/** A divider inside a spec grid, naming the handful of fields under it. */
function SpecGroupHeading({ title }: { title: string }) {
    return (
        <div className="col-span-full mt-1 flex items-center gap-2 first:mt-0">
            <span className="text-[11px] font-bold tracking-wide text-slate-500">
                {title}
            </span>
            <span className="h-px flex-1 bg-slate-200" />
        </div>
    );
}

/**
 * The head of one step of the bill. The number is what makes the page read as an
 * order to work in rather than three cards that happen to sit above one
 * another: the counter fills in who it is for, then what they are buying, then
 * reads what it comes to.
 */
function SectionHeading({
    step,
    title,
    hint,
    action,
}: {
    step: number;
    title: string;
    hint?: string;
    action?: ReactNode;
}) {
    return (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#174395] text-[11px] font-bold text-white">
                    {step}
                </span>
                <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900">
                        {title}
                    </h2>
                    {hint ? (
                        <p className="mt-0.5 text-[11px] text-slate-500">
                            {hint}
                        </p>
                    ) : null}
                </div>
            </div>
            {action ? (
                <div className="flex flex-wrap items-center gap-2">
                    {action}
                </div>
            ) : null}
        </div>
    );
}

/**
 * A number box keeps its value while the page is scrolled over it. Browsers
 * step a focused number input on the mouse wheel, so scrolling down a long
 * bill with the cursor resting on a quantity could change what was ordered.
 * Letting go of focus hands the wheel back to the page.
 */
function blurOnWheel(event: WheelEvent<HTMLInputElement>) {
    event.currentTarget.blur();
}

/**
 * Enter moves to the next box instead of submitting the bill. The counter types
 * a table row by row and reaches for Enter out of habit; submitting there
 * threw the "fill everything in" dialog over a half-typed table. Saving stays
 * on the save buttons. A box that already uses Enter — a dropdown picking its
 * highlighted option — has handled it before it reaches here, and a textarea
 * keeps its new line.
 */
export function moveFocusOnEnter(event: KeyboardEvent<HTMLFormElement>) {
    if (
        event.key !== 'Enter' ||
        event.defaultPrevented ||
        event.nativeEvent.isComposing
    ) {
        return;
    }

    const target = event.target;
    const form = event.currentTarget;

    // Dialogs render in a portal and their key events still bubble here
    // through React; they are not part of the bill's tab order.
    if (!(target instanceof HTMLInputElement) || !form.contains(target)) {
        return;
    }

    if (
        ['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(
            target.type,
        )
    ) {
        return;
    }

    event.preventDefault();

    const focusable = [
        ...form.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]):not([type="file"]):not([disabled]):not([readonly]), textarea:not([disabled]), button[role="combobox"]:not([disabled])',
        ),
    ].filter((element) => element.checkVisibility?.() ?? true);
    const index = focusable.indexOf(target);

    if (index !== -1) {
        focusable[index + 1]?.focus();
    }
}

/**
 * One table of Form 1 / Form 4: a single garment, cut at one size tier in one
 * length, priced per piece. The length is not a column here because it is what
 * the table is — a different sleeve is a different table, a different spec and
 * a different sheet on the floor.
 */
function GarmentTierTable({
    title,
    garment,
    rows,
    sizeOptions,
    priceLinked,
    onTogglePriceLink,
    onChange,
    onAdd,
    onRemove,
    invalidClass = () => '',
}: {
    title: string;
    garment: GarmentKind;
    rows: GarmentTableRow[];
    sizeOptions: string[];
    priceLinked: boolean;
    onTogglePriceLink: () => void;
    onChange: <K extends keyof Omit<GarmentTableRow, 'id'>>(
        rowId: string,
        key: K,
        value: GarmentTableRow[K],
    ) => void;
    onAdd: () => void;
    onRemove: (rowId: string) => void;
    /** Red-box styling for a cell the last save attempt found short. */
    invalidClass?: (key: string) => string;
}) {
    const isShirt = garment === 'shirt';
    const sizeHeading = isShirt ? 'ไซซ์เสื้อ' : 'ไซซ์กางเกง';
    const piece = isShirt ? 'เสื้อ' : 'กางเกง';
    const totals = rows.reduce(
        (acc, row) => ({
            quantity: acc.quantity + Math.max(row.quantity, 0),
            amount: acc.amount + garmentTableRowTotal(row),
        }),
        { quantity: 0, amount: 0 },
    );
    const accent = isShirt
        ? { bar: 'bg-[#174395]', head: 'bg-blue-50/70' }
        : { bar: 'bg-[#E21E26]', head: 'bg-rose-50/70' };

    return (
        <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200">
            <div
                className={`flex items-center justify-between gap-2 border-b border-slate-200 px-2.5 py-1.5 ${accent.head}`}
            >
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <span className={`h-3 w-1 rounded-full ${accent.bar}`} />
                    {title}
                </span>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[11px]"
                    onClick={onAdd}
                >
                    <Plus className="size-3" />
                    เพิ่มแถว
                </Button>
            </div>

            <div className="overflow-x-auto">
                <table
                    data-slot="garment-table"
                    data-garment={garment}
                    className="w-full min-w-[360px] table-fixed border-collapse text-xs"
                >
                    <thead>
                        <tr className="bg-slate-100 text-slate-700">
                            <th className="w-[28%] border border-slate-200 px-1.5 py-1.5 font-semibold">
                                {sizeHeading}
                            </th>
                            <th className="w-[18%] border border-slate-200 px-1.5 py-1.5 font-semibold">
                                จำนวน
                            </th>
                            <th className="w-[24%] border border-slate-200 px-1.5 py-1.5 font-semibold">
                                <LinkToggleHeader
                                    label="ราคา/ตัว"
                                    name={`ราคาต่อตัว${title}`}
                                    linked={priceLinked}
                                    onToggle={onTogglePriceLink}
                                    linkedHint={`ราคา${title}: ทุกแถวใช้ราคาตามแถวแรก (กดเพื่อยกเลิก)`}
                                    unlinkedHint={`ราคา${title}: แต่ละแถวกรอกราคาเอง (กดเพื่อลิงก์)`}
                                />
                            </th>
                            <th className="w-[22%] border border-slate-200 px-1.5 py-1.5 font-semibold">
                                รวม
                            </th>
                            <th className="w-[8%] border border-slate-200 px-1 py-1.5" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr
                                key={row.id}
                                className="odd:bg-white even:bg-slate-50/50"
                            >
                                <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                    <Select
                                        value={row.size_label}
                                        onValueChange={(value) =>
                                            onChange(
                                                row.id,
                                                'size_label',
                                                value,
                                            )
                                        }
                                    >
                                        <SelectTrigger
                                            className={`h-8 w-full bg-white text-xs${invalidClass(`garment_row.${row.id}.size_label`)}`}
                                            aria-label={`${sizeHeading} แถวที่ ${rowIndex + 1}`}
                                        >
                                            <SelectValue placeholder="ไม่ระบุ" />
                                        </SelectTrigger>
                                        <SelectContent
                                            position="popper"
                                            side="bottom"
                                            sideOffset={4}
                                            avoidCollisions
                                            collisionPadding={12}
                                        >
                                            {sizeOptions.map((sizeOption) => (
                                                <SelectItem
                                                    key={`${row.id}-${sizeOption}`}
                                                    value={sizeOption}
                                                >
                                                    {sizeOption}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </td>
                                <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                    <Input
                                        type="number"
                                        min={0}
                                        inputMode="numeric"
                                        value={numberFieldValue(row.quantity)}
                                        placeholder="0"
                                        onChange={(event) =>
                                            onChange(
                                                row.id,
                                                'quantity',
                                                toNumber(event.target.value),
                                            )
                                        }
                                        onWheel={blurOnWheel}
                                        className={`h-8 w-full min-w-0 text-right text-xs md:text-xs${invalidClass(`garment_row.${row.id}.quantity`)}`}
                                        aria-label={`จำนวน${piece} แถวที่ ${rowIndex + 1}`}
                                    />
                                </td>
                                <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                    <Input
                                        type="number"
                                        min={0}
                                        inputMode="decimal"
                                        value={numberFieldValue(row.unit_price)}
                                        placeholder="0"
                                        onChange={(event) =>
                                            onChange(
                                                row.id,
                                                'unit_price',
                                                toNumber(event.target.value),
                                            )
                                        }
                                        onWheel={blurOnWheel}
                                        className={`h-8 w-full min-w-0 text-right text-xs md:text-xs${invalidClass(`garment_row.${row.id}.unit_price`)}`}
                                        aria-label={`ราคาต่อตัว${piece} แถวที่ ${rowIndex + 1}`}
                                    />
                                </td>
                                <td className="border border-slate-200 px-1.5 py-1.5 text-right align-middle font-semibold text-slate-800 tabular-nums">
                                    {formatMoney(garmentTableRowTotal(row))}
                                </td>
                                <td className="border border-slate-200 px-1 py-1.5 text-center align-middle">
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="size-7 text-slate-400 hover:text-rose-600"
                                        aria-label={`ลบแถวที่ ${rowIndex + 1} ของ${title}`}
                                        disabled={rows.length <= 1}
                                        onClick={() => onRemove(row.id)}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-slate-100 font-bold text-slate-800">
                            <td className="border border-slate-200 px-1.5 py-1.5">
                                รวม
                            </td>
                            <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">
                                {totals.quantity.toLocaleString('th-TH')} ตัว
                            </td>
                            <td className="border border-slate-200 px-1.5 py-1.5" />
                            <td
                                className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums"
                                colSpan={2}
                            >
                                {formatMoney(totals.amount)} บ.
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

/**
 * The order-item types a garment table can hold: a piece of one garment, at
 * one size, at one price.
 */
const GARMENT_TABLE_ITEM_TYPES = [
    'separate_shirt',
    'separate_pants',
    'shirt',
    'pants',
];

function createGarmentRow(sizeLabel = ''): GarmentRowForm {
    return {
        id: uid('garment'),
        size_label: sizeLabel,
        style: 'short',
        quantity: 0,
        unit_price: 0,
    };
}

/**
 * A row nobody has filled in. A blank table opens with several of these and
 * they must stay off the bill, so a size on its own — picked and then thought
 * better of — is not enough to count: there has to be a quantity.
 */
export function isBlankGarmentRow(row: GarmentRowForm): boolean {
    return row.quantity <= 0;
}

export function garmentRowTotal(row: GarmentRowForm): number {
    return Math.max(row.quantity, 0) * Math.max(row.unit_price, 0);
}

/**
 * What a garment list comes to: pieces and money, counting only the rows that
 * will actually reach the bill.
 */
export function garmentRowsTotals(rows: GarmentRowForm[]): {
    quantity: number;
    amount: number;
} {
    return rows
        .filter((row) => !isBlankGarmentRow(row))
        .reduce(
            (totals, row) => ({
                quantity: totals.quantity + Math.max(row.quantity, 0),
                amount: totals.amount + garmentRowTotal(row),
            }),
            { quantity: 0, amount: 0 },
        );
}

/**
 * A new table opens with a few blank rows rather than one row per size in the
 * catalogue: a bill rarely uses every size, and a wall of pre-filled rows has to
 * be read and deleted before the first real entry can be made. The size is left
 * unset so the box reads "ไม่ระบุ" until it is chosen.
 */
const NEW_SIZE_TABLE_ROWS = 3;

/** Blank people the "รายตัว" form opens with, ready to type into. */
const NEW_PERSONALIZATION_ROWS = 3;

/** Blank size rows each colour house of the "กีฬาสี" form opens with. */
const NEW_SPORTS_DAY_ROWS = 3;

function createSizeTable(tableType: SizeTableType): SizeTableForm {
    return {
        id: uid('table'),
        table_type: tableType,
        title: tableType === 'kids' ? 'ตารางไซส์เด็ก' : 'ตารางไซส์ผู้ใหญ่',
        shirt_rows: Array.from({ length: NEW_SIZE_TABLE_ROWS }, () =>
            createGarmentRow(),
        ),
        pants_rows: Array.from({ length: NEW_SIZE_TABLE_ROWS }, () =>
            createGarmentRow(),
        ),
        rows: Array.from({ length: NEW_SIZE_TABLE_ROWS }, () =>
            createSizeRow(''),
        ),
    };
}

function createSportsDayRow(
    sizeGroup: SizeTier = 'adults',
    sizeLabel = '',
): SportsDayRowForm {
    return {
        id: uid('sd-row'),
        size_group: sizeGroup,
        size_label: sizeLabel,
        shirt_qty: 0,
        shirt_price: 0,
        pants_qty: 0,
        pants_price: 0,
    };
}

function createSportsDayGroup(teamName = ''): SportsDayGroupForm {
    return {
        id: uid('sd-group'),
        team_name: teamName,
        fabric_color_id: '',
        rows: Array.from({ length: NEW_SPORTS_DAY_ROWS }, () =>
            createSportsDayRow(),
        ),
        saved_artwork: [],
    };
}

/** Same shape as rowSeparateTotal(): each garment is billed at its own price. */
export function sportsDayRowTotal(row: SportsDayRowForm): number {
    const shirtAmount =
        Math.max(row.shirt_qty, 0) * Math.max(row.shirt_price, 0);
    const pantsAmount =
        Math.max(row.pants_qty, 0) * Math.max(row.pants_price, 0);

    return shirtAmount + pantsAmount;
}

export function sportsDayGroupTotal(group: SportsDayGroupForm): number {
    return group.rows.reduce((total, row) => total + sportsDayRowTotal(row), 0);
}

export function sportsDayGroupPieces(group: SportsDayGroupForm): number {
    return group.rows.reduce(
        (total, row) =>
            total + Math.max(row.shirt_qty, 0) + Math.max(row.pants_qty, 0),
        0,
    );
}

export function buildRequestItemsFromSportsDay(
    groups: SportsDayGroupForm[],
): RequestOrderItem[] {
    return groups.flatMap((group) =>
        group.rows.flatMap((row) => {
            const sizeLabel = row.size_label || '-';
            const items: RequestOrderItem[] = [];

            if (row.shirt_qty > 0 && row.shirt_price > 0) {
                items.push({
                    item_type: 'shirt',
                    size_group: pricingGroupForTier(row.size_group),
                    size_tier: row.size_group,
                    size_label: sizeLabel,
                    quantity: row.shirt_qty,
                    unit_price: Math.max(row.shirt_price, 0),
                });
            }

            if (row.pants_qty > 0 && row.pants_price > 0) {
                items.push({
                    item_type: 'pants',
                    size_group: pricingGroupForTier(row.size_group),
                    size_tier: row.size_group,
                    size_label: sizeLabel,
                    quantity: row.pants_qty,
                    unit_price: Math.max(row.pants_price, 0),
                });
            }

            return items;
        }),
    );
}

function buildLineItemsFromSportsDay(
    groups: SportsDayGroupForm[],
): OrderLineItemPayload[] {
    return buildRequestItemsFromSportsDay(groups).map((item) => ({
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_id: null,
    }));
}

/**
 * A line somebody actually entered on the retired set-and-separate table.
 * Reopening a bill written that way fills these in; a bill written on the
 * garment tables leaves them all blank.
 */
function sizeRowHasEntry(row: SizeRowForm): boolean {
    return (
        row.set_shirt_qty > 0 ||
        row.set_pants_qty > 0 ||
        row.set_price > 0 ||
        row.separate_shirt_qty > 0 ||
        row.separate_pants_qty > 0 ||
        row.separate_shirt_price > 0 ||
        row.separate_pants_price > 0
    );
}

/**
 * Whether these tables still hold the retired layout. The data answers it, so
 * the same bill totals and bills the same way wherever it is read from —
 * nothing has to remember to pass a flag along.
 */
export function usesLegacySizeRows(sizeTables: SizeTableForm[]): boolean {
    return sizeTables.some((table) => table.rows.some(sizeRowHasEntry));
}

/**
 * Shirts and trousers are sold as separate pieces, each at its own price, so
 * every filled row becomes one order line. A row with no price is still
 * recorded: a piece given away is a piece the floor has to cut.
 */
function buildRequestItemsFromGarmentTables(
    sizeTables: SizeTableForm[],
): RequestOrderItem[] {
    return sizeTables.flatMap((table) => {
        const sizeGroup = mapTableTypeToSizeGroup(table.table_type);

        const linesFor = (
            rows: GarmentRowForm[],
            garment: 'shirt' | 'pants',
        ): RequestOrderItem[] =>
            rows
                .filter((row) => !isBlankGarmentRow(row))
                .map((row) => ({
                    item_type:
                        garment === 'shirt'
                            ? ('separate_shirt' as const)
                            : ('separate_pants' as const),
                    size_group: sizeGroup,
                    size_label: row.size_label || '-',
                    ...(garment === 'shirt'
                        ? { shirt_style: row.style }
                        : { pants_style: row.style }),
                    quantity: Math.max(row.quantity, 0),
                    unit_price: Math.max(row.unit_price, 0),
                }));

        return [
            ...linesFor(table.shirt_rows, 'shirt'),
            ...linesFor(table.pants_rows, 'pants'),
        ];
    });
}

export function resolveRequestItems(
    mode: SizeFormMode,
    sizeTables: SizeTableForm[],
    sportsDayGroups: SportsDayGroupForm[],
    personalizationRows: PersonalizationRowForm[],
    includePants = false,
    garmentTables: GarmentTable[] = [],
): RequestOrderItem[] {
    // ชุดพละ builds its order items exactly like Form 1, which is what keeps
    // production reading the same shape whichever of the two the counter used.
    if (usesSizeTables(mode)) {
        // A bill saved with sets keeps being billed from the rows it was sold
        // on; nothing else is written that way any more.
        if (usesLegacySizeRows(sizeTables)) {
            return buildRequestItems(sizeTables);
        }

        return garmentTables.length > 0
            ? buildItemsFromGarmentTables(garmentTables)
            : buildRequestItemsFromGarmentTables(sizeTables);
    }

    if (mode === 'sports_day') {
        return buildRequestItemsFromSportsDay(sportsDayGroups);
    }

    return buildRequestItemsFromIndividual(personalizationRows, includePants);
}

function getSetBundleCount(row: SizeRowForm): number {
    return Math.max(Math.min(row.set_shirt_qty, row.set_pants_qty), 0);
}

function rowSetTotal(row: SizeRowForm): number {
    return getSetBundleCount(row) * row.set_price;
}

function rowSeparateTotal(row: SizeRowForm): number {
    const shirtAmount = row.separate_shirt_qty * row.separate_shirt_price;
    const pantsAmount = row.separate_pants_qty * row.separate_pants_price;

    return shirtAmount + pantsAmount;
}

function rowTotal(row: SizeRowForm): number {
    return rowSetTotal(row) + rowSeparateTotal(row);
}

/**
 * A row nobody has typed a person into yet. On this form a person is what the
 * name, size and number identify — price is deliberately not part of the test,
 * because the linked price column copies the first row's price into every row,
 * and untouched rows must stay out of the order even after that. `quantity`
 * cannot signal emptiness either: it defaults to 1 the moment a row appears.
 */
export function isBlankPersonalizationRow(
    row: PersonalizationRowForm,
): boolean {
    return (
        row.name.trim() === '' &&
        row.size.trim() === '' &&
        row.number.trim() === '' &&
        row.pants_size.trim() === '' &&
        row.pants_number.trim() === ''
    );
}

export function rowIndividualTotal(
    row: PersonalizationRowForm,
    includePants = false,
): number {
    const shirt = Math.max(row.quantity, 0) * Math.max(row.unit_price, 0);
    const pants = includePants
        ? Math.max(row.pants_quantity, 0) * Math.max(row.pants_unit_price, 0)
        : 0;

    return shirt + pants;
}

function buildLineItemsFromMatrix(
    sizeTables: SizeTableForm[],
): OrderLineItemPayload[] {
    return sizeTables.flatMap((table) =>
        table.rows.flatMap((row) => {
            const setBundleCount = getSetBundleCount(row);
            const items: OrderLineItemPayload[] = [];

            if (setBundleCount > 0 && row.set_price > 0) {
                items.push({
                    quantity: setBundleCount,
                    unit_price: Math.max(row.set_price, 0),
                    discount_id: null,
                });
            }

            if (row.separate_shirt_qty > 0 && row.separate_shirt_price > 0) {
                items.push({
                    quantity: row.separate_shirt_qty,
                    unit_price: Math.max(row.separate_shirt_price, 0),
                    discount_id: null,
                });
            }

            if (row.separate_pants_qty > 0 && row.separate_pants_price > 0) {
                items.push({
                    quantity: row.separate_pants_qty,
                    unit_price: Math.max(row.separate_pants_price, 0),
                    discount_id: null,
                });
            }

            return items;
        }),
    );
}

function buildLineItemsFromIndividual(
    rows: PersonalizationRowForm[],
    includePants = false,
): OrderLineItemPayload[] {
    return buildRequestItemsFromIndividual(rows, includePants).map((item) => ({
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_id: null,
    }));
}

function mapTableTypeToSizeGroup(tableType: SizeTableType): 'kids' | 'adults' {
    return tableType === 'kids' ? 'kids' : 'adults';
}

function buildRequestItems(sizeTables: SizeTableForm[]): RequestOrderItem[] {
    return sizeTables.flatMap((table) =>
        table.rows.flatMap((row) => {
            const sizeGroup = mapTableTypeToSizeGroup(table.table_type);
            const sizeLabel = row.size_label || '-';
            const setBundleCount = getSetBundleCount(row);
            const items: RequestOrderItem[] = [];

            if (setBundleCount > 0 && row.set_price > 0) {
                items.push({
                    // A real set: one shirt plus one pair of pants at a set price.
                    // 'garment' is left to mean "recorded before the garment was
                    // named", which reporting shows separately rather than guessing.
                    item_type: 'set',
                    size_group: sizeGroup,
                    size_label: sizeLabel,
                    shirt_style: row.shirt_style,
                    pants_style: row.pants_style,
                    quantity: setBundleCount,
                    unit_price: Math.max(row.set_price, 0),
                });
            }

            if (row.separate_shirt_qty > 0 && row.separate_shirt_price > 0) {
                items.push({
                    item_type: 'separate_shirt',
                    size_group: sizeGroup,
                    size_label: sizeLabel,
                    shirt_style: row.shirt_style,
                    quantity: row.separate_shirt_qty,
                    unit_price: Math.max(row.separate_shirt_price, 0),
                });
            }

            if (row.separate_pants_qty > 0 && row.separate_pants_price > 0) {
                items.push({
                    item_type: 'separate_pants',
                    size_group: sizeGroup,
                    size_label: sizeLabel,
                    pants_style: row.pants_style,
                    quantity: row.separate_pants_qty,
                    unit_price: Math.max(row.separate_pants_price, 0),
                });
            }

            return items;
        }),
    );
}

export function buildRequestItemsFromIndividual(
    rows: PersonalizationRowForm[],
    includePants = false,
): RequestOrderItem[] {
    return rows.flatMap((row): RequestOrderItem[] => {
        if (isBlankPersonalizationRow(row)) {
            return [];
        }

        const items: RequestOrderItem[] = [];
        const shirtQuantity = Math.max(row.quantity, 0);

        if (shirtQuantity > 0 || row.unit_price > 0) {
            items.push({
                item_type: 'shirt',
                size_group: row.size_group,
                size_label: row.size || '-',
                shirt_style: row.shirt_style,
                quantity: Math.max(shirtQuantity, 1),
                unit_price: Math.max(row.unit_price, 0),
            });
        }

        // Pants ride along on the same person's row, priced separately, exactly
        // like the separate columns of Form 1.
        if (
            includePants &&
            row.pants_quantity > 0 &&
            row.pants_unit_price > 0
        ) {
            items.push({
                item_type: 'pants',
                size_group: row.size_group,
                size_label: row.pants_size || row.size || '-',
                pants_style: row.pants_style,
                quantity: row.pants_quantity,
                unit_price: Math.max(row.pants_unit_price, 0),
            });
        }

        return items;
    });
}

function toStringValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

function toStringValueFromUnknown(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return String(value);
    }

    return '';
}

function toNumberValue(value: number | string | null | undefined): number {
    if (value === null || value === undefined || value === '') {
        return 0;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
}

function toNumberValueFromUnknown(value: unknown): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string' && value !== '') {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

export function buildEditInitialFormData(
    order: EditOrderPayload | null | undefined,
    args: {
        resolvedBranches: BranchOption[];
        defaultBranchId?: number | null;
        resolvedJobTypes: OptionItem[];
        resolvedShirtTypes: OptionItem[];
        resolvedPantsTypes: OptionItem[];
        resolvedKidsSizes: string[];
        resolvedAdultSizes: string[];
    },
): OrderCreateFormData {
    const defaultTableType: SizeTableType =
        args.resolvedKidsSizes.length > 0 ? 'kids' : 'adults';

    const defaultSizeTable = createSizeTable(defaultTableType);

    const defaultShirtTypeId = args.resolvedShirtTypes[0]
        ? String(args.resolvedShirtTypes[0].id)
        : '';
    const defaultPantsTypeId = args.resolvedPantsTypes[0]
        ? String(args.resolvedPantsTypes[0].id)
        : '';

    /**
     * A new bill opens on one tier's pair of tables — a shirt and a pair of
     * trousers, both short — which is the shape most bills take. Another
     * length or tier is added from the buttons above them.
     */
    const defaultGarmentTables: GarmentTable[] = [
        createShirtTable(
            defaultTableType,
            'short',
            emptyShirtSpecs(defaultShirtTypeId),
        ),
        createPantsTable(
            defaultTableType,
            'short',
            emptyPantsSpecs(defaultPantsTypeId),
        ),
    ];

    if (!order) {
        return {
            customer_id: '',
            branch_id: args.defaultBranchId
                ? String(args.defaultBranchId)
                : args.resolvedBranches[0]
                  ? String(args.resolvedBranches[0].id)
                  : '',
            customer_name: '',
            customer_phone: '',
            contact_detail: '',
            job_type_id: args.resolvedJobTypes[0]
                ? String(args.resolvedJobTypes[0].id)
                : '',
            job_name: '',
            billing_date: currentDateISO(),
            billing_time: currentTimeHHmm(),
            due_date: '',
            delivery_method: 'pickup',
            shipping_address: '',
            discount_percent: '0',
            deposit_amount: 0,
            payment_method: 'cash',
            payment_status: 'pending',
            shirt_artwork_files: [],
            shirt_artwork_scoped: {},
            pants_artwork_scoped: {},
            sports_day_artwork_files: {},
            artwork_scopes: {},
            pants_artwork_files: [],
            removed_media_ids: [],
            transfer_slip_file: null,
            shirt_specs: {
                shirt_type_id: args.resolvedShirtTypes[0]
                    ? String(args.resolvedShirtTypes[0].id)
                    : '',
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
            },
            pants_specs: {
                pants_type_id: args.resolvedPantsTypes[0]
                    ? String(args.resolvedPantsTypes[0].id)
                    : '',
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
            },
            garment_tables: defaultGarmentTables,
            size_tables: [defaultSizeTable],
            personalization_rows: [],
            individual_include_pants: false,
            individual_sheet_specs: {},
            individual_keeper_color: '',
            sports_day_groups: [createSportsDayGroup()],
            line_items: [],
        };
    }

    const specPayload = (order.specification?.decoded ?? {}) as Record<
        string,
        unknown
    >;
    const shirtSpecPayload = (specPayload.shirt_specs ?? {}) as Record<
        string,
        unknown
    >;
    const pantsSpecPayload = (specPayload.pants_specs ?? {}) as Record<
        string,
        unknown
    >;
    const personalizationRows = Array.isArray(specPayload.personalization_rows)
        ? specPayload.personalization_rows
        : Array.isArray(specPayload.rows)
          ? specPayload.rows
          : [];

    // Unlike Form 1's size tables — which are rebuilt from order_items — the
    // colour houses cannot be recovered that way: order_items has no colour
    // column. They are persisted in the spec JSON and read straight back.
    const savedSportsDayArtwork = (order.sports_day_artwork_media ??
        {}) as Record<string, SavedArtwork[]>;
    const savedSportsDayGroups: SportsDayGroupForm[] = (
        Array.isArray(specPayload.sports_day_groups)
            ? specPayload.sports_day_groups
            : []
    ).map((rawGroup, groupIndex) => {
        const group = (rawGroup ?? {}) as Record<string, unknown>;
        const rawRows = Array.isArray(group.rows) ? group.rows : [];

        return {
            id: uid(`sd-group-${groupIndex}`),
            team_name: toStringValueFromUnknown(group.team_name),
            fabric_color_id: toStringValueFromUnknown(group.fabric_color_id),
            saved_artwork: Array.isArray(
                savedSportsDayArtwork[String(groupIndex)],
            )
                ? savedSportsDayArtwork[String(groupIndex)]
                : [],
            rows: rawRows.map((rawRow, rowIndex) => {
                const row = (rawRow ?? {}) as Record<string, unknown>;

                return {
                    id: uid(`sd-row-${groupIndex}-${rowIndex}`),
                    size_group: readSizeTier(
                        toStringValueFromUnknown(row.size_group),
                        toStringValueFromUnknown(row.size_group),
                    ),
                    size_label: toStringValueFromUnknown(row.size_label),
                    shirt_qty: toNumberValueFromUnknown(row.shirt_qty),
                    shirt_price: toNumberValueFromUnknown(row.shirt_price),
                    pants_qty: toNumberValueFromUnknown(row.pants_qty),
                    pants_price: toNumberValueFromUnknown(row.pants_price),
                } satisfies SportsDayRowForm;
            }),
        } satisfies SportsDayGroupForm;
    });

    const items = Array.isArray(order.items) ? order.items : [];

    /**
     * A bill written before the set was retired, or before the garment on a
     * line was named. Neither can be shown on the garment tables without
     * inventing something — a price split, or which garment a line is — so any
     * line the tables cannot represent keeps the bill on the layout it was
     * sold on. Nothing is dropped or silently re-priced.
     */
    const billNeedsLegacyRows = items.some(
        (item) =>
            !GARMENT_TABLE_ITEM_TYPES.includes(
                (item.item_type ?? '').toLowerCase(),
            ),
    );

    /**
     * Each saved line becomes one row, rather than being grouped by size: two
     * lines of the same size in different lengths are two things to cut, and
     * merging them would lose one of the prices.
     */
    const buildGarmentRowsForTable = (
        sizeGroup: 'kids' | 'adults',
        garment: 'shirt' | 'pants',
    ): GarmentRowForm[] => {
        const wantedTypes =
            garment === 'shirt'
                ? ['separate_shirt', 'shirt']
                : ['separate_pants', 'pants'];

        return items
            .filter((item) => {
                const normalizedGroup =
                    (item.size_group ?? 'adults') === 'kids'
                        ? 'kids'
                        : 'adults';

                return (
                    normalizedGroup === sizeGroup &&
                    wantedTypes.includes((item.item_type ?? '').toLowerCase())
                );
            })
            .map((item, index) => ({
                id: uid(`${garment}-${sizeGroup}-${index}`),
                size_label: toStringValue(item.size_label),
                style:
                    garment === 'shirt'
                        ? readShirtStyle(item.shirt_style)
                        : readPantsStyle(item.pants_style),
                quantity: Math.max(0, toNumberValue(item.quantity)),
                unit_price: toNumberValue(item.unit_price),
            }));
    };

    /** A garment list always opens with somewhere to type, saved rows or not. */
    const garmentRowsOrBlank = (rows: GarmentRowForm[]): GarmentRowForm[] =>
        rows.length > 0
            ? rows
            : Array.from({ length: NEW_SIZE_TABLE_ROWS }, () =>
                  createGarmentRow(),
              );

    const buildGroupedRowsForTable = (
        sizeGroup: 'kids' | 'adults',
    ): SizeRowForm[] => {
        const rowMap = new Map<string, SizeRowForm>();

        items.forEach((item, index) => {
            const normalizedGroup =
                (item.size_group ?? 'adults') === 'kids' ? 'kids' : 'adults';

            if (normalizedGroup !== sizeGroup) {
                return;
            }

            const itemType = (item.item_type ?? '').toLowerCase();
            const sizeLabel = toStringValue(item.size_label) || 'ระบุไซส์';
            const quantity = Math.max(1, toNumberValue(item.quantity));
            const unitPrice = toNumberValue(item.unit_price);
            const row = rowMap.get(sizeLabel) ?? {
                id: uid(`row-${index}`),
                size_label: sizeLabel,
                shirt_style: 'short' as GarmentStyle,
                pants_style: 'short' as GarmentStyle,
                set_shirt_qty: 0,
                set_pants_qty: 0,
                set_price: 0,
                separate_shirt_qty: 0,
                separate_pants_qty: 0,
                separate_shirt_price: 0,
                separate_pants_price: 0,
            };

            if (itemType.includes('separate')) {
                if (itemType.includes('shirt')) {
                    row.separate_shirt_qty += quantity;
                    row.separate_shirt_price =
                        unitPrice || row.separate_shirt_price;
                }

                if (itemType.includes('pants')) {
                    row.separate_pants_qty += quantity;
                    row.separate_pants_price =
                        unitPrice || row.separate_pants_price;
                }
            } else if (
                itemType.includes('shirt') ||
                itemType.includes('pants') ||
                itemType === 'garment' ||
                itemType === 'set'
            ) {
                const setCount = itemType.includes('shirt')
                    ? quantity
                    : itemType.includes('pants')
                      ? 0
                      : quantity;
                const pantsCount = itemType.includes('pants')
                    ? quantity
                    : itemType.includes('shirt')
                      ? 0
                      : quantity;

                row.set_shirt_qty += setCount;
                row.set_pants_qty += pantsCount;
                row.set_price = unitPrice || row.set_price;
            }

            // Style is stored per saved item; the first item that states one wins,
            // which keeps the single-choice-per-row rule when reopening an order.
            if (
                item.shirt_style === 'short' ||
                item.shirt_style === 'long' ||
                item.shirt_style === 'sleeveless'
            ) {
                row.shirt_style = item.shirt_style;
            }

            if (item.pants_style === 'short' || item.pants_style === 'long') {
                row.pants_style = item.pants_style;
            }

            rowMap.set(sizeLabel, row);
        });

        return Array.from(rowMap.values());
    };

    const matrixTables: SizeTableForm[] = (['kids', 'adults'] as const)
        .filter((tableType) => {
            return items.some(
                (item) =>
                    ((item.size_group ?? 'adults') === 'kids'
                        ? 'kids'
                        : 'adults') === tableType,
            );
        })
        .map((tableType) => {
            const rows = billNeedsLegacyRows
                ? buildGroupedRowsForTable(tableType)
                : [];

            return {
                id: uid(`table-${tableType}`),
                table_type: tableType,
                title:
                    tableType === 'kids' ? 'ตารางไซส์เด็ก' : 'ตารางไซส์ผู้ใหญ่',
                shirt_rows: billNeedsLegacyRows
                    ? []
                    : garmentRowsOrBlank(
                          buildGarmentRowsForTable(tableType, 'shirt'),
                      ),
                pants_rows: billNeedsLegacyRows
                    ? []
                    : garmentRowsOrBlank(
                          buildGarmentRowsForTable(tableType, 'pants'),
                      ),
                rows: rows.length > 0 ? rows : [],
            };
        });

    const mappedPersonalizationRows = personalizationRows
        .filter(
            (row): row is Record<string, unknown> =>
                typeof row === 'object' && row !== null,
        )
        .map((row, index) => ({
            id: uid(`person-${index}`),
            // Rows written before roles existed are players, which is what they
            // were: the keeper shirt is the exception, never the default.
            role: (row.role === 'keeper'
                ? 'keeper'
                : 'player') as IndividualRole,
            name: toStringValue(row.name),
            size_group: (row.size_group === 'kids' ? 'kids' : 'adults') as
                'kids' | 'adults',
            size: toStringValue(row.size),
            // Rows written before lengths existed are short, the same default
            // the form gives a fresh person.
            shirt_style: readShirtStyle(row.shirt_style),
            number: toStringValue(row.number),
            quantity: Math.max(1, toNumberValue(row.quantity)),
            unit_price: toNumberValue(row.unit_price),
            // Saved equal to the shirt's, the trousers were following it, and
            // reopen still following it.
            pants_size:
                toStringValueFromUnknown(row.pants_size) ===
                toStringValueFromUnknown(row.size)
                    ? ''
                    : toStringValueFromUnknown(row.pants_size),
            pants_style: readPantsStyle(row.pants_style),
            pants_number:
                toStringValueFromUnknown(row.pants_number) ===
                toStringValueFromUnknown(row.number)
                    ? ''
                    : toStringValueFromUnknown(row.pants_number),
            pants_quantity: toNumberValueFromUnknown(row.pants_quantity),
            pants_unit_price: toNumberValueFromUnknown(row.pants_unit_price),
        }));

    const resolvedJobTypeId =
        args.resolvedJobTypes.find((jobType) => jobType.name === order.job_type)
            ?.id ??
        args.resolvedJobTypes[0]?.id ??
        0;
    const matchedBranchId =
        args.resolvedBranches.find((branch) => branch.id === order.branch_id)
            ?.id ??
        order.branch_id ??
        args.resolvedBranches[0]?.id ??
        0;

    const editing: OrderCreateFormData = {
        customer_id: order.customer_id ? String(order.customer_id) : '',
        branch_id: matchedBranchId ? String(matchedBranchId) : '',
        customer_name: order.customer_name ?? '',
        customer_phone: order.customer_phone ?? '',
        contact_detail: order.contact_detail ?? '',
        job_type_id: String(resolvedJobTypeId),
        job_name: order.job_name ?? '',
        billing_date: order.billing_date ?? currentDateISO(),
        billing_time: order.billing_time ?? currentTimeHHmm(),
        due_date: order.due_date ?? '',
        delivery_method: (order.delivery_method as DeliveryMethod) ?? 'pickup',
        shipping_address: order.shipping_address ?? '',
        discount_percent: toStringValue(order.discount_percent) || '0',
        deposit_amount: toNumberValue(order.deposit_amount),
        payment_method: (order.payment_method as PaymentMethod) ?? 'cash',
        payment_status: 'pending',
        shirt_artwork_files: [],
        shirt_artwork_scoped: {},
        pants_artwork_scoped: {},
        sports_day_artwork_files: {},
        artwork_scopes: {},
        pants_artwork_files: [],
        removed_media_ids: [],
        transfer_slip_file: null,
        shirt_specs: {
            shirt_type_id: toStringValueFromUnknown(
                shirtSpecPayload.shirt_type_id ??
                    order.specification?.decoded?.shirt_specs?.shirt_type_id ??
                    args.resolvedShirtTypes[0]?.id ??
                    '',
            ),
            pattern_id: toStringValueFromUnknown(
                shirtSpecPayload.pattern_id ??
                    order.specification?.pattern_id ??
                    '',
            ),
            fabric_id: toStringValueFromUnknown(
                shirtSpecPayload.fabric_id ??
                    order.specification?.fabric_id ??
                    '',
            ),
            fabric_color_id: toStringValueFromUnknown(
                shirtSpecPayload.fabric_color_id ?? '',
            ),
            neck_style_id: toStringValueFromUnknown(
                shirtSpecPayload.neck_style_id ??
                    order.specification?.neck_style_id ??
                    '',
            ),
            neck_color_id: toStringValueFromUnknown(
                shirtSpecPayload.neck_color_id ?? '',
            ),
            collar_id: toStringValueFromUnknown(
                shirtSpecPayload.collar_id ?? '',
            ),
            placket_style_id: toStringValueFromUnknown(
                shirtSpecPayload.placket_style_id ?? '',
            ),
            placket_outer_color_id: toStringValueFromUnknown(
                shirtSpecPayload.placket_outer_color_id ?? '',
            ),
            placket_inner_color_id: toStringValueFromUnknown(
                shirtSpecPayload.placket_inner_color_id ?? '',
            ),
            sleeve_cuff_id: toStringValueFromUnknown(
                shirtSpecPayload.sleeve_cuff_id ?? '',
            ),
            panel_style_id: toStringValueFromUnknown(
                shirtSpecPayload.panel_style_id ?? '',
            ),
            screen_color_id: toStringValueFromUnknown(
                shirtSpecPayload.screen_color_id ?? '',
            ),
            embroidery_color_id: toStringValueFromUnknown(
                shirtSpecPayload.embroidery_color_id ?? '',
            ),
            sublimation_id: toStringValueFromUnknown(
                shirtSpecPayload.sublimation_id ?? '',
            ),
            sleeve_style_text: toStringValueFromUnknown(
                shirtSpecPayload.sleeve_style_text ?? '',
            ),
            piping_style_text: toStringValueFromUnknown(
                shirtSpecPayload.piping_style_text ?? '',
            ),
            stripe_style_text: toStringValueFromUnknown(
                shirtSpecPayload.stripe_style_text ?? '',
            ),
            screen_text: toStringValueFromUnknown(
                shirtSpecPayload.screen_text ?? '',
            ),
            embroidery_code_text: toStringValueFromUnknown(
                shirtSpecPayload.embroidery_code_text ?? '',
            ),
            embroidery_note_text: toStringValueFromUnknown(
                shirtSpecPayload.embroidery_note_text ?? '',
            ),
        },
        pants_specs: {
            pants_type_id: toStringValueFromUnknown(
                pantsSpecPayload.pants_type_id ??
                    order.specification?.decoded?.pants_specs?.pants_type_id ??
                    args.resolvedPantsTypes[0]?.id ??
                    '',
            ),
            pattern_id: toStringValueFromUnknown(
                pantsSpecPayload.pattern_id ?? '',
            ),
            fabric_id: toStringValueFromUnknown(
                pantsSpecPayload.fabric_id ?? '',
            ),
            fabric_color_id: toStringValueFromUnknown(
                pantsSpecPayload.fabric_color_id ?? '',
            ),
            leg_style_id: toStringValueFromUnknown(
                pantsSpecPayload.leg_style_id ?? '',
            ),
            leg_cuff_id: toStringValueFromUnknown(
                pantsSpecPayload.leg_cuff_id ?? '',
            ),
            screen_color_id: toStringValueFromUnknown(
                pantsSpecPayload.screen_color_id ?? '',
            ),
            embroidery_color_id: toStringValueFromUnknown(
                pantsSpecPayload.embroidery_color_id ?? '',
            ),
            sublimation_id: toStringValueFromUnknown(
                pantsSpecPayload.sublimation_id ?? '',
            ),
            seat_style_text: toStringValueFromUnknown(
                pantsSpecPayload.seat_style_text ?? '',
            ),
            panel_style_text: toStringValueFromUnknown(
                pantsSpecPayload.panel_style_text ?? '',
            ),
            stripe_style_text: toStringValueFromUnknown(
                pantsSpecPayload.stripe_style_text ?? '',
            ),
            screen_text: toStringValueFromUnknown(
                pantsSpecPayload.screen_text ?? '',
            ),
            embroidery_code_text: toStringValueFromUnknown(
                pantsSpecPayload.embroidery_code_text ?? '',
            ),
            embroidery_note_text: toStringValueFromUnknown(
                pantsSpecPayload.embroidery_note_text ?? '',
            ),
        },
        sports_day_groups:
            savedSportsDayGroups.length > 0
                ? savedSportsDayGroups
                : [createSportsDayGroup()],
        // Filled in by the return below, once the spec this bill was saved
        // with is known and can stand in for a sheet that carries none.
        garment_tables: [],
        size_tables: order
            ? matrixTables.length > 0
                ? matrixTables
                : []
            : [defaultSizeTable],
        personalization_rows: mappedPersonalizationRows,
        individual_include_pants: specPayload.individual_include_pants === true,
        // Filled in by the return below, from the people this bill reopens with.
        individual_sheet_specs: {},
        individual_keeper_color: toStringValueFromUnknown(
            specPayload.individual_keeper_color,
        ),
        line_items: items.map((item) => ({
            quantity: Math.max(1, toNumberValue(item.quantity)),
            unit_price: toNumberValue(item.unit_price),
            discount_id: null,
        })),
    };

    return {
        ...editing,
        // Rebuilt from the lines the bill was sold as, so a bill that mixed
        // two lengths in one table reopens as the two tables it is cut as.
        // A sheet with no spec of its own takes the one the whole bill was
        // saved with, which is what the shop actually sewed from.
        garment_tables: hydrateGarmentTables(items, specPayload, {
            shirt: editing.shirt_specs,
            pants: editing.pants_specs,
        }),
        individual_sheet_specs: savedIndividualSheetSpecs(
            individualSheets(
                editing.personalization_rows,
                editing.individual_include_pants,
            ),
            specPayload,
            { shirt: editing.shirt_specs, pants: editing.pants_specs },
        ),
    };
}

function resolveRoutingFlowByJobType(jobTypeName: string): string[] {
    const normalizedJobType = jobTypeName.trim().toLowerCase();
    const hasEmbroidery =
        normalizedJobType.includes('ปัก') ||
        normalizedJobType.includes('embroider');
    const hasSublimation =
        normalizedJobType.includes('ซับ') ||
        normalizedJobType.includes('sublimation');
    const hasScreenFlex =
        normalizedJobType.includes('สกรีน') ||
        normalizedJobType.includes('screen') ||
        normalizedJobType.includes('เฟล็ก') ||
        normalizedJobType.includes('flex');

    if (!hasEmbroidery && !hasSublimation && !hasScreenFlex) {
        return ['design'];
    }

    const stations: string[] = ['cutting'];

    if (hasSublimation) {
        stations.push('screen');
    }

    if (hasScreenFlex) {
        stations.push('flex');
    }

    if (hasEmbroidery) {
        stations.push('embroidery');
    }

    stations.push('sewing', 'qc', 'shipping');

    return Array.from(new Set(stations));
}

/**
 * Saved artwork is shown alongside newly picked files, and both can be removed:
 * a saved image is reported by its media id so the server deletes that exact
 * one, a pending file by its position in the list.
 */
function SavedArtworkCard({
    media,
    onRemoveSaved,
    compact = false,
    name,
}: {
    media: SavedArtwork;
    onRemoveSaved: (id: number) => void;
    compact?: boolean;
    /** Whose picture this is, when a page shows several galleries. */
    name?: string;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div
                className={`${compact ? 'aspect-square' : 'aspect-[16/10]'} bg-slate-100`}
            >
                <img
                    src={media.url}
                    alt={name ? `Art Work ${name}` : 'รูปที่บันทึกไว้'}
                    className="h-full w-full object-contain"
                />
            </div>
            <div className="flex items-center justify-between gap-1 p-1.5">
                <p className="truncate text-[10px] text-slate-500">
                    รูปที่บันทึกไว้
                </p>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={
                        name
                            ? `ลบรูปที่บันทึกไว้ของ ${name}`
                            : 'ลบรูปที่บันทึกไว้'
                    }
                    className={`${compact ? 'size-6' : 'size-8'} shrink-0 text-slate-500 hover:text-rose-600`}
                    onClick={() => onRemoveSaved(media.id)}
                >
                    <X className={compact ? 'size-3.5' : 'size-4'} />
                </Button>
            </div>
        </div>
    );
}

/**
 * The way into a bill's Art Work on Forms 1 and 4, where artwork is arranged
 * by the sheets the bill produces rather than by garment. It states what is
 * attached and, when some sheet would print with nothing, says so here so the
 * gap is noticed without opening the dialog.
 */
function ArtworkBatchButton({
    attached,
    missing,
    onOpen,
}: {
    attached: number;
    missing: number;
    onOpen: () => void;
}) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-xs font-semibold text-slate-700">
                        Art Work ของใบงาน
                    </p>
                    <p className="text-[11px] text-slate-500">
                        แนบแล้ว{' '}
                        <span className="font-mono text-xs font-semibold text-slate-900">
                            {attached}
                        </span>{' '}
                        รูป
                        {missing > 0 ? (
                            <span className="ml-2 font-semibold text-amber-700">
                                · ยังไม่มีรูป {missing} ใบงาน
                            </span>
                        ) : null}
                    </p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant={missing > 0 ? 'default' : 'outline'}
                    className="h-8 gap-1.5 text-xs"
                    onClick={onOpen}
                >
                    <ImagePlus className="size-3.5" />
                    จัดการรูป Art Work
                </Button>
            </div>
        </div>
    );
}

function MultiArtworkUpload({
    title,
    inputId,
    files,
    previewUrls,
    savedMedia,
    error,
    onSelect,
    onRemove,
    onRemoveSaved,
    name,
}: {
    title: string;
    inputId: string;
    files: File[];
    previewUrls: string[];
    savedMedia: SavedArtwork[];
    error?: string;
    onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
    onRemove: (index: number) => void;
    onRemoveSaved: (id: number) => void;
    /**
     * Whose gallery this is, when a page carries several of one kind — each
     * colour house of Form 3 — so every picture and its remove button can be
     * told apart.
     */
    name?: string;
}) {
    const hasAnything = files.length > 0 || savedMedia.length > 0;

    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-xs font-semibold text-slate-700">{title}</p>

            {hasAnything ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {savedMedia.map((media) => (
                        <SavedArtworkCard
                            key={`saved-${media.id}`}
                            media={media}
                            onRemoveSaved={onRemoveSaved}
                            compact
                            name={name}
                        />
                    ))}

                    {files.map((file, index) => {
                        const previewUrl = previewUrls[index] ?? '';
                        const displayName = file.name || `Artwork ${index + 1}`;
                        const sizeKb =
                            file.size > 0
                                ? Math.round(file.size / 1024).toLocaleString(
                                      'th-TH',
                                  )
                                : null;

                        return (
                            <div
                                key={`${displayName}-${index}`}
                                className="overflow-hidden rounded-md border border-slate-200 bg-white"
                            >
                                <div className="aspect-square bg-slate-100">
                                    <img
                                        src={previewUrl}
                                        alt={displayName}
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-1 p-1.5">
                                    <p className="truncate text-[10px] text-slate-500">
                                        {sizeKb ? `${sizeKb} KB` : 'รูปใหม่'}
                                    </p>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label={
                                            name
                                                ? `ลบรูปที่เลือกไว้ของ ${name}`
                                                : 'ลบรูปที่เลือกไว้'
                                        }
                                        className="size-6 shrink-0 text-slate-500 hover:text-rose-600"
                                        onClick={() => onRemove(index)}
                                    >
                                        <X className="size-3.5" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="mt-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-[11px] text-slate-500">
                    ยังไม่ได้แนบรูป
                </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                    id={inputId}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={onSelect}
                />
                <label
                    htmlFor={inputId}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                >
                    <Upload className="size-3.5" />
                    เพิ่มรูป (เลือกได้หลายไฟล์)
                </label>
            </div>
            {error ? (
                <p className="mt-2 text-xs text-[#E21E26]">{error}</p>
            ) : null}
        </div>
    );
}

export default function OrderCreatePage({
    branches,
    jobTypes,
    jobNames,
    shirtCatalogs,
    pantsCatalogs,
    shirtCatalogKeys = {},
    pantsCatalogKeys = {},
    shirtTypes,
    pantsTypes,
    kidsSizes,
    juniorSizes,
    adultSizes,
    defaultBranchId,
    dailyProductionCapacity = 200,
    deliveryDateLoads = [],
    order,
}: OrderCreatePageProps) {
    const { compressImage, isCompressing } = useWebpCompress();
    const { currentTeam, auth } = usePage<{
        currentTeam?: { slug: string } | null;
        auth?: { user?: { access_role?: string; role?: string } | null };
    }>().props;
    // Anyone who can open a bill may add master data from it; renaming and
    // hiding are for the people the settings menu is shown to (the server
    // enforces the same rule).
    const canManageMasterData =
        auth?.user?.access_role === 'OWNER' ||
        auth?.user?.access_role === 'ADMIN_SYSTEM' ||
        (auth?.user?.access_role === undefined && auth?.user?.role === 'admin');

    /**
     * Forms 2 and 3 carry one shirt spec and one trousers spec for the whole
     * bill. They are laid out the way Forms 1 and 4 lay out a table's spec —
     * folded under a heading that says how much is still missing — so both
     * read alike; the heading is what the counter checks, and a failed save
     * unfolds whichever is short.
     */
    const [billSpecOpen, setBillSpecOpen] = useState<Record<SpecTab, boolean>>({
        shirt: false,
        pants: false,
    });
    // Price columns start linked to the first row, which is how most bills are
    // priced. Keyed by table so the two size tables can be linked separately.
    const [unlinkedPriceColumns, setUnlinkedPriceColumns] = useState<
        Record<string, PriceColumn[]>
    >({});

    const isPriceColumnLinked = (
        tableId: string,
        column: PriceColumn,
    ): boolean => !(unlinkedPriceColumns[tableId] ?? []).includes(column);

    // A set is one shirt plus one pair of pants, so the two counts start tied
    // together per row. Unlinking is per row, not per column: one size may be
    // sold as sets while another is not.
    const [unlinkedSetRows, setUnlinkedSetRows] = useState<string[]>([]);

    const isSetQtyLinked = (rowId: string): boolean =>
        !unlinkedSetRows.includes(rowId);

    const toggleSetQtyLink = (rowId: string) => {
        setUnlinkedSetRows((previous) =>
            previous.includes(rowId)
                ? previous.filter((id) => id !== rowId)
                : [...previous, rowId],
        );
    };

    // Form 3 prices work like Form 1's: the whole colour house is usually sold
    // at one shirt price and one pants price, so the columns start linked to
    // the first row. Kept separate from unlinkedPriceColumns because the two
    // forms have different column names and are keyed by different ids.
    const [unlinkedSportsDayPrices, setUnlinkedSportsDayPrices] = useState<
        Record<string, SportsDayPriceColumn[]>
    >({});

    const isSportsDayPriceLinked = (
        groupId: string,
        column: SportsDayPriceColumn,
    ): boolean => !(unlinkedSportsDayPrices[groupId] ?? []).includes(column);

    const toggleSportsDayPriceLink = (
        groupId: string,
        column: SportsDayPriceColumn,
    ) => {
        setUnlinkedSportsDayPrices((previous) => {
            const current = previous[groupId] ?? [];

            return {
                ...previous,
                [groupId]: current.includes(column)
                    ? current.filter((item) => item !== column)
                    : [...current, column],
            };
        });
    };

    // Team shirts are normally one price and one sleeve length for everyone on
    // the list, so those columns start linked to the first person. There is
    // only one list per order, so this needs no key.
    const [unlinkedIndividualColumns, setUnlinkedIndividualColumns] = useState<
        IndividualLinkedColumn[]
    >([]);

    const isIndividualColumnLinked = (
        column: IndividualLinkedColumn,
    ): boolean => !unlinkedIndividualColumns.includes(column);

    const toggleIndividualColumnLink = (column: IndividualLinkedColumn) => {
        setUnlinkedIndividualColumns((previous) =>
            previous.includes(column)
                ? previous.filter((item) => item !== column)
                : [...previous, column],
        );
    };

    const togglePriceColumnLink = (tableId: string, column: PriceColumn) => {
        setUnlinkedPriceColumns((previous) => {
            const current = previous[tableId] ?? [];

            return {
                ...previous,
                [tableId]: current.includes(column)
                    ? current.filter((item) => item !== column)
                    : [...current, column],
            };
        });
    };
    // The saved mode decides which form an existing order reopens in. Without
    // this an edit would always land on Form 1 and silently discard whatever
    // the other modes had stored in the spec.
    const [sizeFormMode, setSizeFormMode] = useState<SizeFormMode>(() => {
        const savedMode = (
            order?.specification?.decoded as Record<string, unknown> | undefined
        )?.mode;

        // A saved bill reopens on the form it was written on. ชุดพละ used to
        // fall through to Form 1 here, which would have saved the bill back as
        // a plain size-table order under a name nobody chose.
        return savedMode === 'individual' ||
            savedMode === 'sports_day' ||
            savedMode === 'pe_uniform'
            ? savedMode
            : 'matrix';
    });
    const [shirtArtworkPreviewUrls, setShirtArtworkPreviewUrls] = useState<
        string[]
    >([]);
    const [pantsArtworkPreviewUrls, setPantsArtworkPreviewUrls] = useState<
        string[]
    >([]);

    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [validationTargets, setValidationTargets] = useState<
        Map<string, string>
    >(() => new Map());
    /**
     * The box to land on once the missing-fields dialog has closed. Taken
     * when the dialog hands focus back, so the dialog does not return it to
     * the save button straight after.
     */
    const pendingJumpRef = useRef<string | null>(null);
    const [showFieldErrors, setShowFieldErrors] = useState(false);

    // What this form has done to each catalog since the page loaded, keyed by
    // storage_key rather than by field, so a change made from one field (e.g.
    // pants fabric colour) shows in every field backed by the same catalog
    // (e.g. shirt fabric colour) straight away.
    const [catalogPatches, setCatalogPatches] = useState<
        Record<string, CatalogPatch>
    >({});

    // Saved artwork still on the order, with anything the user removed in this
    // session already filtered out so the gallery matches what will be saved.
    const visibleSavedMedia = (
        media: SavedArtwork[] | null | undefined,
    ): SavedArtwork[] =>
        (media ?? []).filter(
            (item) => !data.removed_media_ids.includes(item.id),
        );

    const removeSavedMedia = (id: number) => {
        setData('removed_media_ids', [...data.removed_media_ids, id]);
    };

    const patchCatalog = (
        storageKey: string,
        change: (patch: CatalogPatch) => CatalogPatch,
    ) => {
        setCatalogPatches((prev) => ({
            ...prev,
            [storageKey]: change(prev[storageKey] ?? EMPTY_CATALOG_PATCH),
        }));
    };

    const handleOptionAdded = (storageKey: string, option: OptionItem) => {
        patchCatalog(storageKey, (patch) => ({
            ...patch,
            added: patch.added.some((item) => item.id === option.id)
                ? patch.added
                : [...patch.added, option],
            // Adding a name that was hidden brings the same row back.
            hidden: patch.hidden.filter((id) => id !== option.id),
        }));
    };

    const handleOptionRenamed = (storageKey: string, option: OptionItem) => {
        patchCatalog(storageKey, (patch) => ({
            ...patch,
            renamed: { ...patch.renamed, [String(option.id)]: option.name },
        }));
    };

    /**
     * A hidden row leaves the choices at once. Any spec field on the bill
     * still pointing at it is cleared, so the bill cannot be saved with a
     * value the counter can no longer see or pick.
     */
    const handleOptionHidden = (storageKey: string, option: OptionItem) => {
        patchCatalog(storageKey, (patch) => ({
            ...patch,
            hidden: patch.hidden.includes(option.id)
                ? patch.hidden
                : [...patch.hidden, option.id],
        }));

        const hiddenValue = String(option.id);
        const clearMatching = <T extends Record<string, string>>(
            specs: T,
            keys: CatalogKeyMap,
        ): T => {
            const next = { ...specs };

            Object.entries(SPEC_FIELD_CATALOG_SOURCE).forEach(
                ([field, source]) => {
                    if (
                        keys[source] === storageKey &&
                        next[field] === hiddenValue
                    ) {
                        (next as Record<string, string>)[field] = '';
                    }
                },
            );

            return next;
        };

        // Every spec on the bill, wherever it lives: the bill's own, each
        // Form 1 table's and each Form 2 sheet's.
        setData((previous) => ({
            ...previous,
            shirt_specs: clearMatching(previous.shirt_specs, shirtCatalogKeys),
            pants_specs: clearMatching(previous.pants_specs, pantsCatalogKeys),
            garment_tables: previous.garment_tables.map((table) =>
                table.garment === 'pants'
                    ? {
                          ...table,
                          specs: clearMatching(table.specs, pantsCatalogKeys),
                      }
                    : {
                          ...table,
                          specs: clearMatching(table.specs, shirtCatalogKeys),
                      },
            ),
            individual_sheet_specs: Object.fromEntries(
                Object.entries(previous.individual_sheet_specs).map(
                    ([key, specs]) => [
                        key,
                        key.startsWith('pants_')
                            ? clearMatching(
                                  specs as PantsSpecsForm,
                                  pantsCatalogKeys,
                              )
                            : clearMatching(
                                  specs as ShirtSpecsForm,
                                  shirtCatalogKeys,
                              ),
                    ],
                ),
            ),
        }));
    };

    /** The options a field shows: what the server sent plus this session's changes. */
    const catalogOptions = (
        storageKey: string | undefined,
        baseOptions: OptionItem[],
    ): OptionItem[] =>
        storageKey
            ? applyCatalogPatch(baseOptions, catalogPatches[storageKey])
            : baseOptions;

    /** Same catalogs the dropdowns show, for the name snapshot the bill saves. */
    const withCatalogPatches = (
        catalogs: CatalogMap,
        keys: CatalogKeyMap,
    ): CatalogMap => {
        const merged: CatalogMap = { ...catalogs };

        Object.keys(SPEC_FIELD_CATALOG_SOURCE).forEach((field) => {
            const source = SPEC_FIELD_CATALOG_SOURCE[field];
            merged[source] = catalogOptions(
                keys[source],
                catalogs[source] ?? [],
            );
        });

        return merged;
    };

    /** The manage-dialog wiring for one catalog, or nothing for add-only use. */
    const manageFor = (storageKey: string) =>
        ({
            canEdit: canManageMasterData,
            onRenamed: (option: OptionItem) =>
                handleOptionRenamed(storageKey, option),
            onHidden: (option: OptionItem) =>
                handleOptionHidden(storageKey, option),
        }) as const;

    const resolvedBranches = branches ?? [];
    const resolvedJobTypes = jobTypes ?? [];

    // Organisation / job names saved as master data from this form. New ones
    // are appended locally so they show up in the dropdown straight away,
    // without waiting for a page reload.
    const [extraJobNameOptions, setExtraJobNameOptions] = useState<
        OptionItem[]
    >([]);

    const resolvedJobNames = useMemo(() => {
        const merged = [...(jobNames ?? [])];

        for (const option of extraJobNameOptions) {
            if (!merged.some((item) => item.id === option.id)) {
                merged.push(option);
            }
        }

        return merged;
    }, [jobNames, extraJobNameOptions]);
    const resolvedShirtCatalogs = shirtCatalogs ?? {};
    const resolvedPantsCatalogs = pantsCatalogs ?? {};
    const resolvedShirtTypes = shirtTypes ?? [];
    const resolvedPantsTypes = pantsTypes ?? [];

    const resolvedKidsSizes = kidsSizes ?? [];
    const resolvedJuniorSizes = juniorSizes ?? [];
    const resolvedAdultSizes = adultSizes ?? [];

    /**
     * The sizes a tier is sold in. ประถม - มัธยมต้น keeps a list of its own; a
     * shop that has not filled it in yet falls back to the adult list rather
     * than offering an empty box.
     */
    const sizeOptionsForTier = (tier: SizeTier): string[] => {
        if (tier === 'kids') {
            return resolvedKidsSizes;
        }

        if (tier === 'junior') {
            return resolvedJuniorSizes.length > 0
                ? resolvedJuniorSizes
                : resolvedAdultSizes;
        }

        return resolvedAdultSizes;
    };

    const initialFormData = useMemo(
        () =>
            buildEditInitialFormData(order, {
                resolvedBranches,
                defaultBranchId,
                resolvedJobTypes,
                resolvedShirtTypes,
                resolvedPantsTypes,
                resolvedKidsSizes,
                resolvedAdultSizes,
            }),
        [
            order,
            resolvedBranches,
            defaultBranchId,
            resolvedJobTypes,
            resolvedShirtTypes,
            resolvedPantsTypes,
            resolvedKidsSizes,
            resolvedAdultSizes,
        ],
    );

    const { data, setData, post, put, processing, errors, transform } =
        useForm<OrderCreateFormData>(initialFormData);

    /** The sheets the list of people is cut on, as it stands now. */
    const individualSheetList = useMemo(
        () =>
            individualSheets(
                data.personalization_rows,
                data.individual_include_pants,
            ),
        [data.personalization_rows, data.individual_include_pants],
    );

    /** The sheets a spec is asked for, including ones nobody is on yet. */
    const individualSpecSheetList = useMemo(
        () =>
            individualSpecSheets(
                data.personalization_rows,
                data.individual_include_pants,
            ),
        [data.personalization_rows, data.individual_include_pants],
    );

    /**
     * Form 3 sells shirts only: no trouser columns on a colour house and no
     * trouser spec. A colour-house bill saved before that with trousers on it
     * keeps both when reopened, so nothing it was sold with disappears on the
     * next save. Decided from what the bill was opened with, so the columns
     * cannot vanish under the counter while they are editing it.
     */
    const sportsDayKeepsPants = useMemo(
        () =>
            initialFormData.sports_day_groups.some((group) =>
                group.rows.some((row) => row.pants_qty > 0),
            ),
        [initialFormData],
    );

    // ---- Art Work by production batch (Forms 1 and 4) ----

    const [artworkDialogOpen, setArtworkDialogOpen] = useState(false);

    /** The batches this bill will be split into — one printed sheet each. */
    const artworkBatches = useMemo(() => {
        if (usesSizeTables(sizeFormMode)) {
            return data.garment_tables.length > 0
                ? resolveGarmentTableBatches(data.garment_tables)
                : resolveArtworkBatches(data.size_tables);
        }

        if (sizeFormMode === 'individual') {
            return resolveIndividualArtworkBatches(
                data.personalization_rows,
                data.individual_include_pants,
            );
        }

        if (sizeFormMode === 'sports_day') {
            return resolveSportsDayArtworkBatches(data.sports_day_groups);
        }

        return [];
    }, [
        sizeFormMode,
        data.garment_tables,
        data.size_tables,
        data.personalization_rows,
        data.individual_include_pants,
        data.sports_day_groups,
    ]);

    const artworkSavedImages = useMemo(
        () => ({
            shirt: visibleSavedMedia(order?.shirt_artwork_media),
            pants: visibleSavedMedia(order?.pants_artwork_media),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [order, data.removed_media_ids],
    );

    const artworkFiles = {
        shirt: data.shirt_artwork_files,
        pants: data.pants_artwork_files,
    };

    const artworkScopedFiles = {
        shirt: data.shirt_artwork_scoped,
        pants: data.pants_artwork_scoped,
    };

    /**
     * A bill is pinning artwork to batches as soon as anything is pinned —
     * a file dropped into a batch, or a saved image moved to one. Nothing
     * extra is stored: the artwork itself says which way the bill is drawn up.
     */
    const artworkSplitByBatch =
        Object.values(data.shirt_artwork_scoped).some(
            (files) => files.length > 0,
        ) ||
        Object.values(data.pants_artwork_scoped).some(
            (files) => files.length > 0,
        ) ||
        (['shirt', 'pants'] as const).some((garment) =>
            artworkSavedImages[garment].some(
                (image) =>
                    savedImageScope(image, data.artwork_scopes) !==
                    ARTWORK_SCOPE_ALL,
            ),
        );

    const [artworkSplitRequested, setArtworkSplitRequested] = useState(false);
    const showArtworkSplit = artworkSplitByBatch || artworkSplitRequested;

    const scopedFileKey = (garment: ArtworkGarment) =>
        garment === 'shirt'
            ? ('shirt_artwork_scoped' as const)
            : ('pants_artwork_scoped' as const);

    const unscopedFileKey = (garment: ArtworkGarment) =>
        garment === 'shirt'
            ? ('shirt_artwork_files' as const)
            : ('pants_artwork_files' as const);

    const addArtworkFiles = (
        garment: ArtworkGarment,
        batchKey: string,
        files: File[],
    ) => {
        if (batchKey === ARTWORK_SCOPE_ALL) {
            const key = unscopedFileKey(garment);

            setData(key, [...data[key], ...files]);

            return;
        }

        const key = scopedFileKey(garment);

        setData(key, {
            ...data[key],
            [batchKey]: [...(data[key][batchKey] ?? []), ...files],
        });
    };

    const removeArtworkFile = (
        garment: ArtworkGarment,
        batchKey: string,
        index: number,
    ) => {
        if (batchKey === ARTWORK_SCOPE_ALL) {
            const key = unscopedFileKey(garment);

            setData(
                key,
                data[key].filter((_, position) => position !== index),
            );

            return;
        }

        const key = scopedFileKey(garment);

        setData(key, {
            ...data[key],
            [batchKey]: (data[key][batchKey] ?? []).filter(
                (_, position) => position !== index,
            ),
        });
    };

    const moveSavedArtwork = (id: number, batchKey: string) => {
        setData('artwork_scopes', {
            ...data.artwork_scopes,
            [String(id)]: batchKey,
        });
    };

    /**
     * Going back to one design for the whole bill unpins everything: the
     * images stay, they simply go on every sheet of their garment again.
     */
    const setArtworkSplitByBatch = (split: boolean) => {
        setArtworkSplitRequested(split);

        if (split) {
            return;
        }

        const movedBack: Record<string, string> = { ...data.artwork_scopes };

        (['shirt', 'pants'] as const).forEach((garment) => {
            artworkSavedImages[garment].forEach((image) => {
                if (
                    savedImageScope(image, data.artwork_scopes) !==
                    ARTWORK_SCOPE_ALL
                ) {
                    movedBack[String(image.id)] = ARTWORK_SCOPE_ALL;
                }
            });
        });

        setData((previous) => ({
            ...previous,
            artwork_scopes: movedBack,
            shirt_artwork_files: [
                ...previous.shirt_artwork_files,
                ...Object.values(previous.shirt_artwork_scoped).flat(),
            ],
            pants_artwork_files: [
                ...previous.pants_artwork_files,
                ...Object.values(previous.pants_artwork_scoped).flat(),
            ],
            shirt_artwork_scoped: {},
            pants_artwork_scoped: {},
        }));
    };

    const artworkBatchesMissing = batchesMissingArtwork(
        artworkBatches,
        artworkFiles,
        artworkScopedFiles,
        artworkSavedImages,
        data.artwork_scopes,
        showArtworkSplit,
    );

    const artworkAttachedCount =
        data.shirt_artwork_files.length +
        data.pants_artwork_files.length +
        Object.values(data.shirt_artwork_scoped).flat().length +
        Object.values(data.pants_artwork_scoped).flat().length +
        artworkSavedImages.shirt.length +
        artworkSavedImages.pants.length;

    /**
     * Artwork the bill carries that is not pinned to any sheet — it prints on
     * every sheet of its garment. Forms 1 and 4 no longer take artwork that
     * way: each table takes its own, pinned by where it sits. A bill written
     * before that, or copied from one, can still be carrying some, and it has
     * to stay reachable rather than ride along invisibly.
     */
    const unpinnedArtworkCount =
        data.shirt_artwork_files.length +
        data.pants_artwork_files.length +
        (['shirt', 'pants'] as const).reduce(
            (total, garment) =>
                total +
                artworkSavedImages[garment].filter(
                    (image) =>
                        savedImageScope(image, data.artwork_scopes) ===
                        ARTWORK_SCOPE_ALL,
                ).length,
            0,
        );

    /**
     * Form 2 pictures pinned to a sheet the list no longer produces — someone
     * changed sleeve, or left — would otherwise sit on no gallery at all. The
     * Art Work dialog stays offered while there are any, so they can be moved
     * or removed.
     */
    const strayIndividualArtworkCount = (() => {
        if (sizeFormMode !== 'individual') {
            return 0;
        }

        const current = new Set(
            individualSpecSheetList.map((sheet) => sheet.key),
        );

        return (
            (['shirt', 'pants'] as const).reduce(
                (total, garment) =>
                    total +
                    artworkSavedImages[garment].filter((image) => {
                        const scope = savedImageScope(
                            image,
                            data.artwork_scopes,
                        );

                        return (
                            scope !== ARTWORK_SCOPE_ALL && !current.has(scope)
                        );
                    }).length,
                0,
            ) +
            [
                ...Object.entries(data.shirt_artwork_scoped),
                ...Object.entries(data.pants_artwork_scoped),
            ].reduce(
                (total, [key, files]) =>
                    total + (current.has(key) ? 0 : files.length),
                0,
            )
        );
    })();

    const selectedBranch = useMemo(
        () =>
            resolvedBranches.find(
                (branch) => String(branch.id) === data.branch_id,
            ) ?? null,
        [resolvedBranches, data.branch_id],
    );

    // Job types come from the server (catalog_items) so every machine sees the
    // same list. The browser copy is no longer consulted here — it is imported
    // once from the ประเภทงาน settings page.

    useEffect(() => {
        if (!data.branch_id && resolvedBranches[0]) {
            setData('branch_id', String(resolvedBranches[0].id));
        }
    }, [data.branch_id, resolvedBranches, setData]);

    // Previews are the object URLs of files waiting to be uploaded, one per
    // pending file and in the same order. Artwork already saved on the order is
    // rendered from its media list instead, so the two never get mixed up.
    useEffect(() => {
        if (data.shirt_artwork_files.length === 0) {
            setShirtArtworkPreviewUrls([]);

            return;
        }

        const nextUrls = data.shirt_artwork_files.map((file) =>
            URL.createObjectURL(file),
        );

        setShirtArtworkPreviewUrls(nextUrls);

        return () => {
            nextUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [data.shirt_artwork_files, order]);

    useEffect(() => {
        if (data.pants_artwork_files.length === 0) {
            setPantsArtworkPreviewUrls([]);

            return;
        }

        const nextUrls = data.pants_artwork_files.map((file) =>
            URL.createObjectURL(file),
        );

        setPantsArtworkPreviewUrls(nextUrls);

        return () => {
            nextUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [data.pants_artwork_files, order]);

    /**
     * Tables whose price column the counter has unlinked. Holding the
     * exceptions rather than the rule means a table added later opens linked,
     * which is how nearly every bill is priced.
     */
    const [unlinkedPriceTables, setUnlinkedPriceTables] = useState<string[]>(
        [],
    );

    /**
     * True while the bill on screen was written on the retired set layout.
     * A walk over a handful of rows, so it is read straight rather than
     * memoised — one less hook in a component that already has many.
     */
    const editingLegacySizeRows = usesLegacySizeRows(data.size_tables);

    const matrixGrossAmount = useMemo(
        () =>
            editingLegacySizeRows
                ? data.size_tables
                      .flatMap((table) => table.rows)
                      .reduce((total, row) => total + rowTotal(row), 0)
                : data.garment_tables.reduce(
                      (total, table) =>
                          total + garmentTableTotals(table).amount,
                      0,
                  ),
        [data.garment_tables, data.size_tables, editingLegacySizeRows],
    );

    const individualGrossAmount = useMemo(
        () =>
            data.personalization_rows.reduce(
                (total, row) =>
                    total +
                    rowIndividualTotal(row, data.individual_include_pants),
                0,
            ),
        [data.personalization_rows, data.individual_include_pants],
    );

    const individualNamedCount = useMemo(
        () =>
            data.personalization_rows.filter(
                (row) => !isBlankPersonalizationRow(row),
            ).length,
        [data.personalization_rows],
    );

    const individualTotalPieces = useMemo(
        () =>
            data.personalization_rows
                .filter((row) => !isBlankPersonalizationRow(row))
                .reduce(
                    (total, row) =>
                        total +
                        Math.max(row.quantity, 0) +
                        (data.individual_include_pants
                            ? Math.max(row.pants_quantity, 0)
                            : 0),
                    0,
                ),
        [data.personalization_rows, data.individual_include_pants],
    );

    const sportsDayTotalPieces = useMemo(
        () =>
            data.sports_day_groups.reduce(
                (total, group) => total + sportsDayGroupPieces(group),
                0,
            ),
        [data.sports_day_groups],
    );

    const sportsDayGrossAmount = useMemo(
        () =>
            data.sports_day_groups.reduce(
                (total, group) => total + sportsDayGroupTotal(group),
                0,
            ),
        [data.sports_day_groups],
    );

    const grossAmount = usesSizeTables(sizeFormMode)
        ? matrixGrossAmount
        : sizeFormMode === 'sports_day'
          ? sportsDayGrossAmount
          : individualGrossAmount;
    const discountPercent = Math.max(
        Math.min(toNumber(data.discount_percent), 50),
        0,
    );
    const discountAmount = (grossAmount * discountPercent) / 100;
    const derivedLineItems = useMemo(() => {
        if (usesSizeTables(sizeFormMode)) {
            return usesLegacySizeRows(data.size_tables)
                ? buildLineItemsFromMatrix(data.size_tables)
                : buildItemsFromGarmentTables(data.garment_tables).map(
                      (line) => ({
                          quantity: line.quantity,
                          unit_price: line.unit_price,
                          discount_id: null,
                      }),
                  );
        }

        if (sizeFormMode === 'sports_day') {
            return buildLineItemsFromSportsDay(data.sports_day_groups);
        }

        return buildLineItemsFromIndividual(
            data.personalization_rows,
            data.individual_include_pants,
        );
    }, [
        sizeFormMode,
        data.garment_tables,
        data.size_tables,
        data.sports_day_groups,
        data.personalization_rows,
        data.individual_include_pants,
    ]);

    const netAmount = Math.max(grossAmount - discountAmount, 0);
    const remainingAmount = Math.max(netAmount - data.deposit_amount, 0);
    const sizeOptionsByGroup = useMemo(
        () => ({
            kids: resolvedKidsSizes,
            adults: resolvedAdultSizes,
        }),
        [resolvedKidsSizes, resolvedAdultSizes],
    );

    const updateShirtSpecs = <K extends keyof ShirtSpecsForm>(
        key: K,
        value: ShirtSpecsForm[K],
    ) => {
        setData('shirt_specs', {
            ...data.shirt_specs,
            [key]: value,
        });
    };

    const updatePantsSpecs = <K extends keyof PantsSpecsForm>(
        key: K,
        value: PantsSpecsForm[K],
    ) => {
        setData('pants_specs', {
            ...data.pants_specs,
            [key]: value,
        });
    };

    // Radix Select keeps a hidden native <select> for form submission. When the
    // spec tab is switched away and back, that element remounts before its
    // <option> list does and fires a change with an empty value, which used to
    // wipe the saved choice. A dropdown has no empty option to pick, so an empty
    // value can only be that echo -- never the user. The shirt type is the one
    // dropdown left on the spec card; the catalog fields are comboboxes and use
    // the plain updaters, where clearing the box is a real edit.
    const selectShirtSpec = <K extends keyof ShirtSpecsForm>(
        key: K,
        value: string,
    ) => {
        if (value !== '') {
            updateShirtSpecs(key, value as ShirtSpecsForm[K]);
        }
    };

    const updateSizeRow = <K extends keyof SizeRowForm>(
        tableId: string,
        rowId: string,
        key: K,
        value: SizeRowForm[K],
    ) => {
        setData(
            'size_tables',
            data.size_tables.map((table) => {
                if (table.id !== tableId) {
                    return table;
                }

                // Most bills charge one price for every size. While a price
                // column is linked, editing the first row sets that column for
                // the whole table; any other row still edits on its own, and the
                // link stays on so the first row can sweep it again later.
                const sweep =
                    isPriceColumn(key) &&
                    isPriceColumnLinked(table.id, key as PriceColumn) &&
                    table.rows.length > 0 &&
                    table.rows[0].id === rowId;

                // While a row's set counts are linked, typing into either box
                // fills both -- a set cannot have more shirts than trousers.
                const mirrorSetQty =
                    (key === 'set_shirt_qty' || key === 'set_pants_qty') &&
                    isSetQtyLinked(rowId);

                return {
                    ...table,
                    rows: table.rows.map((row) => {
                        if (row.id === rowId) {
                            return mirrorSetQty
                                ? {
                                      ...row,
                                      set_shirt_qty: value as number,
                                      set_pants_qty: value as number,
                                  }
                                : { ...row, [key]: value };
                        }

                        return sweep ? { ...row, [key]: value } : row;
                    }),
                };
            }),
        );
    };

    // ---- Form 3 (กีฬาสี) handlers ----

    const updateSportsDayGroups = (groups: SportsDayGroupForm[]) => {
        setData('sports_day_groups', groups);
    };

    const patchSportsDayGroup = (
        groupId: string,
        patch: Partial<SportsDayGroupForm>,
    ) => {
        updateSportsDayGroups(
            data.sports_day_groups.map((group) =>
                group.id === groupId ? { ...group, ...patch } : group,
            ),
        );
    };

    const patchSportsDayRow = (
        groupId: string,
        rowId: string,
        patch: Partial<SportsDayRowForm>,
    ) => {
        updateSportsDayGroups(
            data.sports_day_groups.map((group) => {
                if (group.id !== groupId) {
                    return group;
                }

                // Editing a linked price on the first row sets it for the whole
                // colour house, which is how these bills are actually priced.
                const isFirstRow = group.rows[0]?.id === rowId;
                const sweep: Partial<SportsDayRowForm> = {};

                for (const column of ['shirt_price', 'pants_price'] as const) {
                    if (
                        isFirstRow &&
                        patch[column] !== undefined &&
                        isSportsDayPriceLinked(group.id, column)
                    ) {
                        sweep[column] = patch[column];
                    }
                }

                return {
                    ...group,
                    rows: group.rows.map((row) =>
                        row.id === rowId
                            ? { ...row, ...patch }
                            : { ...row, ...sweep },
                    ),
                };
            }),
        );
    };

    /**
     * Colour houses in one sports day share the same size list and prices and
     * differ only in name, colour and quantities — so a new house starts as a
     * copy of the first one with the quantities cleared, instead of an empty
     * table the counter has to rebuild by hand for every house.
     */
    const addSportsDayGroup = () => {
        const template = data.sports_day_groups[0];
        const next = createSportsDayGroup();

        updateSportsDayGroups([
            ...data.sports_day_groups,
            template
                ? {
                      ...next,
                      rows: template.rows.map((row) => ({
                          ...row,
                          id: uid('sd-row'),
                          shirt_qty: 0,
                          pants_qty: 0,
                      })),
                  }
                : next,
        ]);
    };

    const removeSportsDayGroup = (groupId: string) => {
        if (data.sports_day_groups.length <= 1) {
            return;
        }

        updateSportsDayGroups(
            data.sports_day_groups.filter((group) => group.id !== groupId),
        );
        // Pictures picked for a house that is gone go with it, rather than
        // land on whichever house takes its place.
        setData((previous) => {
            const remaining = { ...previous.sports_day_artwork_files };

            delete remaining[groupId];

            return { ...previous, sports_day_artwork_files: remaining };
        });
    };

    const addSportsDayRow = (groupId: string) => {
        updateSportsDayGroups(
            data.sports_day_groups.map((group) =>
                group.id === groupId
                    ? { ...group, rows: [...group.rows, createSportsDayRow()] }
                    : group,
            ),
        );
    };

    const removeSportsDayRow = (groupId: string, rowId: string) => {
        updateSportsDayGroups(
            data.sports_day_groups.map((group) =>
                group.id === groupId && group.rows.length > 1
                    ? {
                          ...group,
                          rows: group.rows.filter((row) => row.id !== rowId),
                      }
                    : group,
            ),
        );
    };

    const removeSizeTable = (tableId: string) => {
        if (data.size_tables.length <= 1) {
            return;
        }

        setData(
            'size_tables',
            data.size_tables.filter((table) => table.id !== tableId),
        );
    };

    /**
     * The type a new table starts on: the first one cut in its length, since
     * that is the rate card the sheet will be costed from. Empty when the shop
     * has not set one up for that length yet.
     */
    const defaultTypeIdFor = (
        types: OptionItem[],
        style: GarmentStyle,
    ): string => {
        const match = types.find((type) => type.style === style);

        return match ? String(match.id) : '';
    };

    const setGarmentTables = (tables: GarmentTable[]) =>
        setData('garment_tables', tables);

    /**
     * A table's price column starts linked, because most bills charge one
     * price for every size. Only the tables the counter has unlinked are
     * remembered, so a table added later opens linked like the rest.
     */
    const isTablePriceLinked = (tableId: string) =>
        !unlinkedPriceTables.includes(tableId);

    const toggleTablePriceLink = (tableId: string) =>
        setUnlinkedPriceTables((current) =>
            current.includes(tableId)
                ? current.filter((id) => id !== tableId)
                : [...current, tableId],
        );

    /**
     * Opens a tier: one shirt table and one pair of trousers, both short,
     * which is the shape most bills take. Lengths the bill already has are
     * left alone rather than duplicated — two tables for one sheet would be
     * two specs and nothing to say which the floor sews from.
     */
    /**
     * Adds one tier of one garment.
     *
     * The new table copies the spec of a table the bill already has for that
     * garment, because a bill almost always sells the same shirt in two size
     * ranges: same fabric, same colour, same collar. Only the garment type is
     * left to be chosen, since a kids' pattern and an adult one are separate
     * types with separate rate cards — carrying one across would cost the new
     * sheet from the wrong card.
     *
     * Sizes and prices are not copied: they are what differs between tiers.
     */
    const addGarmentTable = (garment: GarmentKind, tier: SizeTier) => {
        const style = stylesFor(garment).find(
            (candidate) =>
                !hasGarmentTableFor(
                    data.garment_tables,
                    garment,
                    tier,
                    candidate,
                ),
        );

        // Every length of this garment in this tier is already on the bill.
        if (!style) {
            return;
        }

        const source = data.garment_tables.find(
            (table) => table.garment === garment,
        );

        const added: GarmentTable =
            garment === 'pants'
                ? createPantsTable(tier, style as PantsStyle, {
                      ...(source?.garment === 'pants'
                          ? source.specs
                          : emptyPantsSpecs()),
                      pants_type_id: defaultTypeIdFor(
                          resolvedPantsTypes,
                          style,
                      ),
                  })
                : createShirtTable(tier, style, {
                      ...(source?.garment === 'shirt'
                          ? source.specs
                          : emptyShirtSpecs()),
                      shirt_type_id: defaultTypeIdFor(
                          resolvedShirtTypes,
                          style,
                      ),
                  });

        setGarmentTables([...data.garment_tables, added]);
    };

    /** Another length of a garment the bill already sells in this tier. */
    const addGarmentTableStyle = (
        garment: GarmentKind,
        tier: SizeTier,
        style: GarmentStyle,
    ) => {
        if (hasGarmentTableFor(data.garment_tables, garment, tier, style)) {
            return;
        }

        setGarmentTables([
            ...data.garment_tables,
            garment === 'pants'
                ? createPantsTable(
                      tier,
                      style as PantsStyle,
                      emptyPantsSpecs(
                          defaultTypeIdFor(resolvedPantsTypes, style),
                      ),
                  )
                : createShirtTable(
                      tier,
                      style,
                      emptyShirtSpecs(
                          defaultTypeIdFor(resolvedShirtTypes, style),
                      ),
                  ),
        ]);
    };

    const removeGarmentTable = (tableId: string) => {
        setGarmentTables(
            data.garment_tables.filter((table) => table.id !== tableId),
        );
    };

    const mapGarmentTable = (
        tableId: string,
        change: (table: GarmentTable) => GarmentTable,
    ) =>
        setGarmentTables(
            data.garment_tables.map((table) =>
                table.id === tableId ? change(table) : table,
            ),
        );

    const addGarmentTableRow = (tableId: string) =>
        mapGarmentTable(tableId, (table) => {
            // While the price column is linked the table charges one price for
            // every size, so a row added to it opens at that price rather than
            // at nothing the counter then has to retype.
            const linkedPrice =
                isTablePriceLinked(table.id) && table.rows.length > 0
                    ? table.rows[0].unit_price
                    : 0;

            return {
                ...table,
                rows: [
                    ...table.rows,
                    { ...createGarmentTableRow(), unit_price: linkedPrice },
                ],
            };
        });

    const removeGarmentTableRow = (tableId: string, rowId: string) =>
        mapGarmentTable(tableId, (table) =>
            table.rows.length <= 1
                ? table
                : {
                      ...table,
                      rows: table.rows.filter((row) => row.id !== rowId),
                  },
        );

    const updateGarmentTableRow = (
        tableId: string,
        rowId: string,
        change: Partial<Omit<GarmentTableRow, 'id'>>,
    ) =>
        mapGarmentTable(tableId, (table) => {
            // Most bills charge one price for every size. While the price
            // column is linked, editing the first row sets it for the whole
            // table; any other row still edits on its own, and the link stays
            // on so the first row can sweep it again later.
            const sweepPrice =
                change.unit_price !== undefined &&
                isTablePriceLinked(table.id) &&
                table.rows[0]?.id === rowId;

            return {
                ...table,
                rows: table.rows.map((row) => {
                    if (row.id === rowId) {
                        return { ...row, ...change };
                    }

                    return sweepPrice
                        ? { ...row, unit_price: change.unit_price as number }
                        : row;
                }),
            };
        });

    /**
     * Changing a table's length changes which sheet it is, so a length the
     * bill already has is refused rather than silently merged into it.
     */
    const changeGarmentTableStyle = (tableId: string, style: GarmentStyle) => {
        const target = data.garment_tables.find(
            (table) => table.id === tableId,
        );

        if (
            !target ||
            hasGarmentTableFor(
                data.garment_tables,
                target.garment,
                target.tier,
                style,
            )
        ) {
            return;
        }

        // The type is what the labour rate is read from, and a type is made in
        // one length. Carrying the old length's type across would cost the
        // sheet from a rate card for a garment nobody is making, so the type
        // moves to the first one cut in the new length — or to nothing, if the
        // shop has not set one up yet.
        mapGarmentTable(tableId, (table) => {
            if (table.garment === 'pants') {
                const nextType = resolvedPantsTypes.find(
                    (type) => type.style === style,
                );

                return {
                    ...table,
                    style: style as PantsStyle,
                    specs: {
                        ...table.specs,
                        pants_type_id: nextType ? String(nextType.id) : '',
                    },
                };
            }

            const nextType = resolvedShirtTypes.find(
                (type) => type.style === style,
            );

            return {
                ...table,
                style,
                specs: {
                    ...table.specs,
                    shirt_type_id: nextType ? String(nextType.id) : '',
                },
            };
        });
    };

    /**
     * Two tables of the same garment usually differ in a field or two — the
     * same polo in two size ranges shares its fabric, its colour and its
     * collar. Copying one table's spec onto another is a great deal less work
     * than retyping twenty boxes, and a great deal less likely to disagree
     * with itself.
     */
    const copyGarmentTableSpecs = (targetId: string, sourceId: string) => {
        const source = data.garment_tables.find(
            (table) => table.id === sourceId,
        );

        if (!source) {
            return;
        }

        mapGarmentTable(targetId, (table) =>
            table.garment === source.garment
                ? ({ ...table, specs: { ...source.specs } } as GarmentTable)
                : table,
        );
    };

    const updateShirtTableSpecs = <K extends keyof ShirtSpecsForm>(
        tableId: string,
        key: K,
        value: ShirtSpecsForm[K],
    ) =>
        mapGarmentTable(tableId, (table) =>
            table.garment === 'shirt'
                ? { ...table, specs: { ...table.specs, [key]: value } }
                : table,
        );

    const updatePantsTableSpecs = <K extends keyof PantsSpecsForm>(
        tableId: string,
        key: K,
        value: PantsSpecsForm[K],
    ) =>
        mapGarmentTable(tableId, (table) =>
            table.garment === 'pants'
                ? { ...table, specs: { ...table.specs, [key]: value } }
                : table,
        );

    // ---- Form 2: a spec per sheet, as Form 1 keeps one per table ----

    /**
     * The spec a sheet starts from, the way Form 1 starts a table added beside
     * another: from a spec the bill already has for that garment, with the
     * garment type left to pick — a long sleeve is a different type and a
     * different rate from a short one, so it has to be chosen, and the
     * heading says so. Another sheet on the list is preferred; failing that,
     * one the list no longer produces, so switching everyone from short to
     * long sleeves keeps what was typed rather than starting from nothing.
     * The very first sheet of a garment starts from the bill's own spec.
     */
    const seedSheetSpec = (
        sheet: IndividualSheet,
    ): ShirtSpecsForm | PantsSpecsForm => {
        const billSpec =
            sheet.garment === 'pants' ? data.pants_specs : data.shirt_specs;
        const onList = individualSpecSheetList.find(
            (other) =>
                other.garment === sheet.garment &&
                other.key !== sheet.key &&
                data.individual_sheet_specs[other.key] !== undefined,
        );
        const offList = Object.keys(data.individual_sheet_specs).filter(
            (key) => key.startsWith(`${sheet.garment}_`) && key !== sheet.key,
        );
        const baseKey =
            onList?.key ??
            offList.find((key) =>
                key.startsWith(`${sheet.garment}_${sheet.tier}_`),
            ) ??
            offList[0];

        if (baseKey === undefined) {
            return billSpec;
        }

        const base = data.individual_sheet_specs[baseKey];

        return sheet.garment === 'pants'
            ? { ...(base as PantsSpecsForm), pants_type_id: '' }
            : { ...(base as ShirtSpecsForm), shirt_type_id: '' };
    };

    /** The spec a sheet is sewn from. */
    const sheetSpecFor = (
        sheet: IndividualSheet,
    ): ShirtSpecsForm | PantsSpecsForm =>
        data.individual_sheet_specs[sheet.key] ?? seedSheetSpec(sheet);

    /**
     * A sheet takes its own copy the moment it appears — someone is typed in
     * on a new length or size range — so from then on it is its own spec, and
     * nothing typed on one sheet ever shows on another.
     */
    useEffect(() => {
        if (sizeFormMode !== 'individual') {
            return;
        }

        const missing = individualSpecSheetList.filter(
            (sheet) => data.individual_sheet_specs[sheet.key] === undefined,
        );

        if (missing.length === 0) {
            return;
        }

        const seeds = Object.fromEntries(
            missing.map((sheet) => [sheet.key, seedSheetSpec(sheet)]),
        );

        setData((previous) => ({
            ...previous,
            individual_sheet_specs: {
                ...seeds,
                ...previous.individual_sheet_specs,
            },
        }));
        // seedSheetSpec reads the same data this effect is keyed on.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sizeFormMode, individualSpecSheetList, data.individual_sheet_specs]);

    const updateSheetSpec = (
        sheet: IndividualSheet,
        key: string,
        value: string,
    ) =>
        setData('individual_sheet_specs', {
            ...data.individual_sheet_specs,
            [sheet.key]: {
                ...sheetSpecFor(sheet),
                [key]: value,
            } as ShirtSpecsForm | PantsSpecsForm,
        });

    /** As Form 1 copies one table's spec onto another of the same garment. */
    const copySheetSpec = (target: IndividualSheet, sourceKey: string) => {
        const source = individualSpecSheetList.find(
            (sheet) => sheet.key === sourceKey,
        );

        if (!source || source.garment !== target.garment) {
            return;
        }

        setData('individual_sheet_specs', {
            ...data.individual_sheet_specs,
            [target.key]: { ...sheetSpecFor(source) },
        });
    };

    /** Required boxes a sheet's spec still has empty. */
    const sheetSpecBlanks = (sheet: IndividualSheet): string[] => {
        const required = (
            sheet.garment === 'pants'
                ? REQUIRED_PANTS_SPEC_KEYS
                : REQUIRED_SHIRT_SPEC_KEYS
        ) as readonly string[];
        const specs = sheetSpecFor(sheet) as Record<string, unknown>;

        return required.filter((key) => !String(specs[key] ?? '').trim());
    };

    /** The shirt and trousers spec that stand for a Form 2 bill as a whole. */
    const individualRepresentativeSpecs = (): {
        shirt: ShirtSpecsForm;
        pants: PantsSpecsForm;
    } => {
        const firstShirt = individualSheetList.find(
            (sheet) => sheet.garment === 'shirt',
        );
        const firstPants = individualSheetList.find(
            (sheet) => sheet.garment === 'pants',
        );

        return {
            shirt: firstShirt
                ? (sheetSpecFor(firstShirt) as ShirtSpecsForm)
                : data.shirt_specs,
            pants: firstPants
                ? (sheetSpecFor(firstPants) as PantsSpecsForm)
                : data.pants_specs,
        };
    };

    const [sheetSpecOpen, setSheetSpecOpen] = useState<Record<string, boolean>>(
        {},
    );

    const addSizeRow = (tableId: string) => {
        setData(
            'size_tables',
            data.size_tables.map((table) =>
                table.id === tableId
                    ? {
                          ...table,
                          rows: [...table.rows, createSizeRow('')],
                      }
                    : table,
            ),
        );
    };

    const removeSizeRow = (tableId: string, rowId: string) => {
        setData(
            'size_tables',
            data.size_tables.map((table) => {
                if (table.id !== tableId || table.rows.length <= 1) {
                    return table;
                }

                return {
                    ...table,
                    rows: table.rows.filter((row) => row.id !== rowId),
                };
            }),
        );
    };

    // ---- Form 1 / Form 4 garment tables ----

    /**
     * Garment lists whose price column is currently unlinked, keyed
     * `${tableId}:${list}`. Linked is the default: a bill almost always
     * charges one price for every size of a garment.
     */
    const [unlinkedGarmentPrices, setUnlinkedGarmentPrices] = useState<
        string[]
    >([]);

    const garmentPriceKey = (tableId: string, list: GarmentList): string =>
        `${tableId}:${list}`;

    const isGarmentPriceLinked = (
        tableId: string,
        list: GarmentList,
    ): boolean =>
        !unlinkedGarmentPrices.includes(garmentPriceKey(tableId, list));

    const toggleGarmentPriceLink = (tableId: string, list: GarmentList) => {
        const key = garmentPriceKey(tableId, list);

        setUnlinkedGarmentPrices((previous) =>
            previous.includes(key)
                ? previous.filter((item) => item !== key)
                : [...previous, key],
        );
    };

    const updateGarmentRow = <K extends keyof GarmentRowForm>(
        tableId: string,
        list: GarmentList,
        rowId: string,
        key: K,
        value: GarmentRowForm[K],
    ) => {
        setData(
            'size_tables',
            data.size_tables.map((table) => {
                if (table.id !== tableId) {
                    return table;
                }

                const rows = table[list];
                // While the price column is linked, typing a price on the first
                // row sets it for the whole list; every other row still edits
                // on its own, and the link stays on so the first row can sweep
                // it again later.
                const sweep =
                    key === 'unit_price' &&
                    isGarmentPriceLinked(tableId, list) &&
                    rows[0]?.id === rowId;

                return {
                    ...table,
                    [list]: rows.map((row) => {
                        if (row.id === rowId) {
                            return { ...row, [key]: value };
                        }

                        return sweep
                            ? { ...row, unit_price: value as number }
                            : row;
                    }),
                };
            }),
        );
    };

    const addGarmentRow = (tableId: string, list: GarmentList) => {
        setData(
            'size_tables',
            data.size_tables.map((table) => {
                if (table.id !== tableId) {
                    return table;
                }

                const rows = table[list];
                const nextRow = createGarmentRow();

                return {
                    ...table,
                    // A linked price is the price of this list, so a row added
                    // under it opens at that price instead of at zero.
                    [list]: [
                        ...rows,
                        isGarmentPriceLinked(tableId, list) && rows[0]
                            ? { ...nextRow, unit_price: rows[0].unit_price }
                            : nextRow,
                    ],
                };
            }),
        );
    };

    const removeGarmentRow = (
        tableId: string,
        list: GarmentList,
        rowId: string,
    ) => {
        setData(
            'size_tables',
            data.size_tables.map((table) => {
                if (table.id !== tableId || table[list].length <= 1) {
                    return table;
                }

                return {
                    ...table,
                    [list]: table[list].filter((row) => row.id !== rowId),
                };
            }),
        );
    };

    const updatePersonalization = <K extends keyof PersonalizationRowForm>(
        rowId: string,
        key: K,
        value: PersonalizationRowForm[K],
    ) => {
        // Editing a linked column on the first person sets it for the whole
        // list, which is how a team order is normally priced and cut.
        const sweepsDown =
            data.personalization_rows[0]?.id === rowId &&
            isIndividualLinkedColumn(key) &&
            isIndividualColumnLinked(key);

        setData(
            'personalization_rows',
            data.personalization_rows.map((row) => {
                if (row.id === rowId) {
                    return { ...row, [key]: value };
                }

                return sweepsDown ? { ...row, [key]: value } : row;
            }),
        );
    };

    const createPersonalizationRow = (): PersonalizationRowForm => {
        const first = data.personalization_rows[0];

        return {
            id: uid('person'),
            role: 'player',
            name: '',
            size_group: resolvedAdultSizes.length > 0 ? 'adults' : 'kids',
            size: '',
            // Short is what most of the shop's work is, and a person added to a
            // linked list joins on the length the list already agreed on.
            shirt_style:
                first && isIndividualColumnLinked('shirt_style')
                    ? first.shirt_style
                    : 'short',
            number: '',
            quantity: 1,
            // A person added while the column is linked joins at the list's
            // price rather than at zero.
            unit_price:
                first && isIndividualColumnLinked('unit_price')
                    ? first.unit_price
                    : 0,
            pants_size: '',
            pants_style:
                first && isIndividualColumnLinked('pants_style')
                    ? first.pants_style
                    : 'short',
            pants_number: '',
            pants_quantity: 0,
            pants_unit_price:
                first && isIndividualColumnLinked('pants_unit_price')
                    ? first.pants_unit_price
                    : 0,
        };
    };

    const addPersonalizationRow = () => {
        setData('personalization_rows', [
            ...data.personalization_rows,
            createPersonalizationRow(),
        ]);
    };

    /**
     * Form 2 opens with a few blank people ready to type into, like the size
     * table does. Rows restored from a saved order are left as they are.
     */
    const showIndividualForm = () => {
        setSizeFormMode('individual');

        if (data.personalization_rows.length === 0) {
            setData(
                'personalization_rows',
                Array.from({ length: NEW_PERSONALIZATION_ROWS }, () =>
                    createPersonalizationRow(),
                ),
            );
        }
    };

    const duplicatePersonalizationRow = (rowId: string) => {
        const source = data.personalization_rows.find(
            (row) => row.id === rowId,
        );

        if (!source) {
            return;
        }

        const duplicated: PersonalizationRowForm = {
            ...source,
            id: uid('person'),
        };

        setData('personalization_rows', [
            ...data.personalization_rows,
            duplicated,
        ]);
    };

    const removePersonalizationRow = (rowId: string) => {
        if (data.personalization_rows.length <= 1) {
            return;
        }

        setData(
            'personalization_rows',
            data.personalization_rows.filter((row) => row.id !== rowId),
        );
    };

    /**
     * Thumbnails for artwork pinned to a table, keyed by garment and batch.
     * Kept beside the unscoped previews above and revoked the same way, so a
     * picture swapped out does not leave its blob behind.
     */
    const [scopedArtworkPreviews, setScopedArtworkPreviews] = useState<
        Record<string, string[]>
    >({});

    useEffect(() => {
        const next: Record<string, string[]> = {};

        (['shirt', 'pants'] as const).forEach((garment) => {
            const scoped =
                garment === 'shirt'
                    ? data.shirt_artwork_scoped
                    : data.pants_artwork_scoped;

            Object.entries(scoped).forEach(([batchKey, files]) => {
                if (files.length > 0) {
                    next[`${garment}:${batchKey}`] = files.map((file) =>
                        URL.createObjectURL(file),
                    );
                }
            });
        });

        setScopedArtworkPreviews(next);

        return () => {
            Object.values(next)
                .flat()
                .forEach((url) => URL.revokeObjectURL(url));
        };
    }, [data.shirt_artwork_scoped, data.pants_artwork_scoped]);

    // Preview links for the pictures picked per colour house, made the same
    // way the tables' previews are and let go of when the pictures change.
    const [houseArtworkPreviews, setHouseArtworkPreviews] = useState<
        Record<string, string[]>
    >({});

    useEffect(() => {
        const next: Record<string, string[]> = {};

        Object.entries(data.sports_day_artwork_files).forEach(
            ([groupId, files]) => {
                if (files.length > 0) {
                    next[groupId] = files.map((file) =>
                        URL.createObjectURL(file),
                    );
                }
            },
        );

        setHouseArtworkPreviews(next);

        return () => {
            Object.values(next)
                .flat()
                .forEach((url) => URL.revokeObjectURL(url));
        };
    }, [data.sports_day_artwork_files]);

    /**
     * Pictures picked under a colour house belong to that house — the gallery
     * sits at the end of the house it is for, as a table's does on Forms 1
     * and 4, so there is nothing to choose. The production sheet prints them
     * on every sheet of that house.
     */
    const handleHouseArtworkSelect = async (
        groupId: string,
        event: ChangeEvent<HTMLInputElement>,
    ) => {
        const selectedFiles = Array.from(event.target.files ?? []);

        if (selectedFiles.length === 0) {
            return;
        }

        const compressedFiles = await Promise.all(
            selectedFiles.map((file) => compressImage(file)),
        );

        setData((previous) => ({
            ...previous,
            sports_day_artwork_files: {
                ...previous.sports_day_artwork_files,
                [groupId]: [
                    ...(previous.sports_day_artwork_files[groupId] ?? []),
                    ...compressedFiles,
                ],
            },
        }));
        event.target.value = '';
    };

    const removeHouseArtworkFile = (groupId: string, index: number) => {
        setData((previous) => ({
            ...previous,
            sports_day_artwork_files: {
                ...previous.sports_day_artwork_files,
                [groupId]: (
                    previous.sports_day_artwork_files[groupId] ?? []
                ).filter((_, position) => position !== index),
            },
        }));
    };

    /** Artwork the bill already carries, pinned to this table's sheet. */
    const savedArtworkForBatch = (
        garment: ArtworkGarment,
        batchKey: string,
    ): SavedArtwork[] =>
        artworkSavedImages[garment].filter(
            (image) => savedImageScope(image, data.artwork_scopes) === batchKey,
        );

    /**
     * Pictures picked for one table go straight onto that table's sheet — the
     * table says which sheet it is, so there is nothing for the counter to
     * choose and nothing to get wrong.
     */
    const handleTableArtworkSelect = async (
        garment: ArtworkGarment,
        batchKey: string,
        event: ChangeEvent<HTMLInputElement>,
    ) => {
        const selectedFiles = Array.from(event.target.files ?? []);

        if (selectedFiles.length === 0) {
            return;
        }

        const compressedFiles = await Promise.all(
            selectedFiles.map((file) => compressImage(file)),
        );

        addArtworkFiles(garment, batchKey, compressedFiles);
        event.target.value = '';
    };

    const handleShirtArtworkSelect = async (
        event: ChangeEvent<HTMLInputElement>,
    ) => {
        const selectedFiles = Array.from(event.target.files ?? []);

        if (selectedFiles.length === 0) {
            return;
        }

        const compressedFiles = await Promise.all(
            selectedFiles.map((file) => compressImage(file)),
        );

        setData((previous) => ({
            ...previous,
            shirt_artwork_files: [
                ...previous.shirt_artwork_files,
                ...compressedFiles,
            ],
        }));
        event.target.value = '';
    };

    const removeShirtArtworkAt = (index: number) => {
        setData((previous) => ({
            ...previous,
            shirt_artwork_files: previous.shirt_artwork_files.filter(
                (_, currentIndex) => currentIndex !== index,
            ),
        }));
    };

    const handlePantsArtworkSelect = async (
        event: ChangeEvent<HTMLInputElement>,
    ) => {
        const selectedFiles = Array.from(event.target.files ?? []);

        if (selectedFiles.length === 0) {
            return;
        }

        const compressedFiles = await Promise.all(
            selectedFiles.map((file) => compressImage(file)),
        );

        setData((previous) => ({
            ...previous,
            pants_artwork_files: [
                ...previous.pants_artwork_files,
                ...compressedFiles,
            ],
        }));
        event.target.value = '';
    };

    const removePantsArtworkAt = (index: number) => {
        setData((previous) => ({
            ...previous,
            pants_artwork_files: previous.pants_artwork_files.filter(
                (_, currentIndex) => currentIndex !== index,
            ),
        }));
    };

    // Required fields, keyed the same way the inputs are marked, so the message
    // list and the red boxes can never disagree about what is missing.
    const REQUIRED_SHIRT_SPEC_KEYS: Array<keyof ShirtSpecsForm> = [
        'shirt_type_id',
        'pattern_id',
        'fabric_id',
        'fabric_color_id',
        'neck_style_id',
        'neck_color_id',
        'collar_id',
        'placket_style_id',
        'placket_outer_color_id',
        'placket_inner_color_id',
        'sleeve_cuff_id',
        'screen_color_id',
        'embroidery_color_id',
        'sublimation_id',
        'sleeve_style_text',
        'piping_style_text',
        'stripe_style_text',
        'screen_text',
        'embroidery_code_text',
        'embroidery_note_text',
    ];
    const REQUIRED_PANTS_SPEC_KEYS: Array<keyof PantsSpecsForm> = [
        // pants_type_id is deliberately absent: the form no longer shows it, so
        // a missing one would be a required field nobody can reach.
        'pattern_id',
        'fabric_id',
        'fabric_color_id',
        'leg_style_id',
        'leg_cuff_id',
        'screen_color_id',
        'embroidery_color_id',
        'sublimation_id',
        'seat_style_text',
        'panel_style_text',
        'stripe_style_text',
        'screen_text',
        'embroidery_code_text',
        'embroidery_note_text',
    ];

    /**
     * Whether the size table actually orders this garment. The spec that
     * describes a garment is required exactly when the bill contains one, so a
     * bill with pants in the table can no longer be saved with the pants spec
     * left blank just because the counter never opened that tab.
     */
    /**
     * Tables the counter has folded away. A bill can carry fifteen of these —
     * three size ranges by three lengths of shirt, plus trousers — and a
     * finished one is a screen of boxes that are all already answered. Folded,
     * it is one line that still says what is on it.
     */
    const [foldedTables, setFoldedTables] = useState<Record<string, boolean>>(
        {},
    );

    const isTableFolded = (tableId: string): boolean =>
        foldedTables[tableId] ?? false;

    const toggleTableFolded = (tableId: string) =>
        setFoldedTables((current) => ({
            ...current,
            [tableId]: !isTableFolded(tableId),
        }));

    const foldEveryTable = (garment: GarmentKind, folded: boolean) =>
        setFoldedTables((current) => {
            const next = { ...current };

            data.garment_tables
                .filter((table) => table.garment === garment)
                .forEach((table) => {
                    next[table.id] = folded;
                });

            return next;
        });

    /** Pictures this table carries, new and already saved. */
    const tableArtworkCount = (table: GarmentTable): number => {
        const key = garmentTableKey(table);
        const scoped =
            table.garment === 'pants'
                ? data.pants_artwork_scoped
                : data.shirt_artwork_scoped;

        return (
            (scoped[key] ?? []).length +
            savedArtworkForBatch(table.garment, key).length
        );
    };

    /** How many of a table's required spec boxes are still empty. */
    const specBlanksFor = (table: GarmentTable): number => {
        const required =
            table.garment === 'pants'
                ? REQUIRED_PANTS_SPEC_KEYS
                : REQUIRED_SHIRT_SPEC_KEYS;
        const specs: Record<string, unknown> = table.specs;

        return (required as readonly string[]).filter(
            (key) => !String(specs[key] ?? '').trim(),
        ).length;
    };

    /**
     * Tables whose spec the counter has opened. A spec starts folded: a bill
     * with four tables would otherwise open as four screens of empty boxes,
     * and the sizes and prices above them are what gets typed first. The
     * heading says how much is still missing, so nothing is hidden by being
     * shut.
     */
    const [specOpenOverrides, setSpecOpenOverrides] = useState<
        Record<string, boolean>
    >({});

    const isSpecOpen = (table: GarmentTable): boolean =>
        specOpenOverrides[table.id] ?? false;

    const toggleSpecOpen = (table: GarmentTable) =>
        setSpecOpenOverrides((current) => ({
            ...current,
            [table.id]: !isSpecOpen(table),
        }));

    const orderIncludesGarment = (garment: 'shirt' | 'pants'): boolean => {
        if (sizeFormMode === 'individual') {
            const people = data.personalization_rows.filter(
                (row) => !isBlankPersonalizationRow(row),
            );

            return garment === 'shirt'
                ? people.some((row) => row.quantity > 0)
                : data.individual_include_pants &&
                      people.some((row) => row.pants_quantity > 0);
        }

        if (sizeFormMode === 'sports_day') {
            return data.sports_day_groups.some((group) =>
                group.rows.some((row) =>
                    garment === 'shirt' ? row.shirt_qty > 0 : row.pants_qty > 0,
                ),
            );
        }

        if (editingLegacySizeRows) {
            return data.size_tables.some((table) =>
                table.rows.some((row) =>
                    garment === 'shirt'
                        ? row.set_shirt_qty > 0 || row.separate_shirt_qty > 0
                        : row.set_pants_qty > 0 || row.separate_pants_qty > 0,
                ),
            );
        }

        return data.garment_tables.some(
            (table) =>
                table.garment === garment &&
                garmentTableTotals(table).quantity > 0,
        );
    };

    /**
     * The tables a bill actually orders from. A table left blank is not yet a
     * thing to make, so its spec is not yet something to insist on.
     */
    const orderedGarmentTables = (): GarmentTable[] =>
        data.garment_tables.filter(
            (table) => garmentTableTotals(table).quantity > 0,
        );

    const analyzeForm = (): {
        missing: string[];
        fields: Set<string>;
        targets: Map<string, string>;
    } => {
        const missing: string[] = [];
        const fields = new Set<string>();
        // The box each message is about, so the dialog can take the counter
        // straight to it rather than leave them to hunt for it.
        const targets = new Map<string, string>();
        const need = (message: string, field?: string) => {
            missing.push(message);

            if (field !== undefined && !targets.has(message)) {
                targets.set(message, field);
            }
        };

        if (!data.job_name.trim()) {
            need('ชื่อหน่วยงาน, ชื่องาน', 'job_name');
            fields.add('job_name');
        }

        if (!data.customer_name.trim()) {
            need('ชื่อลูกค้า', 'customer_name');
            fields.add('customer_name');
        }

        if (!data.billing_date) {
            missing.push('วันที่เปิดบิล');
        }

        if (!data.billing_time) {
            missing.push('เวลาเปิดบิล');
        }

        if (!data.due_date) {
            need('วันที่รับสินค้า', 'due_date');
            fields.add('due_date');
        }

        if (!data.branch_id) {
            need('สาขา', 'branch_id');
            fields.add('branch_id');
        }

        const requestItems = resolveRequestItems(
            sizeFormMode,
            data.size_tables,
            data.sports_day_groups,
            data.personalization_rows,
            data.individual_include_pants,
            data.garment_tables,
        );

        // Forms 1 and 4 write their rows on the garment tables. A row is only
        // billed once it has both a quantity and a price, so a row with a
        // quantity and no price would drop off the bill without a word, and
        // one with no size would be cut as "-".
        const tableRows =
            usesSizeTables(sizeFormMode) && !editingLegacySizeRows
                ? data.garment_tables.flatMap((table) => table.rows)
                : [];

        // Whether anything has been counted on this form yet. When it has, a
        // bill with no lines is short of a price or a size on those rows, and
        // the boxes to fix are theirs — not the form's first empty one.
        const nothingCounted =
            sizeFormMode === 'sports_day'
                ? data.sports_day_groups.every((group) =>
                      group.rows.every(
                          (row) => row.shirt_qty <= 0 && row.pants_qty <= 0,
                      ),
                  )
                : sizeFormMode === 'individual'
                  ? data.personalization_rows.every(isBlankPersonalizationRow)
                  : tableRows.every((row) => row.quantity <= 0);

        if (requestItems.length === 0 && !nothingCounted) {
            missing.push('จำนวนและราคาสินค้าอย่างน้อย 1 รายการ');
        }

        if (requestItems.length === 0 && nothingCounted) {
            // Where the first line of this form is typed.
            const firstTableRow = tableRows[0];
            const firstSportsDayRow = data.sports_day_groups[0]?.rows[0];
            const firstPerson = data.personalization_rows[0];
            const firstBox =
                sizeFormMode === 'sports_day'
                    ? firstSportsDayRow
                        ? `sd_row.${firstSportsDayRow.id}.shirt_qty`
                        : undefined
                    : sizeFormMode === 'individual'
                      ? firstPerson
                          ? `person.${firstPerson.id}.name`
                          : undefined
                      : firstTableRow
                        ? `garment_row.${firstTableRow.id}.quantity`
                        : undefined;

            need('จำนวนและราคาสินค้าอย่างน้อย 1 รายการ', firstBox);

            if (firstBox !== undefined) {
                fields.add(firstBox);
            }
        }

        const unsizedRows = tableRows.filter(
            (row) => row.quantity > 0 && row.size_label.trim() === '',
        );
        const unpricedRows = tableRows.filter(
            (row) => row.quantity > 0 && row.unit_price <= 0,
        );

        unsizedRows.forEach((row) =>
            fields.add(`garment_row.${row.id}.size_label`),
        );
        unpricedRows.forEach((row) =>
            fields.add(`garment_row.${row.id}.unit_price`),
        );

        if (unpricedRows.length > 0) {
            need(
                'ราคาของรายการที่กรอกจำนวนไว้',
                `garment_row.${unpricedRows[0].id}.unit_price`,
            );
        }

        // Scoped to the two size-table forms: the others keep their own
        // (hidden) size_tables state, and an untouched hidden table must not
        // block their submit.
        if (usesSizeTables(sizeFormMode)) {
            // A blank row is just an unused slot; only a row someone actually
            // entered numbers on has to name its size.
            const garmentRows = data.size_tables.flatMap((table) => [
                ...table.shirt_rows,
                ...table.pants_rows,
            ]);
            const sizeIsMissing = editingLegacySizeRows
                ? data.size_tables.some((table) =>
                      table.rows.some(
                          (row) => sizeRowHasEntry(row) && !row.size_label,
                      ),
                  )
                : garmentRows.some(
                      (row) => !isBlankGarmentRow(row) && !row.size_label,
                  );

            if (sizeIsMissing || unsizedRows.length > 0) {
                need(
                    'ไซส์ในตารางเลือกไซซ์',
                    unsizedRows[0]
                        ? `garment_row.${unsizedRows[0].id}.size_label`
                        : undefined,
                );
            }

            const sizeIsTooLong = editingLegacySizeRows
                ? data.size_tables.some((table) =>
                      table.rows.some(
                          (row) =>
                              row.size_label.length > SIZE_LABEL_MAX_LENGTH,
                      ),
                  )
                : garmentRows.some(
                      (row) => row.size_label.length > SIZE_LABEL_MAX_LENGTH,
                  );

            if (sizeIsTooLong) {
                missing.push(
                    `ไซส์ต้องไม่เกิน ${SIZE_LABEL_MAX_LENGTH} ตัวอักษร`,
                );
            }
        }

        if (sizeFormMode === 'sports_day') {
            const unnamedGroups = data.sports_day_groups.filter(
                (group) => group.team_name.trim() === '',
            );

            unnamedGroups.forEach((group) =>
                fields.add(`sd_group.${group.id}.team_name`),
            );

            if (unnamedGroups.length > 0) {
                need('ชื่อคณะสี', `sd_group.${unnamedGroups[0].id}.team_name`);
            }

            const rowsWithQuantity = data.sports_day_groups.flatMap((group) =>
                group.rows.filter(
                    (row) => row.shirt_qty > 0 || row.pants_qty > 0,
                ),
            );
            const unsizedSportsDayRows = rowsWithQuantity.filter(
                (row) => !row.size_label,
            );

            unsizedSportsDayRows.forEach((row) =>
                fields.add(`sd_row.${row.id}.size_label`),
            );

            if (unsizedSportsDayRows.length > 0) {
                need(
                    'ไซซ์ในตารางคณะสี',
                    `sd_row.${unsizedSportsDayRows[0].id}.size_label`,
                );
            }

            if (
                rowsWithQuantity.some(
                    (row) => row.size_label.length > SIZE_LABEL_MAX_LENGTH,
                )
            ) {
                missing.push(
                    `ไซส์ต้องไม่เกิน ${SIZE_LABEL_MAX_LENGTH} ตัวอักษร`,
                );
            }

            // A linked price is typed on the group's first row and shown on
            // the rest read-only, so that first row is the box to fix.
            const unpricedBoxes: string[] = [];

            data.sports_day_groups.forEach((group) => {
                group.rows.forEach((row, rowIndex) => {
                    (
                        [
                            ['shirt_qty', 'shirt_price'],
                            ['pants_qty', 'pants_price'],
                        ] as const
                    ).forEach(([quantityKey, priceKey]) => {
                        if (row[quantityKey] <= 0 || row[priceKey] > 0) {
                            return;
                        }

                        const sourceRow =
                            rowIndex > 0 &&
                            isSportsDayPriceLinked(group.id, priceKey)
                                ? group.rows[0]
                                : row;
                        const box = `sd_row.${sourceRow.id}.${priceKey}`;

                        if (!unpricedBoxes.includes(box)) {
                            unpricedBoxes.push(box);
                        }
                    });
                });
            });

            unpricedBoxes.forEach((box) => fields.add(box));

            if (unpricedBoxes.length > 0) {
                need('ราคาของรายการที่กรอกจำนวนไว้', unpricedBoxes[0]);
            }
        }

        if (sizeFormMode === 'individual') {
            const hasPersonalization = data.personalization_rows.some(
                (row) =>
                    row.name.trim() && row.size.trim() && row.number.trim(),
            );

            if (
                data.personalization_rows.some(
                    (row) => row.size.length > SIZE_LABEL_MAX_LENGTH,
                )
            ) {
                missing.push(
                    `ไซส์ต้องไม่เกิน ${SIZE_LABEL_MAX_LENGTH} ตัวอักษร`,
                );
            }

            if (!hasPersonalization) {
                // Point at the first person someone started on, or the first
                // row when nobody has been typed in yet, and at whichever of
                // name, size and number that person is still short of.
                const person =
                    data.personalization_rows.find(
                        (row) => !isBlankPersonalizationRow(row),
                    ) ?? data.personalization_rows[0];
                const shortOf = person
                    ? (['name', 'size', 'number'] as const)
                          .filter((key) => person[key].trim() === '')
                          .map((key) => `person.${person.id}.${key}`)
                    : [];

                shortOf.forEach((box) => fields.add(box));
                need('ข้อมูลรายตัวในฟอร์มรายตัว', shortOf[0]);
            }

            // Every person typed in is billed a shirt — the quantity cannot go
            // below one — so a person with no size would be cut as "-".
            const people = data.personalization_rows.filter(
                (row) => !isBlankPersonalizationRow(row),
            );
            const unsizedPeople = people.filter(
                (row) => row.size.trim() === '',
            );

            unsizedPeople.forEach((row) => fields.add(`person.${row.id}.size`));

            if (unsizedPeople.length > 0) {
                need(
                    'ไซซ์เสื้อในรายชื่อรายตัว',
                    `person.${unsizedPeople[0].id}.size`,
                );
            }

            // Trousers are only billed with a price, so trousers counted and
            // left unpriced would drop off the bill — and off the floor's
            // sheet — without a word. A linked price is typed on the first
            // person, so that is the box to fix.
            if (data.individual_include_pants) {
                const firstPerson = data.personalization_rows[0];
                const unpricedPantsBoxes: string[] = [];

                people.forEach((row) => {
                    if (row.pants_quantity <= 0 || row.pants_unit_price > 0) {
                        return;
                    }

                    const sourceRow =
                        firstPerson &&
                        row.id !== firstPerson.id &&
                        isIndividualColumnLinked('pants_unit_price')
                            ? firstPerson
                            : row;
                    const box = `person.${sourceRow.id}.pants_unit_price`;

                    if (!unpricedPantsBoxes.includes(box)) {
                        unpricedPantsBoxes.push(box);
                    }
                });

                unpricedPantsBoxes.forEach((box) => fields.add(box));

                if (unpricedPantsBoxes.length > 0) {
                    need(
                        'ราคากางเกงของคนที่กรอกจำนวนกางเกงไว้',
                        unpricedPantsBoxes[0],
                    );
                }
            }
        }

        // Which spec is required follows what the bill orders, not the tab
        // that happens to be open. On Forms 1 and 4 each table is sewn from a
        // spec of its own, so each ordered table is asked for separately —
        // filling one in does not answer for the rest.
        if (usesSizeTables(sizeFormMode) && !editingLegacySizeRows) {
            orderedGarmentTables().forEach((table) => {
                const required =
                    table.garment === 'pants'
                        ? REQUIRED_PANTS_SPEC_KEYS
                        : REQUIRED_SHIRT_SPEC_KEYS;
                const specs: Record<string, unknown> = table.specs;
                const blanks = (required as readonly string[]).filter(
                    (key) => !String(specs[key] ?? '').trim(),
                );

                blanks.forEach((key) =>
                    fields.add(`${garmentTableKey(table)}.${key}`),
                );

                if (blanks.length > 0) {
                    need(
                        `สเปก${garmentTableTitle(table)} ยังไม่ได้กรอก ${blanks.length} ช่อง`,
                        `${garmentTableKey(table)}.${blanks[0]}`,
                    );
                }
            });
        } else if (sizeFormMode === 'individual') {
            // Form 2 is sewn a sheet at a time too: each sheet the list of
            // people produces is asked for its own spec.
            individualSheetList.forEach((sheet) => {
                const blanks = sheetSpecBlanks(sheet);

                blanks.forEach((key) => fields.add(`${sheet.key}.${key}`));

                if (blanks.length > 0) {
                    need(
                        `สเปก${sheet.title} ยังไม่ได้กรอก ${blanks.length} ช่อง`,
                        `${sheet.key}.${blanks[0]}`,
                    );
                }
            });
        } else {
            if (orderIncludesGarment('shirt')) {
                const blanks = REQUIRED_SHIRT_SPEC_KEYS.filter(
                    (key) => !String(data.shirt_specs[key] ?? '').trim(),
                );

                blanks.forEach((key) => fields.add(`shirt.${key}`));

                if (blanks.length > 0) {
                    need(
                        `สเปกแบบเสื้อ ยังไม่ได้กรอก ${blanks.length} ช่อง`,
                        `shirt.${blanks[0]}`,
                    );
                }
            }

            if (orderIncludesGarment('pants')) {
                const blanks = REQUIRED_PANTS_SPEC_KEYS.filter(
                    (key) => !String(data.pants_specs[key] ?? '').trim(),
                );

                blanks.forEach((key) => fields.add(`pants.${key}`));

                if (blanks.length > 0) {
                    need(
                        `สเปกแบบกางเกง ยังไม่ได้กรอก ${blanks.length} ช่อง`,
                        `pants.${blanks[0]}`,
                    );
                }
            }
        }

        // A bill with counted rows but no lines is pointed at the row boxes
        // the other messages found short.
        const itemsMessage = 'จำนวนและราคาสินค้าอย่างน้อย 1 รายการ';

        if (missing.includes(itemsMessage) && !targets.has(itemsMessage)) {
            const rowTarget = [
                'ราคาของรายการที่กรอกจำนวนไว้',
                'ไซส์ในตารางเลือกไซซ์',
                'ไซซ์ในตารางคณะสี',
            ]
                .map((message) => targets.get(message))
                .find((target) => target !== undefined);

            if (rowTarget !== undefined) {
                targets.set(itemsMessage, rowTarget);
            }
        }

        return { missing, fields, targets };
    };

    // Recomputed on every render once a submit has failed, so a box stops being
    // red the moment its field is filled in -- no stale highlighting.
    const invalidFields = showFieldErrors
        ? analyzeForm().fields
        : EMPTY_INVALID_FIELDS;

    // `field-invalid` and `fx-{key}` carry no style. They are how the
    // missing-fields dialog finds the box it is pointing at.
    const invalidClass = (key: string): string =>
        invalidFields.has(key)
            ? ` border-red-500 bg-red-50 ring-1 ring-red-500/40 focus-visible:border-red-500 field-invalid fx-${key}`
            : '';

    /**
     * The shirt spec, drawn wherever it is being filled in. Forms 1 and 4 draw
     * one of these under every shirt table, because each table is sewn from a
     * spec of its own; Forms 2 and 3 draw a single one for the whole bill.
     *
     * `fieldPrefix` is what the red-box highlighting keys off, so two specs on
     * one page never light up each other's empty boxes.
     */
    const renderShirtSpecFields = (
        specs: ShirtSpecsForm,
        fieldPrefix: string,
        onChange: <K extends keyof ShirtSpecsForm>(
            key: K,
            value: ShirtSpecsForm[K],
        ) => void,
        onSelect: <K extends keyof ShirtSpecsForm>(
            key: K,
            value: string,
        ) => void,
        garmentTypes: OptionItem[] = resolvedShirtTypes,
    ) => (
        <>
            <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                <span className="font-semibold text-slate-600">แบบเสื้อ</span>
                <Select
                    value={specs.shirt_type_id}
                    onValueChange={(value) => onSelect('shirt_type_id', value)}
                >
                    <SelectTrigger
                        className={`h-9 w-full bg-white text-xs${invalidClass(`${fieldPrefix}.shirt_type_id`)}`}
                    >
                        <SelectValue
                            placeholder={
                                garmentTypes.length > 0
                                    ? 'เลือกแบบเสื้อ'
                                    : // A type that exists but is switched off is
                                      // not offered, so "none set up" would be a
                                      // lie to anyone looking at it on the
                                      // settings page.
                                      'ยังไม่มีแบบเสื้อที่เปิดใช้งานสำหรับแขนนี้'
                            }
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {garmentTypes.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                                {item.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </label>

            {shirtSelectFields.map((field, index) => {
                const storageKey = shirtCatalogKeys[field.source];
                const options = catalogOptions(
                    storageKey,
                    resolvedShirtCatalogs[field.source] ?? [],
                );
                const opensGroup =
                    index === 0 ||
                    shirtSelectFields[index - 1].group !== field.group;

                return (
                    <Fragment key={field.key}>
                        {opensGroup ? (
                            <SpecGroupHeading title={field.group} />
                        ) : null}
                        <label className="grid gap-1.5 text-xs">
                            <span className="font-semibold text-slate-600">
                                {field.label}
                            </span>
                            <MasterDataComboBox
                                storageKey={storageKey ?? ''}
                                label={field.label}
                                options={options}
                                value={specs[field.key]}
                                onValueChange={(value) =>
                                    onChange(field.key, value)
                                }
                                onOptionAdded={(option) =>
                                    storageKey
                                        ? handleOptionAdded(storageKey, option)
                                        : undefined
                                }
                                manage={
                                    storageKey
                                        ? manageFor(storageKey)
                                        : undefined
                                }
                                // A field without a catalog on the server has
                                // nowhere to add to, so it stays free text.
                                placeholder={`เลือกหรือพิมพ์${field.label}`}
                                className={`h-9 bg-white text-xs md:text-xs${invalidClass(`${fieldPrefix}.${field.key}`)}`}
                                aria-label={field.label}
                            />
                        </label>
                    </Fragment>
                );
            })}

            <SpecGroupHeading title="รายละเอียดที่พิมพ์บนใบงาน" />
            <label className="grid gap-1.5 text-xs">
                <span className="font-semibold text-slate-600">แบบแขน</span>
                <Input
                    value={specs.sleeve_style_text}
                    onChange={(event) =>
                        onChange('sleeve_style_text', event.target.value)
                    }
                    className={`h-9 text-xs md:text-xs${invalidClass(`${fieldPrefix}.sleeve_style_text`)}`}
                />
            </label>
            <label className="grid gap-1.5 text-xs">
                <span className="font-semibold text-slate-600">แบบกุ้น</span>
                <Input
                    value={specs.piping_style_text}
                    onChange={(event) =>
                        onChange('piping_style_text', event.target.value)
                    }
                    className={`h-9 text-xs md:text-xs${invalidClass(`${fieldPrefix}.piping_style_text`)}`}
                />
            </label>
            <label className="grid gap-1.5 text-xs">
                <span className="font-semibold text-slate-600">แบบลา</span>
                <Input
                    value={specs.stripe_style_text}
                    onChange={(event) =>
                        onChange('stripe_style_text', event.target.value)
                    }
                    className={`h-9 text-xs md:text-xs${invalidClass(`${fieldPrefix}.stripe_style_text`)}`}
                />
            </label>
            <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                <span className="font-semibold text-slate-600">
                    ข้อความสกรีน
                </span>
                <Input
                    value={specs.screen_text}
                    onChange={(event) =>
                        onChange('screen_text', event.target.value)
                    }
                    className={`h-9 text-xs md:text-xs${invalidClass(`${fieldPrefix}.screen_text`)}`}
                />
            </label>
            <label className="grid gap-1.5 text-xs">
                <span className="font-semibold text-slate-600">รหัสงานปัก</span>
                <Input
                    value={specs.embroidery_code_text}
                    onChange={(event) =>
                        onChange('embroidery_code_text', event.target.value)
                    }
                    className={`h-9 text-xs md:text-xs${invalidClass(`${fieldPrefix}.embroidery_code_text`)}`}
                />
            </label>
            <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                <span className="font-semibold text-slate-600">
                    รายละเอียดปัก
                </span>
                <textarea
                    rows={3}
                    value={specs.embroidery_note_text}
                    onChange={(event) =>
                        onChange('embroidery_note_text', event.target.value)
                    }
                    className={`w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200${invalidClass(`${fieldPrefix}.embroidery_note_text`)}`}
                />
            </label>
        </>
    );

    /** The trouser spec, drawn under every trouser table on Forms 1 and 4. */
    const renderPantsSpecFields = (
        specs: PantsSpecsForm,
        fieldPrefix: string,
        onChange: <K extends keyof PantsSpecsForm>(
            key: K,
            value: PantsSpecsForm[K],
        ) => void,
        garmentTypes: OptionItem[] = resolvedPantsTypes,
    ) => (
        <>
            {/*
                The trouser type is what the labour rate is read from, and a
                table is one leg length, so it only offers the types made in
                that length. It used to be set invisibly to whichever type
                happened to be first.
            */}
            <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                <span className="font-semibold text-slate-600">แบบกางเกง</span>
                <Select
                    value={specs.pants_type_id}
                    onValueChange={(value) => {
                        // An empty value is the hidden native <select> echoing
                        // on remount, never the user: there is no blank option.
                        if (value !== '') {
                            onChange('pants_type_id', value);
                        }
                    }}
                >
                    <SelectTrigger
                        className={`h-9 w-full bg-white text-xs${invalidClass(`${fieldPrefix}.pants_type_id`)}`}
                    >
                        <SelectValue
                            placeholder={
                                garmentTypes.length > 0
                                    ? 'เลือกแบบกางเกง'
                                    : // A type that exists but is switched off is
                                      // not offered, so "none set up" would be a
                                      // lie to anyone looking at it on the
                                      // settings page.
                                      'ยังไม่มีแบบกางเกงที่เปิดใช้งานสำหรับขานี้'
                            }
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {garmentTypes.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                                {item.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </label>
            {/*
                                            แบบกางเกง is not asked for any more: leg length now
                                            comes from the size table, one row at a time, and the
                                            pants type only picks the labour rate. The value is
                                            still carried in pants_specs so saved orders keep
                                            theirs and new ones record the active type.
                                        */}

            {pantsSelectFields.map((field, index) => {
                const storageKey = pantsCatalogKeys[field.source];
                const options = catalogOptions(
                    storageKey,
                    resolvedPantsCatalogs[field.source] ?? [],
                );
                const opensGroup =
                    index === 0 ||
                    pantsSelectFields[index - 1].group !== field.group;

                return (
                    <Fragment key={field.key}>
                        {opensGroup ? (
                            <SpecGroupHeading title={field.group} />
                        ) : null}
                        <label className="grid gap-1.5 text-xs">
                            <span className="font-semibold text-slate-600">
                                {field.label}
                            </span>
                            <MasterDataComboBox
                                storageKey={storageKey ?? ''}
                                label={field.label}
                                options={options}
                                value={specs[field.key]}
                                onValueChange={(value) =>
                                    onChange(field.key, value)
                                }
                                onOptionAdded={(option) =>
                                    storageKey
                                        ? handleOptionAdded(storageKey, option)
                                        : undefined
                                }
                                manage={
                                    storageKey
                                        ? manageFor(storageKey)
                                        : undefined
                                }
                                // A field without a catalog on the server has
                                // nowhere to add to, so it stays free text.
                                placeholder={`เลือกหรือพิมพ์${field.label}`}
                                className={`h-9 bg-white text-xs md:text-xs${invalidClass(`${fieldPrefix}.${field.key}`)}`}
                                aria-label={field.label}
                            />
                        </label>
                    </Fragment>
                );
            })}

            <SpecGroupHeading title="รายละเอียดที่พิมพ์บนใบงาน" />
            <label className="grid gap-1.5 text-xs">
                <span className="font-semibold text-slate-600">กุ้นกางเกง</span>
                <Input
                    value={specs.seat_style_text}
                    onChange={(event) =>
                        onChange('seat_style_text', event.target.value)
                    }
                    className={`h-9 text-xs md:text-xs${invalidClass(`${fieldPrefix}.seat_style_text`)}`}
                />
            </label>
            <label className="grid gap-1.5 text-xs">
                <span className="font-semibold text-slate-600">แบบต่อ</span>
                <Input
                    value={specs.panel_style_text}
                    onChange={(event) =>
                        onChange('panel_style_text', event.target.value)
                    }
                    className={`h-9 text-xs md:text-xs${invalidClass(`${fieldPrefix}.panel_style_text`)}`}
                />
            </label>
            <label className="grid gap-1.5 text-xs">
                <span className="font-semibold text-slate-600">แบบลา</span>
                <Input
                    value={specs.stripe_style_text}
                    onChange={(event) =>
                        onChange('stripe_style_text', event.target.value)
                    }
                    className={`h-9 text-xs md:text-xs${invalidClass(`${fieldPrefix}.stripe_style_text`)}`}
                />
            </label>
            <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                <span className="font-semibold text-slate-600">
                    ข้อความสกรีน
                </span>
                <Input
                    value={specs.screen_text}
                    onChange={(event) =>
                        onChange('screen_text', event.target.value)
                    }
                    className={`h-9 text-xs md:text-xs${invalidClass(`${fieldPrefix}.screen_text`)}`}
                />
            </label>
            <label className="grid gap-1.5 text-xs">
                <span className="font-semibold text-slate-600">รหัสงานปัก</span>
                <Input
                    value={specs.embroidery_code_text}
                    onChange={(event) =>
                        onChange('embroidery_code_text', event.target.value)
                    }
                    className={`h-9 text-xs md:text-xs${invalidClass(`${fieldPrefix}.embroidery_code_text`)}`}
                />
            </label>
            <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                <span className="font-semibold text-slate-600">
                    รายละเอียดปัก
                </span>
                <textarea
                    rows={3}
                    value={specs.embroidery_note_text}
                    onChange={(event) =>
                        onChange('embroidery_note_text', event.target.value)
                    }
                    className={`w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200${invalidClass(`${fieldPrefix}.embroidery_note_text`)}`}
                />
            </label>
        </>
    );

    /**
     * Brings a box the last save found short into view and puts the cursor in
     * it. `key` is the box a message is about; when it cannot be found — a
     * message about the bill as a whole — the first red box on the page is
     * used instead.
     */
    const focusMissingField = (key: string) => {
        const element =
            (key !== ''
                ? document.getElementsByClassName(`fx-${key}`)[0]
                : undefined) ?? document.querySelector('.field-invalid');

        if (!(element instanceof HTMLElement)) {
            return;
        }

        const focusTarget = element.matches('input, textarea, button')
            ? element
            : element.querySelector<HTMLElement>('input, textarea, button');

        element.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        focusTarget?.focus({ preventScroll: true });
    };

    const jumpToMissingField = (key: string) => {
        // A folded Form 2 sheet has none of its boxes on the page either.
        const sheet = individualSheetList.find((candidate) =>
            key.startsWith(`${candidate.key}.`),
        );

        if (sheet !== undefined) {
            setSheetSpecOpen((current) => ({ ...current, [sheet.key]: true }));
        }

        // A folded bill-wide spec (Form 3) has none of its boxes on the page
        // until it is opened.
        const specGarment = (['shirt', 'pants'] as const).find((garment) =>
            key.startsWith(`${garment}.`),
        );

        if (specGarment !== undefined) {
            setBillSpecOpen((current) => ({
                ...current,
                [specGarment]: true,
            }));
        }

        pendingJumpRef.current = key;
        setShowValidationModal(false);
    };

    const handleSubmitClick = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const { missing, fields, targets } = analyzeForm();
        setValidationErrors(missing);
        setValidationTargets(targets);
        setShowFieldErrors(missing.length > 0);

        if (missing.length > 0) {
            // Unfold every spec that is short of something. A folded spec
            // would hide its own red boxes, and the message would look like it
            // was complaining about nothing.
            setSpecOpenOverrides((current) => {
                const opened = { ...current };

                data.garment_tables.forEach((table) => {
                    if (specBlanksFor(table) > 0) {
                        opened[table.id] = true;
                    }
                });

                return opened;
            });

            // A folded table shows none of its boxes, red or not.
            setFoldedTables((current) => {
                const unfolded = { ...current };

                data.garment_tables.forEach((table) => {
                    const rowIsShort = table.rows.some(
                        (row) =>
                            fields.has(`garment_row.${row.id}.size_label`) ||
                            fields.has(`garment_row.${row.id}.unit_price`) ||
                            fields.has(`garment_row.${row.id}.quantity`),
                    );

                    if (rowIsShort || specBlanksFor(table) > 0) {
                        unfolded[table.id] = false;
                    }
                });

                return unfolded;
            });

            // And the sheets of a Form 2 bill.
            const shortSheets = individualSheetList.filter((sheet) =>
                [...fields].some((key) => key.startsWith(`${sheet.key}.`)),
            );

            if (shortSheets.length > 0) {
                setSheetSpecOpen((current) => {
                    const opened = { ...current };

                    shortSheets.forEach((sheet) => {
                        opened[sheet.key] = true;
                    });

                    return opened;
                });
            }

            // Same idea for the bill-wide spec Form 3 uses.
            const shortSpecs = (['shirt', 'pants'] as const).filter((garment) =>
                [...fields].some((key) => key.startsWith(`${garment}.`)),
            );

            if (shortSpecs.length > 0) {
                setBillSpecOpen((current) => {
                    const opened = { ...current };

                    shortSpecs.forEach((garment) => {
                        opened[garment] = true;
                    });

                    return opened;
                });
            }

            setShowValidationModal(true);

            return;
        }

        setShowConfirmModal(true);
    };

    const submit = () => {
        const selectedJobType =
            resolvedJobTypes.find(
                (item) => String(item.id) === data.job_type_id,
            )?.name ?? data.job_name;
        const requestItems = resolveRequestItems(
            sizeFormMode,
            data.size_tables,
            data.sports_day_groups,
            data.personalization_rows,
            data.individual_include_pants,
            data.garment_tables,
        );

        if (requestItems.length === 0) {
            setValidationErrors(['จำนวนและราคาสินค้าอย่างน้อย 1 รายการ']);
            setShowValidationModal(true);

            return;
        }

        const isEditing = Boolean(order?.id);
        const normalizedDueDate =
            data.due_date && data.due_date >= data.billing_date
                ? data.due_date
                : data.billing_date;
        const shirtTables = data.garment_tables.filter(
            (table) => table.garment === 'shirt',
        );
        // What a reader that still expects one spec per bill sees, and what the
        // flat columns on order_specifications are written from.
        // Form 2's sheets each carry their own spec; its first shirt and
        // first trousers sheet stand for the bill where one spec has to.
        const billSpecs =
            sizeFormMode === 'individual'
                ? individualRepresentativeSpecs()
                : { shirt: data.shirt_specs, pants: data.pants_specs };
        const { shirt: flatSpecShirt, pants: flatSpecPants } =
            representativeSpecs(
                usesSizeTables(sizeFormMode),
                data.garment_tables,
                billSpecs.shirt,
                billSpecs.pants,
            );
        const representativeShirtSpecs = flatSpecShirt;
        const representativePantsSpecs = flatSpecPants;
        const activeSpecValues = usesSizeTables(sizeFormMode)
            ? shirtTables.length > 0
                ? flatSpecShirt
                : flatSpecPants
            : // The bill's shirts when it sells any, its trousers otherwise —
              // the same choice representativeSpecs() makes for Forms 1 and 4.
              // It used to follow whichever tab was open at the moment of
              // saving.
              orderIncludesGarment('pants') && !orderIncludesGarment('shirt')
              ? billSpecs.pants
              : billSpecs.shirt;
        const screenPrintDetail = JSON.stringify({
            schema: 'spec-v3',
            mode: sizeFormMode,
            // One spec per sheet: garment, size tier and length. Forms 2 and 3
            // sell one spec for the whole bill and so write none of these.
            garment_specs: usesSizeTables(sizeFormMode)
                ? buildGarmentSpecsPayload(data.garment_tables)
                : sizeFormMode === 'individual'
                  ? Object.fromEntries(
                        individualSheetList.map((sheet) => [
                            sheet.key,
                            sheetSpecFor(sheet),
                        ]),
                    )
                  : {},
            shirt_specs: representativeShirtSpecs,
            pants_specs: representativePantsSpecs,
            // The master-data names as they read at the moment of saving.
            // The master-data names as they read at the moment of saving, so
            // renaming a colour later cannot rewrite what an already-printed
            // sheet says. One entry per sheet, plus the single pair that
            // matches the representative spec above.
            garment_spec_labels: usesSizeTables(sizeFormMode)
                ? Object.fromEntries(
                      data.garment_tables.map((table) => [
                          garmentTableKey(table),
                          table.garment === 'pants'
                              ? snapshotSpecLabels(
                                    table.specs,
                                    withCatalogPatches(
                                        resolvedPantsCatalogs,
                                        pantsCatalogKeys,
                                    ),
                                )
                              : snapshotSpecLabels(
                                    table.specs,
                                    withCatalogPatches(
                                        resolvedShirtCatalogs,
                                        shirtCatalogKeys,
                                    ),
                                ),
                      ]),
                  )
                : sizeFormMode === 'individual'
                  ? Object.fromEntries(
                        individualSheetList.map((sheet) => [
                            sheet.key,
                            snapshotSpecLabels(
                                sheetSpecFor(sheet),
                                sheet.garment === 'pants'
                                    ? withCatalogPatches(
                                          resolvedPantsCatalogs,
                                          pantsCatalogKeys,
                                      )
                                    : withCatalogPatches(
                                          resolvedShirtCatalogs,
                                          shirtCatalogKeys,
                                      ),
                            ),
                        ]),
                    )
                  : {},
            spec_labels: {
                shirt: snapshotSpecLabels(
                    representativeShirtSpecs,
                    withCatalogPatches(resolvedShirtCatalogs, shirtCatalogKeys),
                ),
                pants: snapshotSpecLabels(
                    representativePantsSpecs,
                    withCatalogPatches(resolvedPantsCatalogs, pantsCatalogKeys),
                ),
            },
            sports_day_groups:
                sizeFormMode === 'sports_day'
                    ? data.sports_day_groups.map((group) => ({
                          team_name: group.team_name.trim(),
                          fabric_color_id: group.fabric_color_id,
                          rows: group.rows.map((row) => ({
                              size_group: row.size_group,
                              size_label: row.size_label.trim(),
                              shirt_qty: Math.max(row.shirt_qty, 0),
                              shirt_price: Math.max(row.shirt_price, 0),
                              pants_qty: Math.max(row.pants_qty, 0),
                              pants_price: Math.max(row.pants_price, 0),
                              total_price: sportsDayRowTotal(row),
                          })),
                          total_pieces: sportsDayGroupPieces(group),
                          total_price: sportsDayGroupTotal(group),
                      }))
                    : [],
            individual_include_pants:
                sizeFormMode === 'individual'
                    ? data.individual_include_pants
                    : false,
            individual_keeper_color:
                sizeFormMode === 'individual'
                    ? data.individual_keeper_color.trim()
                    : '',
            personalization_rows:
                sizeFormMode === 'individual'
                    ? data.personalization_rows
                          .filter((row) => !isBlankPersonalizationRow(row))
                          .map((row) => ({
                              role: row.role,
                              name: row.name.trim(),
                              size: row.size.trim(),
                              size_group: row.size_group,
                              shirt_style: row.shirt_style,
                              number: row.number.trim(),
                              quantity: Math.max(row.quantity, 1),
                              unit_price: Math.max(row.unit_price, 0),
                              // Left blank, a person's trousers follow their
                              // shirt: saved as the shirt's, so the roster and
                              // the floor read a size and a number for them.
                              pants_size: data.individual_include_pants
                                  ? row.pants_size.trim() ||
                                    (row.pants_quantity > 0
                                        ? row.size.trim()
                                        : '')
                                  : '',
                              pants_style: row.pants_style,
                              pants_number: data.individual_include_pants
                                  ? row.pants_number.trim() ||
                                    (row.pants_quantity > 0
                                        ? row.number.trim()
                                        : '')
                                  : '',
                              pants_quantity: data.individual_include_pants
                                  ? Math.max(row.pants_quantity, 0)
                                  : 0,
                              pants_unit_price: data.individual_include_pants
                                  ? Math.max(row.pants_unit_price, 0)
                                  : 0,
                              total_price: rowIndividualTotal(
                                  row,
                                  data.individual_include_pants,
                              ),
                          }))
                    : [],
        });
        const fallbackCustomerName =
            sizeFormMode === 'individual'
                ? (data.personalization_rows
                      .map((row) => row.name.trim())
                      .find((name) => name !== '') ?? '')
                : '';
        const customerName = data.customer_name.trim() || fallbackCustomerName;

        const routings = resolveRoutingFlowByJobType(selectedJobType);

        transform((payload) => ({
            shirt_artwork: payload.shirt_artwork_files,
            pants_artwork: payload.pants_artwork_files,
            // Artwork pinned to one production batch, and the batches the user
            // moved already-saved images to. Only Forms 1 and 4 ever fill these
            // in; the server reads an unknown batch as "every sheet".
            shirt_artwork_scoped: payload.shirt_artwork_scoped,
            pants_artwork_scoped: payload.pants_artwork_scoped,
            artwork_scopes: payload.artwork_scopes,
            // Form 3: each house's new pictures, by the house's position on
            // the bill — the key the server stores them under and the
            // production sheet reads them back by.
            sports_day_artwork:
                sizeFormMode === 'sports_day'
                    ? sportsDayArtworkPayload(
                          payload.sports_day_groups,
                          payload.sports_day_artwork_files,
                      )
                    : {},
            duplicate_from_id: order?.duplicate_from_id ?? null,
            // Saved artwork the user removed. On an edit these media are deleted;
            // on a duplicate they are simply not copied onto the new bill.
            removed_media_ids: payload.removed_media_ids,
            customer_id: payload.customer_id
                ? Number(payload.customer_id)
                : null,
            customer_name: customerName,
            customer_phone: payload.customer_phone || null,
            contact_detail: payload.contact_detail || null,
            branch_id: Number(payload.branch_id || 0),
            job_name: payload.job_name,
            job_type: selectedJobType,
            delivery_method: payload.delivery_method,
            shipping_address: payload.shipping_address || null,
            order_date: `${payload.billing_date} ${payload.billing_time || '00:00'}:00`,
            due_date: `${normalizedDueDate} 00:00:00`,
            discount_percent: discountPercent,
            deposit_amount: payload.deposit_amount,
            payment_method: payload.payment_method,
            items: requestItems,
            routings,
            specification: {
                pattern_id: activeSpecValues.pattern_id
                    ? Number(activeSpecValues.pattern_id)
                    : null,
                fabric_id: activeSpecValues.fabric_id
                    ? Number(activeSpecValues.fabric_id)
                    : null,
                neck_style_id: flatSpecShirt.neck_style_id
                    ? Number(flatSpecShirt.neck_style_id)
                    : null,
                collar_color: flatSpecShirt.neck_color_id || null,
                leg_style: flatSpecPants.leg_style_id || null,
                leg_hem: flatSpecPants.leg_cuff_id || null,
                placket_style: flatSpecShirt.placket_style_id || null,
                placket_color: flatSpecShirt.placket_outer_color_id || null,
                sleeve_style: flatSpecShirt.sleeve_style_text || null,
                sleeve_hem: flatSpecShirt.sleeve_cuff_id || null,
                sublimation_detail:
                    flatSpecShirt.sublimation_id ||
                    flatSpecPants.sublimation_id ||
                    null,
                screen_print_detail: screenPrintDetail,
                embroidery_code:
                    flatSpecShirt.embroidery_code_text ||
                    flatSpecPants.embroidery_code_text ||
                    null,
            },
            line_items: derivedLineItems,
        }));

        const submitUrl = isEditing ? `/orders/${order.id}` : '/orders';

        if (isEditing) {
            put(submitUrl, {
                forceFormData: true,
                preserveScroll: true,
            });

            setShowConfirmModal(false);

            return;
        }

        post(submitUrl, {
            forceFormData: true,
            preserveScroll: true,
        });
        setShowConfirmModal(false);
    };

    /**
     * The spec in the order it is decided, and grouped by what is being
     * decided. Nineteen identical boxes in a row is a wall to read; the same
     * nineteen under three headings is three short questions — what it is made
     * of, what shape it is, and what goes on it.
     *
     * The order within a group is the order the printed sheet lists them, so
     * the counter reads down the form and down the sheet the same way.
     */
    const shirtSelectFields: Array<{
        label: string;
        key: keyof ShirtSpecsForm;
        source: keyof CatalogMap;
        group: string;
    }> = [
        {
            label: 'แพทเทิร์น',
            key: 'pattern_id',
            source: 'patterns',
            group: 'ผ้าและแพทเทิร์น',
        },
        {
            label: 'เนื้อผ้า',
            key: 'fabric_id',
            source: 'fabrics',
            group: 'ผ้าและแพทเทิร์น',
        },
        {
            label: 'สีผ้า',
            key: 'fabric_color_id',
            source: 'fabric_colors',
            group: 'ผ้าและแพทเทิร์น',
        },
        {
            label: 'แบบคอ',
            key: 'neck_style_id',
            source: 'neck_styles',
            group: 'ทรงเสื้อ · คอ สาบ ปลายแขน',
        },
        {
            label: 'สีแบบคอ',
            key: 'neck_color_id',
            source: 'neck_colors',
            group: 'ทรงเสื้อ · คอ สาบ ปลายแขน',
        },
        {
            label: 'ปก',
            key: 'collar_id',
            source: 'collars',
            group: 'ทรงเสื้อ · คอ สาบ ปลายแขน',
        },
        {
            label: 'แบบสาบ',
            key: 'placket_style_id',
            source: 'placket_styles',
            group: 'ทรงเสื้อ · คอ สาบ ปลายแขน',
        },
        {
            label: 'สีสาบ (ใน)',
            key: 'placket_inner_color_id',
            source: 'placket_inner_colors',
            group: 'ทรงเสื้อ · คอ สาบ ปลายแขน',
        },
        {
            label: 'สีสาบ (นอก)',
            key: 'placket_outer_color_id',
            source: 'placket_outer_colors',
            group: 'ทรงเสื้อ · คอ สาบ ปลายแขน',
        },
        {
            label: 'ปลายแขน',
            key: 'sleeve_cuff_id',
            source: 'sleeve_cuffs',
            group: 'ทรงเสื้อ · คอ สาบ ปลายแขน',
        },
        {
            label: 'สีสกรีน',
            key: 'screen_color_id',
            source: 'screen_colors',
            group: 'งานสกรีน ปัก และซับ',
        },
        {
            label: 'สีงานปัก',
            key: 'embroidery_color_id',
            source: 'embroidery_colors',
            group: 'งานสกรีน ปัก และซับ',
        },
        {
            label: 'ซับลิเมชั่น',
            key: 'sublimation_id',
            source: 'sublimations',
            group: 'งานสกรีน ปัก และซับ',
        },
    ];

    const pantsSelectFields: Array<{
        label: string;
        key: keyof PantsSpecsForm;
        source: keyof CatalogMap;
        group: string;
    }> = [
        {
            label: 'แพทเทิร์น',
            key: 'pattern_id',
            source: 'patterns',
            group: 'ผ้าและแพทเทิร์น',
        },
        {
            label: 'เนื้อผ้า',
            key: 'fabric_id',
            source: 'fabrics',
            group: 'ผ้าและแพทเทิร์น',
        },
        {
            label: 'สีผ้า',
            key: 'fabric_color_id',
            source: 'fabric_colors',
            group: 'ผ้าและแพทเทิร์น',
        },
        {
            label: 'แบบขา',
            key: 'leg_style_id',
            source: 'leg_styles',
            group: 'ทรงกางเกง · ขา ปลายขา',
        },
        {
            label: 'ปลายขา',
            key: 'leg_cuff_id',
            source: 'leg_cuffs',
            group: 'ทรงกางเกง · ขา ปลายขา',
        },
        {
            label: 'สีสกรีน',
            key: 'screen_color_id',
            source: 'screen_colors',
            group: 'งานสกรีน ปัก และซับ',
        },
        {
            label: 'สีงานปัก',
            key: 'embroidery_color_id',
            source: 'embroidery_colors',
            group: 'งานสกรีน ปัก และซับ',
        },
        {
            label: 'ซับลิเมชั่น',
            key: 'sublimation_id',
            source: 'sublimations',
            group: 'งานสกรีน ปัก และซับ',
        },
    ];

    const isEditing = Boolean(order?.id);
    const orderCodeLabel = order?.order_code ?? `#${order?.id ?? ''}`;
    const submittingLabel = isCompressing
        ? 'กำลังบีบอัดรูปภาพ...'
        : processing
          ? isEditing
              ? 'กำลังบันทึกการแก้ไข...'
              : 'กำลังบันทึกใบสั่งผลิต...'
          : isEditing
            ? 'บันทึกการแก้ไข'
            : 'บันทึกใบสั่งผลิต';
    const formErrors = errors as Record<string, string | undefined>;
    // General artwork already on the bill being edited or duplicated. New bills
    // never have any; the form stopped taking it.
    const legacyGeneralArtwork = visibleSavedMedia([
        ...(order?.artwork_media ?? []),
        ...(order?.reference_design_media ?? []),
    ]);
    const shirtArtworkError =
        formErrors.shirt_artwork ?? formErrors['shirt_artwork.0'];
    const pantsArtworkError =
        formErrors.pants_artwork ?? formErrors['pants_artwork.0'];

    /**
     * Form 2's specs, one per sheet the list of people is cut on, drawn the
     * way Form 1 draws a table: grouped by garment, each sheet named for what
     * it is and how many people are on it, its pictures, and its spec folded
     * under a heading that says what is still missing. A long-sleeved shirt
     * and a short one are two sheets here, as they are on the floor.
     */
    const renderIndividualSheetSpecs = () => {
        return (['shirt', 'pants'] as const).map((garment) => {
            const sheets = individualSpecSheetList.filter(
                (sheet) => sheet.garment === garment,
            );

            if (sheets.length === 0) {
                return null;
            }

            const isPants = garment === 'pants';

            return (
                <section
                    key={garment}
                    data-sheet-group={garment}
                    className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/40 p-3"
                >
                    <h3 className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-600">
                        <span
                            className={`h-3.5 w-1 rounded-full ${
                                isPants ? 'bg-[#E21E26]' : 'bg-[#174395]'
                            }`}
                        />
                        {isPants ? 'กางเกง' : 'เสื้อ'}
                        <span className="font-normal text-slate-400">
                            {sheets.length} แบบ · แยกสเปกตามแบบ
                        </span>
                    </h3>

                    {sheets.map((sheet) => {
                        const blanks = sheetSpecBlanks(sheet).length;
                        const open = sheetSpecOpen[sheet.key] ?? false;
                        const specs = sheetSpecFor(sheet);
                        const otherSheets = sheets.filter(
                            (other) => other.key !== sheet.key,
                        );

                        return (
                            <article
                                key={sheet.key}
                                data-individual-sheet={sheet.key}
                                aria-label={sheet.title}
                                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                            >
                                <header
                                    className={`flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-2.5 py-2 ${
                                        isPants
                                            ? 'bg-rose-50/70'
                                            : 'bg-blue-50/70'
                                    }`}
                                >
                                    <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                                        <span
                                            className={`h-3 w-1 rounded-full ${
                                                isPants
                                                    ? 'bg-[#E21E26]'
                                                    : 'bg-[#174395]'
                                            }`}
                                        />
                                        {sheet.title}
                                    </h4>
                                    {sheet.people > 0 ? (
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                                            {sheet.people.toLocaleString(
                                                'th-TH',
                                            )}{' '}
                                            คน
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200">
                                            ยังไม่มีรายชื่อ · กรอกสเปกไว้ก่อนได้
                                        </span>
                                    )}
                                </header>

                                <div className="bg-slate-50/50 px-2.5 py-3">
                                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSheetSpecOpen((current) => ({
                                                    ...current,
                                                    [sheet.key]: !open,
                                                }))
                                            }
                                            aria-expanded={open}
                                            className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-slate-950"
                                        >
                                            <ChevronDown
                                                className={`size-3.5 text-slate-400 transition-transform ${
                                                    open ? '' : '-rotate-90'
                                                }`}
                                            />
                                            สเปก{isPants ? 'กางเกง' : 'เสื้อ'}
                                            {blanks > 0 ? (
                                                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                                    ยังขาด {blanks} ช่อง
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                    กรอกครบ
                                                </span>
                                            )}
                                        </button>
                                        {otherSheets.length > 0 ? (
                                            <Select
                                                value=""
                                                onValueChange={(sourceKey) =>
                                                    copySheetSpec(
                                                        sheet,
                                                        sourceKey,
                                                    )
                                                }
                                            >
                                                <SelectTrigger
                                                    className="h-7 w-auto gap-1 border-dashed bg-white text-[11px]"
                                                    aria-label={`คัดลอกสเปกมาที่ ${sheet.title}`}
                                                >
                                                    <Copy className="size-3" />
                                                    <SelectValue placeholder="คัดลอกสเปกจากแบบอื่น" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {otherSheets.map(
                                                        (other) => (
                                                            <SelectItem
                                                                key={other.key}
                                                                value={
                                                                    other.key
                                                                }
                                                            >
                                                                {other.title}
                                                            </SelectItem>
                                                        ),
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        ) : null}
                                    </div>

                                    <div className="mb-3">
                                        <MultiArtworkUpload
                                            title={`Art Work · ${sheet.title}`}
                                            inputId={`artwork-${sheet.key}`}
                                            files={
                                                (isPants
                                                    ? data.pants_artwork_scoped
                                                    : data.shirt_artwork_scoped)[
                                                    sheet.key
                                                ] ?? []
                                            }
                                            previewUrls={
                                                scopedArtworkPreviews[
                                                    `${garment}:${sheet.key}`
                                                ] ?? []
                                            }
                                            savedMedia={savedArtworkForBatch(
                                                garment,
                                                sheet.key,
                                            )}
                                            onSelect={(event) => {
                                                void handleTableArtworkSelect(
                                                    garment,
                                                    sheet.key,
                                                    event,
                                                );
                                            }}
                                            onRemove={(index) =>
                                                removeArtworkFile(
                                                    garment,
                                                    sheet.key,
                                                    index,
                                                )
                                            }
                                            onRemoveSaved={removeSavedMedia}
                                        />
                                    </div>

                                    {open ? (
                                        <div
                                            data-slot="garment-spec"
                                            data-garment={garment}
                                            className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
                                        >
                                            {isPants
                                                ? renderPantsSpecFields(
                                                      specs as PantsSpecsForm,
                                                      sheet.key,
                                                      (key, value) =>
                                                          updateSheetSpec(
                                                              sheet,
                                                              key,
                                                              String(value),
                                                          ),
                                                      garmentTypesForStyle(
                                                          resolvedPantsTypes,
                                                          sheet.style,
                                                          (
                                                              specs as PantsSpecsForm
                                                          ).pants_type_id,
                                                      ),
                                                  )
                                                : renderShirtSpecFields(
                                                      specs as ShirtSpecsForm,
                                                      sheet.key,
                                                      (key, value) =>
                                                          updateSheetSpec(
                                                              sheet,
                                                              key,
                                                              String(value),
                                                          ),
                                                      (key, value) => {
                                                          // An empty value is the hidden
                                                          // native <select> echoing on
                                                          // remount, never the user.
                                                          if (value !== '') {
                                                              updateSheetSpec(
                                                                  sheet,
                                                                  key,
                                                                  value,
                                                              );
                                                          }
                                                      },
                                                      garmentTypesForStyle(
                                                          resolvedShirtTypes,
                                                          sheet.style,
                                                          (
                                                              specs as ShirtSpecsForm
                                                          ).shirt_type_id,
                                                      ),
                                                  )}
                                        </div>
                                    ) : null}
                                </div>
                            </article>
                        );
                    })}
                </section>
            );
        });
    };

    /**
     * The bill-wide spec of one garment on Forms 2 and 3, drawn like a table's
     * spec on Forms 1 and 4: a group headed by the garment, and a folded panel
     * whose heading says how much is still missing. A garment the bill has not
     * ordered yet is only asked for once it is, so its count is shown muted
     * and says why.
     */
    const renderBillSpecGroup = (garment: SpecTab) => {
        const isPants = garment === 'pants';
        const garmentLabel = isPants ? 'กางเกง' : 'เสื้อ';
        const required = isPants
            ? REQUIRED_PANTS_SPEC_KEYS
            : REQUIRED_SHIRT_SPEC_KEYS;
        const specs: Record<string, unknown> = isPants
            ? data.pants_specs
            : data.shirt_specs;
        const blanks = (required as readonly string[]).filter(
            (key) => !String(specs[key] ?? '').trim(),
        ).length;
        const ordered = orderIncludesGarment(garment);
        const open = billSpecOpen[garment];

        return (
            <section
                key={garment}
                data-bill-spec-group={garment}
                className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/40 p-3"
            >
                <h3 className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-600">
                    <span
                        className={`h-3.5 w-1 rounded-full ${
                            isPants ? 'bg-[#E21E26]' : 'bg-[#174395]'
                        }`}
                    />
                    {garmentLabel}
                    <span className="font-normal text-slate-400">
                        ใช้กับทั้งบิล
                    </span>
                </h3>

                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div className="bg-slate-50/50 px-2.5 py-3">
                        <button
                            type="button"
                            onClick={() =>
                                setBillSpecOpen((current) => ({
                                    ...current,
                                    [garment]: !current[garment],
                                }))
                            }
                            aria-expanded={open}
                            className={`flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-slate-950 ${
                                open ? 'mb-2.5' : ''
                            }`}
                        >
                            <ChevronDown
                                className={`size-3.5 text-slate-400 transition-transform ${
                                    open ? '' : '-rotate-90'
                                }`}
                            />
                            สเปก{garmentLabel}
                            {blanks === 0 ? (
                                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    กรอกครบ
                                </span>
                            ) : ordered ? (
                                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                    ยังขาด {blanks} ช่อง
                                </span>
                            ) : (
                                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                    ยังขาด {blanks} ช่อง · ยังไม่ได้สั่ง
                                    {garmentLabel}
                                </span>
                            )}
                        </button>

                        {open ? (
                            <div
                                data-slot="garment-spec"
                                data-garment={garment}
                                className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
                            >
                                {/* Every form takes its artwork through the
                                Art Work dialog above; these stay for a mode
                                that would not. */}
                                {usesArtworkBatches(sizeFormMode) ? null : (
                                    <div className="md:col-span-2 xl:col-span-3">
                                        {isPants ? (
                                            <MultiArtworkUpload
                                                title="Art Work กางเกง"
                                                inputId="pants-artwork-upload"
                                                files={data.pants_artwork_files}
                                                previewUrls={
                                                    pantsArtworkPreviewUrls
                                                }
                                                savedMedia={visibleSavedMedia(
                                                    order?.pants_artwork_media,
                                                )}
                                                error={pantsArtworkError}
                                                onSelect={(event) => {
                                                    void handlePantsArtworkSelect(
                                                        event,
                                                    );
                                                }}
                                                onRemove={removePantsArtworkAt}
                                                onRemoveSaved={removeSavedMedia}
                                            />
                                        ) : (
                                            <MultiArtworkUpload
                                                title="Art Work เสื้อ"
                                                inputId="shirt-artwork-upload"
                                                files={data.shirt_artwork_files}
                                                previewUrls={
                                                    shirtArtworkPreviewUrls
                                                }
                                                savedMedia={visibleSavedMedia(
                                                    order?.shirt_artwork_media,
                                                )}
                                                error={shirtArtworkError}
                                                onSelect={(event) => {
                                                    void handleShirtArtworkSelect(
                                                        event,
                                                    );
                                                }}
                                                onRemove={removeShirtArtworkAt}
                                                onRemoveSaved={removeSavedMedia}
                                            />
                                        )}
                                    </div>
                                )}
                                {isPants
                                    ? renderPantsSpecFields(
                                          data.pants_specs,
                                          'pants',
                                          updatePantsSpecs,
                                      )
                                    : renderShirtSpecFields(
                                          data.shirt_specs,
                                          'shirt',
                                          updateShirtSpecs,
                                          selectShirtSpec,
                                      )}
                            </div>
                        ) : null}
                    </div>
                </div>
            </section>
        );
    };

    return (
        <>
            <Head
                title={
                    isEditing
                        ? `แก้ไขออร์เดอร์ ${orderCodeLabel}`
                        : 'เปิดบิลคำสั่งผลิตใหม่'
                }
            />

            <>
                <Dialog
                    open={showValidationModal}
                    onOpenChange={setShowValidationModal}
                >
                    <DialogContent
                        className="sm:max-w-md"
                        onCloseAutoFocus={(event) => {
                            if (pendingJumpRef.current === null) {
                                return;
                            }

                            event.preventDefault();
                            focusMissingField(pendingJumpRef.current);
                            pendingJumpRef.current = null;
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>
                                กรอกข้อมูลให้ครบก่อนบันทึก
                            </DialogTitle>
                            <DialogDescription>
                                กดที่รายการเพื่อไปยังช่องนั้น
                                ช่องที่ยังขาดจะมีกรอบสีแดง
                            </DialogDescription>
                        </DialogHeader>

                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-1.5">
                            <ul className="space-y-0.5 text-sm text-rose-700">
                                {validationErrors.map((message) => (
                                    <li key={message}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                jumpToMissingField(
                                                    validationTargets.get(
                                                        message,
                                                    ) ?? '',
                                                )
                                            }
                                            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-rose-100 focus-visible:bg-rose-100 focus-visible:outline-none"
                                        >
                                            <span>• {message}</span>
                                            <span className="shrink-0 text-xs font-semibold text-rose-600">
                                                ไปที่ช่อง ›
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowValidationModal(false)}
                            >
                                ปิด
                            </Button>
                            <Button
                                type="button"
                                onClick={() =>
                                    jumpToMissingField(
                                        validationTargets.get(
                                            validationErrors[0] ?? '',
                                        ) ?? '',
                                    )
                                }
                            >
                                ไปที่ช่องแรกที่ขาด
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <ArtworkBatchDialog
                    open={artworkDialogOpen}
                    onOpenChange={setArtworkDialogOpen}
                    batches={artworkBatches}
                    files={artworkFiles}
                    scopedFiles={artworkScopedFiles}
                    savedImages={artworkSavedImages}
                    savedScopes={data.artwork_scopes}
                    splitByBatch={showArtworkSplit}
                    onSplitByBatchChange={setArtworkSplitByBatch}
                    onAddFiles={addArtworkFiles}
                    onRemoveFile={removeArtworkFile}
                    onRemoveSaved={removeSavedMedia}
                    onMoveSaved={moveSavedArtwork}
                />

                <Dialog
                    open={showConfirmModal}
                    onOpenChange={setShowConfirmModal}
                >
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>
                                {isEditing
                                    ? 'ยืนยันการบันทึกการแก้ไข'
                                    : 'ยืนยันการบันทึกคำสั่งผลิต'}
                            </DialogTitle>
                            <DialogDescription>
                                {isEditing
                                    ? 'ระบบจะบันทึกการแก้ไขออร์เดอร์นี้และอัปเดตข้อมูลล่าสุดทันที หลังจากยืนยันแล้วจะไม่สามารถย้อนกลับได้'
                                    : 'ระบบจะบันทึกคำสั่งผลิตนี้และส่งข้อมูลไปยังกระบวนการต่อไปทันที หลังจากยืนยันแล้วจะไม่สามารถย้อนกลับได้'}
                            </DialogDescription>
                        </DialogHeader>

                        <DialogFooter className="gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowConfirmModal(false)}
                            >
                                ยกเลิก
                            </Button>
                            <Button
                                type="button"
                                className="bg-gradient-to-r from-[#E21E26] to-[#C91820] text-white hover:from-[#C91820] hover:to-[#B5151C]"
                                onClick={submit}
                            >
                                {isEditing
                                    ? 'ยืนยันและบันทึกการแก้ไข'
                                    : 'ยืนยันและบันทึก'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={showCancelConfirmModal}
                    onOpenChange={setShowCancelConfirmModal}
                >
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>ยืนยันการยกเลิก</DialogTitle>
                            <DialogDescription>
                                คุณต้องการยกเลิกการแก้ไขออร์เดอร์นี้หรือไม่
                                หากยืนยัน ระบบจะกลับไปที่หน้าเคาน์เตอร์ทันที
                            </DialogDescription>
                        </DialogHeader>

                        <DialogFooter className="gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowCancelConfirmModal(false)}
                            >
                                ไม่ใช่
                            </Button>
                            <Button
                                type="button"
                                className="bg-slate-900 text-white hover:bg-slate-800"
                                onClick={() => {
                                    setShowCancelConfirmModal(false);
                                    const counterRoute = currentTeam?.slug
                                        ? `/${currentTeam.slug}/counter`
                                        : '/counter';
                                    router.visit(counterRoute);
                                }}
                            >
                                ตกลง
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <form
                    onSubmit={handleSubmitClick}
                    onKeyDown={moveFocusOnEnter}
                    className="min-h-screen bg-slate-100 pb-12"
                >
                    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-xs">
                        <h1 className="text-base font-semibold text-slate-900 md:text-lg">
                            {isEditing
                                ? `แก้ไขออร์เดอร์ ${orderCodeLabel}`
                                : 'เปิดบิลคำสั่งผลิตใหม่'}
                        </h1>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-9 px-4 text-xs"
                                onClick={() => setShowCancelConfirmModal(true)}
                            >
                                ยกเลิก
                            </Button>
                            <Button
                                type="submit"
                                disabled={processing || isCompressing}
                                className="h-9 bg-gradient-to-r from-[#E21E26] to-[#C91820] px-4 text-xs font-bold text-white hover:from-[#C91820] hover:to-[#B5151C]"
                            >
                                {processing || isCompressing ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                {submittingLabel}
                            </Button>
                        </div>
                    </header>

                    <div className="mx-auto mt-4 w-full max-w-[1720px] px-4 md:px-6">
                        <div className="space-y-4">
                            {/* Each section is a full-width step of the bill,
                                stacked in the order the counter fills them in. */}
                            <div className="space-y-4">
                                {/* General artwork is no longer taken on a bill: artwork
                                    belongs to a garment, a colour house or a size table.
                                    A bill that already carries some — there are bills on
                                    file that do, and a duplicate copies them — still shows
                                    it here so nothing rides along unseen, and can drop it. */}
                                {legacyGeneralArtwork.length > 0 ? (
                                    <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
                                        <h2 className="text-sm font-bold text-slate-900">
                                            Art Work ทั่วไปที่แนบไว้เดิม
                                        </h2>
                                        <p className="mt-1 mb-3 text-[11px] text-slate-600">
                                            ระบบปิดการแนบ Art Work ทั่วไปแล้ว
                                            รูปด้านล่างมาจากบิลเดิม
                                            ยังพิมพ์ออกที่เคาน์เตอร์และห้องผลิต
                                            กดลบได้ถ้าไม่ต้องการ
                                        </p>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            {legacyGeneralArtwork.map(
                                                (media) => (
                                                    <SavedArtworkCard
                                                        key={`legacy-${media.id}`}
                                                        media={media}
                                                        onRemoveSaved={
                                                            removeSavedMedia
                                                        }
                                                    />
                                                ),
                                            )}
                                        </div>
                                    </section>
                                ) : null}

                                <section className="flex flex-1 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <SectionHeading
                                        step={1}
                                        title="ข้อมูลบิล, ลูกค้า และการจัดส่ง"
                                        hint="ใครสั่ง ส่งอย่างไร และรับเมื่อไหร่"
                                    />

                                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                ประเภทงาน
                                            </span>
                                            <Select
                                                value={data.job_type_id}
                                                onValueChange={(value) =>
                                                    setData(
                                                        'job_type_id',
                                                        value,
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="h-9 w-full bg-white text-xs">
                                                    <SelectValue placeholder="เลือกประเภทงาน" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {resolvedJobTypes.map(
                                                        (item) => (
                                                            <SelectItem
                                                                key={item.id}
                                                                value={String(
                                                                    item.id,
                                                                )}
                                                            >
                                                                {item.name}
                                                            </SelectItem>
                                                        ),
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </label>

                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                ชื่อหน่วยงาน, ชื่องาน
                                            </span>
                                            <MasterDataComboBox
                                                storageKey="jssport.job-names"
                                                valueMode="name"
                                                options={resolvedJobNames}
                                                value={data.job_name}
                                                onValueChange={(value) =>
                                                    setData('job_name', value)
                                                }
                                                onOptionAdded={(option) =>
                                                    setExtraJobNameOptions(
                                                        (prev) =>
                                                            prev.some(
                                                                (item) =>
                                                                    item.id ===
                                                                    option.id,
                                                            )
                                                                ? prev
                                                                : [
                                                                      ...prev,
                                                                      option,
                                                                  ],
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('job_name')}`}
                                                aria-label="ชื่อหน่วยงาน, ชื่องาน"
                                            />
                                        </label>

                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                ลูกค้า
                                            </span>
                                            <Input
                                                value={data.customer_name}
                                                onChange={(event) =>
                                                    setData(
                                                        'customer_name',
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="กรอกชื่อลูกค้า"
                                                className={`h-9 text-xs md:text-xs${invalidClass('customer_name')}`}
                                            />
                                        </label>

                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                สาขาที่เปิดบิล
                                            </span>
                                            <Input
                                                value={
                                                    selectedBranch
                                                        ? `${selectedBranch.code} - ${selectedBranch.name}`
                                                        : 'ยังไม่พบข้อมูลสาขาในระบบ'
                                                }
                                                readOnly
                                                className="h-9 bg-slate-50 text-xs md:text-xs"
                                            />
                                        </label>

                                        <label className="grid gap-1.5 text-xs sm:col-span-2">
                                            <span className="font-semibold text-slate-600">
                                                เบอร์ติดต่อ
                                            </span>
                                            <Input
                                                value={data.customer_phone}
                                                onChange={(event) =>
                                                    setData(
                                                        'customer_phone',
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="กรอกเบอร์โทรลูกค้า"
                                                className="h-9 text-xs md:text-xs"
                                            />
                                        </label>

                                        <label className="grid gap-1.5 text-xs sm:col-span-2">
                                            <span className="font-semibold text-slate-600">
                                                ข้อมูลการติดต่อ
                                            </span>
                                            <Input
                                                value={data.contact_detail}
                                                onChange={(event) =>
                                                    setData(
                                                        'contact_detail',
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="เช่น LINE: @xxx หรือ Facebook: ..."
                                                className="h-9 text-xs md:text-xs"
                                            />
                                        </label>

                                        <div className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                วันที่เปิดบิล
                                            </span>
                                            <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700">
                                                <CalendarClock className="mr-2 size-3.5 text-blue-500" />
                                                {data.billing_date}
                                            </div>
                                        </div>

                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                วันที่รับสินค้า
                                            </span>
                                            <div
                                                className={`rounded-md${invalidClass('due_date')}`}
                                            >
                                                <DeliveryDatePicker
                                                    value={data.due_date}
                                                    minDate={data.billing_date}
                                                    dailyCapacity={
                                                        dailyProductionCapacity
                                                    }
                                                    loads={deliveryDateLoads}
                                                    onChange={(date) =>
                                                        setData(
                                                            'due_date',
                                                            date,
                                                        )
                                                    }
                                                />
                                            </div>
                                        </label>
                                    </div>

                                    <div className="mt-3 grid gap-2">
                                        <span className="text-xs font-semibold text-slate-600">
                                            ช่องทางรับสินค้า
                                        </span>
                                        <div className="grid gap-2 sm:grid-cols-3">
                                            {[
                                                {
                                                    value: 'pickup',
                                                    label: 'รับหน้าร้าน',
                                                },
                                                {
                                                    value: 'shipping',
                                                    label: 'ขนส่ง',
                                                },
                                                {
                                                    value: 'onsite',
                                                    label: 'หน้างาน',
                                                },
                                            ].map((item) => (
                                                <Button
                                                    key={item.value}
                                                    type="button"
                                                    variant={
                                                        data.delivery_method ===
                                                        item.value
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    className="h-8 text-xs"
                                                    onClick={() =>
                                                        setData(
                                                            'delivery_method',
                                                            item.value as DeliveryMethod,
                                                        )
                                                    }
                                                >
                                                    {item.label}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>

                                    <div
                                        className={`mt-3 overflow-hidden transition-all duration-200 ${
                                            data.delivery_method ===
                                                'shipping' ||
                                            data.delivery_method === 'onsite'
                                                ? 'max-h-40 opacity-100'
                                                : 'max-h-0 opacity-0'
                                        }`}
                                    >
                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                ที่อยู่จัดส่ง / หน้างาน
                                            </span>
                                            <textarea
                                                rows={3}
                                                value={data.shipping_address}
                                                onChange={(event) =>
                                                    setData(
                                                        'shipping_address',
                                                        event.target.value,
                                                    )
                                                }
                                                className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                            />
                                        </label>
                                    </div>
                                </section>
                            </div>
                        </div>

                        <div className="mt-4 space-y-4">
                            <div className="flex justify-start">
                                <div className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 p-1">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                            sizeFormMode === 'matrix'
                                                ? 'default'
                                                : 'ghost'
                                        }
                                        className="h-8 text-xs"
                                        onClick={() =>
                                            setSizeFormMode('matrix')
                                        }
                                    >
                                        แพทเทรินเสื้อเหมือนกัน (Form 1)
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                            sizeFormMode === 'individual'
                                                ? 'default'
                                                : 'ghost'
                                        }
                                        className="h-8 text-xs"
                                        onClick={showIndividualForm}
                                    >
                                        รายตัว (Form 2)
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                            sizeFormMode === 'sports_day'
                                                ? 'default'
                                                : 'ghost'
                                        }
                                        className="h-8 text-xs"
                                        onClick={() =>
                                            setSizeFormMode('sports_day')
                                        }
                                    >
                                        กีฬาสี (Form 3)
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                            sizeFormMode === 'pe_uniform'
                                                ? 'default'
                                                : 'ghost'
                                        }
                                        className="h-8 text-xs"
                                        onClick={() =>
                                            setSizeFormMode('pe_uniform')
                                        }
                                    >
                                        ชุดพละ (Form 4)
                                    </Button>
                                </div>
                            </div>

                            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <SectionHeading
                                    step={2}
                                    title="รายการสินค้า, สเปก และรูปงาน"
                                    hint={
                                        sizeFormMode === 'individual'
                                            ? 'กรอกรายชื่อทีละคน แล้วกรอกสเปกแยกตามแบบที่สั่ง เช่น เสื้อแขนสั้น / แขนยาว'
                                            : sizeFormMode === 'sports_day'
                                              ? sportsDayKeepsPants
                                                  ? 'กรอกจำนวนตามคณะสี แล้วกรอกสเปกเสื้อและกางเกงที่ใช้กับทุกคณะ'
                                                  : 'กรอกจำนวนเสื้อตามคณะสี แล้วกรอกสเปกเสื้อที่ใช้กับทุกคณะ'
                                              : 'หนึ่งตาราง = ชิ้นงาน ชั้นไซซ์ และความยาวหนึ่งแบบ = ใบงานผลิตหนึ่งใบ'
                                    }
                                    action={
                                        <>
                                            {/*
                                                Each table takes its own
                                                pictures, pinned by where it
                                                sits, so there is nothing to
                                                attach at bill level any more.
                                                A bill written before that —
                                                or copied from one — can still
                                                carry artwork pinned to no
                                                sheet, and this is the only way
                                                left to see it and move it onto
                                                the sheets it belongs to.
                                            */}
                                            {usesSizeTables(sizeFormMode) &&
                                            !editingLegacySizeRows &&
                                            unpinnedArtworkCount > 0 ? (
                                                <ArtworkBatchButton
                                                    attached={
                                                        artworkAttachedCount
                                                    }
                                                    missing={
                                                        artworkBatchesMissing.length
                                                    }
                                                    onOpen={() =>
                                                        setArtworkDialogOpen(
                                                            true,
                                                        )
                                                    }
                                                />
                                            ) : null}
                                        </>
                                    }
                                />

                                {usesSizeTables(sizeFormMode) ? (
                                    // A bill saved with sets keeps the rows it
                                    // was sold on, which are read-only. Every
                                    // other bill is written on one table per
                                    // garment, tier and length.
                                    editingLegacySizeRows ? (
                                        <div className="space-y-4">
                                            {data.size_tables.map((table) => {
                                                const tableSizeOptions =
                                                    table.table_type === 'kids'
                                                        ? resolvedKidsSizes
                                                        : resolvedAdultSizes;
                                                const tableTotals =
                                                    table.rows.reduce(
                                                        (acc, row) => ({
                                                            setShirtQty:
                                                                acc.setShirtQty +
                                                                row.set_shirt_qty,
                                                            setPantsQty:
                                                                acc.setPantsQty +
                                                                row.set_pants_qty,
                                                            setAmount:
                                                                acc.setAmount +
                                                                rowSetTotal(
                                                                    row,
                                                                ),
                                                            sepShirtQty:
                                                                acc.sepShirtQty +
                                                                row.separate_shirt_qty,
                                                            sepPantsQty:
                                                                acc.sepPantsQty +
                                                                row.separate_pants_qty,
                                                            sepAmount:
                                                                acc.sepAmount +
                                                                row.separate_shirt_qty *
                                                                    row.separate_shirt_price +
                                                                row.separate_pants_qty *
                                                                    row.separate_pants_price,
                                                            totalAmount:
                                                                acc.totalAmount +
                                                                rowTotal(row),
                                                        }),
                                                        {
                                                            setShirtQty: 0,
                                                            setPantsQty: 0,
                                                            setAmount: 0,
                                                            sepShirtQty: 0,
                                                            sepPantsQty: 0,
                                                            sepAmount: 0,
                                                            totalAmount: 0,
                                                        },
                                                    );

                                                return (
                                                    <div
                                                        key={table.id}
                                                        className="overflow-hidden rounded-xl border border-slate-200"
                                                    >
                                                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                                                            <div className="flex items-center gap-2">
                                                                <Shirt className="size-4 text-blue-600" />
                                                                <h3 className="text-xs font-bold text-slate-800">
                                                                    {
                                                                        table.title
                                                                    }
                                                                </h3>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                {/* The garment tables each add their own rows; only the
                                                                retired layout needs a table-wide button. */}
                                                                {editingLegacySizeRows ? (
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-7 px-2 text-xs"
                                                                        onClick={() =>
                                                                            addSizeRow(
                                                                                table.id,
                                                                            )
                                                                        }
                                                                    >
                                                                        <Plus className="size-3.5" />
                                                                        เพิ่มแถว
                                                                    </Button>
                                                                ) : null}
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                                                                    onClick={() =>
                                                                        removeSizeTable(
                                                                            table.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <Trash2 className="size-3.5" />
                                                                    ลบตาราง
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        {editingLegacySizeRows ? (
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full min-w-[1480px] table-fixed border-collapse text-xs">
                                                                    <thead>
                                                                        <tr className="bg-slate-100 text-slate-700">
                                                                            <th className="w-[6%] border border-slate-200 px-2 py-2">
                                                                                ไซซ์
                                                                            </th>
                                                                            <th className="w-[11%] border border-slate-200 px-2 py-2">
                                                                                เสื้อ
                                                                            </th>
                                                                            <th
                                                                                className="w-[3%] border border-slate-200 px-1 py-2"
                                                                                title="ล็อกจำนวนเสื้อ/กางเกงให้เท่ากันในแถวนั้น"
                                                                            >
                                                                                <Link2
                                                                                    className="mx-auto size-3.5 text-slate-400"
                                                                                    aria-hidden="true"
                                                                                />
                                                                                <span className="sr-only">
                                                                                    ล็อกจำนวนชุด
                                                                                </span>
                                                                            </th>
                                                                            <th className="w-[11%] border border-slate-200 px-2 py-2">
                                                                                กางเกง
                                                                            </th>
                                                                            <th className="w-[7%] border border-slate-200 px-2 py-2">
                                                                                <PriceLinkHeader
                                                                                    label="ราคาต่อชุด"
                                                                                    linked={isPriceColumnLinked(
                                                                                        table.id,
                                                                                        'set_price',
                                                                                    )}
                                                                                    onToggle={() =>
                                                                                        togglePriceColumnLink(
                                                                                            table.id,
                                                                                            'set_price',
                                                                                        )
                                                                                    }
                                                                                />
                                                                            </th>
                                                                            <th className="w-[7%] border border-slate-200 px-2 py-2">
                                                                                รวมต่อชุด
                                                                            </th>
                                                                            <th className="w-[11%] border border-slate-200 px-2 py-2">
                                                                                เสื้อแยก
                                                                            </th>
                                                                            <th className="w-[11%] border border-slate-200 px-2 py-2">
                                                                                กางเกงแยก
                                                                            </th>
                                                                            <th className="w-[8%] border border-slate-200 px-2 py-2">
                                                                                <PriceLinkHeader
                                                                                    label="ราคาเสื้อ"
                                                                                    linked={isPriceColumnLinked(
                                                                                        table.id,
                                                                                        'separate_shirt_price',
                                                                                    )}
                                                                                    onToggle={() =>
                                                                                        togglePriceColumnLink(
                                                                                            table.id,
                                                                                            'separate_shirt_price',
                                                                                        )
                                                                                    }
                                                                                />
                                                                            </th>
                                                                            <th className="w-[8%] border border-slate-200 px-2 py-2">
                                                                                <PriceLinkHeader
                                                                                    label="ราคากางเกง"
                                                                                    linked={isPriceColumnLinked(
                                                                                        table.id,
                                                                                        'separate_pants_price',
                                                                                    )}
                                                                                    onToggle={() =>
                                                                                        togglePriceColumnLink(
                                                                                            table.id,
                                                                                            'separate_pants_price',
                                                                                        )
                                                                                    }
                                                                                />
                                                                            </th>
                                                                            <th className="w-[8%] border border-slate-200 px-2 py-2">
                                                                                รวมราคาแยกชุด
                                                                            </th>
                                                                            <th className="w-[6%] border border-slate-200 px-2 py-2">
                                                                                ราคารวมแถว
                                                                            </th>
                                                                            <th className="w-[3%] border border-slate-200 px-2 py-2 text-center">
                                                                                ลบ
                                                                            </th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {table.rows.map(
                                                                            (
                                                                                row,
                                                                                rowIndex,
                                                                            ) => (
                                                                                <tr
                                                                                    key={
                                                                                        row.id
                                                                                    }
                                                                                    className="even:bg-slate-50/60"
                                                                                >
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                                                                        <Select
                                                                                            value={
                                                                                                row.size_label
                                                                                            }
                                                                                            onValueChange={(
                                                                                                value,
                                                                                            ) =>
                                                                                                updateSizeRow(
                                                                                                    table.id,
                                                                                                    row.id,
                                                                                                    'size_label',
                                                                                                    value,
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <SelectTrigger className="h-8 w-full bg-white text-xs">
                                                                                                <SelectValue placeholder="ไม่ระบุ" />
                                                                                            </SelectTrigger>
                                                                                            {/* Opens downwards, and Radix flips it above the row on its own when
                                                                            there is not enough room left below the fold. */}
                                                                                            <SelectContent
                                                                                                position="popper"
                                                                                                side="bottom"
                                                                                                sideOffset={
                                                                                                    4
                                                                                                }
                                                                                                avoidCollisions
                                                                                                collisionPadding={
                                                                                                    12
                                                                                                }
                                                                                            >
                                                                                                {tableSizeOptions.map(
                                                                                                    (
                                                                                                        sizeOption,
                                                                                                    ) => (
                                                                                                        <SelectItem
                                                                                                            key={`${table.id}-${row.id}-${sizeOption}`}
                                                                                                            value={
                                                                                                                sizeOption
                                                                                                            }
                                                                                                        >
                                                                                                            {
                                                                                                                sizeOption
                                                                                                            }
                                                                                                        </SelectItem>
                                                                                                    ),
                                                                                                )}
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                                                                        <div className="flex items-center gap-1">
                                                                                            <Select
                                                                                                value={
                                                                                                    row.shirt_style
                                                                                                }
                                                                                                onValueChange={(
                                                                                                    value,
                                                                                                ) =>
                                                                                                    updateSizeRow(
                                                                                                        table.id,
                                                                                                        row.id,
                                                                                                        'shirt_style',
                                                                                                        value as GarmentStyle,
                                                                                                    )
                                                                                                }
                                                                                            >
                                                                                                <SelectTrigger className="h-8 w-[84px] shrink-0 bg-white px-1.5 text-[11px]">
                                                                                                    <SelectValue />
                                                                                                </SelectTrigger>
                                                                                                <SelectContent
                                                                                                    position="popper"
                                                                                                    side="bottom"
                                                                                                    sideOffset={
                                                                                                        4
                                                                                                    }
                                                                                                    avoidCollisions
                                                                                                    collisionPadding={
                                                                                                        12
                                                                                                    }
                                                                                                >
                                                                                                    {SHIRT_STYLES.map(
                                                                                                        (
                                                                                                            styleOption,
                                                                                                        ) => (
                                                                                                            <SelectItem
                                                                                                                key={
                                                                                                                    styleOption
                                                                                                                }
                                                                                                                value={
                                                                                                                    styleOption
                                                                                                                }
                                                                                                            >
                                                                                                                {
                                                                                                                    SHIRT_STYLE_LABELS[
                                                                                                                        styleOption
                                                                                                                    ]
                                                                                                                }
                                                                                                            </SelectItem>
                                                                                                        ),
                                                                                                    )}
                                                                                                </SelectContent>
                                                                                            </Select>
                                                                                            <Input
                                                                                                type="number"
                                                                                                inputMode="numeric"
                                                                                                onWheel={
                                                                                                    blurOnWheel
                                                                                                }
                                                                                                min={
                                                                                                    0
                                                                                                }
                                                                                                value={numberFieldValue(
                                                                                                    row.set_shirt_qty,
                                                                                                )}
                                                                                                placeholder="0"
                                                                                                onChange={(
                                                                                                    event,
                                                                                                ) =>
                                                                                                    updateSizeRow(
                                                                                                        table.id,
                                                                                                        row.id,
                                                                                                        'set_shirt_qty',
                                                                                                        toNumber(
                                                                                                            event
                                                                                                                .target
                                                                                                                .value,
                                                                                                        ),
                                                                                                    )
                                                                                                }
                                                                                                className="h-8 w-full min-w-0 text-xs md:text-xs"
                                                                                                aria-label={`จำนวนเสื้อชุด แถวที่ ${rowIndex + 1}`}
                                                                                            />
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1 py-1.5 text-center align-middle">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() =>
                                                                                                toggleSetQtyLink(
                                                                                                    row.id,
                                                                                                )
                                                                                            }
                                                                                            aria-pressed={isSetQtyLinked(
                                                                                                row.id,
                                                                                            )}
                                                                                            title={
                                                                                                isSetQtyLinked(
                                                                                                    row.id,
                                                                                                )
                                                                                                    ? 'จำนวนเสื้อและกางเกงเท่ากัน (กดเพื่อแยก)'
                                                                                                    : 'กรอกจำนวนเสื้อและกางเกงแยกกัน (กดเพื่อล็อกให้เท่ากัน)'
                                                                                            }
                                                                                            aria-label={
                                                                                                isSetQtyLinked(
                                                                                                    row.id,
                                                                                                )
                                                                                                    ? 'แยกจำนวนเสื้อและกางเกง'
                                                                                                    : 'ล็อกจำนวนเสื้อและกางเกงให้เท่ากัน'
                                                                                            }
                                                                                            className={`rounded p-1 transition-colors ${
                                                                                                isSetQtyLinked(
                                                                                                    row.id,
                                                                                                )
                                                                                                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                                                                                    : 'text-slate-400 hover:text-slate-600'
                                                                                            }`}
                                                                                        >
                                                                                            {isSetQtyLinked(
                                                                                                row.id,
                                                                                            ) ? (
                                                                                                <Link2 className="size-3.5" />
                                                                                            ) : (
                                                                                                <Link2Off className="size-3.5" />
                                                                                            )}
                                                                                        </button>
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                                                                        <div className="flex items-center gap-1">
                                                                                            <Select
                                                                                                value={
                                                                                                    row.pants_style
                                                                                                }
                                                                                                onValueChange={(
                                                                                                    value,
                                                                                                ) =>
                                                                                                    updateSizeRow(
                                                                                                        table.id,
                                                                                                        row.id,
                                                                                                        'pants_style',
                                                                                                        value as GarmentStyle,
                                                                                                    )
                                                                                                }
                                                                                            >
                                                                                                <SelectTrigger className="h-8 w-[84px] shrink-0 bg-white px-1.5 text-[11px]">
                                                                                                    <SelectValue />
                                                                                                </SelectTrigger>
                                                                                                <SelectContent
                                                                                                    position="popper"
                                                                                                    side="bottom"
                                                                                                    sideOffset={
                                                                                                        4
                                                                                                    }
                                                                                                    avoidCollisions
                                                                                                    collisionPadding={
                                                                                                        12
                                                                                                    }
                                                                                                >
                                                                                                    <SelectItem value="short">
                                                                                                        ขาสั้น
                                                                                                    </SelectItem>
                                                                                                    <SelectItem value="long">
                                                                                                        ขายาว
                                                                                                    </SelectItem>
                                                                                                </SelectContent>
                                                                                            </Select>
                                                                                            <Input
                                                                                                type="number"
                                                                                                inputMode="numeric"
                                                                                                onWheel={
                                                                                                    blurOnWheel
                                                                                                }
                                                                                                min={
                                                                                                    0
                                                                                                }
                                                                                                value={numberFieldValue(
                                                                                                    row.set_pants_qty,
                                                                                                )}
                                                                                                placeholder="0"
                                                                                                onChange={(
                                                                                                    event,
                                                                                                ) =>
                                                                                                    updateSizeRow(
                                                                                                        table.id,
                                                                                                        row.id,
                                                                                                        'set_pants_qty',
                                                                                                        toNumber(
                                                                                                            event
                                                                                                                .target
                                                                                                                .value,
                                                                                                        ),
                                                                                                    )
                                                                                                }
                                                                                                className="h-8 w-full min-w-0 text-xs md:text-xs"
                                                                                                aria-label={`จำนวนกางเกงชุด แถวที่ ${rowIndex + 1}`}
                                                                                            />
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                                                                        <Input
                                                                                            type="number"
                                                                                            inputMode="decimal"
                                                                                            onWheel={
                                                                                                blurOnWheel
                                                                                            }
                                                                                            min={
                                                                                                0
                                                                                            }
                                                                                            value={numberFieldValue(
                                                                                                row.set_price,
                                                                                            )}
                                                                                            placeholder="0"
                                                                                            onChange={(
                                                                                                event,
                                                                                            ) =>
                                                                                                updateSizeRow(
                                                                                                    table.id,
                                                                                                    row.id,
                                                                                                    'set_price',
                                                                                                    toNumber(
                                                                                                        event
                                                                                                            .target
                                                                                                            .value,
                                                                                                    ),
                                                                                                )
                                                                                            }
                                                                                            className="h-8 text-xs md:text-xs"
                                                                                        />
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-2 py-1.5 text-right align-middle font-semibold text-slate-700">
                                                                                        {formatMoney(
                                                                                            rowSetTotal(
                                                                                                row,
                                                                                            ),
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                                                                        <div className="flex items-center gap-1">
                                                                                            <div className="w-[52px] shrink-0 truncate text-center text-[10px] text-slate-500">
                                                                                                {
                                                                                                    SHIRT_STYLE_LABELS[
                                                                                                        row
                                                                                                            .shirt_style
                                                                                                    ]
                                                                                                }
                                                                                            </div>
                                                                                            <Input
                                                                                                type="number"
                                                                                                inputMode="numeric"
                                                                                                onWheel={
                                                                                                    blurOnWheel
                                                                                                }
                                                                                                min={
                                                                                                    0
                                                                                                }
                                                                                                value={numberFieldValue(
                                                                                                    row.separate_shirt_qty,
                                                                                                )}
                                                                                                placeholder="0"
                                                                                                onChange={(
                                                                                                    event,
                                                                                                ) =>
                                                                                                    updateSizeRow(
                                                                                                        table.id,
                                                                                                        row.id,
                                                                                                        'separate_shirt_qty',
                                                                                                        toNumber(
                                                                                                            event
                                                                                                                .target
                                                                                                                .value,
                                                                                                        ),
                                                                                                    )
                                                                                                }
                                                                                                className="h-8 w-full min-w-0 text-xs md:text-xs"
                                                                                                aria-label={`จำนวนเสื้อแยก แถวที่ ${rowIndex + 1}`}
                                                                                            />
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                                                                        <div className="flex items-center gap-1">
                                                                                            <div className="w-[52px] shrink-0 truncate text-center text-[10px] text-slate-500">
                                                                                                {
                                                                                                    PANTS_STYLE_LABELS[
                                                                                                        row
                                                                                                            .pants_style
                                                                                                    ]
                                                                                                }
                                                                                            </div>
                                                                                            <Input
                                                                                                type="number"
                                                                                                inputMode="numeric"
                                                                                                onWheel={
                                                                                                    blurOnWheel
                                                                                                }
                                                                                                min={
                                                                                                    0
                                                                                                }
                                                                                                value={numberFieldValue(
                                                                                                    row.separate_pants_qty,
                                                                                                )}
                                                                                                placeholder="0"
                                                                                                onChange={(
                                                                                                    event,
                                                                                                ) =>
                                                                                                    updateSizeRow(
                                                                                                        table.id,
                                                                                                        row.id,
                                                                                                        'separate_pants_qty',
                                                                                                        toNumber(
                                                                                                            event
                                                                                                                .target
                                                                                                                .value,
                                                                                                        ),
                                                                                                    )
                                                                                                }
                                                                                                className="h-8 w-full min-w-0 text-xs md:text-xs"
                                                                                                aria-label={`จำนวนกางเกงแยก แถวที่ ${rowIndex + 1}`}
                                                                                            />
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                                                                        <Input
                                                                                            type="number"
                                                                                            inputMode="decimal"
                                                                                            onWheel={
                                                                                                blurOnWheel
                                                                                            }
                                                                                            min={
                                                                                                0
                                                                                            }
                                                                                            value={numberFieldValue(
                                                                                                row.separate_shirt_price,
                                                                                            )}
                                                                                            placeholder="0"
                                                                                            onChange={(
                                                                                                event,
                                                                                            ) =>
                                                                                                updateSizeRow(
                                                                                                    table.id,
                                                                                                    row.id,
                                                                                                    'separate_shirt_price',
                                                                                                    toNumber(
                                                                                                        event
                                                                                                            .target
                                                                                                            .value,
                                                                                                    ),
                                                                                                )
                                                                                            }
                                                                                            className="h-8 text-xs md:text-xs"
                                                                                        />
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5 align-middle">
                                                                                        <Input
                                                                                            type="number"
                                                                                            inputMode="decimal"
                                                                                            onWheel={
                                                                                                blurOnWheel
                                                                                            }
                                                                                            min={
                                                                                                0
                                                                                            }
                                                                                            value={numberFieldValue(
                                                                                                row.separate_pants_price,
                                                                                            )}
                                                                                            placeholder="0"
                                                                                            onChange={(
                                                                                                event,
                                                                                            ) =>
                                                                                                updateSizeRow(
                                                                                                    table.id,
                                                                                                    row.id,
                                                                                                    'separate_pants_price',
                                                                                                    toNumber(
                                                                                                        event
                                                                                                            .target
                                                                                                            .value,
                                                                                                    ),
                                                                                                )
                                                                                            }
                                                                                            className="h-8 text-xs md:text-xs"
                                                                                        />
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-2 py-1.5 text-right align-middle font-semibold text-slate-700">
                                                                                        {formatMoney(
                                                                                            rowSeparateTotal(
                                                                                                row,
                                                                                            ),
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-2 py-1.5 text-right align-middle font-bold text-slate-900">
                                                                                        {formatMoney(
                                                                                            rowTotal(
                                                                                                row,
                                                                                            ),
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1 py-1.5 text-center align-middle">
                                                                                        <Button
                                                                                            type="button"
                                                                                            size="icon"
                                                                                            variant="ghost"
                                                                                            className="size-7 text-rose-600 hover:text-rose-700"
                                                                                            onClick={() =>
                                                                                                removeSizeRow(
                                                                                                    table.id,
                                                                                                    row.id,
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <Trash2 className="size-3.5" />
                                                                                        </Button>
                                                                                    </td>
                                                                                </tr>
                                                                            ),
                                                                        )}
                                                                    </tbody>
                                                                    <tfoot>
                                                                        <tr className="bg-yellow-100 font-bold text-red-600">
                                                                            <td className="border border-slate-200 px-2 py-2">
                                                                                รวม
                                                                            </td>
                                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                                {
                                                                                    tableTotals.setShirtQty
                                                                                }
                                                                            </td>
                                                                            <td className="border border-slate-200 px-1 py-2" />
                                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                                {
                                                                                    tableTotals.setPantsQty
                                                                                }
                                                                            </td>
                                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                                -
                                                                            </td>
                                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                                {formatMoney(
                                                                                    tableTotals.setAmount,
                                                                                )}
                                                                            </td>
                                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                                {
                                                                                    tableTotals.sepShirtQty
                                                                                }
                                                                            </td>
                                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                                {
                                                                                    tableTotals.sepPantsQty
                                                                                }
                                                                            </td>
                                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                                -
                                                                            </td>
                                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                                -
                                                                            </td>
                                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                                {formatMoney(
                                                                                    tableTotals.sepAmount,
                                                                                )}
                                                                            </td>
                                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                                {formatMoney(
                                                                                    tableTotals.totalAmount,
                                                                                )}
                                                                            </td>
                                                                            <td className="border border-slate-200 px-2 py-2">
                                                                                -
                                                                            </td>
                                                                        </tr>
                                                                    </tfoot>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-2.5 p-2.5">
                                                                <div className="grid gap-2.5 lg:grid-cols-2">
                                                                    <GarmentTable
                                                                        title="เสื้อ"
                                                                        garment="shirt"
                                                                        rows={
                                                                            table.shirt_rows
                                                                        }
                                                                        sizeOptions={
                                                                            tableSizeOptions
                                                                        }
                                                                        priceLinked={isGarmentPriceLinked(
                                                                            table.id,
                                                                            'shirt_rows',
                                                                        )}
                                                                        onTogglePriceLink={() =>
                                                                            toggleGarmentPriceLink(
                                                                                table.id,
                                                                                'shirt_rows',
                                                                            )
                                                                        }
                                                                        onChange={(
                                                                            rowId,
                                                                            key,
                                                                            value,
                                                                        ) =>
                                                                            updateGarmentRow(
                                                                                table.id,
                                                                                'shirt_rows',
                                                                                rowId,
                                                                                key,
                                                                                value,
                                                                            )
                                                                        }
                                                                        onAdd={() =>
                                                                            addGarmentRow(
                                                                                table.id,
                                                                                'shirt_rows',
                                                                            )
                                                                        }
                                                                        onRemove={(
                                                                            rowId,
                                                                        ) =>
                                                                            removeGarmentRow(
                                                                                table.id,
                                                                                'shirt_rows',
                                                                                rowId,
                                                                            )
                                                                        }
                                                                    />
                                                                    <GarmentTable
                                                                        title="กางเกง"
                                                                        garment="pants"
                                                                        rows={
                                                                            table.pants_rows
                                                                        }
                                                                        sizeOptions={
                                                                            tableSizeOptions
                                                                        }
                                                                        priceLinked={isGarmentPriceLinked(
                                                                            table.id,
                                                                            'pants_rows',
                                                                        )}
                                                                        onTogglePriceLink={() =>
                                                                            toggleGarmentPriceLink(
                                                                                table.id,
                                                                                'pants_rows',
                                                                            )
                                                                        }
                                                                        onChange={(
                                                                            rowId,
                                                                            key,
                                                                            value,
                                                                        ) =>
                                                                            updateGarmentRow(
                                                                                table.id,
                                                                                'pants_rows',
                                                                                rowId,
                                                                                key,
                                                                                value,
                                                                            )
                                                                        }
                                                                        onAdd={() =>
                                                                            addGarmentRow(
                                                                                table.id,
                                                                                'pants_rows',
                                                                            )
                                                                        }
                                                                        onRemove={(
                                                                            rowId,
                                                                        ) =>
                                                                            removeGarmentRow(
                                                                                table.id,
                                                                                'pants_rows',
                                                                                rowId,
                                                                            )
                                                                        }
                                                                    />
                                                                </div>

                                                                <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                                                    <span className="text-slate-600">
                                                                        รวม
                                                                        เสื้อ{' '}
                                                                        <strong className="font-bold text-slate-900 tabular-nums">
                                                                            {garmentRowsTotals(
                                                                                table.shirt_rows,
                                                                            ).quantity.toLocaleString(
                                                                                'th-TH',
                                                                            )}
                                                                        </strong>{' '}
                                                                        ตัว{' '}
                                                                        <strong className="font-bold text-slate-900 tabular-nums">
                                                                            {formatMoney(
                                                                                garmentRowsTotals(
                                                                                    table.shirt_rows,
                                                                                )
                                                                                    .amount,
                                                                            )}
                                                                        </strong>{' '}
                                                                        บ.
                                                                    </span>
                                                                    <span className="text-slate-600">
                                                                        รวม
                                                                        กางเกง{' '}
                                                                        <strong className="font-bold text-slate-900 tabular-nums">
                                                                            {garmentRowsTotals(
                                                                                table.pants_rows,
                                                                            ).quantity.toLocaleString(
                                                                                'th-TH',
                                                                            )}
                                                                        </strong>{' '}
                                                                        ตัว{' '}
                                                                        <strong className="font-bold text-slate-900 tabular-nums">
                                                                            {formatMoney(
                                                                                garmentRowsTotals(
                                                                                    table.pants_rows,
                                                                                )
                                                                                    .amount,
                                                                            )}
                                                                        </strong>{' '}
                                                                        บ.
                                                                    </span>
                                                                    <span className="font-bold text-slate-900">
                                                                        ราคารวม{' '}
                                                                        <strong className="text-sm font-bold text-[#E21E26] tabular-nums">
                                                                            {formatMoney(
                                                                                garmentRowsTotals(
                                                                                    table.shirt_rows,
                                                                                )
                                                                                    .amount +
                                                                                    garmentRowsTotals(
                                                                                        table.pants_rows,
                                                                                    )
                                                                                        .amount,
                                                                            )}
                                                                        </strong>{' '}
                                                                        บาท
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            {/*
                                                Shirts and trousers are added
                                                and read separately: a bill can
                                                sell four shirt tables and one
                                                pair of trousers, and mixing
                                                them in one list made the
                                                counter hunt for the garment
                                                they were working on.
                                            */}
                                            {(['shirt', 'pants'] as const).map(
                                                (garment) => {
                                                    const garmentTables =
                                                        data.garment_tables.filter(
                                                            (table) =>
                                                                table.garment ===
                                                                garment,
                                                        );

                                                    return (
                                                        <section
                                                            key={garment}
                                                            data-garment-group={
                                                                garment
                                                            }
                                                            className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/40 p-3"
                                                        >
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <h3 className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-600">
                                                                    <span
                                                                        className={`h-3.5 w-1 rounded-full ${
                                                                            garment ===
                                                                            'pants'
                                                                                ? 'bg-[#E21E26]'
                                                                                : 'bg-[#174395]'
                                                                        }`}
                                                                    />
                                                                    {garment ===
                                                                    'pants'
                                                                        ? 'กางเกง'
                                                                        : 'เสื้อ'}
                                                                    <span className="font-normal text-slate-400">
                                                                        {
                                                                            garmentTables.length
                                                                        }{' '}
                                                                        ตาราง
                                                                    </span>
                                                                </h3>
                                                                {/*
                                                                    Only worth
                                                                    offering once
                                                                    there is more
                                                                    than one table
                                                                    to fold.
                                                                */}
                                                                {garmentTables.length >
                                                                1 ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 px-2 text-[11px] text-slate-600"
                                                                            onClick={() =>
                                                                                foldEveryTable(
                                                                                    garment,
                                                                                    true,
                                                                                )
                                                                            }
                                                                        >
                                                                            ยุบทั้งหมด
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 px-2 text-[11px] text-slate-600"
                                                                            onClick={() =>
                                                                                foldEveryTable(
                                                                                    garment,
                                                                                    false,
                                                                                )
                                                                            }
                                                                        >
                                                                            กางทั้งหมด
                                                                        </Button>
                                                                    </div>
                                                                ) : null}
                                                            </div>

                                                            {garmentTables.length ===
                                                            0 ? (
                                                                <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs text-slate-500">
                                                                    ยังไม่มีตาราง
                                                                    {garment ===
                                                                    'pants'
                                                                        ? 'กางเกง'
                                                                        : 'เสื้อ'}{' '}
                                                                    —
                                                                    กดเพิ่มด้านล่าง
                                                                </p>
                                                            ) : null}

                                                            {garmentTables.map(
                                                                (table) => {
                                                                    // Other tables of this
                                                                    // garment, whose spec this
                                                                    // one can be copied from.
                                                                    const sameGarmentTables =
                                                                        data.garment_tables.filter(
                                                                            (
                                                                                other,
                                                                            ) =>
                                                                                other.id !==
                                                                                    table.id &&
                                                                                other.garment ===
                                                                                    table.garment,
                                                                        );
                                                                    const sizeOptions =
                                                                        sizeOptionsForTier(
                                                                            table.tier,
                                                                        );
                                                                    const lengthWord =
                                                                        table.garment ===
                                                                        'pants'
                                                                            ? 'ขา'
                                                                            : 'แขน';
                                                                    const spare =
                                                                        stylesFor(
                                                                            table.garment,
                                                                        ).filter(
                                                                            (
                                                                                style,
                                                                            ) =>
                                                                                !hasGarmentTableFor(
                                                                                    data.garment_tables,
                                                                                    table.garment,
                                                                                    table.tier,
                                                                                    style,
                                                                                ),
                                                                        );

                                                                    return (
                                                                        <article
                                                                            key={
                                                                                table.id
                                                                            }
                                                                            data-garment-table={garmentTableKey(
                                                                                table,
                                                                            )}
                                                                            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                                                                        >
                                                                            <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-200 bg-slate-50 px-3 py-2.5">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        toggleTableFolded(
                                                                                            table.id,
                                                                                        )
                                                                                    }
                                                                                    aria-expanded={
                                                                                        !isTableFolded(
                                                                                            table.id,
                                                                                        )
                                                                                    }
                                                                                    className="flex min-w-0 flex-wrap items-center gap-2 text-left"
                                                                                >
                                                                                    <span
                                                                                        className={`h-4 w-1 shrink-0 rounded-full ${
                                                                                            table.garment ===
                                                                                            'pants'
                                                                                                ? 'bg-[#E21E26]'
                                                                                                : 'bg-[#174395]'
                                                                                        }`}
                                                                                    />
                                                                                    <ChevronDown
                                                                                        className={`size-3.5 shrink-0 text-slate-400 transition-transform ${
                                                                                            isTableFolded(
                                                                                                table.id,
                                                                                            )
                                                                                                ? '-rotate-90'
                                                                                                : ''
                                                                                        }`}
                                                                                    />
                                                                                    <span className="text-sm font-bold text-slate-900">
                                                                                        {garmentTableTitle(
                                                                                            table,
                                                                                        )}
                                                                                    </span>
                                                                                    {/*
                                                                                        Folded, this line is all the
                                                                                        counter has of the table, so it
                                                                                        carries what they would have
                                                                                        opened it to check.
                                                                                    */}
                                                                                    {isTableFolded(
                                                                                        table.id,
                                                                                    ) ? (
                                                                                        <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-500">
                                                                                            <span className="font-mono">
                                                                                                {
                                                                                                    garmentTableTotals(
                                                                                                        table,
                                                                                                    )
                                                                                                        .quantity
                                                                                                }{' '}
                                                                                                ตัว
                                                                                            </span>
                                                                                            <span className="font-mono">
                                                                                                ฿{' '}
                                                                                                {formatMoney(
                                                                                                    garmentTableTotals(
                                                                                                        table,
                                                                                                    )
                                                                                                        .amount,
                                                                                                )}
                                                                                            </span>
                                                                                            {specBlanksFor(
                                                                                                table,
                                                                                            ) >
                                                                                            0 ? (
                                                                                                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700">
                                                                                                    สเปกขาด{' '}
                                                                                                    {specBlanksFor(
                                                                                                        table,
                                                                                                    )}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                                                                                                    สเปกครบ
                                                                                                </span>
                                                                                            )}
                                                                                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600">
                                                                                                {tableArtworkCount(
                                                                                                    table,
                                                                                                ) >
                                                                                                0
                                                                                                    ? `${tableArtworkCount(table)} รูป`
                                                                                                    : 'ไม่มีรูป'}
                                                                                            </span>
                                                                                        </span>
                                                                                    ) : null}
                                                                                </button>
                                                                                <div className="flex flex-wrap items-center gap-2">
                                                                                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                                                                                        แบบ
                                                                                        {
                                                                                            lengthWord
                                                                                        }
                                                                                        <Select
                                                                                            value={
                                                                                                table.style
                                                                                            }
                                                                                            onValueChange={(
                                                                                                value,
                                                                                            ) =>
                                                                                                changeGarmentTableStyle(
                                                                                                    table.id,
                                                                                                    value as GarmentStyle,
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <SelectTrigger
                                                                                                className="h-8 w-[118px] bg-white text-xs"
                                                                                                aria-label={`แบบ${lengthWord} ${garmentTableTitle(table)}`}
                                                                                            >
                                                                                                <SelectValue />
                                                                                            </SelectTrigger>
                                                                                            <SelectContent>
                                                                                                {stylesFor(
                                                                                                    table.garment,
                                                                                                ).map(
                                                                                                    (
                                                                                                        style,
                                                                                                    ) => (
                                                                                                        <SelectItem
                                                                                                            key={
                                                                                                                style
                                                                                                            }
                                                                                                            value={
                                                                                                                style
                                                                                                            }
                                                                                                            // A length the bill already
                                                                                                            // sells in this tier is its
                                                                                                            // own table; switching to it
                                                                                                            // would be two specs for one
                                                                                                            // sheet.
                                                                                                            disabled={
                                                                                                                style !==
                                                                                                                    table.style &&
                                                                                                                hasGarmentTableFor(
                                                                                                                    data.garment_tables,
                                                                                                                    table.garment,
                                                                                                                    table.tier,
                                                                                                                    style,
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            {styleLabel(
                                                                                                                table.garment,
                                                                                                                style,
                                                                                                            )}
                                                                                                        </SelectItem>
                                                                                                    ),
                                                                                                )}
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                    </label>
                                                                                    {spare.length >
                                                                                    0 ? (
                                                                                        <Button
                                                                                            type="button"
                                                                                            size="sm"
                                                                                            variant="outline"
                                                                                            className="h-8 border-[#174395] bg-white px-2.5 text-[11px] font-semibold text-[#174395] hover:bg-[#174395] hover:text-white"
                                                                                            onClick={() =>
                                                                                                addGarmentTableStyle(
                                                                                                    table.garment,
                                                                                                    table.tier,
                                                                                                    spare[0],
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <Plus className="size-3.5" />
                                                                                            เพิ่มแบบ
                                                                                            {
                                                                                                lengthWord
                                                                                            }
                                                                                        </Button>
                                                                                    ) : null}
                                                                                    <Button
                                                                                        type="button"
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        className="h-7 px-2 text-[11px] text-rose-600 hover:text-rose-700"
                                                                                        onClick={() =>
                                                                                            removeGarmentTable(
                                                                                                table.id,
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        <Trash2 className="size-3" />
                                                                                        ลบตาราง
                                                                                    </Button>
                                                                                </div>
                                                                            </header>

                                                                            {/*
                                                                                A folded table keeps its heading,
                                                                                which carries the counts the
                                                                                counter would open it to read.
                                                                            */}
                                                                            {isTableFolded(
                                                                                table.id,
                                                                            ) ? null : (
                                                                                <>
                                                                                    <div className="p-2.5">
                                                                                        <GarmentTierTable
                                                                                            title={
                                                                                                table.garment ===
                                                                                                'pants'
                                                                                                    ? 'กางเกง'
                                                                                                    : 'เสื้อ'
                                                                                            }
                                                                                            garment={
                                                                                                table.garment
                                                                                            }
                                                                                            rows={
                                                                                                table.rows
                                                                                            }
                                                                                            sizeOptions={
                                                                                                sizeOptions
                                                                                            }
                                                                                            priceLinked={isTablePriceLinked(
                                                                                                table.id,
                                                                                            )}
                                                                                            onTogglePriceLink={() =>
                                                                                                toggleTablePriceLink(
                                                                                                    table.id,
                                                                                                )
                                                                                            }
                                                                                            onChange={(
                                                                                                rowId,
                                                                                                key,
                                                                                                value,
                                                                                            ) =>
                                                                                                updateGarmentTableRow(
                                                                                                    table.id,
                                                                                                    rowId,
                                                                                                    {
                                                                                                        [key]: value,
                                                                                                    },
                                                                                                )
                                                                                            }
                                                                                            onAdd={() =>
                                                                                                addGarmentTableRow(
                                                                                                    table.id,
                                                                                                )
                                                                                            }
                                                                                            onRemove={(
                                                                                                rowId,
                                                                                            ) =>
                                                                                                removeGarmentTableRow(
                                                                                                    table.id,
                                                                                                    rowId,
                                                                                                )
                                                                                            }
                                                                                            invalidClass={
                                                                                                invalidClass
                                                                                            }
                                                                                        />
                                                                                    </div>
                                                                                    <div className="border-t border-slate-200 bg-slate-50/50 px-2.5 py-3">
                                                                                        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() =>
                                                                                                    toggleSpecOpen(
                                                                                                        table,
                                                                                                    )
                                                                                                }
                                                                                                aria-expanded={isSpecOpen(
                                                                                                    table,
                                                                                                )}
                                                                                                className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-slate-950"
                                                                                            >
                                                                                                <ChevronDown
                                                                                                    className={`size-3.5 text-slate-400 transition-transform ${
                                                                                                        isSpecOpen(
                                                                                                            table,
                                                                                                        )
                                                                                                            ? ''
                                                                                                            : '-rotate-90'
                                                                                                    }`}
                                                                                                />
                                                                                                สเปก
                                                                                                {table.garment ===
                                                                                                'pants'
                                                                                                    ? 'กางเกง'
                                                                                                    : 'เสื้อ'}
                                                                                                {specBlanksFor(
                                                                                                    table,
                                                                                                ) >
                                                                                                0 ? (
                                                                                                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                                                                                        ยังขาด{' '}
                                                                                                        {specBlanksFor(
                                                                                                            table,
                                                                                                        )}{' '}
                                                                                                        ช่อง
                                                                                                    </span>
                                                                                                ) : (
                                                                                                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                                                                        กรอกครบ
                                                                                                    </span>
                                                                                                )}
                                                                                            </button>
                                                                                            {sameGarmentTables.length >
                                                                                            0 ? (
                                                                                                <Select
                                                                                                    value=""
                                                                                                    onValueChange={(
                                                                                                        sourceId,
                                                                                                    ) =>
                                                                                                        copyGarmentTableSpecs(
                                                                                                            table.id,
                                                                                                            sourceId,
                                                                                                        )
                                                                                                    }
                                                                                                >
                                                                                                    <SelectTrigger
                                                                                                        className="h-7 w-auto gap-1 border-dashed bg-white text-[11px]"
                                                                                                        aria-label={`คัดลอกสเปกมาที่ ${garmentTableTitle(table)}`}
                                                                                                    >
                                                                                                        <Copy className="size-3" />
                                                                                                        <SelectValue placeholder="คัดลอกสเปกจากตารางอื่น" />
                                                                                                    </SelectTrigger>
                                                                                                    <SelectContent>
                                                                                                        {sameGarmentTables.map(
                                                                                                            (
                                                                                                                other,
                                                                                                            ) => (
                                                                                                                <SelectItem
                                                                                                                    key={
                                                                                                                        other.id
                                                                                                                    }
                                                                                                                    value={
                                                                                                                        other.id
                                                                                                                    }
                                                                                                                >
                                                                                                                    {garmentTableTitle(
                                                                                                                        other,
                                                                                                                    )}
                                                                                                                </SelectItem>
                                                                                                            ),
                                                                                                        )}
                                                                                                    </SelectContent>
                                                                                                </Select>
                                                                                            ) : null}
                                                                                        </div>

                                                                                        <div className="mb-3">
                                                                                            <MultiArtworkUpload
                                                                                                title={`Art Work · ${garmentTableTitle(table)}`}
                                                                                                inputId={`artwork-${garmentTableKey(table)}`}
                                                                                                files={
                                                                                                    (table.garment ===
                                                                                                    'pants'
                                                                                                        ? data.pants_artwork_scoped
                                                                                                        : data.shirt_artwork_scoped)[
                                                                                                        garmentTableKey(
                                                                                                            table,
                                                                                                        )
                                                                                                    ] ??
                                                                                                    []
                                                                                                }
                                                                                                previewUrls={
                                                                                                    scopedArtworkPreviews[
                                                                                                        `${table.garment}:${garmentTableKey(table)}`
                                                                                                    ] ??
                                                                                                    []
                                                                                                }
                                                                                                savedMedia={savedArtworkForBatch(
                                                                                                    table.garment,
                                                                                                    garmentTableKey(
                                                                                                        table,
                                                                                                    ),
                                                                                                )}
                                                                                                onSelect={(
                                                                                                    event,
                                                                                                ) => {
                                                                                                    void handleTableArtworkSelect(
                                                                                                        table.garment,
                                                                                                        garmentTableKey(
                                                                                                            table,
                                                                                                        ),
                                                                                                        event,
                                                                                                    );
                                                                                                }}
                                                                                                onRemove={(
                                                                                                    index,
                                                                                                ) =>
                                                                                                    removeArtworkFile(
                                                                                                        table.garment,
                                                                                                        garmentTableKey(
                                                                                                            table,
                                                                                                        ),
                                                                                                        index,
                                                                                                    )
                                                                                                }
                                                                                                onRemoveSaved={
                                                                                                    removeSavedMedia
                                                                                                }
                                                                                            />
                                                                                        </div>
                                                                                        {isSpecOpen(
                                                                                            table,
                                                                                        ) ? (
                                                                                            <>
                                                                                                <div
                                                                                                    data-slot="garment-spec"
                                                                                                    data-garment={
                                                                                                        table.garment
                                                                                                    }
                                                                                                    className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
                                                                                                >
                                                                                                    {table.garment ===
                                                                                                    'pants'
                                                                                                        ? renderPantsSpecFields(
                                                                                                              table.specs,
                                                                                                              garmentTableKey(
                                                                                                                  table,
                                                                                                              ),
                                                                                                              (
                                                                                                                  key,
                                                                                                                  value,
                                                                                                              ) =>
                                                                                                                  updatePantsTableSpecs(
                                                                                                                      table.id,
                                                                                                                      key,
                                                                                                                      value,
                                                                                                                  ),
                                                                                                              garmentTypesForStyle(
                                                                                                                  resolvedPantsTypes,
                                                                                                                  table.style,
                                                                                                                  table
                                                                                                                      .specs
                                                                                                                      .pants_type_id,
                                                                                                              ),
                                                                                                          )
                                                                                                        : renderShirtSpecFields(
                                                                                                              table.specs,
                                                                                                              garmentTableKey(
                                                                                                                  table,
                                                                                                              ),
                                                                                                              (
                                                                                                                  key,
                                                                                                                  value,
                                                                                                              ) =>
                                                                                                                  updateShirtTableSpecs(
                                                                                                                      table.id,
                                                                                                                      key,
                                                                                                                      value,
                                                                                                                  ),
                                                                                                              (
                                                                                                                  key,
                                                                                                                  value,
                                                                                                              ) => {
                                                                                                                  // An empty value is the hidden native
                                                                                                                  // <select> echoing on remount, never the
                                                                                                                  // user: the dropdown has no blank option.
                                                                                                                  if (
                                                                                                                      value !==
                                                                                                                      ''
                                                                                                                  ) {
                                                                                                                      updateShirtTableSpecs(
                                                                                                                          table.id,
                                                                                                                          key,
                                                                                                                          value as ShirtSpecsForm[typeof key],
                                                                                                                      );
                                                                                                                  }
                                                                                                              },
                                                                                                              garmentTypesForStyle(
                                                                                                                  resolvedShirtTypes,
                                                                                                                  table.style,
                                                                                                                  table
                                                                                                                      .specs
                                                                                                                      .shirt_type_id,
                                                                                                              ),
                                                                                                          )}
                                                                                                </div>
                                                                                            </>
                                                                                        ) : null}
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                        </article>
                                                                    );
                                                                },
                                                            )}

                                                            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-2.5">
                                                                <span className="text-[11px] font-semibold text-slate-500">
                                                                    เพิ่มตาราง
                                                                    {garment ===
                                                                    'pants'
                                                                        ? 'กางเกง'
                                                                        : 'เสื้อ'}
                                                                    ไซซ์
                                                                </span>
                                                                {SIZE_TIERS.map(
                                                                    (tier) => (
                                                                        <Button
                                                                            key={
                                                                                tier
                                                                            }
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="outline"
                                                                            className="h-8 bg-white text-xs"
                                                                            onClick={() =>
                                                                                addGarmentTable(
                                                                                    garment,
                                                                                    tier,
                                                                                )
                                                                            }
                                                                        >
                                                                            <Plus className="size-3.5" />
                                                                            {
                                                                                SIZE_TIER_LABELS[
                                                                                    tier
                                                                                ]
                                                                            }
                                                                        </Button>
                                                                    ),
                                                                )}
                                                            </div>
                                                        </section>
                                                    );
                                                },
                                            )}
                                        </div>
                                    )
                                ) : null}

                                {sizeFormMode === 'sports_day' ? (
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                            <span className="text-xs font-semibold text-slate-700">
                                                คณะสีทั้งหมด{' '}
                                                <span className="font-mono text-sm text-slate-900">
                                                    {
                                                        data.sports_day_groups
                                                            .length
                                                    }
                                                </span>{' '}
                                                คณะ
                                            </span>
                                            <span className="text-xs text-slate-600">
                                                รวม{' '}
                                                <span className="font-mono text-sm font-semibold text-slate-900">
                                                    {sportsDayTotalPieces}
                                                </span>{' '}
                                                ตัว ·{' '}
                                                <span className="font-mono text-sm font-semibold text-slate-900">
                                                    ฿{' '}
                                                    {formatMoney(
                                                        sportsDayGrossAmount,
                                                    )}
                                                </span>
                                            </span>
                                        </div>

                                        {data.sports_day_groups.map(
                                            (group, groupIndex) => {
                                                const groupPieces =
                                                    sportsDayGroupPieces(group);
                                                const groupTotal =
                                                    sportsDayGroupTotal(group);
                                                // Saved images the user has not asked to remove.
                                                const savedGroupArtwork =
                                                    visibleSavedMedia(
                                                        group.saved_artwork,
                                                    );

                                                return (
                                                    <div
                                                        key={group.id}
                                                        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                                                    >
                                                        <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                                                            <span className="mb-1.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#174395] text-[11px] font-bold text-white">
                                                                {groupIndex + 1}
                                                            </span>
                                                            <label className="grid min-w-[150px] flex-1 gap-1 text-xs">
                                                                <span className="font-semibold text-slate-600">
                                                                    คณะสี
                                                                </span>
                                                                <Input
                                                                    value={
                                                                        group.team_name
                                                                    }
                                                                    onChange={(
                                                                        event,
                                                                    ) =>
                                                                        patchSportsDayGroup(
                                                                            group.id,
                                                                            {
                                                                                team_name:
                                                                                    event
                                                                                        .target
                                                                                        .value,
                                                                            },
                                                                        )
                                                                    }
                                                                    placeholder="เช่น คณะสีแดง"
                                                                    className={`h-9 bg-white text-xs md:text-xs${invalidClass(`sd_group.${group.id}.team_name`)}`}
                                                                    aria-label={`ชื่อคณะสีที่ ${groupIndex + 1}`}
                                                                />
                                                            </label>
                                                            <label className="grid min-w-[150px] flex-1 gap-1 text-xs">
                                                                <span className="font-semibold text-slate-600">
                                                                    สีผ้า
                                                                </span>
                                                                {/* The same fabric-colour catalog the spec tab
                                                                    uses, so a colour added here is offered there
                                                                    and the other way round. */}
                                                                <MasterDataComboBox
                                                                    storageKey={
                                                                        shirtCatalogKeys.fabric_colors ??
                                                                        ''
                                                                    }
                                                                    label="สีผ้า"
                                                                    options={catalogOptions(
                                                                        shirtCatalogKeys.fabric_colors,
                                                                        resolvedShirtCatalogs.fabric_colors ??
                                                                            [],
                                                                    )}
                                                                    value={
                                                                        group.fabric_color_id
                                                                    }
                                                                    onValueChange={(
                                                                        value,
                                                                    ) =>
                                                                        patchSportsDayGroup(
                                                                            group.id,
                                                                            {
                                                                                fabric_color_id:
                                                                                    value,
                                                                            },
                                                                        )
                                                                    }
                                                                    onOptionAdded={(
                                                                        option,
                                                                    ) =>
                                                                        shirtCatalogKeys.fabric_colors
                                                                            ? handleOptionAdded(
                                                                                  shirtCatalogKeys.fabric_colors,
                                                                                  option,
                                                                              )
                                                                            : undefined
                                                                    }
                                                                    manage={
                                                                        shirtCatalogKeys.fabric_colors
                                                                            ? manageFor(
                                                                                  shirtCatalogKeys.fabric_colors,
                                                                              )
                                                                            : undefined
                                                                    }
                                                                    placeholder="เลือกหรือพิมพ์สีผ้า"
                                                                    className="h-9 bg-white text-xs md:text-xs"
                                                                    aria-label={`สีผ้าของคณะที่ ${groupIndex + 1}`}
                                                                />
                                                            </label>
                                                            <div className="mb-0.5 flex items-center gap-2">
                                                                <span className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600">
                                                                    <span className="font-mono text-sm font-semibold text-slate-900">
                                                                        {
                                                                            groupPieces
                                                                        }
                                                                    </span>{' '}
                                                                    ตัว ·{' '}
                                                                    <span className="font-mono text-sm font-semibold text-slate-900">
                                                                        ฿{' '}
                                                                        {formatMoney(
                                                                            groupTotal,
                                                                        )}
                                                                    </span>
                                                                </span>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-9 px-2 text-xs text-rose-600 hover:text-rose-700"
                                                                    disabled={
                                                                        data
                                                                            .sports_day_groups
                                                                            .length <=
                                                                        1
                                                                    }
                                                                    onClick={() =>
                                                                        removeSportsDayGroup(
                                                                            group.id,
                                                                        )
                                                                    }
                                                                    aria-label={`ลบคณะที่ ${groupIndex + 1}`}
                                                                >
                                                                    <Trash2 className="size-3.5" />
                                                                    ลบคณะ
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div className="overflow-x-auto p-2.5">
                                                            <table
                                                                className={
                                                                    sportsDayKeepsPants
                                                                        ? 'w-full min-w-[760px] table-fixed border-collapse text-xs'
                                                                        : 'w-full min-w-[560px] table-fixed border-collapse text-xs'
                                                                }
                                                            >
                                                                <thead>
                                                                    <tr className="bg-slate-100 text-slate-700">
                                                                        <th
                                                                            className={
                                                                                sportsDayKeepsPants
                                                                                    ? 'w-[15%] border border-slate-200 px-2 py-2'
                                                                                    : 'w-[22%] border border-slate-200 px-2 py-2'
                                                                            }
                                                                        >
                                                                            ประเภทไซซ์
                                                                        </th>
                                                                        <th
                                                                            className={
                                                                                sportsDayKeepsPants
                                                                                    ? 'w-[14%] border border-slate-200 px-2 py-2'
                                                                                    : 'w-[20%] border border-slate-200 px-2 py-2'
                                                                            }
                                                                        >
                                                                            ไซซ์
                                                                        </th>
                                                                        <th
                                                                            className={
                                                                                sportsDayKeepsPants
                                                                                    ? 'w-[12%] border border-slate-200 px-2 py-2'
                                                                                    : 'w-[16%] border border-slate-200 px-2 py-2'
                                                                            }
                                                                        >
                                                                            เสื้อ
                                                                        </th>
                                                                        <th
                                                                            className={
                                                                                sportsDayKeepsPants
                                                                                    ? 'w-[16%] border border-slate-200 px-2 py-2'
                                                                                    : 'w-[20%] border border-slate-200 px-2 py-2'
                                                                            }
                                                                        >
                                                                            <PriceLinkHeader
                                                                                label="ราคาเสื้อ"
                                                                                linked={isSportsDayPriceLinked(
                                                                                    group.id,
                                                                                    'shirt_price',
                                                                                )}
                                                                                onToggle={() =>
                                                                                    toggleSportsDayPriceLink(
                                                                                        group.id,
                                                                                        'shirt_price',
                                                                                    )
                                                                                }
                                                                            />
                                                                        </th>
                                                                        {sportsDayKeepsPants ? (
                                                                            <>
                                                                                <th className="w-[12%] border border-slate-200 px-2 py-2">
                                                                                    กางเกง
                                                                                </th>
                                                                                <th className="w-[16%] border border-slate-200 px-2 py-2">
                                                                                    <PriceLinkHeader
                                                                                        label="ราคากางเกง"
                                                                                        linked={isSportsDayPriceLinked(
                                                                                            group.id,
                                                                                            'pants_price',
                                                                                        )}
                                                                                        onToggle={() =>
                                                                                            toggleSportsDayPriceLink(
                                                                                                group.id,
                                                                                                'pants_price',
                                                                                            )
                                                                                        }
                                                                                    />
                                                                                </th>
                                                                            </>
                                                                        ) : null}
                                                                        <th
                                                                            className={
                                                                                sportsDayKeepsPants
                                                                                    ? 'w-[13%] border border-slate-200 px-2 py-2'
                                                                                    : 'w-[18%] border border-slate-200 px-2 py-2'
                                                                            }
                                                                        >
                                                                            รวม
                                                                        </th>
                                                                        <th
                                                                            className={
                                                                                sportsDayKeepsPants
                                                                                    ? 'w-[2%] border border-slate-200 px-1 py-2'
                                                                                    : 'w-[4%] border border-slate-200 px-1 py-2'
                                                                            }
                                                                        >
                                                                            <span className="sr-only">
                                                                                ลบแถว
                                                                            </span>
                                                                        </th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {group.rows.map(
                                                                        (
                                                                            row,
                                                                            rowIndex,
                                                                        ) => {
                                                                            const rowSizeOptions =
                                                                                sizeOptionsForTier(
                                                                                    row.size_group,
                                                                                );
                                                                            const shirtPriceLinked =
                                                                                isSportsDayPriceLinked(
                                                                                    group.id,
                                                                                    'shirt_price',
                                                                                ) &&
                                                                                rowIndex >
                                                                                    0;
                                                                            const pantsPriceLinked =
                                                                                isSportsDayPriceLinked(
                                                                                    group.id,
                                                                                    'pants_price',
                                                                                ) &&
                                                                                rowIndex >
                                                                                    0;

                                                                            return (
                                                                                <tr
                                                                                    key={
                                                                                        row.id
                                                                                    }
                                                                                >
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                        <Select
                                                                                            value={
                                                                                                row.size_group
                                                                                            }
                                                                                            onValueChange={(
                                                                                                value,
                                                                                            ) =>
                                                                                                patchSportsDayRow(
                                                                                                    group.id,
                                                                                                    row.id,
                                                                                                    {
                                                                                                        size_group:
                                                                                                            readSizeTier(
                                                                                                                value,
                                                                                                                value,
                                                                                                            ),
                                                                                                        size_label:
                                                                                                            '',
                                                                                                    },
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <SelectTrigger
                                                                                                className="h-8 w-full bg-white text-xs"
                                                                                                aria-label={`ประเภทไซซ์แถวที่ ${rowIndex + 1} ของคณะที่ ${groupIndex + 1}`}
                                                                                            >
                                                                                                <SelectValue placeholder="เลือกประเภท" />
                                                                                            </SelectTrigger>
                                                                                            <SelectContent
                                                                                                position="popper"
                                                                                                side="bottom"
                                                                                                sideOffset={
                                                                                                    4
                                                                                                }
                                                                                                avoidCollisions
                                                                                                collisionPadding={
                                                                                                    12
                                                                                                }
                                                                                            >
                                                                                                <SelectItem value="kids">
                                                                                                    เด็ก
                                                                                                    (Kids)
                                                                                                </SelectItem>
                                                                                                <SelectItem value="junior">
                                                                                                    ประถม
                                                                                                    -
                                                                                                    มัธยมต้น
                                                                                                </SelectItem>
                                                                                                <SelectItem value="adults">
                                                                                                    ผู้ใหญ่
                                                                                                    (Adults)
                                                                                                </SelectItem>
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                        <Select
                                                                                            value={
                                                                                                row.size_label
                                                                                            }
                                                                                            onValueChange={(
                                                                                                value,
                                                                                            ) =>
                                                                                                patchSportsDayRow(
                                                                                                    group.id,
                                                                                                    row.id,
                                                                                                    {
                                                                                                        size_label:
                                                                                                            value,
                                                                                                    },
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <SelectTrigger
                                                                                                className={`h-8 w-full bg-white text-xs${invalidClass(`sd_row.${row.id}.size_label`)}`}
                                                                                                aria-label={`ไซซ์แถวที่ ${rowIndex + 1} ของคณะที่ ${groupIndex + 1}`}
                                                                                            >
                                                                                                <SelectValue placeholder="ไม่ระบุ" />
                                                                                            </SelectTrigger>
                                                                                            <SelectContent
                                                                                                position="popper"
                                                                                                side="bottom"
                                                                                                sideOffset={
                                                                                                    4
                                                                                                }
                                                                                                avoidCollisions
                                                                                                collisionPadding={
                                                                                                    12
                                                                                                }
                                                                                            >
                                                                                                {rowSizeOptions.map(
                                                                                                    (
                                                                                                        size,
                                                                                                    ) => (
                                                                                                        <SelectItem
                                                                                                            key={
                                                                                                                size
                                                                                                            }
                                                                                                            value={
                                                                                                                size
                                                                                                            }
                                                                                                        >
                                                                                                            {
                                                                                                                size
                                                                                                            }
                                                                                                        </SelectItem>
                                                                                                    ),
                                                                                                )}
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                        <Input
                                                                                            type="number"
                                                                                            inputMode="numeric"
                                                                                            onWheel={
                                                                                                blurOnWheel
                                                                                            }
                                                                                            min={
                                                                                                0
                                                                                            }
                                                                                            value={numberFieldValue(
                                                                                                row.shirt_qty,
                                                                                            )}
                                                                                            onChange={(
                                                                                                event,
                                                                                            ) =>
                                                                                                patchSportsDayRow(
                                                                                                    group.id,
                                                                                                    row.id,
                                                                                                    {
                                                                                                        shirt_qty:
                                                                                                            Math.max(
                                                                                                                toNumber(
                                                                                                                    event
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                ),
                                                                                                                0,
                                                                                                            ),
                                                                                                    },
                                                                                                )
                                                                                            }
                                                                                            className={`h-8 bg-white text-center text-xs md:text-xs${invalidClass(`sd_row.${row.id}.shirt_qty`)}`}
                                                                                            aria-label={`จำนวนเสื้อแถวที่ ${rowIndex + 1} ของคณะที่ ${groupIndex + 1}`}
                                                                                        />
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                        <Input
                                                                                            type="number"
                                                                                            inputMode="decimal"
                                                                                            onWheel={
                                                                                                blurOnWheel
                                                                                            }
                                                                                            min={
                                                                                                0
                                                                                            }
                                                                                            value={numberFieldValue(
                                                                                                row.shirt_price,
                                                                                            )}
                                                                                            readOnly={
                                                                                                shirtPriceLinked
                                                                                            }
                                                                                            onChange={(
                                                                                                event,
                                                                                            ) =>
                                                                                                patchSportsDayRow(
                                                                                                    group.id,
                                                                                                    row.id,
                                                                                                    {
                                                                                                        shirt_price:
                                                                                                            Math.max(
                                                                                                                toNumber(
                                                                                                                    event
                                                                                                                        .target
                                                                                                                        .value,
                                                                                                                ),
                                                                                                                0,
                                                                                                            ),
                                                                                                    },
                                                                                                )
                                                                                            }
                                                                                            className={`h-8 text-center text-xs md:text-xs ${shirtPriceLinked ? 'bg-slate-50 text-slate-500' : 'bg-white'}${invalidClass(`sd_row.${row.id}.shirt_price`)}`}
                                                                                            title={
                                                                                                shirtPriceLinked
                                                                                                    ? 'ราคาตามแถวแรก กดไอคอนลิงก์ที่หัวตารางเพื่อแก้ทีละแถว'
                                                                                                    : undefined
                                                                                            }
                                                                                            aria-label={`ราคาเสื้อแถวที่ ${rowIndex + 1} ของคณะที่ ${groupIndex + 1}`}
                                                                                        />
                                                                                    </td>
                                                                                    {sportsDayKeepsPants ? (
                                                                                        <>
                                                                                            <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                                <Input
                                                                                                    type="number"
                                                                                                    inputMode="numeric"
                                                                                                    onWheel={
                                                                                                        blurOnWheel
                                                                                                    }
                                                                                                    min={
                                                                                                        0
                                                                                                    }
                                                                                                    value={numberFieldValue(
                                                                                                        row.pants_qty,
                                                                                                    )}
                                                                                                    onChange={(
                                                                                                        event,
                                                                                                    ) =>
                                                                                                        patchSportsDayRow(
                                                                                                            group.id,
                                                                                                            row.id,
                                                                                                            {
                                                                                                                pants_qty:
                                                                                                                    Math.max(
                                                                                                                        toNumber(
                                                                                                                            event
                                                                                                                                .target
                                                                                                                                .value,
                                                                                                                        ),
                                                                                                                        0,
                                                                                                                    ),
                                                                                                            },
                                                                                                        )
                                                                                                    }
                                                                                                    className="h-8 bg-white text-center text-xs md:text-xs"
                                                                                                    aria-label={`จำนวนกางเกงแถวที่ ${rowIndex + 1} ของคณะที่ ${groupIndex + 1}`}
                                                                                                />
                                                                                            </td>
                                                                                            <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                                <Input
                                                                                                    type="number"
                                                                                                    inputMode="decimal"
                                                                                                    onWheel={
                                                                                                        blurOnWheel
                                                                                                    }
                                                                                                    min={
                                                                                                        0
                                                                                                    }
                                                                                                    value={numberFieldValue(
                                                                                                        row.pants_price,
                                                                                                    )}
                                                                                                    readOnly={
                                                                                                        pantsPriceLinked
                                                                                                    }
                                                                                                    onChange={(
                                                                                                        event,
                                                                                                    ) =>
                                                                                                        patchSportsDayRow(
                                                                                                            group.id,
                                                                                                            row.id,
                                                                                                            {
                                                                                                                pants_price:
                                                                                                                    Math.max(
                                                                                                                        toNumber(
                                                                                                                            event
                                                                                                                                .target
                                                                                                                                .value,
                                                                                                                        ),
                                                                                                                        0,
                                                                                                                    ),
                                                                                                            },
                                                                                                        )
                                                                                                    }
                                                                                                    className={`h-8 text-center text-xs md:text-xs ${pantsPriceLinked ? 'bg-slate-50 text-slate-500' : 'bg-white'}${invalidClass(`sd_row.${row.id}.pants_price`)}`}
                                                                                                    title={
                                                                                                        pantsPriceLinked
                                                                                                            ? 'ราคาตามแถวแรก กดไอคอนลิงก์ที่หัวตารางเพื่อแก้ทีละแถว'
                                                                                                            : undefined
                                                                                                    }
                                                                                                    aria-label={`ราคากางเกงแถวที่ ${rowIndex + 1} ของคณะที่ ${groupIndex + 1}`}
                                                                                                />
                                                                                            </td>
                                                                                        </>
                                                                                    ) : null}
                                                                                    <td className="border border-slate-200 px-2 py-1.5 text-right font-mono font-semibold text-slate-900">
                                                                                        ฿{' '}
                                                                                        {formatMoney(
                                                                                            sportsDayRowTotal(
                                                                                                row,
                                                                                            ),
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1 py-1.5 text-center">
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={
                                                                                                group
                                                                                                    .rows
                                                                                                    .length <=
                                                                                                1
                                                                                            }
                                                                                            onClick={() =>
                                                                                                removeSportsDayRow(
                                                                                                    group.id,
                                                                                                    row.id,
                                                                                                )
                                                                                            }
                                                                                            aria-label={`ลบแถวที่ ${rowIndex + 1} ของคณะที่ ${groupIndex + 1}`}
                                                                                            className="rounded p-1 text-slate-400 transition-colors hover:text-rose-600 disabled:pointer-events-none disabled:opacity-30"
                                                                                        >
                                                                                            <Trash2 className="size-3.5" />
                                                                                        </button>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        },
                                                                    )}
                                                                </tbody>
                                                                <tfoot>
                                                                    <tr className="bg-slate-50 font-semibold text-slate-700">
                                                                        <td
                                                                            className="border border-slate-200 px-2 py-2 text-right"
                                                                            colSpan={
                                                                                sportsDayKeepsPants
                                                                                    ? 6
                                                                                    : 4
                                                                            }
                                                                        >
                                                                            รวมคณะ{' '}
                                                                            {group.team_name ||
                                                                                groupIndex +
                                                                                    1}
                                                                        </td>
                                                                        <td className="border border-slate-200 px-2 py-2 text-right font-mono text-slate-900">
                                                                            ฿{' '}
                                                                            {formatMoney(
                                                                                groupTotal,
                                                                            )}
                                                                        </td>
                                                                        <td className="border border-slate-200 px-1 py-2" />
                                                                    </tr>
                                                                </tfoot>
                                                            </table>

                                                            <div className="mt-2">
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-8 text-xs"
                                                                    onClick={() =>
                                                                        addSportsDayRow(
                                                                            group.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <Plus className="size-3.5" />
                                                                    เพิ่มไซซ์
                                                                </Button>
                                                            </div>

                                                            {/* The house's own pictures, at the end of the
                                                                house they belong to — as a table's sit under
                                                                it on Forms 1 and 4. The production sheet
                                                                prints them on every sheet of this house. A
                                                                bill saved earlier shows its pictures here
                                                                too, each removable. */}
                                                            <div className="mt-3">
                                                                <MultiArtworkUpload
                                                                    title={`Art Work · ${group.team_name.trim() || `คณะที่ ${groupIndex + 1}`}`}
                                                                    name={
                                                                        group.team_name.trim() ||
                                                                        `คณะที่ ${groupIndex + 1}`
                                                                    }
                                                                    inputId={`sports-day-artwork-${group.id}`}
                                                                    files={
                                                                        data
                                                                            .sports_day_artwork_files[
                                                                            group
                                                                                .id
                                                                        ] ?? []
                                                                    }
                                                                    previewUrls={
                                                                        houseArtworkPreviews[
                                                                            group
                                                                                .id
                                                                        ] ?? []
                                                                    }
                                                                    savedMedia={
                                                                        savedGroupArtwork
                                                                    }
                                                                    onSelect={(
                                                                        event,
                                                                    ) => {
                                                                        void handleHouseArtworkSelect(
                                                                            group.id,
                                                                            event,
                                                                        );
                                                                    }}
                                                                    onRemove={(
                                                                        index,
                                                                    ) =>
                                                                        removeHouseArtworkFile(
                                                                            group.id,
                                                                            index,
                                                                        )
                                                                    }
                                                                    onRemoveSaved={
                                                                        removeSavedMedia
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            },
                                        )}

                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={addSportsDayGroup}
                                        >
                                            <Plus className="size-3.5" />
                                            เพิ่มคณะสี
                                        </Button>
                                    </div>
                                ) : null}

                                {sizeFormMode === 'individual' ? (
                                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h3 className="text-xs font-semibold text-slate-700">
                                                รายชื่อสกรีนชื่อ-เบอร์รายตัว
                                                (Personalization List)
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600">
                                                    <span className="font-mono text-sm font-semibold text-slate-900">
                                                        {individualNamedCount}
                                                    </span>{' '}
                                                    คน ·{' '}
                                                    <span className="font-mono text-sm font-semibold text-slate-900">
                                                        {individualTotalPieces}
                                                    </span>{' '}
                                                    ตัว
                                                </span>
                                                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                                                    <span className="font-semibold whitespace-nowrap text-slate-700">
                                                        สีเสื้อประตู
                                                    </span>
                                                    <Input
                                                        value={
                                                            data.individual_keeper_color
                                                        }
                                                        onChange={(event) =>
                                                            setData(
                                                                'individual_keeper_color',
                                                                event.target
                                                                    .value,
                                                            )
                                                        }
                                                        placeholder="เช่น เขียวสะท้อนแสง"
                                                        className="h-7 w-40 text-xs md:text-xs"
                                                        aria-label="สีเสื้อผู้รักษาประตู"
                                                    />
                                                </label>
                                                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            data.individual_include_pants
                                                        }
                                                        onChange={(event) =>
                                                            setData(
                                                                'individual_include_pants',
                                                                event.target
                                                                    .checked,
                                                            )
                                                        }
                                                        className="size-3.5 accent-[#174395]"
                                                        aria-label="สั่งกางเกงด้วย"
                                                    />
                                                    <span className="font-semibold text-slate-700">
                                                        สั่งกางเกงด้วย
                                                    </span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2.5">
                                            <table
                                                className={`w-full table-fixed border-collapse text-xs ${
                                                    data.individual_include_pants
                                                        ? 'min-w-[1560px]'
                                                        : 'min-w-[1120px]'
                                                }`}
                                            >
                                                <thead>
                                                    <tr className="bg-slate-100 text-slate-700">
                                                        <th className="w-[4%] border border-slate-200 px-1 py-2">
                                                            <span className="sr-only">
                                                                ลำดับ
                                                            </span>
                                                            #
                                                        </th>
                                                        <th className="w-[11%] border border-slate-200 px-2 py-2">
                                                            ประเภท
                                                        </th>
                                                        <th className="w-[15%] border border-slate-200 px-2 py-2">
                                                            สกรีนชื่อ (Name)
                                                        </th>
                                                        <th className="w-[11%] border border-slate-200 px-2 py-2">
                                                            กลุ่มไซซ์
                                                        </th>
                                                        <th className="w-[8%] border border-slate-200 px-2 py-2">
                                                            ไซซ์
                                                        </th>
                                                        <th className="w-[10%] border border-slate-200 px-2 py-2">
                                                            <LinkToggleHeader
                                                                label="แขน"
                                                                linked={isIndividualColumnLinked(
                                                                    'shirt_style',
                                                                )}
                                                                onToggle={() =>
                                                                    toggleIndividualColumnLink(
                                                                        'shirt_style',
                                                                    )
                                                                }
                                                                linkedHint="แขน: ทุกคนใช้แขนตามคนแรก (กดเพื่อยกเลิก)"
                                                                unlinkedHint="แขน: แต่ละคนเลือกแขนเอง (กดเพื่อลิงก์)"
                                                            />
                                                        </th>
                                                        <th className="w-[8%] border border-slate-200 px-2 py-2">
                                                            เบอร์
                                                        </th>
                                                        <th className="w-[8%] border border-slate-200 px-2 py-2">
                                                            จำนวน
                                                        </th>
                                                        <th className="w-[11%] border border-slate-200 px-2 py-2">
                                                            <PriceLinkHeader
                                                                label="ราคาเสื้อ"
                                                                linked={isIndividualColumnLinked(
                                                                    'unit_price',
                                                                )}
                                                                onToggle={() =>
                                                                    toggleIndividualColumnLink(
                                                                        'unit_price',
                                                                    )
                                                                }
                                                            />
                                                        </th>
                                                        {data.individual_include_pants ? (
                                                            <>
                                                                <th className="w-[8%] border border-slate-200 px-2 py-2">
                                                                    ไซซ์กางเกง
                                                                </th>
                                                                <th className="w-[10%] border border-slate-200 px-2 py-2">
                                                                    <LinkToggleHeader
                                                                        label="ขา"
                                                                        linked={isIndividualColumnLinked(
                                                                            'pants_style',
                                                                        )}
                                                                        onToggle={() =>
                                                                            toggleIndividualColumnLink(
                                                                                'pants_style',
                                                                            )
                                                                        }
                                                                        linkedHint="ขา: ทุกคนใช้ขาตามคนแรก (กดเพื่อยกเลิก)"
                                                                        unlinkedHint="ขา: แต่ละคนเลือกขาเอง (กดเพื่อลิงก์)"
                                                                    />
                                                                </th>
                                                                <th className="w-[8%] border border-slate-200 px-2 py-2">
                                                                    เบอร์กางเกง
                                                                </th>
                                                                <th className="w-[8%] border border-slate-200 px-2 py-2">
                                                                    จำนวนกางเกง
                                                                </th>
                                                                <th className="w-[11%] border border-slate-200 px-2 py-2">
                                                                    <PriceLinkHeader
                                                                        label="ราคากางเกง"
                                                                        linked={isIndividualColumnLinked(
                                                                            'pants_unit_price',
                                                                        )}
                                                                        onToggle={() =>
                                                                            toggleIndividualColumnLink(
                                                                                'pants_unit_price',
                                                                            )
                                                                        }
                                                                    />
                                                                </th>
                                                            </>
                                                        ) : null}
                                                        <th className="w-[11%] border border-slate-200 px-2 py-2">
                                                            รวม
                                                        </th>
                                                        <th className="w-[6%] border border-slate-200 px-1 py-2">
                                                            <span className="sr-only">
                                                                จัดการแถว
                                                            </span>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.personalization_rows.map(
                                                        (row, rowIndex) => {
                                                            const shirtPriceLinked =
                                                                isIndividualColumnLinked(
                                                                    'unit_price',
                                                                ) &&
                                                                rowIndex > 0;
                                                            const pantsPriceLinked =
                                                                isIndividualColumnLinked(
                                                                    'pants_unit_price',
                                                                ) &&
                                                                rowIndex > 0;
                                                            // Rows below the
                                                            // first follow the
                                                            // first person's
                                                            // length while the
                                                            // column is linked.
                                                            const shirtStyleLinked =
                                                                isIndividualColumnLinked(
                                                                    'shirt_style',
                                                                ) &&
                                                                rowIndex > 0;
                                                            const pantsStyleLinked =
                                                                isIndividualColumnLinked(
                                                                    'pants_style',
                                                                ) &&
                                                                rowIndex > 0;
                                                            // Linked rows read
                                                            // like the linked
                                                            // price inputs do:
                                                            // greyed and not
                                                            // editable here.
                                                            const styleTriggerClass =
                                                                (
                                                                    linked: boolean,
                                                                    style: GarmentStyle,
                                                                ): string => {
                                                                    if (
                                                                        linked
                                                                    ) {
                                                                        return 'h-8 w-full bg-slate-50 text-xs text-slate-500';
                                                                    }

                                                                    return style ===
                                                                        'long'
                                                                        ? 'h-8 w-full bg-indigo-50 text-xs font-semibold text-indigo-800'
                                                                        : 'h-8 w-full bg-white text-xs';
                                                                };

                                                            return (
                                                                <tr
                                                                    key={row.id}
                                                                >
                                                                    <td className="border border-slate-200 px-1 py-1.5 text-center font-mono text-slate-500">
                                                                        {rowIndex +
                                                                            1}
                                                                    </td>
                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                        <Select
                                                                            value={
                                                                                row.role
                                                                            }
                                                                            onValueChange={(
                                                                                value,
                                                                            ) =>
                                                                                updatePersonalization(
                                                                                    row.id,
                                                                                    'role',
                                                                                    value ===
                                                                                        'keeper'
                                                                                        ? 'keeper'
                                                                                        : 'player',
                                                                                )
                                                                            }
                                                                        >
                                                                            <SelectTrigger
                                                                                className={`h-8 w-full text-xs ${row.role === 'keeper' ? 'bg-amber-50 font-semibold text-amber-800' : 'bg-white'}`}
                                                                                aria-label={`ประเภทคนที่ ${rowIndex + 1}`}
                                                                            >
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent
                                                                                position="popper"
                                                                                side="bottom"
                                                                                sideOffset={
                                                                                    4
                                                                                }
                                                                                avoidCollisions
                                                                                collisionPadding={
                                                                                    12
                                                                                }
                                                                            >
                                                                                <SelectItem value="player">
                                                                                    {
                                                                                        INDIVIDUAL_ROLE_LABELS.player
                                                                                    }
                                                                                </SelectItem>
                                                                                <SelectItem value="keeper">
                                                                                    {
                                                                                        INDIVIDUAL_ROLE_LABELS.keeper
                                                                                    }
                                                                                </SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </td>
                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                        <Input
                                                                            value={
                                                                                row.name
                                                                            }
                                                                            onChange={(
                                                                                event,
                                                                            ) =>
                                                                                updatePersonalization(
                                                                                    row.id,
                                                                                    'name',
                                                                                    event
                                                                                        .target
                                                                                        .value,
                                                                                )
                                                                            }
                                                                            className={`h-8 text-xs md:text-xs${invalidClass(`person.${row.id}.name`)}`}
                                                                            aria-label={`สกรีนชื่อคนที่ ${rowIndex + 1}`}
                                                                        />
                                                                    </td>
                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                        <Select
                                                                            value={
                                                                                row.size_group
                                                                            }
                                                                            onValueChange={(
                                                                                value,
                                                                            ) =>
                                                                                updatePersonalization(
                                                                                    row.id,
                                                                                    'size_group',
                                                                                    value ===
                                                                                        'kids'
                                                                                        ? 'kids'
                                                                                        : 'adults',
                                                                                )
                                                                            }
                                                                        >
                                                                            <SelectTrigger
                                                                                className="h-8 w-full bg-white text-xs"
                                                                                aria-label={`กลุ่มไซซ์คนที่ ${rowIndex + 1}`}
                                                                            >
                                                                                <SelectValue placeholder="เลือกกลุ่มไซซ์" />
                                                                            </SelectTrigger>
                                                                            <SelectContent
                                                                                position="popper"
                                                                                side="bottom"
                                                                                sideOffset={
                                                                                    4
                                                                                }
                                                                                avoidCollisions
                                                                                collisionPadding={
                                                                                    12
                                                                                }
                                                                            >
                                                                                <SelectItem value="kids">
                                                                                    เด็ก
                                                                                    (Kids)
                                                                                </SelectItem>
                                                                                <SelectItem value="adults">
                                                                                    ผู้ใหญ่
                                                                                    (Adults)
                                                                                </SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </td>
                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                        <Select
                                                                            value={
                                                                                row.size
                                                                            }
                                                                            onValueChange={(
                                                                                value,
                                                                            ) =>
                                                                                updatePersonalization(
                                                                                    row.id,
                                                                                    'size',
                                                                                    value,
                                                                                )
                                                                            }
                                                                        >
                                                                            <SelectTrigger
                                                                                className={`h-8 w-full bg-white text-xs${invalidClass(`person.${row.id}.size`)}`}
                                                                                aria-label={`ไซซ์คนที่ ${rowIndex + 1}`}
                                                                            >
                                                                                <SelectValue placeholder="ไม่ระบุ" />
                                                                            </SelectTrigger>
                                                                            <SelectContent
                                                                                position="popper"
                                                                                side="bottom"
                                                                                sideOffset={
                                                                                    4
                                                                                }
                                                                                avoidCollisions
                                                                                collisionPadding={
                                                                                    12
                                                                                }
                                                                            >
                                                                                {sizeOptionsByGroup[
                                                                                    row
                                                                                        .size_group
                                                                                ].map(
                                                                                    (
                                                                                        sizeOption,
                                                                                    ) => (
                                                                                        <SelectItem
                                                                                            key={
                                                                                                sizeOption
                                                                                            }
                                                                                            value={
                                                                                                sizeOption
                                                                                            }
                                                                                        >
                                                                                            {
                                                                                                sizeOption
                                                                                            }
                                                                                        </SelectItem>
                                                                                    ),
                                                                                )}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </td>
                                                                    <td
                                                                        className="border border-slate-200 px-1.5 py-1.5"
                                                                        title={
                                                                            shirtStyleLinked
                                                                                ? 'แขนตามคนแรก กดไอคอนลิงก์ที่หัวตารางเพื่อแยกทีละคน'
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <Select
                                                                            disabled={
                                                                                shirtStyleLinked
                                                                            }
                                                                            value={
                                                                                row.shirt_style
                                                                            }
                                                                            onValueChange={(
                                                                                value,
                                                                            ) =>
                                                                                updatePersonalization(
                                                                                    row.id,
                                                                                    'shirt_style',
                                                                                    value as GarmentStyle,
                                                                                )
                                                                            }
                                                                        >
                                                                            <SelectTrigger
                                                                                className={styleTriggerClass(
                                                                                    shirtStyleLinked,
                                                                                    row.shirt_style,
                                                                                )}
                                                                                aria-label={`แขนคนที่ ${rowIndex + 1}`}
                                                                            >
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent
                                                                                position="popper"
                                                                                side="bottom"
                                                                                sideOffset={
                                                                                    4
                                                                                }
                                                                                avoidCollisions
                                                                                collisionPadding={
                                                                                    12
                                                                                }
                                                                            >
                                                                                {SHIRT_STYLES.map(
                                                                                    (
                                                                                        styleOption,
                                                                                    ) => (
                                                                                        <SelectItem
                                                                                            key={
                                                                                                styleOption
                                                                                            }
                                                                                            value={
                                                                                                styleOption
                                                                                            }
                                                                                        >
                                                                                            {
                                                                                                SHIRT_STYLE_LABELS[
                                                                                                    styleOption
                                                                                                ]
                                                                                            }
                                                                                        </SelectItem>
                                                                                    ),
                                                                                )}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </td>
                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                        <Input
                                                                            value={
                                                                                row.number
                                                                            }
                                                                            onChange={(
                                                                                event,
                                                                            ) =>
                                                                                updatePersonalization(
                                                                                    row.id,
                                                                                    'number',
                                                                                    event
                                                                                        .target
                                                                                        .value,
                                                                                )
                                                                            }
                                                                            className={`h-8 text-center text-xs md:text-xs${invalidClass(`person.${row.id}.number`)}`}
                                                                            aria-label={`เบอร์คนที่ ${rowIndex + 1}`}
                                                                        />
                                                                    </td>
                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                        <Input
                                                                            type="number"
                                                                            inputMode="numeric"
                                                                            onWheel={
                                                                                blurOnWheel
                                                                            }
                                                                            min={
                                                                                1
                                                                            }
                                                                            value={
                                                                                row.quantity
                                                                            }
                                                                            onChange={(
                                                                                event,
                                                                            ) =>
                                                                                updatePersonalization(
                                                                                    row.id,
                                                                                    'quantity',
                                                                                    Math.max(
                                                                                        1,
                                                                                        toNumber(
                                                                                            event
                                                                                                .target
                                                                                                .value,
                                                                                        ),
                                                                                    ),
                                                                                )
                                                                            }
                                                                            className="h-8 text-center text-xs md:text-xs"
                                                                            aria-label={`จำนวนเสื้อคนที่ ${rowIndex + 1}`}
                                                                        />
                                                                    </td>
                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                        <Input
                                                                            type="number"
                                                                            inputMode="decimal"
                                                                            onWheel={
                                                                                blurOnWheel
                                                                            }
                                                                            min={
                                                                                0
                                                                            }
                                                                            value={numberFieldValue(
                                                                                row.unit_price,
                                                                            )}
                                                                            readOnly={
                                                                                shirtPriceLinked
                                                                            }
                                                                            onChange={(
                                                                                event,
                                                                            ) =>
                                                                                updatePersonalization(
                                                                                    row.id,
                                                                                    'unit_price',
                                                                                    Math.max(
                                                                                        0,
                                                                                        toNumber(
                                                                                            event
                                                                                                .target
                                                                                                .value,
                                                                                        ),
                                                                                    ),
                                                                                )
                                                                            }
                                                                            className={`h-8 text-center text-xs md:text-xs ${shirtPriceLinked ? 'bg-slate-50 text-slate-500' : ''}`}
                                                                            title={
                                                                                shirtPriceLinked
                                                                                    ? 'ราคาตามคนแรก กดไอคอนลิงก์ที่หัวตารางเพื่อแก้ทีละคน'
                                                                                    : undefined
                                                                            }
                                                                            aria-label={`ราคาเสื้อคนที่ ${rowIndex + 1}`}
                                                                        />
                                                                    </td>
                                                                    {data.individual_include_pants ? (
                                                                        <>
                                                                            <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                <Select
                                                                                    value={
                                                                                        row.pants_size
                                                                                    }
                                                                                    onValueChange={(
                                                                                        value,
                                                                                    ) =>
                                                                                        updatePersonalization(
                                                                                            row.id,
                                                                                            'pants_size',
                                                                                            // Back to following the shirt, or the shirt's own size picked:
                                                                                            // either way it stays linked.
                                                                                            value ===
                                                                                                PANTS_FOLLOWS_SHIRT ||
                                                                                                value ===
                                                                                                    row.size
                                                                                                ? ''
                                                                                                : value,
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <SelectTrigger
                                                                                        className={
                                                                                            row.pants_size
                                                                                                ? 'h-8 w-full bg-white text-xs'
                                                                                                : 'h-8 w-full bg-blue-50/60 text-xs'
                                                                                        }
                                                                                        aria-label={`ไซซ์กางเกงคนที่ ${rowIndex + 1}`}
                                                                                    >
                                                                                        <SelectValue
                                                                                            placeholder={
                                                                                                row.size
                                                                                                    ? `${row.size} · ตามเสื้อ`
                                                                                                    : 'ตามไซซ์เสื้อ'
                                                                                            }
                                                                                        />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent
                                                                                        position="popper"
                                                                                        side="bottom"
                                                                                        sideOffset={
                                                                                            4
                                                                                        }
                                                                                        avoidCollisions
                                                                                        collisionPadding={
                                                                                            12
                                                                                        }
                                                                                    >
                                                                                        <SelectItem
                                                                                            value={
                                                                                                PANTS_FOLLOWS_SHIRT
                                                                                            }
                                                                                        >
                                                                                            ตามไซซ์เสื้อ
                                                                                        </SelectItem>
                                                                                        {sizeOptionsByGroup[
                                                                                            row
                                                                                                .size_group
                                                                                        ].map(
                                                                                            (
                                                                                                sizeOption,
                                                                                            ) => (
                                                                                                <SelectItem
                                                                                                    key={
                                                                                                        sizeOption
                                                                                                    }
                                                                                                    value={
                                                                                                        sizeOption
                                                                                                    }
                                                                                                >
                                                                                                    {
                                                                                                        sizeOption
                                                                                                    }
                                                                                                </SelectItem>
                                                                                            ),
                                                                                        )}
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            </td>
                                                                            <td
                                                                                className="border border-slate-200 px-1.5 py-1.5"
                                                                                title={
                                                                                    pantsStyleLinked
                                                                                        ? 'ขาตามคนแรก กดไอคอนลิงก์ที่หัวตารางเพื่อแยกทีละคน'
                                                                                        : undefined
                                                                                }
                                                                            >
                                                                                <Select
                                                                                    disabled={
                                                                                        pantsStyleLinked
                                                                                    }
                                                                                    value={
                                                                                        row.pants_style
                                                                                    }
                                                                                    onValueChange={(
                                                                                        value,
                                                                                    ) =>
                                                                                        updatePersonalization(
                                                                                            row.id,
                                                                                            'pants_style',
                                                                                            value ===
                                                                                                'long'
                                                                                                ? 'long'
                                                                                                : 'short',
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <SelectTrigger
                                                                                        className={styleTriggerClass(
                                                                                            pantsStyleLinked,
                                                                                            row.pants_style,
                                                                                        )}
                                                                                        aria-label={`ขาคนที่ ${rowIndex + 1}`}
                                                                                    >
                                                                                        <SelectValue />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent
                                                                                        position="popper"
                                                                                        side="bottom"
                                                                                        sideOffset={
                                                                                            4
                                                                                        }
                                                                                        avoidCollisions
                                                                                        collisionPadding={
                                                                                            12
                                                                                        }
                                                                                    >
                                                                                        <SelectItem value="short">
                                                                                            ขาสั้น
                                                                                        </SelectItem>
                                                                                        <SelectItem value="long">
                                                                                            ขายาว
                                                                                        </SelectItem>
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            </td>
                                                                            <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                <Input
                                                                                    value={
                                                                                        row.pants_number
                                                                                    }
                                                                                    onChange={(
                                                                                        event,
                                                                                    ) =>
                                                                                        updatePersonalization(
                                                                                            row.id,
                                                                                            'pants_number',
                                                                                            event
                                                                                                .target
                                                                                                .value,
                                                                                        )
                                                                                    }
                                                                                    placeholder={
                                                                                        row.number
                                                                                    }
                                                                                    title="เว้นว่างไว้ = ใช้เบอร์ตามเสื้อ"
                                                                                    className="h-8 text-center text-xs placeholder:text-blue-700/60 md:text-xs"
                                                                                    aria-label={`เบอร์กางเกงคนที่ ${rowIndex + 1}`}
                                                                                />
                                                                            </td>
                                                                            <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                <Input
                                                                                    type="number"
                                                                                    inputMode="numeric"
                                                                                    onWheel={
                                                                                        blurOnWheel
                                                                                    }
                                                                                    min={
                                                                                        0
                                                                                    }
                                                                                    value={numberFieldValue(
                                                                                        row.pants_quantity,
                                                                                    )}
                                                                                    onChange={(
                                                                                        event,
                                                                                    ) =>
                                                                                        updatePersonalization(
                                                                                            row.id,
                                                                                            'pants_quantity',
                                                                                            Math.max(
                                                                                                0,
                                                                                                toNumber(
                                                                                                    event
                                                                                                        .target
                                                                                                        .value,
                                                                                                ),
                                                                                            ),
                                                                                        )
                                                                                    }
                                                                                    className="h-8 text-center text-xs md:text-xs"
                                                                                    aria-label={`จำนวนกางเกงคนที่ ${rowIndex + 1}`}
                                                                                />
                                                                            </td>
                                                                            <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                <Input
                                                                                    type="number"
                                                                                    inputMode="decimal"
                                                                                    onWheel={
                                                                                        blurOnWheel
                                                                                    }
                                                                                    min={
                                                                                        0
                                                                                    }
                                                                                    value={numberFieldValue(
                                                                                        row.pants_unit_price,
                                                                                    )}
                                                                                    readOnly={
                                                                                        pantsPriceLinked
                                                                                    }
                                                                                    onChange={(
                                                                                        event,
                                                                                    ) =>
                                                                                        updatePersonalization(
                                                                                            row.id,
                                                                                            'pants_unit_price',
                                                                                            Math.max(
                                                                                                0,
                                                                                                toNumber(
                                                                                                    event
                                                                                                        .target
                                                                                                        .value,
                                                                                                ),
                                                                                            ),
                                                                                        )
                                                                                    }
                                                                                    className={`h-8 text-center text-xs md:text-xs ${pantsPriceLinked ? 'bg-slate-50 text-slate-500' : ''}${invalidClass(`person.${row.id}.pants_unit_price`)}`}
                                                                                    title={
                                                                                        pantsPriceLinked
                                                                                            ? 'ราคาตามคนแรก กดไอคอนลิงก์ที่หัวตารางเพื่อแก้ทีละคน'
                                                                                            : undefined
                                                                                    }
                                                                                    aria-label={`ราคากางเกงคนที่ ${rowIndex + 1}`}
                                                                                />
                                                                            </td>
                                                                        </>
                                                                    ) : null}
                                                                    <td className="border border-slate-200 px-2 py-1.5 text-right font-mono font-semibold text-slate-900">
                                                                        ฿{' '}
                                                                        {formatMoney(
                                                                            rowIndividualTotal(
                                                                                row,
                                                                                data.individual_include_pants,
                                                                            ),
                                                                        )}
                                                                    </td>
                                                                    <td className="border border-slate-200 px-1 py-1.5">
                                                                        <div className="flex items-center justify-center gap-0.5">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    duplicatePersonalizationRow(
                                                                                        row.id,
                                                                                    )
                                                                                }
                                                                                aria-label={`ก๊อปปี้คนที่ ${rowIndex + 1}`}
                                                                                title="ก๊อปปี้แถวนี้"
                                                                                className="rounded p-1 text-slate-400 transition-colors hover:text-slate-700"
                                                                            >
                                                                                <Copy className="size-3.5" />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                disabled={
                                                                                    data
                                                                                        .personalization_rows
                                                                                        .length <=
                                                                                    1
                                                                                }
                                                                                onClick={() =>
                                                                                    removePersonalizationRow(
                                                                                        row.id,
                                                                                    )
                                                                                }
                                                                                aria-label={`ลบคนที่ ${rowIndex + 1}`}
                                                                                title="ลบแถวนี้"
                                                                                className="rounded p-1 text-slate-400 transition-colors hover:text-rose-600 disabled:pointer-events-none disabled:opacity-30"
                                                                            >
                                                                                <Trash2 className="size-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        },
                                                    )}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-slate-50 font-semibold text-slate-700">
                                                        <td
                                                            className="border border-slate-200 px-2 py-2 text-right"
                                                            colSpan={
                                                                // #, ประเภท, ชื่อ, กลุ่มไซซ์, ไซซ์, เบอร์, จำนวน,
                                                                // ราคาเสื้อ, plus the four pants columns when shown.
                                                                data.individual_include_pants
                                                                    ? 12
                                                                    : 8
                                                            }
                                                        >
                                                            รวมทั้งฟอร์ม
                                                        </td>
                                                        <td className="border border-slate-200 px-2 py-2 text-right font-mono text-slate-900">
                                                            ฿{' '}
                                                            {formatMoney(
                                                                individualGrossAmount,
                                                            )}
                                                        </td>
                                                        <td className="border border-slate-200 px-1 py-2" />
                                                    </tr>
                                                </tfoot>
                                            </table>

                                            <div className="mt-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 text-xs"
                                                    onClick={
                                                        addPersonalizationRow
                                                    }
                                                >
                                                    <Plus className="size-3.5" />
                                                    เพิ่มรายชื่อ
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {/*
                                    One spec for the whole bill, which is how
                                    Forms 2 and 3 are sold: a list of people,
                                    or a set of colour houses, all in the same
                                    garment. It sits in this step, after what
                                    is being bought, and reads the way Forms 1
                                    and 4 read a table's spec: shirts and
                                    trousers each in their own group, folded
                                    under a heading that says what is still
                                    missing. Forms 1 and 4 carry a spec per
                                    table instead, so they never show this.
                                */}
                                {usesSizeTables(sizeFormMode) &&
                                !editingLegacySizeRows ? null : (
                                    <div
                                        data-slot="bill-spec"
                                        className="mt-4 space-y-3"
                                    >
                                        {/* Form 3 takes its pictures under each
                                        house now. A bill that already carries
                                        pictures attached the earlier way keeps
                                        this, so they stay reachable. */}
                                        {usesArtworkBatches(sizeFormMode) &&
                                        (sizeFormMode === 'sports_day'
                                            ? artworkAttachedCount > 0
                                            : sizeFormMode === 'individual'
                                              ? unpinnedArtworkCount +
                                                    strayIndividualArtworkCount >
                                                0
                                              : true) ? (
                                            <ArtworkBatchButton
                                                attached={artworkAttachedCount}
                                                missing={
                                                    artworkBatchesMissing.length
                                                }
                                                onOpen={() =>
                                                    setArtworkDialogOpen(true)
                                                }
                                            />
                                        ) : null}

                                        {sizeFormMode === 'individual'
                                            ? renderIndividualSheetSpecs()
                                            : (['shirt', 'pants'] as const)
                                                  .filter(
                                                      (garment) =>
                                                          garment === 'shirt' ||
                                                          sizeFormMode !==
                                                              'sports_day' ||
                                                          sportsDayKeepsPants,
                                                  )
                                                  .map((garment) =>
                                                      renderBillSpecGroup(
                                                          garment,
                                                      ),
                                                  )}
                                    </div>
                                )}
                            </section>

                            {/*
                                The money last, because it is the answer to
                                everything typed above it. It used to sit
                                beside the customer details, where it read
                                as a total before there was anything to
                                total.
                            */}
                            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <SectionHeading
                                    step={3}
                                    title="สรุปการเงิน"
                                    hint="คิดจากทุกตารางด้านบนแบบเรียลไทม์"
                                />
                                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
                                    <h3 className="mb-3 text-sm font-bold text-slate-800">
                                        สรุปการเงินแบบเรียลไทม์
                                    </h3>
                                    <div className="space-y-2.5 text-[13px]">
                                        <div className="flex items-center justify-between text-slate-600">
                                            <span>รวมเป็นเงิน</span>
                                            <span className="font-semibold text-slate-900">
                                                ฿ {formatMoney(grossAmount)}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                                            <span className="text-slate-600">
                                                ส่วนลด
                                            </span>
                                            <Select
                                                value={data.discount_percent}
                                                onValueChange={(value) =>
                                                    setData(
                                                        'discount_percent',
                                                        value,
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="h-8 w-full bg-white text-xs">
                                                    <SelectValue placeholder="เลือก % ส่วนลด" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {discountPercentOptions.map(
                                                        (percent) => (
                                                            <SelectItem
                                                                key={percent}
                                                                value={percent}
                                                            >
                                                                {percent}%
                                                            </SelectItem>
                                                        ),
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex items-center justify-between text-slate-600">
                                            <span>มูลค่าส่วนลด</span>
                                            <span className="font-semibold text-rose-600">
                                                - ฿{' '}
                                                {formatMoney(discountAmount)}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between border-t border-yellow-200 pt-2.5 text-slate-700">
                                            <span className="font-semibold">
                                                ยอดรวมหลังหักส่วนลด
                                            </span>
                                            <span className="text-base font-bold text-slate-900">
                                                ฿ {formatMoney(netAmount)}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                                            <span className="text-slate-600">
                                                เงินที่จ่าย
                                            </span>
                                            <Input
                                                type="number"
                                                inputMode="decimal"
                                                onWheel={blurOnWheel}
                                                min={0}
                                                value={data.deposit_amount}
                                                onChange={(event) =>
                                                    setData(
                                                        'deposit_amount',
                                                        toNumber(
                                                            event.target.value,
                                                        ),
                                                    )
                                                }
                                                className="h-8 bg-white text-xs md:text-xs"
                                            />
                                        </div>

                                        <div className="grid gap-2 border-t border-yellow-200 pt-2.5">
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold text-slate-700">
                                                    ยอดคงเหลือ
                                                </span>
                                                <span className="text-lg font-bold text-[#E21E26]">
                                                    ฿{' '}
                                                    {formatMoney(
                                                        remainingAmount,
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {Object.keys(errors).length > 0 ? (
                            <section className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
                                <h3 className="text-xs font-bold text-rose-700">
                                    พบข้อผิดพลาดในฟอร์ม
                                </h3>
                                <ul className="mt-1 space-y-0.5 text-xs text-rose-700">
                                    {Object.entries(errors).map(
                                        ([field, message]) => (
                                            <li key={field}>
                                                {field}: {message}
                                            </li>
                                        ),
                                    )}
                                </ul>
                            </section>
                        ) : null}
                    </div>

                    {/*
                        The save button also lives at the foot of the bill, not
                        only in the header a long form scrolls away from. It is
                        not pinned to the viewport: the layout's main element
                        hides its horizontal overflow, which makes it a scroll
                        container that never scrolls, and nothing inside it can
                        stick. The foot of the form is where the counter ends
                        up anyway.
                    */}
                    <div className="mt-4 border-t border-slate-200 bg-white">
                        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
                            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-600">
                                <span>
                                    ยอดรวมหลังหักส่วนลด{' '}
                                    <strong className="ml-1 font-mono text-base text-slate-900 tabular-nums">
                                        ฿ {formatMoney(netAmount)}
                                    </strong>
                                </span>
                                <span className="text-slate-500">
                                    คงเหลือ{' '}
                                    <strong className="font-mono text-slate-800 tabular-nums">
                                        ฿ {formatMoney(remainingAmount)}
                                    </strong>
                                </span>
                            </div>
                            <Button
                                type="submit"
                                disabled={processing || isCompressing}
                                className="h-9 bg-gradient-to-r from-[#E21E26] to-[#C91820] px-5 text-xs font-bold text-white hover:from-[#C91820] hover:to-[#B5151C]"
                            >
                                {processing || isCompressing ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                {submittingLabel}
                            </Button>
                        </div>
                    </div>
                </form>
            </>
        </>
    );
}

OrderCreatePage.layout = () => ({
    breadcrumbs: [
        {
            title: 'เปิดบิลคำสั่งผลิตใหม่',
            href: '/orders/create',
        },
    ],
});
