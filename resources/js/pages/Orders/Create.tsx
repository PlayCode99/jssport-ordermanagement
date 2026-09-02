import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    CalendarClock,
    Copy,
    Loader2,
    Plus,
    Shirt,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWebpCompress } from '@/hooks/useWebpCompress';
import { DeliveryDatePicker, type DeliveryDateLoad } from '@/components/domain/orders/DeliveryDatePicker';
import { MasterDataComboBox } from '@/components/domain/orders/MasterDataComboBox';

type DeliveryMethod = 'pickup' | 'shipping' | 'onsite';
type PaymentMethod = 'cash' | 'transfer';
type PaymentStatus = 'deposit' | 'pending' | 'paid';
type ArtworkStatus = 'confirmed';
type SpecTab = 'shirt' | 'pants';
type SizeTableType = 'kids' | 'adults';
type SizeFormMode = 'matrix' | 'individual' | 'sports_day';

type OptionItem = {
    id: number;
    name: string;
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

// The 9 color fields (6 shirt + 3 pants, sharing storage with their shirt
// counterparts) that support typing a free-text value or adding it as
// master data inline, instead of only picking from a fixed dropdown.
// Keyed by the shirtSelectFields/pantsSelectFields "source" name so the
// render loop can look up the right catalog to write new master rows into.
const COLOR_FIELD_STORAGE_KEYS: Partial<Record<keyof CatalogMap, string>> = {
    fabric_colors: 'jssport.shirt-fabric-colors',
    neck_colors: 'jssport.shirt-neck-colors',
    placket_outer_colors: 'jssport.shirt-placket-outer-colors',
    placket_inner_colors: 'jssport.shirt-placket-inner-colors',
    screen_colors: 'jssport.shirt-screen-colors',
    embroidery_colors: 'jssport.shirt-embroidery-colors',
};

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
    panel_style_text: string;
    stripe_style_text: string;
    screen_text: string;
    embroidery_code_text: string;
    embroidery_note_text: string;
};

type SizeRowForm = {
    id: string;
    size_label: string;
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
};

type PersonalizationRowForm = {
    id: string;
    name: string;
    size_group: 'kids' | 'adults';
    size: string;
    number: string;
    quantity: number;
    unit_price: number;
    /** Pants for this person, used only when the order includes pants. */
    pants_size: string;
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
    /** Artwork already saved on this order, shown so the count is honest. */
    artwork_urls: string[];
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
    artwork_status: ArtworkStatus;
    artwork_files: File[];
    shirt_artwork_files: File[];
    pants_artwork_files: File[];
    transfer_slip_file: File | null;
    shirt_specs: ShirtSpecsForm;
    pants_specs: PantsSpecsForm;
    size_tables: SizeTableForm[];
    personalization_rows: PersonalizationRowForm[];
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
    pants_artwork_urls?: string[] | null;
    reference_designs?: string[] | null;
    items?: Array<{
        item_type?: string | null;
        size_group?: string | null;
        size_label?: string | null;
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
    shirtCatalogs?: CatalogMap;
    pantsCatalogs?: CatalogMap;
    shirtTypes?: OptionItem[];
    pantsTypes?: OptionItem[];
    kidsSizes?: string[];
    adultSizes?: string[];
    defaultBranchId?: number | null;
    dailyProductionCapacity?: number;
    deliveryDateLoads?: DeliveryDateLoad[];
    order?: EditOrderPayload | null;
};

const discountPercentOptions = ['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50'];
const SIZE_LABEL_MAX_LENGTH = 50;

type RequestOrderItem = {
    item_type: string;
    size_group: 'kids' | 'adults' | 'oversize';
    size_label: string;
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

function snapshotSpecLabels(specs: Record<string, string>, catalogs: CatalogMap): Record<string, string> {
    const labels: Record<string, string> = {};

    Object.entries(SPEC_FIELD_CATALOG_SOURCE).forEach(([field, source]) => {
        const selected = specs[field];

        if (!selected || selected === '-') {
            return;
        }

        const match = (catalogs[source] ?? []).find((option) => String(option.id) === String(selected));

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

function createSizeRow(sizeLabel: string): SizeRowForm {
    return {
        id: uid('row'),
        size_label: sizeLabel,
        set_shirt_qty: 0,
        set_pants_qty: 0,
        set_price: 0,
        separate_shirt_qty: 0,
        separate_pants_qty: 0,
        separate_shirt_price: 0,
        separate_pants_price: 0,
    };
}

function createSizeTable(tableType: SizeTableType, sizes: string[]): SizeTableForm {
    return {
        id: uid('table'),
        table_type: tableType,
        title: tableType === 'kids' ? 'ตารางไซส์เด็ก' : 'ตารางไซส์ผู้ใหญ่',
        rows: sizes.map((size) => createSizeRow(size)),
    };
}

function createSportsDayRow(sizeGroup: 'kids' | 'adults' = 'adults', sizeLabel = ''): SportsDayRowForm {
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
        rows: [createSportsDayRow()],
        artwork_files: [],
        artwork_urls: [],
    };
}

/** Same shape as rowSeparateTotal(): each garment is billed at its own price. */
export function sportsDayRowTotal(row: SportsDayRowForm): number {
    const shirtAmount = Math.max(row.shirt_qty, 0) * Math.max(row.shirt_price, 0);
    const pantsAmount = Math.max(row.pants_qty, 0) * Math.max(row.pants_price, 0);

    return shirtAmount + pantsAmount;
}

export function sportsDayGroupTotal(group: SportsDayGroupForm): number {
    return group.rows.reduce((total, row) => total + sportsDayRowTotal(row), 0);
}

export function sportsDayGroupPieces(group: SportsDayGroupForm): number {
    return group.rows.reduce((total, row) => total + Math.max(row.shirt_qty, 0) + Math.max(row.pants_qty, 0), 0);
}

export function buildRequestItemsFromSportsDay(groups: SportsDayGroupForm[]): RequestOrderItem[] {
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

function buildLineItemsFromSportsDay(groups: SportsDayGroupForm[]): OrderLineItemPayload[] {
    return buildRequestItemsFromSportsDay(groups).map((item) => ({
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_id: null,
    }));
}

function resolveRequestItems(
    mode: SizeFormMode,
    sizeTables: SizeTableForm[],
    sportsDayGroups: SportsDayGroupForm[],
    personalizationRows: PersonalizationRowForm[],
    includePants = false,
): RequestOrderItem[] {
    if (mode === 'matrix') {
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

function getSetPieceCount(row: SizeRowForm): number {
    return getSetBundleCount(row) * 2;
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

export function rowIndividualTotal(row: PersonalizationRowForm, includePants = false): number {
    const shirt = Math.max(row.quantity, 0) * Math.max(row.unit_price, 0);
    const pants = includePants ? Math.max(row.pants_quantity, 0) * Math.max(row.pants_unit_price, 0) : 0;

    return shirt + pants;
}

function buildLineItemsFromMatrix(sizeTables: SizeTableForm[]): OrderLineItemPayload[] {
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

function buildLineItemsFromIndividual(rows: PersonalizationRowForm[], includePants = false): OrderLineItemPayload[] {
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
                    quantity: setBundleCount,
                    unit_price: Math.max(row.set_price, 0),
                });
            }

            if (row.separate_shirt_qty > 0 && row.separate_shirt_price > 0) {
                items.push({
                    item_type: 'separate_shirt',
                    size_group: sizeGroup,
                    size_label: sizeLabel,
                    quantity: row.separate_shirt_qty,
                    unit_price: Math.max(row.separate_shirt_price, 0),
                });
            }

            if (row.separate_pants_qty > 0 && row.separate_pants_price > 0) {
                items.push({
                    item_type: 'separate_pants',
                    size_group: sizeGroup,
                    size_label: sizeLabel,
                    quantity: row.separate_pants_qty,
                    unit_price: Math.max(row.separate_pants_price, 0),
                });
            }

            return items;
        }),
    );
}

export function buildRequestItemsFromIndividual(rows: PersonalizationRowForm[], includePants = false): RequestOrderItem[] {
    return rows.flatMap((row): RequestOrderItem[] => {
        const items: RequestOrderItem[] = [];
        const shirtQuantity = Math.max(row.quantity, 0);

        if (shirtQuantity > 0 || row.unit_price > 0) {
            items.push({
                item_type: 'shirt',
                size_group: row.size_group,
                size_label: row.size || '-',
                quantity: Math.max(shirtQuantity, 1),
                unit_price: Math.max(row.unit_price, 0),
            });
        }

        // Pants ride along on the same person's row, priced separately, exactly
        // like the separate columns of Form 1.
        if (includePants && row.pants_quantity > 0 && row.pants_unit_price > 0) {
            items.push({
                item_type: 'pants',
                size_group: row.size_group,
                size_label: row.pants_size || row.size || '-',
                quantity: row.pants_quantity,
                unit_price: Math.max(row.pants_unit_price, 0),
            });
        }

        return items;
    });
}

function artworkSignature(file: File): string {
    return `${file.name}::${file.size}::${file.lastModified}`;
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

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
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

export function buildEditInitialFormData(order: EditOrderPayload | null | undefined, args: {
    resolvedBranches: BranchOption[];
    defaultBranchId?: number | null;
    resolvedJobTypes: OptionItem[];
    resolvedShirtTypes: OptionItem[];
    resolvedPantsTypes: OptionItem[];
    resolvedKidsSizes: string[];
    resolvedAdultSizes: string[];
}): OrderCreateFormData {
    const defaultTableType: SizeTableType = args.resolvedKidsSizes.length > 0 ? 'kids' : 'adults';
    const defaultTableSizes = defaultTableType === 'kids' ? args.resolvedKidsSizes : args.resolvedAdultSizes;
    const defaultSizeTable = createSizeTable(defaultTableType, defaultTableSizes);

    if (!order) {
        return {
            customer_id: '',
            branch_id: args.defaultBranchId ? String(args.defaultBranchId) : (args.resolvedBranches[0] ? String(args.resolvedBranches[0].id) : ''),
            customer_name: '',
            customer_phone: '',
            contact_detail: '',
            job_type_id: args.resolvedJobTypes[0] ? String(args.resolvedJobTypes[0].id) : '',
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
            artwork_status: 'confirmed',
            artwork_files: [],
            shirt_artwork_files: [],
            pants_artwork_files: [],
            transfer_slip_file: null,
            shirt_specs: {
                shirt_type_id: args.resolvedShirtTypes[0] ? String(args.resolvedShirtTypes[0].id) : '',
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
                pants_type_id: args.resolvedPantsTypes[0] ? String(args.resolvedPantsTypes[0].id) : '',
                pattern_id: '',
                fabric_id: '',
                fabric_color_id: '',
                leg_style_id: '',
                leg_cuff_id: '',
                screen_color_id: '',
                embroidery_color_id: '',
                sublimation_id: '',
                panel_style_text: '',
                stripe_style_text: '',
                screen_text: '',
                embroidery_code_text: '',
                embroidery_note_text: '',
            },
            size_tables: [defaultSizeTable],
            personalization_rows: [],
            individual_include_pants: false,
            sports_day_groups: [createSportsDayGroup()],
            line_items: [],
        };
    }

    const specPayload = (order.specification?.decoded ?? {}) as Record<string, unknown>;
    const shirtSpecPayload = (specPayload.shirt_specs ?? {}) as Record<string, unknown>;
    const pantsSpecPayload = (specPayload.pants_specs ?? {}) as Record<string, unknown>;
    const personalizationRows = Array.isArray(specPayload.personalization_rows)
        ? specPayload.personalization_rows
        : Array.isArray(specPayload.rows)
            ? specPayload.rows
            : [];

    // Unlike Form 1's size tables — which are rebuilt from order_items — the
    // colour houses cannot be recovered that way: order_items has no colour
    // column. They are persisted in the spec JSON and read straight back.
    const savedSportsDayArtwork = (order.sports_day_artwork_urls ?? {}) as Record<string, string[]>;
    const savedSportsDayGroups: SportsDayGroupForm[] = (Array.isArray(specPayload.sports_day_groups)
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
            artwork_urls: Array.isArray(savedSportsDayArtwork[String(groupIndex)])
                ? (savedSportsDayArtwork[String(groupIndex)] as string[])
                : [],
            rows: rawRows.map((rawRow, rowIndex) => {
                const row = (rawRow ?? {}) as Record<string, unknown>;

                return {
                    id: uid(`sd-row-${groupIndex}-${rowIndex}`),
                    size_group: toStringValueFromUnknown(row.size_group) === 'kids' ? 'kids' : 'adults',
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

    const buildGroupedRowsForTable = (sizeGroup: 'kids' | 'adults'): SizeRowForm[] => {
        const rowMap = new Map<string, SizeRowForm>();

        items.forEach((item, index) => {
            const normalizedGroup = (item.size_group ?? 'adults') === 'kids' ? 'kids' : 'adults';

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
                    row.separate_shirt_price = unitPrice || row.separate_shirt_price;
                }

                if (itemType.includes('pants')) {
                    row.separate_pants_qty += quantity;
                    row.separate_pants_price = unitPrice || row.separate_pants_price;
                }
            } else if (itemType.includes('shirt') || itemType.includes('pants') || itemType === 'garment' || itemType === 'set') {
                const setCount = itemType.includes('shirt') ? quantity : itemType.includes('pants') ? 0 : quantity;
                const pantsCount = itemType.includes('pants') ? quantity : itemType.includes('shirt') ? 0 : quantity;

                row.set_shirt_qty += setCount;
                row.set_pants_qty += pantsCount;
                row.set_price = unitPrice || row.set_price;
            }

            rowMap.set(sizeLabel, row);
        });

        return Array.from(rowMap.values());
    };

    const matrixTables: SizeTableForm[] = (['kids', 'adults'] as const)
        .filter((tableType) => {
            return items.some((item) => ((item.size_group ?? 'adults') === 'kids' ? 'kids' : 'adults') === tableType);
        })
        .map((tableType) => {
            const rows = buildGroupedRowsForTable(tableType);

            return {
                id: uid(`table-${tableType}`),
                table_type: tableType,
                title: tableType === 'kids' ? 'ตารางไซส์เด็ก' : 'ตารางไซส์ผู้ใหญ่',
                rows: rows.length > 0 ? rows : [],
            };
        });

    const matrixTable = matrixTables[0] ?? {
        id: uid('table'),
        table_type: 'adults',
        title: 'ตารางไซส์ผู้ใหญ่',
        rows: [
            {
                id: uid('row'),
                size_label: 'ระบุไซส์',
                set_shirt_qty: 0,
                set_pants_qty: 0,
                set_price: 0,
                separate_shirt_qty: 0,
                separate_pants_qty: 0,
                separate_shirt_price: 0,
                separate_pants_price: 0,
            },
        ],
    };

    const mappedPersonalizationRows = personalizationRows
        .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
        .map((row, index) => ({
            id: uid(`person-${index}`),
            name: toStringValue(row.name),
            size_group: (row.size_group === 'kids' ? 'kids' : 'adults') as 'kids' | 'adults',
            size: toStringValue(row.size),
            number: toStringValue(row.number),
            quantity: Math.max(1, toNumberValue(row.quantity)),
            unit_price: toNumberValue(row.unit_price),
            pants_size: toStringValueFromUnknown(row.pants_size),
            pants_quantity: toNumberValueFromUnknown(row.pants_quantity),
            pants_unit_price: toNumberValueFromUnknown(row.pants_unit_price),
        }));

    const resolvedJobTypeId = args.resolvedJobTypes.find((jobType) => jobType.name === order.job_type)?.id ?? args.resolvedJobTypes[0]?.id ?? 0;
    const matchedBranchId = args.resolvedBranches.find((branch) => branch.id === order.branch_id)?.id ?? order.branch_id ?? args.resolvedBranches[0]?.id ?? 0;

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
        artwork_status: 'confirmed',
        artwork_files: [],
        shirt_artwork_files: [],
        pants_artwork_files: [],
        transfer_slip_file: null,
        shirt_specs: {
            shirt_type_id: toStringValueFromUnknown(shirtSpecPayload.shirt_type_id ?? order.specification?.decoded?.shirt_specs?.shirt_type_id ?? args.resolvedShirtTypes[0]?.id ?? ''),
            pattern_id: toStringValueFromUnknown(shirtSpecPayload.pattern_id ?? order.specification?.pattern_id ?? ''),
            fabric_id: toStringValueFromUnknown(shirtSpecPayload.fabric_id ?? order.specification?.fabric_id ?? ''),
            fabric_color_id: toStringValueFromUnknown(shirtSpecPayload.fabric_color_id ?? ''),
            neck_style_id: toStringValueFromUnknown(shirtSpecPayload.neck_style_id ?? order.specification?.neck_style_id ?? ''),
            neck_color_id: toStringValueFromUnknown(shirtSpecPayload.neck_color_id ?? ''),
            collar_id: toStringValueFromUnknown(shirtSpecPayload.collar_id ?? ''),
            placket_style_id: toStringValueFromUnknown(shirtSpecPayload.placket_style_id ?? ''),
            placket_outer_color_id: toStringValueFromUnknown(shirtSpecPayload.placket_outer_color_id ?? ''),
            placket_inner_color_id: toStringValueFromUnknown(shirtSpecPayload.placket_inner_color_id ?? ''),
            sleeve_cuff_id: toStringValueFromUnknown(shirtSpecPayload.sleeve_cuff_id ?? ''),
            panel_style_id: toStringValueFromUnknown(shirtSpecPayload.panel_style_id ?? ''),
            screen_color_id: toStringValueFromUnknown(shirtSpecPayload.screen_color_id ?? ''),
            embroidery_color_id: toStringValueFromUnknown(shirtSpecPayload.embroidery_color_id ?? ''),
            sublimation_id: toStringValueFromUnknown(shirtSpecPayload.sublimation_id ?? ''),
            sleeve_style_text: toStringValueFromUnknown(shirtSpecPayload.sleeve_style_text ?? ''),
            piping_style_text: toStringValueFromUnknown(shirtSpecPayload.piping_style_text ?? ''),
            stripe_style_text: toStringValueFromUnknown(shirtSpecPayload.stripe_style_text ?? ''),
            screen_text: toStringValueFromUnknown(shirtSpecPayload.screen_text ?? ''),
            embroidery_code_text: toStringValueFromUnknown(shirtSpecPayload.embroidery_code_text ?? ''),
            embroidery_note_text: toStringValueFromUnknown(shirtSpecPayload.embroidery_note_text ?? ''),
        },
        pants_specs: {
            pants_type_id: toStringValueFromUnknown(pantsSpecPayload.pants_type_id ?? order.specification?.decoded?.pants_specs?.pants_type_id ?? args.resolvedPantsTypes[0]?.id ?? ''),
            pattern_id: toStringValueFromUnknown(pantsSpecPayload.pattern_id ?? ''),
            fabric_id: toStringValueFromUnknown(pantsSpecPayload.fabric_id ?? ''),
            fabric_color_id: toStringValueFromUnknown(pantsSpecPayload.fabric_color_id ?? ''),
            leg_style_id: toStringValueFromUnknown(pantsSpecPayload.leg_style_id ?? ''),
            leg_cuff_id: toStringValueFromUnknown(pantsSpecPayload.leg_cuff_id ?? ''),
            screen_color_id: toStringValueFromUnknown(pantsSpecPayload.screen_color_id ?? ''),
            embroidery_color_id: toStringValueFromUnknown(pantsSpecPayload.embroidery_color_id ?? ''),
            sublimation_id: toStringValueFromUnknown(pantsSpecPayload.sublimation_id ?? ''),
            panel_style_text: toStringValueFromUnknown(pantsSpecPayload.panel_style_text ?? ''),
            stripe_style_text: toStringValueFromUnknown(pantsSpecPayload.stripe_style_text ?? ''),
            screen_text: toStringValueFromUnknown(pantsSpecPayload.screen_text ?? ''),
            embroidery_code_text: toStringValueFromUnknown(pantsSpecPayload.embroidery_code_text ?? ''),
            embroidery_note_text: toStringValueFromUnknown(pantsSpecPayload.embroidery_note_text ?? ''),
        },
        sports_day_groups: savedSportsDayGroups.length > 0 ? savedSportsDayGroups : [createSportsDayGroup()],
        size_tables: order ? (matrixTables.length > 0 ? matrixTables : []) : [defaultSizeTable],
        personalization_rows: mappedPersonalizationRows,
        individual_include_pants: specPayload.individual_include_pants === true,
        line_items: items.map((item) => ({
            quantity: Math.max(1, toNumberValue(item.quantity)),
            unit_price: toNumberValue(item.unit_price),
            discount_id: null,
        })),
    };
}

function resolveRoutingFlowByJobType(jobTypeName: string): string[] {
    const normalizedJobType = jobTypeName.trim().toLowerCase();
    const hasEmbroidery = normalizedJobType.includes('ปัก') || normalizedJobType.includes('embroider');
    const hasSublimation = normalizedJobType.includes('ซับ') || normalizedJobType.includes('sublimation');
    const hasScreenFlex =
        normalizedJobType.includes('สกรีน')
        || normalizedJobType.includes('screen')
        || normalizedJobType.includes('เฟล็ก')
        || normalizedJobType.includes('flex');

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

function UploadGallery({
    files,
    previewUrls,
    primaryArtworkSignature,
    onRemove,
}: {
    files: File[];
    previewUrls: string[];
    primaryArtworkSignature: string | null;
    onRemove: (index: number) => void;
}) {
    const visibleFiles = files.length > 0
        ? files
        : previewUrls.map((url, index) => ({
              name: `Saved artwork ${index + 1}`,
              size: 0,
              url,
          } as File & { url: string }));

    if (visibleFiles.length === 0 || previewUrls.length === 0 && files.length === 0) {
        return null;
    }

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleFiles.map((file, index) => {
                const normalizedPreview = previewUrls[index] ?? (file as File & { url?: string }).url ?? '';
                const displayName = file.name || `Saved artwork ${index + 1}`;
                const sizeKb = typeof file.size === 'number' && file.size > 0 ? Math.round(file.size / 1024).toLocaleString('th-TH') : 'URL';
                const isPrimary = files.length > 0 && artworkSignature(file) === primaryArtworkSignature;

                return (
                    <div key={`${displayName}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <div className="aspect-[16/10] bg-slate-100">
                            <img src={normalizedPreview} alt={displayName} className="h-full w-full object-cover" />
                        </div>
                        <div className="flex items-center gap-2 p-2.5">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-800">{displayName}</p>
                                {isPrimary ? (
                                    <p className="text-[11px] font-semibold text-emerald-700">รูปหลัก</p>
                                ) : null}
                                <p className="text-[11px] text-slate-500">{sizeKb} KB</p>
                            </div>
                            {files.length > 0 ? (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-8 text-slate-500 hover:text-rose-600"
                                    onClick={() => onRemove(index)}
                                >
                                    <X className="size-4" />
                                </Button>
                            ) : null}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function MultiArtworkUpload({
    title,
    inputId,
    files,
    previewUrls,
    error,
    onSelect,
    onRemove,
}: {
    title: string;
    inputId: string;
    files: File[];
    previewUrls: string[];
    error?: string;
    onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
    onRemove: (index: number) => void;
}) {
    // While there are newly-selected files pending upload, show those (they
    // can be removed before saving). Once none are pending, fall back to
    // whatever is already saved on the order — those can't be removed here,
    // same as the general Art Work / reference designs gallery above.
    const visibleFiles = files.length > 0
        ? files
        : previewUrls.map((url, index) => ({
              name: `Saved artwork ${index + 1}`,
              size: 0,
              url,
          } as File & { url: string }));

    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-xs font-semibold text-slate-700">{title}</p>

            {visibleFiles.length > 0 ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {visibleFiles.map((file, index) => {
                        const previewUrl = previewUrls[index] ?? (file as File & { url?: string }).url ?? '';
                        const displayName = file.name || `Saved artwork ${index + 1}`;
                        const sizeKb = typeof file.size === 'number' && file.size > 0 ? Math.round(file.size / 1024).toLocaleString('th-TH') : null;

                        return (
                            <div key={`${displayName}-${index}`} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                                <div className="aspect-square bg-slate-100">
                                    <img src={previewUrl} alt={displayName} className="h-full w-full object-cover" />
                                </div>
                                <div className="flex items-center justify-between gap-1 p-1.5">
                                    <p className="truncate text-[10px] text-slate-500">{sizeKb ? `${sizeKb} KB` : 'รูปที่บันทึกไว้'}</p>
                                    {files.length > 0 ? (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="size-6 shrink-0 text-slate-500 hover:text-rose-600"
                                            onClick={() => onRemove(index)}
                                        >
                                            <X className="size-3.5" />
                                        </Button>
                                    ) : null}
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
                <input id={inputId} type="file" accept="image/*" multiple className="hidden" onChange={onSelect} />
                <label
                    htmlFor={inputId}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                >
                    <Upload className="size-3.5" />
                    เพิ่มรูป (เลือกได้หลายไฟล์)
                </label>
            </div>
            {error ? <p className="mt-2 text-xs text-[#E21E26]">{error}</p> : null}
        </div>
    );
}

export default function OrderCreatePage({
    branches,
    jobTypes,
    shirtCatalogs,
    pantsCatalogs,
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
    const { currentTeam } = usePage<{ currentTeam?: { slug: string } | null }>().props;

    const [activeSpecTab, setActiveSpecTab] = useState<SpecTab>('shirt');
    const [isDragOverArtwork, setIsDragOverArtwork] = useState(false);
    // The saved mode decides which form an existing order reopens in. Without
    // this an edit would always land on Form 1 and silently discard whatever
    // the other modes had stored in the spec.
    const [sizeFormMode, setSizeFormMode] = useState<SizeFormMode>(() => {
        const savedMode = (order?.specification?.decoded as Record<string, unknown> | undefined)?.mode;

        return savedMode === 'individual' || savedMode === 'sports_day' ? savedMode : 'matrix';
    });
    const [artworkPreviewUrls, setArtworkPreviewUrls] = useState<string[]>([]);
    const [shirtArtworkPreviewUrls, setShirtArtworkPreviewUrls] = useState<string[]>([]);
    const [pantsArtworkPreviewUrls, setPantsArtworkPreviewUrls] = useState<string[]>([]);

    useEffect(() => {
        if (!order) {
            setArtworkPreviewUrls([]);
            setShirtArtworkPreviewUrls([]);
            setPantsArtworkPreviewUrls([]);
            return;
        }

        const previewList = [order.artwork_url, ...(order.reference_designs ?? [])].filter((url): url is string => Boolean(url));

        setArtworkPreviewUrls(previewList);
        setShirtArtworkPreviewUrls(order.shirt_artwork_urls ?? []);
        setPantsArtworkPreviewUrls(order.pants_artwork_urls ?? []);
    }, [order]);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const artworkUploadQueueRef = useRef<Promise<void>>(Promise.resolve());
    const [primaryArtworkSignature, setPrimaryArtworkSignature] = useState<string | null>(null);


    // Color values added inline from the order form (via MasterDataComboBox),
    // keyed by storage_key rather than by field, so a value added from one
    // field (e.g. pants fabric color) also shows up in every other field
    // backed by the same shared catalog (e.g. shirt fabric color).
    const [extraColorOptions, setExtraColorOptions] = useState<Record<string, OptionItem[]>>({});

    const handleColorOptionAdded = (storageKey: string, option: OptionItem) => {
        setExtraColorOptions((prev) => {
            const existing = prev[storageKey] ?? [];
            if (existing.some((item) => item.id === option.id)) {
                return prev;
            }

            return { ...prev, [storageKey]: [...existing, option] };
        });
    };

    const withExtraColorOptions = (source: keyof CatalogMap, baseOptions: OptionItem[]): OptionItem[] => {
        const storageKey = COLOR_FIELD_STORAGE_KEYS[source];
        const extra = storageKey ? (extraColorOptions[storageKey] ?? []) : [];

        if (extra.length === 0) {
            return baseOptions;
        }

        const merged = [...baseOptions];
        for (const item of extra) {
            if (!merged.some((existing) => existing.id === item.id)) {
                merged.push(item);
            }
        }

        return merged;
    };

    /** Same catalogs the dropdowns show, including colours added inline just now. */
    const withAllExtraColorOptions = (catalogs: CatalogMap): CatalogMap => {
        const merged: CatalogMap = { ...catalogs };

        Object.keys(SPEC_FIELD_CATALOG_SOURCE).forEach((field) => {
            const source = SPEC_FIELD_CATALOG_SOURCE[field];
            merged[source] = withExtraColorOptions(source, catalogs[source] ?? []);
        });

        return merged;
    };

    const resolvedBranches = branches ?? [];
    const resolvedJobTypes = jobTypes ?? [];
    const resolvedShirtCatalogs = shirtCatalogs ?? {};
    const resolvedPantsCatalogs = pantsCatalogs ?? {};
    const resolvedShirtTypes = shirtTypes ?? [];
    const resolvedPantsTypes = pantsTypes ?? [];

    const resolvedKidsSizes = kidsSizes ?? [];
    const resolvedAdultSizes = adultSizes ?? [];

    const defaultTableType: SizeTableType = resolvedKidsSizes.length > 0 ? 'kids' : 'adults';
    const defaultTableSizes = defaultTableType === 'kids' ? resolvedKidsSizes : resolvedAdultSizes;
    const defaultSizeTable = useMemo(
        () => createSizeTable(defaultTableType, defaultTableSizes),
        [defaultTableType, defaultTableSizes],
    );

    const initialFormData = useMemo(
        () => buildEditInitialFormData(order, {
            resolvedBranches,
            defaultBranchId,
            resolvedJobTypes,
            resolvedShirtTypes,
            resolvedPantsTypes,
            resolvedKidsSizes,
            resolvedAdultSizes,
        }),
        [order, resolvedBranches, defaultBranchId, resolvedJobTypes, resolvedShirtTypes, resolvedPantsTypes, resolvedKidsSizes, resolvedAdultSizes],
    );

    const { data, setData, post, put, processing, errors, transform } = useForm<OrderCreateFormData>(initialFormData);

    const selectedBranch = useMemo(
        () => resolvedBranches.find((branch) => String(branch.id) === data.branch_id) ?? null,
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

    useEffect(() => {
        if (data.artwork_files.length === 0) {
            if (order) {
                const previewList = [order.artwork_url, ...(order.reference_designs ?? [])].filter((url): url is string => Boolean(url));
                setArtworkPreviewUrls(previewList);
            } else {
                setArtworkPreviewUrls([]);
            }

            return;
        }

        const nextUrls = data.artwork_files.map((file) => URL.createObjectURL(file));

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setArtworkPreviewUrls(nextUrls);

        return () => {
            nextUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [data.artwork_files, order]);

    useEffect(() => {
        if (data.shirt_artwork_files.length === 0) {
            setShirtArtworkPreviewUrls(order?.shirt_artwork_urls ?? []);

            return;
        }

        const nextUrls = data.shirt_artwork_files.map((file) => URL.createObjectURL(file));

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShirtArtworkPreviewUrls(nextUrls);

        return () => {
            nextUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [data.shirt_artwork_files, order]);

    useEffect(() => {
        if (data.pants_artwork_files.length === 0) {
            setPantsArtworkPreviewUrls(order?.pants_artwork_urls ?? []);

            return;
        }

        const nextUrls = data.pants_artwork_files.map((file) => URL.createObjectURL(file));

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPantsArtworkPreviewUrls(nextUrls);

        return () => {
            nextUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [data.pants_artwork_files, order]);

    const matrixGrossAmount = useMemo(
        () => data.size_tables.flatMap((table) => table.rows).reduce((total, row) => total + rowTotal(row), 0),
        [data.size_tables],
    );

    const individualGrossAmount = useMemo(
        () => data.personalization_rows.reduce((total, row) => total + rowIndividualTotal(row, data.individual_include_pants), 0),
        [data.personalization_rows, data.individual_include_pants],
    );

    const sportsDayGrossAmount = useMemo(
        () => data.sports_day_groups.reduce((total, group) => total + sportsDayGroupTotal(group), 0),
        [data.sports_day_groups],
    );

    const grossAmount = sizeFormMode === 'matrix'
        ? matrixGrossAmount
        : sizeFormMode === 'sports_day'
            ? sportsDayGrossAmount
            : individualGrossAmount;
    const discountPercent = Math.max(Math.min(toNumber(data.discount_percent), 50), 0);
    const discountAmount = (grossAmount * discountPercent) / 100;
    const derivedLineItems = useMemo(
        () => {
            if (sizeFormMode === 'matrix') {
                return buildLineItemsFromMatrix(data.size_tables);
            }

            if (sizeFormMode === 'sports_day') {
                return buildLineItemsFromSportsDay(data.sports_day_groups);
            }

            return buildLineItemsFromIndividual(data.personalization_rows, data.individual_include_pants);
        },
        [sizeFormMode, data.size_tables, data.sports_day_groups, data.personalization_rows, data.individual_include_pants],
    );

    const netAmount = Math.max(grossAmount - discountAmount, 0);
    const remainingAmount = Math.max(netAmount - data.deposit_amount, 0);
    const sizeOptionsByGroup = useMemo(
        () => ({
            kids: resolvedKidsSizes,
            adults: resolvedAdultSizes,
        }),
        [resolvedKidsSizes, resolvedAdultSizes],
    );

    const updateShirtSpecs = <K extends keyof ShirtSpecsForm>(key: K, value: ShirtSpecsForm[K]) => {
        setData('shirt_specs', {
            ...data.shirt_specs,
            [key]: value,
        });
    };

    const updatePantsSpecs = <K extends keyof PantsSpecsForm>(key: K, value: PantsSpecsForm[K]) => {
        setData('pants_specs', {
            ...data.pants_specs,
            [key]: value,
        });
    };

    const appendArtworkFiles = (nextFiles: File[]) => {
        if (nextFiles.length === 0) {
            return;
        }

        setData((previous) => ({
            ...previous,
            // Keep newly uploaded files in front so the latest upload is the primary artwork.
            artwork_files: [...nextFiles, ...previous.artwork_files],
        }));
        setPrimaryArtworkSignature(artworkSignature(nextFiles[0]));
    };

    const queueArtworkUpload = (selectedFiles: File[], mode: SizeFormMode) => {
        if (selectedFiles.length === 0) {
            return;
        }

        artworkUploadQueueRef.current = artworkUploadQueueRef.current
            .catch(() => undefined)
            .then(async () => {
                const compressedFiles = await Promise.all(selectedFiles.map((file) => compressImage(file)));

                if (mode === 'individual') {
                    const latestFile = compressedFiles[compressedFiles.length - 1] ?? null;

                    if (!latestFile) {
                        return;
                    }

                    setData((previous) => ({
                        ...previous,
                        artwork_files: [latestFile],
                    }));
                    setPrimaryArtworkSignature(artworkSignature(latestFile));

                    return;
                }

                appendArtworkFiles(compressedFiles);
            });
    };

    const updateSizeRow = <K extends keyof SizeRowForm>(
        tableId: string,
        rowId: string,
        key: K,
        value: SizeRowForm[K],
    ) => {
        setData(
            'size_tables',
            data.size_tables.map((table) =>
                table.id === tableId
                    ? {
                          ...table,
                          rows: table.rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)),
                      }
                    : table,
            ),
        );
    };

    // ---- Form 3 (กีฬาสี) handlers ----

    const updateSportsDayGroups = (groups: SportsDayGroupForm[]) => {
        setData('sports_day_groups', groups);
    };

    const patchSportsDayGroup = (groupId: string, patch: Partial<SportsDayGroupForm>) => {
        updateSportsDayGroups(data.sports_day_groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)));
    };

    const patchSportsDayRow = (groupId: string, rowId: string, patch: Partial<SportsDayRowForm>) => {
        updateSportsDayGroups(
            data.sports_day_groups.map((group) =>
                group.id === groupId
                    ? { ...group, rows: group.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)) }
                    : group,
            ),
        );
    };

    const addSportsDayArtwork = (groupId: string, selectedFiles: File[]) => {
        if (selectedFiles.length === 0) {
            return;
        }

        void Promise.all(selectedFiles.map((file) => compressImage(file))).then((compressed) => {
            setData((previous) => ({
                ...previous,
                sports_day_groups: previous.sports_day_groups.map((group) =>
                    group.id === groupId ? { ...group, artwork_files: [...group.artwork_files, ...compressed] } : group,
                ),
            }));
        });
    };

    const removeSportsDayArtwork = (groupId: string, fileIndex: number) => {
        updateSportsDayGroups(
            data.sports_day_groups.map((group) =>
                group.id === groupId
                    ? { ...group, artwork_files: group.artwork_files.filter((_, index) => index !== fileIndex) }
                    : group,
            ),
        );
    };

    const addSportsDayGroup = () => {
        updateSportsDayGroups([...data.sports_day_groups, createSportsDayGroup()]);
    };

    const removeSportsDayGroup = (groupId: string) => {
        if (data.sports_day_groups.length <= 1) {
            return;
        }

        updateSportsDayGroups(data.sports_day_groups.filter((group) => group.id !== groupId));
    };

    const addSportsDayRow = (groupId: string) => {
        updateSportsDayGroups(
            data.sports_day_groups.map((group) =>
                group.id === groupId ? { ...group, rows: [...group.rows, createSportsDayRow()] } : group,
            ),
        );
    };

    const removeSportsDayRow = (groupId: string, rowId: string) => {
        updateSportsDayGroups(
            data.sports_day_groups.map((group) =>
                group.id === groupId && group.rows.length > 1
                    ? { ...group, rows: group.rows.filter((row) => row.id !== rowId) }
                    : group,
            ),
        );
    };

    /** Copies the first row's prices down the rest of the table — the common case. */
    const applySportsDayPricesToAllRows = (groupId: string) => {
        updateSportsDayGroups(
            data.sports_day_groups.map((group) => {
                if (group.id !== groupId) {
                    return group;
                }

                const first = group.rows[0];

                if (!first) {
                    return group;
                }

                return {
                    ...group,
                    rows: group.rows.map((row) => ({ ...row, shirt_price: first.shirt_price, pants_price: first.pants_price })),
                };
            }),
        );
    };

    const addSizeTable = (tableType: SizeTableType) => {
        const sizeSource = tableType === 'kids' ? resolvedKidsSizes : resolvedAdultSizes;

        setData('size_tables', [...data.size_tables, createSizeTable(tableType, sizeSource)]);
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
                          rows: [...table.rows, createSizeRow('ระบุไซส์')],
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
        setData(
            'personalization_rows',
            data.personalization_rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)),
        );
    };

    const addPersonalizationRow = () => {
        const defaultGroup: 'kids' | 'adults' = resolvedAdultSizes.length > 0 ? 'adults' : 'kids';

        setData('personalization_rows', [
            ...data.personalization_rows,
            {
                id: uid('person'),
                name: '',
                size_group: defaultGroup,
                size: '',
                number: '',
                quantity: 1,
                unit_price: 0,
                pants_size: '',
                pants_quantity: 0,
                pants_unit_price: 0,
            },
        ]);
    };

    const duplicatePersonalizationRow = (rowId: string) => {
        const source = data.personalization_rows.find((row) => row.id === rowId);

        if (!source) {
            return;
        }

        const duplicated: PersonalizationRowForm = {
            ...source,
            id: uid('person'),
        };

        setData('personalization_rows', [...data.personalization_rows, duplicated]);
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

    const handleArtworkSelect = (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? []);

        if (selectedFiles.length === 0) {
            return;
        }

        queueArtworkUpload(selectedFiles, sizeFormMode);
        event.target.value = '';
    };

    const removeArtworkAt = (index: number) => {
        setData((previous) => {
            const updatedArtworkFiles = previous.artwork_files.filter((_, currentIndex) => currentIndex !== index);

            if (updatedArtworkFiles.length === 0) {
                setPrimaryArtworkSignature(null);
            } else {
                const stillHasPrimary = updatedArtworkFiles.some((file) => artworkSignature(file) === primaryArtworkSignature);

                if (!stillHasPrimary) {
                    setPrimaryArtworkSignature(artworkSignature(updatedArtworkFiles[0]));
                }
            }

            return {
                ...previous,
                artwork_files: updatedArtworkFiles,
            };
        });
    };

    const handleShirtArtworkSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? []);

        if (selectedFiles.length === 0) {
            return;
        }

        const compressedFiles = await Promise.all(selectedFiles.map((file) => compressImage(file)));

        setData((previous) => ({
            ...previous,
            shirt_artwork_files: [...previous.shirt_artwork_files, ...compressedFiles],
        }));
        event.target.value = '';
    };

    const removeShirtArtworkAt = (index: number) => {
        setData((previous) => ({
            ...previous,
            shirt_artwork_files: previous.shirt_artwork_files.filter((_, currentIndex) => currentIndex !== index),
        }));
    };

    const handlePantsArtworkSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? []);

        if (selectedFiles.length === 0) {
            return;
        }

        const compressedFiles = await Promise.all(selectedFiles.map((file) => compressImage(file)));

        setData((previous) => ({
            ...previous,
            pants_artwork_files: [...previous.pants_artwork_files, ...compressedFiles],
        }));
        event.target.value = '';
    };

    const removePantsArtworkAt = (index: number) => {
        setData((previous) => ({
            ...previous,
            pants_artwork_files: previous.pants_artwork_files.filter((_, currentIndex) => currentIndex !== index),
        }));
    };

    const validateForm = () => {
        const missing: string[] = [];

        if (!data.job_name.trim()) {
            missing.push('ชื่องาน');
        }

        if (!data.customer_name.trim()) {
            missing.push('ชื่อลูกค้า');
        }

        if (!data.billing_date) {
            missing.push('วันที่เปิดบิล');
        }

        if (!data.billing_time) {
            missing.push('เวลาเปิดบิล');
        }

        if (!data.due_date) {
            missing.push('วันที่รับสินค้า');
        }

        if (!data.branch_id) {
            missing.push('สาขา');
        }

        const requestItems = resolveRequestItems(sizeFormMode, data.size_tables, data.sports_day_groups, data.personalization_rows, data.individual_include_pants);

        if (requestItems.length === 0) {
            missing.push('จำนวนและราคาสินค้าอย่างน้อย 1 รายการ');
        }

        // Scoped to Form 1: the other modes keep their own (hidden) size_tables
        // state, and an untouched hidden table must not block their submit.
        if (sizeFormMode === 'matrix') {
            if (data.size_tables.some((table) => table.rows.some((row) => !row.size_label))) {
                missing.push('ไซส์ในตารางเลือกไซซ์');
            }

            if (data.size_tables.some((table) => table.rows.some((row) => row.size_label.length > SIZE_LABEL_MAX_LENGTH))) {
                missing.push(`ไซส์ต้องไม่เกิน ${SIZE_LABEL_MAX_LENGTH} ตัวอักษร`);
            }
        }

        if (sizeFormMode === 'sports_day') {
            if (data.sports_day_groups.some((group) => group.team_name.trim() === '')) {
                missing.push('ชื่อคณะสี');
            }

            const rowsWithQuantity = data.sports_day_groups.flatMap((group) =>
                group.rows.filter((row) => row.shirt_qty > 0 || row.pants_qty > 0),
            );

            if (rowsWithQuantity.some((row) => !row.size_label)) {
                missing.push('ไซซ์ในตารางคณะสี');
            }

            if (rowsWithQuantity.some((row) => row.size_label.length > SIZE_LABEL_MAX_LENGTH)) {
                missing.push(`ไซส์ต้องไม่เกิน ${SIZE_LABEL_MAX_LENGTH} ตัวอักษร`);
            }

            if (rowsWithQuantity.some((row) => (row.shirt_qty > 0 && row.shirt_price <= 0) || (row.pants_qty > 0 && row.pants_price <= 0))) {
                missing.push('ราคาของรายการที่กรอกจำนวนไว้');
            }
        }

        if (sizeFormMode === 'individual') {
            const hasPersonalization = data.personalization_rows.some((row) => row.name.trim() && row.size.trim() && row.number.trim());

            if (data.personalization_rows.some((row) => row.size.length > SIZE_LABEL_MAX_LENGTH)) {
                missing.push(`ไซส์ต้องไม่เกิน ${SIZE_LABEL_MAX_LENGTH} ตัวอักษร`);
            }

            if (!hasPersonalization) {
                missing.push('ข้อมูลรายตัวในฟอร์มรายตัว');
            }
        } else if (activeSpecTab === 'shirt') {
            const requiredShirtFields = [
                data.shirt_specs.shirt_type_id,
                data.shirt_specs.pattern_id,
                data.shirt_specs.fabric_id,
                data.shirt_specs.neck_style_id,
                data.shirt_specs.placket_style_id,
                data.shirt_specs.sleeve_style_text,
                data.shirt_specs.screen_text,
            ];

            if (requiredShirtFields.some((value) => !String(value).trim())) {
                missing.push('รายละเอียดสเปกแบบเสื้อ');
            }
        } else {
            const requiredPantsFields = [
                data.pants_specs.pants_type_id,
                data.pants_specs.pattern_id,
                data.pants_specs.fabric_id,
                data.pants_specs.leg_style_id,
                data.pants_specs.leg_cuff_id,
                data.pants_specs.screen_text,
            ];

            if (requiredPantsFields.some((value) => !String(value).trim())) {
                missing.push('รายละเอียดสเปกแบบกางเกง');
            }
        }

        return missing;
    };

    const handleSubmitClick = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const missing = validateForm();
        setValidationErrors(missing);

        if (missing.length > 0) {
            setShowValidationModal(true);

            return;
        }

        setShowConfirmModal(true);
    };

    const submit = () => {
        const selectedJobType = resolvedJobTypes.find((item) => String(item.id) === data.job_type_id)?.name ?? data.job_name;
        const requestItems = resolveRequestItems(sizeFormMode, data.size_tables, data.sports_day_groups, data.personalization_rows, data.individual_include_pants);

        if (requestItems.length === 0) {
            setValidationErrors(['จำนวนและราคาสินค้าอย่างน้อย 1 รายการ']);
            setShowValidationModal(true);

            return;
        }

        const isEditing = Boolean(order?.id);
        const normalizedDueDate = data.due_date && data.due_date >= data.billing_date ? data.due_date : data.billing_date;
        const activeSpecValues = activeSpecTab === 'pants' ? data.pants_specs : data.shirt_specs;
        const screenPrintDetail = JSON.stringify({
            schema: 'spec-v2',
            mode: sizeFormMode,
            shirt_specs: data.shirt_specs,
            pants_specs: data.pants_specs,
            // The master-data names as they read at the moment of saving.
            spec_labels: {
                shirt: snapshotSpecLabels(data.shirt_specs, withAllExtraColorOptions(resolvedShirtCatalogs)),
                pants: snapshotSpecLabels(data.pants_specs, withAllExtraColorOptions(resolvedPantsCatalogs)),
            },
            sports_day_groups: sizeFormMode === 'sports_day'
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
            individual_include_pants: sizeFormMode === 'individual' ? data.individual_include_pants : false,
            personalization_rows: sizeFormMode === 'individual'
                ? data.personalization_rows.map((row) => ({
                      name: row.name.trim(),
                      size: row.size.trim(),
                      number: row.number.trim(),
                      quantity: Math.max(row.quantity, 1),
                      unit_price: Math.max(row.unit_price, 0),
                      pants_size: data.individual_include_pants ? row.pants_size.trim() : '',
                      pants_quantity: data.individual_include_pants ? Math.max(row.pants_quantity, 0) : 0,
                      pants_unit_price: data.individual_include_pants ? Math.max(row.pants_unit_price, 0) : 0,
                      total_price: rowIndividualTotal(row, data.individual_include_pants),
                  }))
                : [],
        });
        const fallbackCustomerName = sizeFormMode === 'individual'
            ? data.personalization_rows.map((row) => row.name.trim()).find((name) => name !== '') ?? ''
            : '';
        const customerName = data.customer_name.trim() || fallbackCustomerName;

        const routings = resolveRoutingFlowByJobType(selectedJobType);

        transform((payload) => ({
            ...(() => {
                const primaryIndex = payload.artwork_files.findIndex((file) => artworkSignature(file) === primaryArtworkSignature);
                const resolvedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0;
                const primaryArtwork = payload.artwork_files[resolvedPrimaryIndex] ?? null;
                const referenceDesigns = payload.artwork_files.filter((_, index) => index !== resolvedPrimaryIndex);

                return {
                    design_artwork: primaryArtwork,
                    shirt_artwork: payload.shirt_artwork_files,
                    pants_artwork: payload.pants_artwork_files,
                    reference_designs: referenceDesigns,
                };
            })(),
            duplicate_from_id: order?.duplicate_from_id ?? null,
            // Keyed by colour house index so the server can tag each file with
            // the house it belongs to. Only Form 3 ever sends this.
            sports_day_artwork: sizeFormMode === 'sports_day'
                ? Object.fromEntries(
                      data.sports_day_groups
                          .map((group, index) => [index, group.artwork_files] as const)
                          .filter(([, files]) => files.length > 0),
                  )
                : {},
            customer_id: payload.customer_id ? Number(payload.customer_id) : null,
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
                pattern_id: activeSpecValues.pattern_id ? Number(activeSpecValues.pattern_id) : null,
                fabric_id: activeSpecValues.fabric_id ? Number(activeSpecValues.fabric_id) : null,
                neck_style_id: payload.shirt_specs.neck_style_id ? Number(payload.shirt_specs.neck_style_id) : null,
                collar_color: payload.shirt_specs.neck_color_id || null,
                leg_style: payload.pants_specs.leg_style_id || null,
                leg_hem: payload.pants_specs.leg_cuff_id || null,
                placket_style: payload.shirt_specs.placket_style_id || null,
                placket_color: payload.shirt_specs.placket_outer_color_id || null,
                sleeve_style: payload.shirt_specs.sleeve_style_text || null,
                sleeve_hem: payload.shirt_specs.sleeve_cuff_id || null,
                sublimation_detail: payload.shirt_specs.sublimation_id || payload.pants_specs.sublimation_id || null,
                screen_print_detail: screenPrintDetail,
                embroidery_code: payload.shirt_specs.embroidery_code_text || payload.pants_specs.embroidery_code_text || null,
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

    const shirtSelectFields: Array<{ label: string; key: keyof ShirtSpecsForm; source: keyof CatalogMap }> = [
        { label: 'แพทเทิร์น', key: 'pattern_id', source: 'patterns' },
        { label: 'เนื้อผ้า', key: 'fabric_id', source: 'fabrics' },
        { label: 'สีผ้า', key: 'fabric_color_id', source: 'fabric_colors' },
        { label: 'แบบคอ', key: 'neck_style_id', source: 'neck_styles' },
        { label: 'สีแบบคอ', key: 'neck_color_id', source: 'neck_colors' },
        { label: 'ปก', key: 'collar_id', source: 'collars' },
        { label: 'แบบสาบ', key: 'placket_style_id', source: 'placket_styles' },
        { label: 'สีสาบ (นอก)', key: 'placket_outer_color_id', source: 'placket_outer_colors' },
        { label: 'สีสาบ (ใน)', key: 'placket_inner_color_id', source: 'placket_inner_colors' },
        { label: 'ปลายแขน', key: 'sleeve_cuff_id', source: 'sleeve_cuffs' },
        { label: 'แบบต่อ', key: 'panel_style_id', source: 'panel_styles' },
        { label: 'สีสกรีน', key: 'screen_color_id', source: 'screen_colors' },
        { label: 'สีงานปัก', key: 'embroidery_color_id', source: 'embroidery_colors' },
        { label: 'ซับลิเมชั่น', key: 'sublimation_id', source: 'sublimations' },
    ];

    const pantsSelectFields: Array<{ label: string; key: keyof PantsSpecsForm; source: keyof CatalogMap }> = [
        { label: 'แพทเทิร์น', key: 'pattern_id', source: 'patterns' },
        { label: 'เนื้อผ้า', key: 'fabric_id', source: 'fabrics' },
        { label: 'สีผ้า', key: 'fabric_color_id', source: 'fabric_colors' },
        { label: 'แบบขา', key: 'leg_style_id', source: 'leg_styles' },
        { label: 'ปลายขา', key: 'leg_cuff_id', source: 'leg_cuffs' },
        { label: 'สีสกรีน', key: 'screen_color_id', source: 'screen_colors' },
        { label: 'สีงานปัก', key: 'embroidery_color_id', source: 'embroidery_colors' },
        { label: 'ซับลิเมชั่น', key: 'sublimation_id', source: 'sublimations' },
    ];

    const isEditing = Boolean(order?.id);
    const orderCodeLabel = order?.order_code ?? `#${order?.id ?? ''}`;
    const submittingLabel = isCompressing
        ? 'กำลังบีบอัดรูปภาพ...'
        : processing
            ? (isEditing ? 'กำลังบันทึกการแก้ไข...' : 'กำลังบันทึกใบสั่งผลิต...')
            : (isEditing ? 'บันทึกการแก้ไข' : 'บันทึกใบสั่งผลิต');
    const formErrors = errors as Record<string, string | undefined>;
    const generalArtworkError = formErrors.design_artwork ?? formErrors['reference_designs.0'];
    const shirtArtworkError = formErrors.shirt_artwork ?? formErrors['shirt_artwork.0'];
    const pantsArtworkError = formErrors.pants_artwork ?? formErrors['pants_artwork.0'];

    return (
        <>
            <Head title={isEditing ? `แก้ไขออร์เดอร์ ${orderCodeLabel}` : 'เปิดบิลคำสั่งผลิตใหม่'} />

            <>
                <Dialog open={showValidationModal} onOpenChange={setShowValidationModal}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>กรอกข้อมูลให้ครบก่อนบันทึก</DialogTitle>
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
                            <Button type="button" onClick={() => setShowValidationModal(false)}>
                                ปิด
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>{isEditing ? 'ยืนยันการบันทึกการแก้ไข' : 'ยืนยันการบันทึกคำสั่งผลิต'}</DialogTitle>
                            <DialogDescription>
                                {isEditing
                                    ? 'ระบบจะบันทึกการแก้ไขออร์เดอร์นี้และอัปเดตข้อมูลล่าสุดทันที หลังจากยืนยันแล้วจะไม่สามารถย้อนกลับได้'
                                    : 'ระบบจะบันทึกคำสั่งผลิตนี้และส่งข้อมูลไปยังกระบวนการต่อไปทันที หลังจากยืนยันแล้วจะไม่สามารถย้อนกลับได้'}
                            </DialogDescription>
                        </DialogHeader>

                        <DialogFooter className="gap-2">
                            <Button type="button" variant="outline" onClick={() => setShowConfirmModal(false)}>
                                ยกเลิก
                            </Button>
                            <Button
                                type="button"
                                className="bg-gradient-to-r from-[#E21E26] to-[#C91820] text-white hover:from-[#C91820] hover:to-[#B5151C]"
                                onClick={submit}
                            >
                                {isEditing ? 'ยืนยันและบันทึกการแก้ไข' : 'ยืนยันและบันทึก'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={showCancelConfirmModal} onOpenChange={setShowCancelConfirmModal}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>ยืนยันการยกเลิก</DialogTitle>
                            <DialogDescription>
                                คุณต้องการยกเลิกการแก้ไขออร์เดอร์นี้หรือไม่ หากยืนยัน ระบบจะกลับไปที่หน้าเคาน์เตอร์ทันที
                            </DialogDescription>
                        </DialogHeader>

                        <DialogFooter className="gap-2">
                            <Button type="button" variant="outline" onClick={() => setShowCancelConfirmModal(false)}>
                                ไม่ใช่
                            </Button>
                            <Button
                                type="button"
                                className="bg-slate-900 text-white hover:bg-slate-800"
                                onClick={() => {
                                    setShowCancelConfirmModal(false);
                                    const counterRoute = currentTeam?.slug ? `/${currentTeam.slug}/counter` : '/counter';
                                    router.visit(counterRoute);
                                }}
                            >
                                ตกลง
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <form onSubmit={handleSubmitClick} className="min-h-screen bg-slate-100 pb-12">
                <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-xs">
                    <h1 className="text-base font-semibold text-slate-900 md:text-lg">
                        {isEditing ? `แก้ไขออร์เดอร์ ${orderCodeLabel}` : 'เปิดบิลคำสั่งผลิตใหม่'}
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
                            {(processing || isCompressing) ? <Loader2 className="size-4 animate-spin" /> : null}
                            {submittingLabel}
                        </Button>
                    </div>
                </header>

                <div className="mx-auto mt-4 w-full max-w-[1720px] px-4 md:px-6">
                    <div className="grid gap-4 xl:grid-cols-5">
                        <div className="space-y-4 xl:col-span-2">
                            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <h2 className="mb-3 text-sm font-bold text-slate-900">Art Work ทั่วไปของออร์เดอร์ และสถานะงาน</h2>

                                <div className="mb-3">
                                    <UploadGallery
                                        files={data.artwork_files}
                                        previewUrls={artworkPreviewUrls}
                                        primaryArtworkSignature={primaryArtworkSignature}
                                        onRemove={removeArtworkAt}
                                    />
                                </div>

                                <label
                                    className={`block rounded-lg border-2 border-dashed p-3 text-center transition-colors ${
                                        isDragOverArtwork ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50/60'
                                    }`}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        setIsDragOverArtwork(true);
                                    }}
                                    onDragLeave={() => setIsDragOverArtwork(false)}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        setIsDragOverArtwork(false);
                                        const droppedFiles = Array.from(event.dataTransfer.files ?? []);

                                        if (droppedFiles.length === 0) {
                                            return;
                                        }

                                        queueArtworkUpload(droppedFiles, sizeFormMode);
                                    }}
                                >
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(event) => {
                                            void handleArtworkSelect(event);
                                        }}
                                    />
                                    <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                        <Upload className="size-3.5" />
                                        เลือกไฟล์ Art Work ทั่วไป
                                    </div>
                                    <p className="mt-1 text-[11px] text-slate-500">รองรับหลายรูป ลากไฟล์วางหรือคลิกเพื่อเลือกไฟล์</p>
                                    <p className="mt-1 text-[11px] text-slate-500">รูปซ้ายสุด (รูปหลัก) จะถูกใช้กับออเดอร์ และใน Form 2 ระบบจะใช้รูปล่าสุดเพียงรูปเดียว</p>
                                </label>
                                {generalArtworkError ? <p className="mt-2 text-xs text-[#E21E26]">{generalArtworkError}</p> : null}

                                <div className="mt-4 grid gap-1.5 text-xs">
                                    <span className="font-semibold text-slate-600">สถานะแบบ</span>
                                    <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700">
                                        คอนเฟิร์มแบบ
                                    </div>
                                    <div className="pt-1">
                                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">คอนเฟิร์มแบบ</Badge>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <h2 className="mb-3 text-sm font-bold text-slate-900">ข้อมูลทั่วไป, ลูกค้า, การจัดส่ง และการเงิน</h2>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">ประเภทงาน</span>
                                        <Select value={data.job_type_id} onValueChange={(value) => setData('job_type_id', value)}>
                                            <SelectTrigger className="h-9 w-full bg-white text-xs">
                                                <SelectValue placeholder="เลือกประเภทงาน" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {resolvedJobTypes.map((item) => (
                                                    <SelectItem key={item.id} value={String(item.id)}>
                                                        {item.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </label>

                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">ชื่องาน</span>
                                        <Input
                                            value={data.job_name}
                                            onChange={(event) => setData('job_name', event.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </label>

                                    <div className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">วันที่เปิดบิล</span>
                                        <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700">
                                            <CalendarClock className="mr-2 size-3.5 text-blue-500" />
                                            {data.billing_date}
                                        </div>
                                    </div>

                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">วันที่รับสินค้า</span>
                                        <DeliveryDatePicker
                                            value={data.due_date}
                                            minDate={data.billing_date}
                                            dailyCapacity={dailyProductionCapacity}
                                            loads={deliveryDateLoads}
                                            onChange={(date) => setData('due_date', date)}
                                        />
                                    </label>
                                </div>

                                <div className="mt-3 grid gap-2">
                                    <span className="text-xs font-semibold text-slate-600">ช่องทางรับสินค้า</span>
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        {[
                                            { value: 'pickup', label: 'รับหน้าร้าน' },
                                            { value: 'shipping', label: 'ขนส่ง' },
                                            { value: 'onsite', label: 'หน้างาน' },
                                        ].map((item) => (
                                            <Button
                                                key={item.value}
                                                type="button"
                                                variant={data.delivery_method === item.value ? 'default' : 'outline'}
                                                className="h-8 text-xs"
                                                onClick={() => setData('delivery_method', item.value as DeliveryMethod)}
                                            >
                                                {item.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div
                                    className={`mt-3 overflow-hidden transition-all duration-200 ${
                                        data.delivery_method === 'shipping' || data.delivery_method === 'onsite' ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                                    }`}
                                >
                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">ที่อยู่จัดส่ง / หน้างาน</span>
                                        <textarea
                                            rows={3}
                                            value={data.shipping_address}
                                            onChange={(event) => setData('shipping_address', event.target.value)}
                                            className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                        />
                                    </label>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">ลูกค้า</span>
                                        <Input
                                            value={data.customer_name}
                                            onChange={(event) => setData('customer_name', event.target.value)}
                                            placeholder="กรอกชื่อลูกค้า"
                                            className="h-9 text-xs"
                                        />
                                    </label>

                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">สาขาที่เปิดบิล</span>
                                        <Input
                                            value={selectedBranch ? `${selectedBranch.code} - ${selectedBranch.name}` : 'ยังไม่พบข้อมูลสาขาในระบบ'}
                                            readOnly
                                            className="h-9 bg-slate-50 text-xs"
                                        />
                                    </label>

                                    <label className="grid gap-1.5 text-xs md:col-span-2">
                                        <span className="font-semibold text-slate-600">เบอร์ติดต่อ</span>
                                        <Input
                                            value={data.customer_phone}
                                            onChange={(event) => setData('customer_phone', event.target.value)}
                                            placeholder="กรอกเบอร์โทรลูกค้า"
                                            className="h-9 text-xs"
                                        />
                                    </label>

                                    <label className="grid gap-1.5 text-xs md:col-span-2">
                                        <span className="font-semibold text-slate-600">ข้อมูลการติดต่อ</span>
                                        <Input
                                            value={data.contact_detail}
                                            onChange={(event) => setData('contact_detail', event.target.value)}
                                            placeholder="เช่น LINE: @xxx หรือ Facebook: ..."
                                            className="h-9 text-xs"
                                        />
                                    </label>
                                </div>

                                <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                                    <h3 className="mb-2 text-xs font-bold text-slate-700">สรุปการเงินแบบเรียลไทม์</h3>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex items-center justify-between text-slate-600">
                                            <span>รวมเป็นเงิน</span>
                                            <span className="font-semibold text-slate-900">฿ {formatMoney(grossAmount)}</span>
                                        </div>

                                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                                            <span className="text-slate-600">ส่วนลด</span>
                                            <Select value={data.discount_percent} onValueChange={(value) => setData('discount_percent', value)}>
                                                <SelectTrigger className="h-8 w-full bg-white text-xs">
                                                    <SelectValue placeholder="เลือก % ส่วนลด" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {discountPercentOptions.map((percent) => (
                                                        <SelectItem key={percent} value={percent}>
                                                            {percent}%
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex items-center justify-between text-slate-600">
                                            <span>มูลค่าส่วนลด</span>
                                            <span className="font-semibold text-rose-600">- ฿ {formatMoney(discountAmount)}</span>
                                        </div>

                                        <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-slate-700">
                                            <span className="font-semibold">ยอดรวมหลังหักส่วนลด</span>
                                            <span className="text-sm font-bold text-slate-900">฿ {formatMoney(netAmount)}</span>
                                        </div>

                                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                                            <span className="text-slate-600">เงินที่จ่าย</span>
                                            <Input
                                                type="number"
                                                min={0}
                                                value={data.deposit_amount}
                                                onChange={(event) => setData('deposit_amount', toNumber(event.target.value))}
                                                className="h-8 bg-white text-xs"
                                            />
                                        </div>

                                        <div className="grid gap-2 border-t border-slate-200 pt-2">
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold text-slate-700">ยอดคงเหลือ</span>
                                                <span className="text-sm font-bold text-slate-900">฿ {formatMoney(remainingAmount)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
                            <h2 className="mb-3 text-sm font-bold text-slate-900">รายละเอียดสเปกงานตัดเย็บ</h2>

                            <div className="mb-4 flex flex-wrap gap-2 rounded-lg bg-slate-100 p-1.5">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={activeSpecTab === 'shirt' ? 'default' : 'ghost'}
                                    className="h-8 text-xs"
                                    onClick={() => setActiveSpecTab('shirt')}
                                >
                                    แบบเสื้อ 
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={activeSpecTab === 'pants' ? 'default' : 'ghost'}
                                    className="h-8 text-xs"
                                    onClick={() => setActiveSpecTab('pants')}
                                >
                                    แบบกางเกง 
                                </Button>
                            </div>

                            {activeSpecTab === 'shirt' ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="md:col-span-2">
                                        <MultiArtworkUpload
                                            title="Art Work เสื้อ"
                                            inputId="shirt-artwork-upload"
                                            files={data.shirt_artwork_files}
                                            previewUrls={shirtArtworkPreviewUrls}
                                            error={shirtArtworkError}
                                            onSelect={(event) => {
                                                void handleShirtArtworkSelect(event);
                                            }}
                                            onRemove={removeShirtArtworkAt}
                                        />
                                    </div>
                                    <label className="grid gap-1.5 text-xs md:col-span-2">
                                        <span className="font-semibold text-slate-600">แบบเสื้อ</span>
                                        <Select
                                            value={data.shirt_specs.shirt_type_id}
                                            onValueChange={(value) => updateShirtSpecs('shirt_type_id', value)}
                                        >
                                            <SelectTrigger className="h-9 w-full bg-white text-xs">
                                                <SelectValue placeholder="เลือกแบบเสื้อ" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {resolvedShirtTypes.map((item) => (
                                                    <SelectItem key={item.id} value={String(item.id)}>
                                                        {item.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </label>

                                    {shirtSelectFields.map((field) => {
                                        const options = withExtraColorOptions(field.source, resolvedShirtCatalogs[field.source] ?? []);
                                        const colorStorageKey = COLOR_FIELD_STORAGE_KEYS[field.source];

                                        return (
                                            <label key={field.key} className="grid gap-1.5 text-xs">
                                                <span className="font-semibold text-slate-600">{field.label}</span>
                                                {colorStorageKey ? (
                                                    <MasterDataComboBox
                                                        storageKey={colorStorageKey}
                                                        options={options}
                                                        value={data.shirt_specs[field.key]}
                                                        onValueChange={(value) => updateShirtSpecs(field.key, value)}
                                                        onOptionAdded={(option) => handleColorOptionAdded(colorStorageKey, option)}
                                                        placeholder={`เลือกหรือพิมพ์${field.label}`}
                                                        aria-label={field.label}
                                                    />
                                                ) : (
                                                    <Select
                                                        value={data.shirt_specs[field.key]}
                                                        onValueChange={(value) => updateShirtSpecs(field.key, value)}
                                                    >
                                                        <SelectTrigger className="h-9 w-full bg-white text-xs">
                                                            <SelectValue placeholder={`เลือก${field.label}`} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {options.map((item) => (
                                                                <SelectItem key={item.id} value={String(item.id)}>
                                                                    {item.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </label>
                                        );
                                    })}

                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">แบบแขน</span>
                                        <Input
                                            value={data.shirt_specs.sleeve_style_text}
                                            onChange={(event) => updateShirtSpecs('sleeve_style_text', event.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </label>
                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">แบบกุ้น</span>
                                        <Input
                                            value={data.shirt_specs.piping_style_text}
                                            onChange={(event) => updateShirtSpecs('piping_style_text', event.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </label>
                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">แบบลา</span>
                                        <Input
                                            value={data.shirt_specs.stripe_style_text}
                                            onChange={(event) => updateShirtSpecs('stripe_style_text', event.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </label>
                                    <label className="grid gap-1.5 text-xs md:col-span-2">
                                        <span className="font-semibold text-slate-600">ข้อความสกรีน</span>
                                        <Input
                                            value={data.shirt_specs.screen_text}
                                            onChange={(event) => updateShirtSpecs('screen_text', event.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </label>
                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">รหัสงานปัก</span>
                                        <Input
                                            value={data.shirt_specs.embroidery_code_text}
                                            onChange={(event) => updateShirtSpecs('embroidery_code_text', event.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </label>
                                    <label className="grid gap-1.5 text-xs md:col-span-2">
                                        <span className="font-semibold text-slate-600">รายละเอียดปัก</span>
                                        <textarea
                                            rows={3}
                                            value={data.shirt_specs.embroidery_note_text}
                                            onChange={(event) => updateShirtSpecs('embroidery_note_text', event.target.value)}
                                            className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                        />
                                    </label>
                                </div>
                            ) : (
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="md:col-span-2">
                                        <MultiArtworkUpload
                                            title="Art Work กางเกง"
                                            inputId="pants-artwork-upload"
                                            files={data.pants_artwork_files}
                                            previewUrls={pantsArtworkPreviewUrls}
                                            error={pantsArtworkError}
                                            onSelect={(event) => {
                                                void handlePantsArtworkSelect(event);
                                            }}
                                            onRemove={removePantsArtworkAt}
                                        />
                                    </div>
                                    <label className="grid gap-1.5 text-xs md:col-span-2">
                                        <span className="font-semibold text-slate-600">แบบกางเกง</span>
                                        <Select
                                            value={data.pants_specs.pants_type_id}
                                            onValueChange={(value) => updatePantsSpecs('pants_type_id', value)}
                                        >
                                            <SelectTrigger className="h-9 w-full bg-white text-xs">
                                                <SelectValue placeholder="เลือกแบบกางเกง" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {resolvedPantsTypes.map((item) => (
                                                    <SelectItem key={item.id} value={String(item.id)}>
                                                        {item.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </label>

                                    {pantsSelectFields.map((field) => {
                                        const options = withExtraColorOptions(field.source, resolvedPantsCatalogs[field.source] ?? []);
                                        const colorStorageKey = COLOR_FIELD_STORAGE_KEYS[field.source];

                                        return (
                                            <label key={field.key} className="grid gap-1.5 text-xs">
                                                <span className="font-semibold text-slate-600">{field.label}</span>
                                                {colorStorageKey ? (
                                                    <MasterDataComboBox
                                                        storageKey={colorStorageKey}
                                                        options={options}
                                                        value={data.pants_specs[field.key]}
                                                        onValueChange={(value) => updatePantsSpecs(field.key, value)}
                                                        onOptionAdded={(option) => handleColorOptionAdded(colorStorageKey, option)}
                                                        placeholder={`เลือกหรือพิมพ์${field.label}`}
                                                        aria-label={field.label}
                                                    />
                                                ) : (
                                                    <Select
                                                        value={data.pants_specs[field.key]}
                                                        onValueChange={(value) => updatePantsSpecs(field.key, value)}
                                                    >
                                                        <SelectTrigger className="h-9 w-full bg-white text-xs">
                                                            <SelectValue placeholder={`เลือก${field.label}`} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {options.map((item) => (
                                                                <SelectItem key={item.id} value={String(item.id)}>
                                                                    {item.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </label>
                                        );
                                    })}

                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">แบบต่อ</span>
                                        <Input
                                            value={data.pants_specs.panel_style_text}
                                            onChange={(event) => updatePantsSpecs('panel_style_text', event.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </label>
                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">แบบลา</span>
                                        <Input
                                            value={data.pants_specs.stripe_style_text}
                                            onChange={(event) => updatePantsSpecs('stripe_style_text', event.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </label>
                                    <label className="grid gap-1.5 text-xs md:col-span-2">
                                        <span className="font-semibold text-slate-600">ข้อความสกรีน</span>
                                        <Input
                                            value={data.pants_specs.screen_text}
                                            onChange={(event) => updatePantsSpecs('screen_text', event.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </label>
                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">รหัสงานปัก</span>
                                        <Input
                                            value={data.pants_specs.embroidery_code_text}
                                            onChange={(event) => updatePantsSpecs('embroidery_code_text', event.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </label>
                                    <label className="grid gap-1.5 text-xs md:col-span-2">
                                        <span className="font-semibold text-slate-600">รายละเอียดปัก</span>
                                        <textarea
                                            rows={3}
                                            value={data.pants_specs.embroidery_note_text}
                                            onChange={(event) => updatePantsSpecs('embroidery_note_text', event.target.value)}
                                            className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                                    variant={sizeFormMode === 'matrix' ? 'default' : 'ghost'}
                                    className="h-8 text-xs"
                                    onClick={() => setSizeFormMode('matrix')}
                                >
                                    แพทเทรินเสื้อเหมือนกัน (Form 1)
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={sizeFormMode === 'individual' ? 'default' : 'ghost'}
                                    className="h-8 text-xs"
                                    onClick={() => setSizeFormMode('individual')}
                                >
                                    รายตัว (Form 2)
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={sizeFormMode === 'sports_day' ? 'default' : 'ghost'}
                                    className="h-8 text-xs"
                                    onClick={() => setSizeFormMode('sports_day')}
                                >
                                    กีฬาสี (Form 3)
                                </Button>
                            </div>
                        </div>

                        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-sm font-bold text-slate-900">ตารางเลือกไซซ์และราคา</h2>
                                <div className="flex flex-wrap items-center gap-2">
                                    {sizeFormMode === 'matrix' ? (
                                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => addSizeTable('kids')}>
                                        <Plus className="size-3.5" />
                                        เพิ่มตารางไซซ์เด็ก (Kids)
                                    </Button>
                                    ) : null}
                                    {sizeFormMode === 'matrix' ? (
                                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => addSizeTable('adults')}>
                                        <Plus className="size-3.5" />
                                        เพิ่มตารางไซซ์ผู้ใหญ่ (Adults)
                                    </Button>
                                    ) : null}
                                </div>
                            </div>

                            {sizeFormMode === 'matrix' ? <div className="space-y-4">
                                {data.size_tables.map((table) => {
                                    const tableSizeOptions = table.table_type === 'kids' ? resolvedKidsSizes : resolvedAdultSizes;
                                    const tableTotals = table.rows.reduce(
                                        (acc, row) => ({
                                            setShirtQty: acc.setShirtQty + row.set_shirt_qty,
                                            setPantsQty: acc.setPantsQty + row.set_pants_qty,
                                            setAmount: acc.setAmount + rowSetTotal(row),
                                            sepShirtQty: acc.sepShirtQty + row.separate_shirt_qty,
                                            sepPantsQty: acc.sepPantsQty + row.separate_pants_qty,
                                            sepAmount:
                                                acc.sepAmount +
                                                row.separate_shirt_qty * row.separate_shirt_price +
                                                row.separate_pants_qty * row.separate_pants_price,
                                            totalAmount: acc.totalAmount + rowTotal(row),
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
                                        <div key={table.id} className="overflow-hidden rounded-xl border border-slate-200">
                                            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <Shirt className="size-4 text-blue-600" />
                                                    <h3 className="text-xs font-bold text-slate-800">{table.title}</h3>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 px-2 text-xs"
                                                        onClick={() => addSizeRow(table.id)}
                                                    >
                                                        <Plus className="size-3.5" />
                                                        เพิ่มแถว
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                                                        onClick={() => removeSizeTable(table.id)}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                        ลบตาราง
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full min-w-[1280px] table-fixed border-collapse text-xs">
                                                    <thead>
                                                        <tr className="bg-slate-100 text-slate-700">
                                                            <th className="w-[10%] border border-slate-200 px-2 py-2">ไซซ์ (Size)</th>
                                                            <th className="w-[8%] border border-slate-200 px-2 py-2">เสื้อ (Qty)</th>
                                                            <th className="w-[8%] border border-slate-200 px-2 py-2">กางเกง (Qty)</th>
                                                            <th className="w-[10%] border border-slate-200 px-2 py-2">ราคาต่อชุด</th>
                                                            <th className="w-[12%] border border-slate-200 px-2 py-2">รวมต่อชุด</th>
                                                            <th className="w-[8%] border border-slate-200 px-2 py-2">เสื้อแยก (Qty)</th>
                                                            <th className="w-[8%] border border-slate-200 px-2 py-2">กางเกงแยก (Qty)</th>
                                                            <th className="w-[10%] border border-slate-200 px-2 py-2">ราคาเสื้อ</th>
                                                            <th className="w-[10%] border border-slate-200 px-2 py-2">ราคากางเกง</th>
                                                            <th className="w-[10%] border border-slate-200 px-2 py-2">รวมราคาแยกชุด</th>
                                                            <th className="w-[12%] border border-slate-200 px-2 py-2">ราคารวมแถว</th>
                                                            <th className="w-[4%] border border-slate-200 px-2 py-2 text-center">ลบ</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {table.rows.map((row) => (
                                                            <tr key={row.id} className="even:bg-slate-50/60">
                                                                <td className="border border-slate-200 px-1.5 py-1.5">
                                                                    <Select
                                                                        value={row.size_label}
                                                                        onValueChange={(value) => updateSizeRow(table.id, row.id, 'size_label', value)}
                                                                    >
                                                                        <SelectTrigger className="h-8 w-full bg-white text-xs">
                                                                            <SelectValue placeholder="เลือกไซซ์" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {tableSizeOptions.map((sizeOption) => (
                                                                                <SelectItem key={`${table.id}-${row.id}-${sizeOption}`} value={sizeOption}>
                                                                                    {sizeOption}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </td>
                                                                <td className="border border-slate-200 px-1.5 py-1.5">
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.set_shirt_qty}
                                                                        onChange={(event) =>
                                                                            updateSizeRow(
                                                                                table.id,
                                                                                row.id,
                                                                                'set_shirt_qty',
                                                                                toNumber(event.target.value),
                                                                            )
                                                                        }
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </td>
                                                                <td className="border border-slate-200 px-1.5 py-1.5">
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.set_pants_qty}
                                                                        onChange={(event) =>
                                                                            updateSizeRow(
                                                                                table.id,
                                                                                row.id,
                                                                                'set_pants_qty',
                                                                                toNumber(event.target.value),
                                                                            )
                                                                        }
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </td>
                                                                <td className="border border-slate-200 px-1.5 py-1.5">
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.set_price}
                                                                        onChange={(event) =>
                                                                            updateSizeRow(
                                                                                table.id,
                                                                                row.id,
                                                                                'set_price',
                                                                                toNumber(event.target.value),
                                                                            )
                                                                        }
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </td>
                                                                <td className="border border-slate-200 px-2 py-1.5 text-right font-semibold text-slate-700">
                                                                    {formatMoney(rowSetTotal(row))}
                                                                </td>
                                                                <td className="border border-slate-200 px-1.5 py-1.5">
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.separate_shirt_qty}
                                                                        onChange={(event) =>
                                                                            updateSizeRow(
                                                                                table.id,
                                                                                row.id,
                                                                                'separate_shirt_qty',
                                                                                toNumber(event.target.value),
                                                                            )
                                                                        }
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </td>
                                                                <td className="border border-slate-200 px-1.5 py-1.5">
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.separate_pants_qty}
                                                                        onChange={(event) =>
                                                                            updateSizeRow(
                                                                                table.id,
                                                                                row.id,
                                                                                'separate_pants_qty',
                                                                                toNumber(event.target.value),
                                                                            )
                                                                        }
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </td>
                                                                <td className="border border-slate-200 px-1.5 py-1.5">
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.separate_shirt_price}
                                                                        onChange={(event) =>
                                                                            updateSizeRow(
                                                                                table.id,
                                                                                row.id,
                                                                                'separate_shirt_price',
                                                                                toNumber(event.target.value),
                                                                            )
                                                                        }
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </td>
                                                                <td className="border border-slate-200 px-1.5 py-1.5">
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.separate_pants_price}
                                                                        onChange={(event) =>
                                                                            updateSizeRow(
                                                                                table.id,
                                                                                row.id,
                                                                                'separate_pants_price',
                                                                                toNumber(event.target.value),
                                                                            )
                                                                        }
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </td>
                                                                <td className="border border-slate-200 px-2 py-1.5 text-right font-semibold text-slate-700">
                                                                    {formatMoney(rowSeparateTotal(row))}
                                                                </td>
                                                                <td className="border border-slate-200 px-2 py-1.5 text-right font-bold text-slate-900">
                                                                    {formatMoney(rowTotal(row))}
                                                                </td>
                                                                <td className="border border-slate-200 px-1 py-1.5 text-center">
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="size-7 text-rose-600 hover:text-rose-700"
                                                                        onClick={() => removeSizeRow(table.id, row.id)}
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="bg-yellow-100 font-bold text-red-600">
                                                            <td className="border border-slate-200 px-2 py-2">รวม</td>
                                                            <td className="border border-slate-200 px-2 py-2 text-right">{tableTotals.setShirtQty}</td>
                                                            <td className="border border-slate-200 px-2 py-2 text-right">{tableTotals.setPantsQty}</td>
                                                            <td className="border border-slate-200 px-2 py-2 text-right">-</td>
                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                {formatMoney(tableTotals.setAmount)}
                                                            </td>
                                                            <td className="border border-slate-200 px-2 py-2 text-right">{tableTotals.sepShirtQty}</td>
                                                            <td className="border border-slate-200 px-2 py-2 text-right">{tableTotals.sepPantsQty}</td>
                                                            <td className="border border-slate-200 px-2 py-2 text-right">-</td>
                                                            <td className="border border-slate-200 px-2 py-2 text-right">-</td>
                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                {formatMoney(tableTotals.sepAmount)}
                                                            </td>
                                                            <td className="border border-slate-200 px-2 py-2 text-right">
                                                                {formatMoney(tableTotals.totalAmount)}
                                                            </td>
                                                            <td className="border border-slate-200 px-2 py-2">-</td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div> : null}

                            {sizeFormMode === 'sports_day' ? (
                                <div className="space-y-4">
                                    {data.sports_day_groups.map((group, groupIndex) => {
                                        const groupPieces = sportsDayGroupPieces(group);
                                        const groupTotal = sportsDayGroupTotal(group);

                                        return (
                                            <div key={group.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                                <div className="mb-3 grid gap-2 md:grid-cols-[1.2fr_1.2fr_auto_auto] md:items-end">
                                                    <label className="grid gap-1 text-xs">
                                                        <span className="font-semibold text-slate-600">คณะสี</span>
                                                        <Input
                                                            value={group.team_name}
                                                            onChange={(event) => patchSportsDayGroup(group.id, { team_name: event.target.value })}
                                                            placeholder={`เช่น คณะสีแดง`}
                                                            className="h-9 bg-white text-xs"
                                                            aria-label={`ชื่อคณะสีที่ ${groupIndex + 1}`}
                                                        />
                                                    </label>
                                                    <label className="grid gap-1 text-xs">
                                                        <span className="font-semibold text-slate-600">สีผ้า</span>
                                                        <MasterDataComboBox
                                                            storageKey="jssport.shirt-fabric-colors"
                                                            options={withExtraColorOptions('fabric_colors', resolvedShirtCatalogs.fabric_colors ?? [])}
                                                            value={group.fabric_color_id}
                                                            onValueChange={(value) => patchSportsDayGroup(group.id, { fabric_color_id: value })}
                                                            onOptionAdded={(option) => handleColorOptionAdded('jssport.shirt-fabric-colors', option)}
                                                            placeholder="เลือกหรือพิมพ์สีผ้า"
                                                            aria-label={`สีผ้าของคณะที่ ${groupIndex + 1}`}
                                                        />
                                                    </label>
                                                    <div className="text-xs text-slate-600">
                                                        <span className="font-mono text-sm font-semibold text-slate-900">{groupPieces}</span> ตัว ·{' '}
                                                        <span className="font-mono text-sm font-semibold text-slate-900">฿ {formatMoney(groupTotal)}</span>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-9 text-xs text-[#E21E26]"
                                                        disabled={data.sports_day_groups.length <= 1}
                                                        onClick={() => removeSportsDayGroup(group.id)}
                                                    >
                                                        ลบคณะ
                                                    </Button>
                                                </div>

                                                <div className="space-y-2">
                                                    {group.rows.map((row) => {
                                                        const rowSizeOptions = row.size_group === 'kids' ? resolvedKidsSizes : resolvedAdultSizes;

                                                        return (
                                                            <div
                                                                key={row.id}
                                                                className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2.5 md:grid-cols-[0.9fr_1fr_0.7fr_0.9fr_0.7fr_0.9fr_0.9fr_auto]"
                                                            >
                                                                <label className="grid gap-1 text-xs">
                                                                    <span className="text-slate-600">ประเภทไซซ์</span>
                                                                    <Select
                                                                        value={row.size_group}
                                                                        onValueChange={(value) =>
                                                                            patchSportsDayRow(group.id, row.id, {
                                                                                size_group: value === 'kids' ? 'kids' : 'adults',
                                                                                size_label: '',
                                                                            })
                                                                        }
                                                                    >
                                                                        <SelectTrigger className="h-9 w-full bg-white text-xs">
                                                                            <SelectValue placeholder="เลือกประเภท" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="kids">เด็ก (Kids)</SelectItem>
                                                                            <SelectItem value="adults">ผู้ใหญ่ (Adults)</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </label>
                                                                <label className="grid gap-1 text-xs">
                                                                    <span className="text-slate-600">ไซซ์</span>
                                                                    <Select
                                                                        value={row.size_label}
                                                                        onValueChange={(value) => patchSportsDayRow(group.id, row.id, { size_label: value })}
                                                                    >
                                                                        <SelectTrigger className="h-9 w-full bg-white text-xs">
                                                                            <SelectValue placeholder="เลือกไซซ์" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {rowSizeOptions.map((size) => (
                                                                                <SelectItem key={size} value={size}>
                                                                                    {size}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </label>
                                                                <label className="grid gap-1 text-xs">
                                                                    <span className="text-slate-600">เสื้อ</span>
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.shirt_qty}
                                                                        onChange={(event) =>
                                                                            patchSportsDayRow(group.id, row.id, { shirt_qty: Math.max(toNumber(event.target.value), 0) })
                                                                        }
                                                                        className="h-9 bg-white text-xs"
                                                                    />
                                                                </label>
                                                                <label className="grid gap-1 text-xs">
                                                                    <span className="text-slate-600">ราคาเสื้อ</span>
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.shirt_price}
                                                                        onChange={(event) =>
                                                                            patchSportsDayRow(group.id, row.id, { shirt_price: Math.max(toNumber(event.target.value), 0) })
                                                                        }
                                                                        className="h-9 bg-white text-xs"
                                                                    />
                                                                </label>
                                                                <label className="grid gap-1 text-xs">
                                                                    <span className="text-slate-600">กางเกง</span>
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.pants_qty}
                                                                        onChange={(event) =>
                                                                            patchSportsDayRow(group.id, row.id, { pants_qty: Math.max(toNumber(event.target.value), 0) })
                                                                        }
                                                                        className="h-9 bg-white text-xs"
                                                                    />
                                                                </label>
                                                                <label className="grid gap-1 text-xs">
                                                                    <span className="text-slate-600">ราคากางเกง</span>
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        value={row.pants_price}
                                                                        onChange={(event) =>
                                                                            patchSportsDayRow(group.id, row.id, { pants_price: Math.max(toNumber(event.target.value), 0) })
                                                                        }
                                                                        className="h-9 bg-white text-xs"
                                                                    />
                                                                </label>
                                                                <div className="grid gap-1 text-xs">
                                                                    <span className="text-slate-600">รวมราคา</span>
                                                                    <div className="flex h-9 items-center justify-end rounded-md border border-slate-200 bg-slate-50 px-2 font-mono text-xs font-semibold text-slate-900">
                                                                        ฿ {formatMoney(sportsDayRowTotal(row))}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-end">
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-9 text-xs text-slate-500 hover:text-[#E21E26]"
                                                                        disabled={group.rows.length <= 1}
                                                                        onClick={() => removeSportsDayRow(group.id, row.id)}
                                                                    >
                                                                        ลบ
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
                                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                                        <span className="text-xs font-semibold text-slate-600">Art Work ของคณะนี้</span>
                                                        <span className="text-xs text-slate-500">
                                                            แนบแล้ว{' '}
                                                            <span className="font-mono text-sm font-semibold text-slate-900">
                                                                {group.artwork_urls.length + group.artwork_files.length}
                                                            </span>{' '}
                                                            รูป
                                                            {group.artwork_urls.length > 0 ? ` (บันทึกแล้ว ${group.artwork_urls.length})` : ''}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        {group.artwork_urls.map((url) => (
                                                            <div key={url} className="size-16 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                                                                <img src={url} alt={`Art Work ${group.team_name}`} className="size-full object-contain" />
                                                            </div>
                                                        ))}
                                                        {group.artwork_files.map((file, fileIndex) => (
                                                            <div
                                                                key={`${file.name}-${file.lastModified}-${fileIndex}`}
                                                                className="relative size-16 overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50"
                                                            >
                                                                <img src={URL.createObjectURL(file)} alt={file.name} className="size-full object-contain" />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeSportsDayArtwork(group.id, fileIndex)}
                                                                    aria-label={`ลบรูปที่ ${fileIndex + 1} ของ ${group.team_name || 'คณะนี้'}`}
                                                                    className="absolute right-0 top-0 rounded-bl bg-slate-900/70 px-1 text-[10px] leading-4 text-white"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <label className="flex size-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-500 hover:border-[#174395] hover:text-[#174395]">
                                                            + เพิ่มรูป
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                multiple
                                                                className="hidden"
                                                                aria-label={`เลือกรูป Art Work ของ ${group.team_name || 'คณะนี้'}`}
                                                                onChange={(event) => {
                                                                    addSportsDayArtwork(group.id, Array.from(event.target.files ?? []));
                                                                    event.target.value = '';
                                                                }}
                                                            />
                                                        </label>
                                                    </div>
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => addSportsDayRow(group.id)}>
                                                        <Plus className="size-3.5" />
                                                        เพิ่มไซซ์
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 text-xs"
                                                        onClick={() => applySportsDayPricesToAllRows(group.id)}
                                                    >
                                                        ใช้ราคาแถวแรกกับทุกแถว
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addSportsDayGroup}>
                                        <Plus className="size-3.5" />
                                        เพิ่มคณะสี
                                    </Button>
                                </div>
                            ) : null}

                            {sizeFormMode === 'individual' ? (
                                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h3 className="text-xs font-semibold text-slate-700">รายชื่อสกรีนชื่อ-เบอร์รายตัว (Personalization List)</h3>
                                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                                            <input
                                                type="checkbox"
                                                checked={data.individual_include_pants}
                                                onChange={(event) => setData('individual_include_pants', event.target.checked)}
                                                className="size-3.5 accent-[#174395]"
                                                aria-label="สั่งกางเกงด้วย"
                                            />
                                            <span className="font-semibold text-slate-700">สั่งกางเกงด้วย</span>
                                        </label>
                                    </div>
                                    {data.personalization_rows.map((row) => (
                                        <div
                                            key={row.id}
                                            className={`grid gap-2 rounded-lg border border-slate-200 bg-white p-2.5 ${
                                                data.individual_include_pants
                                                    ? 'md:grid-cols-[1.2fr_0.8fr_0.7fr_0.6fr_0.7fr_0.7fr_0.6fr_0.7fr_0.8fr_auto]'
                                                    : 'md:grid-cols-[1.3fr_0.9fr_0.9fr_0.7fr_0.8fr_0.9fr_auto]'
                                            }`}
                                        >
                                            <label className="grid gap-1 text-xs">
                                                <span className="text-slate-600">สกรีนชื่อ (Name)</span>
                                                <Input
                                                    value={row.name}
                                                    onChange={(event) => updatePersonalization(row.id, 'name', event.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </label>
                                            <label className="grid gap-1 text-xs">
                                                <span className="text-slate-600">กลุ่มไซซ์</span>
                                                <Select
                                                    value={row.size_group}
                                                    onValueChange={(value: 'kids' | 'adults') => {
                                                        updatePersonalization(row.id, 'size_group', value);

                                                        const allowedSizes = sizeOptionsByGroup[value];

                                                        if (!allowedSizes.includes(row.size)) {
                                                            updatePersonalization(row.id, 'size', '');
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="h-8 w-full bg-white text-xs">
                                                        <SelectValue placeholder="เลือกกลุ่มไซซ์" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="kids">ไซซ์เด็ก</SelectItem>
                                                        <SelectItem value="adults">ไซซ์ผู้ใหญ่</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </label>
                                            <label className="grid gap-1 text-xs">
                                                <span className="text-slate-600">ไซซ์ (Size)</span>
                                                <Select value={row.size} onValueChange={(value) => updatePersonalization(row.id, 'size', value)}>
                                                    <SelectTrigger className="h-8 w-full bg-white text-xs">
                                                        <SelectValue placeholder="เลือกไซซ์" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {sizeOptionsByGroup[row.size_group].map((sizeOption) => (
                                                            <SelectItem key={`${row.id}-${sizeOption}`} value={sizeOption}>
                                                                {sizeOption}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </label>
                                            <label className="grid gap-1 text-xs">
                                                <span className="text-slate-600">เบอร์ (Number)</span>
                                                <Input
                                                    value={row.number}
                                                    onChange={(event) => updatePersonalization(row.id, 'number', event.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </label>
                                            <label className="grid gap-1 text-xs">
                                                <span className="text-slate-600">จำนวนที่สั่ง (Qty)</span>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={row.quantity}
                                                    onChange={(event) => updatePersonalization(row.id, 'quantity', Math.max(1, toNumber(event.target.value)))}
                                                    className="h-8 text-xs"
                                                />
                                            </label>
                                            <label className="grid gap-1 text-xs">
                                                <span className="text-slate-600">ราคาเสื้อ</span>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={row.unit_price}
                                                    onChange={(event) => updatePersonalization(row.id, 'unit_price', Math.max(0, toNumber(event.target.value)))}
                                                    className="h-8 text-xs"
                                                />
                                            </label>

                                            {data.individual_include_pants ? (
                                                <>
                                                    <label className="grid gap-1 text-xs">
                                                        <span className="text-slate-600">ไซซ์กางเกง</span>
                                                        <Select
                                                            value={row.pants_size}
                                                            onValueChange={(value) => updatePersonalization(row.id, 'pants_size', value)}
                                                        >
                                                            <SelectTrigger className="h-8 w-full bg-white text-xs">
                                                                <SelectValue placeholder="เลือกไซซ์" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {(row.size_group === 'kids' ? resolvedKidsSizes : resolvedAdultSizes).map((size) => (
                                                                    <SelectItem key={size} value={size}>
                                                                        {size}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </label>
                                                    <label className="grid gap-1 text-xs">
                                                        <span className="text-slate-600">จำนวนกางเกง</span>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={row.pants_quantity}
                                                            onChange={(event) => updatePersonalization(row.id, 'pants_quantity', Math.max(0, toNumber(event.target.value)))}
                                                            className="h-8 text-xs"
                                                        />
                                                    </label>
                                                    <label className="grid gap-1 text-xs">
                                                        <span className="text-slate-600">ราคากางเกง</span>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={row.pants_unit_price}
                                                            onChange={(event) => updatePersonalization(row.id, 'pants_unit_price', Math.max(0, toNumber(event.target.value)))}
                                                            className="h-8 text-xs"
                                                        />
                                                    </label>
                                                </>
                                            ) : null}

                                            <div className="flex items-end">
                                                <div className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-right text-xs font-semibold leading-8 text-slate-800">
                                                    {formatMoney(rowIndividualTotal(row, data.individual_include_pants))}
                                                </div>
                                            </div>

                                            <div className="flex items-end gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="h-8 px-2 text-xs text-slate-600"
                                                    onClick={() => duplicatePersonalizationRow(row.id)}
                                                >
                                                    <Copy className="size-3.5" />
                                                    ก๊อปปี้
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="h-8 px-2 text-xs text-rose-600 hover:text-rose-700"
                                                    onClick={() => removePersonalizationRow(row.id)}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                    ลบ
                                                </Button>
                                            </div>
                                        </div>
                                    ))}

                                    <div className="flex justify-end">
                                        <Button type="button" variant="outline" className="h-8 text-xs" onClick={addPersonalizationRow}>
                                            <Plus className="size-3.5" />
                                            เพิ่มรายชื่อ
                                        </Button>
                                    </div>

                                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-bold text-slate-900">
                                        รวมทั้งฟอร์ม: ฿ {formatMoney(individualGrossAmount)}
                                    </div>
                                </div>
                            ) : null}
                        </section>
                    </div>

                    {Object.keys(errors).length > 0 ? (
                        <section className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
                            <h3 className="text-xs font-bold text-rose-700">พบข้อผิดพลาดในฟอร์ม</h3>
                            <ul className="mt-1 space-y-0.5 text-xs text-rose-700">
                                {Object.entries(errors).map(([field, message]) => (
                                    <li key={field}>
                                        {field}: {message}
                                    </li>
                                ))}
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
