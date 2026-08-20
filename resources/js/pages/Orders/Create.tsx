import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    CalendarClock,
    Copy,
    FileImage,
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

type DeliveryMethod = 'pickup' | 'shipping' | 'onsite';
type PaymentMethod = 'cash' | 'transfer';
type PaymentStatus = 'deposit' | 'pending' | 'paid';
type ArtworkStatus = 'confirmed';
type SpecTab = 'shirt' | 'pants';
type SizeTableType = 'kids' | 'adults';
type SizeFormMode = 'matrix' | 'individual';

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
    due_date: string;
    delivery_method: DeliveryMethod;
    shipping_address: string;
    discount_percent: string;
    deposit_amount: number;
    payment_method: PaymentMethod;
    payment_status: PaymentStatus;
    artwork_status: ArtworkStatus;
    artwork_files: File[];
    shirt_artwork_file: File | null;
    pants_artwork_file: File | null;
    transfer_slip_file: File | null;
    shirt_specs: ShirtSpecsForm;
    pants_specs: PantsSpecsForm;
    size_tables: SizeTableForm[];
    personalization_rows: PersonalizationRowForm[];
    line_items: OrderLineItemPayload[];
};

type EditOrderPayload = {
    id?: number;
    order_code?: string | null;
    customer_id?: number | null;
    branch_id?: number | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    contact_detail?: string | null;
    job_name?: string | null;
    job_type?: string | null;
    billing_date?: string | null;
    due_date?: string | null;
    delivery_method?: string | null;
    shipping_address?: string | null;
    discount_percent?: string | number | null;
    deposit_amount?: number | string | null;
    payment_method?: string | null;
    order_status?: string | null;
    artwork_url?: string | null;
    shirt_artwork_url?: string | null;
    pants_artwork_url?: string | null;
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

type LocalCatalogRow = {
    id: string | number;
    name: string;
    active: boolean;
};

function loadLocalCatalogRows(storageKey: string): LocalCatalogRow[] {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(storageKey);

        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((item) => {
                const name = typeof item.name === 'string' ? item.name.trim() : '';
                const active = typeof item.active === 'boolean' ? item.active : true;

                if (!name) {
                    return null;
                }

                return {
                    id: typeof item.id === 'string' || typeof item.id === 'number' ? item.id : Date.now(),
                    name,
                    active,
                };
            })
            .filter((item): item is LocalCatalogRow => item !== null && item.active);
    } catch {
        return [];
    }
}

function mapCatalogRowsToOptions(rows: LocalCatalogRow[]): OptionItem[] {
    return rows.map((row, index) => ({
        id: index + 1,
        name: row.name,
    }));
}

function uid(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function currentDateISO(): string {
    return new Date().toISOString().slice(0, 10);
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

function rowIndividualTotal(row: PersonalizationRowForm): number {
    return row.quantity * row.unit_price;
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

function buildLineItemsFromIndividual(rows: PersonalizationRowForm[]): OrderLineItemPayload[] {
    return rows
        .map((row) => ({
            quantity: Math.max(row.quantity, 1),
            unit_price: Math.max(row.unit_price, 0),
            discount_id: null,
        }))
        .filter((item) => item.unit_price > 0 || item.quantity > 0);
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
                    item_type: 'garment',
                    size_group: sizeGroup,
                    size_label: sizeLabel,
                    quantity: setBundleCount,
                    unit_price: Math.max(row.set_price, 0),
                });
            }

            if (row.separate_shirt_qty > 0 && row.separate_shirt_price > 0) {
                items.push({
                    item_type: 'garment',
                    size_group: sizeGroup,
                    size_label: sizeLabel,
                    quantity: row.separate_shirt_qty,
                    unit_price: Math.max(row.separate_shirt_price, 0),
                });
            }

            if (row.separate_pants_qty > 0 && row.separate_pants_price > 0) {
                items.push({
                    item_type: 'garment',
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

function buildRequestItemsFromIndividual(rows: PersonalizationRowForm[]): RequestOrderItem[] {
    return rows
        .map((row) => ({
            item_type: 'garment',
            size_group: row.size_group,
            size_label: row.size || '-',
            quantity: Math.max(row.quantity, 1),
            unit_price: Math.max(row.unit_price, 0),
        }))
        .filter((item) => item.unit_price > 0 || item.quantity > 0);
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

export function buildEditInitialFormData(order: EditOrderPayload | null | undefined, args: {
    resolvedBranches: BranchOption[];
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
            branch_id: args.resolvedBranches[0] ? String(args.resolvedBranches[0].id) : '',
            customer_name: '',
            customer_phone: '',
            contact_detail: '',
            job_type_id: args.resolvedJobTypes[0] ? String(args.resolvedJobTypes[0].id) : '',
            job_name: '',
            billing_date: currentDateISO(),
            due_date: '',
            delivery_method: 'pickup',
            shipping_address: '',
            discount_percent: '0',
            deposit_amount: 0,
            payment_method: 'cash',
            payment_status: 'pending',
            artwork_status: 'confirmed',
            artwork_files: [],
            shirt_artwork_file: null,
            pants_artwork_file: null,
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
            } else if (itemType.includes('shirt') || itemType.includes('pants') || itemType === 'garment') {
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
        due_date: order.due_date ?? '',
        delivery_method: (order.delivery_method as DeliveryMethod) ?? 'pickup',
        shipping_address: order.shipping_address ?? '',
        discount_percent: toStringValue(order.discount_percent) || '0',
        deposit_amount: toNumberValue(order.deposit_amount),
        payment_method: (order.payment_method as PaymentMethod) ?? 'cash',
        payment_status: 'pending',
        artwork_status: 'confirmed',
        artwork_files: [],
        shirt_artwork_file: null,
        pants_artwork_file: null,
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
        size_tables: order ? (matrixTables.length > 0 ? matrixTables : []) : [defaultSizeTable],
        personalization_rows: mappedPersonalizationRows,
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

function SingleArtworkUpload({
    title,
    inputId,
    file,
    previewUrl,
    error,
    onSelect,
    onClear,
}: {
    title: string;
    inputId: string;
    file: File | null;
    previewUrl: string | null;
    error?: string;
    onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
    onClear: () => void;
}) {
    const displayName = file?.name ?? 'รูปที่บันทึกไว้';
    const hasPreview = Boolean(previewUrl);

    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-xs font-semibold text-slate-700">{title}</p>
            {hasPreview ? (
                <div className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                    <img src={previewUrl ?? undefined} alt={displayName} className="size-16 rounded-md object-cover" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-800">{displayName}</p>
                        <p className="text-[11px] text-slate-500">{file ? `${Math.round(file.size / 1024).toLocaleString('th-TH')} KB` : 'รูปที่บันทึกไว้'}</p>
                    </div>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-slate-500 hover:text-rose-600"
                        onClick={onClear}
                    >
                        <X className="size-4" />
                    </Button>
                </div>
            ) : (
                <div className="mt-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-[11px] text-slate-500">
                    ยังไม่ได้แนบรูป
                </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
                <input id={inputId} type="file" accept="image/*" className="hidden" onChange={onSelect} />
                <label
                    htmlFor={inputId}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                >
                    <Upload className="size-3.5" />
                    {file ? 'เปลี่ยนรูป' : 'เลือกไฟล์'}
                </label>
                {file || previewUrl ? (
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-rose-600" onClick={onClear}>
                        ลบรูป
                    </Button>
                ) : null}
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
    order,
}: OrderCreatePageProps) {
    const { compressImage, isCompressing, error: compressError } = useWebpCompress();
    const { currentTeam } = usePage<{ currentTeam?: { slug: string } | null }>().props;

    const [activeSpecTab, setActiveSpecTab] = useState<SpecTab>('shirt');
    const [isDragOverArtwork, setIsDragOverArtwork] = useState(false);
    const [isDragOverSlip, setIsDragOverSlip] = useState(false);
    const [sizeFormMode, setSizeFormMode] = useState<SizeFormMode>('matrix');
    const [artworkPreviewUrls, setArtworkPreviewUrls] = useState<string[]>([]);
    const [shirtArtworkPreviewUrl, setShirtArtworkPreviewUrl] = useState<string | null>(null);
    const [pantsArtworkPreviewUrl, setPantsArtworkPreviewUrl] = useState<string | null>(null);
    const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!order) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setArtworkPreviewUrls([]);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShirtArtworkPreviewUrl(null);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPantsArtworkPreviewUrl(null);

            return;
        }

        const previewList = [order.artwork_url, ...(order.reference_designs ?? [])].filter((url): url is string => Boolean(url));

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setArtworkPreviewUrls(previewList);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShirtArtworkPreviewUrl(order.shirt_artwork_url ?? null);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPantsArtworkPreviewUrl(order.pants_artwork_url ?? null);
    }, [order]);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const artworkUploadQueueRef = useRef<Promise<void>>(Promise.resolve());
    const [primaryArtworkSignature, setPrimaryArtworkSignature] = useState<string | null>(null);

    const [masterJobTypes, setMasterJobTypes] = useState<OptionItem[]>([]);

    const resolvedBranches = branches ?? [];
    const resolvedJobTypes = masterJobTypes.length > 0 ? masterJobTypes : (jobTypes ?? []);
    const resolvedShirtCatalogs = shirtCatalogs ?? {};
    const resolvedPantsCatalogs = pantsCatalogs ?? {};
    const resolvedShirtTypes = shirtTypes ?? [];
    const resolvedPantsTypes = pantsTypes ?? [];

    const resolvedKidsSizes = kidsSizes ?? [];
    const resolvedAdultSizes = adultSizes ?? [];

    const initialFormData = useMemo(
        () => buildEditInitialFormData(order, {
            resolvedBranches,
            resolvedJobTypes,
            resolvedShirtTypes,
            resolvedPantsTypes,
            resolvedKidsSizes,
            resolvedAdultSizes,
        }),
        [order, resolvedBranches, resolvedJobTypes, resolvedShirtTypes, resolvedPantsTypes, resolvedKidsSizes, resolvedAdultSizes],
    );

    const { data, setData, post, put, processing, errors, transform } = useForm<OrderCreateFormData>(initialFormData);

    const selectedBranch = useMemo(
        () => resolvedBranches.find((branch) => String(branch.id) === data.branch_id) ?? null,
        [resolvedBranches, data.branch_id],
    );

    useEffect(() => {
        const localJobTypes = loadLocalCatalogRows('jssport.job-types');

        if (localJobTypes.length > 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMasterJobTypes(mapCatalogRowsToOptions(localJobTypes));
        }

    }, []);

    useEffect(() => {
        if (!data.branch_id && resolvedBranches[0]) {
            setData('branch_id', String(resolvedBranches[0].id));
        }
    }, [data.branch_id, resolvedBranches, setData]);

    useEffect(() => {
        if (data.artwork_files.length === 0) {
            if (order) {
                const previewList = [order.artwork_url, ...(order.reference_designs ?? [])].filter((url): url is string => Boolean(url));
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setArtworkPreviewUrls(previewList);
            } else {
                // eslint-disable-next-line react-hooks/set-state-in-effect
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
        if (!data.shirt_artwork_file) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShirtArtworkPreviewUrl(order?.shirt_artwork_url ?? null);

            return;
        }

        const nextUrl = URL.createObjectURL(data.shirt_artwork_file);

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShirtArtworkPreviewUrl(nextUrl);

        return () => {
            URL.revokeObjectURL(nextUrl);
        };
    }, [data.shirt_artwork_file, order]);

    useEffect(() => {
        if (!data.pants_artwork_file) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPantsArtworkPreviewUrl(order?.pants_artwork_url ?? null);

            return;
        }

        const nextUrl = URL.createObjectURL(data.pants_artwork_file);

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPantsArtworkPreviewUrl(nextUrl);

        return () => {
            URL.revokeObjectURL(nextUrl);
        };
    }, [data.pants_artwork_file, order]);

    useEffect(() => {
        if (!data.transfer_slip_file) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSlipPreviewUrl(null);

            return;
        }

        const nextUrl = URL.createObjectURL(data.transfer_slip_file);

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSlipPreviewUrl(nextUrl);

        return () => {
            URL.revokeObjectURL(nextUrl);
        };
    }, [data.transfer_slip_file]);

    const matrixGrossAmount = useMemo(
        () => data.size_tables.flatMap((table) => table.rows).reduce((total, row) => total + rowTotal(row), 0),
        [data.size_tables],
    );

    const individualGrossAmount = useMemo(
        () => data.personalization_rows.reduce((total, row) => total + rowIndividualTotal(row), 0),
        [data.personalization_rows],
    );

    const grossAmount = sizeFormMode === 'matrix' ? matrixGrossAmount : individualGrossAmount;
    const discountPercent = Math.max(Math.min(toNumber(data.discount_percent), 50), 0);
    const discountAmount = (grossAmount * discountPercent) / 100;
    const derivedLineItems = useMemo(
        () => (sizeFormMode === 'matrix' ? buildLineItemsFromMatrix(data.size_tables) : buildLineItemsFromIndividual(data.personalization_rows)),
        [sizeFormMode, data.size_tables, data.personalization_rows],
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

    const handleSlipSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0] ?? null;

        if (!selected) {
            setData('transfer_slip_file', null);

            return;
        }

        const compressed = await compressImage(selected);
        setData('transfer_slip_file', compressed);
    };

    const handleShirtArtworkSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0] ?? null;

        if (!selected) {
            setData('shirt_artwork_file', null);

            return;
        }

        const compressed = await compressImage(selected);
        setData('shirt_artwork_file', compressed);
        event.target.value = '';
    };

    const handlePantsArtworkSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0] ?? null;

        if (!selected) {
            setData('pants_artwork_file', null);

            return;
        }

        const compressed = await compressImage(selected);
        setData('pants_artwork_file', compressed);
        event.target.value = '';
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

        if (!data.due_date) {
            missing.push('วันที่รับสินค้า');
        }

        if (!data.branch_id) {
            missing.push('สาขา');
        }

        if (data.size_tables.some((table) => table.rows.some((row) => !row.size_label))) {
            missing.push('ไซส์ในตารางเลือกไซซ์');
        }

        if (data.size_tables.some((table) => table.rows.some((row) => row.size_label.length > SIZE_LABEL_MAX_LENGTH))) {
            missing.push(`ไซส์ต้องไม่เกิน ${SIZE_LABEL_MAX_LENGTH} ตัวอักษร`);
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
        const requestItems = sizeFormMode === 'matrix' ? buildRequestItems(data.size_tables) : buildRequestItemsFromIndividual(data.personalization_rows);
        const isEditing = Boolean(order?.id);
        const normalizedDueDate = data.due_date && data.due_date >= data.billing_date ? data.due_date : data.billing_date;
        const activeSpecValues = activeSpecTab === 'pants' ? data.pants_specs : data.shirt_specs;
        const screenPrintDetail = JSON.stringify({
            schema: 'spec-v2',
            mode: sizeFormMode,
            shirt_specs: data.shirt_specs,
            pants_specs: data.pants_specs,
            personalization_rows: sizeFormMode === 'individual'
                ? data.personalization_rows.map((row) => ({
                      name: row.name.trim(),
                      size: row.size.trim(),
                      number: row.number.trim(),
                      quantity: Math.max(row.quantity, 1),
                      unit_price: Math.max(row.unit_price, 0),
                      total_price: rowIndividualTotal(row),
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
                    shirt_artwork: payload.shirt_artwork_file,
                    pants_artwork: payload.pants_artwork_file,
                    reference_designs: referenceDesigns,
                };
            })(),
            customer_id: payload.customer_id ? Number(payload.customer_id) : null,
            customer_name: customerName,
            customer_phone: payload.customer_phone || null,
            contact_detail: payload.contact_detail || null,
            branch_id: Number(payload.branch_id || 0),
            job_name: payload.job_name,
            job_type: selectedJobType,
            delivery_method: payload.delivery_method,
            shipping_address: payload.shipping_address || null,
            order_date: `${payload.billing_date} 00:00:00`,
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

                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">วันที่เปิดบิล</span>
                                        <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700">
                                            <CalendarClock className="mr-2 size-3.5 text-blue-500" />
                                            {data.billing_date}
                                        </div>
                                    </label>

                                    <label className="grid gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-600">วันที่รับสินค้า</span>
                                        <Input
                                            type="date"
                                            value={data.due_date}
                                            onChange={(event) => setData('due_date', event.target.value)}
                                            min={data.billing_date}
                                            className="h-9 text-xs"
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
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-900">฿ {formatMoney(remainingAmount)}</span>
                                                    {data.payment_status === 'paid' ? (
                                                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">ชำระแล้ว</Badge>
                                                    ) : data.payment_status === 'deposit' ? (
                                                        <Badge className="border-blue-200 bg-blue-50 text-blue-700">มัดจำ</Badge>
                                                    ) : (
                                                        <Badge className="border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]">ค้างชำระ</Badge>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid gap-1.5 text-xs">
                                                <span className="font-semibold text-slate-600">สถานะการชำระเงิน</span>
                                                <Select value={data.payment_status} onValueChange={(value: PaymentStatus) => setData('payment_status', value)}>
                                                    <SelectTrigger className="h-8 w-full bg-white text-xs">
                                                        <SelectValue placeholder="เลือกสถานะ" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="deposit">มัดจำ</SelectItem>
                                                        <SelectItem value="pending">ค้างชำระ</SelectItem>
                                                        <SelectItem value="paid">ชำระแล้ว</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-2">
                                    <span className="text-xs font-semibold text-slate-600">วิธีชำระเงิน</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            type="button"
                                            variant={data.payment_method === 'cash' ? 'default' : 'outline'}
                                            className="h-8 text-xs"
                                            onClick={() => setData('payment_method', 'cash')}
                                        >
                                            เงินสด
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={data.payment_method === 'transfer' ? 'default' : 'outline'}
                                            className="h-8 text-xs"
                                            onClick={() => setData('payment_method', 'transfer')}
                                        >
                                            เงินโอน
                                        </Button>
                                    </div>
                                </div>

                                <div
                                    className={`mt-3 overflow-hidden transition-all duration-200 ${
                                        data.payment_method === 'transfer' ? 'max-h-[240px] opacity-100' : 'max-h-0 opacity-0'
                                    }`}
                                >
                                    <label
                                        className={`block rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                                            isDragOverSlip ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50/60'
                                        }`}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            setIsDragOverSlip(true);
                                        }}
                                        onDragLeave={() => setIsDragOverSlip(false)}
                                        onDrop={(event) => {
                                            event.preventDefault();
                                            setIsDragOverSlip(false);
                                            const droppedFile = event.dataTransfer.files?.[0];

                                            if (!droppedFile) {
                                                return;
                                            }

                                            void (async () => {
                                                const compressed = await compressImage(droppedFile);
                                                setData('transfer_slip_file', compressed);
                                            })();
                                        }}
                                    >
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(event) => {
                                                void handleSlipSelect(event);
                                            }}
                                        />
                                        <FileImage className="mx-auto mb-2 size-5 text-slate-500" />
                                        <p className="text-xs font-medium text-slate-700">อัปโหลดสลิปหลักฐานการโอน</p>
                                        <p className="mt-1 text-[11px] text-slate-500">รองรับไฟล์รูปภาพ และจะถูกบีบอัดเป็น WebP อัตโนมัติ</p>
                                    </label>

                                    <div className="mt-2">
                                        {data.transfer_slip_file && slipPreviewUrl ? (
                                            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                                                <img src={slipPreviewUrl} alt={data.transfer_slip_file.name} className="size-16 rounded-md object-cover" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-xs font-semibold text-slate-800">{data.transfer_slip_file.name}</p>
                                                    <p className="text-[11px] text-slate-500">
                                                        {Math.round(data.transfer_slip_file.size / 1024).toLocaleString('th-TH')} KB
                                                    </p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    className="size-8 text-slate-500 hover:text-rose-600"
                                                    onClick={() => {
                                                        setData('transfer_slip_file', null);
                                                    }}
                                                >
                                                    <X className="size-4" />
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                {compressError ? (
                                    <p className="mt-3 text-xs text-[#E21E26]">แจ้งเตือนการบีบอัดรูปภาพ: {compressError}</p>
                                ) : null}
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
                                        <SingleArtworkUpload
                                            title="Art Work เสื้อ"
                                            inputId="shirt-artwork-upload"
                                            file={data.shirt_artwork_file}
                                            previewUrl={shirtArtworkPreviewUrl}
                                            error={formErrors.shirt_artwork}
                                            onSelect={(event) => {
                                                void handleShirtArtworkSelect(event);
                                            }}
                                            onClear={() => setData('shirt_artwork_file', null)}
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
                                        const options = resolvedShirtCatalogs[field.source] ?? [];

                                        return (
                                            <label key={field.key} className="grid gap-1.5 text-xs">
                                                <span className="font-semibold text-slate-600">{field.label}</span>
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
                                        <SingleArtworkUpload
                                            title="Art Work กางเกง"
                                            inputId="pants-artwork-upload"
                                            file={data.pants_artwork_file}
                                            previewUrl={pantsArtworkPreviewUrl}
                                            error={formErrors.pants_artwork}
                                            onSelect={(event) => {
                                                void handlePantsArtworkSelect(event);
                                            }}
                                            onClear={() => setData('pants_artwork_file', null)}
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
                                        const options = resolvedPantsCatalogs[field.source] ?? [];

                                        return (
                                            <label key={field.key} className="grid gap-1.5 text-xs">
                                                <span className="font-semibold text-slate-600">{field.label}</span>
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

                            {sizeFormMode === 'individual' ? (
                                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                    <h3 className="text-xs font-semibold text-slate-700">รายชื่อสกรีนชื่อ-เบอร์รายตัว (Personalization List)</h3>
                                    {data.personalization_rows.map((row) => (
                                        <div key={row.id} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2.5 md:grid-cols-[1.3fr_0.9fr_0.9fr_0.7fr_0.8fr_0.9fr_auto]">
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
                                                <span className="text-slate-600">ราคาต่อชุด</span>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={row.unit_price}
                                                    onChange={(event) => updatePersonalization(row.id, 'unit_price', Math.max(0, toNumber(event.target.value)))}
                                                    className="h-8 text-xs"
                                                />
                                            </label>

                                            <div className="flex items-end">
                                                <div className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-right text-xs font-semibold leading-8 text-slate-800">
                                                    {formatMoney(rowIndividualTotal(row))}
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
