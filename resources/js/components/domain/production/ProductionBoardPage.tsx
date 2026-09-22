import { Head, Link, router, usePage } from '@inertiajs/react';
import JsBarcode from 'jsbarcode';
import { ChevronDown, Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { WorkReceiptTopBar } from '@/components/domain/orders/WorkReceiptHeader';
import {
    getEmbroideryTimelineLabel,
    resolveEmbroideryRouting,
} from '@/components/domain/production/embroideryState';
import { nextRoomLabelFromStation as nextRoomLabelFromStationHelper } from '@/components/domain/production/nextRoomOptions';
import type { ProductionRoomDestination } from '@/components/domain/production/nextRoomOptions';
import type { OrderTableRow } from '@/components/domain/production/ProductionKanbanBoard';
import { ProductionKanbanBoard } from '@/components/domain/production/ProductionKanbanBoard';
import {
    resolveScreenFlexCurrentStatusLabel as resolveScreenFlexCurrentStatusLabelState,
    resolveScreenFlexRouting,
} from '@/components/domain/production/screenFlexState';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    DEFAULT_BRANCH_HEADER_COLOR,
    resolveBranchHeaderColor,
} from '@/lib/branchHeaderColor';
import type {
    CuttingTeam,
    EmbroideryTeam,
    HeatPressMachine,
    Order,
    ScreenTeam,
    SewingTeam,
} from '@/types/models';

type SelectOption = { value: string; label: string };

type ProductionPricingComponent = {
    name: string;
    child_price: number;
    adult_price: number;
};

type ProductionPricingSummary = {
    shirt_type_id?: number | null;
    pants_type_id?: number | null;
    shirt_type_name?: string | null;
    pants_type_name?: string | null;
    child_quantity: number;
    adult_quantity: number;
    components: ProductionPricingComponent[];
    pants_components?: ProductionPricingComponent[];
    child_unit_total: number;
    adult_unit_total: number;
    pants_child_unit_total?: number;
    pants_adult_unit_total?: number;
    child_total: number;
    adult_total: number;
    pants_child_total?: number;
    pants_adult_total?: number;
    grand_total: number;
    pants_grand_total?: number;
    /** One entry per batch, already priced for its own sleeve or leg length. */
    groups?: Array<{
        key: string;
        unit_total: number;
    }>;
};

type ConfirmDialogState = {
    open: boolean;
    message: string;
    onConfirm: (() => void) | null;
};
type ProductionGroupGarment = 'shirt' | 'pants';
type ProductionGroupSizeGroup = 'kids' | 'adults';
/** Sleeve or leg length. 'unspecified' is for rows saved before we recorded it. */
type ProductionGroupStyle = 'short' | 'long' | 'unspecified';
type ProductionGroupBaseKey =
    `${ProductionGroupGarment}_${ProductionGroupSizeGroup}`;
/** One batch, which is one printed sheet on the production floor. */
type ProductionGroupKey = `${ProductionGroupBaseKey}_${ProductionGroupStyle}`;
type ProductionGroupTheme = {
    backgroundColor: string;
    borderColor: string;
};

/**
 * Colour still says garment and size group, the way the floor already reads it.
 * Length only changes the shade, so a long-sleeve sheet is recognisably the same
 * family as its short-sleeve twin instead of being a new colour to learn.
 */
const PRODUCTION_GROUP_THEME_MAP: Record<
    ProductionGroupBaseKey,
    Record<'short' | 'long', ProductionGroupTheme>
> = {
    shirt_kids: {
        short: { backgroundColor: '#0F766E', borderColor: '#115E59' },
        long: { backgroundColor: '#134E4A', borderColor: '#0B3B38' },
    },
    shirt_adults: {
        short: { backgroundColor: '#1D4ED8', borderColor: '#1E3A8A' },
        long: { backgroundColor: '#1E3A8A', borderColor: '#172554' },
    },
    pants_kids: {
        short: { backgroundColor: '#B45309', borderColor: '#92400E' },
        long: { backgroundColor: '#7C2D12', borderColor: '#5C2110' },
    },
    pants_adults: {
        short: { backgroundColor: '#7C3AED', borderColor: '#5B21B6' },
        long: { backgroundColor: '#5B21B6', borderColor: '#4C1D95' },
    },
};

/** Neutral, so an unrecorded length never looks like a real batch to cut. */
const PRODUCTION_UNSPECIFIED_THEME: ProductionGroupTheme = {
    backgroundColor: '#475569',
    borderColor: '#334155',
};

const PRODUCTION_STYLE_LABELS: Record<
    ProductionGroupGarment,
    Record<ProductionGroupStyle, string>
> = {
    shirt: { short: 'แขนสั้น', long: 'แขนยาว', unspecified: 'ไม่ระบุแขน' },
    pants: { short: 'ขาสั้น', long: 'ขายาว', unspecified: 'ไม่ระบุขา' },
};

const PRODUCTION_GROUP_BASE_LABELS: Record<ProductionGroupBaseKey, string> = {
    shirt_kids: 'เสื้อไซต์เด็ก',
    shirt_adults: 'เสื้อไซต์ผู้ใหญ่',
    pants_kids: 'กางเกงเด็ก',
    pants_adults: 'กางเกงผู้ใหญ่',
};

function normalizeProductionStyle(
    style: string | null | undefined,
): ProductionGroupStyle {
    return style === 'short' || style === 'long' ? style : 'unspecified';
}
const PRODUCTION_ARTWORK_CONTAINER_HEIGHT = '70mm';

/**
 * Whether a spec section says anything at all. Deliberately the same emptiness
 * test the costing side applies in
 * ProductionCostCalculation::specSectionHasValues.
 */
function specValuesPresent(
    section: Record<string, unknown> | null | undefined,
): boolean {
    if (!section) {
        return false;
    }

    return Object.values(section).some((value) => {
        if (value === null || value === undefined) {
            return false;
        }

        if (typeof value === 'number') {
            return value > 0;
        }

        const text = String(value).trim();

        return text !== '' && text !== '0';
    });
}

/**
 * Which garments the bill was written about, read the way the costing reads it
 * (ProductionCostCalculation::resolveSpecificationGarmentAvailability).
 *
 * The two have to agree. A "set" line is one shirt and one pair of pants only
 * when the bill says something about both, and if the sheets and the money
 * disagree about that, the floor is handed a different number of sheets than
 * the shop has costed — which is what happened to a bill whose only pants entry
 * was the garment type: two batches in the money, one sheet on the floor.
 */
function readGarmentAvailability(order: Order): {
    shirt: boolean;
    pants: boolean;
} {
    const spec = order.specification;
    let shirtSpecs: Record<string, unknown> | null = null;
    let pantsSpecs: Record<string, unknown> | null = null;
    const raw = spec?.screen_print_detail;

    if (typeof raw === 'string' && raw.trim() !== '') {
        try {
            const firstPass = JSON.parse(raw) as unknown;
            const parsed = (
                typeof firstPass === 'string'
                    ? JSON.parse(firstPass)
                    : firstPass
            ) as Record<string, unknown>;

            shirtSpecs = (parsed.shirt_specs ??
                parsed.shirtSpecs ??
                null) as Record<string, unknown> | null;
            pantsSpecs = (parsed.pants_specs ??
                parsed.pantsSpecs ??
                null) as Record<string, unknown> | null;
        } catch {
            // An unreadable payload falls back to the columns below, which is
            // what a bill written before spec-v2 carries anyway.
        }
    }

    return {
        shirt:
            specValuesPresent(shirtSpecs) ||
            specValuesPresent({
                pattern_id: spec?.pattern_id,
                fabric_id: spec?.fabric_id,
                neck_style_id: spec?.neck_style_id,
                sleeve_style: spec?.sleeve_style,
                sleeve_hem: spec?.sleeve_hem,
                placket_style: spec?.placket_style,
                placket_color: spec?.placket_color,
                sublimation_detail: spec?.sublimation_detail,
                embroidery_code: spec?.embroidery_code,
            }),
        pants:
            specValuesPresent(pantsSpecs) ||
            specValuesPresent({
                leg_style: spec?.leg_style,
                leg_hem: spec?.leg_hem,
            }),
    };
}

/** One line of a Form 2 name list, as the printed sheets need it. */
type PersonalizationPrintRow = {
    name: string;
    number: string;
    size: string;
    quantity: number;
};

/**
 * The name list a Form 2 bill carries. It lives in the spec JSON because
 * order_items has no column for a person, and the dialog needs it in two
 * places: the sheet itself, and the header that offers to print the sheet.
 */
function readPersonalizationRows(order: Order): PersonalizationPrintRow[] {
    const raw = order.specification?.screen_print_detail;

    if (!raw || typeof raw !== 'string') {
        return [];
    }

    try {
        const firstPass = JSON.parse(raw) as unknown;
        const parsed = (
            typeof firstPass === 'string' ? JSON.parse(firstPass) : firstPass
        ) as {
            mode?: unknown;
            personalization_rows?: Array<{
                name?: unknown;
                number?: unknown;
                size?: unknown;
                quantity?: unknown;
            }>;
        };

        if (
            parsed.mode !== 'individual' ||
            !Array.isArray(parsed.personalization_rows)
        ) {
            return [];
        }

        const text = (value: unknown): string =>
            typeof value === 'string' && value.trim() !== ''
                ? value.trim()
                : '-';

        return parsed.personalization_rows
            .map((row) => {
                const quantity = Number(row.quantity ?? 0);

                return {
                    name: text(row.name),
                    number: text(row.number),
                    size: text(row.size),
                    quantity:
                        Number.isFinite(quantity) && quantity > 0
                            ? quantity
                            : 0,
                };
            })
            .filter(
                (row) =>
                    row.name !== '-' ||
                    row.number !== '-' ||
                    row.size !== '-' ||
                    row.quantity > 0,
            );
    } catch {
        return [];
    }
}

function resolveProductionGroupTheme(
    baseKey: ProductionGroupBaseKey,
    style: ProductionGroupStyle,
): ProductionGroupTheme {
    if (style === 'unspecified') {
        return PRODUCTION_UNSPECIFIED_THEME;
    }

    return PRODUCTION_GROUP_THEME_MAP[baseKey][style];
}

function resolveProductionSpecRows(
    garment: ProductionGroupGarment,
    shirtRows: Array<{
        label: string;
        value: string | number | null | undefined;
    }>,
    pantsRows: Array<{
        label: string;
        value: string | number | null | undefined;
    }>,
): Array<{ label: string; value: string | number | null | undefined }> {
    return garment === 'pants' ? pantsRows : shirtRows;
}

function resolveProductionSpecTitle(garment: ProductionGroupGarment): string {
    return garment === 'pants' ? 'สเปกกางเกง' : 'สเปกเสื้อ';
}

function resolveGroupHeaderStyle(theme: ProductionGroupTheme): CSSProperties {
    return {
        backgroundColor: theme.backgroundColor,
        borderColor: theme.borderColor,
        color: '#ffffff',
    };
}

const stationLabels: Record<string, string> = {
    design: 'ห้องออกแบบ',
    print: 'ห้องพิมพ์',
    embroidery: 'ห้องปัก',
    screen: 'ห้องอัด',
    flex: 'ห้องสกรีน เฟล็กซ์',
    cutting: 'ห้องตัด',
    sewing: 'ห้องเย็บ',
    qc: 'ห้อง QC',
    shipping: 'จัดส่ง',
};

const routingStatusLabels: Record<string, string> = {
    pending: 'งานเข้า',
    in_progress: 'กำลังทำ',
    completed: 'เสร็จสิ้น',
    rejected: 'ตีกลับ',
    skipped: 'ข้าม',
};

const printRoutingStatusClassNames: Record<string, string> = {
    in_progress: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
    completed: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
    skipped: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
    rejected: 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
    pending: 'border-[#94A3B8] bg-[#F1F5F9] text-[#475569]',
};

const getStationLabel = (stationName: string): string =>
    stationLabels[stationName] ?? stationName;
const getRoutingStatusLabel = (status: string): string =>
    routingStatusLabels[status] ?? status;
const getPrintRoutingStatusClass = (status: string): string =>
    printRoutingStatusClassNames[status] ??
    printRoutingStatusClassNames.pending;

export type ProductionDepartmentFilter =
    | 'all'
    | 'design'
    | 'print_room'
    | 'heat_press'
    | 'embroidery'
    | 'cutting'
    | 'sewing'
    | 'screen_flex'
    | 'qc'
    | 'shipping';

type ProductionBoardPageProps = {
    orders: Order[];
    pagination?: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
        from: number | null;
        to: number | null;
    };
    branches?: SelectOption[];
    fabricLookup?: Record<string, string>;
    specCatalogLookups?: Record<string, Record<string, string>>;
    specSectionsMap?: Record<
        string,
        { shirt: SelectOption[]; pants: SelectOption[] }
    >;
    cuttingTeams?: CuttingTeam[];
    sewingTeams?: SewingTeam[];
    embroideryTeams?: EmbroideryTeam[];
    screenTeams?: ScreenTeam[];
    heatPressMachines?: HeatPressMachine[];
    initialDepartmentFilter?: ProductionDepartmentFilter;
    showDepartmentFilter?: boolean;
    pageTitle: string;
    hideBillingColumns?: boolean;
};

type SpecField = {
    key: string;
    label: string;
    type: 'catalog' | 'text';
    storageKeys?: string[];
};
type OrderRoutingRecord = NonNullable<Order['routings']>[number];

const getVisibleTimelineRoutings = (
    routings: OrderRoutingRecord[],
): OrderRoutingRecord[] => {
    return [...routings]
        .filter((routing) => routing.is_required)
        .sort((a, b) => a.id - b.id);
};

const shirtSpecFields: SpecField[] = [
    {
        key: 'pattern_id',
        label: 'แพทเทิร์น',
        type: 'catalog',
        storageKeys: ['jssport.shirt-patterns'],
    },
    {
        key: 'fabric_id',
        label: 'เนื้อผ้า',
        type: 'catalog',
        storageKeys: ['jssport.shirt-fabrics'],
    },
    {
        key: 'fabric_color_id',
        label: 'สีผ้า',
        type: 'catalog',
        storageKeys: ['jssport.shirt-colors'],
    },
    {
        key: 'neck_style_id',
        label: 'แบบคอ',
        type: 'catalog',
        storageKeys: ['jssport.shirt-collars'],
    },
    {
        key: 'neck_color_id',
        label: 'สีแบบคอ',
        type: 'catalog',
        storageKeys: ['jssport.shirt-colors'],
    },
    {
        key: 'collar_id',
        label: 'ปก',
        type: 'catalog',
        storageKeys: ['jssport.shirt-collars'],
    },
    {
        key: 'placket_style_id',
        label: 'แบบสาบ',
        type: 'catalog',
        storageKeys: ['jssport.shirt-plackets'],
    },
    {
        key: 'placket_inner_color_id',
        label: 'สีสาบ (ใน)',
        type: 'catalog',
        storageKeys: ['jssport.shirt-colors'],
    },
    {
        key: 'placket_outer_color_id',
        label: 'สีสาบ (นอก)',
        type: 'catalog',
        storageKeys: ['jssport.shirt-colors'],
    },
    {
        key: 'sleeve_cuff_id',
        label: 'ปลายแขน',
        type: 'catalog',
        storageKeys: ['jssport.shirt-cuffs'],
    },
    {
        key: 'panel_style_id',
        label: 'สาบนอก',
        type: 'catalog',
        storageKeys: ['jssport.shirt-panels'],
    },
    {
        key: 'screen_color_id',
        label: 'สีสกรีน',
        type: 'catalog',
        storageKeys: ['jssport.shirt-colors'],
    },
    {
        key: 'embroidery_color_id',
        label: 'สีงานปัก',
        type: 'catalog',
        storageKeys: ['jssport.shirt-colors'],
    },
    {
        key: 'sublimation_id',
        label: 'ซับลิเมชั่น',
        type: 'catalog',
        storageKeys: ['jssport.shirt-sublimation'],
    },
    { key: 'sleeve_style_text', label: 'แบบแขน', type: 'text' },
    { key: 'piping_style_text', label: 'แบบกุ้น', type: 'text' },
    { key: 'stripe_style_text', label: 'แบบลา', type: 'text' },
    { key: 'screen_text', label: 'ข้อความสกรีน', type: 'text' },
    { key: 'embroidery_code_text', label: 'รหัสงานปัก', type: 'text' },
    { key: 'embroidery_note_text', label: 'รายละเอียดปัก', type: 'text' },
];

const pantsSpecFields: SpecField[] = [
    {
        key: 'pattern_id',
        label: 'แพทเทิร์น',
        type: 'catalog',
        storageKeys: ['jssport.pants-patterns'],
    },
    {
        key: 'fabric_id',
        label: 'เนื้อผ้า',
        type: 'catalog',
        storageKeys: ['jssport.shirt-fabrics'],
    },
    {
        key: 'fabric_color_id',
        label: 'สีผ้า',
        type: 'catalog',
        storageKeys: ['jssport.shirt-colors'],
    },
    {
        key: 'leg_style_id',
        label: 'แบบขา',
        type: 'catalog',
        storageKeys: ['jssport.pants-leg-style'],
    },
    {
        key: 'leg_cuff_id',
        label: 'ปลายขา',
        type: 'catalog',
        storageKeys: ['jssport.pants-leg-hem'],
    },
    {
        key: 'screen_color_id',
        label: 'สีสกรีน',
        type: 'catalog',
        storageKeys: ['jssport.shirt-colors'],
    },
    {
        key: 'embroidery_color_id',
        label: 'สีงานปัก',
        type: 'catalog',
        storageKeys: ['jssport.shirt-colors'],
    },
    {
        key: 'sublimation_id',
        label: 'ซับลิเมชั่น',
        type: 'catalog',
        storageKeys: ['jssport.shirt-sublimation'],
    },
    { key: 'seat_style_text', label: 'กุ้นกางเกง', type: 'text' },
    { key: 'panel_style_text', label: 'แบบต่อ', type: 'text' },
    { key: 'stripe_style_text', label: 'แบบลา', type: 'text' },
    { key: 'screen_text', label: 'ข้อความสกรีน', type: 'text' },
    { key: 'embroidery_code_text', label: 'รหัสงานปัก', type: 'text' },
    { key: 'embroidery_note_text', label: 'รายละเอียดปัก', type: 'text' },
];

const PROCESS_TABLE_COLUMN_WIDTHS = {
    item: '28%',
    price: '20%',
    workerOne: '26%',
    workerTwo: '26%',
} as const;

/**
 * How many labour rows the costing column holds at its standard row height.
 * A shorter list is padded with blank rows so a worker still has lines to
 * write on; a longer one is never cut — it drops to the dense row height,
 * which fits PROCESS_TABLE_DENSE_ROW_LIMIT rows, and past that the sheet
 * grows instead of hiding the tail of the list.
 */
const PROCESS_TABLE_STANDARD_ROW_COUNT = 12;
const PROCESS_TABLE_DENSE_ROW_LIMIT = 20;

type ProcessTableDensity = 'standard' | 'dense' | 'overflow';

function resolveProcessTableDensity(rowCount: number): ProcessTableDensity {
    if (rowCount <= PROCESS_TABLE_STANDARD_ROW_COUNT) {
        return 'standard';
    }

    return rowCount <= PROCESS_TABLE_DENSE_ROW_LIMIT ? 'dense' : 'overflow';
}

export function ProductionBoardPage({
    orders,
    pagination,
    branches = [],
    fabricLookup = {},
    specCatalogLookups = {},
    specSectionsMap = {},
    initialDepartmentFilter = 'all',
    showDepartmentFilter = true,
    pageTitle,
    hideBillingColumns = false,
}: ProductionBoardPageProps) {
    const page = usePage<{
        productionPricingMap?: Record<string, ProductionPricingSummary | null>;
        useBackendSpecMapOnly?: boolean;
    }>();
    const useBackendSpecMapOnly = Boolean(
        page.props.useBackendSpecMapOnly ?? false,
    );
    const currentPath =
        typeof window !== 'undefined' ? window.location.pathname : '';
    const isScreenFlexRoute =
        currentPath.includes('/production/screen-flex') ||
        (page.url ?? '').includes('/production/screen-flex');
    const isPrintRoomPage =
        initialDepartmentFilter === 'print_room' || pageTitle === 'ห้องพิมพ์';
    const isHeatPressPage =
        initialDepartmentFilter === 'heat_press' || pageTitle === 'ห้องอัด';
    const isEmbroideryPage =
        initialDepartmentFilter === 'embroidery' || pageTitle === 'ห้องปัก';
    const isCuttingPage =
        initialDepartmentFilter === 'cutting' || pageTitle === 'ห้องตัด';
    const isSewingPage =
        initialDepartmentFilter === 'sewing' || pageTitle === 'ห้องเย็บ';
    const isScreenFlexPage =
        isScreenFlexRoute ||
        initialDepartmentFilter === 'screen_flex' ||
        pageTitle === 'สกรีน , เฟล็กซ์';
    const resolvedDepartmentFilter: ProductionDepartmentFilter =
        isScreenFlexPage ? 'screen_flex' : initialDepartmentFilter;
    const [ordersState, setOrdersState] = useState<Order[]>(orders);
    const [detailOrder, setDetailOrder] = useState<Order | null>(null);
    /**
     * The printable sheets are a stack of full A4 pages — six of them on an
     * ordinary bill, around 5,000px of scrolling. They exist to be printed, not
     * read on screen, so the dialog opens with them folded away and the floor's
     * own figures on top. They stay mounted either way: printing reads them
     * straight out of this DOM.
     */
    const [showPrintSheets, setShowPrintSheets] = useState(false);
    /**
     * A spec sheet has around thirty fields and an ordinary bill fills half of
     * them, so the blank half is shown only on request. Nothing is dropped: the
     * count on the toggle says exactly how many are waiting behind it.
     */
    const [showEmptySpecFields, setShowEmptySpecFields] = useState(false);
    /** A Form 2 bill prints a name list, and gets a button of its own for it. */
    const detailHasNameList =
        detailOrder !== null && readPersonalizationRows(detailOrder).length > 0;
    const [timelineOrder, setTimelineOrder] = useState<Order | null>(null);
    const [isRoutingUpdating, setIsRoutingUpdating] = useState(false);
    const [heatPressMachineByOrderId] = useState<Record<number, string>>({});
    const [heatPressReworkByOrderId] = useState<Record<number, string>>({});
    const [cuttingTeamByOrderId] = useState<Record<number, string>>({});
    const [cuttingReworkByOrderId] = useState<Record<number, string>>({});
    const [sewingTeamByOrderId] = useState<Record<number, string>>({});
    const [sewingReworkByOrderId] = useState<Record<number, string>>({});
    const [embroideryTeamByOrderId] = useState<Record<number, string>>({});
    const [embroideryReworkByOrderId] = useState<Record<number, string>>({});
    const [screenTeamByOrderId] = useState<Record<number, string>>({});
    const [screenReworkByOrderId] = useState<Record<number, string>>({});
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
        open: false,
        message: '',
        onConfirm: null,
    });
    const printRef = useRef<HTMLDivElement | null>(null);

    const hideConfirmDialog = () => {
        setConfirmDialog((prev) => ({
            ...prev,
            open: false,
            onConfirm: null,
        }));
    };

    const showConfirmDialog = (message: string, onConfirm: () => void) => {
        setConfirmDialog({
            open: true,
            message,
            onConfirm,
        });
    };

    const closeAuxiliaryDialogs = () => {
        hideConfirmDialog();
    };

    const syncOrdersFromBackend = () => {
        router.reload({
            only: ['orders', 'pagination'],
            preserveScroll: true,
            preserveState: true,
        });
    };

    const openOrderDetail = (row: OrderTableRow) => {
        const order = ordersState.find((item) => item.id === row.id) ?? null;
        closeAuxiliaryDialogs();
        // Every order opens folded, whatever the last one was left on.
        setShowPrintSheets(false);
        setShowEmptySpecFields(false);
        setDetailOrder(order);
    };

    /**
     * Jump to one group's sheet from its chip, unfolding the stack first. The
     * panel has to be in the DOM before it can be scrolled to, so the scroll
     * waits for the frame the unfold is painted in.
     */
    const revealPrintSheet = (groupKey: string) => {
        setShowPrintSheets(true);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const target = document.getElementById(
                    `production-sheet-${groupKey}`,
                );

                if (target && typeof target.scrollIntoView === 'function') {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                    });
                }
            });
        });
    };

    const openOrderTimeline = (row: OrderTableRow) => {
        const order = ordersState.find((item) => item.id === row.id) ?? null;

        if (!order) {
            return;
        }

        closeAuxiliaryDialogs();
        setTimelineOrder(order);
    };

    const changePage = (nextPage: number) => {
        if (!pagination || nextPage < 1 || nextPage > pagination.last_page) {
            return;
        }

        const currentUrl =
            typeof window !== 'undefined'
                ? new URL(window.location.href)
                : null;
        const params = currentUrl
            ? new URLSearchParams(currentUrl.search)
            : new URLSearchParams();
        params.set('page', String(nextPage));

        router.get(
            currentUrl ? currentUrl.pathname : '/production/kanban',
            Object.fromEntries(params.entries()),
            { preserveScroll: true },
        );
    };

    useEffect(() => {
        setOrdersState(orders);
    }, [orders]);

    useEffect(() => {
        if (!timelineOrder) {
            return;
        }

        const latestOrder = ordersState.find(
            (item) => item.id === timelineOrder.id,
        );

        if (!latestOrder) {
            setTimelineOrder(null);

            return;
        }

        if (latestOrder !== timelineOrder) {
            setTimelineOrder(latestOrder);
        }
    }, [ordersState, timelineOrder]);

    const stationLabel = (stationName: string): string =>
        getStationLabel(stationName);
    const routingStatusLabel = (status: string): string =>
        getRoutingStatusLabel(status);
    const printRoutingStatusClass = (status: string): string =>
        getPrintRoutingStatusClass(status);

    const getLatestPrintRouting = (
        order: Order | null,
    ): OrderRoutingRecord | null => {
        if (!order) {
            return null;
        }

        return (
            [...(order.routings ?? [])]
                .filter((item) => item.station_name === 'print')
                .sort((a, b) => a.id - b.id)
                .pop() ?? null
        );
    };

    const getPrintRoutingStatus = (order: Order | null): string => {
        const routing = getLatestPrintRouting(order);

        return routing?.status ?? 'pending';
    };

    const getPrintMachineLabel = (order: Order | null): string | null => {
        const routing = getLatestPrintRouting(order);

        return routing?.print_machine
            ? routing.print_machine.replace('printer_', 'เครื่องพิมพ์ ')
            : null;
    };

    const nextRoomLabelFromStation = (
        station: ProductionRoomDestination,
    ): string => nextRoomLabelFromStationHelper(station);

    const getForwardedRoomLabel = (order: Order | null): string | null => {
        if (!order) {
            return null;
        }

        const candidateStations: Array<
            | 'screen'
            | 'flex'
            | 'embroidery'
            | 'cutting'
            | 'sewing'
            | 'qc'
            | 'shipping'
        > = [
            'screen',
            'flex',
            'embroidery',
            'cutting',
            'sewing',
            'qc',
            'shipping',
        ];
        const routings = order.routings ?? [];

        const inProgressNext = routings.find(
            (routing) =>
                candidateStations.includes(
                    routing.station_name as
                        | 'screen'
                        | 'flex'
                        | 'embroidery'
                        | 'cutting'
                        | 'sewing'
                        | 'qc'
                        | 'shipping',
                ) && routing.status === 'in_progress',
        );

        if (inProgressNext) {
            const label =
                inProgressNext.station_name === 'screen' ||
                inProgressNext.station_name === 'flex'
                    ? 'ห้องสกรีน เฟล็กซ์'
                    : nextRoomLabelFromStation(
                          inProgressNext.station_name as ProductionRoomDestination,
                      );

            return label;
        }

        const completedNext = routings.find(
            (routing) =>
                candidateStations.includes(
                    routing.station_name as
                        | 'screen'
                        | 'flex'
                        | 'embroidery'
                        | 'cutting'
                        | 'sewing'
                        | 'qc'
                        | 'shipping',
                ) && routing.status === 'completed',
        );

        if (completedNext) {
            const label =
                completedNext.station_name === 'screen' ||
                completedNext.station_name === 'flex'
                    ? 'ห้องสกรีน เฟล็กซ์'
                    : nextRoomLabelFromStation(
                          completedNext.station_name as ProductionRoomDestination,
                      );

            return label;
        }

        return null;
    };

    const getHeatPressRouting = (order: Order | null) => {
        if (!order) {
            return null;
        }

        return resolveScreenFlexRouting(order);
    };

    const getHeatPressRoutingStatus = (order: Order | null): string => {
        const routing = getHeatPressRouting(order);

        if (!routing) {
            return 'pending';
        }

        if (routing.status === 'in_progress' && !routing.started_at) {
            return 'pending';
        }

        return routing.status;
    };

    const getScreenFlexRouting = (order: Order | null) => {
        if (!order) {
            return null;
        }

        return resolveScreenFlexRouting(order);
    };

    const getScreenFlexRoutingStatus = (order: Order | null): string => {
        const routing = getScreenFlexRouting(order);

        if (!routing) {
            return 'pending';
        }

        return routing.status;
    };

    const getScreenFlexCurrentStatusLabel = (order: Order | null): string => {
        if (!order) {
            return 'งานเข้าใหม่';
        }

        return resolveScreenFlexCurrentStatusLabelState(
            order,
            screenTeamByOrderId,
            screenReworkByOrderId,
        );
    };

    const getHeatPressRoutingLabel = (order: Order | null): string | null => {
        const routing = getHeatPressRouting(order);

        if (!routing) {
            return null;
        }

        const machineLabel =
            routing.heat_press_machine?.machine_name ??
            (order ? heatPressMachineByOrderId[order.id] : undefined);

        return (
            machineLabel ??
            (routing.station_name === 'flex' ? 'เฟล็ก' : 'สกรีน')
        );
    };

    const getHeatPressCurrentStation = (
        order: Order | null,
    ): 'screen' | 'flex' | null => {
        const routing = getHeatPressRouting(order);

        if (!routing) {
            return null;
        }

        return routing.station_name === 'flex' ? 'flex' : 'screen';
    };

    const getCuttingRouting = (order: Order | null) => {
        if (!order) {
            return null;
        }

        return (
            (order.routings ?? []).find(
                (routing) => routing.station_name === 'cutting',
            ) ?? null
        );
    };

    const getCuttingRoutingStatus = (order: Order | null): string => {
        return getCuttingRouting(order)?.status ?? 'pending';
    };

    const getCuttingCurrentStatusLabel = (order: Order | null): string => {
        const status = getCuttingRoutingStatus(order);
        const routing = getCuttingRouting(order);
        const orderId = order?.id;
        const teamLabel =
            routing?.cutting_team?.team_name ??
            (orderId ? cuttingTeamByOrderId[orderId] : undefined);
        const reworkNote =
            routing?.rework_note ??
            (orderId ? cuttingReworkByOrderId[orderId] : undefined);

        if (status === 'in_progress' && teamLabel) {
            return `${routingStatusLabel(status)} (${teamLabel})`;
        }

        if (status === 'rejected' && reworkNote) {
            return `${routingStatusLabel(status)} (${reworkNote})`;
        }

        return routingStatusLabel(status);
    };

    const getSewingRouting = (order: Order | null) => {
        if (!order) {
            return null;
        }

        return (
            (order.routings ?? []).find(
                (routing) => routing.station_name === 'sewing',
            ) ?? null
        );
    };

    const getSewingRoutingStatus = (order: Order | null): string => {
        return getSewingRouting(order)?.status ?? 'pending';
    };

    const getSewingCurrentStatusLabel = (order: Order | null): string => {
        const status = getSewingRoutingStatus(order);
        const routing = getSewingRouting(order);
        const orderId = order?.id;
        const teamLabel =
            routing?.sewing_team?.team_name ??
            (orderId ? sewingTeamByOrderId[orderId] : undefined);
        const reworkNote =
            routing?.rework_note ??
            (orderId ? sewingReworkByOrderId[orderId] : undefined);

        if (status === 'in_progress') {
            return teamLabel ? `แจกงาน (${teamLabel})` : 'แจกงาน';
        }

        if (status === 'rejected') {
            return reworkNote ? `แก้ไข (${reworkNote})` : 'แก้ไข';
        }

        if (status === 'completed') {
            return 'เสร็จสิ้น';
        }

        return 'งานเข้าใหม่';
    };

    const getEmbroideryRouting = (order: Order | null) => {
        return resolveEmbroideryRouting(order);
    };

    const getEmbroideryRoutingStatus = (order: Order | null): string => {
        return getEmbroideryRouting(order)?.status ?? 'pending';
    };

    const getEmbroideryCurrentStatusLabel = (order: Order | null): string => {
        const status = getEmbroideryRoutingStatus(order);
        const routing = getEmbroideryRouting(order);
        const orderId = order?.id;
        const teamLabel =
            routing?.embroidery_team?.team_name ??
            (orderId ? embroideryTeamByOrderId[orderId] : undefined);
        const reworkNote =
            routing?.rework_note ??
            (orderId ? embroideryReworkByOrderId[orderId] : undefined);

        if (status === 'in_progress') {
            return teamLabel ? `แจกงาน (${teamLabel})` : 'แจกงาน';
        }

        if (status === 'rejected') {
            return reworkNote ? `แก้ไข (${reworkNote})` : 'แก้ไข';
        }

        if (status === 'completed') {
            return 'เสร็จสิ้น';
        }

        return 'งานเข้าใหม่';
    };

    const dateOnly = (value: string | null | undefined): string => {
        if (!value) {
            return '-';
        }

        const normalized = value.includes('T')
            ? value.split('T')[0]
            : value.split(' ')[0];

        return normalized || '-';
    };

    const dateTime = (value: string | null | undefined): string => {
        if (!value) {
            return '-';
        }

        const parsed = new Date(value);

        if (Number.isNaN(parsed.getTime())) {
            return '-';
        }

        return parsed.toLocaleString('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const timelineStatusClass = (status: string): string => {
        switch (status) {
            case 'completed':
                return 'border-emerald-200 bg-emerald-50 text-emerald-700';
            case 'in_progress':
                return 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]';
            case 'rejected':
                return 'border-rose-200 bg-rose-50 text-rose-700';
            case 'skipped':
                return 'border-slate-200 bg-slate-100 text-slate-500';
            default:
                return 'border-slate-200 bg-slate-100 text-slate-500';
        }
    };

    const timelineDetailLabel = (
        routing: OrderRoutingRecord,
    ): string | null => {
        if (routing.station_name === 'print' && routing.print_machine) {
            return routing.print_machine.replace('printer_', 'เครื่องพิมพ์ ');
        }

        if (
            routing.station_name === 'screen' ||
            routing.station_name === 'flex'
        ) {
            return (
                routing.heat_press_machine?.machine_name ??
                routing.screen_team?.team_name ??
                null
            );
        }

        return null;
    };

    const formatMoney = (value: number): string => {
        return value.toLocaleString('th-TH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const createOrderCodeBarcodeSvg = (orderCode: string): string => {
        if (typeof document === 'undefined') {
            return '';
        }

        try {
            const svgNode = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg',
            );

            JsBarcode(svgNode, orderCode, {
                format: 'CODE128',
                width: 1.35,
                height: 32,
                margin: 0,
                displayValue: true,
                text: orderCode,
                font: 'monospace',
                fontSize: 11,
                textMargin: 1,
            });

            return svgNode.outerHTML;
        } catch {
            return '';
        }
    };

    /**
     * The on-screen summary (รายละเอียดสินค้า and the artwork panel) belongs to
     * the dialog only. It used to be carried into the print window and hidden
     * by @media print, which still showed it in the print preview. Dropping it
     * from the markup keeps it off both the preview and the PDF.
     *
     * 'roster' keeps only the Form 2 name list, which prints on its own so the
     * floor can hand the list around without the group sheets attached.
     */
    const buildPrintableMarkup = (scope: 'all' | 'roster'): string | null => {
        if (!printRef.current) {
            return null;
        }

        const clone = printRef.current.cloneNode(true) as HTMLElement;

        clone
            .querySelectorAll('.p-dialog-only, .p-preview-only')
            .forEach((node) => node.remove());

        // The sheets are folded away on screen; the paper always gets all
        // of them, whether or not anyone opened the preview first.
        clone
            .querySelectorAll('[data-print-sheets]')
            .forEach((node) => node.classList.remove('hidden'));

        if (scope === 'roster') {
            clone
                .querySelectorAll('.p-print-page:not(.p-print-page-flow)')
                .forEach((node) => node.remove());
        }

        return clone.innerHTML;
    };

    const printSheets = (scope: 'all' | 'roster', title: string) => {
        if (!detailOrder) {
            return;
        }

        const printableMarkup = buildPrintableMarkup(scope);

        if (printableMarkup === null) {
            return;
        }

        const branchHeaderColor = resolveBranchHeaderColor(
            detailOrder.branch?.branch_name,
            DEFAULT_BRANCH_HEADER_COLOR,
        );

        const printWindow = window.open('', '_blank', 'width=1200,height=900');

        if (!printWindow) {
            return;
        }

        printWindow.document.write(`
            <html>
                <head>
                    <title>${title} ${detailOrder.order_code}</title>
                    <style>
                        @page { size: A4 landscape; margin: 5mm; }
                        * { box-sizing: border-box; }
                        body { font-family: "Noto Sans Thai", Arial, sans-serif; margin: 0; padding: 0; color: #0f172a; font-size: 13px; }
                        .p-sheet { width: 100%; }
                        .p-card { border: 1.2px solid #111827; border-radius: 2px; background: #ffffff; }
                        .p-head { border: 1.8px solid #0f172a; background: ${branchHeaderColor}; color: #ffffff; padding: 4px 6px; margin-bottom: 4px; display: grid; grid-template-columns: 1fr auto; gap: 4px; align-items: start; }
                        .p-head h2 { margin: 0 0 3px; font-size: 20px; line-height: 1.1; }
                        .p-head-title { display: inline-block; background: ${branchHeaderColor}; color: #ffffff; padding: 1px 7px; border-radius: 2px; }
                        .p-head p { margin: 0; font-size: 13px; line-height: 1.3; color: #ffffff; }
                        .p-head strong { color: #ffffff; }
                        .p-head .p-muted { color: #dbeafe; }
                        .p-head-emphasis { display: inline-flex; align-items: center; gap: 3px; border: 1px solid #bfdbfe; background: rgba(255, 255, 255, 0.12); color: #ffffff; padding: 0 6px; border-radius: 999px; font-weight: 700; }
                        .p-head-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px 8px; margin-top: 1px; }
                        .p-badge { border: 1.2px solid #bfdbfe; border-radius: 2px; padding: 5px 8px; min-width: 165px; text-align: right; font-size: 13px; background: rgba(255, 255, 255, 0.10); color: #ffffff; }
                        .p-badge strong { display: block; font-size: 21px; line-height: 1.1; color: #ffffff; }
                        .p-barcode-wrap { margin-top: 3px; border: 1px solid #111827; padding: 1px 2px; background: #ffffff; text-align: center; }
                        .p-barcode-wrap svg { display: block; width: 100%; height: 14mm; }
                        .p-barcode-fallback { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
                        .p-grid { display: grid; grid-template-columns: 1fr; gap: 6px; margin-bottom: 6px; }
                        .p-block { padding: 6px; }
                        .p-title { margin: 0 0 5px; font-size: 14px; font-weight: 700; border-bottom: 1.2px solid #111827; padding-bottom: 3px; }
                        .p-muted { color: #334155; font-size: 13px; }
                        .p-image-grid { display: flex; flex-direction: row; flex-wrap: nowrap; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
                        .p-image-card { flex: 0 0 180px; border: 1.2px solid #111827; background: #f8fafc; border-radius: 4px; padding: 4px; overflow: hidden; }
                        .p-image-wrap { border: 1.2px solid #cbd5e1; height: 60mm; width: 100%; display: flex; align-items: center; justify-content: center; background: #f8fafc; overflow: hidden; border-radius: 3px; }
                        .p-image-wrap { border: 1.2px solid #cbd5e1; height: ${PRODUCTION_ARTWORK_CONTAINER_HEIGHT}; min-height: ${PRODUCTION_ARTWORK_CONTAINER_HEIGHT}; max-height: ${PRODUCTION_ARTWORK_CONTAINER_HEIGHT}; width: 100%; display: flex; align-items: center; justify-content: center; background: #f8fafc; overflow: hidden; border-radius: 3px; }
                        .p-image-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1.2px solid #111827; padding: 4px 6px; font-size: 13px; line-height: 1.35; vertical-align: top; }
                        th { background: #eef2f7; font-weight: 700; }
                        .text-right { text-align: right; }
                        .text-center { text-align: center; }
                        .text-danger { color: #b91c1c; }
                        .p-section { margin-top: 6px; }
                        .p-two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
                        .p-spec-group { border: 1.2px solid #111827; background: #ffffff; border-radius: 2px; overflow: hidden; }
                        .p-spec-group h4 { margin: 0; background: #f1f5f9; padding: 5px 8px; font-size: 14px; font-weight: 700; color: #0f172a; }
                        .p-spec-table { width: 100%; border-collapse: collapse; font-size: 13px; }
                        .p-spec-table td { border-top: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; line-height: 1.35; }
                        .p-spec-table td:first-child { width: 46%; border-right: 1px solid #cbd5e1; background: #f8fafc; font-weight: 700; }
                        .p-spec-table tr:first-child td { border-top: none; }
                        .p-foot { margin-top: 6px; display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: end; }
                        .p-foot p { margin: 2px 0; font-size: 14px; }
                        .p-total { font-size: 19px; font-weight: 700; }
                        .p-note { margin-top: 3px; font-size: 12px; color: #475569; }
                        .p-tight { letter-spacing: -0.1px; }
                        .p-print-page { border: 1.2px solid #111827; border-radius: 4px; background: #ffffff; padding: 10px; }
                        .p-print-page + .p-print-page { margin-top: 10px; }
                        .p-page-header { border: 1.2px solid #78350f; border-radius: 4px; background: #b45309; color: #ffffff; padding: 4px 6px; margin-bottom: 4px; }
                        .p-page-header-grid { display: grid; grid-template-columns: 34mm minmax(0, 1fr) minmax(0, 1fr) 330px; gap: 10px; align-items: start; }
                        .p-page-header-logo { background: #ffffff; border-radius: 3px; padding: 4px 6px; display: flex; align-items: center; justify-content: center; }
                        .p-page-header-logo img { width: 100%; max-height: 18mm; object-fit: contain; display: block; }
                        .p-page-header-title { margin: 0 0 3px; font-size: 20px; line-height: 1.1; font-weight: 800; }
                        .p-page-header-col { display: grid; gap: 1px; }
                        .p-page-header-row { margin: 0; font-size: 13px; line-height: 1.35; color: #fef3c7; }
                        .p-page-header-row strong { color: #ffffff; font-weight: 800; overflow-wrap: anywhere; }
                        .p-page-header-label { color: #fef3c7; font-weight: 700; }
                        .p-page-header-right { border: 1px solid #fcd34d; border-radius: 3px; background: rgba(255, 255, 255, 0.08); padding: 3px 5px; }
                        .p-page-header-barcode { margin-top: 2px; border: 1px solid #78350f; border-radius: 2px; background: #ffffff; padding: 1px 2px; text-align: center; }
                        .p-page-header-barcode svg { display: block; width: 100%; height: 14mm; }
                        .p-page-header-code { margin: 2px 0 0; color: #1f2937; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
                        /* The costing column used to stop wherever its rows ran out,
                           leaving a block of white down the right of the sheet while the
                           artwork column ran on. Both columns now stretch to the same
                           height and the costing table fills its card, so the space is
                           spent on writing room instead. */
                        .p-form-grid { display: grid; grid-template-columns: minmax(0, 58fr) minmax(0, 42fr); gap: 8px; align-items: stretch; }
                        .p-form-left, .p-form-right { border: 0; border-radius: 2px; overflow: hidden; background: #fff; }
                        .p-form-right { display: flex; flex-direction: column; }
                        .p-form-right .p-form-body { flex: 1 1 auto; display: flex; flex-direction: column; }
                        .p-form-right .p-process-table { flex: 1 1 auto; height: 100%; }
                        .p-yellow-head { background: #facc15; color: #111827; font-weight: 700; padding: 6px 8px; border-bottom: 1.2px solid #111827; font-size: 15px; }
                        .p-size-chip { display: inline-flex; align-items: center; border: 1.2px solid #111827; padding: 3px 10px; border-radius: 999px; font-size: 13px; font-weight: 700; background: #fef9c3; }
                        .p-form-body { padding: 6px; }
                        /* The work sheet's own stylesheet, which travels with the
                           markup, owns the artwork band. These rules only fill in
                           the parts of it the sheet does not set for itself: a
                           fixed 50mm cap here used to win on specificity and hold
                           the picture to a third of the band it was given. */
                        .p-artwork-box { border: 1.2px solid #111827; background: #f8fafc; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                        .p-artwork-box img { width: 100%; height: 100%; object-fit: contain; }
                        .p-artwork-empty { color: #64748b; font-size: 10px; font-weight: 600; }
                        .p-spec-title { margin: 8px 0 4px; font-weight: 700; font-size: 15px; color: #0f172a; }
                        .p-spec-grid { width: 100%; border-collapse: collapse; }
                        .p-spec-grid td { border: 1px solid #111827; padding: 4px 6px; font-size: 13px; }
                        .p-spec-grid td:first-child { width: 42%; background: #f8fafc; font-weight: 700; }
                        .p-size-bar { margin-top: 4px; }
                        .p-size-bar th, .p-size-bar td { border: 1px solid #111827; font-size: 13px; padding: 4px 5px; text-align: center; }
                        .p-size-bar thead th { background: #fde68a; font-weight: 700; }
                        .p-size-total { background: #fde68a; font-weight: 700; }
                        .p-size-filled { background: #bbf7d0; color: #14532d; font-weight: 700; }
                        .p-process-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                        .p-process-table th, .p-process-table td { border: 1px solid #111827; padding: 4px 6px; font-size: 13px; }
                        .p-process-table thead th { background: #fde68a; font-weight: 700; }
                        .p-process-table th:first-child, .p-process-table td:first-child { white-space: normal; word-break: normal; overflow-wrap: break-word; }
                        .p-process-table th:nth-child(2), .p-process-table td:nth-child(2) { white-space: nowrap; }
                        .p-signature-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 6px; }
                        .p-sign-box { border: 1px solid #111827; min-height: 30px; padding: 4px 6px; font-size: 12px; }
                        .p-bottom-meta { margin-top: 8px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; font-size: 13px; }
                        @media print {
                            .p-dialog-only { display: none !important; }
                            .p-preview-only { display: none !important; }
                            .p-print-page {
                                page-break-after: always;
                                break-after: page;
                                margin: 0;
                            }
                            .p-print-page:last-child {
                                page-break-after: auto;
                                break-after: auto;
                            }
                        }
                    </style>
                </head>
                <body>${printableMarkup}</body>
            </html>
        `);
        printWindow.document.close();

        const printImages = Array.from(printWindow.document.images);
        printImages.forEach((image) => {
            image.loading = 'eager';
            image.decoding = 'sync';
        });

        const waitForImage = (image: HTMLImageElement): Promise<void> => {
            if (image.complete && image.naturalWidth > 0) {
                return Promise.resolve();
            }

            return new Promise((resolve) => {
                let settled = false;
                const done = () => {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    resolve();
                };

                image.addEventListener('load', done, { once: true });
                image.addEventListener('error', done, { once: true });
                window.setTimeout(done, 1800);
            });
        };

        void Promise.all(printImages.map(waitForImage)).finally(() => {
            printWindow.focus();
            printWindow.print();
        });
    };

    const handlePrintDocument = () => printSheets('all', 'ใบรับงาน');

    const handlePrintRoster = () => printSheets('roster', 'ใบรายชื่อสกรีน');

    const resolveCsrfToken = (): string | null => {
        const metaToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content')
            ?.trim();

        if (metaToken) {
            return metaToken;
        }

        const xsrfCookie = document.cookie
            .split('; ')
            .find((part) => part.startsWith('XSRF-TOKEN='));

        if (!xsrfCookie) {
            return null;
        }

        const rawValue = xsrfCookie.slice('XSRF-TOKEN='.length);

        return decodeURIComponent(rawValue);
    };

    const updatePrintRoutingStatus = (
        newStatus: 'in_progress' | 'completed' | 'skipped',
        printMachine?: 'printer_1' | 'printer_2' | 'printer_3',
    ) => {
        if (!detailOrder || isRoutingUpdating) {
            return;
        }

        if (newStatus === 'in_progress' && !printMachine) {
            return;
        }

        const csrfToken = resolveCsrfToken();

        setIsRoutingUpdating(true);

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };

        if (csrfToken) {
            headers['X-CSRF-TOKEN'] = csrfToken;
            headers['X-XSRF-TOKEN'] = csrfToken;
        }

        const currentPrintRouting = getLatestPrintRouting(detailOrder);
        const optimisticTimestamp = new Date().toISOString();
        const fallbackPrintRouting = createOptimisticRouting(
            detailOrder.id,
            'print',
        );

        applyRoutingPatch(
            detailOrder.id,
            'print',
            {
                status: newStatus,
                print_machine:
                    newStatus === 'in_progress'
                        ? (printMachine ??
                          currentPrintRouting?.print_machine ??
                          null)
                        : (currentPrintRouting?.print_machine ?? null),
                started_at:
                    newStatus === 'in_progress'
                        ? (currentPrintRouting?.started_at ??
                          optimisticTimestamp)
                        : (currentPrintRouting?.started_at ?? null),
                completed_at:
                    newStatus === 'completed' || newStatus === 'skipped'
                        ? optimisticTimestamp
                        : (currentPrintRouting?.completed_at ?? null),
            },
            currentPrintRouting ? undefined : fallbackPrintRouting,
        );

        void fetch(`/orders/${detailOrder.id}/routing/advance`, {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify({
                station_name: 'print',
                new_status: newStatus,
                direct_complete: newStatus === 'completed',
                print_machine:
                    newStatus === 'in_progress' ? printMachine : null,
            }),
        })
            .then(async (response) => {
                if (!response.ok) {
                    const payload = (await response
                        .json()
                        .catch(() => null)) as {
                        message?: string;
                        errors?: Record<string, string[]>;
                    } | null;
                    const firstFieldError = payload?.errors
                        ? Object.values(payload.errors)[0]?.[0]
                        : null;

                    throw new Error(
                        firstFieldError ??
                            payload?.message ??
                            'ไม่สามารถอัปเดตสถานะได้',
                    );
                }

                return response.json() as Promise<{ data: OrderRoutingRecord }>;
            })
            .then((payload) => {
                const targetOrderId = detailOrder.id;
                const updatedRouting = payload.data;

                const patchUpdatedRouting = (
                    existing: OrderRoutingRecord[],
                ): OrderRoutingRecord[] => {
                    if (
                        existing.some(
                            (routing) => routing.id === updatedRouting.id,
                        )
                    ) {
                        return existing.map((routing) =>
                            routing.id === updatedRouting.id
                                ? { ...routing, ...updatedRouting }
                                : routing,
                        );
                    }

                    const sameStationRoutings = [...existing].filter(
                        (routing) =>
                            routing.station_name ===
                            updatedRouting.station_name,
                    );
                    const latestFallbackRouting = sameStationRoutings
                        .sort((a, b) => a.id - b.id)
                        .pop();

                    if (latestFallbackRouting && latestFallbackRouting.id < 0) {
                        return existing.map((routing) =>
                            routing.id === latestFallbackRouting.id
                                ? { ...routing, ...updatedRouting }
                                : routing,
                        );
                    }

                    return [...existing, updatedRouting];
                };

                setOrdersState((prevOrders) =>
                    prevOrders.map((order) => {
                        if (order.id !== targetOrderId) {
                            return order;
                        }

                        return {
                            ...order,
                            routings: patchUpdatedRouting(order.routings ?? []),
                        };
                    }),
                );

                setDetailOrder((prev) => {
                    if (!prev) {
                        return prev;
                    }

                    return {
                        ...prev,
                        routings: patchUpdatedRouting(prev.routings ?? []),
                    };
                });
            })
            .catch((error: unknown) => {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'ไม่สามารถอัปเดตสถานะได้';
                window.alert(message);
            })
            .finally(() => {
                syncOrdersFromBackend();
                setIsRoutingUpdating(false);
            });
    };

    const advanceRoutingStation = async (
        orderId: number,
        stationName:
            | 'print'
            | 'screen'
            | 'flex'
            | 'embroidery'
            | 'cutting'
            | 'sewing'
            | 'qc'
            | 'shipping',
        newStatus:
            'pending' | 'in_progress' | 'completed' | 'rejected' | 'skipped',
        printMachine?: 'printer_1' | 'printer_2' | 'printer_3',
        cuttingTeamId?: number,
        sewingTeamId?: number,
        embroideryTeamId?: number,
        screenTeamId?: number,
        heatPressMachineId?: number,
        reworkNote?: string,
    ): Promise<OrderRoutingRecord> => {
        const csrfToken = resolveCsrfToken();

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };

        if (csrfToken) {
            headers['X-CSRF-TOKEN'] = csrfToken;
            headers['X-XSRF-TOKEN'] = csrfToken;
        }

        const response = await fetch(`/orders/${orderId}/routing/advance`, {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify({
                station_name: stationName,
                new_status: newStatus,
                direct_complete: newStatus === 'completed',
                print_machine:
                    stationName === 'print' && newStatus === 'in_progress'
                        ? printMachine
                        : null,
                cutting_team_id:
                    stationName === 'cutting' && newStatus === 'in_progress'
                        ? (cuttingTeamId ?? null)
                        : null,
                sewing_team_id:
                    stationName === 'sewing' && newStatus === 'in_progress'
                        ? (sewingTeamId ?? null)
                        : null,
                embroidery_team_id:
                    stationName === 'embroidery' && newStatus === 'in_progress'
                        ? (embroideryTeamId ?? null)
                        : null,
                screen_team_id:
                    ['screen', 'flex'].includes(stationName) &&
                    newStatus === 'in_progress'
                        ? (screenTeamId ?? null)
                        : null,
                heat_press_machine_id:
                    ['screen', 'flex'].includes(stationName) &&
                    newStatus === 'in_progress'
                        ? (heatPressMachineId ?? null)
                        : null,
                rework_note:
                    [
                        'cutting',
                        'sewing',
                        'embroidery',
                        'screen',
                        'flex',
                    ].includes(stationName) && newStatus === 'rejected'
                        ? (reworkNote ?? null)
                        : null,
            }),
        });

        if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
                message?: string;
                errors?: Record<string, string[]>;
            } | null;
            const firstFieldError = payload?.errors
                ? Object.values(payload.errors)[0]?.[0]
                : null;

            throw new Error(
                firstFieldError ??
                    payload?.message ??
                    'ไม่สามารถอัปเดตสถานะได้',
            );
        }

        const payload = (await response.json()) as { data: OrderRoutingRecord };

        return payload.data;
    };

    const applyRoutingPatch = (
        orderId: number,
        stationName:
            | 'print'
            | 'screen'
            | 'flex'
            | 'embroidery'
            | 'cutting'
            | 'sewing'
            | 'qc'
            | 'shipping',
        patch: Partial<OrderRoutingRecord>,
        fallbackRouting?: OrderRoutingRecord,
    ) => {
        const patchOrder = (order: Order): Order => {
            if (order.id !== orderId) {
                return order;
            }

            const existingRoutings = order.routings ?? [];
            const targetRouting =
                [...existingRoutings]
                    .filter((routing) => routing.station_name === stationName)
                    .sort((a, b) => a.id - b.id)
                    .pop() ?? null;

            if (targetRouting) {
                return {
                    ...order,
                    routings: existingRoutings.map((routing) =>
                        routing.id === targetRouting.id
                            ? {
                                  ...routing,
                                  ...patch,
                              }
                            : routing,
                    ),
                };
            }

            if (!fallbackRouting) {
                return order;
            }

            return {
                ...order,
                routings: [...existingRoutings, fallbackRouting],
            };
        };

        setOrdersState((prevOrders) => prevOrders.map(patchOrder));
        setDetailOrder((prev) => (prev ? patchOrder(prev) : prev));
    };

    const updateHeatPressRoutingStatus = (
        newStatus: 'in_progress' | 'completed' | 'rejected' | 'skipped',
        options?: { machine?: HeatPressMachine; reworkNote?: string },
    ) => {
        if (!detailOrder || isRoutingUpdating) {
            return;
        }

        const currentStation = getHeatPressCurrentStation(detailOrder);

        if (!currentStation) {
            return;
        }

        setIsRoutingUpdating(true);

        const currentRouting = detailOrder.routings?.find(
            (routing) => routing.station_name === currentStation,
        );
        const optimisticTimestamp = new Date().toISOString();

        applyRoutingPatch(detailOrder.id, currentStation, {
            status: newStatus,
            started_at:
                newStatus === 'in_progress'
                    ? (currentRouting?.started_at ?? optimisticTimestamp)
                    : (currentRouting?.started_at ?? null),
            completed_at:
                newStatus === 'completed' || newStatus === 'skipped'
                    ? optimisticTimestamp
                    : (currentRouting?.completed_at ?? null),
            heat_press_machine_id:
                options?.machine?.id ?? currentRouting?.heat_press_machine_id,
            heat_press_machine:
                options?.machine ?? currentRouting?.heat_press_machine,
            rework_note: options?.reworkNote ?? currentRouting?.rework_note,
        });

        void advanceRoutingStation(
            detailOrder.id,
            currentStation,
            newStatus,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            options?.machine?.id,
            options?.reworkNote,
        )
            .then((updatedRouting) => {
                applyRoutingPatch(
                    detailOrder.id,
                    currentStation,
                    updatedRouting,
                );
            })
            .catch((error: unknown) => {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'ไม่สามารถอัปเดตสถานะได้';
                window.alert(message);
            })
            .finally(() => {
                syncOrdersFromBackend();
                setIsRoutingUpdating(false);
            });
    };

    const updateCuttingRoutingStatus = (
        newStatus: 'in_progress' | 'completed' | 'rejected' | 'skipped',
        options?: { cuttingTeam?: CuttingTeam; reworkNote?: string },
    ) => {
        if (!detailOrder || isRoutingUpdating) {
            return;
        }

        const currentRouting = getCuttingRouting(detailOrder);

        if (!currentRouting) {
            return;
        }

        setIsRoutingUpdating(true);

        const optimisticTimestamp = new Date().toISOString();

        applyRoutingPatch(detailOrder.id, 'cutting', {
            status: newStatus,
            started_at:
                newStatus === 'in_progress'
                    ? (currentRouting.started_at ?? optimisticTimestamp)
                    : (currentRouting.started_at ?? null),
            completed_at:
                newStatus === 'completed' || newStatus === 'skipped'
                    ? optimisticTimestamp
                    : (currentRouting.completed_at ?? null),
            cutting_team_id:
                options?.cuttingTeam?.id ?? currentRouting.cutting_team_id,
            cutting_team: options?.cuttingTeam ?? currentRouting.cutting_team,
            rework_note: options?.reworkNote ?? currentRouting.rework_note,
        });

        void advanceRoutingStation(
            detailOrder.id,
            'cutting',
            newStatus,
            undefined,
            options?.cuttingTeam?.id,
            undefined,
            undefined,
            undefined,
            undefined,
            options?.reworkNote,
        )
            .then((updatedRouting) => {
                applyRoutingPatch(detailOrder.id, 'cutting', updatedRouting);
            })
            .catch((error: unknown) => {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'ไม่สามารถอัปเดตสถานะได้';
                window.alert(message);
            })
            .finally(() => {
                syncOrdersFromBackend();
                setIsRoutingUpdating(false);
            });
    };

    const updateSewingRoutingStatus = (
        newStatus: 'in_progress' | 'completed' | 'rejected' | 'skipped',
        options?: { sewingTeam?: SewingTeam; reworkNote?: string },
    ) => {
        if (!detailOrder || isRoutingUpdating) {
            return;
        }

        const currentRouting = getSewingRouting(detailOrder);

        if (!currentRouting) {
            return;
        }

        setIsRoutingUpdating(true);

        const optimisticTimestamp = new Date().toISOString();

        applyRoutingPatch(detailOrder.id, 'sewing', {
            status: newStatus,
            started_at:
                newStatus === 'in_progress'
                    ? (currentRouting.started_at ?? optimisticTimestamp)
                    : (currentRouting.started_at ?? null),
            completed_at:
                newStatus === 'completed' || newStatus === 'skipped'
                    ? optimisticTimestamp
                    : (currentRouting.completed_at ?? null),
            sewing_team_id:
                options?.sewingTeam?.id ?? currentRouting.sewing_team_id,
            sewing_team: options?.sewingTeam ?? currentRouting.sewing_team,
            rework_note: options?.reworkNote ?? currentRouting.rework_note,
        });

        void advanceRoutingStation(
            detailOrder.id,
            'sewing',
            newStatus,
            undefined,
            undefined,
            options?.sewingTeam?.id,
            undefined,
            undefined,
            undefined,
            options?.reworkNote,
        )
            .then((updatedRouting) => {
                applyRoutingPatch(detailOrder.id, 'sewing', updatedRouting);
            })
            .catch((error: unknown) => {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'ไม่สามารถอัปเดตสถานะได้';
                window.alert(message);
            })
            .finally(() => {
                syncOrdersFromBackend();
                setIsRoutingUpdating(false);
            });
    };

    const updateEmbroideryRoutingStatus = (
        newStatus: 'in_progress' | 'completed' | 'rejected' | 'skipped',
        options?: { embroideryTeam?: EmbroideryTeam; reworkNote?: string },
    ) => {
        if (!detailOrder || isRoutingUpdating) {
            return;
        }

        const currentRouting = getEmbroideryRouting(detailOrder);

        if (!currentRouting) {
            return;
        }

        setIsRoutingUpdating(true);

        const optimisticTimestamp = new Date().toISOString();

        applyRoutingPatch(detailOrder.id, 'embroidery', {
            status: newStatus,
            started_at:
                newStatus === 'in_progress'
                    ? (currentRouting.started_at ?? optimisticTimestamp)
                    : (currentRouting.started_at ?? null),
            completed_at:
                newStatus === 'completed' || newStatus === 'skipped'
                    ? optimisticTimestamp
                    : (currentRouting.completed_at ?? null),
            embroidery_team_id:
                options?.embroideryTeam?.id ??
                currentRouting.embroidery_team_id,
            embroidery_team:
                options?.embroideryTeam ?? currentRouting.embroidery_team,
            rework_note: options?.reworkNote ?? currentRouting.rework_note,
        });

        void advanceRoutingStation(
            detailOrder.id,
            'embroidery',
            newStatus,
            undefined,
            undefined,
            undefined,
            options?.embroideryTeam?.id,
            undefined,
            undefined,
            options?.reworkNote,
        )
            .then((updatedRouting) => {
                applyRoutingPatch(detailOrder.id, 'embroidery', updatedRouting);
            })
            .catch((error: unknown) => {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'ไม่สามารถอัปเดตสถานะได้';
                window.alert(message);
            })
            .finally(() => {
                syncOrdersFromBackend();
                setIsRoutingUpdating(false);
            });
    };

    const updateScreenFlexRoutingStatus = (
        station: 'screen' | 'flex',
        newStatus: 'in_progress' | 'completed' | 'rejected' | 'skipped',
        options?: { screenTeam?: ScreenTeam; reworkNote?: string },
    ) => {
        if (!detailOrder || isRoutingUpdating) {
            return;
        }

        const currentRouting = (detailOrder.routings ?? []).find(
            (routing) => routing.station_name === station,
        );

        if (!currentRouting) {
            return;
        }

        setIsRoutingUpdating(true);

        const optimisticTimestamp = new Date().toISOString();

        applyRoutingPatch(detailOrder.id, station, {
            status: newStatus,
            started_at:
                newStatus === 'in_progress'
                    ? (currentRouting.started_at ?? optimisticTimestamp)
                    : (currentRouting.started_at ?? null),
            completed_at:
                newStatus === 'completed' || newStatus === 'skipped'
                    ? optimisticTimestamp
                    : (currentRouting.completed_at ?? null),
            screen_team_id:
                options?.screenTeam?.id ?? currentRouting.screen_team_id,
            screen_team: options?.screenTeam ?? currentRouting.screen_team,
            rework_note: options?.reworkNote ?? currentRouting.rework_note,
        });

        void advanceRoutingStation(
            detailOrder.id,
            station,
            newStatus,
            undefined,
            undefined,
            undefined,
            undefined,
            options?.screenTeam?.id,
            undefined,
            options?.reworkNote,
        )
            .then((updatedRouting) => {
                applyRoutingPatch(detailOrder.id, station, updatedRouting);
            })
            .catch((error: unknown) => {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'ไม่สามารถอัปเดตสถานะได้';
                window.alert(message);
            })
            .finally(() => {
                syncOrdersFromBackend();
                setIsRoutingUpdating(false);
            });
    };

    const createOptimisticRouting = (
        orderId: number,
        station:
            | 'print'
            | 'screen'
            | 'flex'
            | 'embroidery'
            | 'cutting'
            | 'sewing'
            | 'qc'
            | 'shipping',
    ): OrderRoutingRecord => {
        const now = new Date().toISOString();

        return {
            id: -Math.floor(Date.now() + Math.random() * 1000),
            order_id: orderId,
            station_name: station,
            status: 'in_progress' as const,
            is_required: true,
            started_at: now,
            completed_at: null,
            assigned_user_id: null,
            assigned_user: undefined,
            cutting_team_id: null,
            cutting_team: undefined,
            sewing_team_id: null,
            sewing_team: undefined,
            embroidery_team_id: null,
            embroidery_team: undefined,
            screen_team_id: null,
            screen_team: undefined,
            heat_press_machine_id: null,
            heat_press_machine: undefined,
            rework_note: null,
            created_at: now,
            updated_at: now,
            print_machine: null,
        };
    };

    const parseSpecPayload = (
        order: Order,
    ): {
        shirt: Record<string, string | number | null | undefined>;
        pants: Record<string, string | number | null | undefined>;
    } => {
        const raw = order.specification?.screen_print_detail;
        const spec = order.specification;

        const fallbackShirt: Record<
            string,
            string | number | null | undefined
        > = {
            pattern_id: spec?.pattern_id,
            fabric_id: spec?.fabric_id,
            neck_style_id: spec?.neck_style_id,
            sleeve_style_text: spec?.sleeve_style,
            sleeve_cuff_id: spec?.sleeve_hem,
            placket_style_id: spec?.placket_style,
            placket_outer_color_id: spec?.placket_color,
            embroidery_code_text: spec?.embroidery_code,
            sublimation_id: spec?.sublimation_detail,
        };

        const fallbackPants: Record<
            string,
            string | number | null | undefined
        > = {
            pattern_id: spec?.pattern_id,
            fabric_id: spec?.fabric_id,
            leg_style_id: spec?.leg_style,
            leg_cuff_id: spec?.leg_hem,
            embroidery_code_text: spec?.embroidery_code,
            sublimation_id: spec?.sublimation_detail,
        };

        if (!raw || typeof raw !== 'string') {
            return { shirt: fallbackShirt, pants: fallbackPants };
        }

        try {
            const firstPass = JSON.parse(raw) as unknown;
            const parsed = (
                typeof firstPass === 'string'
                    ? JSON.parse(firstPass)
                    : firstPass
            ) as {
                shirt_specs?: Record<
                    string,
                    string | number | null | undefined
                >;
                pants_specs?: Record<
                    string,
                    string | number | null | undefined
                >;
                shirtSpecs?: Record<string, string | number | null | undefined>;
                pantsSpecs?: Record<string, string | number | null | undefined>;
            };

            const shirt = parsed.shirt_specs ?? parsed.shirtSpecs ?? {};
            const pants = parsed.pants_specs ?? parsed.pantsSpecs ?? {};

            return {
                shirt: Object.keys(shirt).length > 0 ? shirt : fallbackShirt,
                pants: Object.keys(pants).length > 0 ? pants : fallbackPants,
            };
        } catch {
            return { shirt: fallbackShirt, pants: fallbackPants };
        }
    };

    const toSpecRows = (
        source: Record<string, string | number | null | undefined>,
        fields: SpecField[],
    ): Array<{ label: string; value: string }> => {
        const mapCatalogValue = (
            storageKeys: string[] | undefined,
            rawValue: string,
        ): string => {
            if (!storageKeys || storageKeys.length === 0) {
                return rawValue;
            }

            for (const storageKey of storageKeys) {
                const mapped = specCatalogLookups[storageKey]?.[rawValue];

                if (mapped && mapped.trim() !== '') {
                    return mapped;
                }
            }

            if (storageKeys.includes('jssport.shirt-fabrics')) {
                return fabricLookup[rawValue] ?? rawValue;
            }

            return rawValue;
        };

        return fields
            .map((field) => {
                const raw = source[field.key];

                if (raw === null || raw === undefined) {
                    return null;
                }

                const value = String(raw).trim();

                if (value === '') {
                    return null;
                }

                if (field.type === 'catalog') {
                    return {
                        label: field.label,
                        value: mapCatalogValue(field.storageKeys, value),
                    };
                }

                return {
                    label: field.label,
                    value,
                };
            })
            .filter(
                (row): row is { label: string; value: string } => row !== null,
            );
    };

    return (
        <>
            <Head title={pageTitle} />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <ProductionKanbanBoard
                    orders={ordersState}
                    branches={branches}
                    initialDepartmentFilter={resolvedDepartmentFilter}
                    showDepartmentFilter={showDepartmentFilter}
                    hideBillingColumns={hideBillingColumns}
                    cuttingTeamByOrderId={cuttingTeamByOrderId}
                    cuttingReworkByOrderId={cuttingReworkByOrderId}
                    sewingTeamByOrderId={sewingTeamByOrderId}
                    sewingReworkByOrderId={sewingReworkByOrderId}
                    heatPressMachineByOrderId={heatPressMachineByOrderId}
                    heatPressReworkByOrderId={heatPressReworkByOrderId}
                    embroideryTeamByOrderId={embroideryTeamByOrderId}
                    embroideryReworkByOrderId={embroideryReworkByOrderId}
                    screenTeamByOrderId={screenTeamByOrderId}
                    onOpenDetail={openOrderDetail}
                    onOpenTimeline={openOrderTimeline}
                />

                {pagination && pagination.last_page > 1 ? (
                    <div className="flex flex-col gap-3 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-[0_2px_6px_rgba(15,23,42,0.05)] md:flex-row md:items-center md:justify-between">
                        <p className="text-xs text-slate-600">
                            แสดง {pagination.from ?? 0} - {pagination.to ?? 0}{' '}
                            จาก {pagination.total} ออร์เดอร์
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    changePage(pagination.current_page - 1)
                                }
                                disabled={pagination.current_page <= 1}
                            >
                                ก่อนหน้า
                            </Button>
                            <span className="text-xs font-medium text-slate-700">
                                หน้า {pagination.current_page} /{' '}
                                {pagination.last_page}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    changePage(pagination.current_page + 1)
                                }
                                disabled={
                                    pagination.current_page >=
                                    pagination.last_page
                                }
                            >
                                ถัดไป
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>

            <Dialog
                open={confirmDialog.open}
                onOpenChange={(open) => {
                    if (!open) {
                        hideConfirmDialog();
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>ยืนยันการทำรายการ</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">
                        {confirmDialog.message}
                    </p>
                    <DialogFooter className="mt-4 gap-2">
                        <Button
                            variant="outline"
                            onClick={hideConfirmDialog}
                            type="button"
                        >
                            ยกเลิก
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                confirmDialog.onConfirm?.();
                                hideConfirmDialog();
                            }}
                            disabled={isRoutingUpdating}
                        >
                            ยืนยัน
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={detailOrder !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDetailOrder(null);
                    }
                }}
            >
                <DialogContent className="max-h-[94vh] overflow-y-auto p-0 sm:max-w-6xl [&>button]:hidden">
                    {detailOrder ? (
                        <div className="sticky top-0 z-30">
                            <WorkReceiptTopBar
                                orderCode={detailOrder.order_code}
                                onPrint={handlePrintDocument}
                                onClose={() => setDetailOrder(null)}
                                currentStatusLabel={(() => {
                                    if (isEmbroideryPage) {
                                        return getEmbroideryCurrentStatusLabel(
                                            detailOrder,
                                        );
                                    }

                                    if (isCuttingPage) {
                                        return getCuttingCurrentStatusLabel(
                                            detailOrder,
                                        );
                                    }

                                    if (isSewingPage) {
                                        return getSewingCurrentStatusLabel(
                                            detailOrder,
                                        );
                                    }

                                    if (isScreenFlexPage) {
                                        return getScreenFlexCurrentStatusLabel(
                                            detailOrder,
                                        );
                                    }

                                    if (!isPrintRoomPage && !isHeatPressPage) {
                                        return undefined;
                                    }

                                    const status = isPrintRoomPage
                                        ? getPrintRoutingStatus(detailOrder)
                                        : getHeatPressRoutingStatus(
                                              detailOrder,
                                          );
                                    const machineLabel = isPrintRoomPage
                                        ? getPrintMachineLabel(detailOrder)
                                        : getHeatPressRoutingLabel(detailOrder);
                                    const forwardedRoom =
                                        getForwardedRoomLabel(detailOrder);

                                    if (
                                        status === 'in_progress' &&
                                        machineLabel
                                    ) {
                                        return `${routingStatusLabel(status)} (${machineLabel})`;
                                    }

                                    if (
                                        status === 'completed' &&
                                        forwardedRoom
                                    ) {
                                        return `${routingStatusLabel(status)} -> ส่งต่อ ${forwardedRoom}`;
                                    }

                                    return routingStatusLabel(status);
                                })()}
                                currentStatusClassName={
                                    isPrintRoomPage ||
                                    isHeatPressPage ||
                                    isCuttingPage ||
                                    isSewingPage ||
                                    isEmbroideryPage ||
                                    isScreenFlexPage
                                        ? printRoutingStatusClass(
                                              isPrintRoomPage
                                                  ? getPrintRoutingStatus(
                                                        detailOrder,
                                                    )
                                                  : isEmbroideryPage
                                                    ? getEmbroideryRoutingStatus(
                                                          detailOrder,
                                                      )
                                                    : isSewingPage
                                                      ? getSewingRoutingStatus(
                                                            detailOrder,
                                                        )
                                                      : isScreenFlexPage
                                                        ? getScreenFlexRoutingStatus(
                                                              detailOrder,
                                                          )
                                                        : isHeatPressPage
                                                          ? getHeatPressRoutingStatus(
                                                                detailOrder,
                                                            )
                                                          : getCuttingRoutingStatus(
                                                                detailOrder,
                                                            ),
                                          )
                                        : undefined
                                }
                                actions={
                                    <>
                                        {detailHasNameList ? (
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                className="h-8 bg-white/95 px-3 text-xs font-semibold text-blue-800 hover:bg-white"
                                                onClick={handlePrintRoster}
                                            >
                                                <Printer className="size-3.5" />
                                                ปริ้นใบรายชื่อ
                                            </Button>
                                        ) : null}
                                        {isPrintRoomPage ||
                                        isHeatPressPage ||
                                        isCuttingPage ||
                                        isSewingPage ||
                                        isEmbroideryPage ||
                                        isScreenFlexPage ? (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        className="h-8 bg-white/95 px-2.5 text-xs font-semibold text-[#E21E26] hover:bg-white"
                                                        disabled={
                                                            isRoutingUpdating
                                                        }
                                                    >
                                                        Action
                                                        <ChevronDown className="size-3.5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent
                                                    align="end"
                                                    className="w-52"
                                                >
                                                    {isPrintRoomPage ? (
                                                        <DropdownMenuItem
                                                            disabled={
                                                                isRoutingUpdating
                                                            }
                                                            onSelect={(
                                                                event,
                                                            ) => {
                                                                event.preventDefault();
                                                                showConfirmDialog(
                                                                    'ยืนยันเสร็จสิ้นงานห้องพิมพ์หรือไม่',
                                                                    () => {
                                                                        updatePrintRoutingStatus(
                                                                            'completed',
                                                                        );
                                                                        setDetailOrder(
                                                                            null,
                                                                        );
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            เสร็จสิ้น
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                    {isHeatPressPage ? (
                                                        <DropdownMenuItem
                                                            disabled={
                                                                isRoutingUpdating ||
                                                                getHeatPressRouting(
                                                                    detailOrder,
                                                                )?.status ===
                                                                    'completed' ||
                                                                getHeatPressRouting(
                                                                    detailOrder,
                                                                )?.status ===
                                                                    'skipped'
                                                            }
                                                            onSelect={(
                                                                event,
                                                            ) => {
                                                                event.preventDefault();
                                                                showConfirmDialog(
                                                                    'ยืนยันเสร็จสิ้นงานห้องอัดหรือไม่',
                                                                    () => {
                                                                        updateHeatPressRoutingStatus(
                                                                            'completed',
                                                                        );
                                                                        setDetailOrder(
                                                                            null,
                                                                        );
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            เสร็จสิ้น
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                    {isCuttingPage ? (
                                                        <DropdownMenuItem
                                                            disabled={
                                                                isRoutingUpdating ||
                                                                getCuttingRouting(
                                                                    detailOrder,
                                                                )?.status ===
                                                                    'completed' ||
                                                                getCuttingRouting(
                                                                    detailOrder,
                                                                )?.status ===
                                                                    'skipped'
                                                            }
                                                            onSelect={(
                                                                event,
                                                            ) => {
                                                                event.preventDefault();
                                                                showConfirmDialog(
                                                                    'ยืนยันเสร็จสิ้นงานห้องตัดหรือไม่',
                                                                    () => {
                                                                        updateCuttingRoutingStatus(
                                                                            'completed',
                                                                        );
                                                                        setDetailOrder(
                                                                            null,
                                                                        );
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            เสร็จสิ้น
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                    {isSewingPage ? (
                                                        <DropdownMenuItem
                                                            disabled={
                                                                isRoutingUpdating ||
                                                                getSewingRouting(
                                                                    detailOrder,
                                                                )?.status ===
                                                                    'completed' ||
                                                                getSewingRouting(
                                                                    detailOrder,
                                                                )?.status ===
                                                                    'skipped'
                                                            }
                                                            onSelect={(
                                                                event,
                                                            ) => {
                                                                event.preventDefault();
                                                                showConfirmDialog(
                                                                    'ยืนยันเสร็จสิ้นงานห้องเย็บหรือไม่',
                                                                    () => {
                                                                        updateSewingRoutingStatus(
                                                                            'completed',
                                                                        );
                                                                        setDetailOrder(
                                                                            null,
                                                                        );
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            เสร็จสิ้น
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                    {isEmbroideryPage ? (
                                                        <DropdownMenuItem
                                                            disabled={
                                                                isRoutingUpdating ||
                                                                getEmbroideryRouting(
                                                                    detailOrder,
                                                                )?.status ===
                                                                    'completed' ||
                                                                getEmbroideryRouting(
                                                                    detailOrder,
                                                                )?.status ===
                                                                    'skipped'
                                                            }
                                                            onSelect={(
                                                                event,
                                                            ) => {
                                                                event.preventDefault();
                                                                showConfirmDialog(
                                                                    'ยืนยันเสร็จสิ้นงานห้องปักหรือไม่',
                                                                    () => {
                                                                        updateEmbroideryRoutingStatus(
                                                                            'completed',
                                                                        );
                                                                        setDetailOrder(
                                                                            null,
                                                                        );
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            เสร็จสิ้น
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                    {isScreenFlexPage ? (
                                                        <DropdownMenuItem
                                                            disabled={
                                                                isRoutingUpdating ||
                                                                getScreenFlexRouting(
                                                                    detailOrder,
                                                                )?.status ===
                                                                    'completed' ||
                                                                getScreenFlexRouting(
                                                                    detailOrder,
                                                                )?.status ===
                                                                    'skipped'
                                                            }
                                                            onSelect={(
                                                                event,
                                                            ) => {
                                                                event.preventDefault();
                                                                showConfirmDialog(
                                                                    'ยืนยันเสร็จสิ้นงานห้องสกรีน/เฟล็กซ์หรือไม่',
                                                                    () => {
                                                                        updateScreenFlexRoutingStatus(
                                                                            resolveScreenFlexRouting(
                                                                                detailOrder,
                                                                            )
                                                                                ?.station_name as
                                                                                | 'screen'
                                                                                | 'flex',
                                                                            'completed',
                                                                        );
                                                                        setDetailOrder(
                                                                            null,
                                                                        );
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            เสร็จสิ้น
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ) : null}
                                    </>
                                }
                            />
                        </div>
                    ) : (
                        <DialogHeader className="px-6 pt-6">
                            <DialogTitle>ใบรับงาน</DialogTitle>
                        </DialogHeader>
                    )}

                    {detailOrder ? (
                        <div
                            ref={printRef}
                            className="space-y-4 bg-slate-50/70 p-4 text-sm md:p-5"
                        >
                            {(() => {
                                const specs = parseSpecPayload(detailOrder);
                                const mappedSections =
                                    specSectionsMap[String(detailOrder.id)] ??
                                    null;
                                const pricingMap =
                                    page.props.productionPricingMap ?? {};
                                const productionPricing =
                                    pricingMap[String(detailOrder.id)] ?? null;
                                const hasMeaningfulValue = (
                                    value: string | number | null | undefined,
                                ): boolean => {
                                    if (value === null || value === undefined) {
                                        return false;
                                    }

                                    if (typeof value === 'number') {
                                        return value > 0;
                                    }

                                    const normalized = value.trim();

                                    return (
                                        normalized !== '' && normalized !== '0'
                                    );
                                };
                                const sanitizeSpecRows = (
                                    rows:
                                        | Array<{
                                              label: string;
                                              value:
                                                  | string
                                                  | number
                                                  | null
                                                  | undefined;
                                          }>
                                        | undefined,
                                ): Array<{ label: string; value: string }> => {
                                    return (rows ?? [])
                                        .filter((row) =>
                                            hasMeaningfulValue(row.value),
                                        )
                                        .map((row) => ({
                                            label: row.label,
                                            value: String(row.value).trim(),
                                        }));
                                };
                                const parseExplicitSpecPayload = (): {
                                    shirt: Record<
                                        string,
                                        string | number | null | undefined
                                    >;
                                    pants: Record<
                                        string,
                                        string | number | null | undefined
                                    >;
                                } => {
                                    const raw =
                                        detailOrder.specification
                                            ?.screen_print_detail;

                                    if (!raw || typeof raw !== 'string') {
                                        return { shirt: {}, pants: {} };
                                    }

                                    try {
                                        const firstPass = JSON.parse(
                                            raw,
                                        ) as unknown;
                                        const parsed = (
                                            typeof firstPass === 'string'
                                                ? JSON.parse(firstPass)
                                                : firstPass
                                        ) as {
                                            shirt_specs?: Record<
                                                string,
                                                | string
                                                | number
                                                | null
                                                | undefined
                                            >;
                                            pants_specs?: Record<
                                                string,
                                                | string
                                                | number
                                                | null
                                                | undefined
                                            >;
                                            shirtSpecs?: Record<
                                                string,
                                                | string
                                                | number
                                                | null
                                                | undefined
                                            >;
                                            pantsSpecs?: Record<
                                                string,
                                                | string
                                                | number
                                                | null
                                                | undefined
                                            >;
                                        };

                                        return {
                                            shirt:
                                                parsed.shirt_specs ??
                                                parsed.shirtSpecs ??
                                                {},
                                            pants:
                                                parsed.pants_specs ??
                                                parsed.pantsSpecs ??
                                                {},
                                        };
                                    } catch {
                                        return { shirt: {}, pants: {} };
                                    }
                                };
                                const fallbackShirtRows = toSpecRows(
                                    specs.shirt,
                                    shirtSpecFields,
                                );
                                const fallbackPantsRows = toSpecRows(
                                    specs.pants,
                                    pantsSpecFields,
                                );
                                const shirtRows = useBackendSpecMapOnly
                                    ? (mappedSections?.shirt ?? [])
                                    : (mappedSections?.shirt ??
                                      fallbackShirtRows);
                                const pantsRows = useBackendSpecMapOnly
                                    ? (mappedSections?.pants ?? [])
                                    : (mappedSections?.pants ??
                                      fallbackPantsRows);
                                const explicitSpecs =
                                    parseExplicitSpecPayload();
                                const explicitShirtRows = toSpecRows(
                                    explicitSpecs.shirt,
                                    shirtSpecFields,
                                );
                                const explicitPantsRows = toSpecRows(
                                    explicitSpecs.pants,
                                    pantsSpecFields,
                                );
                                const mappedShirtRows = sanitizeSpecRows(
                                    mappedSections?.shirt,
                                );
                                const mappedPantsRows = sanitizeSpecRows(
                                    mappedSections?.pants,
                                );
                                const shirtEvidenceRows = [
                                    ...mappedShirtRows,
                                    ...explicitShirtRows,
                                ];
                                const pantsEvidenceRows = [
                                    ...mappedPantsRows,
                                    ...explicitPantsRows,
                                ];
                                const images = [
                                    detailOrder.artwork_url,
                                    ...(detailOrder.shirt_artwork_urls ?? []),
                                    ...(detailOrder.pants_artwork_urls ?? []),
                                    ...(detailOrder.reference_designs ?? []),
                                ].filter((url): url is string => Boolean(url));
                                const orderItems = detailOrder.items ?? [];
                                const personalizationRows =
                                    readPersonalizationRows(detailOrder);
                                const isIndividualOrder =
                                    personalizationRows.length > 0;

                                // Form 3 (กีฬาสี): the colour houses live in the spec JSON because
                                // order_items has no colour column, so the print form reads them
                                // from there — the same route the individual mode already takes.
                                const sportsDayGroups = (() => {
                                    const raw =
                                        detailOrder.specification
                                            ?.screen_print_detail;

                                    if (!raw || typeof raw !== 'string') {
                                        return [];
                                    }

                                    try {
                                        const firstPass = JSON.parse(
                                            raw,
                                        ) as unknown;
                                        const parsed = (
                                            typeof firstPass === 'string'
                                                ? JSON.parse(firstPass)
                                                : firstPass
                                        ) as {
                                            mode?: unknown;
                                            sports_day_groups?: Array<{
                                                team_name?: unknown;
                                                rows?: Array<
                                                    Record<string, unknown>
                                                >;
                                            }>;
                                        };

                                        if (
                                            parsed.mode !== 'sports_day' ||
                                            !Array.isArray(
                                                parsed.sports_day_groups,
                                            )
                                        ) {
                                            return [];
                                        }

                                        return parsed.sports_day_groups.map(
                                            (group, index) => ({
                                                teamName:
                                                    typeof group.team_name ===
                                                        'string' &&
                                                    group.team_name.trim() !==
                                                        ''
                                                        ? group.team_name.trim()
                                                        : `คณะที่ ${index + 1}`,
                                                rows: (Array.isArray(group.rows)
                                                    ? group.rows
                                                    : []
                                                ).map((row) => ({
                                                    sizeGroup:
                                                        String(
                                                            row.size_group ??
                                                                'adults',
                                                        ) === 'kids'
                                                            ? ('kids' as const)
                                                            : ('adults' as const),
                                                    sizeLabel: String(
                                                        row.size_label ?? '',
                                                    ).trim(),
                                                    shirtQty:
                                                        Number(
                                                            row.shirt_qty ?? 0,
                                                        ) || 0,
                                                    pantsQty:
                                                        Number(
                                                            row.pants_qty ?? 0,
                                                        ) || 0,
                                                })),
                                            }),
                                        );
                                    } catch {
                                        return [];
                                    }
                                })();
                                const isSportsDayOrder =
                                    sportsDayGroups.length > 0;
                                const adultSizeHeaders = [
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
                                const kidSizeHeaders = [
                                    'JSS',
                                    'JS',
                                    'JM',
                                    'JL',
                                ];
                                const normalizeSizeLabel = (
                                    value: string,
                                ): string => {
                                    const normalized = value
                                        .trim()
                                        .toUpperCase();

                                    const aliases: Record<string, string> = {
                                        JSS: 'JSS',
                                        JS: 'JS',
                                        JM: 'JM',
                                        JL: 'JL',
                                        '1XL': 'XL',
                                        XXL: '2XL',
                                        '2XXL': '2XL',
                                        XXXL: '3XL',
                                        '3XXL': '3XL',
                                        XXXXL: '4XL',
                                        '4XXL': '4XL',
                                        XXXXXL: '5XL',
                                        '5XXL': '5XL',
                                        XXXXXXL: '6XL',
                                        '6XXL': '6XL',
                                    };

                                    return aliases[normalized] ?? normalized;
                                };
                                const sizeOrderMap: Record<string, number> = {
                                    ...Object.fromEntries(
                                        kidSizeHeaders.map((header, index) => [
                                            header,
                                            index + 1,
                                        ]),
                                    ),
                                    ...Object.fromEntries(
                                        adultSizeHeaders.map(
                                            (header, index) => [
                                                header,
                                                kidSizeHeaders.length +
                                                    index +
                                                    1,
                                            ],
                                        ),
                                    ),
                                };
                                const garmentAvailability =
                                    readGarmentAvailability(detailOrder);
                                const hasShirtSpecData =
                                    shirtEvidenceRows.length > 0 ||
                                    garmentAvailability.shirt;
                                const hasPantsSpecData =
                                    pantsEvidenceRows.length > 0 ||
                                    garmentAvailability.pants;
                                const hasRealData = (
                                    candidate: {
                                        garment: ProductionGroupGarment;
                                        quantity: number;
                                        sizeRows: Array<{
                                            sizeLabel: string;
                                            quantity: number;
                                        }>;
                                    },
                                    evidenceRows: Array<{
                                        label: string;
                                        value:
                                            string | number | null | undefined;
                                    }>,
                                ): boolean => {
                                    const isValidGarment =
                                        candidate.garment === 'shirt' ||
                                        candidate.garment === 'pants';

                                    if (!isValidGarment) {
                                        return false;
                                    }

                                    const hasPositiveQuantity =
                                        candidate.quantity > 0;
                                    const hasPositiveSizeQty =
                                        candidate.sizeRows.some(
                                            (row) => Number(row.quantity) > 0,
                                        );
                                    const hasAnySizeRow =
                                        candidate.sizeRows.length > 0;
                                    const hasSpecValue = evidenceRows.some(
                                        (row) => hasMeaningfulValue(row.value),
                                    );

                                    return (
                                        hasPositiveQuantity ||
                                        hasPositiveSizeQty ||
                                        (hasSpecValue && hasAnySizeRow)
                                    );
                                };
                                const resolveGarmentGroups = (
                                    itemType: string,
                                ): Array<'shirt' | 'pants'> => {
                                    const normalized = itemType
                                        .trim()
                                        .toLowerCase();

                                    if (
                                        normalized.includes('pant') ||
                                        normalized.includes('กางเกง')
                                    ) {
                                        return ['pants'];
                                    }

                                    if (
                                        normalized.includes('shirt') ||
                                        normalized.includes('เสื้อ')
                                    ) {
                                        return ['shirt'];
                                    }

                                    if (
                                        [
                                            '',
                                            'garment',
                                            'set',
                                            'combo',
                                        ].includes(normalized)
                                    ) {
                                        if (
                                            hasShirtSpecData &&
                                            hasPantsSpecData
                                        ) {
                                            return ['shirt', 'pants'];
                                        }

                                        if (
                                            hasPantsSpecData &&
                                            !hasShirtSpecData
                                        ) {
                                            return ['pants'];
                                        }
                                    }

                                    return ['shirt'];
                                };
                                const resolveSizeGroup = (
                                    sizeGroup: string,
                                ): 'kids' | 'adults' | null => {
                                    if (sizeGroup === 'kids') {
                                        return 'kids';
                                    }

                                    if (
                                        sizeGroup === 'adults' ||
                                        sizeGroup === 'oversize'
                                    ) {
                                        return 'adults';
                                    }

                                    return null;
                                };
                                // One definition per batch: garment x size group
                                // x length. Ordered so the sheets come out of
                                // the printer grouped by garment, then by size,
                                // then short before long.
                                const groupDefinitions = (
                                    ['shirt', 'pants'] as const
                                ).flatMap((garment) =>
                                    (['kids', 'adults'] as const).flatMap(
                                        (sizeGroup) =>
                                            (
                                                [
                                                    'short',
                                                    'long',
                                                    'unspecified',
                                                ] as const
                                            ).map((style) => {
                                                const baseKey =
                                                    `${garment}_${sizeGroup}` as ProductionGroupBaseKey;

                                                return {
                                                    key: `${baseKey}_${style}` as ProductionGroupKey,
                                                    baseKey,
                                                    label: `${PRODUCTION_GROUP_BASE_LABELS[baseKey]} ${PRODUCTION_STYLE_LABELS[garment][style]}`,
                                                    garment,
                                                    sizeGroup,
                                                    style,
                                                };
                                            }),
                                    ),
                                );
                                const groupData = groupDefinitions.reduce(
                                    (acc, group) => {
                                        acc[group.key] = {
                                            quantity: 0,
                                            sizes: new Map<string, number>(),
                                        };

                                        return acc;
                                    },
                                    {} as Record<
                                        string,
                                        {
                                            quantity: number;
                                            sizes: Map<string, number>;
                                        }
                                    >,
                                );

                                for (const item of orderItems) {
                                    const sizeGroup = resolveSizeGroup(
                                        String(item.size_group || ''),
                                    );

                                    if (sizeGroup === null) {
                                        continue;
                                    }

                                    const quantity = Number(item.quantity || 0);
                                    const normalizedSize = normalizeSizeLabel(
                                        String(item.size_label || ''),
                                    );

                                    for (const garment of resolveGarmentGroups(
                                        String(item.item_type || ''),
                                    )) {
                                        // A set row is one shirt and one pair of
                                        // pants, and each half takes its own
                                        // length — a set can be short sleeved
                                        // and long legged at the same time.
                                        const style = normalizeProductionStyle(
                                            garment === 'pants'
                                                ? item.pants_style
                                                : item.shirt_style,
                                        );
                                        const key = `${garment}_${sizeGroup}_${style}`;

                                        groupData[key].quantity += quantity;

                                        if (normalizedSize !== '') {
                                            groupData[key].sizes.set(
                                                normalizedSize,
                                                Number(
                                                    groupData[key].sizes.get(
                                                        normalizedSize,
                                                    ) || 0,
                                                ) + quantity,
                                            );
                                        }
                                    }
                                }

                                /**
                                 * The server prices every batch, including the
                                 * long-sleeve surcharge, so read its number for
                                 * this batch. The per-garment totals are only a
                                 * fallback for a payload without batches.
                                 */
                                const resolveGroupUnitTotal = (
                                    key: string,
                                    baseKey: ProductionGroupBaseKey,
                                ): number => {
                                    if (!productionPricing) {
                                        return 0;
                                    }

                                    const priced = (
                                        productionPricing.groups ?? []
                                    ).find((group) => group.key === key);

                                    if (priced) {
                                        return Number(priced.unit_total || 0);
                                    }

                                    switch (baseKey) {
                                        case 'shirt_kids':
                                            return Number(
                                                productionPricing.child_unit_total ||
                                                    0,
                                            );
                                        case 'shirt_adults':
                                            return Number(
                                                productionPricing.adult_unit_total ||
                                                    0,
                                            );
                                        case 'pants_kids':
                                            return Number(
                                                productionPricing.pants_child_unit_total ||
                                                    0,
                                            );
                                        case 'pants_adults':
                                            return Number(
                                                productionPricing.pants_adult_unit_total ||
                                                    0,
                                            );
                                    }
                                };
                                const sizeLabelSorter = (
                                    left: string,
                                    right: string,
                                ): number => {
                                    const leftRank =
                                        sizeOrderMap[left] ??
                                        Number.MAX_SAFE_INTEGER;
                                    const rightRank =
                                        sizeOrderMap[right] ??
                                        Number.MAX_SAFE_INTEGER;

                                    if (leftRank !== rightRank) {
                                        return leftRank - rightRank;
                                    }

                                    return left.localeCompare(right, 'th');
                                };
                                // One printed page per colour house. A house can hold both kids
                                // and adults sizes, and the size bar's columns differ between the
                                // two, so each (house × garment × size group) that actually has
                                // quantity becomes its own page — pages stay ordered by house.
                                const sportsDayProductionGroups =
                                    sportsDayGroups.flatMap((team, teamIndex) =>
                                        (['shirt', 'pants'] as const).flatMap(
                                            (garment) =>
                                                (
                                                    ['kids', 'adults'] as const
                                                ).flatMap((sizeGroup) => {
                                                    const rows =
                                                        team.rows.filter(
                                                            (row) =>
                                                                row.sizeGroup ===
                                                                sizeGroup,
                                                        );
                                                    const sizes = new Map<
                                                        string,
                                                        number
                                                    >();
                                                    let quantity = 0;

                                                    for (const row of rows) {
                                                        const rowQuantity =
                                                            garment === 'shirt'
                                                                ? row.shirtQty
                                                                : row.pantsQty;

                                                        if (rowQuantity <= 0) {
                                                            continue;
                                                        }

                                                        quantity += rowQuantity;

                                                        const normalizedLabel =
                                                            normalizeSizeLabel(
                                                                row.sizeLabel,
                                                            );

                                                        if (
                                                            normalizedLabel !==
                                                            ''
                                                        ) {
                                                            sizes.set(
                                                                normalizedLabel,
                                                                Number(
                                                                    sizes.get(
                                                                        normalizedLabel,
                                                                    ) || 0,
                                                                ) + rowQuantity,
                                                            );
                                                        }
                                                    }

                                                    if (quantity <= 0) {
                                                        return [];
                                                    }

                                                    // Sports day sheets are one
                                                    // per colour house, not per
                                                    // sleeve length, so they use
                                                    // the garment's own colour
                                                    // and its per-garment rate.
                                                    const definitionKey =
                                                        `${garment}_${sizeGroup}` as ProductionGroupBaseKey;
                                                    const unitTotal =
                                                        resolveGroupUnitTotal(
                                                            definitionKey,
                                                            definitionKey,
                                                        );
                                                    const garmentLabel =
                                                        garment === 'pants'
                                                            ? sizeGroup ===
                                                              'kids'
                                                                ? 'กางเกงเด็ก'
                                                                : 'กางเกงผู้ใหญ่'
                                                            : sizeGroup ===
                                                                'kids'
                                                              ? 'เสื้อไซต์เด็ก'
                                                              : 'เสื้อไซต์ผู้ใหญ่';

                                                    return [
                                                        {
                                                            key: `sports_day_${teamIndex}_${garment}_${sizeGroup}`,
                                                            label: `${team.teamName} · ${garmentLabel}`,
                                                            teamName:
                                                                team.teamName,
                                                            garment,
                                                            sizeGroup,
                                                            quantity,
                                                            sizeRows:
                                                                Array.from(
                                                                    sizes.entries(),
                                                                )
                                                                    .sort(
                                                                        (
                                                                            [
                                                                                left,
                                                                            ],
                                                                            [
                                                                                right,
                                                                            ],
                                                                        ) =>
                                                                            sizeLabelSorter(
                                                                                left,
                                                                                right,
                                                                            ),
                                                                    )
                                                                    .map(
                                                                        ([
                                                                            sizeLabel,
                                                                            sizeQuantity,
                                                                        ]) => ({
                                                                            sizeLabel,
                                                                            quantity:
                                                                                sizeQuantity,
                                                                        }),
                                                                    ),
                                                            unitTotal,
                                                            subtotal:
                                                                unitTotal *
                                                                quantity,
                                                            // The house's own artwork, in full. Unlike the other forms —
                                                            // which deliberately show a single image to mirror the paper
                                                            // sheet — every image attached to a colour house must reach
                                                            // that house's page, so the floor gets what was attached.
                                                            artworkUrls: (
                                                                detailOrder
                                                                    .sports_day_artwork_urls?.[
                                                                    String(
                                                                        teamIndex,
                                                                    )
                                                                ] ?? []
                                                            ).filter(
                                                                (
                                                                    url,
                                                                ): url is string =>
                                                                    typeof url ===
                                                                        'string' &&
                                                                    url.trim() !==
                                                                        '',
                                                            ),
                                                            artworkUrl:
                                                                (garment ===
                                                                'shirt'
                                                                    ? detailOrder.shirt_artwork_url?.trim()
                                                                    : detailOrder.pants_artwork_url?.trim()) ||
                                                                detailOrder.artwork_url?.trim() ||
                                                                null,
                                                            theme: resolveProductionGroupTheme(
                                                                definitionKey,
                                                                'short',
                                                            ),
                                                            specTitle:
                                                                resolveProductionSpecTitle(
                                                                    garment,
                                                                ),
                                                            components:
                                                                garment ===
                                                                'pants'
                                                                    ? (productionPricing?.pants_components ??
                                                                      [])
                                                                    : (productionPricing?.components ??
                                                                      []),
                                                        },
                                                    ];
                                                }),
                                        ),
                                    );

                                const productionGroups = isSportsDayOrder
                                    ? sportsDayProductionGroups
                                    : groupDefinitions
                                          .map((group) => {
                                              const quantity =
                                                  groupData[group.key].quantity;
                                              const unitTotal =
                                                  resolveGroupUnitTotal(
                                                      group.key,
                                                      group.baseKey,
                                                  );
                                              const subtotal =
                                                  unitTotal * quantity;
                                              const resolveGroupArtworkUrl = (
                                                  garment: ProductionGroupGarment,
                                              ): string | null => {
                                                  const normalizedShirtArtwork =
                                                      detailOrder.shirt_artwork_url?.trim() ||
                                                      null;
                                                  const normalizedPantsArtwork =
                                                      detailOrder.pants_artwork_url?.trim() ||
                                                      null;
                                                  const normalizedGeneralArtwork =
                                                      detailOrder.artwork_url?.trim() ||
                                                      null;

                                                  if (garment === 'shirt') {
                                                      return (
                                                          normalizedShirtArtwork ??
                                                          normalizedGeneralArtwork
                                                      );
                                                  }

                                                  return (
                                                      normalizedPantsArtwork ??
                                                      normalizedGeneralArtwork
                                                  );
                                              };
                                              /**
                                               * Every artwork attached for this garment, not just the first.
                                               * The singular *_artwork_url fields only ever hold one image,
                                               * so a job with several reference sheets printed incomplete.
                                               */
                                              const resolveGroupArtworkUrls = (
                                                  garment: ProductionGroupGarment,
                                              ): string[] => {
                                                  const garmentUrls =
                                                      (garment === 'shirt'
                                                          ? detailOrder.shirt_artwork_urls
                                                          : detailOrder.pants_artwork_urls) ??
                                                      [];
                                                  const cleaned =
                                                      garmentUrls.filter(
                                                          (
                                                              url,
                                                          ): url is string =>
                                                              typeof url ===
                                                                  'string' &&
                                                              url.trim() !== '',
                                                      );

                                                  if (cleaned.length > 0) {
                                                      return cleaned;
                                                  }

                                                  const fallback =
                                                      resolveGroupArtworkUrl(
                                                          garment,
                                                      );

                                                  return fallback
                                                      ? [fallback]
                                                      : [];
                                              };
                                              const sizeRows = Array.from(
                                                  groupData[
                                                      group.key
                                                  ].sizes.entries(),
                                              )
                                                  .sort(([left], [right]) =>
                                                      sizeLabelSorter(
                                                          left,
                                                          right,
                                                      ),
                                                  )
                                                  .map(
                                                      ([
                                                          sizeLabel,
                                                          sizeQuantity,
                                                      ]) => ({
                                                          sizeLabel,
                                                          quantity:
                                                              sizeQuantity,
                                                      }),
                                                  );

                                              return {
                                                  ...group,
                                                  quantity,
                                                  sizeRows,
                                                  unitTotal,
                                                  subtotal,
                                                  artworkUrls:
                                                      resolveGroupArtworkUrls(
                                                          group.garment,
                                                      ),
                                                  artworkUrl:
                                                      resolveGroupArtworkUrl(
                                                          group.garment,
                                                      ),
                                                  theme: resolveProductionGroupTheme(
                                                      group.baseKey,
                                                      group.style,
                                                  ),
                                                  specTitle:
                                                      resolveProductionSpecTitle(
                                                          group.garment,
                                                      ),
                                                  components:
                                                      group.garment === 'pants'
                                                          ? (productionPricing?.pants_components ??
                                                            [])
                                                          : (productionPricing?.components ??
                                                            []),
                                              };
                                          })
                                          .filter((group) => {
                                              const evidenceRows =
                                                  group.garment === 'pants'
                                                      ? pantsEvidenceRows
                                                      : shirtEvidenceRows;

                                              return hasRealData(
                                                  group,
                                                  evidenceRows,
                                              );
                                          });
                                const sizeGrandTotal = productionGroups.reduce(
                                    (sum, group) => sum + group.quantity,
                                    0,
                                );
                                const pricingGrandTotal =
                                    productionGroups.reduce(
                                        (sum, group) => sum + group.subtotal,
                                        0,
                                    );
                                // One sheet per production group, plus the name
                                // list a Form 2 bill prints alongside them.
                                const printSheetCount =
                                    productionGroups.length +
                                    (isIndividualOrder ? 1 : 0);
                                /**
                                 * Garment types this bill was booked against that
                                 * had no rate card at the time. Their sheets print
                                 * a notice instead of labour rows, and the dialog
                                 * says so up front so nobody has to open each
                                 * sheet to find out. One entry per garment, however
                                 * many size or sleeve batches it splits into.
                                 */
                                const unpricedGarmentNotices = productionGroups
                                    .filter(
                                        (group) =>
                                            group.components.length === 0,
                                    )
                                    .reduce<
                                        {
                                            garment: ProductionGroupGarment;
                                            title: string;
                                            sheetCount: number;
                                            typeId: number | null;
                                        }[]
                                    >((notices, group) => {
                                        const existing = notices.find(
                                            (notice) =>
                                                notice.garment ===
                                                group.garment,
                                        );

                                        if (existing) {
                                            existing.sheetCount += 1;

                                            return notices;
                                        }

                                        const isPants =
                                            group.garment === 'pants';

                                        notices.push({
                                            garment: group.garment,
                                            title:
                                                (isPants
                                                    ? productionPricing?.pants_type_name
                                                    : productionPricing?.shirt_type_name) ||
                                                detailOrder.job_type ||
                                                (isPants ? 'กางเกง' : 'เสื้อ'),
                                            sheetCount: 1,
                                            typeId:
                                                (isPants
                                                    ? productionPricing?.pants_type_id
                                                    : productionPricing?.shirt_type_id) ??
                                                null,
                                        });

                                        return notices;
                                    }, []);
                                const customerGroupLabel =
                                    productionGroups.length === 1
                                        ? productionGroups[0].label
                                        : `${productionGroups.length} กลุ่ม`;
                                const hasVisibleShirtGroup =
                                    productionGroups.some(
                                        (group) => group.garment === 'shirt',
                                    );
                                const hasVisiblePantsGroup =
                                    productionGroups.some(
                                        (group) => group.garment === 'pants',
                                    );
                                /**
                                 * A spec line somebody actually filled in. '-'
                                 * is the placeholder the sheet prints for a
                                 * blank, so it counts as blank here too.
                                 */
                                const specRowIsFilled = (row: {
                                    label: string;
                                    value: string | number | null | undefined;
                                }): boolean => {
                                    const text = String(row.value ?? '').trim();

                                    return text !== '' && text !== '-';
                                };
                                const hiddenSpecFieldCount =
                                    (hasVisibleShirtGroup
                                        ? shirtRows.filter(
                                              (row) => !specRowIsFilled(row),
                                          ).length
                                        : 0) +
                                    (hasVisiblePantsGroup
                                        ? pantsRows.filter(
                                              (row) => !specRowIsFilled(row),
                                          ).length
                                        : 0);
                                const renderSpecGroup = (
                                    title: string,
                                    rows: Array<{
                                        label: string;
                                        value:
                                            string | number | null | undefined;
                                    }>,
                                ) => {
                                    const visibleRows = showEmptySpecFields
                                        ? rows
                                        : rows.filter(specRowIsFilled);

                                    return (
                                        <div className="p-spec-group">
                                            <div className="p-spec-group-head">
                                                <span
                                                    className="p-spec-accent"
                                                    style={{
                                                        backgroundColor:
                                                            title === 'กางเกง'
                                                                ? '#B45309'
                                                                : '#1D4ED8',
                                                    }}
                                                />
                                                <h4>{title}</h4>
                                                {visibleRows.length > 0 ? (
                                                    <span className="p-spec-count">
                                                        {visibleRows.length}{' '}
                                                        รายการ
                                                    </span>
                                                ) : null}
                                            </div>
                                            {visibleRows.length > 0 ? (
                                                <dl className="p-spec-list">
                                                    {visibleRows.map((row) => {
                                                        const filled =
                                                            specRowIsFilled(
                                                                row,
                                                            );

                                                        return (
                                                            <div
                                                                key={`${title}-${row.label}`}
                                                                className={
                                                                    filled
                                                                        ? 'p-spec-row'
                                                                        : 'p-spec-row is-empty'
                                                                }
                                                            >
                                                                <dt>
                                                                    {row.label}
                                                                </dt>
                                                                <dd>
                                                                    {filled
                                                                        ? row.value
                                                                        : 'ยังไม่ได้กรอก'}
                                                                </dd>
                                                            </div>
                                                        );
                                                    })}
                                                </dl>
                                            ) : (
                                                <p className="p-spec-blank">
                                                    ยังไม่ได้กรอกสเปก{title}
                                                </p>
                                            )}
                                        </div>
                                    );
                                };
                                const barcodeMarkup = createOrderCodeBarcodeSvg(
                                    detailOrder.order_code,
                                );

                                return (
                                    <>
                                        <style>{`
                                            /* Artwork gallery. The cards used to be a fixed
                                               180px wide and 60mm tall, so a wide design sat
                                               letterboxed in a tall box with empty bands above
                                               and below it. They now flow into as many columns
                                               as the screen allows and keep a 4:3 frame, which
                                               suits both a phone and the dialog on a desktop. */
                                            .p-image-grid {
                                                display: grid;
                                                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                                                gap: 10px;
                                                margin-top: 10px;
                                            }
                                            .p-image-card {
                                                display: block;
                                                border: 1px solid #e2e8f0;
                                                background: #ffffff;
                                                border-radius: 10px;
                                                padding: 6px;
                                                overflow: hidden;
                                                box-shadow: 0 1px 2px rgb(15 23 42 / 0.06);
                                                transition: border-color 120ms ease, box-shadow 120ms ease;
                                            }
                                            .p-image-card:hover,
                                            .p-image-card:focus-visible {
                                                border-color: #94a3b8;
                                                box-shadow: 0 2px 8px rgb(15 23 42 / 0.12);
                                                outline: none;
                                            }
                                            .p-image-wrap {
                                                position: relative;
                                                aspect-ratio: 4 / 3;
                                                width: 100%;
                                                height: auto;
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                background:
                                                    repeating-conic-gradient(#f1f5f9 0% 25%, #ffffff 0% 50%) 50% / 16px 16px;
                                                overflow: hidden;
                                                border-radius: 6px;
                                                border: 0;
                                            }
                                            .p-image-wrap img {
                                                width: 100%;
                                                height: 100%;
                                                object-fit: contain;
                                                display: block;
                                            }
                                            .p-image-caption {
                                                display: flex;
                                                align-items: center;
                                                justify-content: space-between;
                                                gap: 6px;
                                                padding: 6px 2px 0;
                                                font-size: 11px;
                                                color: #64748b;
                                            }
                                            .p-image-empty {
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                min-height: 96px;
                                                margin-top: 10px;
                                                border: 1px dashed #cbd5e1;
                                                border-radius: 10px;
                                                background: #f8fafc;
                                                color: #94a3b8;
                                                font-size: 12px;
                                            }
                                            @media (max-width: 480px) {
                                                .p-image-grid {
                                                    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
                                                    gap: 8px;
                                                }
                                            }
                                            /* The spec panel used to copy the paper form:
                                               hairline black boxes, a grey label column and
                                               10px type. On paper that is right; on screen it
                                               read as a spreadsheet someone pasted in. It is
                                               now a plain card of label/value pairs, with the
                                               label quiet and the value the thing you see. */
                                            .p-spec-group {
                                                border: 1px solid #e2e8f0;
                                                background: #ffffff;
                                                border-radius: 12px;
                                                overflow: hidden;
                                                box-shadow: 0 1px 2px rgb(15 23 42 / 0.04);
                                            }
                                            .p-spec-group-head {
                                                display: flex;
                                                align-items: center;
                                                gap: 8px;
                                                padding: 9px 12px;
                                                border-bottom: 1px solid #e2e8f0;
                                                background: #f8fafc;
                                            }
                                            .p-spec-group h4 {
                                                margin: 0;
                                                font-size: 13px;
                                                font-weight: 700;
                                                color: #0f172a;
                                            }
                                            /* The garment's own colour, so the panel and the
                                               group chips below read as one system. */
                                            .p-spec-accent {
                                                width: 4px;
                                                height: 15px;
                                                border-radius: 999px;
                                                flex: none;
                                            }
                                            .p-spec-count {
                                                margin-left: auto;
                                                font-size: 11px;
                                                color: #64748b;
                                                font-variant-numeric: tabular-nums;
                                            }
                                            .p-spec-list {
                                                margin: 0;
                                                padding: 2px 0;
                                            }
                                            .p-spec-row {
                                                display: grid;
                                                grid-template-columns: minmax(0, 42%) minmax(0, 1fr);
                                                gap: 12px;
                                                align-items: baseline;
                                                padding: 6px 12px;
                                            }
                                            .p-spec-row + .p-spec-row {
                                                border-top: 1px solid #f1f5f9;
                                            }
                                            .p-spec-row dt {
                                                font-size: 11px;
                                                line-height: 1.35;
                                                color: #64748b;
                                            }
                                            .p-spec-row dd {
                                                margin: 0;
                                                font-size: 13px;
                                                line-height: 1.35;
                                                font-weight: 600;
                                                color: #0f172a;
                                                overflow-wrap: anywhere;
                                            }
                                            .p-spec-row.is-empty dd {
                                                font-weight: 400;
                                                color: #cbd5e1;
                                            }
                                            .p-spec-blank {
                                                margin: 0;
                                                padding: 14px 12px;
                                                text-align: center;
                                                font-size: 12px;
                                                color: #94a3b8;
                                            }
                                            .p-two-col {
                                                display: grid;
                                                grid-template-columns: repeat(2, minmax(0, 1fr));
                                                gap: 12px;
                                                /* Each card ends where its own list ends: the
                                                   shorter garment used to be stretched to match
                                                   the taller one and trail empty space. */
                                                align-items: start;
                                            }
                                            /* Two columns of label/value pairs are unreadable
                                               on a narrow screen, so they stack instead. */
                                            @media (max-width: 720px) {
                                                .p-two-col {
                                                    grid-template-columns: minmax(0, 1fr);
                                                }
                                            }
                                            /* ----------------------------------------------------------------
                                               The A4 landscape work sheet.

                                               One production group is one sheet and one sheet is one page. The
                                               page is a fixed box the blocks are fitted into, so content cannot
                                               push the design onto a second sheet: it used to lay out 942px of
                                               content inside a 748px page, so half the groups printed twice.

                                               The order of importance the shop asked for drives the layout:
                                                 1. the costing table, which owns the whole right column;
                                                 2. the header, the artwork and the size table, which share the
                                                    top of the page and the top of the left column;
                                                 3. the spec, which takes what is left at the bottom left.

                                               Type is sized for a reader in their late thirties and older:
                                               nothing under 10px, table data at 13px, and the numbers that get
                                               acted on larger again. The old sheet set 86 of its 91 pieces of
                                               text at 8-9px.
                                            ------------------------------------------------------------------ */
                                            .p-print-page {
                                                width: 287mm;
                                                height: 200mm;
                                                margin: 0 auto;
                                                padding: 0;
                                                border: 0;
                                                border-radius: 0;
                                                background: #ffffff;
                                                color: #0f172a;
                                                display: flex;
                                                flex-direction: column;
                                                gap: 2.5mm;
                                                overflow: hidden;
                                            }
                                            .p-print-page + .p-print-page {
                                                margin-top: 8mm;
                                            }
                                            /* A name list runs to whatever length the team is, so
                                               it flows and breaks across pages rather than being
                                               cut off at the height of a single sheet. It stays a
                                               flex column so a short list still fills its page. */
                                            .p-print-page-flow {
                                                height: auto;
                                                min-height: 200mm;
                                                overflow: visible;
                                            }
                                            .p-roster-card {
                                                flex: 1 1 auto;
                                                min-height: 0;
                                                display: flex;
                                                border: 0.3mm solid #94a3b8;
                                                border-radius: 1.5mm;
                                                overflow: hidden;
                                                background: #ffffff;
                                            }
                                            .p-personalization-table {
                                                flex: 1 1 auto;
                                                width: 100%;
                                                height: 100%;
                                                border-collapse: collapse;
                                                table-layout: fixed;
                                            }
                                            .p-personalization-table th,
                                            .p-personalization-table td {
                                                border: 0.3mm solid #94a3b8;
                                                padding: 1.5mm 2.5mm;
                                                font-size: 13px;
                                                line-height: 1.3;
                                                vertical-align: middle;
                                            }
                                            .p-personalization-table thead th {
                                                background: #1e293b;
                                                color: #ffffff;
                                                font-size: 12px;
                                                font-weight: 700;
                                                padding: 2mm 2.5mm;
                                                letter-spacing: 0.02em;
                                            }
                                            /* The head repeats on every printed page, so a loose
                                               sheet of a long team still says what its columns are. */
                                            .p-personalization-table thead {
                                                display: table-header-group;
                                            }
                                            .p-personalization-table tr {
                                                break-inside: avoid;
                                                page-break-inside: avoid;
                                            }
                                            .p-personalization-table tbody td {
                                                height: 8mm;
                                            }
                                            .p-personalization-table
                                                tbody
                                                tr:not(.p-roster-total):nth-child(even)
                                                td {
                                                background: #f8fafc;
                                            }
                                            .p-personalization-table
                                                tbody
                                                td:nth-child(1),
                                            .p-personalization-table
                                                tbody
                                                td:nth-child(3),
                                            .p-personalization-table
                                                tbody
                                                td:nth-child(4),
                                            .p-personalization-table
                                                tbody
                                                td:nth-child(5) {
                                                text-align: center;
                                                font-variant-numeric: tabular-nums;
                                            }
                                            .p-personalization-table
                                                tbody
                                                td:nth-child(3),
                                            .p-personalization-table
                                                tbody
                                                td:nth-child(4) {
                                                font-weight: 700;
                                            }
                                            .p-roster-index {
                                                color: #94a3b8;
                                                font-size: 11px;
                                            }
                                            .p-personalization-table
                                                .p-roster-total
                                                td {
                                                background: #fde68a;
                                                color: #78350f;
                                                font-size: 15px;
                                                font-weight: 800;
                                                text-align: right;
                                            }
                                            .p-personalization-table
                                                .p-roster-total
                                                td:last-child {
                                                text-align: center;
                                            }

                                            /* --- header: tier 2 ------------------------------------------- */
                                            .p-page-header {
                                                flex: none;
                                                border: 0.4mm solid #78350f;
                                                border-radius: 1.5mm;
                                                background: #b45309;
                                                color: #ffffff;
                                                padding: 1.5mm 3mm;
                                                margin: 0;
                                            }
                                            .p-page-header-grid {
                                                display: grid;
                                                grid-template-columns: 30mm minmax(0, 1fr) minmax(0, 1fr) 56mm;
                                                gap: 4mm;
                                                align-items: center;
                                            }
                                            .p-page-header-logo {
                                                background: #ffffff;
                                                border-radius: 1mm;
                                                padding: 1mm 2mm;
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                            }
                                            .p-page-header-logo img {
                                                width: 100%;
                                                max-height: 13mm;
                                                object-fit: contain;
                                                display: block;
                                            }
                                            .p-page-header-title {
                                                margin: 0 0 0.8mm;
                                                font-size: 18px;
                                                line-height: 1.05;
                                                font-weight: 800;
                                            }
                                            .p-page-header-col {
                                                display: grid;
                                                gap: 0.6mm;
                                                align-content: center;
                                                min-width: 0;
                                            }
                                            .p-page-header-row {
                                                margin: 0;
                                                font-size: 12px;
                                                line-height: 1.28;
                                                color: rgba(255, 255, 255, 0.85);
                                            }
                                            .p-page-header-row strong {
                                                color: #ffffff;
                                                font-weight: 700;
                                                font-size: 13px;
                                                overflow-wrap: anywhere;
                                            }
                                            .p-page-header-label {
                                                color: rgba(255, 255, 255, 0.8);
                                                font-weight: 600;
                                            }
                                            .p-page-header-right {
                                                border: 0.3mm solid rgba(255, 255, 255, 0.55);
                                                border-radius: 1mm;
                                                background: rgba(255, 255, 255, 0.12);
                                                padding: 1.5mm 2mm;
                                            }
                                            .p-page-header-barcode {
                                                border-radius: 1mm;
                                                background: #ffffff;
                                                padding: 1mm;
                                                text-align: center;
                                            }
                                            .p-page-header-barcode svg {
                                                display: block;
                                                width: 100%;
                                                height: 11mm;
                                            }
                                            .p-page-header-code {
                                                margin: 1mm 0 0;
                                                color: #ffffff;
                                                font-size: 12px;
                                                font-weight: 700;
                                                letter-spacing: 0.06em;
                                                text-align: center;
                                            }

                                            /* --- the two columns ------------------------------------------ */
                                            .p-form-grid {
                                                flex: 1 1 auto;
                                                min-height: 0;
                                                display: grid;
                                                grid-template-columns: minmax(0, 55fr) minmax(0, 45fr);
                                                gap: 3mm;
                                                align-items: stretch;
                                            }
                                            .p-form-left,
                                            .p-form-right {
                                                display: flex;
                                                flex-direction: column;
                                                min-height: 0;
                                                border: 0.3mm solid #94a3b8;
                                                border-radius: 1.5mm;
                                                overflow: hidden;
                                                background: #ffffff;
                                            }
                                            .p-form-body {
                                                flex: 1 1 auto;
                                                min-height: 0;
                                                display: flex;
                                                flex-direction: column;
                                                gap: 2mm;
                                                padding: 2.5mm;
                                            }
                                            .p-yellow-head {
                                                flex: none;
                                                padding: 1.8mm 3mm;
                                                font-size: 14px;
                                                font-weight: 700;
                                                line-height: 1.25;
                                                background: #facc15;
                                                color: #111827;
                                                border: 0;
                                                border-bottom: 0.3mm solid rgba(15, 23, 42, 0.25);
                                            }
                                            /* Tailwind does not reach the print window, so this
                                               row carries its own flex: the two head cells used
                                               to stack and cost the sheet a whole line. */
                                            .p-head-row {
                                                flex: none;
                                                display: flex;
                                                align-items: stretch;
                                            }
                                            .p-head-row-main {
                                                flex: 1 1 auto;
                                                min-width: 0;
                                            }
                                            .p-head-row-aside {
                                                flex: none;
                                                border-left: 0.3mm solid rgba(15, 23, 42, 0.3);
                                                font-weight: 600;
                                                opacity: 0.92;
                                            }

                                            /* --- artwork: tier 2, up to three across ---------------------- */
                                            .p-artwork-gallery {
                                                flex: 1 1 auto;
                                                min-height: 50mm;
                                                display: grid;
                                                grid-template-columns: repeat(3, minmax(0, 1fr));
                                                grid-auto-rows: 1fr;
                                                gap: 2mm;
                                            }
                                            .p-artwork-box {
                                                border: 0.3mm solid #cbd5e1;
                                                border-radius: 1mm;
                                                background: #f8fafc;
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                overflow: hidden;
                                                height: auto;
                                                min-height: 0;
                                                max-height: none;
                                            }
                                            /* A group with a single image gives it the whole band. */
                                            .p-form-body > .p-artwork-box {
                                                flex: 1 1 auto;
                                                min-height: 50mm;
                                            }
                                            /* Scale up to the band as well as down: a small file
                                               used to print at its own size and sit lost in the
                                               middle of an empty box. */
                                            .p-artwork-box img {
                                                width: 100%;
                                                height: 100%;
                                                object-fit: contain;
                                                display: block;
                                            }
                                            .p-artwork-empty {
                                                color: #94a3b8;
                                                font-size: 12px;
                                                font-weight: 600;
                                            }

                                            /* --- size table: tier 2 --------------------------------------- */
                                            .p-size-bar {
                                                flex: none;
                                                width: 100%;
                                                border-collapse: collapse;
                                                margin: 0;
                                            }
                                            .p-size-bar th,
                                            .p-size-bar td {
                                                border: 0.3mm solid #94a3b8;
                                                text-align: center;
                                            }
                                            .p-size-bar thead th {
                                                background: #f1f5f9;
                                                color: #334155;
                                                font-size: 11px;
                                                font-weight: 700;
                                                padding: 1.2mm 1mm;
                                            }
                                            .p-size-bar tbody td {
                                                /* The count is the number a cutter acts on, so it is the largest
                                                   thing in the left column. Empty sizes stay grey so the ones
                                                   with work in them carry the eye. */
                                                font-size: 16px;
                                                font-weight: 700;
                                                padding: 1.6mm 1mm;
                                                color: #cbd5e1;
                                                font-variant-numeric: tabular-nums;
                                            }
                                            .p-size-bar tbody td.p-size-filled {
                                                background: #dcfce7;
                                                color: #14532d;
                                            }
                                            .p-size-bar thead th.p-size-total {
                                                background: #fde68a;
                                                color: #78350f;
                                            }
                                            .p-size-bar tbody td.p-size-total {
                                                background: #fef3c7;
                                                color: #92400e;
                                            }
                                            .p-size-bar tbody td.p-size-total.p-size-filled {
                                                background: #fde68a;
                                                color: #78350f;
                                            }

                                            /* --- spec: tier 3, whatever height is left -------------------- */
                                            .p-spec-block {
                                                flex: none;
                                                display: flex;
                                                flex-direction: column;
                                            }
                                            .p-spec-title {
                                                flex: none;
                                                margin: 0 0 1.2mm;
                                                font-size: 11px;
                                                font-weight: 700;
                                                color: #64748b;
                                                letter-spacing: 0.02em;
                                            }
                                            .p-spec-grid {
                                                flex: none;
                                                display: grid;
                                                grid-template-columns: repeat(3, minmax(0, 1fr));
                                                align-content: start;
                                                border: 0.3mm solid #cbd5e1;
                                                border-radius: 1mm;
                                                overflow: hidden;
                                                background: #ffffff;
                                            }
                                            .p-spec-grid-item {
                                                display: flex;
                                                gap: 1.5mm;
                                                align-items: baseline;
                                                min-width: 0;
                                                padding: 1mm 2mm;
                                                border-right: 0.2mm solid #e2e8f0;
                                                border-bottom: 0.2mm solid #e2e8f0;
                                            }
                                            .p-spec-grid-item:nth-child(3n) {
                                                border-right: 0;
                                            }
                                            .p-spec-grid-label {
                                                flex: none;
                                                font-size: 10px;
                                                color: #64748b;
                                            }
                                            .p-spec-grid-value {
                                                flex: 1 1 auto;
                                                min-width: 0;
                                                font-size: 11px;
                                                font-weight: 700;
                                                color: #0f172a;
                                                overflow-wrap: anywhere;
                                            }

                                            /* --- costing: tier 1, the whole right column ------------------ */
                                            .p-process-wrap {
                                                flex: 1 1 auto;
                                                min-height: 0;
                                                display: flex;
                                                flex-direction: column;
                                            }
                                            .p-process-table {
                                                flex: 1 1 auto;
                                                width: 100%;
                                                height: 100%;
                                                border-collapse: collapse;
                                                table-layout: fixed;
                                            }
                                            .p-process-table th,
                                            .p-process-table td {
                                                border: 0.3mm solid #94a3b8;
                                                padding: 1.5mm 2mm;
                                                font-size: 13px;
                                                line-height: 1.3;
                                                vertical-align: middle;
                                            }
                                            .p-process-table thead th {
                                                background: #1e293b;
                                                color: #ffffff;
                                                font-size: 12px;
                                                font-weight: 700;
                                                padding: 2mm;
                                                letter-spacing: 0.02em;
                                            }
                                            /* Rows stretch to fill the column, so the writing room a worker gets
                                               is whatever the page has spare rather than a fixed stub. */
                                            .p-process-table tbody td {
                                                height: 6mm;
                                            }
                                            .p-process-table
                                                tbody
                                                tr:not(.p-process-sum):not(.p-process-formula):nth-child(even)
                                                td {
                                                background: #f8fafc;
                                            }
                                            .p-process-table .p-process-sum td {
                                                background: #fde68a;
                                                color: #78350f;
                                                font-size: 15px;
                                                font-weight: 800;
                                                padding: 2.2mm 2mm;
                                            }
                                            .p-process-table .p-process-formula td {
                                                background: #f1f5f9;
                                                color: #334155;
                                                font-size: 12px;
                                                font-weight: 600;
                                            }
                                            .p-process-table th:first-child,
                                            .p-process-table td:first-child {
                                                white-space: normal;
                                                word-break: normal;
                                                overflow-wrap: break-word;
                                            }
                                            .p-process-table th:nth-child(2),
                                            .p-process-table td:nth-child(2) {
                                                white-space: nowrap;
                                                text-align: right;
                                                font-variant-numeric: tabular-nums;
                                            }
                                            /* A garment type with no rate card prints a notice where
                                               its rows would be, so 0.00 never passes for "free". */
                                            .p-process-table .p-process-notice td {
                                                background: #fef3c7;
                                                color: #92400e;
                                                font-size: 12px;
                                                font-weight: 700;
                                                line-height: 1.35;
                                                text-align: center;
                                                padding: 2mm;
                                                overflow-wrap: anywhere;
                                            }
                                            /* Past twelve operations the rows give up their writing
                                               room to stay on the one sheet: still 11.5px, never a
                                               row dropped, twenty to a column before the page grows. */
                                            .p-process-table-dense th,
                                            .p-process-table-dense td {
                                                padding: 0.6mm 2mm;
                                                font-size: 11.5px;
                                                line-height: 1.2;
                                            }
                                            .p-process-table-dense thead th {
                                                padding: 1.2mm 2mm;
                                                font-size: 11px;
                                            }
                                            .p-process-table-dense tbody td {
                                                height: auto;
                                            }
                                            .p-process-table-dense .p-process-sum td {
                                                font-size: 13px;
                                                padding: 1.2mm 2mm;
                                            }
                                            .p-process-table-dense .p-process-formula td {
                                                font-size: 11px;
                                                padding: 0.8mm 2mm;
                                            }

                                            /* --- signing off ---------------------------------------------- */
                                            .p-signature-row {
                                                flex: none;
                                                display: grid;
                                                grid-template-columns: repeat(3, minmax(0, 1fr));
                                                gap: 2mm;
                                                margin-top: 2mm;
                                            }
                                            .p-sign-box {
                                                display: flex;
                                                align-items: center;
                                                border: 0.3mm solid #94a3b8;
                                                border-radius: 1mm;
                                                min-height: 9mm;
                                                padding: 1.5mm 2mm;
                                                font-size: 11px;
                                                color: #334155;
                                            }
                                            .p-bottom-meta {
                                                flex: none;
                                                margin: 0;
                                                display: grid;
                                                grid-template-columns: repeat(3, minmax(0, 1fr));
                                                gap: 2mm;
                                                font-size: 11px;
                                            }
                                        `}</style>
                                        <div className="p-sheet p-tight mx-auto max-w-5xl space-y-3">
                                            <div className="p-dialog-only space-y-3">
                                                <section className="p-head p-card rounded-xl border border-slate-300 bg-white p-4 shadow-sm md:grid md:grid-cols-[1fr_240px] md:gap-5 md:p-5">
                                                    <div className="space-y-3">
                                                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                                            <h2 className="p-head-title text-base font-bold text-slate-900">
                                                                ใบสั่งผลิต
                                                            </h2>
                                                            <span className="font-mono text-sm font-bold text-slate-900">
                                                                {
                                                                    detailOrder.order_code
                                                                }
                                                            </span>
                                                        </div>

                                                        <div>
                                                            <p className="text-[11px] font-semibold text-slate-400">
                                                                ชื่อหน่วยงาน,
                                                                ชื่องาน
                                                            </p>
                                                            <p className="text-sm font-bold text-slate-900">
                                                                {detailOrder.job_name ||
                                                                    '-'}
                                                            </p>
                                                            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                                                                <span>
                                                                    ประเภทเสื้อ:{' '}
                                                                    <strong className="text-slate-900">
                                                                        {productionPricing?.shirt_type_name ||
                                                                            detailOrder.job_type ||
                                                                            '-'}
                                                                    </strong>
                                                                </span>
                                                                <span>
                                                                    กลุ่มสินค้า:{' '}
                                                                    <strong className="text-slate-900">
                                                                        {
                                                                            customerGroupLabel
                                                                        }
                                                                    </strong>
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Both dates side by side: the floor reads
                                                            them against each other, not apart. */}
                                                        <div className="grid gap-2 sm:grid-cols-2">
                                                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                                                <p className="text-[11px] font-semibold text-slate-400">
                                                                    วันที่สร้างใบงาน
                                                                </p>
                                                                <p className="text-sm font-bold text-slate-900">
                                                                    {dateOnly(
                                                                        detailOrder.order_date,
                                                                    )}
                                                                </p>
                                                            </div>
                                                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                                                                <p className="text-[11px] font-semibold text-red-500">
                                                                    วันที่รับสินค้า
                                                                </p>
                                                                <p className="text-sm font-bold text-red-700">
                                                                    {dateOnly(
                                                                        detailOrder.due_date,
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600">
                                                            <span>
                                                                ลูกค้า:{' '}
                                                                <strong className="text-slate-900">
                                                                    {detailOrder
                                                                        .customer
                                                                        ?.customer_name ||
                                                                        '-'}
                                                                </strong>
                                                            </span>
                                                            <span>
                                                                สาขา:{' '}
                                                                <strong className="text-slate-900">
                                                                    {detailOrder
                                                                        .branch
                                                                        ?.branch_name ||
                                                                        '-'}
                                                                </strong>
                                                            </span>
                                                            <span>
                                                                ผู้บันทึก:{' '}
                                                                <strong className="text-slate-900">
                                                                    {detailOrder
                                                                        .creator_user
                                                                        ?.name ||
                                                                        '-'}
                                                                </strong>
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="mt-3 space-y-2 md:mt-0">
                                                        <div className="p-badge rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                                                            <p className="text-[11px] font-semibold text-slate-500">
                                                                รวมจำนวน
                                                            </p>
                                                            <strong className="block text-2xl leading-tight font-bold text-slate-900">
                                                                {sizeGrandTotal.toLocaleString(
                                                                    'th-TH',
                                                                )}
                                                            </strong>
                                                            <p className="text-[11px] text-slate-500">
                                                                สรุปตามกลุ่มการผลิต{' '}
                                                                {
                                                                    productionGroups.length
                                                                }{' '}
                                                                กลุ่ม
                                                            </p>
                                                        </div>
                                                        {/* The barcode is scanned, not read, so it
                                                            sits on its own rather than inside the
                                                            block of figures. */}
                                                        <div className="p-barcode-wrap rounded-lg border border-slate-300 bg-white p-1.5">
                                                            {barcodeMarkup ? (
                                                                <span
                                                                    dangerouslySetInnerHTML={{
                                                                        __html: barcodeMarkup,
                                                                    }}
                                                                />
                                                            ) : (
                                                                <div className="p-barcode-fallback text-center font-mono text-xs">
                                                                    {
                                                                        detailOrder.order_code
                                                                    }
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </section>

                                                <div className="p-grid grid gap-3 md:grid-cols-1">
                                                    <section className="p-card p-block rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <h3 className="p-title">
                                                                ประเภทเสื้อและรูปที่แนบ
                                                            </h3>
                                                            {images.length >
                                                            0 ? (
                                                                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                                                                    รูปที่แนบทั้งหมด{' '}
                                                                    {
                                                                        images.length
                                                                    }{' '}
                                                                    รูป
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        {images.length > 0 ? (
                                                            <div className="p-image-grid">
                                                                {images.map(
                                                                    (
                                                                        imageUrl,
                                                                        index,
                                                                    ) => (
                                                                        <a
                                                                            key={`${imageUrl}-${index}`}
                                                                            className="p-image-card"
                                                                            href={
                                                                                imageUrl
                                                                            }
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            title="เปิดรูปขนาดเต็ม"
                                                                        >
                                                                            <div className="p-image-wrap">
                                                                                <img
                                                                                    src={
                                                                                        imageUrl
                                                                                    }
                                                                                    alt={`รูปแนบที่ ${index + 1}`}
                                                                                    loading="lazy"
                                                                                />
                                                                            </div>
                                                                            <div className="p-image-caption">
                                                                                <span>
                                                                                    รูปที่{' '}
                                                                                    {index +
                                                                                        1}
                                                                                </span>
                                                                                <span aria-hidden="true">
                                                                                    ดูเต็มจอ
                                                                                </span>
                                                                            </div>
                                                                        </a>
                                                                    ),
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="p-image-empty">
                                                                ไม่มีรูป Artwork
                                                            </div>
                                                        )}
                                                    </section>
                                                </div>

                                                <section className="p-card p-block p-section rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <h3 className="p-title">
                                                            รายละเอียดสินค้า
                                                        </h3>
                                                        {hiddenSpecFieldCount >
                                                        0 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setShowEmptySpecFields(
                                                                        (
                                                                            previous,
                                                                        ) =>
                                                                            !previous,
                                                                    )
                                                                }
                                                                aria-expanded={
                                                                    showEmptySpecFields
                                                                }
                                                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                                            >
                                                                {showEmptySpecFields
                                                                    ? 'ซ่อนช่องที่ยังไม่ได้กรอก'
                                                                    : `ดูช่องที่ยังไม่ได้กรอก (${hiddenSpecFieldCount})`}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                    <div className="p-two-col grid gap-4 md:grid-cols-2">
                                                        {hasVisibleShirtGroup
                                                            ? renderSpecGroup(
                                                                  'เสื้อ',
                                                                  shirtRows.length >
                                                                      0
                                                                      ? shirtRows
                                                                      : [
                                                                            {
                                                                                label: 'ข้อมูล',
                                                                                value: '-',
                                                                            },
                                                                        ],
                                                              )
                                                            : null}
                                                        {hasVisiblePantsGroup
                                                            ? renderSpecGroup(
                                                                  'กางเกง',
                                                                  pantsRows.length >
                                                                      0
                                                                      ? pantsRows
                                                                      : [
                                                                            {
                                                                                label: 'ข้อมูล',
                                                                                value: '-',
                                                                            },
                                                                        ],
                                                              )
                                                            : null}
                                                    </div>
                                                </section>
                                            </div>

                                            <section className="p-preview-only rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
                                                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                                                    <div>
                                                        <p className="text-xs font-semibold text-slate-500">
                                                            ใบงานที่ต้องพิมพ์
                                                        </p>
                                                        <p className="mt-1 text-xl font-bold text-slate-900">
                                                            {printSheetCount.toLocaleString(
                                                                'th-TH',
                                                            )}{' '}
                                                            ใบ
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                                                        <div>
                                                            <p className="text-xs font-semibold text-slate-500">
                                                                รวมจำนวนทั้งหมด
                                                            </p>
                                                            <p className="mt-1 text-xl font-bold text-slate-900">
                                                                {sizeGrandTotal.toLocaleString(
                                                                    'th-TH',
                                                                )}{' '}
                                                                ตัว
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-slate-500">
                                                                ยอดรวมทุกกลุ่ม
                                                            </p>
                                                            <p className="mt-1 text-xl font-bold text-slate-900">
                                                                {formatMoney(
                                                                    pricingGrandTotal,
                                                                )}{' '}
                                                                บาท
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {unpricedGarmentNotices.length >
                                                0 ? (
                                                    <div
                                                        role="alert"
                                                        className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
                                                    >
                                                        <p className="font-bold">
                                                            ยังไม่ได้ตั้งค่าแรง
                                                        </p>
                                                        <ul className="mt-1 space-y-1">
                                                            {unpricedGarmentNotices.map(
                                                                (notice) => (
                                                                    <li
                                                                        key={
                                                                            notice.garment
                                                                        }
                                                                    >
                                                                        <span className="font-semibold">
                                                                            {
                                                                                notice.title
                                                                            }
                                                                        </span>
                                                                        :
                                                                        ไม่มีรายการค่าแรง
                                                                        — ใบงาน{' '}
                                                                        {
                                                                            notice.sheetCount
                                                                        }{' '}
                                                                        ใบจะพิมพ์โดยไม่มีรายการและไม่คิดยอด
                                                                        ·{' '}
                                                                        <Link
                                                                            href={`/settings/data/garments/prices?category=${notice.garment === 'pants' ? 'PANTS' : 'SHIRT'}${notice.typeId ? `&garment_type_id=${notice.typeId}` : ''}`}
                                                                            className="font-semibold underline underline-offset-2 hover:text-amber-700"
                                                                        >
                                                                            ตั้งค่าแรงที่
                                                                            จัดการข้อมูล
                                                                            ›
                                                                            เซ็ทราคาเด็กและผู้ใหญ่
                                                                        </Link>{' '}
                                                                        (มีผลกับบิลที่เปิดหลังจากตั้ง)
                                                                    </li>
                                                                ),
                                                            )}
                                                        </ul>
                                                    </div>
                                                ) : null}

                                                {productionGroups.length > 0 ? (
                                                    <div className="mt-3 border-t border-slate-200 pt-3">
                                                        <p className="mb-2 text-xs font-semibold text-slate-500">
                                                            กดที่กลุ่มเพื่อไปยังใบงานของกลุ่มนั้น
                                                        </p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {productionGroups.map(
                                                                (group) => (
                                                                    <button
                                                                        key={
                                                                            group.key
                                                                        }
                                                                        type="button"
                                                                        onClick={() =>
                                                                            revealPrintSheet(
                                                                                group.key,
                                                                            )
                                                                        }
                                                                        style={{
                                                                            backgroundColor:
                                                                                group
                                                                                    .theme
                                                                                    .backgroundColor,
                                                                            borderColor:
                                                                                group
                                                                                    .theme
                                                                                    .borderColor,
                                                                        }}
                                                                        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                                                        title={`ไปที่ใบงาน ${group.label}`}
                                                                    >
                                                                        <span>
                                                                            {
                                                                                group.label
                                                                            }
                                                                        </span>
                                                                        <span className="rounded bg-white/25 px-1.5 py-0.5 font-mono text-[11px]">
                                                                            {group.quantity.toLocaleString(
                                                                                'th-TH',
                                                                            )}
                                                                        </span>
                                                                    </button>
                                                                ),
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </section>

                                            {printSheetCount > 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setShowPrintSheets(
                                                            (previous) =>
                                                                !previous,
                                                        )
                                                    }
                                                    aria-expanded={
                                                        showPrintSheets
                                                    }
                                                    className="p-preview-only flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                                                >
                                                    <span>
                                                        ตัวอย่างใบงานก่อนพิมพ์ (
                                                        {printSheetCount} ใบ)
                                                    </span>
                                                    <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
                                                        {showPrintSheets
                                                            ? 'ซ่อน'
                                                            : 'กดเพื่อดู'}
                                                        <ChevronDown
                                                            className={
                                                                showPrintSheets
                                                                    ? 'size-4 rotate-180 transition-transform'
                                                                    : 'size-4 transition-transform'
                                                            }
                                                        />
                                                    </span>
                                                </button>
                                            ) : null}

                                            <div
                                                data-print-sheets
                                                className={
                                                    showPrintSheets
                                                        ? 'space-y-3 overflow-x-auto'
                                                        : 'hidden'
                                                }
                                            >
                                                {productionGroups.length > 0
                                                    ? productionGroups.map(
                                                          (group) => {
                                                              const formTitle =
                                                                  group.garment ===
                                                                  'pants'
                                                                      ? productionPricing?.pants_type_name ||
                                                                        detailOrder.job_type ||
                                                                        '-'
                                                                      : productionPricing?.shirt_type_name ||
                                                                        detailOrder.job_type ||
                                                                        '-';
                                                              const groupSpecRows =
                                                                  resolveProductionSpecRows(
                                                                      group.garment,
                                                                      shirtRows,
                                                                      pantsRows,
                                                                  );
                                                              const standardSizeHeaders =
                                                                  group.sizeGroup ===
                                                                  'kids'
                                                                      ? [
                                                                            'JSS',
                                                                            'JS',
                                                                            'JM',
                                                                            'JL',
                                                                            'JXL',
                                                                        ]
                                                                      : [
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
                                                              /**
                                                               * Any size the bill actually used
                                                               * that is not one of the standard
                                                               * columns gets a column of its own.
                                                               * A name list can carry '-' for a
                                                               * person nobody sized yet, and its
                                                               * count still has to sit somewhere
                                                               * the columns add up to the total.
                                                               */
                                                              const sizeHeaders =
                                                                  [
                                                                      ...standardSizeHeaders,
                                                                      ...Array.from(
                                                                          new Set(
                                                                              group.sizeRows
                                                                                  .filter(
                                                                                      (
                                                                                          row,
                                                                                      ) =>
                                                                                          row.quantity >
                                                                                              0 &&
                                                                                          row.sizeLabel !==
                                                                                              '' &&
                                                                                          !standardSizeHeaders.includes(
                                                                                              row.sizeLabel,
                                                                                          ),
                                                                                  )
                                                                                  .map(
                                                                                      (
                                                                                          row,
                                                                                      ) =>
                                                                                          row.sizeLabel,
                                                                                  ),
                                                                          ),
                                                                      ),
                                                                  ];
                                                              const sizeMap =
                                                                  new Map(
                                                                      group.sizeRows.map(
                                                                          (
                                                                              row,
                                                                          ) => [
                                                                              row.sizeLabel,
                                                                              row.quantity,
                                                                          ],
                                                                      ),
                                                                  );
                                                              const resolvedArtwork =
                                                                  group.artworkUrl;
                                                              // Every operation the order was
                                                              // priced at is printed: the total
                                                              // below adds them all up, so a row
                                                              // left off the sheet would be money
                                                              // a worker cannot account for.
                                                              const visibleProcessRows =
                                                                  group.components;
                                                              const blankProcessRows =
                                                                  Math.max(
                                                                      0,
                                                                      PROCESS_TABLE_STANDARD_ROW_COUNT -
                                                                          visibleProcessRows.length,
                                                                  );
                                                              const processDensity =
                                                                  resolveProcessTableDensity(
                                                                      visibleProcessRows.length,
                                                                  );
                                                              // No operations at all means the
                                                              // garment type has no rate card, not
                                                              // that the work is free — say so
                                                              // instead of printing 0.00.
                                                              const isUnpricedGroup =
                                                                  visibleProcessRows.length ===
                                                                  0;
                                                              const dozenCount =
                                                                  group.quantity >=
                                                                  12
                                                                      ? Math.floor(
                                                                            group.quantity /
                                                                                12,
                                                                        )
                                                                      : 0;
                                                              const pricingFormulaLabel =
                                                                  group.sizeGroup ===
                                                                  'kids'
                                                                      ? 'เด็ก'
                                                                      : 'ผู้ใหญ่';
                                                              const pricingFormulaText =
                                                                  isUnpricedGroup
                                                                      ? `${group.quantity.toLocaleString('th-TH')} x — = —`
                                                                      : `${group.quantity.toLocaleString('th-TH')} x ${formatMoney(group.unitTotal)} = ${formatMoney(group.subtotal)}`;
                                                              const isKidsDocument =
                                                                  group.sizeGroup ===
                                                                  'kids';
                                                              const hasSizeCellValue =
                                                                  (
                                                                      value:
                                                                          | string
                                                                          | number
                                                                          | null
                                                                          | undefined,
                                                                  ): boolean => {
                                                                      if (
                                                                          typeof value ===
                                                                          'number'
                                                                      ) {
                                                                          return (
                                                                              value >
                                                                              0
                                                                          );
                                                                      }

                                                                      if (
                                                                          typeof value ===
                                                                          'string'
                                                                      ) {
                                                                          return (
                                                                              value.trim() !==
                                                                                  '' &&
                                                                              value.trim() !==
                                                                                  '0'
                                                                          );
                                                                      }

                                                                      return false;
                                                                  };

                                                              return (
                                                                  <section
                                                                      key={
                                                                          group.key
                                                                      }
                                                                      id={`production-sheet-${group.key}`}
                                                                      className={
                                                                          processDensity ===
                                                                          'overflow'
                                                                              ? 'p-print-page p-print-page-flow scroll-mt-20 space-y-2'
                                                                              : 'p-print-page scroll-mt-20 space-y-2'
                                                                      }
                                                                  >
                                                                      <header
                                                                          className="p-page-header"
                                                                          style={resolveGroupHeaderStyle(
                                                                              group.theme,
                                                                          )}
                                                                      >
                                                                          <div className="p-page-header-grid">
                                                                              <div className="p-page-header-logo">
                                                                                  <img
                                                                                      src="/images/logo/logo.png"
                                                                                      alt="J.S. Sport"
                                                                                  />
                                                                              </div>
                                                                              <div className="p-page-header-col">
                                                                                  <h2 className="p-page-header-title">
                                                                                      ใบสั่งผลิต
                                                                                  </h2>
                                                                                  <p className="p-page-header-row">
                                                                                      <span className="p-page-header-label">
                                                                                          เลขที่ออเดอร์:
                                                                                      </span>{' '}
                                                                                      <strong>
                                                                                          {
                                                                                              detailOrder.order_code
                                                                                          }
                                                                                      </strong>
                                                                                  </p>
                                                                                  {'teamName' in
                                                                                      group &&
                                                                                  group.teamName ? (
                                                                                      <p className="p-page-header-row">
                                                                                          <span className="p-page-header-label">
                                                                                              คณะสี:
                                                                                          </span>{' '}
                                                                                          <strong>
                                                                                              {
                                                                                                  group.teamName
                                                                                              }
                                                                                          </strong>
                                                                                      </p>
                                                                                  ) : null}
                                                                                  <p className="p-page-header-row">
                                                                                      <span className="p-page-header-label">
                                                                                          ประเภทเสื้อ:
                                                                                      </span>{' '}
                                                                                      <strong>
                                                                                          {productionPricing?.shirt_type_name ||
                                                                                              detailOrder.job_type ||
                                                                                              '-'}
                                                                                      </strong>
                                                                                  </p>
                                                                                  <p className="p-page-header-row">
                                                                                      <span className="p-page-header-label">
                                                                                          วันที่สร้างใบงาน:
                                                                                      </span>{' '}
                                                                                      <strong>
                                                                                          {dateOnly(
                                                                                              detailOrder.order_date,
                                                                                          )}
                                                                                      </strong>
                                                                                  </p>
                                                                                  <p className="p-page-header-row">
                                                                                      <span className="p-page-header-label">
                                                                                          ชื่อหน่วยงาน,
                                                                                          ชื่องาน:
                                                                                      </span>{' '}
                                                                                      <strong>
                                                                                          {detailOrder.job_name ||
                                                                                              '-'}
                                                                                      </strong>
                                                                                  </p>
                                                                                  <p className="p-page-header-row">
                                                                                      <span className="p-page-header-label">
                                                                                          สาขา:
                                                                                      </span>{' '}
                                                                                      <strong>
                                                                                          {detailOrder
                                                                                              .branch
                                                                                              ?.branch_name ||
                                                                                              '-'}
                                                                                      </strong>
                                                                                  </p>
                                                                              </div>

                                                                              <div className="p-page-header-col">
                                                                                  <p className="p-page-header-row">
                                                                                      <span className="p-page-header-label">
                                                                                          วันที่รับสินค้า:
                                                                                      </span>{' '}
                                                                                      <strong>
                                                                                          {dateOnly(
                                                                                              detailOrder.due_date,
                                                                                          )}
                                                                                      </strong>
                                                                                  </p>
                                                                                  <p className="p-page-header-row">
                                                                                      <span className="p-page-header-label">
                                                                                          ลูกค้า:
                                                                                      </span>{' '}
                                                                                      <strong>
                                                                                          {detailOrder
                                                                                              .customer
                                                                                              ?.customer_name ||
                                                                                              '-'}
                                                                                      </strong>
                                                                                  </p>
                                                                                  <p className="p-page-header-row">
                                                                                      <span className="p-page-header-label">
                                                                                          ผู้บันทึก:
                                                                                      </span>{' '}
                                                                                      <strong>
                                                                                          {detailOrder
                                                                                              .creator_user
                                                                                              ?.name ||
                                                                                              '-'}
                                                                                      </strong>
                                                                                  </p>
                                                                              </div>

                                                                              <div
                                                                                  className="p-page-header-right"
                                                                                  style={{
                                                                                      borderColor:
                                                                                          group
                                                                                              .theme
                                                                                              .borderColor,
                                                                                  }}
                                                                              >
                                                                                  <div
                                                                                      className="p-page-header-barcode"
                                                                                      style={{
                                                                                          borderColor:
                                                                                              group
                                                                                                  .theme
                                                                                                  .borderColor,
                                                                                      }}
                                                                                      dangerouslySetInnerHTML={{
                                                                                          __html:
                                                                                              barcodeMarkup ||
                                                                                              `<div class="p-barcode-fallback">${detailOrder.order_code}</div>`,
                                                                                      }}
                                                                                  />
                                                                                  <p className="p-page-header-code">
                                                                                      {
                                                                                          detailOrder.order_code
                                                                                      }
                                                                                  </p>
                                                                              </div>
                                                                          </div>
                                                                      </header>

                                                                      <div className="p-form-grid">
                                                                          <div className="p-form-left">
                                                                              <div className="p-head-row">
                                                                                  <div
                                                                                      className="p-yellow-head p-head-row-main"
                                                                                      style={resolveGroupHeaderStyle(
                                                                                          group.theme,
                                                                                      )}
                                                                                  >
                                                                                      {
                                                                                          group.label
                                                                                      }
                                                                                  </div>
                                                                                  <div
                                                                                      className="p-yellow-head p-head-row-aside"
                                                                                      style={resolveGroupHeaderStyle(
                                                                                          group.theme,
                                                                                      )}
                                                                                  >
                                                                                      {
                                                                                          formTitle
                                                                                      }
                                                                                  </div>
                                                                              </div>
                                                                              <div className="p-form-body">
                                                                                  {'artworkUrls' in
                                                                                      group &&
                                                                                  group
                                                                                      .artworkUrls
                                                                                      .length >
                                                                                      0 ? (
                                                                                      <div
                                                                                          className="p-artwork-gallery"
                                                                                          style={{
                                                                                              gridTemplateColumns: `repeat(${Math.min(group.artworkUrls.length, 3)}, minmax(0, 1fr))`,
                                                                                          }}
                                                                                      >
                                                                                          {group.artworkUrls.map(
                                                                                              (
                                                                                                  url,
                                                                                                  artworkIndex,
                                                                                              ) => (
                                                                                                  <div
                                                                                                      key={
                                                                                                          url
                                                                                                      }
                                                                                                      className="p-artwork-box"
                                                                                                  >
                                                                                                      <img
                                                                                                          src={
                                                                                                              url
                                                                                                          }
                                                                                                          alt={`${group.label}-artwork-${artworkIndex + 1}`}
                                                                                                          loading="lazy"
                                                                                                      />
                                                                                                  </div>
                                                                                              ),
                                                                                          )}
                                                                                      </div>
                                                                                  ) : (
                                                                                      <div className="p-artwork-box">
                                                                                          {resolvedArtwork ? (
                                                                                              <img
                                                                                                  src={
                                                                                                      resolvedArtwork
                                                                                                  }
                                                                                                  alt={`${group.label}-artwork`}
                                                                                                  loading="lazy"
                                                                                              />
                                                                                          ) : (
                                                                                              <div className="p-artwork-empty">
                                                                                                  ไม่มีรูป
                                                                                                  Artwork
                                                                                              </div>
                                                                                          )}
                                                                                      </div>
                                                                                  )}

                                                                                  <table className="p-size-bar">
                                                                                      <thead>
                                                                                          <tr>
                                                                                              {sizeHeaders.map(
                                                                                                  (
                                                                                                      sizeLabel,
                                                                                                  ) => (
                                                                                                      <th
                                                                                                          key={`${group.key}-head-${sizeLabel}`}
                                                                                                      >
                                                                                                          {
                                                                                                              sizeLabel
                                                                                                          }
                                                                                                      </th>
                                                                                                  ),
                                                                                              )}
                                                                                              <th className="p-size-total">
                                                                                                  รวม
                                                                                              </th>
                                                                                          </tr>
                                                                                      </thead>
                                                                                      <tbody>
                                                                                          <tr>
                                                                                              {sizeHeaders.map(
                                                                                                  (
                                                                                                      sizeLabel,
                                                                                                  ) => {
                                                                                                      const sizeQuantity =
                                                                                                          Number(
                                                                                                              sizeMap.get(
                                                                                                                  sizeLabel,
                                                                                                              ) ||
                                                                                                                  0,
                                                                                                          );

                                                                                                      return (
                                                                                                          <td
                                                                                                              key={`${group.key}-qty-${sizeLabel}`}
                                                                                                              className={
                                                                                                                  hasSizeCellValue(
                                                                                                                      sizeQuantity,
                                                                                                                  )
                                                                                                                      ? 'p-size-filled'
                                                                                                                      : undefined
                                                                                                              }
                                                                                                          >
                                                                                                              {
                                                                                                                  sizeQuantity
                                                                                                              }
                                                                                                          </td>
                                                                                                      );
                                                                                                  },
                                                                                              )}
                                                                                              <td
                                                                                                  className={
                                                                                                      hasSizeCellValue(
                                                                                                          group.quantity,
                                                                                                      )
                                                                                                          ? 'p-size-total p-size-filled'
                                                                                                          : 'p-size-total'
                                                                                                  }
                                                                                              >
                                                                                                  {
                                                                                                      group.quantity
                                                                                                  }
                                                                                              </td>
                                                                                          </tr>
                                                                                      </tbody>
                                                                                  </table>

                                                                                  <div className="p-spec-block">
                                                                                      <p className="p-spec-title">
                                                                                          {
                                                                                              group.specTitle
                                                                                          }
                                                                                      </p>
                                                                                      <div className="p-spec-grid">
                                                                                          {groupSpecRows.map(
                                                                                              (
                                                                                                  specRow,
                                                                                              ) => (
                                                                                                  <div
                                                                                                      key={`${group.key}-${specRow.label}`}
                                                                                                      className="p-spec-grid-item"
                                                                                                  >
                                                                                                      <span className="p-spec-grid-label">
                                                                                                          {
                                                                                                              specRow.label
                                                                                                          }
                                                                                                      </span>
                                                                                                      <span className="p-spec-grid-value">
                                                                                                          {specRow.value ||
                                                                                                              '-'}
                                                                                                      </span>
                                                                                                  </div>
                                                                                              ),
                                                                                          )}
                                                                                      </div>
                                                                                  </div>
                                                                              </div>
                                                                          </div>

                                                                          <div className="p-form-right">
                                                                              <div
                                                                                  className="p-yellow-head"
                                                                                  style={resolveGroupHeaderStyle(
                                                                                      group.theme,
                                                                                  )}
                                                                              >
                                                                                  รายการค่าแรง
                                                                                  ·{' '}
                                                                                  {
                                                                                      formTitle
                                                                                  }
                                                                              </div>
                                                                              <div className="p-form-body">
                                                                                  <div className="p-process-wrap">
                                                                                      <table
                                                                                          className={
                                                                                              processDensity ===
                                                                                              'standard'
                                                                                                  ? 'p-process-table'
                                                                                                  : 'p-process-table p-process-table-dense'
                                                                                          }
                                                                                          data-process-density={
                                                                                              processDensity
                                                                                          }
                                                                                      >
                                                                                          <colgroup>
                                                                                              <col
                                                                                                  style={{
                                                                                                      width: PROCESS_TABLE_COLUMN_WIDTHS.item,
                                                                                                  }}
                                                                                              />
                                                                                              <col
                                                                                                  style={{
                                                                                                      width: PROCESS_TABLE_COLUMN_WIDTHS.price,
                                                                                                  }}
                                                                                              />
                                                                                              <col
                                                                                                  style={{
                                                                                                      width: PROCESS_TABLE_COLUMN_WIDTHS.workerOne,
                                                                                                  }}
                                                                                              />
                                                                                              <col
                                                                                                  style={{
                                                                                                      width: PROCESS_TABLE_COLUMN_WIDTHS.workerTwo,
                                                                                                  }}
                                                                                              />
                                                                                          </colgroup>
                                                                                          <thead>
                                                                                              <tr>
                                                                                                  <th>
                                                                                                      รายการ
                                                                                                  </th>
                                                                                                  <th className="text-center">
                                                                                                      {isKidsDocument
                                                                                                          ? 'เด็ก'
                                                                                                          : 'ผู้ใหญ่'}
                                                                                                  </th>
                                                                                                  <th className="text-center">
                                                                                                      ผู้ทำ1
                                                                                                  </th>
                                                                                                  <th className="text-center">
                                                                                                      ผู้ทำ2
                                                                                                  </th>
                                                                                              </tr>
                                                                                          </thead>
                                                                                          <tbody>
                                                                                              {isUnpricedGroup ? (
                                                                                                  <tr className="p-process-notice">
                                                                                                      <td
                                                                                                          colSpan={
                                                                                                              4
                                                                                                          }
                                                                                                      >
                                                                                                          ยังไม่ได้ตั้งค่าแรงสำหรับ{' '}
                                                                                                          {
                                                                                                              formTitle
                                                                                                          }{' '}
                                                                                                          —
                                                                                                          ตั้งได้ที่
                                                                                                          จัดการข้อมูล
                                                                                                          ›
                                                                                                          เซ็ทราคาเด็กและผู้ใหญ่
                                                                                                      </td>
                                                                                                  </tr>
                                                                                              ) : null}
                                                                                              {visibleProcessRows.map(
                                                                                                  (
                                                                                                      component,
                                                                                                  ) => (
                                                                                                      <tr
                                                                                                          key={`${group.key}-${component.name}`}
                                                                                                      >
                                                                                                          <td>
                                                                                                              {
                                                                                                                  component.name
                                                                                                              }
                                                                                                          </td>
                                                                                                          <td className="text-right">
                                                                                                              {isKidsDocument
                                                                                                                  ? formatMoney(
                                                                                                                        component.child_price,
                                                                                                                    )
                                                                                                                  : formatMoney(
                                                                                                                        component.adult_price,
                                                                                                                    )}
                                                                                                          </td>
                                                                                                          <td>
                                                                                                              &nbsp;
                                                                                                          </td>
                                                                                                          <td>
                                                                                                              &nbsp;
                                                                                                          </td>
                                                                                                      </tr>
                                                                                                  ),
                                                                                              )}
                                                                                              {Array.from(
                                                                                                  {
                                                                                                      length: blankProcessRows,
                                                                                                  },
                                                                                              ).map(
                                                                                                  (
                                                                                                      _,
                                                                                                      rowIndex,
                                                                                                  ) => (
                                                                                                      <tr
                                                                                                          key={`${group.key}-process-empty-${rowIndex}`}
                                                                                                      >
                                                                                                          <td>
                                                                                                              &nbsp;
                                                                                                          </td>
                                                                                                          <td>
                                                                                                              &nbsp;
                                                                                                          </td>
                                                                                                          <td>
                                                                                                              &nbsp;
                                                                                                          </td>
                                                                                                          <td>
                                                                                                              &nbsp;
                                                                                                          </td>
                                                                                                      </tr>
                                                                                                  ),
                                                                                              )}
                                                                                              <tr className="p-process-sum">
                                                                                                  <td className="text-right font-semibold">
                                                                                                      รวมค่าแรง
                                                                                                  </td>
                                                                                                  <td
                                                                                                      colSpan={
                                                                                                          3
                                                                                                      }
                                                                                                      className="text-right font-semibold"
                                                                                                  >
                                                                                                      {isUnpricedGroup
                                                                                                          ? 'ยังไม่ได้ตั้งค่าแรง'
                                                                                                          : formatMoney(
                                                                                                                group.subtotal,
                                                                                                            )}
                                                                                                  </td>
                                                                                              </tr>
                                                                                              <tr className="p-process-formula">
                                                                                                  <td className="text-right font-semibold">
                                                                                                      วิธีคิดคำนวณเงิน
                                                                                                      (
                                                                                                      {
                                                                                                          pricingFormulaLabel
                                                                                                      }

                                                                                                      )
                                                                                                  </td>
                                                                                                  <td
                                                                                                      colSpan={
                                                                                                          3
                                                                                                      }
                                                                                                      className="text-right font-semibold"
                                                                                                  >
                                                                                                      {
                                                                                                          pricingFormulaText
                                                                                                      }
                                                                                                  </td>
                                                                                              </tr>
                                                                                          </tbody>
                                                                                      </table>
                                                                                  </div>

                                                                                  <div className="p-signature-row">
                                                                                      <div className="p-sign-box">
                                                                                          ผู้ตรวจสอบ
                                                                                          ......................................
                                                                                      </div>
                                                                                      <div className="p-sign-box">
                                                                                          จำนวน{' '}
                                                                                          {group.quantity.toLocaleString(
                                                                                              'th-TH',
                                                                                          )}{' '}
                                                                                          ตัว
                                                                                      </div>
                                                                                      <div className="p-sign-box">
                                                                                          จำนวน{' '}
                                                                                          {dozenCount.toLocaleString(
                                                                                              'th-TH',
                                                                                          )}{' '}
                                                                                          โหล
                                                                                      </div>
                                                                                  </div>
                                                                              </div>
                                                                          </div>
                                                                      </div>

                                                                      <div className="p-bottom-meta">
                                                                          <div className="p-sign-box">
                                                                              สาขา:{' '}
                                                                              {detailOrder
                                                                                  .branch
                                                                                  ?.branch_name ||
                                                                                  '-'}
                                                                          </div>
                                                                          <div className="p-sign-box">
                                                                              ชื่อหน่วยงาน,
                                                                              ชื่องาน:{' '}
                                                                              {detailOrder.job_name ||
                                                                                  '-'}
                                                                          </div>
                                                                          <div className="p-sign-box">
                                                                              ผู้บันทึก:{' '}
                                                                              {detailOrder
                                                                                  .creator_user
                                                                                  ?.name ||
                                                                                  '-'}
                                                                          </div>
                                                                      </div>
                                                                  </section>
                                                              );
                                                          },
                                                      )
                                                    : null}

                                                {isIndividualOrder ? (
                                                    <section className="p-print-page p-print-page-flow space-y-2">
                                                        <header className="p-page-header">
                                                            <div className="p-page-header-grid">
                                                                <div className="p-page-header-logo">
                                                                    <img
                                                                        src="/images/logo/logo.png"
                                                                        alt="J.S. Sport"
                                                                    />
                                                                </div>
                                                                <div className="p-page-header-col">
                                                                    <h2 className="p-page-header-title">
                                                                        รายชื่อสกรีนรายตัว
                                                                    </h2>
                                                                    <p className="p-page-header-row">
                                                                        <span className="p-page-header-label">
                                                                            เลขที่ออเดอร์:
                                                                        </span>{' '}
                                                                        <strong>
                                                                            {
                                                                                detailOrder.order_code
                                                                            }
                                                                        </strong>
                                                                    </p>
                                                                    <p className="p-page-header-row">
                                                                        <span className="p-page-header-label">
                                                                            ชื่อหน่วยงาน,
                                                                            ชื่องาน:
                                                                        </span>{' '}
                                                                        <strong>
                                                                            {detailOrder.job_name ||
                                                                                '-'}
                                                                        </strong>
                                                                    </p>
                                                                </div>
                                                                <div className="p-page-header-col">
                                                                    <p className="p-page-header-row">
                                                                        <span className="p-page-header-label">
                                                                            ลูกค้า:
                                                                        </span>{' '}
                                                                        <strong>
                                                                            {detailOrder
                                                                                .customer
                                                                                ?.customer_name ||
                                                                                '-'}
                                                                        </strong>
                                                                    </p>
                                                                    <p className="p-page-header-row">
                                                                        <span className="p-page-header-label">
                                                                            วันที่รับสินค้า:
                                                                        </span>{' '}
                                                                        <strong>
                                                                            {dateOnly(
                                                                                detailOrder.due_date,
                                                                            )}
                                                                        </strong>
                                                                    </p>
                                                                </div>
                                                                <div className="p-page-header-right">
                                                                    <div
                                                                        className="p-page-header-barcode"
                                                                        dangerouslySetInnerHTML={{
                                                                            __html:
                                                                                barcodeMarkup ||
                                                                                `<div class="p-barcode-fallback">${detailOrder.order_code}</div>`,
                                                                        }}
                                                                    />
                                                                    <p className="p-page-header-code">
                                                                        {
                                                                            detailOrder.order_code
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </header>

                                                        <div className="p-roster-card">
                                                            <table className="p-personalization-table">
                                                                <colgroup>
                                                                    <col
                                                                        style={{
                                                                            width: '14mm',
                                                                        }}
                                                                    />
                                                                    <col />
                                                                    <col
                                                                        style={{
                                                                            width: '30mm',
                                                                        }}
                                                                    />
                                                                    <col
                                                                        style={{
                                                                            width: '30mm',
                                                                        }}
                                                                    />
                                                                    <col
                                                                        style={{
                                                                            width: '30mm',
                                                                        }}
                                                                    />
                                                                </colgroup>
                                                                <thead>
                                                                    <tr>
                                                                        <th>
                                                                            ลำดับ
                                                                        </th>
                                                                        <th>
                                                                            สกรีนชื่อ
                                                                        </th>
                                                                        <th>
                                                                            เบอร์
                                                                        </th>
                                                                        <th>
                                                                            ไซซ์
                                                                        </th>
                                                                        <th>
                                                                            จำนวน
                                                                        </th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {personalizationRows.map(
                                                                        (
                                                                            row,
                                                                            index,
                                                                        ) => (
                                                                            <tr
                                                                                key={`${row.name}-${row.number}-${index}`}
                                                                            >
                                                                                <td className="p-roster-index">
                                                                                    {index +
                                                                                        1}
                                                                                </td>
                                                                                <td>
                                                                                    {
                                                                                        row.name
                                                                                    }
                                                                                </td>
                                                                                <td>
                                                                                    {
                                                                                        row.number
                                                                                    }
                                                                                </td>
                                                                                <td>
                                                                                    {
                                                                                        row.size
                                                                                    }
                                                                                </td>
                                                                                <td>
                                                                                    {
                                                                                        row.quantity
                                                                                    }
                                                                                </td>
                                                                            </tr>
                                                                        ),
                                                                    )}
                                                                    {Array.from(
                                                                        {
                                                                            // Enough blank lines to
                                                                            // reach the bottom of
                                                                            // the card, so a short
                                                                            // team still fills its
                                                                            // page and the floor
                                                                            // can add a name by
                                                                            // hand.
                                                                            length: Math.max(
                                                                                0,
                                                                                18 -
                                                                                    personalizationRows.length,
                                                                            ),
                                                                        },
                                                                    ).map(
                                                                        (
                                                                            _,
                                                                            blankIndex,
                                                                        ) => (
                                                                            <tr
                                                                                key={`roster-blank-${blankIndex}`}
                                                                            >
                                                                                <td className="p-roster-index">
                                                                                    {personalizationRows.length +
                                                                                        blankIndex +
                                                                                        1}
                                                                                </td>
                                                                                <td>
                                                                                    &nbsp;
                                                                                </td>
                                                                                <td>
                                                                                    &nbsp;
                                                                                </td>
                                                                                <td>
                                                                                    &nbsp;
                                                                                </td>
                                                                                <td>
                                                                                    &nbsp;
                                                                                </td>
                                                                            </tr>
                                                                        ),
                                                                    )}
                                                                    <tr className="p-roster-total">
                                                                        <td
                                                                            colSpan={
                                                                                4
                                                                            }
                                                                        >
                                                                            รวม
                                                                        </td>
                                                                        <td>
                                                                            {personalizationRows.reduce(
                                                                                (
                                                                                    sum,
                                                                                    row,
                                                                                ) =>
                                                                                    sum +
                                                                                    row.quantity,
                                                                                0,
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        <div className="p-bottom-meta">
                                                            <div className="p-sign-box">
                                                                สาขา:{' '}
                                                                {detailOrder
                                                                    .branch
                                                                    ?.branch_name ||
                                                                    '-'}
                                                            </div>
                                                            <div className="p-sign-box">
                                                                ชื่อหน่วยงาน,
                                                                ชื่องาน:{' '}
                                                                {detailOrder.job_name ||
                                                                    '-'}
                                                            </div>
                                                            <div className="p-sign-box">
                                                                ผู้ตรวจสอบรายชื่อ
                                                                ....................
                                                            </div>
                                                        </div>
                                                    </section>
                                                ) : null}
                                            </div>

                                            {productionGroups.length === 0 ? (
                                                <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                                                    ไม่พบข้อมูลกลุ่มไซซ์เด็ก/ผู้ใหญ่สำหรับเสื้อหรือกางเกงในออเดอร์นี้
                                                </section>
                                            ) : null}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

            <Dialog
                open={timelineOrder !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setTimelineOrder(null);
                    }
                }}
            >
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>
                            Timeline ออเดอร์ {timelineOrder?.order_code}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
                            <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                                <p>
                                    ลูกค้า:{' '}
                                    <span className="font-semibold text-slate-900">
                                        {timelineOrder?.customer
                                            ?.customer_name || '-'}
                                    </span>
                                </p>
                                <p>
                                    ชื่อหน่วยงาน, ชื่องาน:{' '}
                                    <span className="font-semibold text-slate-900">
                                        {timelineOrder?.job_name || '-'}
                                    </span>
                                </p>
                                <p>
                                    ประเภทงาน:{' '}
                                    <span className="font-semibold text-slate-900">
                                        {timelineOrder?.job_type || '-'}
                                    </span>
                                </p>
                                <p>
                                    กำหนดส่ง:{' '}
                                    <span className="font-semibold text-slate-900">
                                        {dateOnly(timelineOrder?.due_date)}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {getVisibleTimelineRoutings(
                                timelineOrder?.routings ?? [],
                            ).map((routing, index, routings) => {
                                const detailLabel =
                                    timelineDetailLabel(routing);
                                const hasReachedAnyStep = routings.some(
                                    (item) => item.status !== 'pending',
                                );
                                const isFuture =
                                    routing.status === 'pending' &&
                                    hasReachedAnyStep;
                                const incomingDate = isFuture
                                    ? '-'
                                    : dateTime(routing.created_at);
                                const roomLabel =
                                    routing.station_name === 'embroidery'
                                        ? getEmbroideryTimelineLabel(
                                              routing,
                                              routings,
                                          )
                                        : stationLabel(routing.station_name);

                                return (
                                    <div
                                        key={routing.id}
                                        className="relative pl-8"
                                    >
                                        {index < routings.length - 1 ? (
                                            <div
                                                className={`absolute top-8 left-[14px] h-[calc(100%-8px)] w-px ${isFuture ? 'bg-slate-200' : 'bg-slate-300'}`}
                                            />
                                        ) : null}
                                        <div
                                            className={`absolute top-1.5 left-0 flex size-7 items-center justify-center rounded-full border ${timelineStatusClass(routing.status)}`}
                                        >
                                            <span className="text-[10px] font-bold">
                                                {index + 1}
                                            </span>
                                        </div>

                                        <div
                                            className={`rounded-2xl border p-4 shadow-sm ${isFuture ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}
                                        >
                                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <h3
                                                            className={`text-sm font-bold ${isFuture ? 'text-slate-500' : 'text-slate-900'}`}
                                                        >
                                                            {roomLabel}
                                                        </h3>
                                                        <span
                                                            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${timelineStatusClass(routing.status)}`}
                                                        >
                                                            {routingStatusLabel(
                                                                routing.status,
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="grid gap-1 text-xs text-slate-600 md:grid-cols-2">
                                                        <p>
                                                            วันที่งานเข้า:{' '}
                                                            <span className="font-medium text-slate-900">
                                                                {incomingDate}
                                                            </span>
                                                        </p>
                                                        <p>
                                                            วันที่เริ่ม:{' '}
                                                            <span className="font-medium text-slate-900">
                                                                {dateTime(
                                                                    routing.started_at,
                                                                )}
                                                            </span>
                                                        </p>
                                                        <p>
                                                            วันที่เสร็จ:{' '}
                                                            <span className="font-medium text-slate-900">
                                                                {dateTime(
                                                                    routing.completed_at,
                                                                )}
                                                            </span>
                                                        </p>
                                                        {detailLabel ? (
                                                            <p>
                                                                รายละเอียด:{' '}
                                                                <span className="font-medium text-slate-900">
                                                                    {
                                                                        detailLabel
                                                                    }
                                                                </span>
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    {routing.rework_note ? (
                                                        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                                            หมายเหตุแก้ไข:{' '}
                                                            {
                                                                routing.rework_note
                                                            }
                                                        </p>
                                                    ) : null}
                                                </div>

                                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                                    สถานะปัจจุบัน:{' '}
                                                    <span
                                                        className={`font-semibold ${routing.status === 'completed' ? 'text-emerald-700' : routing.status === 'rejected' ? 'text-rose-700' : routing.status === 'in_progress' ? 'text-[#E21E26]' : 'text-slate-500'}`}
                                                    >
                                                        {routingStatusLabel(
                                                            routing.status,
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
