import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    CalendarClock,
    Copy,
    Link2,
    Link2Off,
    Loader2,
    Plus,
    Shirt,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
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

type DeliveryMethod = 'pickup' | 'shipping' | 'onsite';
type PaymentMethod = 'cash' | 'transfer';
type PaymentStatus = 'deposit' | 'pending' | 'paid';
type SpecTab = 'shirt' | 'pants';
type SizeTableType = 'kids' | 'adults';
type SizeFormMode = 'matrix' | 'individual' | 'sports_day' | 'pe_uniform';

/**
 * ชุดพละ is Form 1's size tables with artwork attached to each table, so the
 * two modes share the whole size-table half of the form and differ only in
 * whether the artwork panel is there.
 */
export function usesSizeTables(mode: SizeFormMode): boolean {
    return mode === 'matrix' || mode === 'pe_uniform';
}

type OptionItem = {
    id: number;
    name: string;
    /** False for a catalog row hidden from the choices; see MasterDataOption. */
    active?: boolean;
};

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

type ShirtSpecsForm = {
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

type SavedArtwork = { id: number; url: string };

type PantsSpecsForm = {
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

type GarmentStyle = 'short' | 'long';

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

type SizeTableForm = {
    id: string;
    table_type: SizeTableType;
    title: string;
    rows: SizeRowForm[];
    /** ชุดพละ only: newly picked files, not yet uploaded. */
    artwork_files: File[];
    /**
     * ชุดพละ only: artwork already saved against this table, with the media id
     * so an image can be taken off the bill (or left out of a re-opened copy).
     */
    saved_artwork: SavedArtwork[];
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
    size_group: 'kids' | 'adults';
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
    /** Newly picked files, not yet uploaded. */
    artwork_files: File[];
    /**
     * Artwork already saved against this house, with the media id so an image
     * can be taken off the bill (or left out of a re-opened copy) by identity.
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
    pants_artwork_files: File[];
    // Media ids of saved artwork the user removed while editing.
    removed_media_ids: number[];
    transfer_slip_file: File | null;
    shirt_specs: ShirtSpecsForm;
    pants_specs: PantsSpecsForm;
    size_tables: SizeTableForm[];
    personalization_rows: PersonalizationRowForm[];
    /**
     * Shirt colour for the keepers. One per bill, not per person: the spec is
     * the team's, and only the colour changes.
     */
    individual_keeper_color: string;
    /** Form 2 only: the customer also wants pants for each person. */
    individual_include_pants: boolean;
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
    size_group: 'kids' | 'adults' | 'oversize';
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

export const SHIRT_STYLE_LABELS: Record<GarmentStyle, string> = {
    short: 'แขนสั้น',
    long: 'แขนยาว',
};
export const PANTS_STYLE_LABELS: Record<GarmentStyle, string> = {
    short: 'ขาสั้น',
    long: 'ขายาว',
};

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
    linked,
    onToggle,
    linkedHint,
    unlinkedHint,
}: {
    label: string;
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
                    linked ? `ยกเลิกลิงก์${label}` : `ลิงก์${label}กับแถวแรก`
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
        rows: Array.from({ length: NEW_SIZE_TABLE_ROWS }, () =>
            createSizeRow(''),
        ),
        artwork_files: [],
        saved_artwork: [],
    };
}

function createSportsDayRow(
    sizeGroup: 'kids' | 'adults' = 'adults',
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
        artwork_files: [],
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
                    size_group: row.size_group,
                    size_label: sizeLabel,
                    quantity: row.shirt_qty,
                    unit_price: Math.max(row.shirt_price, 0),
                });
            }

            if (row.pants_qty > 0 && row.pants_price > 0) {
                items.push({
                    item_type: 'pants',
                    size_group: row.size_group,
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

export function resolveRequestItems(
    mode: SizeFormMode,
    sizeTables: SizeTableForm[],
    sportsDayGroups: SportsDayGroupForm[],
    personalizationRows: PersonalizationRowForm[],
    includePants = false,
): RequestOrderItem[] {
    // ชุดพละ builds its order items exactly like Form 1, which is what keeps
    // production reading the same shape whichever of the two the counter used.
    if (usesSizeTables(mode)) {
        return buildRequestItems(sizeTables);
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
            size_tables: [defaultSizeTable],
            personalization_rows: [],
            individual_include_pants: false,
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
    // ชุดพละ artwork is keyed by which size table it belongs to.
    const savedPeArtwork = (order.pe_uniform_artwork_media ?? {}) as Record<
        string,
        SavedArtwork[]
    >;
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
            artwork_files: [],
            saved_artwork: Array.isArray(
                savedSportsDayArtwork[String(groupIndex)],
            )
                ? savedSportsDayArtwork[String(groupIndex)]
                : [],
            rows: rawRows.map((rawRow, rowIndex) => {
                const row = (rawRow ?? {}) as Record<string, unknown>;

                return {
                    id: uid(`sd-row-${groupIndex}-${rowIndex}`),
                    size_group:
                        toStringValueFromUnknown(row.size_group) === 'kids'
                            ? 'kids'
                            : 'adults',
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
            if (item.shirt_style === 'short' || item.shirt_style === 'long') {
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
            const rows = buildGroupedRowsForTable(tableType);

            return {
                id: uid(`table-${tableType}`),
                table_type: tableType,
                title:
                    tableType === 'kids' ? 'ตารางไซส์เด็ก' : 'ตารางไซส์ผู้ใหญ่',
                rows: rows.length > 0 ? rows : [],
                artwork_files: [],
                saved_artwork: Array.isArray(savedPeArtwork[tableType])
                    ? savedPeArtwork[tableType]
                    : [],
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
            shirt_style: (row.shirt_style === 'long'
                ? 'long'
                : 'short') as GarmentStyle,
            number: toStringValue(row.number),
            quantity: Math.max(1, toNumberValue(row.quantity)),
            unit_price: toNumberValue(row.unit_price),
            pants_size: toStringValueFromUnknown(row.pants_size),
            pants_style: (row.pants_style === 'long'
                ? 'long'
                : 'short') as GarmentStyle,
            pants_number: toStringValueFromUnknown(row.pants_number),
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

    return {
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
        size_tables: order
            ? matrixTables.length > 0
                ? matrixTables
                : []
            : [defaultSizeTable],
        personalization_rows: mappedPersonalizationRows,
        individual_include_pants: specPayload.individual_include_pants === true,
        individual_keeper_color: toStringValueFromUnknown(
            specPayload.individual_keeper_color,
        ),
        line_items: items.map((item) => ({
            quantity: Math.max(1, toNumberValue(item.quantity)),
            unit_price: toNumberValue(item.unit_price),
            discount_id: null,
        })),
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
}: {
    media: SavedArtwork;
    onRemoveSaved: (id: number) => void;
    compact?: boolean;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div
                className={`${compact ? 'aspect-square' : 'aspect-[16/10]'} bg-slate-100`}
            >
                <img
                    src={media.url}
                    alt="รูปที่บันทึกไว้"
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
                    aria-label="ลบรูปที่บันทึกไว้"
                    className={`${compact ? 'size-6' : 'size-8'} shrink-0 text-slate-500 hover:text-rose-600`}
                    onClick={() => onRemoveSaved(media.id)}
                >
                    <X className={compact ? 'size-3.5' : 'size-4'} />
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
                                        aria-label="ลบรูปที่เลือกไว้"
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

    const [activeSpecTab, setActiveSpecTab] = useState<SpecTab>('shirt');
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
        // fall through to Form 1 here, which hid its per-table artwork and
        // would have saved the bill back as a plain size-table order.
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
     * A hidden row leaves the choices at once. Any spec field on either tab
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

        setData((previous) => ({
            ...previous,
            shirt_specs: clearMatching(previous.shirt_specs, shirtCatalogKeys),
            pants_specs: clearMatching(previous.pants_specs, pantsCatalogKeys),
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
    const resolvedAdultSizes = adultSizes ?? [];

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

    const matrixGrossAmount = useMemo(
        () =>
            data.size_tables
                .flatMap((table) => table.rows)
                .reduce((total, row) => total + rowTotal(row), 0),
        [data.size_tables],
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
            return buildLineItemsFromMatrix(data.size_tables);
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

    const addPeUniformArtwork = (tableId: string, selectedFiles: File[]) => {
        if (selectedFiles.length === 0) {
            return;
        }

        void Promise.all(selectedFiles.map((file) => compressImage(file))).then(
            (compressed) => {
                setData((previous) => ({
                    ...previous,
                    size_tables: previous.size_tables.map((table) =>
                        table.id === tableId
                            ? {
                                  ...table,
                                  artwork_files: [
                                      ...table.artwork_files,
                                      ...compressed,
                                  ],
                              }
                            : table,
                    ),
                }));
            },
        );
    };

    const removePeUniformArtwork = (tableId: string, fileIndex: number) => {
        setData(
            'size_tables',
            data.size_tables.map((table) =>
                table.id === tableId
                    ? {
                          ...table,
                          artwork_files: table.artwork_files.filter(
                              (_, index) => index !== fileIndex,
                          ),
                      }
                    : table,
            ),
        );
    };

    const addSportsDayArtwork = (groupId: string, selectedFiles: File[]) => {
        if (selectedFiles.length === 0) {
            return;
        }

        void Promise.all(selectedFiles.map((file) => compressImage(file))).then(
            (compressed) => {
                setData((previous) => ({
                    ...previous,
                    sports_day_groups: previous.sports_day_groups.map(
                        (group) =>
                            group.id === groupId
                                ? {
                                      ...group,
                                      artwork_files: [
                                          ...group.artwork_files,
                                          ...compressed,
                                      ],
                                  }
                                : group,
                    ),
                }));
            },
        );
    };

    const removeSportsDayArtwork = (groupId: string, fileIndex: number) => {
        updateSportsDayGroups(
            data.sports_day_groups.map((group) =>
                group.id === groupId
                    ? {
                          ...group,
                          artwork_files: group.artwork_files.filter(
                              (_, index) => index !== fileIndex,
                          ),
                      }
                    : group,
            ),
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

    const addSizeTable = (tableType: SizeTableType) => {
        setData('size_tables', [
            ...data.size_tables,
            createSizeTable(tableType),
        ]);
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
        'panel_style_id',
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

        return data.size_tables.some((table) =>
            table.rows.some((row) =>
                garment === 'shirt'
                    ? row.set_shirt_qty > 0 || row.separate_shirt_qty > 0
                    : row.set_pants_qty > 0 || row.separate_pants_qty > 0,
            ),
        );
    };

    const analyzeForm = (): { missing: string[]; fields: Set<string> } => {
        const missing: string[] = [];
        const fields = new Set<string>();

        if (!data.job_name.trim()) {
            missing.push('ชื่อหน่วยงาน, ชื่องาน');
            fields.add('job_name');
        }

        if (!data.customer_name.trim()) {
            missing.push('ชื่อลูกค้า');
            fields.add('customer_name');
        }

        if (!data.billing_date) {
            missing.push('วันที่เปิดบิล');
        }

        if (!data.billing_time) {
            missing.push('เวลาเปิดบิล');
        }

        if (!data.due_date) {
            missing.push('วันที่รับสินค้า');
            fields.add('due_date');
        }

        if (!data.branch_id) {
            missing.push('สาขา');
            fields.add('branch_id');
        }

        const requestItems = resolveRequestItems(
            sizeFormMode,
            data.size_tables,
            data.sports_day_groups,
            data.personalization_rows,
            data.individual_include_pants,
        );

        if (requestItems.length === 0) {
            missing.push('จำนวนและราคาสินค้าอย่างน้อย 1 รายการ');
        }

        // Scoped to the two size-table forms: the others keep their own
        // (hidden) size_tables state, and an untouched hidden table must not
        // block their submit.
        if (usesSizeTables(sizeFormMode)) {
            // A blank row is just an unused slot; only a row someone actually
            // entered numbers on has to name its size.
            const rowHasEntry = (row: SizeRowForm): boolean =>
                row.set_shirt_qty > 0 ||
                row.set_pants_qty > 0 ||
                row.set_price > 0 ||
                row.separate_shirt_qty > 0 ||
                row.separate_pants_qty > 0 ||
                row.separate_shirt_price > 0 ||
                row.separate_pants_price > 0;

            if (
                data.size_tables.some((table) =>
                    table.rows.some(
                        (row) => rowHasEntry(row) && !row.size_label,
                    ),
                )
            ) {
                missing.push('ไซส์ในตารางเลือกไซซ์');
            }

            if (
                data.size_tables.some((table) =>
                    table.rows.some(
                        (row) => row.size_label.length > SIZE_LABEL_MAX_LENGTH,
                    ),
                )
            ) {
                missing.push(
                    `ไซส์ต้องไม่เกิน ${SIZE_LABEL_MAX_LENGTH} ตัวอักษร`,
                );
            }
        }

        if (sizeFormMode === 'sports_day') {
            if (
                data.sports_day_groups.some(
                    (group) => group.team_name.trim() === '',
                )
            ) {
                missing.push('ชื่อคณะสี');
            }

            const rowsWithQuantity = data.sports_day_groups.flatMap((group) =>
                group.rows.filter(
                    (row) => row.shirt_qty > 0 || row.pants_qty > 0,
                ),
            );

            if (rowsWithQuantity.some((row) => !row.size_label)) {
                missing.push('ไซซ์ในตารางคณะสี');
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

            if (
                rowsWithQuantity.some(
                    (row) =>
                        (row.shirt_qty > 0 && row.shirt_price <= 0) ||
                        (row.pants_qty > 0 && row.pants_price <= 0),
                )
            ) {
                missing.push('ราคาของรายการที่กรอกจำนวนไว้');
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
                missing.push('ข้อมูลรายตัวในฟอร์มรายตัว');
            }
        }

        // Which spec is required follows the size table, not the tab that
        // happens to be open. A bill with shirts and pants needs both, whether
        // or not the counter ever clicked through to the second tab.
        if (orderIncludesGarment('shirt')) {
            const blanks = REQUIRED_SHIRT_SPEC_KEYS.filter(
                (key) => !String(data.shirt_specs[key] ?? '').trim(),
            );

            blanks.forEach((key) => fields.add(`shirt.${key}`));

            if (blanks.length > 0) {
                missing.push(
                    `สเปกแบบเสื้อ ยังไม่ได้กรอก ${blanks.length} ช่อง`,
                );
            }
        }

        if (orderIncludesGarment('pants')) {
            const blanks = REQUIRED_PANTS_SPEC_KEYS.filter(
                (key) => !String(data.pants_specs[key] ?? '').trim(),
            );

            blanks.forEach((key) => fields.add(`pants.${key}`));

            if (blanks.length > 0) {
                missing.push(
                    `สเปกแบบกางเกง ยังไม่ได้กรอก ${blanks.length} ช่อง`,
                );
            }
        }

        return { missing, fields };
    };

    // Recomputed on every render once a submit has failed, so a box stops being
    // red the moment its field is filled in -- no stale highlighting.
    const invalidFields = showFieldErrors
        ? analyzeForm().fields
        : EMPTY_INVALID_FIELDS;

    const invalidClass = (key: string): string =>
        invalidFields.has(key)
            ? ' border-red-500 bg-red-50 ring-1 ring-red-500/40 focus-visible:border-red-500'
            : '';

    const handleSubmitClick = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const { missing, fields } = analyzeForm();
        setValidationErrors(missing);
        setShowFieldErrors(missing.length > 0);

        if (missing.length > 0) {
            // Open the spec tab that is short of information, otherwise the red
            // boxes sit on a tab the counter cannot see and the message looks
            // like it is complaining about nothing.
            const blankTab = [...fields].some((key) => key.startsWith('shirt.'))
                ? 'shirt'
                : [...fields].some((key) => key.startsWith('pants.'))
                  ? 'pants'
                  : null;

            if (blankTab !== null) {
                setActiveSpecTab(blankTab);
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
        const activeSpecValues =
            activeSpecTab === 'pants' ? data.pants_specs : data.shirt_specs;
        const screenPrintDetail = JSON.stringify({
            schema: 'spec-v2',
            mode: sizeFormMode,
            shirt_specs: data.shirt_specs,
            pants_specs: data.pants_specs,
            // The master-data names as they read at the moment of saving.
            spec_labels: {
                shirt: snapshotSpecLabels(
                    data.shirt_specs,
                    withCatalogPatches(resolvedShirtCatalogs, shirtCatalogKeys),
                ),
                pants: snapshotSpecLabels(
                    data.pants_specs,
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
                              pants_size: data.individual_include_pants
                                  ? row.pants_size.trim()
                                  : '',
                              pants_style: row.pants_style,
                              pants_number: data.individual_include_pants
                                  ? row.pants_number.trim()
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
            duplicate_from_id: order?.duplicate_from_id ?? null,
            // Saved artwork the user removed. On an edit these media are deleted;
            // on a duplicate they are simply not copied onto the new bill.
            removed_media_ids: payload.removed_media_ids,
            // Keyed by colour house index so the server can tag each file with
            // the house it belongs to. Only Form 3 ever sends this.
            sports_day_artwork:
                sizeFormMode === 'sports_day'
                    ? Object.fromEntries(
                          data.sports_day_groups
                              .map(
                                  (group, index) =>
                                      [index, group.artwork_files] as const,
                              )
                              .filter(([, files]) => files.length > 0),
                      )
                    : {},
            // Keyed by the size table it belongs to, so each table gets its
            // own gallery back when the bill is reopened. Only Form 4
            // ever sends this.
            pe_uniform_artwork:
                sizeFormMode === 'pe_uniform'
                    ? Object.fromEntries(
                          data.size_tables
                              .map(
                                  (table) =>
                                      [
                                          table.table_type,
                                          table.artwork_files,
                                      ] as const,
                              )
                              .filter(([, files]) => files.length > 0),
                      )
                    : {},
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
                neck_style_id: payload.shirt_specs.neck_style_id
                    ? Number(payload.shirt_specs.neck_style_id)
                    : null,
                collar_color: payload.shirt_specs.neck_color_id || null,
                leg_style: payload.pants_specs.leg_style_id || null,
                leg_hem: payload.pants_specs.leg_cuff_id || null,
                placket_style: payload.shirt_specs.placket_style_id || null,
                placket_color:
                    payload.shirt_specs.placket_outer_color_id || null,
                sleeve_style: payload.shirt_specs.sleeve_style_text || null,
                sleeve_hem: payload.shirt_specs.sleeve_cuff_id || null,
                sublimation_detail:
                    payload.shirt_specs.sublimation_id ||
                    payload.pants_specs.sublimation_id ||
                    null,
                screen_print_detail: screenPrintDetail,
                embroidery_code:
                    payload.shirt_specs.embroidery_code_text ||
                    payload.pants_specs.embroidery_code_text ||
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

    const shirtSelectFields: Array<{
        label: string;
        key: keyof ShirtSpecsForm;
        source: keyof CatalogMap;
    }> = [
        { label: 'แพทเทิร์น', key: 'pattern_id', source: 'patterns' },
        { label: 'เนื้อผ้า', key: 'fabric_id', source: 'fabrics' },
        { label: 'สีผ้า', key: 'fabric_color_id', source: 'fabric_colors' },
        { label: 'แบบคอ', key: 'neck_style_id', source: 'neck_styles' },
        { label: 'สีแบบคอ', key: 'neck_color_id', source: 'neck_colors' },
        { label: 'ปก', key: 'collar_id', source: 'collars' },
        { label: 'แบบสาบ', key: 'placket_style_id', source: 'placket_styles' },
        {
            label: 'สีสาบ (ใน)',
            key: 'placket_inner_color_id',
            source: 'placket_inner_colors',
        },
        {
            label: 'สีสาบ (นอก)',
            key: 'placket_outer_color_id',
            source: 'placket_outer_colors',
        },
        { label: 'ปลายแขน', key: 'sleeve_cuff_id', source: 'sleeve_cuffs' },
        { label: 'สาบนอก', key: 'panel_style_id', source: 'panel_styles' },
        { label: 'สีสกรีน', key: 'screen_color_id', source: 'screen_colors' },
        {
            label: 'สีงานปัก',
            key: 'embroidery_color_id',
            source: 'embroidery_colors',
        },
        { label: 'ซับลิเมชั่น', key: 'sublimation_id', source: 'sublimations' },
    ];

    const pantsSelectFields: Array<{
        label: string;
        key: keyof PantsSpecsForm;
        source: keyof CatalogMap;
    }> = [
        { label: 'แพทเทิร์น', key: 'pattern_id', source: 'patterns' },
        { label: 'เนื้อผ้า', key: 'fabric_id', source: 'fabrics' },
        { label: 'สีผ้า', key: 'fabric_color_id', source: 'fabric_colors' },
        { label: 'แบบขา', key: 'leg_style_id', source: 'leg_styles' },
        { label: 'ปลายขา', key: 'leg_cuff_id', source: 'leg_cuffs' },
        { label: 'สีสกรีน', key: 'screen_color_id', source: 'screen_colors' },
        {
            label: 'สีงานปัก',
            key: 'embroidery_color_id',
            source: 'embroidery_colors',
        },
        { label: 'ซับลิเมชั่น', key: 'sublimation_id', source: 'sublimations' },
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
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>
                                กรอกข้อมูลให้ครบก่อนบันทึก
                            </DialogTitle>
                            <DialogDescription>
                                กรุณากรอกข้อมูลต่อไปนี้ก่อนส่งคำสั่งผลิต
                            </DialogDescription>
                        </DialogHeader>

                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                            <ul className="space-y-1 text-sm text-rose-700">
                                {validationErrors.map((message) => (
                                    <li key={message}>• {message}</li>
                                ))}
                            </ul>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                onClick={() => setShowValidationModal(false)}
                            >
                                ปิด
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

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
                        <div className="grid gap-4 xl:grid-cols-5">
                            {/* The general-info card and the spec card share one grid
                                row. The spec card is the taller one, so the left card
                                grows to meet it: the fields stay at the top, the money
                                summary holds the bottom edge, and the two columns end on
                                the same line. Below xl the form is one column and the
                                card is simply as tall as its content. */}
                            <div className="flex flex-col gap-4 xl:col-span-2">
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
                                    <h2 className="mb-3 text-sm font-bold text-slate-900">
                                        ข้อมูลทั่วไป, ลูกค้า, การจัดส่ง
                                        และการเงิน
                                    </h2>

                                    <div className="grid gap-5 md:grid-cols-2">
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

                                        <label className="grid gap-1.5 text-xs md:col-span-2">
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

                                        <label className="grid gap-1.5 text-xs md:col-span-2">
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

                                    <div className="mt-auto pt-6">
                                        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
                                            <h3 className="mb-3 text-sm font-bold text-slate-800">
                                                สรุปการเงินแบบเรียลไทม์
                                            </h3>
                                            <div className="space-y-2.5 text-[13px]">
                                                <div className="flex items-center justify-between text-slate-600">
                                                    <span>รวมเป็นเงิน</span>
                                                    <span className="font-semibold text-slate-900">
                                                        ฿{' '}
                                                        {formatMoney(
                                                            grossAmount,
                                                        )}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                                                    <span className="text-slate-600">
                                                        ส่วนลด
                                                    </span>
                                                    <Select
                                                        value={
                                                            data.discount_percent
                                                        }
                                                        onValueChange={(
                                                            value,
                                                        ) =>
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
                                                                        key={
                                                                            percent
                                                                        }
                                                                        value={
                                                                            percent
                                                                        }
                                                                    >
                                                                        {
                                                                            percent
                                                                        }
                                                                        %
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
                                                        {formatMoney(
                                                            discountAmount,
                                                        )}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between border-t border-yellow-200 pt-2.5 text-slate-700">
                                                    <span className="font-semibold">
                                                        ยอดรวมหลังหักส่วนลด
                                                    </span>
                                                    <span className="text-base font-bold text-slate-900">
                                                        ฿{' '}
                                                        {formatMoney(netAmount)}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                                                    <span className="text-slate-600">
                                                        เงินที่จ่าย
                                                    </span>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        value={
                                                            data.deposit_amount
                                                        }
                                                        onChange={(event) =>
                                                            setData(
                                                                'deposit_amount',
                                                                toNumber(
                                                                    event.target
                                                                        .value,
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
                                    </div>
                                </section>
                            </div>

                            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
                                <h2 className="mb-3 text-sm font-bold text-slate-900">
                                    รายละเอียดสเปกงานตัดเย็บ
                                </h2>

                                <div className="mb-4 flex flex-wrap gap-2 rounded-lg bg-slate-100 p-1.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                            activeSpecTab === 'shirt'
                                                ? 'default'
                                                : 'ghost'
                                        }
                                        className="h-8 text-xs"
                                        onClick={() =>
                                            setActiveSpecTab('shirt')
                                        }
                                    >
                                        แบบเสื้อ
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                            activeSpecTab === 'pants'
                                                ? 'default'
                                                : 'ghost'
                                        }
                                        className="h-8 text-xs"
                                        onClick={() =>
                                            setActiveSpecTab('pants')
                                        }
                                    >
                                        แบบกางเกง
                                    </Button>
                                </div>

                                {activeSpecTab === 'shirt' ? (
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        <div className="md:col-span-2 xl:col-span-3">
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
                                        </div>
                                        <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                                            <span className="font-semibold text-slate-600">
                                                แบบเสื้อ
                                            </span>
                                            <Select
                                                value={
                                                    data.shirt_specs
                                                        .shirt_type_id
                                                }
                                                onValueChange={(value) =>
                                                    selectShirtSpec(
                                                        'shirt_type_id',
                                                        value,
                                                    )
                                                }
                                            >
                                                <SelectTrigger
                                                    className={`h-9 w-full bg-white text-xs${invalidClass('shirt.shirt_type_id')}`}
                                                >
                                                    <SelectValue placeholder="เลือกแบบเสื้อ" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {resolvedShirtTypes.map(
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

                                        {shirtSelectFields.map((field) => {
                                            const storageKey =
                                                shirtCatalogKeys[field.source];
                                            const options = catalogOptions(
                                                storageKey,
                                                resolvedShirtCatalogs[
                                                    field.source
                                                ] ?? [],
                                            );

                                            return (
                                                <label
                                                    key={field.key}
                                                    className="grid gap-1.5 text-xs"
                                                >
                                                    <span className="font-semibold text-slate-600">
                                                        {field.label}
                                                    </span>
                                                    <MasterDataComboBox
                                                        storageKey={
                                                            storageKey ?? ''
                                                        }
                                                        label={field.label}
                                                        options={options}
                                                        value={
                                                            data.shirt_specs[
                                                                field.key
                                                            ]
                                                        }
                                                        onValueChange={(
                                                            value,
                                                        ) =>
                                                            updateShirtSpecs(
                                                                field.key,
                                                                value,
                                                            )
                                                        }
                                                        onOptionAdded={(
                                                            option,
                                                        ) =>
                                                            storageKey
                                                                ? handleOptionAdded(
                                                                      storageKey,
                                                                      option,
                                                                  )
                                                                : undefined
                                                        }
                                                        manage={
                                                            storageKey
                                                                ? manageFor(
                                                                      storageKey,
                                                                  )
                                                                : undefined
                                                        }
                                                        // A field without a catalog on the server has
                                                        // nowhere to add to, so it stays free text.
                                                        placeholder={`เลือกหรือพิมพ์${field.label}`}
                                                        className={`h-9 bg-white text-xs md:text-xs${invalidClass(`shirt.${field.key}`)}`}
                                                        aria-label={field.label}
                                                    />
                                                </label>
                                            );
                                        })}

                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                แบบแขน
                                            </span>
                                            <Input
                                                value={
                                                    data.shirt_specs
                                                        .sleeve_style_text
                                                }
                                                onChange={(event) =>
                                                    updateShirtSpecs(
                                                        'sleeve_style_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('shirt.sleeve_style_text')}`}
                                            />
                                        </label>
                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                แบบกุ้น
                                            </span>
                                            <Input
                                                value={
                                                    data.shirt_specs
                                                        .piping_style_text
                                                }
                                                onChange={(event) =>
                                                    updateShirtSpecs(
                                                        'piping_style_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('shirt.piping_style_text')}`}
                                            />
                                        </label>
                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                แบบลา
                                            </span>
                                            <Input
                                                value={
                                                    data.shirt_specs
                                                        .stripe_style_text
                                                }
                                                onChange={(event) =>
                                                    updateShirtSpecs(
                                                        'stripe_style_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('shirt.stripe_style_text')}`}
                                            />
                                        </label>
                                        <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                                            <span className="font-semibold text-slate-600">
                                                ข้อความสกรีน
                                            </span>
                                            <Input
                                                value={
                                                    data.shirt_specs.screen_text
                                                }
                                                onChange={(event) =>
                                                    updateShirtSpecs(
                                                        'screen_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('shirt.screen_text')}`}
                                            />
                                        </label>
                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                รหัสงานปัก
                                            </span>
                                            <Input
                                                value={
                                                    data.shirt_specs
                                                        .embroidery_code_text
                                                }
                                                onChange={(event) =>
                                                    updateShirtSpecs(
                                                        'embroidery_code_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('shirt.embroidery_code_text')}`}
                                            />
                                        </label>
                                        <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                                            <span className="font-semibold text-slate-600">
                                                รายละเอียดปัก
                                            </span>
                                            <textarea
                                                rows={3}
                                                value={
                                                    data.shirt_specs
                                                        .embroidery_note_text
                                                }
                                                onChange={(event) =>
                                                    updateShirtSpecs(
                                                        'embroidery_note_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200${invalidClass('shirt.embroidery_note_text')}`}
                                            />
                                        </label>
                                    </div>
                                ) : (
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        <div className="md:col-span-2 xl:col-span-3">
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
                                        </div>
                                        {/*
                                            แบบกางเกง is not asked for any more: leg length now
                                            comes from the size table, one row at a time, and the
                                            pants type only picks the labour rate. The value is
                                            still carried in pants_specs so saved orders keep
                                            theirs and new ones record the active type.
                                        */}

                                        {pantsSelectFields.map((field) => {
                                            const storageKey =
                                                pantsCatalogKeys[field.source];
                                            const options = catalogOptions(
                                                storageKey,
                                                resolvedPantsCatalogs[
                                                    field.source
                                                ] ?? [],
                                            );

                                            return (
                                                <label
                                                    key={field.key}
                                                    className="grid gap-1.5 text-xs"
                                                >
                                                    <span className="font-semibold text-slate-600">
                                                        {field.label}
                                                    </span>
                                                    <MasterDataComboBox
                                                        storageKey={
                                                            storageKey ?? ''
                                                        }
                                                        label={field.label}
                                                        options={options}
                                                        value={
                                                            data.pants_specs[
                                                                field.key
                                                            ]
                                                        }
                                                        onValueChange={(
                                                            value,
                                                        ) =>
                                                            updatePantsSpecs(
                                                                field.key,
                                                                value,
                                                            )
                                                        }
                                                        onOptionAdded={(
                                                            option,
                                                        ) =>
                                                            storageKey
                                                                ? handleOptionAdded(
                                                                      storageKey,
                                                                      option,
                                                                  )
                                                                : undefined
                                                        }
                                                        manage={
                                                            storageKey
                                                                ? manageFor(
                                                                      storageKey,
                                                                  )
                                                                : undefined
                                                        }
                                                        // A field without a catalog on the server has
                                                        // nowhere to add to, so it stays free text.
                                                        placeholder={`เลือกหรือพิมพ์${field.label}`}
                                                        className={`h-9 bg-white text-xs md:text-xs${invalidClass(`pants.${field.key}`)}`}
                                                        aria-label={field.label}
                                                    />
                                                </label>
                                            );
                                        })}

                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                กุ้นกางเกง
                                            </span>
                                            <Input
                                                value={
                                                    data.pants_specs
                                                        .seat_style_text
                                                }
                                                onChange={(event) =>
                                                    updatePantsSpecs(
                                                        'seat_style_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('pants.seat_style_text')}`}
                                            />
                                        </label>
                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                แบบต่อ
                                            </span>
                                            <Input
                                                value={
                                                    data.pants_specs
                                                        .panel_style_text
                                                }
                                                onChange={(event) =>
                                                    updatePantsSpecs(
                                                        'panel_style_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('pants.panel_style_text')}`}
                                            />
                                        </label>
                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                แบบลา
                                            </span>
                                            <Input
                                                value={
                                                    data.pants_specs
                                                        .stripe_style_text
                                                }
                                                onChange={(event) =>
                                                    updatePantsSpecs(
                                                        'stripe_style_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('pants.stripe_style_text')}`}
                                            />
                                        </label>
                                        <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                                            <span className="font-semibold text-slate-600">
                                                ข้อความสกรีน
                                            </span>
                                            <Input
                                                value={
                                                    data.pants_specs.screen_text
                                                }
                                                onChange={(event) =>
                                                    updatePantsSpecs(
                                                        'screen_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('pants.screen_text')}`}
                                            />
                                        </label>
                                        <label className="grid gap-1.5 text-xs">
                                            <span className="font-semibold text-slate-600">
                                                รหัสงานปัก
                                            </span>
                                            <Input
                                                value={
                                                    data.pants_specs
                                                        .embroidery_code_text
                                                }
                                                onChange={(event) =>
                                                    updatePantsSpecs(
                                                        'embroidery_code_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`h-9 text-xs md:text-xs${invalidClass('pants.embroidery_code_text')}`}
                                            />
                                        </label>
                                        <label className="grid gap-1.5 text-xs md:col-span-2 xl:col-span-3">
                                            <span className="font-semibold text-slate-600">
                                                รายละเอียดปัก
                                            </span>
                                            <textarea
                                                rows={3}
                                                value={
                                                    data.pants_specs
                                                        .embroidery_note_text
                                                }
                                                onChange={(event) =>
                                                    updatePantsSpecs(
                                                        'embroidery_note_text',
                                                        event.target.value,
                                                    )
                                                }
                                                className={`w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200${invalidClass('pants.embroidery_note_text')}`}
                                            />
                                        </label>
                                    </div>
                                )}
                            </section>
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
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <h2 className="text-sm font-bold text-slate-900">
                                        ตารางเลือกไซซ์และราคา
                                    </h2>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {usesSizeTables(sizeFormMode) ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs"
                                                onClick={() =>
                                                    addSizeTable('kids')
                                                }
                                            >
                                                <Plus className="size-3.5" />
                                                เพิ่มตารางไซซ์เด็ก (Kids)
                                            </Button>
                                        ) : null}
                                        {usesSizeTables(sizeFormMode) ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs"
                                                onClick={() =>
                                                    addSizeTable('adults')
                                                }
                                            >
                                                <Plus className="size-3.5" />
                                                เพิ่มตารางไซซ์ผู้ใหญ่ (Adults)
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>

                                {usesSizeTables(sizeFormMode) ? (
                                    <div className="space-y-4">
                                        {data.size_tables.map((table) => {
                                            const tableSizeOptions =
                                                table.table_type === 'kids'
                                                    ? resolvedKidsSizes
                                                    : resolvedAdultSizes;
                                            // ชุดพละ: saved images the user has not asked to remove.
                                            const savedTableArtwork =
                                                visibleSavedMedia(
                                                    table.saved_artwork,
                                                );
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
                                                            rowSetTotal(row),
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
                                                                {table.title}
                                                            </h3>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
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
                                                                                            <SelectItem value="short">
                                                                                                แขนสั้น
                                                                                            </SelectItem>
                                                                                            <SelectItem value="long">
                                                                                                แขนยาว
                                                                                            </SelectItem>
                                                                                        </SelectContent>
                                                                                    </Select>
                                                                                    <Input
                                                                                        type="number"
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
                                                    {sizeFormMode ===
                                                    'pe_uniform' ? (
                                                        <div className="border-t border-slate-200 bg-slate-50/60 p-3">
                                                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                                                <span className="text-xs font-semibold text-slate-700">
                                                                    Art Work ของ
                                                                    {table.table_type ===
                                                                    'kids'
                                                                        ? 'ชุดเด็ก'
                                                                        : 'ชุดผู้ใหญ่'}
                                                                </span>
                                                                <span className="text-xs text-slate-500">
                                                                    แนบแล้ว{' '}
                                                                    <span className="font-mono text-sm font-semibold text-slate-900">
                                                                        {savedTableArtwork.length +
                                                                            table
                                                                                .artwork_files
                                                                                .length}
                                                                    </span>{' '}
                                                                    รูป
                                                                    {savedTableArtwork.length >
                                                                    0
                                                                        ? ` (บันทึกแล้ว ${savedTableArtwork.length})`
                                                                        : ''}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                {savedTableArtwork.map(
                                                                    (media) => (
                                                                        <div
                                                                            key={
                                                                                media.id
                                                                            }
                                                                            className="relative size-16 overflow-hidden rounded-md border border-slate-300 bg-white"
                                                                        >
                                                                            <img
                                                                                src={
                                                                                    media.url
                                                                                }
                                                                                alt={`Art Work ${table.title}`}
                                                                                className="size-full object-contain"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    removeSavedMedia(
                                                                                        media.id,
                                                                                    )
                                                                                }
                                                                                aria-label={`ลบรูปที่บันทึกไว้ของ ${table.title}`}
                                                                                className="absolute top-0 right-0 rounded-bl bg-rose-600 px-1 text-[10px] leading-4 text-white"
                                                                            >
                                                                                ลบ
                                                                            </button>
                                                                        </div>
                                                                    ),
                                                                )}
                                                                {table.artwork_files.map(
                                                                    (
                                                                        file,
                                                                        fileIndex,
                                                                    ) => (
                                                                        <div
                                                                            key={`${file.name}-${file.lastModified}-${fileIndex}`}
                                                                            className="relative size-16 overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50"
                                                                        >
                                                                            <img
                                                                                src={URL.createObjectURL(
                                                                                    file,
                                                                                )}
                                                                                alt={
                                                                                    file.name
                                                                                }
                                                                                className="size-full object-contain"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    removePeUniformArtwork(
                                                                                        table.id,
                                                                                        fileIndex,
                                                                                    )
                                                                                }
                                                                                aria-label={`ลบรูปที่ ${fileIndex + 1} ของ ${table.title}`}
                                                                                className="absolute top-0 right-0 rounded-bl bg-rose-600 px-1 text-[10px] leading-4 text-white"
                                                                            >
                                                                                ลบ
                                                                            </button>
                                                                        </div>
                                                                    ),
                                                                )}
                                                                <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                                                    <Plus className="size-3.5" />
                                                                    เพิ่มรูป
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        multiple
                                                                        className="hidden"
                                                                        aria-label={`เลือกรูป Art Work ของ${table.table_type === 'kids' ? 'ชุดเด็ก' : 'ชุดผู้ใหญ่'}`}
                                                                        onChange={(
                                                                            event,
                                                                        ) => {
                                                                            addPeUniformArtwork(
                                                                                table.id,
                                                                                Array.from(
                                                                                    event
                                                                                        .target
                                                                                        .files ??
                                                                                        [],
                                                                                ),
                                                                            );
                                                                            event.target.value =
                                                                                '';
                                                                        }}
                                                                    />
                                                                </label>
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
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
                                                                    className="h-9 bg-white text-xs md:text-xs"
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
                                                            <table className="w-full min-w-[760px] table-fixed border-collapse text-xs">
                                                                <thead>
                                                                    <tr className="bg-slate-100 text-slate-700">
                                                                        <th className="w-[15%] border border-slate-200 px-2 py-2">
                                                                            ประเภทไซซ์
                                                                        </th>
                                                                        <th className="w-[14%] border border-slate-200 px-2 py-2">
                                                                            ไซซ์
                                                                        </th>
                                                                        <th className="w-[12%] border border-slate-200 px-2 py-2">
                                                                            เสื้อ
                                                                        </th>
                                                                        <th className="w-[16%] border border-slate-200 px-2 py-2">
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
                                                                        <th className="w-[13%] border border-slate-200 px-2 py-2">
                                                                            รวม
                                                                        </th>
                                                                        <th className="w-[2%] border border-slate-200 px-1 py-2">
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
                                                                                row.size_group ===
                                                                                'kids'
                                                                                    ? resolvedKidsSizes
                                                                                    : resolvedAdultSizes;
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
                                                                                                            value ===
                                                                                                            'kids'
                                                                                                                ? 'kids'
                                                                                                                : 'adults',
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
                                                                                                className="h-8 w-full bg-white text-xs"
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
                                                                                            className="h-8 bg-white text-center text-xs md:text-xs"
                                                                                            aria-label={`จำนวนเสื้อแถวที่ ${rowIndex + 1} ของคณะที่ ${groupIndex + 1}`}
                                                                                        />
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                        <Input
                                                                                            type="number"
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
                                                                                            className={`h-8 text-center text-xs md:text-xs ${shirtPriceLinked ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
                                                                                            title={
                                                                                                shirtPriceLinked
                                                                                                    ? 'ราคาตามแถวแรก กดไอคอนลิงก์ที่หัวตารางเพื่อแก้ทีละแถว'
                                                                                                    : undefined
                                                                                            }
                                                                                            aria-label={`ราคาเสื้อแถวที่ ${rowIndex + 1} ของคณะที่ ${groupIndex + 1}`}
                                                                                        />
                                                                                    </td>
                                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                        <Input
                                                                                            type="number"
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
                                                                                            className={`h-8 text-center text-xs md:text-xs ${pantsPriceLinked ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
                                                                                            title={
                                                                                                pantsPriceLinked
                                                                                                    ? 'ราคาตามแถวแรก กดไอคอนลิงก์ที่หัวตารางเพื่อแก้ทีละแถว'
                                                                                                    : undefined
                                                                                            }
                                                                                            aria-label={`ราคากางเกงแถวที่ ${rowIndex + 1} ของคณะที่ ${groupIndex + 1}`}
                                                                                        />
                                                                                    </td>
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
                                                                                6
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

                                                            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
                                                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                                                    <span className="text-xs font-semibold text-slate-600">
                                                                        Art Work
                                                                        ของคณะนี้
                                                                    </span>
                                                                    <span className="text-xs text-slate-500">
                                                                        แนบแล้ว{' '}
                                                                        <span className="font-mono text-sm font-semibold text-slate-900">
                                                                            {savedGroupArtwork.length +
                                                                                group
                                                                                    .artwork_files
                                                                                    .length}
                                                                        </span>{' '}
                                                                        รูป
                                                                        {savedGroupArtwork.length >
                                                                        0
                                                                            ? ` (บันทึกแล้ว ${savedGroupArtwork.length})`
                                                                            : ''}
                                                                    </span>
                                                                </div>

                                                                <div className="flex flex-wrap gap-2">
                                                                    {savedGroupArtwork.map(
                                                                        (
                                                                            media,
                                                                        ) => (
                                                                            <div
                                                                                key={
                                                                                    media.id
                                                                                }
                                                                                className="relative size-16 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                                                                            >
                                                                                <img
                                                                                    src={
                                                                                        media.url
                                                                                    }
                                                                                    alt={`Art Work ${group.team_name}`}
                                                                                    className="size-full object-contain"
                                                                                />
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        removeSavedMedia(
                                                                                            media.id,
                                                                                        )
                                                                                    }
                                                                                    aria-label={`ลบรูปที่บันทึกไว้ของ ${group.team_name || 'คณะนี้'}`}
                                                                                    className="absolute top-0 right-0 rounded-bl bg-slate-900/70 px-1 text-[10px] leading-4 text-white hover:bg-rose-600"
                                                                                >
                                                                                    ✕
                                                                                </button>
                                                                            </div>
                                                                        ),
                                                                    )}
                                                                    {group.artwork_files.map(
                                                                        (
                                                                            file,
                                                                            fileIndex,
                                                                        ) => (
                                                                            <div
                                                                                key={`${file.name}-${file.lastModified}-${fileIndex}`}
                                                                                className="relative size-16 overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50"
                                                                            >
                                                                                <img
                                                                                    src={URL.createObjectURL(
                                                                                        file,
                                                                                    )}
                                                                                    alt={
                                                                                        file.name
                                                                                    }
                                                                                    className="size-full object-contain"
                                                                                />
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        removeSportsDayArtwork(
                                                                                            group.id,
                                                                                            fileIndex,
                                                                                        )
                                                                                    }
                                                                                    aria-label={`ลบรูปที่ ${fileIndex + 1} ของ ${group.team_name || 'คณะนี้'}`}
                                                                                    className="absolute top-0 right-0 rounded-bl bg-slate-900/70 px-1 text-[10px] leading-4 text-white"
                                                                                >
                                                                                    ✕
                                                                                </button>
                                                                            </div>
                                                                        ),
                                                                    )}
                                                                    <label className="flex size-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-500 hover:border-[#174395] hover:text-[#174395]">
                                                                        +
                                                                        เพิ่มรูป
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*"
                                                                            multiple
                                                                            className="hidden"
                                                                            aria-label={`เลือกรูป Art Work ของ ${group.team_name || 'คณะนี้'}`}
                                                                            onChange={(
                                                                                event,
                                                                            ) => {
                                                                                addSportsDayArtwork(
                                                                                    group.id,
                                                                                    Array.from(
                                                                                        event
                                                                                            .target
                                                                                            .files ??
                                                                                            [],
                                                                                    ),
                                                                                );
                                                                                event.target.value =
                                                                                    '';
                                                                            }}
                                                                        />
                                                                    </label>
                                                                </div>
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
                                                                            className="h-8 text-xs md:text-xs"
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
                                                                                className="h-8 w-full bg-white text-xs"
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
                                                                                    value ===
                                                                                        'long'
                                                                                        ? 'long'
                                                                                        : 'short',
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
                                                                                <SelectItem value="short">
                                                                                    แขนสั้น
                                                                                </SelectItem>
                                                                                <SelectItem value="long">
                                                                                    แขนยาว
                                                                                </SelectItem>
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
                                                                            className="h-8 text-center text-xs md:text-xs"
                                                                            aria-label={`เบอร์คนที่ ${rowIndex + 1}`}
                                                                        />
                                                                    </td>
                                                                    <td className="border border-slate-200 px-1.5 py-1.5">
                                                                        <Input
                                                                            type="number"
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
                                                                                            value,
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <SelectTrigger
                                                                                        className="h-8 w-full bg-white text-xs"
                                                                                        aria-label={`ไซซ์กางเกงคนที่ ${rowIndex + 1}`}
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
                                                                                    className="h-8 text-center text-xs md:text-xs"
                                                                                    aria-label={`เบอร์กางเกงคนที่ ${rowIndex + 1}`}
                                                                                />
                                                                            </td>
                                                                            <td className="border border-slate-200 px-1.5 py-1.5">
                                                                                <Input
                                                                                    type="number"
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
                                                                                    className={`h-8 text-center text-xs md:text-xs ${pantsPriceLinked ? 'bg-slate-50 text-slate-500' : ''}`}
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
