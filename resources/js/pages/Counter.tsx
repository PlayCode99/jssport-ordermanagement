import { Head, router, usePage } from '@inertiajs/react';
import JsBarcode from 'jsbarcode';
import {
    Calendar,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Copy,
    Factory,
    FilePlus2,
    MoreHorizontal,
    Package,
    Pencil,
    Printer,
    ScanFace,
    Search,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import DeliveryCalendarDialog from '@/components/domain/counter/DeliveryCalendarDialog';
import type { DeliveryCalendar } from '@/components/domain/counter/DeliveryCalendarDialog';
import {
    WorkReceiptBillHeader,
    WorkReceiptTopBar,
} from '@/components/domain/orders/WorkReceiptHeader';
import PendingInvitationsModal from '@/components/pending-invitations-modal';
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from '@/components/ui/select';
import {
    DEFAULT_BRANCH_HEADER_COLOR,
    resolveBranchHeaderColor,
} from '@/lib/branchHeaderColor';
import type { DashboardInvitation } from '@/types';

export interface FloorStats {
    print_room: {
        new_job: number;
        new_job_qty: number;
        printer_1: number;
        printer_2: number;
        printer_3: number;
        completed: number;
        completed_qty: number;
    };
    cutting: {
        new_job: number;
        new_job_qty: number;
        assigned: number;
        completed: number;
        completed_qty: number;
    };
    heat_press: {
        new_job: number;
        new_job_qty: number;
        assigned: number;
        revising: number;
        completed: number;
        completed_qty: number;
    };
    sewing: {
        new_job: number;
        new_job_qty: number;
        assigned: number;
        completed: number;
        completed_qty: number;
    };
    embroidery: {
        new_job: number;
        new_job_qty: number;
        assigned: number;
        completed: number;
        completed_qty: number;
    };
    screen_flex: {
        new_job: number;
        new_job_qty: number;
        assigned: number;
        revising: number;
        completed: number;
        completed_qty: number;
    };
    qc: {
        new_job: number;
        new_job_qty: number;
        pending_inspect: number;
        completed: number;
        completed_qty: number;
    };
    shipping: {
        pending_ship: number;
        pending_ship_qty: number;
        store_pickup: number;
        courier: number;
        onsite_delivery: number;
        completed_qty: number;
    };
}

type CounterFilters = {
    branch_id?: string | null;
    billing_date_from: string | null;
    billing_date_to: string | null;
    shipping_date_from: string | null;
    shipping_date_to: string | null;
    search?: string | null;
};

export interface OrderTableRow {
    id: number;
    billing_date: string;
    billing_time?: string;
    due_date: string;
    order_code: string;
    order_item_count?: number;
    has_order_pdf?: boolean;
    branch_name: string;
    customer_name: string;
    job_type: string;
    order_status: string;
    status:
        | 'design'
        | 'print_room'
        | 'cutting'
        | 'heat_press'
        | 'embroidery'
        | 'sewing'
        | 'screen_flex'
        | 'qc'
        | 'shipping'
        | 'completed';
    receipt_code?: string;
    payment_status: 'paid' | 'deposit' | 'pending';
    has_payment_pdf?: boolean;
    receiver_name: string;
    details?: {
        order_code: string;
        job_name: string;
        job_type: string;
        order_status: string;
        billing_date: string | null;
        due_date: string | null;
        branch_name: string | null;
        delivery_method: string | null;
        shipping_address: string | null;
        shipping_delivery_info?: {
            carrier_name?: string;
            tracking_no?: string;
            onsite_sender_name?: string;
            onsite_vehicle_plate?: string;
            sender_signature?: string;
        } | null;
        customer: {
            name: string | null;
            phone: string | null;
            line_fb: string | null;
        };
        pricing: {
            total_amount: number;
            discount_percent: number;
            discount_amount: number;
            net_amount: number;
            paid_amount: number;
        };
        specification: Record<string, string | number | null> | null;
        specification_display?: Array<{ label: string; value: string }>;
        spec_sections?: {
            shirt: Array<{ label: string; value: string }>;
            pants: Array<{ label: string; value: string }>;
        };
        items: Array<{
            item_type: string;
            size_group: string;
            size_label: string;
            quantity: number;
            unit_price: number;
            total_price: number;
        }>;
        routings: Array<{
            id: number;
            is_required: boolean;
            station_name: string;
            status: string;
            print_machine?: string | null;
            assigned_user: string | null;
            cutting_team_name?: string | null;
            sewing_team_name?: string | null;
            embroidery_team_name?: string | null;
            screen_team_name?: string | null;
            heat_press_machine_name?: string | null;
            rework_note?: string | null;
            created_at?: string | null;
            started_at: string | null;
            completed_at: string | null;
        }>;
        receipts: Array<{
            receipt_code: string;
            payment_date: string | null;
            payment_type: string;
            payment_method: string;
            amount_paid: number;
            note: string | null;
        }>;
        personalization_rows?: Array<{
            role?: 'player' | 'keeper';
            name: string;
            size_group?: 'kids' | 'adults';
            size: string;
            number: string;
            pants_size?: string;
            pants_number?: string;
            /** 'short' | 'long', or '' on a bill saved before lengths existed. */
            shirt_style?: string;
            pants_style?: string;
            quantity: number;
            unit_price: number;
            total_price: number;
        }>;
        /** Shirt colour worn by the keepers, one per bill. */
        individual_keeper_color?: string;
        sports_day_groups?: SportsDayGroupPayload[];
        sports_day_artwork_urls?: string[];
        pe_uniform_artwork_urls?: string[];
        artwork_url: string | null;
        shirt_artwork_urls: string[];
        pants_artwork_urls: string[];
        reference_designs: string[];
    };
}

export type CounterPagination = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
};

type CounterProps = {
    pendingInvitations?: DashboardInvitation[];
    branches: Array<{ value: string; label: string }>;
    floorStats: FloorStats;
    filters: CounterFilters;
    orders: OrderTableRow[];
    pagination?: CounterPagination;
    deliveryCalendar: DeliveryCalendar;
    deliveryDueToday?: number;
    savedOrderCode?: string | null;
};

type DepartmentCardProps = {
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    rows: Array<{
        label: string;
        value: number;
        quantity?: number;
        tone?: 'red' | 'blue' | 'neutral';
    }>;
    accent: 'red' | 'blue' | 'slate';
    surfaceClass?: string;
    darkSurface?: boolean;
    glowClass?: string;
    layerClass?: string;
};

function formatInput(value: string | null | undefined): string {
    return value ?? '';
}

function escapeHtml(value: string | null | undefined): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createOrderCodeBarcodeSvg(orderCode: string): string {
    try {
        const svgNode = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg',
        );

        JsBarcode(svgNode, orderCode, {
            format: 'CODE128',
            width: 1.45,
            height: 36,
            margin: 0,
            displayValue: true,
            text: orderCode,
            font: 'monospace',
            fontSize: 12,
            textMargin: 1,
        });

        return svgNode.outerHTML;
    } catch {
        return '';
    }
}

function DepartmentCard({
    title,
    icon,
    rows,
    accent,
    surfaceClass,
    darkSurface = false,
    layerClass,
}: DepartmentCardProps) {
    const borderClass = darkSurface
        ? 'border-slate-700/80'
        : accent === 'red'
          ? 'border-white/10'
          : accent === 'blue'
            ? 'border-white/10'
            : 'border-white/10';
    const iconClass = darkSurface
        ? accent === 'red'
            ? 'text-[#E21E26]/90'
            : 'text-white'
        : accent === 'red'
          ? 'text-[#E21E26]'
          : accent === 'blue'
            ? 'text-white'
            : 'text-slate-700';

    const primaryRow = rows[0];
    const secondaryRows = rows.slice(1);
    const primaryValueClass =
        primaryRow.tone === 'red'
            ? darkSurface
                ? 'text-[#E21E26]/90'
                : 'text-[#E21E26]'
            : primaryRow.tone === 'blue'
              ? darkSurface
                  ? 'text-white'
                  : 'text-white'
              : darkSurface
                ? 'text-slate-100'
                : 'text-slate-900';

    return (
        <article
            className={`relative overflow-hidden rounded-2xl border ${borderClass} ${surfaceClass ?? 'bg-gradient-to-br from-[#071A33] via-[#0A2344] to-[#0E2B52]'} p-4 shadow-sm transition-all duration-200 ease-out will-change-transform hover:translate-y-1 hover:shadow-lg`}
        >
            {layerClass ? (
                <div
                    className={`pointer-events-none absolute inset-0 ${layerClass}`}
                />
            ) : null}

            <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <div
                            className={`flex size-5 items-center justify-center ${iconClass}`}
                        >
                            {icon}
                        </div>
                        <h3
                            className={`text-sm font-semibold ${darkSurface ? 'text-slate-100' : 'text-white'}`}
                        >
                            {title}
                        </h3>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-300/80">
                        {primaryRow.label}
                    </p>
                </div>

                <div className="text-right">
                    <p
                        className={`mt-1 text-3xl leading-none font-semibold tabular-nums ${primaryValueClass}`}
                    >
                        {primaryRow.value}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-300/80">
                        {primaryRow.quantity?.toLocaleString('th-TH') ?? 0} ตัว
                    </p>
                </div>
            </div>

            {secondaryRows.length > 0 ? (
                <div className="relative z-10 mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                    {secondaryRows.map((row) => {
                        const valueClass =
                            row.tone === 'red'
                                ? darkSurface
                                    ? 'text-[#E21E26]/90'
                                    : 'text-[#E21E26]'
                                : row.tone === 'blue'
                                  ? darkSurface
                                      ? 'text-white'
                                      : 'text-white'
                                  : darkSurface
                                    ? 'text-slate-200'
                                    : 'text-slate-600';

                        return (
                            <div
                                key={row.label}
                                className="flex items-center justify-between gap-3"
                            >
                                <span className="text-[10px] font-medium text-slate-300/80">
                                    {row.label}
                                </span>
                                <div className="text-right">
                                    <span
                                        className={`block text-base font-semibold tabular-nums ${valueClass}`}
                                    >
                                        {row.value}
                                    </span>
                                    <span className="mt-0.5 block text-[10px] text-slate-300/80">
                                        {row.quantity?.toLocaleString(
                                            'th-TH',
                                        ) ?? 0}{' '}
                                        ตัว
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </article>
    );
}

const tableDateFormatter = new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});

function formatTableDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return tableDateFormatter.format(date);
}

function formatShortDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return new Intl.DateTimeFormat('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    }).format(date);
}

function dateTime(value: string | null | undefined): string {
    if (!value) {
        return '-';
    }

    const normalized = value.trim();
    const isoLikeValue = normalized.includes(' ')
        ? normalized.replace(' ', 'T')
        : normalized;
    const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(isoLikeValue);
    const date = new Date(hasTimezone ? isoLikeValue : `${isoLikeValue}Z`);

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return new Intl.DateTimeFormat('th-TH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

type CounterDisplayStatus =
    'design' | 'in_progress' | 'qc' | 'shipping' | 'completed';

function toCounterDisplayStatus(row: OrderTableRow): CounterDisplayStatus {
    switch (row.status) {
        case 'qc':
            return 'qc';
        case 'shipping':
            return 'shipping';
        case 'completed':
            return 'completed';
        default:
            // Counter view intentionally hides room-level granularity,
            // but if any required routing already completed, show in-progress state.
            if (
                row.details?.routings?.some(
                    (routing) =>
                        routing.is_required && routing.status === 'completed',
                )
            ) {
                return 'in_progress';
            }

            return 'design';
    }
}

function statusLabel(row: OrderTableRow): string {
    switch (toCounterDisplayStatus(row)) {
        case 'design':
            return 'คอนเฟิร์มแบบ';
        case 'in_progress':
            return 'กำลังดำเนินการ';
        case 'qc':
            return 'ตรวจสอบ';
        case 'shipping':
            return 'จัดส่ง';
        case 'completed':
            return 'ปิดงาน';
    }
}

function deliveryMethodLabel(method: string | null | undefined): string {
    switch (method) {
        case 'shipping':
            return 'ขนส่ง';
        case 'onsite':
            return 'หน้างาน';
        case 'pickup':
            return 'รับหน้าร้าน';
        default:
            return '-';
    }
}

function statusClass(row: OrderTableRow): string {
    switch (toCounterDisplayStatus(row)) {
        case 'design':
            return '!border-sky-500 !bg-sky-500 !text-white';
        case 'in_progress':
            return '!border-orange-500 !bg-orange-500 !text-white';
        case 'qc':
            return '!border-red-500 !bg-red-500 !text-white';
        case 'shipping':
            return '!border-blue-600 !bg-blue-600 !text-white';
        case 'completed':
            return '!border-emerald-600 !bg-emerald-600 !text-white';
    }
}

function paymentLabel(status: OrderTableRow['payment_status']): string {
    switch (status) {
        case 'paid':
            return 'ชำระครบ';
        case 'deposit':
            return 'มัดจำ';
        case 'pending':
            return 'ค้างชำระ';
    }
}

function paymentClass(status: OrderTableRow['payment_status']): string {
    switch (status) {
        case 'paid':
            return 'border-emerald-200 bg-emerald-50 text-emerald-700';
        case 'deposit':
            return 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]';
        case 'pending':
            return 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]';
    }
}

function formatMoney(value: number): string {
    return value.toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/**
 * The counter work sheet has to land on exactly one A4 portrait page, but the
 * amount of content varies per order. Artwork height is the adjustable part:
 * the fitter shrinks it when there is a lot to print and lets it grow when
 * there is little, never going below a size that is still readable.
 */
const PRINT_PAGE_HEIGHT_MM = 297;
const PRINT_PAGE_MARGIN_MM = 4;
/**
 * The artwork block is the same height on every sheet, so two bills printed one
 * after the other look alike instead of one carrying a poster and the next a
 * stamp. 58mm is what the first artwork on ORD-2026-00010 fills at four images
 * across, which is the size the shop settled on.
 */
const PRINT_ARTWORK_FIXED_MM = 58;
/** Only reached when a dense bill would otherwise spill onto a second page. */
const PRINT_ARTWORK_MIN_MM = 20;
/** 1mm at a time: the artwork is the last thing trimmed and the first thing
 *  given back, so a coarse step leaves millimetres of paper unused. */
const PRINT_ARTWORK_STEP_MM = 1;
const PRINT_SIZE_FONT_PX = 11;
const PRINT_SIZE_FONT_MAX_PX = 15;
/** Dense orders may tighten the table before the whole sheet gets scaled. */
const PRINT_SIZE_FONT_MIN_PX = 8;
const PRINT_SIZE_FONT_STEP_PX = 0.5;
/** Last resort once the artwork is already at its smallest. */
const PRINT_MIN_SCALE = 0.72;

/**
 * Runs inside the print window: waits for the artwork to load, then sizes the
 * sheet to exactly one A4 page. Too much content trims the artwork, and scales
 * the whole sheet as a last resort rather than spilling onto a second page.
 * Too little content grows the size-table text and then the artwork, so a short
 * order fills the page instead of stopping halfway down it.
 */
export function buildPrintFitScript(): string {
    return `
        (function () {
            var PAGE_MM = ${PRINT_PAGE_HEIGHT_MM} - (${PRINT_PAGE_MARGIN_MM} * 2);
            var FIXED = ${PRINT_ARTWORK_FIXED_MM};
            var MIN = ${PRINT_ARTWORK_MIN_MM};
            var STEP = ${PRINT_ARTWORK_STEP_MM};
            var FONT = ${PRINT_SIZE_FONT_PX};
            var FONT_MAX = ${PRINT_SIZE_FONT_MAX_PX};
            var FONT_MIN = ${PRINT_SIZE_FONT_MIN_PX};
            var FONT_STEP = ${PRINT_SIZE_FONT_STEP_PX};
            var MIN_SCALE = ${PRINT_MIN_SCALE};

            function whenImagesSettled(done) {
                var images = Array.prototype.slice.call(document.images);
                var pending = images.length;

                if (pending === 0) { done(); return; }

                var finish = function () { pending -= 1; if (pending <= 0) { done(); } };

                images.forEach(function (image) {
                    if (image.complete) { finish(); return; }
                    image.addEventListener('load', finish, { once: true });
                    image.addEventListener('error', finish, { once: true });
                });

                // Never block printing on a stalled image.
                setTimeout(function () { if (pending > 0) { pending = 0; done(); } }, 3000);
            }

            function fit() {
                var probe = document.createElement('div');
                probe.className = 'fit-probe';
                document.body.appendChild(probe);
                var pxPerMm = probe.offsetHeight / 100;
                probe.remove();

                if (!pxPerMm) { window.__printFitted = true; window.print(); return; }

                var page = document.querySelector('.page');
                if (!page) { window.__printFitted = true; window.print(); return; }

                var limit = PAGE_MM * pxPerMm;
                var height = FIXED;

                function setArtwork(mm) {
                    height = mm;
                    document.documentElement.style.setProperty('--artwork-h', mm + 'mm');
                }

                function setFont(px) {
                    document.documentElement.style.setProperty('--size-font', px + 'px');
                }

                setArtwork(height);
                setFont(FONT);

                // The artwork holds its fixed height unless the sheet would not
                // fit at all. Losing a millimetre of picture beats printing the
                // work sheet on two pages.
                while (page.scrollHeight > limit && height > MIN) {
                    setArtwork(Math.max(MIN, height - STEP));
                }

                // Still too tall with the artwork at its floor: tighten the size
                // table next. Smaller figures on one page beat a scaled sheet, and
                // beat spilling onto a second page.
                var tight = FONT;

                while (page.scrollHeight > limit && tight > FONT_MIN) {
                    tight = Math.max(FONT_MIN, tight - FONT_STEP);
                    setFont(tight);
                }

                if (page.scrollHeight <= limit) {
                    // Room to spare goes to the size table first: readable figures
                    // matter more than a big picture.
                    var font = tight;

                    while (font < FONT_MAX) {
                        font = Math.min(FONT_MAX, font + FONT_STEP);
                        setFont(font);

                        if (page.scrollHeight > limit) { setFont(font - FONT_STEP); break; }
                    }

                    // Then hand whatever is still unused back to the artwork, up to
                    // the fixed height and never past it. Without this a sheet that
                    // had to trim the picture kept it trimmed even once the trim was
                    // no longer needed, printing a small picture above a band of
                    // empty paper.
                    while (height < FIXED) {
                        height = Math.min(FIXED, height + STEP);
                        setArtwork(height);

                        if (page.scrollHeight > limit) { setArtwork(height - STEP); break; }
                    }
                }

                if (page.scrollHeight > limit) {
                    var natural = page.scrollHeight;
                    var scale = Math.max(MIN_SCALE, limit / natural);

                    page.style.transformOrigin = 'top center';
                    page.style.transform = 'scale(' + scale + ')';
                    // The transform is visual only, so the document still reserves
                    // the unscaled height. Shrink the body instead of the scaled
                    // element, or the sheet ends up scaled twice.
                    document.body.style.height = (natural * scale) + 'px';

                    // Only clip once the sheet genuinely fits. When the order is so
                    // large that even MIN_SCALE cannot squeeze it onto one page we
                    // must let the remainder flow onto a second sheet -- printing a
                    // receipt with rows silently cut off would be far worse.
                    if (natural * scale <= limit + 1) {
                        document.body.style.overflow = 'hidden';
                    }
                }

                window.__printFitted = true;
                window.print();
            }

            whenImagesSettled(fit);
        })();
    `;
}

const ADULT_SIZE_ORDER = [
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
const KID_SIZE_ORDER = ['JSS', 'JS', 'JM', 'JL', 'JXL'];

type SpecPrintRow = { label: string; value: string };

/**
 * Settings that read as one and must share a printed row. The receipt lays
 * the spec out two settings to a row, so without this the inner placket
 * colour could end one row and the outer start the next.
 */
const PAIRED_SPEC_LABELS: ReadonlyArray<readonly [string, string]> = [
    ['สีสาบ (ใน)', 'สีสาบ (นอก)'],
];

const isPairedSpecLabel = (label: string): boolean =>
    PAIRED_SPEC_LABELS.some((pair) => pair.includes(label));

/**
 * The receipt's spec settings as printed cells, two to a row, with every
 * pair kept on one row. A pair that would start in the right-hand column
 * takes the next single setting up into that slot instead and begins the
 * following row; when there is no single setting left to move, the slot
 * stays blank. Nothing else changes place.
 */
function layoutSpecPrintCells(
    rows: SpecPrintRow[],
): Array<SpecPrintRow | null> {
    const cells: Array<SpecPrintRow | null> = [];
    const queue = [...rows];

    while (queue.length > 0) {
        const row = queue.shift() as SpecPrintRow;
        const partner = PAIRED_SPEC_LABELS.find(
            ([first]) => first === row.label,
        )?.[1];
        const startsPair = partner !== undefined && queue[0]?.label === partner;

        if (startsPair && cells.length % 2 === 1) {
            const fillerIndex = queue.findIndex(
                (candidate, index) =>
                    index > 0 && !isPairedSpecLabel(candidate.label),
            );

            cells.push(
                fillerIndex === -1
                    ? null
                    : (queue.splice(fillerIndex, 1)[0] as SpecPrintRow),
            );
        }

        cells.push(row);
    }

    return cells;
}

export type SportsDayGroupPayload = {
    team_name: string;
    color_name: string;
    rows: Array<{
        size_group: 'kids' | 'adults';
        size_label: string;
        shirt_qty: number;
        shirt_price: number;
        pants_qty: number;
        pants_price: number;
    }>;
};

/**
 * Colour houses are named by colour, so the column that carries a house is
 * painted with it: the floor picks its stack by colour long before it reads the
 * word. Matched on the longest name first so "น้ำตาล" is never taken for
 * "น้ำเงิน", and anything unrecognised falls back to plain grey rather than
 * guessing.
 */
const SPORTS_DAY_COLOR_SWATCHES: Array<[string, string]> = [
    ['กรมท่า', '#1E3A8A'],
    ['น้ำตาล', '#92400E'],
    ['น้ำเงิน', '#1D4ED8'],
    ['ชมพู', '#EC4899'],
    ['เหลือง', '#FACC15'],
    ['เขียว', '#16A34A'],
    ['ม่วง', '#7C3AED'],
    ['แดง', '#DC2626'],
    ['ส้ม', '#F97316'],
    ['ฟ้า', '#38BDF8'],
    ['ครีม', '#FDE68A'],
    ['เทา', '#6B7280'],
    ['ทอง', '#D4AF37'],
    ['เงิน', '#CBD5E1'],
    ['ขาว', '#FFFFFF'],
    ['ดำ', '#111827'],
];

const SPORTS_DAY_FALLBACK_SWATCH = '#94A3B8';

export function resolveSportsDaySwatch(name: string): {
    background: string;
    text: string;
} {
    const needle = name.trim();
    const match = SPORTS_DAY_COLOR_SWATCHES.find(([label]) =>
        needle.includes(label),
    );
    const background = match ? match[1] : SPORTS_DAY_FALLBACK_SWATCH;

    // Relative luminance decides the text colour, so a pale house like ครีม or
    // ขาว keeps readable dark text instead of white on white.
    const channel = (offset: number): number =>
        Number.parseInt(background.slice(offset, offset + 2), 16) / 255;
    const luminance =
        0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);

    // 0.5 rather than a higher cut: white on ส้ม or เหลือง measures around 3:1,
    // which is thin on paper, while dark text on the same ground is about 7:1.
    return { background, text: luminance > 0.5 ? '#0F172A' : '#FFFFFF' };
}

export type SportsDayMatrix = {
    sizeGroup: 'kids' | 'adults';
    garment: 'shirt' | 'pants';
    title: string;
    houses: Array<{ name: string; background: string; text: string }>;
    rows: Array<{
        sizeLabel: string;
        quantities: number[];
        price: string;
        quantity: number;
        amount: number;
    }>;
    houseTotals: number[];
    houseAmounts: number[];
    grandTotal: number;
    grandAmount: number;
};

/**
 * The counter sheet shows a colour house per column and a size per row, which
 * is how the shop counts a sports day order: one glance says how many pink
 * larges to cut. Sizes with nothing ordered are left out, and so is a garment
 * the order does not contain at all.
 */
export function buildSportsDayMatrices(
    groups: SportsDayGroupPayload[],
): SportsDayMatrix[] {
    const houses = groups.map((group) => {
        const label = group.team_name.trim() || group.color_name.trim() || '-';
        const swatch = resolveSportsDaySwatch(
            group.color_name.trim() || group.team_name,
        );

        return { name: label, ...swatch };
    });

    const matrices: SportsDayMatrix[] = [];

    for (const sizeGroup of ['kids', 'adults'] as const) {
        for (const garment of ['shirt', 'pants'] as const) {
            const quantityOf = (row: SportsDayGroupPayload['rows'][number]) =>
                garment === 'shirt' ? row.shirt_qty : row.pants_qty;
            const priceOf = (row: SportsDayGroupPayload['rows'][number]) =>
                garment === 'shirt' ? row.shirt_price : row.pants_price;

            const sizeLabels: string[] = [];

            groups.forEach((group) => {
                group.rows.forEach((row) => {
                    if (
                        row.size_group !== sizeGroup ||
                        quantityOf(row) <= 0 ||
                        row.size_label.trim() === ''
                    ) {
                        return;
                    }

                    if (!sizeLabels.includes(row.size_label)) {
                        sizeLabels.push(row.size_label);
                    }
                });
            });

            if (sizeLabels.length === 0) {
                continue;
            }

            const order =
                sizeGroup === 'kids' ? KID_SIZE_ORDER : ADULT_SIZE_ORDER;
            const rank = (label: string): number => {
                const found = order.indexOf(label.toUpperCase());

                return found < 0 ? Number.MAX_SAFE_INTEGER : found;
            };

            sizeLabels.sort(
                (left, right) =>
                    rank(left) - rank(right) || left.localeCompare(right),
            );

            const rows = sizeLabels.map((sizeLabel) => {
                const cellsOf = (group: SportsDayGroupPayload) =>
                    group.rows.filter(
                        (row) =>
                            row.size_group === sizeGroup &&
                            row.size_label === sizeLabel,
                    );

                const quantities = groups.map((group) =>
                    cellsOf(group).reduce(
                        (total, row) => total + quantityOf(row),
                        0,
                    ),
                );

                // Money is added up house by house rather than as quantity times
                // one price, so a house charged differently still contributes
                // what it actually costs.
                const amounts = groups.map((group) =>
                    cellsOf(group).reduce(
                        (total, row) => total + quantityOf(row) * priceOf(row),
                        0,
                    ),
                );

                const prices = groups.flatMap((group) =>
                    group.rows
                        .filter(
                            (row) =>
                                row.size_group === sizeGroup &&
                                row.size_label === sizeLabel &&
                                quantityOf(row) > 0 &&
                                priceOf(row) > 0,
                        )
                        .map((row) => priceOf(row)),
                );

                const distinct = [...new Set(prices)].sort((a, b) => a - b);
                // Houses normally share one price per size. When they do not,
                // the range is shown rather than one house's price standing in
                // for the others.
                const price =
                    distinct.length === 0
                        ? '-'
                        : distinct.length === 1
                          ? formatMoney(distinct[0])
                          : `${formatMoney(distinct[0])}-${formatMoney(distinct[distinct.length - 1])}`;

                return {
                    sizeLabel,
                    quantities,
                    price,
                    quantity: quantities.reduce(
                        (total, value) => total + value,
                        0,
                    ),
                    amount: amounts.reduce((total, value) => total + value, 0),
                };
            });

            const houseTotals = houses.map((_, index) =>
                rows.reduce((total, row) => total + row.quantities[index], 0),
            );

            const houseAmounts = houses.map((_, houseIndex) =>
                sizeLabels.reduce((total, sizeLabel) => {
                    const group = groups[houseIndex];

                    return (
                        total +
                        group.rows
                            .filter(
                                (row) =>
                                    row.size_group === sizeGroup &&
                                    row.size_label === sizeLabel,
                            )
                            .reduce(
                                (sum, row) =>
                                    sum + quantityOf(row) * priceOf(row),
                                0,
                            )
                    );
                }, 0),
            );

            matrices.push({
                sizeGroup,
                garment,
                title: `${sizeGroup === 'kids' ? 'ขนาดเด็ก · อนุบาล/ประถม' : 'ขนาดผู้ใหญ่ · มัธยมต้น/มัธยมปลาย'} · ${garment === 'shirt' ? 'เสื้อ' : 'กางเกง'}`,
                houses,
                rows,
                houseTotals,
                houseAmounts,
                grandTotal: houseTotals.reduce(
                    (total, value) => total + value,
                    0,
                ),
                grandAmount: houseAmounts.reduce(
                    (total, value) => total + value,
                    0,
                ),
            });
        }
    }

    return matrices;
}

// Short forms for reading next to a garment that is already named; the column
// headings on the printed sheet spell the garment out in full.
const SHIRT_STYLE_PRINT_LABELS: Record<string, string> = {
    short: 'แขนสั้น',
    long: 'แขนยาว',
};
const PANTS_STYLE_PRINT_LABELS: Record<string, string> = {
    short: 'ขาสั้น',
    long: 'ขายาว',
};

/**
 * One colour per length, shared by shirts and pants, so the rule is a single
 * thing to learn: sky means short, violet means long. Kept clear of the size
 * group's own green/orange and of the brand red so nothing reads as a warning.
 * The chip still spells the length out -- colour is never the only signal.
 */
const STYLE_CHIP_CLASSES: Record<string, string> = {
    short: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
    long: 'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
};

const SHIRT_STYLE_COLUMN_LABELS: Record<string, string> = {
    short: 'เสื้อแขนสั้น',
    long: 'เสื้อแขนยาว',
};
const PANTS_STYLE_COLUMN_LABELS: Record<string, string> = {
    short: 'กางเกงขาสั้น',
    long: 'กางเกงขายาว',
};

/**
 * The same lengths without the garment in front, for the person lists where the
 * column already says which garment it is.
 */
const SHIRT_STYLE_PERSON_LABELS: Record<string, string> = {
    short: 'แขนสั้น',
    long: 'แขนยาว',
};
const PANTS_STYLE_PERSON_LABELS: Record<string, string> = {
    short: 'ขาสั้น',
    long: 'ขายาว',
};

/**
 * How a person list wears one garment's length.
 *
 * A bill where everyone matches needs no column of its own — saying the length
 * once in the header is shorter and reads better — while a mixed bill needs one
 * so the customer can see who differs. A bill saved before lengths existed
 * carries none at all and prints exactly as it always did.
 */
type PersonLengthSummary = {
    /** True when the list carries both lengths and needs its own column. */
    mixed: boolean;
    /** e.g. "แขนสั้น 20 คน · แขนยาว 10 คน", '' when the bill says nothing. */
    caption: string;
    /** The label for one person's cell. */
    labelOf: (style: string | undefined) => string;
};

function summarizePersonLengths(
    styles: Array<string | undefined>,
    labels: Record<string, string>,
): PersonLengthSummary {
    const counts = new Map<string, number>();

    for (const style of styles) {
        if (style !== 'short' && style !== 'long') {
            continue;
        }

        counts.set(style, (counts.get(style) ?? 0) + 1);
    }

    const used = ['short', 'long'].filter((style) => counts.has(style));

    return {
        mixed: used.length > 1,
        caption: used
            .map(
                (style) =>
                    `${labels[style]} ${(counts.get(style) ?? 0).toLocaleString('th-TH')} คน`,
            )
            .join(' · '),
        labelOf: (style) =>
            style === 'short' || style === 'long' ? labels[style] : '-',
    };
}

type PrintSizeRow = {
    sizeLabel: string;
    shirtStyle: string;
    pantsStyle: string;
    setShirtQty: number;
    setPantsQty: number;
    setPrice: number;
    setTotal: number;
    separateShirtQty: number;
    separateShirtPrice: number;
    separateShirtTotal: number;
    separatePantsQty: number;
    separatePantsPrice: number;
    separatePantsTotal: number;
    rowTotal: number;
};

/**
 * Rebuilds the order form's size table from the saved line items.
 *
 * order_items records the garment on each line, so a set line and the
 * separate shirt/pants lines can be told apart and put back in their own
 * columns. 'garment' is the value used before that split existed and is read
 * as a set, which is what Form 1 wrote it for.
 */
function buildPrintSizeRows(
    items: Array<{
        item_type?: string;
        size_group?: string;
        size_label?: string;
        shirt_style?: string | null;
        pants_style?: string | null;
        quantity?: number;
        unit_price?: number;
        total_price?: number;
    }>,
    sizeGroup: 'kids' | 'adults',
): PrintSizeRow[] {
    const rows: PrintSizeRow[] = [];

    const styleOf = (value: unknown): string =>
        value === 'short' || value === 'long' ? value : '';

    // 'garment' is the value used before the split existed and is read as a set,
    // which is what Form 1 wrote it for.
    const kindOf = (type: string): 'set' | 'shirt' | 'pants' => {
        if (
            type === 'set' ||
            type === 'garment' ||
            type === 'combo' ||
            type === ''
        ) {
            return 'set';
        }

        return type.includes('pants') ? 'pants' : 'shirt';
    };

    const blankRow = (
        label: string,
        shirtStyle: string,
        pantsStyle: string,
    ): PrintSizeRow => {
        const row: PrintSizeRow = {
            sizeLabel: label,
            shirtStyle,
            pantsStyle,
            setShirtQty: 0,
            setPantsQty: 0,
            setPrice: 0,
            setTotal: 0,
            separateShirtQty: 0,
            separateShirtPrice: 0,
            separateShirtTotal: 0,
            separatePantsQty: 0,
            separatePantsPrice: 0,
            separatePantsTotal: 0,
            rowTotal: 0,
        };

        rows.push(row);

        return row;
    };

    const relevant = items
        .filter(
            (item) =>
                (String(item.size_group ?? 'adults') === 'kids'
                    ? 'kids'
                    : 'adults') === sizeGroup,
        )
        .map((item) => {
            const quantity = Number(item.quantity ?? 0);
            const unitPrice = Number(item.unit_price ?? 0);

            return {
                label: String(item.size_label ?? '').trim() || '-',
                kind: kindOf(String(item.item_type ?? '').toLowerCase()),
                shirtStyle: styleOf(item.shirt_style),
                pantsStyle: styleOf(item.pants_style),
                quantity,
                unitPrice,
                lineTotal: Number(item.total_price ?? quantity * unitPrice),
            };
        });

    // One printed row per size *and* garment style. The same size ordered as
    // both short and long sleeve was two rows on the order form, sold at two
    // prices, so collapsing them by size alone printed one of the prices and
    // silently dropped the other.
    relevant.forEach((item) => {
        if (item.kind !== 'set') {
            return;
        }

        const row =
            rows.find(
                (candidate) =>
                    candidate.sizeLabel === item.label &&
                    candidate.shirtStyle === item.shirtStyle &&
                    candidate.pantsStyle === item.pantsStyle,
            ) ?? blankRow(item.label, item.shirtStyle, item.pantsStyle);

        // A set is one shirt plus one pair of pants, so both columns carry the
        // bundle count.
        row.setShirtQty += item.quantity;
        row.setPantsQty += item.quantity;
        row.setPrice = item.unitPrice || row.setPrice;
        row.setTotal += item.lineTotal;
        row.rowTotal += item.lineTotal;
    });

    // Separate pieces join the row whose garment they match. They are the same
    // garment as the set on that form row, billed at their own price.
    relevant.forEach((item) => {
        if (item.kind === 'set') {
            return;
        }

        const isShirt = item.kind === 'shirt';
        const style = isShirt ? item.shirtStyle : item.pantsStyle;

        const row =
            rows.find(
                (candidate) =>
                    candidate.sizeLabel === item.label &&
                    (isShirt ? candidate.shirtStyle : candidate.pantsStyle) ===
                        style,
            ) ??
            blankRow(item.label, isShirt ? style : '', isShirt ? '' : style);

        if (isShirt) {
            row.separateShirtQty += item.quantity;
            row.separateShirtPrice = item.unitPrice || row.separateShirtPrice;
            row.separateShirtTotal += item.lineTotal;
        } else {
            row.separatePantsQty += item.quantity;
            row.separatePantsPrice = item.unitPrice || row.separatePantsPrice;
            row.separatePantsTotal += item.lineTotal;
        }

        row.rowTotal += item.lineTotal;
    });

    const order = sizeGroup === 'kids' ? KID_SIZE_ORDER : ADULT_SIZE_ORDER;

    return rows.sort((left, right) => {
        const leftRank = order.indexOf(left.sizeLabel.toUpperCase());
        const rightRank = order.indexOf(right.sizeLabel.toUpperCase());

        if (leftRank !== rightRank) {
            return (
                (leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank) -
                (rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank)
            );
        }

        return left.sizeLabel.localeCompare(right.sizeLabel, 'th');
    });
}

/**
 * Spec values read as a list of named settings, so they belong in a two-column
 * table rather than a grid of cards: one row per setting, label beside value,
 * lined up so the eye can run straight down either column.
 *
 * `split` fills the width when this is the only spec section on the sheet. A
 * lone table stretched across the dialog leaves a wide empty half and very long
 * label-to-value runs, so its rows are dealt into two tables side by side
 * instead, which stack again on a narrow screen.
 */
function SpecTable({
    title,
    rows,
    accent,
    split = false,
}: {
    title: string;
    rows: Array<{ label: string; value: string }>;
    accent: 'blue' | 'red';
    split?: boolean;
}) {
    const isBlue = accent === 'blue';
    const half = Math.ceil(rows.length / 2);
    const useTwoColumns = split && rows.length > 3;

    // An odd number of settings leaves the right column one row short, which
    // knocks every row out of line with its neighbour and breaks the striping.
    // A blank filler row keeps both columns the same height.
    const columns = useTwoColumns
        ? [
              rows.slice(0, half),
              [
                  ...rows.slice(half),
                  ...Array.from({ length: half * 2 - rows.length }, () => null),
              ],
          ]
        : [rows];

    return (
        <section
            className={`flex h-full flex-col overflow-hidden rounded-lg border ${
                isBlue ? 'border-[#174395]/30' : 'border-[#E21E26]/30'
            }`}
        >
            <div
                className={`px-3 py-1.5 text-xs font-bold text-white ${isBlue ? 'bg-[#174395]' : 'bg-[#E21E26]'}`}
            >
                {title}
            </div>

            {rows.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-slate-500">
                    ยังไม่มีข้อมูลสเปกที่บันทึก
                </p>
            ) : (
                <div
                    className={`flex-1 ${columns.length > 1 ? 'grid md:grid-cols-2' : ''}`}
                >
                    {columns.map((columnRows, columnIndex) => (
                        <table
                            key={columnIndex}
                            className={`w-full text-left text-xs ${
                                columnIndex > 0
                                    ? 'border-t border-slate-200 md:border-t-0 md:border-l'
                                    : ''
                            }`}
                        >
                            <tbody>
                                {columnRows.map((row, rowIndex) =>
                                    row === null ? (
                                        <tr
                                            key={`filler-${rowIndex}`}
                                            aria-hidden="true"
                                            className="border-t border-slate-200 odd:bg-white even:bg-slate-50/70"
                                        >
                                            <th
                                                scope="row"
                                                className="w-2/5 px-3 py-1.5"
                                            >
                                                &nbsp;
                                            </th>
                                            <td className="px-3 py-1.5" />
                                        </tr>
                                    ) : (
                                        <tr
                                            key={row.label}
                                            className="border-t border-slate-200 odd:bg-white even:bg-slate-50/70"
                                        >
                                            <th
                                                scope="row"
                                                className="w-2/5 px-3 py-1.5 align-top font-semibold text-slate-500"
                                            >
                                                {row.label}
                                            </th>
                                            <td className="px-3 py-1.5 align-top font-semibold break-words text-slate-900">
                                                {row.value || '-'}
                                            </td>
                                        </tr>
                                    ),
                                )}
                            </tbody>
                        </table>
                    ))}
                </div>
            )}
        </section>
    );
}

function stationLabel(station: string): string {
    const labels: Record<string, string> = {
        design: 'ออกแบบ',
        print: 'ห้องพิมพ์',
        embroidery: 'ห้องปัก',
        screen: 'ห้องอัด',
        flex: 'ห้องสกรีน เฟล็กซ์',
        cutting: 'ห้องตัด',
        sewing: 'ห้องเย็บ',
        qc: 'ตรวจสอบ',
        shipping: 'จัดส่ง',
    };

    return labels[station] ?? station;
}

function routingStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        pending: 'งานเข้า',
        in_progress: 'กำลังทำ',
        rejected: 'แก้ไข',
        completed: 'เสร็จสิ้น',
        skipped: 'ข้าม',
    };

    return labels[status] ?? status;
}

export function canEditOrderStatus(
    row:
        | { orderStatus?: string | null; hasProductionProgress?: boolean }
        | null
        | undefined,
): boolean {
    if (!row) {
        return false;
    }

    const normalizedOrderStatus = row.orderStatus?.trim().toLowerCase();

    return normalizedOrderStatus === 'confirmed' && !row.hasProductionProgress;
}

function buildPageList(
    current: number,
    total: number,
): Array<number | 'ellipsis'> {
    if (total <= 7) {
        return Array.from({ length: total }, (_, index) => index + 1);
    }

    const pages: Array<number | 'ellipsis'> = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    if (start > 2) {
        pages.push('ellipsis');
    }

    for (let page = start; page <= end; page += 1) {
        pages.push(page);
    }

    if (end < total - 1) {
        pages.push('ellipsis');
    }

    pages.push(total);

    return pages;
}

/**
 * The counter row "Action" menu: edit, duplicate ("เปิดบิลอีกครั้ง") and delete.
 *
 * Edit and delete are gated separately — editing stops once production starts,
 * while deleting is admin-only on top of that. Duplicating is always allowed:
 * re-ordering a finished job is exactly when it is most useful.
 */
function OrderActionMenu({
    row,
    canEdit,
    canDelete,
    editTitle,
    onDuplicate,
    onDelete,
    triggerClassName,
    iconClassName,
}: {
    row: OrderTableRow;
    canEdit: boolean;
    canDelete: boolean;
    editTitle: string;
    onDuplicate: (row: OrderTableRow) => void;
    onDelete: (row: OrderTableRow) => void;
    triggerClassName: string;
    iconClassName: string;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Action"
                    aria-label={`Action ออเดอร์ ${row.order_code}`}
                    className={triggerClassName}
                >
                    <MoreHorizontal className={iconClassName} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                    disabled={!canEdit}
                    title={editTitle}
                    onSelect={() => {
                        if (canEdit) {
                            router.visit(`/orders/${row.id}/edit`);
                        }
                    }}
                >
                    <Pencil className="size-4" />
                    แก้ไข
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onDuplicate(row)}>
                    <Copy className="size-4" />
                    เปิดบิลอีกครั้ง
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    disabled={!canDelete}
                    title={
                        canDelete
                            ? 'ลบออเดอร์'
                            : 'ลบได้เฉพาะผู้ดูแลระบบ และเฉพาะงานที่ยังไม่เข้าไลน์ผลิต'
                    }
                    className="!text-[#E21E26] focus:!text-[#C91820] [&_svg]:!text-[#E21E26] focus:[&_svg]:!text-[#C91820]"
                    onSelect={() => {
                        if (canDelete) {
                            onDelete(row);
                        }
                    }}
                >
                    <Trash2 className="size-4 !text-[#E21E26]" />
                    ลบ
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function OrdersTable({
    rows,
    pagination,
    onPageChange,
    onOpenDetail,
    onOpenTimeline,
    onOpenPdf,
    isAdmin,
    onDuplicate,
    onDelete,
}: {
    rows: OrderTableRow[];
    pagination?: CounterPagination;
    onPageChange: (page: number) => void;
    onOpenDetail: (row: OrderTableRow) => void;
    onOpenTimeline: (row: OrderTableRow) => void;
    onOpenPdf: (row: OrderTableRow) => void;
    isAdmin: boolean;
    onDuplicate: (row: OrderTableRow) => void;
    onDelete: (row: OrderTableRow) => void;
}) {
    const scrollRef = useRef<HTMLDivElement | null>(null);

    // `rows` is already the current page — the server slices it. Everything below
    // is just for rendering the footer and the page controls.
    const pageRows = rows;
    const currentPage = pagination?.current_page ?? 1;
    const totalPages = Math.max(1, pagination?.last_page ?? 1);
    const totalOrders = pagination?.total ?? rows.length;
    const rangeStart = pagination?.from ?? (rows.length === 0 ? 0 : 1);
    const rangeEnd = pagination?.to ?? rows.length;

    // Bring the newly loaded page into view.
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentPage]);

    const goToPage = (nextPage: number) => {
        const target = Math.min(Math.max(nextPage, 1), totalPages);

        if (target === currentPage) {
            return;
        }

        onPageChange(target);
    };

    const canEditRow = (row: OrderTableRow): boolean =>
        canEditOrderStatus({
            orderStatus: row.order_status,
            hasProductionProgress:
                row.details?.routings?.some(
                    (routing) =>
                        routing.is_required &&
                        ['in_progress', 'completed'].includes(routing.status),
                ) ?? false,
        });

    const editTitle = (canEdit: boolean): string =>
        canEdit ? 'แก้ไขออเดอร์' : 'แก้ไขได้เฉพาะออเดอร์สถานะยืนยันแล้ว';

    // Mirrors OrderPolicy::delete — admin only, and only before the order has
    // entered the production line. The server enforces this too; this only
    // keeps the menu honest.
    const canDeleteRow = (row: OrderTableRow): boolean =>
        isAdmin &&
        !(
            row.details?.routings?.some(
                (routing) =>
                    routing.is_required &&
                    ['in_progress', 'completed'].includes(routing.status),
            ) ?? false
        );

    return (
        <div className="rounded-b-xl border border-slate-200 bg-slate-100/60 md:bg-white">
            <div
                ref={scrollRef}
                className="max-h-[calc(100dvh-330px)] w-full overflow-x-auto overflow-y-auto overscroll-contain md:max-h-[calc(100vh-260px)]"
            >
                <div className="md:min-w-[1120px]">
                    <table className="sticky top-0 z-10 hidden w-full table-fixed border-b border-slate-200 bg-slate-50/95 text-left backdrop-blur-sm md:table">
                        <thead>
                            <tr className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                                <th className="w-[8%] px-3 py-3 whitespace-nowrap">
                                    วันที่เปิดบิล
                                </th>
                                <th className="w-[7%] px-3 py-3 whitespace-nowrap">
                                    วันที่ส่งงาน
                                </th>
                                <th className="w-[10%] px-3 py-3 whitespace-nowrap">
                                    เลขที่ออเดอร์
                                </th>
                                <th className="w-[6%] px-3 py-3">สาขา</th>
                                <th className="w-[13%] px-3 py-3">
                                    ชื่อลูกค้า
                                </th>
                                <th className="w-[10%] px-3 py-3">ประเภทงาน</th>
                                <th className="w-[6%] px-3 py-3 text-right whitespace-nowrap">
                                    จำนวนตัว
                                </th>
                                <th className="w-[9%] px-3 py-3 whitespace-nowrap">
                                    สถานะงาน
                                </th>
                                <th className="w-[7%] px-3 py-3 whitespace-nowrap">
                                    ใบจัดส่ง
                                </th>
                                <th className="w-[8%] px-3 py-3">ผู้รับงาน</th>
                                <th className="w-[8%] px-3 py-3 text-center">
                                    ไทม์ไลน์
                                </th>
                                <th className="w-[4%] px-3 py-3 text-center">
                                    Action
                                </th>
                            </tr>
                        </thead>
                    </table>

                    {rows.length === 0 ? (
                        <div className="flex h-[360px] flex-col items-center justify-center gap-2 px-6 text-center md:h-[420px]">
                            <div className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                <Search className="size-5" />
                            </div>
                            <p className="text-sm font-semibold text-slate-600">
                                ไม่พบข้อมูลออเดอร์
                            </p>
                            <p className="max-w-xs text-xs text-slate-400">
                                ลองปรับช่วงวันที่ สาขา หรือคำค้นหาใหม่อีกครั้ง
                            </p>
                        </div>
                    ) : (
                        <div className="p-2 md:p-0">
                            {pageRows.map((row, rowIndex) => {
                                const canEdit = canEditRow(row);

                                return (
                                    <div
                                        key={row.id}
                                        className="mb-2 last:mb-0 md:mb-0"
                                    >
                                        {/* ---------- Mobile: one card per order ---------- */}
                                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:hidden">
                                            <div className="flex items-start justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onOpenDetail(row)
                                                    }
                                                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                                                    title="ดูรายละเอียดออเดอร์"
                                                >
                                                    <span className="text-sm font-bold text-[#E21E26] underline-offset-2">
                                                        {row.order_code}
                                                    </span>
                                                    <span className="mt-0.5 w-full truncate text-sm font-semibold text-slate-900">
                                                        {row.details
                                                            ?.job_name || '-'}
                                                    </span>
                                                    <span className="w-full truncate text-xs text-slate-500">
                                                        {row.customer_name}
                                                    </span>
                                                </button>
                                                <div className="flex shrink-0 flex-col items-end gap-1">
                                                    <Badge
                                                        variant="outline"
                                                        className={`${statusClass(row)} px-1.5 py-0.5 text-[10px]`}
                                                    >
                                                        {statusLabel(row)}
                                                    </Badge>
                                                    {/* Payment standing stays on the desk view; the phone
                                                        card is for finding and moving the job. */}
                                                    <Badge
                                                        variant="outline"
                                                        className={`${paymentClass(row.payment_status)} hidden px-1.5 py-0.5 text-[10px] sm:inline-flex`}
                                                    >
                                                        {paymentLabel(
                                                            row.payment_status,
                                                        )}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px]">
                                                <div className="min-w-0">
                                                    <dt className="text-slate-400">
                                                        วันที่เปิดบิล
                                                    </dt>
                                                    <dd className="mt-0.5 flex flex-wrap items-center gap-x-1 font-semibold text-slate-700">
                                                        <span>
                                                            {formatTableDate(
                                                                row.billing_date,
                                                            )}
                                                        </span>
                                                        {row.billing_time ? (
                                                            <span className="font-normal text-slate-400">
                                                                {
                                                                    row.billing_time
                                                                }{' '}
                                                                น.
                                                            </span>
                                                        ) : null}
                                                    </dd>
                                                </div>
                                                <div className="min-w-0">
                                                    <dt className="text-slate-400">
                                                        วันที่ส่งงาน
                                                    </dt>
                                                    <dd className="mt-0.5 font-semibold text-[#E21E26]">
                                                        {formatTableDate(
                                                            row.due_date,
                                                        )}
                                                    </dd>
                                                </div>
                                                <div className="min-w-0">
                                                    <dt className="text-slate-400">
                                                        ประเภทงาน
                                                    </dt>
                                                    <dd className="mt-0.5 font-medium break-words text-slate-700">
                                                        {row.job_type || '-'}
                                                    </dd>
                                                </div>
                                                <div className="min-w-0">
                                                    <dt className="text-slate-400">
                                                        จำนวน
                                                    </dt>
                                                    <dd className="mt-0.5 font-medium text-slate-700">
                                                        <span className="font-mono">
                                                            {row.order_item_count ??
                                                                0}
                                                        </span>{' '}
                                                        ตัว
                                                    </dd>
                                                </div>
                                                <div className="min-w-0">
                                                    <dt className="text-slate-400">
                                                        สาขา
                                                    </dt>
                                                    <dd className="mt-0.5 truncate font-medium text-slate-700">
                                                        {row.branch_name || '-'}
                                                    </dd>
                                                </div>
                                                <div className="min-w-0">
                                                    <dt className="text-slate-400">
                                                        ผู้รับงาน
                                                    </dt>
                                                    <dd className="mt-0.5 truncate font-medium text-slate-700">
                                                        {row.receiver_name ||
                                                            '-'}
                                                    </dd>
                                                </div>
                                            </dl>

                                            <div className="mt-2.5 flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 flex-1 border-red-200 bg-red-50 text-[11px] font-semibold text-red-700 hover:border-red-300 hover:bg-red-100 hover:text-red-800"
                                                    onClick={() =>
                                                        onOpenPdf(row)
                                                    }
                                                >
                                                    <Printer className="mr-1 size-3.5" />
                                                    เปิด PDF
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-9 flex-1 bg-[#174395] text-[11px] font-semibold text-white hover:bg-[#12367A]"
                                                    onClick={() =>
                                                        onOpenTimeline(row)
                                                    }
                                                >
                                                    ไทม์ไลน์
                                                </Button>
                                                <OrderActionMenu
                                                    row={row}
                                                    canEdit={canEdit}
                                                    canDelete={canDeleteRow(
                                                        row,
                                                    )}
                                                    editTitle={editTitle(
                                                        canEdit,
                                                    )}
                                                    onDuplicate={onDuplicate}
                                                    onDelete={onDelete}
                                                    triggerClassName="size-9 shrink-0 border border-slate-200 text-slate-600 hover:text-[#E21E26]"
                                                    iconClassName="size-4"
                                                />
                                            </div>
                                        </div>

                                        {/* ---------- Desktop: table row ---------- */}
                                        <table
                                            className={`hidden w-full table-fixed border-b border-slate-100 text-left transition-colors duration-150 hover:bg-sky-50/60 md:table ${
                                                rowIndex % 2 === 1
                                                    ? 'bg-slate-50/40'
                                                    : 'bg-white'
                                            }`}
                                        >
                                            <tbody>
                                                <tr className="h-14 text-xs text-slate-700">
                                                    <td className="w-[8%] px-3 py-2 align-middle whitespace-nowrap">
                                                        <div className="flex flex-col gap-0.5 leading-tight">
                                                            <span className="font-semibold text-slate-700">
                                                                {formatTableDate(
                                                                    row.billing_date,
                                                                )}
                                                            </span>
                                                            {row.billing_time ? (
                                                                <span className="inline-flex w-fit items-center gap-1 text-[10px] font-medium text-slate-400">
                                                                    <Clock className="size-2.5" />
                                                                    {
                                                                        row.billing_time
                                                                    }{' '}
                                                                    น.
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                    <td className="w-[7%] px-3 py-2 align-middle text-xs font-semibold whitespace-nowrap text-[#E21E26]">
                                                        {formatTableDate(
                                                            row.due_date,
                                                        )}
                                                    </td>
                                                    <td className="w-[10%] px-3 py-2 align-middle whitespace-nowrap">
                                                        <button
                                                            type="button"
                                                            className="text-xs font-bold text-[#174395] underline-offset-2 transition-colors hover:text-[#E21E26] hover:underline"
                                                            onClick={() =>
                                                                onOpenDetail(
                                                                    row,
                                                                )
                                                            }
                                                            title="ดูรายละเอียดออเดอร์"
                                                        >
                                                            {row.order_code}
                                                        </button>
                                                    </td>
                                                    <td className="w-[6%] px-3 py-2 align-middle text-xs text-slate-500">
                                                        <span className="block truncate">
                                                            {row.branch_name}
                                                        </span>
                                                    </td>
                                                    <td
                                                        className="w-[13%] px-3 py-2 align-middle text-xs"
                                                        title={`${row.details?.job_name || '-'} — ${row.customer_name}`}
                                                    >
                                                        <span className="block truncate font-semibold text-slate-900">
                                                            {row.details
                                                                ?.job_name ||
                                                                '-'}
                                                        </span>
                                                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                                                            {row.customer_name}
                                                        </span>
                                                    </td>
                                                    <td
                                                        className="w-[10%] px-3 py-2 align-middle text-xs text-slate-600"
                                                        title={row.job_type}
                                                    >
                                                        <span className="block leading-tight break-words whitespace-normal">
                                                            {row.job_type}
                                                        </span>
                                                    </td>
                                                    <td className="w-[6%] px-3 py-2 text-right align-middle whitespace-nowrap">
                                                        <span className="font-mono text-sm font-semibold text-slate-900">
                                                            {row.order_item_count ??
                                                                0}
                                                        </span>
                                                        <span className="ml-0.5 text-[10px] text-slate-400">
                                                            ตัว
                                                        </span>
                                                    </td>
                                                    <td className="w-[9%] px-3 py-2 align-middle whitespace-nowrap">
                                                        <Badge
                                                            variant="outline"
                                                            className={`${statusClass(row)} px-1.5 py-0.5 text-[11px]`}
                                                        >
                                                            {statusLabel(row)}
                                                        </Badge>
                                                    </td>
                                                    <td className="w-[7%] px-3 py-2 align-middle whitespace-nowrap">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 border-red-200 bg-red-50 px-2 text-[11px] font-semibold text-red-700 transition-colors duration-150 ease-out hover:border-red-300 hover:bg-red-100 hover:text-red-800"
                                                            onClick={() =>
                                                                onOpenPdf(row)
                                                            }
                                                        >
                                                            เปิด PDF
                                                        </Button>
                                                    </td>
                                                    <td className="w-[8%] px-3 py-2 align-middle text-xs text-slate-500">
                                                        <span className="block truncate">
                                                            {row.receiver_name}
                                                        </span>
                                                    </td>
                                                    <td className="w-[8%] px-3 py-2 text-center align-middle">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 border-[#174395] bg-[#174395] px-2 text-[11px] text-white transition-colors duration-150 ease-out hover:border-[#12367A] hover:bg-[#12367A] hover:text-white"
                                                            onClick={() =>
                                                                onOpenTimeline(
                                                                    row,
                                                                )
                                                            }
                                                        >
                                                            ไทม์ไลน์
                                                        </Button>
                                                    </td>
                                                    <td className="w-[4%] px-3 py-2 text-center align-middle">
                                                        <OrderActionMenu
                                                            row={row}
                                                            canEdit={canEdit}
                                                            canDelete={canDeleteRow(
                                                                row,
                                                            )}
                                                            editTitle={editTitle(
                                                                canEdit,
                                                            )}
                                                            onDuplicate={
                                                                onDuplicate
                                                            }
                                                            onDelete={onDelete}
                                                            triggerClassName="size-7 text-slate-500 hover:text-[#E21E26]"
                                                            iconClassName="size-3.5"
                                                        />
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {totalOrders > 0 ? (
                <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-center text-[11px] text-slate-500 sm:text-left">
                        แสดง{' '}
                        <span className="font-semibold text-slate-700">
                            {rangeStart}-{rangeEnd}
                        </span>{' '}
                        จากทั้งหมด{' '}
                        <span className="font-semibold text-slate-700">
                            {totalOrders}
                        </span>{' '}
                        ออเดอร์
                    </p>

                    <div className="flex items-center justify-center gap-1">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-[11px] font-semibold"
                            disabled={currentPage === 1}
                            onClick={() => goToPage(currentPage - 1)}
                            title="หน้าก่อนหน้า"
                        >
                            <ChevronLeft className="size-3.5" />
                            <span className="hidden sm:inline">ก่อนหน้า</span>
                        </Button>

                        {/* Compact page indicator on phones, full page list from sm up */}
                        <span className="px-2 text-[11px] font-semibold text-slate-600 sm:hidden">
                            หน้า {currentPage} / {totalPages}
                        </span>

                        <div className="hidden items-center gap-1 sm:flex">
                            {buildPageList(currentPage, totalPages).map(
                                (item, index) =>
                                    item === 'ellipsis' ? (
                                        <span
                                            key={`ellipsis-${index}`}
                                            className="px-1 text-[11px] text-slate-400"
                                        >
                                            …
                                        </span>
                                    ) : (
                                        <Button
                                            key={item}
                                            type="button"
                                            variant={
                                                item === currentPage
                                                    ? 'default'
                                                    : 'outline'
                                            }
                                            size="sm"
                                            className={`h-8 min-w-8 px-2 text-[11px] font-semibold ${
                                                item === currentPage
                                                    ? 'bg-[#174395] text-white hover:bg-[#12367A]'
                                                    : 'text-slate-600'
                                            }`}
                                            onClick={() => goToPage(item)}
                                        >
                                            {item}
                                        </Button>
                                    ),
                            )}
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-[11px] font-semibold"
                            disabled={currentPage === totalPages}
                            onClick={() => goToPage(currentPage + 1)}
                            title="หน้าถัดไป"
                        >
                            <span className="hidden sm:inline">ถัดไป</span>
                            <ChevronRight className="size-3.5" />
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/**
 * The roster carries the shop logo and a barcode. Printing the moment the
 * markup is written caught them mid-download, so the first print of the day
 * came out with an empty masthead and only a reprint -- once the browser had
 * them cached -- looked right. Wait for them, and never wait forever.
 */
function buildRosterPrintScript(): string {
    return `
    (function () {
        var images = Array.prototype.slice.call(document.images);
        var pending = images.length;
        var printed = false;

        function go() {
            if (printed) { return; }
            printed = true;
            window.focus();
            window.print();
        }

        if (pending === 0) { go(); return; }

        var finish = function () { pending -= 1; if (pending <= 0) { go(); } };

        images.forEach(function (image) {
            if (image.complete) { finish(); return; }
            image.addEventListener('load', finish, { once: true });
            image.addEventListener('error', finish, { once: true });
        });

        // A stalled image must not hold the sheet hostage.
        setTimeout(go, 3000);
    })();
`;
}

export default function Counter({
    pendingInvitations = [],
    branches,
    floorStats,
    filters,
    orders,
    pagination,
    deliveryCalendar,
    deliveryDueToday = 0,
    savedOrderCode = null,
}: CounterProps) {
    const { currentTeam, auth } = usePage<{
        currentTeam?: { slug: string } | null;
        auth?: { user?: { role?: string | null } | null } | null;
    }>().props;
    const isAdmin = auth?.user?.role === 'admin';

    // Delete is confirmed in a modal: it is the only destructive action on this
    // page, and the row it came from has to survive the confirm step.
    const [pendingDelete, setPendingDelete] = useState<OrderTableRow | null>(
        null,
    );
    const [deleting, setDeleting] = useState(false);

    const handleDuplicateOrder = (row: OrderTableRow) => {
        router.visit(`/orders/${row.id}/duplicate`);
    };

    const handleConfirmDelete = () => {
        if (!pendingDelete) {
            return;
        }

        setDeleting(true);
        router.delete(`/orders/${pendingDelete.id}`, {
            preserveScroll: true,
            onFinish: () => {
                setDeleting(false);
                setPendingDelete(null);
            },
        });
    };
    const [showInvitations, setShowInvitations] = useState(
        pendingInvitations.length > 0,
    );
    const [branchId, setBranchId] = useState(
        formatInput(filters.branch_id) || 'all',
    );
    const [billingDateFrom, setBillingDateFrom] = useState(
        formatInput(filters.billing_date_from),
    );
    const [billingDateTo, setBillingDateTo] = useState(
        formatInput(filters.billing_date_to),
    );
    const [shippingDateFrom, setShippingDateFrom] = useState(
        formatInput(filters.shipping_date_from),
    );
    const [shippingDateTo, setShippingDateTo] = useState(
        formatInput(filters.shipping_date_to),
    );
    const [search, setSearch] = useState(formatInput(filters.search));
    const [showDeliveryCalendar, setShowDeliveryCalendar] = useState(false);
    // Offered once, right after a save redirects here. Dismissing it must not
    // bring it back on the next re-render.
    const [printOfferDismissed, setPrintOfferDismissed] = useState(false);
    const [isBillingRangeOpen, setIsBillingRangeOpen] = useState(false);
    const [isShippingRangeOpen, setIsShippingRangeOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<OrderTableRow | null>(
        null,
    );
    const [timelineOrder, setTimelineOrder] = useState<OrderTableRow | null>(
        null,
    );
    const printRef = useRef<HTMLDivElement | null>(null);
    const billingRangeRef = useRef<HTMLDivElement | null>(null);
    const shippingRangeRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setBranchId(formatInput(filters.branch_id) || 'all');
        setBillingDateFrom(formatInput(filters.billing_date_from));
        setBillingDateTo(formatInput(filters.billing_date_to));
        setShippingDateFrom(formatInput(filters.shipping_date_from));
        setShippingDateTo(formatInput(filters.shipping_date_to));
        setSearch(formatInput(filters.search));
    }, [
        filters.branch_id,
        filters.billing_date_from,
        filters.billing_date_to,
        filters.shipping_date_from,
        filters.shipping_date_to,
        filters.search,
    ]);

    const handleResetFilters = () => {
        setBranchId('all');
        setBillingDateFrom('');
        setBillingDateTo('');
        setShippingDateFrom('');
        setShippingDateTo('');
        setSearch('');
        setIsBillingRangeOpen(false);
        setIsShippingRangeOpen(false);
    };

    const branchOptions = useMemo(
        () => [{ value: 'all', label: 'ทุกสาขา' }, ...branches],
        [branches],
    );

    // Computed on the server across every order matching the current filters —
    // NOT just the page being shown (see DashboardController::buildCounterFloorStats).
    const derivedFloorStats = floorStats;

    const departmentCards = useMemo(
        () => [
            {
                title: 'ห้องตัด',
                subtitle: 'งานเข้าใหม่ / งานที่เสร็จสิ้น',
                icon: <Factory className="size-5" />,
                accent: 'red' as const,
                rows: [
                    {
                        label: 'งานเข้าใหม่',
                        value: derivedFloorStats.cutting.new_job,
                        quantity: derivedFloorStats.cutting.new_job_qty,
                        tone: 'red' as const,
                    },
                    {
                        label: 'งานที่เสร็จสิ้น',
                        value: derivedFloorStats.cutting.completed,
                        quantity: derivedFloorStats.cutting.completed_qty,
                        tone: 'blue' as const,
                    },
                ],
            },
            {
                title: 'ห้องพิมพ์',
                subtitle: 'งานเข้าใหม่ / งานที่เสร็จสิ้น',
                icon: <Printer className="size-5" />,
                accent: 'blue' as const,
                rows: [
                    {
                        label: 'งานเข้าใหม่',
                        value: derivedFloorStats.print_room.new_job,
                        quantity: derivedFloorStats.print_room.new_job_qty,
                        tone: 'red' as const,
                    },
                    {
                        label: 'งานที่เสร็จสิ้น',
                        value: derivedFloorStats.print_room.completed,
                        quantity: derivedFloorStats.print_room.completed_qty,
                        tone: 'blue' as const,
                    },
                ],
            },
            {
                title: 'ห้องอัด',
                subtitle: 'งานเข้าใหม่ / งานที่เสร็จสิ้น',
                icon: <CheckCircle2 className="size-5" />,
                accent: 'red' as const,
                rows: [
                    {
                        label: 'งานเข้าใหม่',
                        value: derivedFloorStats.heat_press.new_job,
                        quantity: derivedFloorStats.heat_press.new_job_qty,
                        tone: 'red' as const,
                    },
                    {
                        label: 'งานที่เสร็จสิ้น',
                        value: derivedFloorStats.heat_press.completed,
                        quantity: derivedFloorStats.heat_press.completed_qty,
                        tone: 'blue' as const,
                    },
                ],
            },
            {
                title: 'ห้องปัก',
                subtitle: 'งานเข้าใหม่ / งานที่เสร็จสิ้น',
                icon: <CheckCircle2 className="size-5" />,
                accent: 'blue' as const,
                rows: [
                    {
                        label: 'งานเข้าใหม่',
                        value: derivedFloorStats.embroidery.new_job,
                        quantity: derivedFloorStats.embroidery.new_job_qty,
                        tone: 'red' as const,
                    },
                    {
                        label: 'งานที่เสร็จสิ้น',
                        value: derivedFloorStats.embroidery.completed,
                        quantity: derivedFloorStats.embroidery.completed_qty,
                        tone: 'blue' as const,
                    },
                ],
            },
            {
                title: 'ห้องเย็บ',
                subtitle: 'งานเข้าใหม่ / งานที่เสร็จสิ้น',
                icon: <CheckCircle2 className="size-5" />,
                accent: 'red' as const,
                rows: [
                    {
                        label: 'งานเข้าใหม่',
                        value: derivedFloorStats.sewing.new_job,
                        quantity: derivedFloorStats.sewing.new_job_qty,
                        tone: 'red' as const,
                    },
                    {
                        label: 'งานที่เสร็จสิ้น',
                        value: derivedFloorStats.sewing.completed,
                        quantity: derivedFloorStats.sewing.completed_qty,
                        tone: 'blue' as const,
                    },
                ],
            },
            {
                title: 'ห้องสกรีน เฟล็ค',
                subtitle: 'งานเข้าใหม่ / งานที่เสร็จสิ้น',
                icon: <ScanFace className="size-5" />,
                accent: 'blue' as const,
                rows: [
                    {
                        label: 'งานเข้าใหม่',
                        value: derivedFloorStats.screen_flex.new_job,
                        quantity: derivedFloorStats.screen_flex.new_job_qty,
                        tone: 'red' as const,
                    },
                    {
                        label: 'งานที่เสร็จสิ้น',
                        value: derivedFloorStats.screen_flex.completed,
                        quantity: derivedFloorStats.screen_flex.completed_qty,
                        tone: 'blue' as const,
                    },
                ],
            },
            {
                title: 'ห้องตรวจ',
                subtitle: 'งานเข้าใหม่ / งานที่เสร็จสิ้น',
                icon: <CheckCircle2 className="size-5" />,
                accent: 'red' as const,
                rows: [
                    {
                        label: 'งานเข้าใหม่',
                        value: derivedFloorStats.qc.new_job,
                        quantity: derivedFloorStats.qc.new_job_qty,
                        tone: 'red' as const,
                    },
                    {
                        label: 'งานที่เสร็จสิ้น',
                        value: derivedFloorStats.qc.completed,
                        quantity: derivedFloorStats.qc.completed_qty,
                        tone: 'blue' as const,
                    },
                ],
            },
            {
                title: 'ห้องจัดส่ง',
                subtitle: 'งานเข้าใหม่ / งานที่เสร็จสิ้น',
                icon: <Package className="size-5" />,
                accent: 'blue' as const,
                rows: [
                    {
                        label: 'งานเข้าใหม่',
                        value: derivedFloorStats.shipping.pending_ship,
                        quantity: derivedFloorStats.shipping.pending_ship_qty,
                        tone: 'red' as const,
                    },
                    {
                        label: 'งานที่เสร็จสิ้น',
                        value:
                            derivedFloorStats.shipping.courier +
                            derivedFloorStats.shipping.onsite_delivery +
                            derivedFloorStats.shipping.store_pickup,
                        quantity: derivedFloorStats.shipping.completed_qty,
                        tone: 'blue' as const,
                    },
                ],
            },
        ],
        [derivedFloorStats],
    );

    const selectedBranchLabel =
        branchOptions.find((option) => option.value === branchId)?.label ??
        'ทุกสาขา';
    const billingRangeLabel =
        billingDateFrom && billingDateTo
            ? `วันที่เปิดบิล: ${formatShortDate(billingDateFrom)} - ${formatShortDate(billingDateTo)}`
            : 'วันที่เปิดบิล: ทั้งหมด';
    const shippingRangeLabel =
        shippingDateFrom && shippingDateTo
            ? `วันที่จัดส่ง: ${formatShortDate(shippingDateFrom)} - ${formatShortDate(shippingDateTo)}`
            : 'วันที่จัดส่ง: ทั้งหมด';
    const detailImages = useMemo(() => {
        if (!selectedOrder?.details) {
            return [] as string[];
        }

        const list = [
            selectedOrder.details.artwork_url,
            ...selectedOrder.details.shirt_artwork_urls,
            ...selectedOrder.details.pants_artwork_urls,
            ...selectedOrder.details.reference_designs,
        ].filter((url): url is string => Boolean(url));

        return Array.from(new Set(list));
    }, [selectedOrder]);
    const deliveryMethodValue = selectedOrder?.details?.delivery_method ?? null;
    const shippingAddressValue =
        selectedOrder?.details?.shipping_address ?? null;
    const personalizationRows =
        selectedOrder?.details?.personalization_rows ?? [];
    const isIndividualOrder = personalizationRows.length > 0;
    const specificationRows =
        selectedOrder?.details?.specification_display ?? [];
    const pantsLabels = useMemo(() => new Set(['แบบขา', 'ปลายขา']), []);
    const shirtSpecificationRows = useMemo(
        () =>
            selectedOrder?.details?.spec_sections?.shirt ??
            specificationRows.filter((row) => !pantsLabels.has(row.label)),
        [selectedOrder, specificationRows, pantsLabels],
    );
    const pantsSpecificationRows = useMemo(() => {
        return (
            selectedOrder?.details?.spec_sections?.pants ??
            specificationRows.filter((row) => pantsLabels.has(row.label))
        );
    }, [selectedOrder, specificationRows, pantsLabels]);

    /**
     * The order's line items rebuilt the way the order form recorded them:
     * grouped per size group, then per size and garment length, and split into
     * the set and the separately sold pieces. Raw order_items listed every line
     * on its own with no hint of which garment it was, so the same size could
     * appear three times at three prices with nothing tying them together.
     *
     * Built with the same function the printed sheet uses, so what is read on
     * screen and what is handed to the customer can never drift apart.
     */
    // A sports day bill is counted by colour house, so the size list is shown as
    // a house-per-column grid instead of the plain size rows a normal bill uses.
    const dialogSportsDayMatrices = useMemo(
        () =>
            buildSportsDayMatrices(
                selectedOrder?.details?.sports_day_groups ?? [],
            ),
        [selectedOrder],
    );

    const dialogSizeGroups = useMemo(() => {
        const items = selectedOrder?.details?.items ?? [];

        return (['kids', 'adults'] as const)
            .map((sizeGroup) => ({
                sizeGroup,
                title:
                    sizeGroup === 'kids'
                        ? 'ขนาดเด็ก · อนุบาล/ประถม'
                        : 'ขนาดผู้ใหญ่ · มัธยมต้น/มัธยมปลาย',
                rows: buildPrintSizeRows(items, sizeGroup),
            }))
            .filter((group) => group.rows.length > 0)
            .map((group) => ({
                ...group,
                // One display line per thing actually sold, so a line always has
                // a name, a quantity and a price that multiply out.
                lines: group.rows.flatMap((row) => {
                    // Sleeve and leg length get a column each, so a line only
                    // states the length for a garment it actually contains --
                    // a shirt-only line leaves the leg column empty rather than
                    // borrowing the length off the set it sits next to.
                    const shirtStyle =
                        SHIRT_STYLE_PRINT_LABELS[row.shirtStyle] ?? '';
                    const pantsStyle =
                        PANTS_STYLE_PRINT_LABELS[row.pantsStyle] ?? '';

                    const lines: Array<{
                        key: string;
                        sizeLabel: string;
                        item: string;
                        shirtStyle: string;
                        shirtStyleCode: string;
                        pantsStyle: string;
                        pantsStyleCode: string;
                        quantity: number;
                        unitPrice: number;
                        total: number;
                    }> = [];

                    if (row.setShirtQty > 0 || row.setPantsQty > 0) {
                        lines.push({
                            key: `${row.sizeLabel}-${row.shirtStyle}-${row.pantsStyle}-set`,
                            sizeLabel: row.sizeLabel,
                            item: 'ชุด (เสื้อ + กางเกง)',
                            shirtStyle,
                            shirtStyleCode: row.shirtStyle,
                            pantsStyle,
                            pantsStyleCode: row.pantsStyle,
                            quantity: Math.max(
                                row.setShirtQty,
                                row.setPantsQty,
                            ),
                            unitPrice: row.setPrice,
                            total: row.setTotal,
                        });
                    }

                    if (row.separateShirtQty > 0) {
                        lines.push({
                            key: `${row.sizeLabel}-${row.shirtStyle}-shirt`,
                            sizeLabel: row.sizeLabel,
                            item: 'เสื้อแยก',
                            shirtStyle,
                            shirtStyleCode: row.shirtStyle,
                            pantsStyle: '',
                            pantsStyleCode: '',
                            quantity: row.separateShirtQty,
                            unitPrice: row.separateShirtPrice,
                            total: row.separateShirtTotal,
                        });
                    }

                    if (row.separatePantsQty > 0) {
                        lines.push({
                            key: `${row.sizeLabel}-${row.pantsStyle}-pants`,
                            sizeLabel: row.sizeLabel,
                            item: 'กางเกงแยก',
                            shirtStyle: '',
                            shirtStyleCode: '',
                            pantsStyle,
                            pantsStyleCode: row.pantsStyle,
                            quantity: row.separatePantsQty,
                            unitPrice: row.separatePantsPrice,
                            total: row.separatePantsTotal,
                        });
                    }

                    return lines;
                }),
            }));
    }, [selectedOrder]);

    const timelineStatusClass = (status: string): string => {
        switch (status) {
            case 'completed':
                return 'border-emerald-200 bg-emerald-50 text-emerald-700';
            case 'in_progress':
                return 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]';
            case 'rejected':
                return 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]';
            case 'skipped':
                return 'border-slate-200 bg-slate-100 text-slate-500';
            default:
                return 'border-slate-200 bg-slate-100 text-slate-500';
        }
    };

    const timelineDetailLabel = (
        routing: NonNullable<OrderTableRow['details']>['routings'][number],
    ): string | null => {
        if (routing.station_name === 'print' && routing.print_machine) {
            return routing.print_machine.replace('printer_', 'เครื่องพิมพ์ ');
        }

        if (routing.station_name === 'cutting') {
            return routing.cutting_team_name ?? null;
        }

        if (routing.station_name === 'sewing') {
            return routing.sewing_team_name ?? null;
        }

        if (routing.station_name === 'embroidery') {
            return routing.embroidery_team_name ?? null;
        }

        if (
            routing.station_name === 'screen' ||
            routing.station_name === 'flex'
        ) {
            return (
                routing.heat_press_machine_name ??
                routing.screen_team_name ??
                routing.assigned_user ??
                null
            );
        }

        return routing.assigned_user ?? null;
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;

            if (
                billingRangeRef.current &&
                !billingRangeRef.current.contains(target)
            ) {
                setIsBillingRangeOpen(false);
            }

            if (
                shippingRangeRef.current &&
                !shippingRangeRef.current.contains(target)
            ) {
                setIsShippingRangeOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const counterUrl = currentTeam
        ? `/${currentTeam.slug}/counter`
        : '/counter';

    const filterQuery = useMemo(
        () => ({
            branch_id: branchId === 'all' ? undefined : branchId,
            billing_date_from: billingDateFrom || undefined,
            billing_date_to: billingDateTo || undefined,
            shipping_date_from: shippingDateFrom || undefined,
            shipping_date_to: shippingDateTo || undefined,
            search: search || undefined,
        }),
        [
            branchId,
            billingDateFrom,
            billingDateTo,
            shippingDateFrom,
            shippingDateTo,
            search,
        ],
    );

    // Changing a filter changes the result set, so the page resets to 1 (no `page`
    // param) and the floor cards have to be recomputed server-side as well.
    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            router.get(counterUrl, filterQuery, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                only: ['orders', 'pagination', 'floorStats', 'filters'],
            });
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [counterUrl, filterQuery]);

    // Paging keeps the same filters, so only the table payload has to come back —
    // the floor cards summarise every matching order and do not change per page.
    const handlePageChange = (page: number) => {
        router.get(
            counterUrl,
            { ...filterQuery, page: page > 1 ? page : undefined },
            {
                preserveState: true,
                preserveScroll: true,
                only: ['orders', 'pagination'],
            },
        );
    };

    const handlePrintDeliveryNote = (row: OrderTableRow) => {
        const order = row.details;

        if (!order) {
            return;
        }

        const deliveryInfo = order.shipping_delivery_info;
        const deliveryDetails =
            order.delivery_method === 'onsite'
                ? [
                      deliveryInfo?.onsite_sender_name,
                      deliveryInfo?.onsite_vehicle_plate,
                  ]
                      .filter(Boolean)
                      .join(' / ')
                : [deliveryInfo?.carrier_name, deliveryInfo?.tracking_no]
                      .filter(Boolean)
                      .join(' / ');
        const printWindow = window.open('', '_blank', 'width=900,height=1100');

        if (!printWindow) {
            return;
        }

        printWindow.document
            .write(`<!doctype html><html><head><meta charset="utf-8"><title>ใบส่งมอบสินค้า ${escapeHtml(row.order_code)}</title><style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            html, body { width: 210mm; height: 297mm; margin: 0; }
            body { color: #172554; font-family: 'TH Sarabun New', 'Noto Sans Thai', Arial, sans-serif; font-size: 15px; }
            .note { height: 281mm; overflow: hidden; border: 0.55mm solid #486581; border-radius: 3mm; padding: 3.5mm; }
            .header { display: grid; grid-template-columns: 1fr 62mm; gap: 4mm; }
            .top { display: grid; grid-template-columns: minmax(0, 1fr) 76mm; gap: 4mm; }
            .logo { width: 38mm; }.tax, .original { margin: 1mm 0; color: #a04848; font-weight: 700; }
            .title { border: 0.55mm solid #486581; border-radius: 2.5mm; padding: 2mm; text-align: center; font-size: 24px; font-weight: 700; }
            .original { text-align: center; }.top { margin-top: 2mm; }
            .box { min-height: 34mm; border: 0.55mm solid #486581; border-radius: 4.5mm; padding: 3mm 4mm; }
            .line { margin: 0 0 1.5mm; font-size: 16px; }.meta { display: grid; grid-template-columns: 32mm minmax(0, 1fr); gap: 1mm 2mm; margin: 0; font-size: 14px; }.meta dt, .meta dd { margin: 0; }.meta dt { white-space: nowrap; }.meta dd { min-width: 0; overflow-wrap: anywhere; text-align: right; font-weight: 700; }
            table { width: 100%; margin-top: 2.5mm; border: 0.55mm solid #486581; border-collapse: separate; border-spacing: 0; border-radius: 3.5mm; overflow: hidden; }
            th, td { border-right: 0.3mm solid #486581; border-bottom: 0.3mm solid #486581; padding: 2mm 2.5mm; vertical-align: top; } th:last-child, td:last-child { border-right: 0; } tbody tr:last-child td { border-bottom: 0; } th { background: #f8fafc; text-align: center; font-weight: 700; }
            .center { text-align: center; white-space: nowrap; }.item td { height: 96mm; }.summary { text-align: right; font-weight: 700; }.received { padding: 3mm; text-align: center; font-weight: 700; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 3mm; }.signature { min-height: 34mm; border: 0.55mm solid #486581; border-radius: 3.5mm; padding: 3mm; }.sign-line { margin: 16mm 4mm 0; border-bottom: 0.3mm dotted #172554; }.sign-date { margin-top: 2mm; text-align: center; }
        </style></head><body><main class="note">
            <header class="header"><div><img class="logo" src="/images/logo/logo.png" alt="J.S. Sport"><p class="tax">ไม่ใช่ใบกำกับภาษี</p></div><div><div class="title">ใบส่งมอบสินค้า</div><p class="original">ต้นฉบับ</p></div></header>
            <section class="top"><div class="box"><p class="line"><strong>ลูกค้า</strong> ${escapeHtml(order.customer.name || row.customer_name || '-')}</p><p class="line"><strong>ที่อยู่</strong> ${escapeHtml(order.shipping_address || '-')}</p><p class="line"><strong>วิธีส่งมอบ</strong> ${escapeHtml(deliveryMethodLabel(order.delivery_method))}</p><p class="line"><strong>รายละเอียดขนส่ง</strong> ${escapeHtml(deliveryDetails || '-')}</p></div><div class="box"><dl class="meta"><dt>เลขที่ออเดอร์</dt><dd>${escapeHtml(row.order_code)}</dd><dt>วันที่ส่งมอบ</dt><dd>${escapeHtml(formatTableDate(row.due_date))}</dd><dt>ชื่อหน่วยงาน, ชื่องาน</dt><dd>${escapeHtml(order.job_name || '-')}</dd></dl></div></section>
            <table><thead><tr><th style="width:9%">ลำดับ</th><th>รายการ</th><th style="width:13%">จำนวน</th><th style="width:18%">จำนวนเงิน</th></tr></thead><tbody><tr class="item"><td class="center">1</td><td>${escapeHtml(order.job_type || row.job_type || '-')}: ${escapeHtml(order.job_name || '-')}</td><td class="center">${(row.order_item_count ?? 0).toLocaleString('th-TH')}</td><td class="center">${formatMoney(order.pricing.net_amount)}</td></tr><tr><td colspan="2" class="received">ได้รับสินค้าตามรายการข้างบนนี้ถูกต้องแล้ว</td><td class="summary">รวม</td><td class="summary">${formatMoney(order.pricing.net_amount)}</td></tr></tbody></table>
            <section class="signatures"><div class="signature"><strong>ผู้รับสินค้า</strong><div class="sign-line"></div><div class="sign-date">วันที่ ................................</div></div><div class="signature"><strong>ผู้ส่งสินค้า</strong><div class="sign-line"></div><div class="sign-date">${escapeHtml(deliveryInfo?.sender_signature || '-')}<br>วันที่ ${escapeHtml(formatTableDate(row.due_date))}</div></div></section>
        </main></body></html>`);
        printWindow.document.close();
        printWindow.focus();
        window.setTimeout(() => printWindow.print(), 250);
    };

    // The order that was just saved, if it is on the page the redirect landed on.
    // Newest orders sort first, so a fresh save is always on page one.
    const justSavedOrder = useMemo(
        () =>
            savedOrderCode
                ? (orders.find((row) => row.order_code === savedOrderCode) ??
                  null)
                : null,
        [orders, savedOrderCode],
    );

    /**
     * The roster is the customer's own check sheet: who is on the list, what
     * they are called, and which numbers go on their shirt and pants. It is
     * deliberately a separate print from the work receipt -- no money on it, and
     * it runs to as many pages as the team needs instead of being squeezed onto
     * one like the receipt is.
     */

    const handlePrintRoster = (orderRow?: OrderTableRow | null) => {
        const row = orderRow ?? selectedOrder;
        const order = row?.details;
        const people = order?.personalization_rows ?? [];

        if (!order || people.length === 0) {
            return;
        }

        const keeperColor = (order.individual_keeper_color ?? '').trim();
        const hasPants = people.some(
            (person) =>
                (person.pants_size ?? '').trim() !== '' ||
                (person.pants_number ?? '').trim() !== '',
        );
        const sleeves = summarizePersonLengths(
            people.map((person) => person.shirt_style),
            SHIRT_STYLE_PERSON_LABELS,
        );
        const legs = summarizePersonLengths(
            hasPants ? people.map((person) => person.pants_style) : [],
            PANTS_STYLE_PERSON_LABELS,
        );
        // Only a mixed list earns a column; a whole team in one length is said
        // once in the header instead of repeated down every row.
        const showSleeveColumn = sleeves.mixed;
        const showLegColumn = legs.mixed;
        const rosterColumnCount =
            7 +
            (hasPants ? 2 : 0) +
            (showSleeveColumn ? 1 : 0) +
            (showLegColumn ? 1 : 0);
        const cell = (value: string | undefined): string => {
            const text = (value ?? '').trim();

            return text === '' || text === '-'
                ? '<span class="r-blank">·</span>'
                : escapeHtml(text);
        };

        const bodyRows = people
            .map((person, index) => {
                const isKeeper = person.role === 'keeper';

                return `<tr class="${isKeeper ? 'is-keeper' : ''}">
                    <td class="r-index">${index + 1}</td>
                    <td class="r-role">${isKeeper ? 'ผู้รักษาประตู' : 'ผู้เล่น'}</td>
                    <td class="r-group">${person.size_group === 'kids' ? 'เด็ก' : 'ผู้ใหญ่'}</td>
                    <td class="r-size">${cell(person.size)}</td>
                    <td class="r-name">${cell(person.name)}</td>
                    <td class="r-num">${cell(person.number)}</td>
                    ${showSleeveColumn ? `<td class="r-len${person.shirt_style === 'long' ? ' is-long' : ''}">${escapeHtml(sleeves.labelOf(person.shirt_style))}</td>` : ''}
                    ${hasPants ? `<td class="r-size">${cell(person.pants_size)}</td><td class="r-num">${cell(person.pants_number)}</td>` : ''}
                    ${showLegColumn ? `<td class="r-len${person.pants_style === 'long' ? ' is-long' : ''}">${escapeHtml(legs.labelOf(person.pants_style))}</td>` : ''}
                    <td class="r-check"></td>
                </tr>`;
            })
            .join('');

        const keeperCount = people.filter(
            (person) => person.role === 'keeper',
        ).length;
        // The same masthead the work receipt prints, so the two sheets read as
        // one document family instead of two systems.
        const branchHeaderColor = resolveBranchHeaderColor(
            order.branch_name,
            DEFAULT_BRANCH_HEADER_COLOR,
        );
        const barcodeMarkup = createOrderCodeBarcodeSvg(order.order_code);
        const mastheadMarkup = `
            <div class="masthead">
                <div class="masthead-bar">
                    <span class="masthead-title">ใบรายชื่อสกรีน</span>
                    <span class="masthead-code">${escapeHtml(order.order_code)}</span>
                </div>
                <div class="masthead-body">
                    <div class="masthead-logo"><img src="/images/logo/logo.png" alt="logo" /></div>
                    <div class="masthead-company">
                        <div class="company-title">เจ.เอส.สปอร์ต</div>
                        <div class="subtitle">กรุณาตรวจสอบรายชื่อ ไซซ์ และเบอร์ ให้ถูกต้องก่อนเซ็นรับ</div>
                    </div>
                    <div class="masthead-branch">
                        <div><span class="branch-label">สาขา</span> ${escapeHtml(order.branch_name || '-')}</div>
                        <div class="small">โทร: ${escapeHtml(order.customer.phone || '-')}</div>
                        <div class="barcode-wrap">
                            ${barcodeMarkup || `<div class="barcode-fallback">${escapeHtml(order.order_code)}</div>`}
                        </div>
                    </div>
                </div>
                <div class="masthead-job">
                    <div><span class="job-label">ชื่อหน่วยงาน, ชื่องาน</span> <span class="job-value">${escapeHtml(order.job_name || '-')}</span></div>
                    <div><span class="job-label">ลูกค้า</span> <span class="job-value">${escapeHtml(order.customer.name || '-')}</span></div>
                    <div><span class="job-label">วันที่ต้องส่ง</span> <span class="job-value is-date">${escapeHtml(formatTableDate(order.due_date ?? ''))}</span></div>
                </div>
                <div class="masthead-roster">
                    <span>รวม <strong>${people.length.toLocaleString('th-TH')}</strong> รายชื่อ</span>
                    ${keeperCount > 0 ? `<span>ผู้รักษาประตู <strong>${keeperCount.toLocaleString('th-TH')}</strong> คน</span>` : ''}
                    ${sleeves.caption !== '' ? `<span class="r-length-note">${escapeHtml(sleeves.caption)}</span>` : ''}
                    ${legs.caption !== '' ? `<span class="r-length-note">${escapeHtml(legs.caption)}</span>` : ''}
                    ${keeperColor !== '' ? `<span class="r-keeper-note">เสื้อผู้รักษาประตู: ${escapeHtml(keeperColor)}</span>` : ''}
                </div>
            </div>`;

        const printWindow = window.open('', '_blank', 'width=900,height=1100');

        if (!printWindow) {
            return;
        }

        printWindow.document.write(`
            <html>
                <head>
                    <meta charset="utf-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <title>ใบรายชื่อ ${escapeHtml(order.order_code)}</title>
                    <style>
                        @page { size: A4 portrait; margin: 10mm; }
                        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        /* Paint the ground explicitly: a print window that inherits
                           a dark scheme would otherwise render white cells dark and
                           swallow the names. */
                        body { margin: 0; background: #ffffff; font-family: "Noto Sans Thai", Arial, sans-serif; color: #0f172a; font-size: 12px; }
                        td { background: #ffffff; }
                        table { width: 100%; border-collapse: collapse; }
                        /* thead repeats on every printed page, so the bill it
                           belongs to travels with each loose sheet. */
                        thead { display: table-header-group; }
                        tr { page-break-inside: avoid; }
                        .r-caption td { border: none; padding: 0 0 5px; background: #ffffff; }
                        /* The work receipt's masthead, used as-is so the two sheets
                           read as one document instead of two systems. */
                        .masthead { border: 1px solid ${branchHeaderColor}; }
                        .masthead-bar { background: ${branchHeaderColor}; color: #ffffff; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 3px 7px; }
                        .masthead-title { font-size: 14px; font-weight: 700; letter-spacing: 0.03em; }
                        .masthead-code { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; opacity: 0.92; }
                        .masthead-body { display: grid; grid-template-columns: 38mm minmax(0, 1fr) 46mm; align-items: center; gap: 6px; padding: 3px 7px; }
                        .masthead-logo { height: 15mm; overflow: hidden; }
                        .masthead-logo img { display: block; width: 100%; height: 100%; object-fit: cover; }
                        .masthead-company { text-align: center; min-width: 0; }
                        .company-title { font-size: 15px; font-weight: 800; color: #E21E26; line-height: 1.05; }
                        .subtitle { font-size: 9px; color: #374151; margin-top: 1px; line-height: 1.15; }
                        .masthead-branch { font-size: 10px; line-height: 1.2; }
                        .masthead-branch .branch-label { color: #E21E26; font-weight: 700; }
                        .masthead-job { display: grid; grid-template-columns: 2.4fr 1fr 1fr; gap: 6px; align-items: baseline; border-top: 1px solid ${branchHeaderColor}; padding: 2px 7px 3px; }
                        .masthead-job > div { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                        .job-label { font-size: 9px; color: ${branchHeaderColor}; font-weight: 700; }
                        .job-value { font-size: 13px; color: #111827; font-weight: 800; }
                        .job-value.is-date { color: #E21E26; }
                        .barcode-wrap { margin-top: 2px; border: 1px solid #000000; padding: 1px; text-align: center; }
                        .barcode-wrap svg { display: block; width: 100%; height: 8mm; }
                        .barcode-fallback { margin-top: 2px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; }
                        .masthead-roster { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-top: 1px solid ${branchHeaderColor}; padding: 3px 7px; font-size: 11px; color: #334155; }
                        .masthead-roster strong { color: #0f172a; font-size: 13px; }
                        .r-keeper-note { border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; border-radius: 4px; padding: 0 6px; font-weight: 700; }
                        th, td { border: 0.3mm solid #94a3b8; padding: 4px 6px; }
                        th { background: #1e3a8a; color: #ffffff; font-weight: 700; }
                        tbody tr:nth-child(even) td { background: #f8fafc; }
                        tbody tr.is-keeper td { background: #fffbeb; }
                        tbody tr.is-keeper .r-role { font-weight: 700; color: #92400e; }
                        .r-index { width: 8%; text-align: center; color: #64748b; }
                        .r-role { width: 14%; }
                        .r-group { width: 10%; text-align: center; }
                        .r-size { width: 10%; text-align: center; font-weight: 700; }
                        .r-name { width: 26%; }
                        .r-num { width: 10%; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
                        .r-check { width: 9%; }
                        /* nowrap so a length never breaks across two lines: the
                           table lays out automatically, so the column takes the
                           width it needs and the name column gives it up. */
                        .r-len { width: 11%; text-align: center; white-space: nowrap; }
                        /* Long is the exception on most bills, so it is the one
                           that gets picked out of the column. */
                        .r-len.is-long { font-weight: 700; color: #3730a3; }
                        .r-length-note { border: 1px solid #c7d2fe; background: #eef2ff; color: #3730a3; border-radius: 4px; padding: 0 6px; font-weight: 700; }
                        .r-blank { color: #cbd5e1; }
                        .r-foot { margin-top: 8mm; display: flex; justify-content: space-between; gap: 10mm; }
                        .r-sign { flex: 1; }
                        .r-line { margin-top: 14mm; border-bottom: 0.3mm dotted #334155; }
                        .r-sign-label { margin-top: 2px; text-align: center; color: #475569; }
                    </style>
                </head>
                <body>
                    <table>
                        <thead>
                            <tr class="r-caption">
                                <td colspan="${rosterColumnCount}">${mastheadMarkup}</td>
                            </tr>
                            <tr>
                                <th>ลำดับ</th>
                                <th>ประเภท</th>
                                <th>เด็ก/ผู้ใหญ่</th>
                                <th>ไซซ์เสื้อ</th>
                                <th>ชื่อสกรีน</th>
                                <th>เบอร์เสื้อ</th>
                                ${showSleeveColumn ? '<th>แขน</th>' : ''}
                                ${hasPants ? '<th>ไซซ์กางเกง</th><th>เบอร์กางเกง</th>' : ''}
                                ${showLegColumn ? '<th>ขา</th>' : ''}
                                <th>ตรวจ</th>
                            </tr>
                        </thead>
                        <tbody>${bodyRows}</tbody>
                    </table>

                    <div class="r-foot">
                        <div class="r-sign">
                            <div class="r-line"></div>
                            <div class="r-sign-label">ผู้ตรวจสอบรายชื่อ (ลูกค้า)</div>
                        </div>
                        <div class="r-sign">
                            <div class="r-line"></div>
                            <div class="r-sign-label">วันที่</div>
                        </div>
                    </div>
                    <script>${buildRosterPrintScript()}<\u002Fscript>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
    };

    const handlePrintDocument = (orderRow?: OrderTableRow | null) => {
        const sourceOrder = orderRow?.details ? orderRow : selectedOrder;

        if (!sourceOrder?.details) {
            return;
        }

        const order = sourceOrder.details;
        const specificationRows = order.specification_display ?? [];
        const shirtRows =
            order.spec_sections?.shirt ??
            specificationRows.filter((row) => !pantsLabels.has(row.label));
        const pantsRows =
            order.spec_sections?.pants ??
            specificationRows.filter((row) => pantsLabels.has(row.label));
        const billingDate = order.billing_date ?? '';
        const dueDate = order.due_date ?? '';
        const printImages = Array.from(
            new Set(
                [
                    order.artwork_url,
                    ...(order.shirt_artwork_urls ?? []),
                    ...(order.pants_artwork_urls ?? []),
                    ...(order.sports_day_artwork_urls ?? []),
                    ...(order.pe_uniform_artwork_urls ?? []),
                    ...(order.reference_designs ?? []),
                ].filter((url): url is string => Boolean(url)),
            ),
        );
        const customerName =
            order.customer.name || sourceOrder.customer_name || '-';
        const receiverName = sourceOrder.receiver_name || '-';
        const renderSpecTableRows = (
            rows: Array<{ label: string; value: string }>,
        ) => {
            if (rows.length === 0) {
                return '<tr><td colspan="4" class="empty-state">—</td></tr>';
            }

            const cells = layoutSpecPrintCells(rows);
            const cell = (entry: SpecPrintRow | null | undefined) =>
                entry
                    ? `<td class="spec-label">${escapeHtml(entry.label)}</td><td class="spec-value">${escapeHtml(entry.value || '-')}</td>`
                    : '<td class="spec-label"></td><td class="spec-value"></td>';

            return Array.from(
                { length: Math.ceil(cells.length / 2) },
                (_, index) => `
                    <tr class="spec-row">
                        ${cell(cells[index * 2])}
                        ${cell(cells[index * 2 + 1])}
                    </tr>
                `,
            ).join('');
        };

        const renderSpecSection = (
            title: string,
            rows: Array<{ label: string; value: string }>,
        ) => {
            return `
                <div class="spec-section">
                    <div class="table-title">${title}</div>
                    <table class="spec-table">
                        <tbody>${renderSpecTableRows(rows)}</tbody>
                    </table>
                </div>
            `;
        };
        // A Form 2 bill prints its sizes the same way as every other form:
        // its line items are one shirt or pair of pants per person, which the
        // size tables below add up per size and length. The name list is its
        // own sheet (ปริ้นใบรายชื่อ) and stays off the receipt.
        const sizeRows = order.items?.length ? order.items : [];
        const printWindow = window.open('', '_blank', 'width=1200,height=900');

        if (!printWindow) {
            return;
        }

        const sizeRowsMarkup =
            sizeRows.length > 0
                ? sizeRows
                      .map(
                          (row) => `
                <tr>
                    <td>${escapeHtml(row.size_label || '-')}</td>
                    <td>${row.quantity}</td>
                    <td>฿ ${formatMoney(Number(row.unit_price || 0))}</td>
                    <td>฿ ${formatMoney(Number(row.total_price || 0))}</td>
                </tr>`,
                      )
                      .join('')
                : '<tr><td colspan="4" class="empty-state">ไม่มีข้อมูลไซซ์</td></tr>';

        /**
         * One table per size group, laid out like the order form: the set block
         * (shirt / pants / price per set / subtotal), then the separately sold
         * shirts and pants with their own prices, then the row total.
         */
        const renderSizeGroupTable = (
            sizeGroup: 'kids' | 'adults',
            title: string,
            themeClass: 'theme-kids' | 'theme-adults',
        ): string => {
            const rows = buildPrintSizeRows(sizeRows, sizeGroup);

            if (rows.length === 0) {
                return '';
            }

            const money = (value: number): string =>
                value > 0 ? formatMoney(value) : '-';
            const count = (value: number): string =>
                value > 0 ? value.toLocaleString('th-TH') : '-';

            // Shirts and pants get one column per sleeve/leg length that the order
            // actually uses, so a short-sleeve-only order stays as narrow as before
            // while a mixed order shows the two apart. '' is the bucket for rows
            // saved before styles existed and keeps its plain heading.
            const stylesUsed = (
                styleOf: (row: PrintSizeRow) => string,
                quantitiesOf: (row: PrintSizeRow) => number[],
            ): string[] => {
                const used = ['short', 'long', ''].filter((style) =>
                    rows.some(
                        (row) =>
                            styleOf(row) === style &&
                            quantitiesOf(row).some((quantity) => quantity > 0),
                    ),
                );

                // Never drop the column entirely: an order with no shirts at all
                // still prints the shirt column, as the sheet always has.
                return used.length > 0 ? used : [''];
            };

            const shirtStyles = stylesUsed(
                (row) => row.shirtStyle,
                (row) => [row.setShirtQty, row.separateShirtQty],
            );
            const pantsStyles = stylesUsed(
                (row) => row.pantsStyle,
                (row) => [row.setPantsQty, row.separatePantsQty],
            );

            const shirtHeading = (style: string): string =>
                SHIRT_STYLE_COLUMN_LABELS[style] ?? 'เสื้อ';
            const pantsHeading = (style: string): string =>
                PANTS_STYLE_COLUMN_LABELS[style] ?? 'กางเกง';

            // A row carries one sleeve length and one leg length, so its counts
            // belong to a single column and the others read as empty.
            const inStyle = (
                rowStyle: string,
                style: string,
                quantity: number,
            ): string => (rowStyle === style ? count(quantity) : '-');

            const garmentCells = (row: PrintSizeRow, set: boolean): string =>
                shirtStyles
                    .map(
                        (style) =>
                            `<td>${inStyle(row.shirtStyle, style, set ? row.setShirtQty : row.separateShirtQty)}</td>`,
                    )
                    .join('') +
                pantsStyles
                    .map(
                        (style) =>
                            `<td>${inStyle(row.pantsStyle, style, set ? row.setPantsQty : row.separatePantsQty)}</td>`,
                    )
                    .join('');

            const sumFor = (
                styles: string[],
                styleOf: (row: PrintSizeRow) => string,
                quantityOf: (row: PrintSizeRow) => number,
            ): number[] =>
                styles.map((style) =>
                    rows.reduce(
                        (total, row) =>
                            styleOf(row) === style
                                ? total + quantityOf(row)
                                : total,
                        0,
                    ),
                );

            const totalCells = (set: boolean): string =>
                sumFor(
                    shirtStyles,
                    (row) => row.shirtStyle,
                    (row) => (set ? row.setShirtQty : row.separateShirtQty),
                )
                    .concat(
                        sumFor(
                            pantsStyles,
                            (row) => row.pantsStyle,
                            (row) =>
                                set ? row.setPantsQty : row.separatePantsQty,
                        ),
                    )
                    .map(
                        (value) =>
                            `<td class="size-total-value">${count(value)}</td>`,
                    )
                    .join('');

            const garmentColumns = shirtStyles.length + pantsStyles.length;
            const totalAmount = rows.reduce(
                (total, row) => total + row.rowTotal,
                0,
            );

            const bodyMarkup = rows
                .map(
                    (row) => `
                <tr>
                    <td class="size-label">${escapeHtml(row.sizeLabel)}</td>
                    ${garmentCells(row, true)}
                    <td>${money(row.setPrice)}</td>
                    <td class="size-subtotal">${money(row.setTotal)}</td>
                    ${garmentCells(row, false)}
                    <td>${money(row.separateShirtPrice)}</td>
                    <td>${money(row.separatePantsPrice)}</td>
                    <td class="size-subtotal">${money(row.rowTotal)}</td>
                </tr>`,
                )
                .join('');

            const headingCells = (): string =>
                shirtStyles
                    .map(
                        (style) =>
                            `<th>${escapeHtml(shirtHeading(style))}</th>`,
                    )
                    .join('') +
                pantsStyles
                    .map(
                        (style) =>
                            `<th>${escapeHtml(pantsHeading(style))}</th>`,
                    )
                    .join('');

            return `
                        <div class="size-block ${themeClass}">
                        <div class="table-title">${escapeHtml(title)}</div>
                        <table class="size-table">
                            <thead>
                                <tr>
                                    <th rowspan="2">ไซส์</th>
                                    <th colspan="${garmentColumns + 2}">ราคารวมต่อชุด</th>
                                    <th colspan="${garmentColumns}">จำนวนแยกชุด</th>
                                    <th colspan="2">ราคาแยกชุด</th>
                                    <th rowspan="2">ราคารวม</th>
                                </tr>
                                <tr>
                                    ${headingCells()}
                                    <th>ราคาต่อชุด</th>
                                    <th>รวม</th>
                                    ${headingCells()}
                                    <th>เสื้อ</th>
                                    <th>กางเกง</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bodyMarkup}
                                <tr class="size-total-row">
                                    <td class="size-total-label">จำนวนรวม</td>
                                    ${totalCells(true)}
                                    <td></td>
                                    <td class="size-total-label">จำนวนรวม</td>
                                    ${totalCells(false)}
                                    <td colspan="2" class="size-total-money-label">รวมเป็นเงิน</td>
                                    <td class="size-subtotal">${money(totalAmount)}</td>
                                </tr>
                            </tbody>
                        </table>
                        </div>`;
        };

        /**
         * Form 3 (กีฬาสี): a house per column and a size per row, which is how
         * the shop counts this work -- one glance gives the number of pink
         * larges to cut. The house colour paints its own heading so the floor
         * finds its column without reading it.
         */
        const renderSportsDayMatrix = (matrix: SportsDayMatrix): string => {
            const themeClass =
                matrix.sizeGroup === 'kids' ? 'theme-kids' : 'theme-adults';
            const headCells = matrix.houses
                .map(
                    (house) =>
                        `<th class="sd-house" style="background:${house.background};color:${house.text};">${escapeHtml(house.name)}</th>`,
                )
                .join('');
            const bodyRows = matrix.rows
                .map(
                    (row) =>
                        `<tr><td class="sd-size">${escapeHtml(row.sizeLabel)}</td>${row.quantities
                            .map(
                                (quantity) =>
                                    `<td class="sd-qty${quantity > 0 ? '' : ' is-empty'}">${quantity > 0 ? quantity.toLocaleString('th-TH') : '·'}</td>`,
                            )
                            .join(
                                '',
                            )}<td class="sd-sum">${row.quantity.toLocaleString('th-TH')}</td><td class="sd-price">${escapeHtml(row.price)}</td><td class="sd-money">${formatMoney(row.amount)}</td></tr>`,
                )
                .join('');
            const footCells = matrix.houseTotals
                .map(
                    (total) =>
                        `<td class="sd-qty">${total.toLocaleString('th-TH')}</td>`,
                )
                .join('');
            const moneyRow = matrix.houseAmounts
                .map(
                    (amount) =>
                        `<td class="sd-money">${formatMoney(amount)}</td>`,
                )
                .join('');

            return `<div class="size-block ${themeClass} sd-block">
                <div class="table-title">${escapeHtml(matrix.title)} · ${matrix.grandTotal.toLocaleString('th-TH')} ตัว</div>
                <table class="size-table sd-table">
                    <thead><tr><th class="sd-size">ไซซ์</th>${headCells}<th class="sd-sum">รวม</th><th class="sd-price">ราคา</th><th class="sd-money">เป็นเงิน</th></tr></thead>
                    <tbody>${bodyRows}</tbody>
                    <tfoot>
                        <tr class="sd-foot"><td class="sd-size">รวมตัว</td>${footCells}<td class="sd-sum">${matrix.grandTotal.toLocaleString('th-TH')}</td><td class="sd-blank" colspan="2"></td></tr>
                        <tr class="sd-foot sd-foot-money"><td class="sd-size">รวมเงิน</td>${moneyRow}<td class="sd-blank" colspan="2"></td><td class="sd-money">${formatMoney(matrix.grandAmount)}</td></tr>
                    </tfoot>
                </table>
            </div>`;
        };

        const sportsDayMatrices = buildSportsDayMatrices(
            order.sports_day_groups ?? [],
        );

        const sizeGroupTablesMarkup =
            sportsDayMatrices.length > 0
                ? sportsDayMatrices.map(renderSportsDayMatrix).join('')
                : [
                      renderSizeGroupTable(
                          'kids',
                          'ขนาดเด็ก  อนุบาล/ประถม',
                          'theme-kids',
                      ),
                      renderSizeGroupTable(
                          'adults',
                          'ขนาดผู้ใหญ่  มัธยมต้น/มัธยมปลาย',
                          'theme-adults',
                      ),
                  ]
                      .filter((markup) => markup !== '')
                      .join('');

        const specTablesMarkup = `<div class="spec-sections${pantsRows.length > 0 ? ' has-two' : ''}">${renderSpecSection('สเปกเสื้อ', shirtRows)}${pantsRows.length > 0 ? renderSpecSection('สเปกกางเกง', pantsRows) : ''}</div>`;
        const totalQuantity = sizeRows.reduce(
            (sum, row) => sum + Number(row.quantity || 0),
            0,
        );
        const totalAmount = sizeRows.reduce(
            (sum, row) => sum + Number(row.total_price || 0),
            0,
        );
        const sizeTableTitle = 'ขนาดผู้ใหญ่ มัธยมต้น/มัธยมปลาย';
        const branchHeaderColor = resolveBranchHeaderColor(
            order.branch_name,
            DEFAULT_BRANCH_HEADER_COLOR,
        );
        const sizeTableHeadMarkup = `
                                <tr>
                                    <th>ไซซ์</th>
                                    <th>จำนวน</th>
                                    <th>ราคา</th>
                                    <th>รวม</th>
                                </tr>
            `;
        const sizeTableTotalRowMarkup = `
                                <tr>
                                    <td style="text-align: right; font-weight: 700;">ยอดรวม</td>
                                    <td style="font-weight: 700; color: #174395;">${totalQuantity.toLocaleString('th-TH')} ตัว</td>
                                    <td style="font-weight: 700;">-</td>
                                    <td style="font-weight: 700; color: #E21E26;">฿ ${formatMoney(totalAmount)}</td>
                                </tr>
            `;
        const barcodeMarkup = createOrderCodeBarcodeSvg(order.order_code);

        const html = `
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>ใบรับงาน ${escapeHtml(order.order_code)}</title>
                    <style>
                        @page { size: A4 portrait; margin: 4mm; }
                        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        html, body { margin: 0; padding: 0; background: #ffffff; color: #111827; }
                        body { font-family: 'TH Sarabun New', 'Prompt', 'Noto Sans Thai', Arial, sans-serif; font-size: 11px; line-height: 1.2; }
                        .page { width: 100%; max-width: 202mm; margin: 0 auto; padding: 0; }
                        /* One masthead instead of three stacked blocks: a slim
                           title bar, the company row, then the job line. Roughly a
                           third shorter, which goes straight to the artwork. */
                        .masthead { border: 1px solid ${branchHeaderColor}; }
                        .masthead-bar { background: ${branchHeaderColor}; color: #ffffff; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 3px 7px; }
                        .masthead-title { font-size: 14px; font-weight: 700; letter-spacing: 0.03em; }
                        .masthead-code { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; opacity: 0.92; }
                        .masthead-body { display: grid; grid-template-columns: 38mm minmax(0, 1fr) 46mm; align-items: center; gap: 6px; padding: 3px 7px; }
                         /* The logo file is a square canvas whose artwork fills only the middle
                           ~39% of its height. Fitting it by height therefore printed it
                           tiny. Cropping to a box of the artwork's own proportions with
                           object-fit: cover trims the empty margin instead of the logo,
                           so it reads about three times larger in the same row. */
                        .masthead-logo { height: 15mm; overflow: hidden; }
                        .masthead-logo img { display: block; width: 100%; height: 100%; object-fit: cover; }
                        .masthead-company { text-align: center; min-width: 0; }
                        .company-title { font-size: 15px; font-weight: 800; color: #E21E26; line-height: 1.05; }
                        .subtitle { font-size: 9px; color: #374151; margin-top: 1px; line-height: 1.15; }
                        .masthead-branch { font-size: 10px; line-height: 1.2; }
                        .masthead-branch .branch-label { color: #E21E26; font-weight: 700; }
                        .masthead-job { display: grid; grid-template-columns: 2.4fr 1fr 1fr; gap: 6px; align-items: baseline; border-top: 1px solid ${branchHeaderColor}; padding: 2px 7px 3px; }
                        .masthead-job > div { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                        .job-label { font-size: 9px; color: ${branchHeaderColor}; font-weight: 700; }
                        .job-value { font-size: 13px; color: #111827; font-weight: 800; }
                        .job-value.is-date { color: #E21E26; }
                        .barcode-wrap { margin-top: 2px; border: 1px solid #000000; padding: 1px; text-align: center; }
                        .barcode-wrap svg { display: block; width: 100%; height: 8mm; }
                        .barcode-fallback { margin-top: 2px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; }
                        /* Artwork height is fixed so every sheet matches. The fitter
                           below only touches it when a dense bill would otherwise
                           need a second page. */
                        :root { --artwork-h: ${PRINT_ARTWORK_FIXED_MM}mm; --artwork-col: ${PRINT_ARTWORK_FIXED_MM}mm; --size-font: ${PRINT_SIZE_FONT_PX}px; }
                        /* Columns are at least as wide as the artwork's full height,
                           so a square mock-up fills its box instead of sitting small
                           in a tall grey band. Deliberately --artwork-col and not
                           --artwork-h: the fitter trims the height on a busy sheet,
                           and tying the width to it made the columns narrow at the
                           same time, so the pictures shrank twice over. */
                        .image-gallery { margin-top: 6px; display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--artwork-col), 1fr)); gap: 8px; }
                        /* The cap stops a lone artwork from stretching into a banner
                           the width of the sheet with a small picture adrift in it. */
                        .image-card { border: 1px solid #d1d5db; background: #f9fafb; padding: 4px; min-height: var(--artwork-h); max-height: var(--artwork-h); max-width: calc(var(--artwork-col) * 1.6); display: flex; align-items: center; justify-content: center; overflow: hidden; }
                        /* Every picture fills the same box, whatever its proportions:
                           height comes from the card rather than from the file, and
                           object-fit keeps the whole artwork visible without
                           stretching or cropping it. */
                        .image-card img { display: block; width: 100%; height: 100%; object-fit: contain; border-radius: 4px; margin: 0 auto; }
                        .fit-probe { position: absolute; visibility: hidden; height: 100mm; width: 0; }
                        .detail-grid { width: 100%; border-collapse: collapse; margin-top: 4px; }
                        .detail-grid td { border: 1px solid #000000; vertical-align: top; padding: 4px; }
                        .section-title { font-size: 12px; font-weight: 700; margin-bottom: 3px; line-height: 1.1; }
                        /* Job details and payment share one box in four columns, so
                           the block is about half as tall as the two stacked lists
                           it replaced and the size table gets that space. */
                        .info-box { margin-top: 4px; border: 1px solid #000000; padding: 4px; }
                        .info-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px 8px; font-size: 11px; line-height: 1.18; }
                        .info-grid > div { min-width: 0; overflow-wrap: anywhere; }
                        .info-grid .span-2 { grid-column: span 2; }
                        .info-grid .span-4 { grid-column: 1 / -1; }
                        .info-grid .label { font-weight: 700; }
                        .info-grid .red { color: #E21E26; font-weight: 700; }
                        .info-grid .green { color: #16a34a; font-weight: 700; }
                        .info-grid .blue { color: #174395; font-weight: 700; }
                        .info-grid .balance { color: #E21E26; font-weight: 800; font-size: 12px; }
                        .detail-list { font-size: 11px; line-height: 1.18; }
                        .detail-list > div { margin-bottom: 1px; }
                        .detail-list > div:last-child { margin-bottom: 0; }
                        .detail-list .label { font-weight: 700; }
                        .detail-list .red { color: #E21E26; font-weight: 700; }
                        .detail-list .green { color: #16a34a; font-weight: 700; }
                        .detail-list .blue { color: #174395; font-weight: 700; }
                        .detail-list .balance { color: #E21E26; font-weight: 800; font-size: 12px; }
                        .spec-sections { margin-top: 4px; display: grid; grid-template-columns: 1fr; gap: 4px; }
                        .spec-section { min-width: 0; }
                        .spec-table { width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 12px; table-layout: fixed; }
                        .spec-table td { border: 1px solid #000000; padding: 2px 3px; vertical-align: middle; line-height: 1.1; }
                        .spec-row td { text-align: center; }
                        .spec-label { width: 18%; background: #e0f2fe; font-weight: 700; white-space: nowrap; }
                        .spec-value { width: 32%; background: #ffffff; }
                        .table-title { background: #174395; color: #ffffff; font-weight: 700; text-align: center; padding: 3px; font-size: 12px; margin-top: 0; }
                        /* Two columns at all times, not only under @media print.
                           The fitter measures this window to decide how much room
                           the artwork can have, so a rule that only applies on the
                           printer made it measure a spec block 46mm taller than the
                           one that actually prints: the artwork was trimmed to fit a
                           height the sheet never had, and the paper came out with a
                           band of white at the bottom under a shrunken picture. */
                        .spec-sections.has-two { grid-template-columns: 1fr 1fr; gap: 5px; }
                        .size-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: var(--size-font, ${PRINT_SIZE_FONT_PX}px); }
                        .size-table th, .size-table td { border: 1px solid #000000; padding: 3px 4px; text-align: center; }
                        .size-table th { background: var(--tbl-head, #e0f2fe); font-weight: 700; }
                        .size-table td { background: #ffffff; }
                        .size-table .size-label { font-weight: 700; }
                        /* Colour-house grid (กีฬาสี). The heading carries the house
                           colour so the floor lands on its column without reading it,
                           and the rest stays quiet: hairline rules, banded totals,
                           and fixed-width figures so the columns line up down the
                           sheet however wide the numbers get. */
                        .sd-block .size-table { table-layout: fixed; }
                        .sd-table th, .sd-table td { border: 0.3mm solid #94a3b8; padding: 3px 5px; font-variant-numeric: tabular-nums; }
                        .sd-table thead th { letter-spacing: 0.01em; }
                        .sd-table tbody tr:nth-child(even) td { background: #f8fafc; }
                        .sd-house { font-weight: 700; }
                        .sd-size { width: 12%; text-align: left; font-weight: 700; background: #f1f5f9; }
                        .sd-qty { text-align: center; font-weight: 700; }
                        .sd-qty.is-empty { color: #cbd5e1; font-weight: 400; }
                        .sd-sum { width: 10%; text-align: center; font-weight: 700; background: #eef2ff; }
                        .sd-price { width: 14%; text-align: right; color: #475569; }
                        .sd-money { width: 16%; text-align: right; font-weight: 700; }
                        .sd-foot td { background: #e2e8f0; }
                        .sd-foot-money td { background: #cbd5e1; }
                        .sd-blank { background: #f8fafc; }
                        .sd-foot-money .sd-money { font-size: calc(var(--size-font, 11px) + 1px); }
                        .size-table .size-subtotal { background: var(--tbl-soft, #fff7e6); font-weight: 700; }
                        .size-table .size-total-row td { font-weight: 700; }
                        .size-table .size-total-label { background: var(--tbl-strong, #0ea5e9); color: #ffffff; font-size: 10px; }
                        .size-table .size-total-value { background: var(--tbl-head, #dbeafe); color: var(--tbl-strong, #E21E26); }
                        .size-table .size-total-money-label { background: #ffffff; }

                        /* One accent per size group so the whole block -- title bar,
                           header row, subtotals and totals -- reads as a single theme. */
                        .size-block.theme-kids { --tbl-strong: #15803d; --tbl-head: #dcfce7; --tbl-soft: #f0fdf4; }
                        .size-block.theme-adults { --tbl-strong: #c2410c; --tbl-head: #ffedd5; --tbl-soft: #fff7ed; }
                        .size-block .table-title { background: var(--tbl-strong); }
                        .empty-state { color: #6b7280; font-style: italic; }
                        .footer-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10px; }
                        .footer-table td { border: 1px solid #000000; padding: 4px; vertical-align: top; }
                        .footer-table .section-title { margin-bottom: 2px; font-size: 11px; }
                        .signature-name { font-size: 10px; font-weight: 700; text-align: center; margin-top: 1px; }
                        .signature-box { min-height: 7mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0; }
                        .signature-line { width: 58%; border-bottom: 1px solid #000000; }
                        .warning-banner { margin-top: 5px; background: #E21E26; color: #ffffff; text-align: center; padding: 4px 5px; font-size: 10px; font-weight: 700; line-height: 1.15; }
                        .small { font-size: 10px; }
                        tr, td, th, .detail-grid, .info-box, .size-block, .size-table, .spec-table, .footer-table, .banner-box { page-break-inside: avoid; }
                        /* Same reason: what the fitter measures has to be what
                           comes out of the printer. */
                        .job-value { font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="page">
                        <div class="masthead">
                            <div class="masthead-bar">
                                <span class="masthead-title">ใบรับงาน</span>
                                <span class="masthead-code">${escapeHtml(order.order_code)}</span>
                            </div>
                            <div class="masthead-body">
                                <div class="masthead-logo"><img src="/images/logo/logo.png" alt="logo" /></div>
                                <div class="masthead-company">
                                    <div class="company-title">เจ.เอส.สปอร์ต</div>
                                    <div class="subtitle">ก่อนเข้ารับสินค้ากรุณาโทรสอบถามก่อนเพื่อความสะดวก</div>
                                </div>
                                <div class="masthead-branch">
                                    <div><span class="branch-label">สาขา</span> ${escapeHtml(order.branch_name || '-')}</div>
                                    <div class="small">โทร: ${escapeHtml(order.customer.phone || '-')}</div>
                                    <div class="barcode-wrap">
                                        ${barcodeMarkup || `<div class="barcode-fallback">${escapeHtml(order.order_code)}</div>`}
                                    </div>
                                </div>
                            </div>
                            <div class="masthead-job">
                                <div><span class="job-label">ชื่อหน่วยงาน, ชื่องาน</span> <span class="job-value">${escapeHtml(order.job_name || '-')}</span></div>
                                <div><span class="job-label">ประเภทงาน</span> <span class="job-value">${escapeHtml(order.job_type || '-')}</span></div>
                                <div><span class="job-label">วันที่ต้องส่ง</span> <span class="job-value is-date">${escapeHtml(formatTableDate(dueDate))}</span></div>
                            </div>
                        </div>

                        <div class="image-gallery">
                            ${
                                printImages.length > 0
                                    ? printImages
                                          .map(
                                              (imageUrl) => `
                                    <div class="image-card">
                                        <img src="${imageUrl}" alt="งานแนบ" />
                                    </div>
                                `,
                                          )
                                          .join('')
                                    : '<div class="image-card" style="grid-column: 1 / -1; color: #6b7280;">[ ไม่มีรูปภาพแนบ ]</div>'
                            }
                        </div>

                        <div class="info-box">
                            <div class="section-title">ข้อมูลงาน / การชำระเงิน</div>
                            <div class="info-grid">
                                <div class="span-2"><span class="label">ชื่อหน่วยงาน, ชื่องาน:</span> ${escapeHtml(order.job_name || '-')}</div>
                                <div><span class="label">ประเภทงาน:</span> ${escapeHtml(order.job_type || '-')}</div>
                                <div><span class="label">ชื่อลูกค้า:</span> ${escapeHtml(order.customer.name || '-')}</div>
                                <div><span class="label">วันที่สั่งสินค้า:</span> ${escapeHtml(formatTableDate(billingDate))}</div>
                                <div><span class="label">วันที่รับสินค้า:</span> <span class="red">${escapeHtml(formatTableDate(dueDate))}</span></div>
                                <div><span class="label">ช่องทางติดต่อ:</span> ${escapeHtml(order.customer.line_fb || '-')}</div>
                                <div><span class="label">จัดส่ง:</span> ${escapeHtml(order.delivery_method ? (order.delivery_method === 'shipping' ? 'ขนส่ง' : order.delivery_method === 'onsite' ? 'หน้างาน' : order.delivery_method === 'pickup' ? 'รับหน้าร้าน' : order.delivery_method) : '-')}</div>
                                ${order.delivery_method && ['shipping', 'onsite'].includes(order.delivery_method) ? `<div class="span-4"><span class="label">รายละเอียด:</span> ${escapeHtml(order.shipping_address || '-')}</div>` : ''}
                                <div><span class="label">รวมเป็นเงิน:</span> ${formatMoney(order.pricing.total_amount)}</div>
                                <div><span class="label">ส่วนลด ${order.pricing.discount_percent}%:</span> ${formatMoney(order.pricing.discount_amount)}</div>
                                <div><span class="label">ยอดรวมหลังลด:</span> <span class="green">${formatMoney(order.pricing.net_amount)}</span></div>
                                <div><span class="label">ชำระแล้ว:</span> <span class="blue">${formatMoney(order.pricing.paid_amount)}</span></div>
                                <div class="span-4"><span class="label">ยอดคงเหลือ:</span> <span class="balance">${formatMoney(Math.max(order.pricing.net_amount - order.pricing.paid_amount, 0))}</span></div>
                            </div>
                        </div>

                        ${specTablesMarkup}

                        ${
                            sizeGroupTablesMarkup ||
                            `
                        <div class="table-title">${sizeTableTitle}</div>
                        <table class="size-table">
                            <thead>
                                ${sizeTableHeadMarkup}
                            </thead>
                            <tbody>
                                ${sizeRowsMarkup}
                                ${sizeTableTotalRowMarkup}
                            </tbody>
                        </table>`
                        }

                        <table class="footer-table">
                            <tr>
                                <td style="width:50%;">
                                    <div class="section-title">ลงชื่อผู้สั่งสินค้า</div>
                                    <div class="signature-name">${escapeHtml(customerName)}</div>
                                    <div class="signature-box"><div class="signature-line"></div></div>
                                </td>
                                <td style="width:50%;">
                                    <div class="section-title">ลงชื่อผู้รับงาน</div>
                                    <div class="signature-name">${escapeHtml(receiverName)}</div>
                                    <div class="signature-box"><div class="signature-line"></div></div>
                                </td>
                            </tr>
                        </table>

                        <div class="warning-banner">*** หมายเหตุ งานเพิ่มจำนวนไม่ถึง 20 ตัว ไม่ลด % และต้องชำระค่าชุด ที่เพิ่มเติมทั้งหมดก่อนเปิดออเดอร์ ***</div>
                    </div>
                    <script>${buildPrintFitScript()}<\u002Fscript>
                </body>
            </html>
        `;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();

        // The fitter prints once it has sized the sheet. This only steps in if
        // that script never ran, so the button is never a dead end.
        setTimeout(() => {
            if (
                !(printWindow as Window & { __printFitted?: boolean })
                    .__printFitted
            ) {
                printWindow.print();
            }
        }, 3500);
    };

    return (
        <>
            <Head title="เคาน์เตอร์" />

            <PendingInvitationsModal
                invitations={pendingInvitations}
                open={pendingInvitations.length > 0 && showInvitations}
                onOpenChange={setShowInvitations}
            />

            <Dialog
                open={justSavedOrder !== null && !printOfferDismissed}
                onOpenChange={(open) => {
                    if (!open) {
                        setPrintOfferDismissed(true);
                    }
                }}
            >
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <CheckCircle2 className="size-5 text-emerald-600" />
                            บันทึกใบสั่งผลิตสำเร็จ
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            เลขที่ออเดอร์{' '}
                            <span className="font-semibold text-slate-900">
                                {justSavedOrder?.order_code}
                            </span>{' '}
                            — ต้องการพิมพ์ใบรับงาน PDF เลยไหม?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-9 text-xs"
                            onClick={() => setPrintOfferDismissed(true)}
                        >
                            ยังไม่พิมพ์
                        </Button>
                        <Button
                            type="button"
                            className="h-9 bg-[#E21E26] text-xs text-white hover:bg-[#C91820]"
                            onClick={() => {
                                handlePrintDocument(justSavedOrder);
                                setPrintOfferDismissed(true);
                            }}
                        >
                            <Printer className="size-4" />
                            พิมพ์ PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DeliveryCalendarDialog
                open={showDeliveryCalendar}
                onOpenChange={setShowDeliveryCalendar}
                calendar={deliveryCalendar}
                // The branch filter only lists more than one branch for head
                // office, which is exactly who may see other branches' jobs.
                showBranch={branches.length > 1}
            />

            <div className="min-h-screen bg-slate-100 text-slate-900">
                <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-3 px-4 py-4 md:px-6 md:py-5">
                    <section className="pt-1">
                        <div className="flex flex-col gap-2.5 rounded-t-xl border border-b-0 border-slate-200 bg-white p-3 shadow-xs sm:p-3.5">
                            <div className="flex w-full flex-col gap-2.5 border-b border-slate-100 pb-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <div className="relative w-full sm:w-80 md:w-96">
                                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        value={search}
                                        onChange={(event) =>
                                            setSearch(event.target.value)
                                        }
                                        placeholder="ค้นหาเลขที่ออเดอร์, ใบเสร็จ, ชื่อลูกค้า..."
                                        className="h-9 w-full rounded-lg border-gray-100 bg-slate-50 pl-9 text-xs text-slate-900 focus:bg-white focus-visible:border-[#E21E26] focus-visible:ring-[#E21E26]/40"
                                    />
                                </div>

                                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            setShowDeliveryCalendar(true)
                                        }
                                        className="relative h-9 w-full rounded-lg border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto sm:shrink-0 sm:px-4"
                                    >
                                        <Calendar className="size-4" />
                                        ปฏิทินกำหนดส่ง
                                        {deliveryDueToday > 0 ? (
                                            <span
                                                aria-label={`วันนี้มีงานกำหนดส่ง ${deliveryDueToday} งาน`}
                                                className="absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E21E26] px-1 text-[10px] font-bold text-white shadow-sm"
                                            >
                                                {deliveryDueToday}
                                            </span>
                                        ) : null}
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() =>
                                            router.visit('/orders/create')
                                        }
                                        className="h-9 w-full rounded-lg bg-[#E21E26] px-3 text-xs font-semibold text-white shadow-sm transition-colors duration-150 ease-out hover:bg-[#C91820] sm:w-auto sm:shrink-0 sm:px-4"
                                    >
                                        <FilePlus2 className="size-4" />+
                                        เปิดบิลใหม่
                                    </Button>
                                </div>
                            </div>

                            <div className="grid w-full grid-cols-2 items-center gap-2 text-xs sm:flex sm:flex-wrap">
                                <Select
                                    value={branchId}
                                    onValueChange={setBranchId}
                                >
                                    <SelectTrigger className="col-span-2 h-8 w-full border-gray-100 bg-slate-50 text-xs text-slate-500 sm:w-[210px]">
                                        <span className="truncate">
                                            สาขา: {selectedBranchLabel}
                                        </span>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {branchOptions.map((option) => (
                                            <SelectItem
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <div
                                    ref={billingRangeRef}
                                    className="relative w-full sm:w-auto"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsBillingRangeOpen(
                                                (prev) => !prev,
                                            );
                                            setIsShippingRangeOpen(false);
                                        }}
                                        className="flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-md border border-gray-100 bg-slate-50 px-2.5 text-xs text-slate-500 transition-colors duration-150 ease-out hover:bg-white hover:text-slate-900 sm:w-auto"
                                    >
                                        <Calendar className="size-4 shrink-0 text-[#E21E26]" />
                                        <span>{billingRangeLabel}</span>
                                    </button>

                                    {isBillingRangeOpen ? (
                                        <div className="absolute top-9 left-0 z-30 w-[min(300px,calc(100vw-2.5rem))] rounded-md border border-gray-100 bg-white p-2.5 shadow-md">
                                            <div className="grid gap-2">
                                                <label
                                                    htmlFor="billing-date-from"
                                                    className="grid gap-1 text-[11px] text-slate-600"
                                                >
                                                    วันที่เริ่มต้น
                                                    <Input
                                                        id="billing-date-from"
                                                        type="date"
                                                        value={billingDateFrom}
                                                        onChange={(event) =>
                                                            setBillingDateFrom(
                                                                event.target
                                                                    .value,
                                                            )
                                                        }
                                                        className="h-8 border-slate-300 text-xs"
                                                    />
                                                </label>
                                                <label
                                                    htmlFor="billing-date-to"
                                                    className="grid gap-1 text-[11px] text-slate-600"
                                                >
                                                    วันที่สิ้นสุด
                                                    <Input
                                                        id="billing-date-to"
                                                        type="date"
                                                        value={billingDateTo}
                                                        onChange={(event) =>
                                                            setBillingDateTo(
                                                                event.target
                                                                    .value,
                                                            )
                                                        }
                                                        className="h-8 border-slate-300 text-xs"
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                <div
                                    ref={shippingRangeRef}
                                    className="relative w-full sm:w-auto"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsShippingRangeOpen(
                                                (prev) => !prev,
                                            );
                                            setIsBillingRangeOpen(false);
                                        }}
                                        className="flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-md border border-gray-100 bg-slate-50 px-2.5 text-xs text-slate-500 transition-colors duration-150 ease-out hover:bg-white hover:text-slate-900 sm:w-auto"
                                    >
                                        <Package className="size-4 shrink-0 text-[#E21E26]" />
                                        <span>{shippingRangeLabel}</span>
                                    </button>

                                    {isShippingRangeOpen ? (
                                        <div className="absolute top-9 left-0 z-30 w-[min(300px,calc(100vw-2.5rem))] rounded-md border border-gray-100 bg-white p-2.5 shadow-md">
                                            <div className="grid gap-2">
                                                <label
                                                    htmlFor="shipping-date-from"
                                                    className="grid gap-1 text-[11px] text-slate-600"
                                                >
                                                    วันที่เริ่มต้น
                                                    <Input
                                                        id="shipping-date-from"
                                                        type="date"
                                                        value={shippingDateFrom}
                                                        onChange={(event) =>
                                                            setShippingDateFrom(
                                                                event.target
                                                                    .value,
                                                            )
                                                        }
                                                        className="h-8 border-slate-300 text-xs"
                                                    />
                                                </label>
                                                <label
                                                    htmlFor="shipping-date-to"
                                                    className="grid gap-1 text-[11px] text-slate-600"
                                                >
                                                    วันที่สิ้นสุด
                                                    <Input
                                                        id="shipping-date-to"
                                                        type="date"
                                                        value={shippingDateTo}
                                                        onChange={(event) =>
                                                            setShippingDateTo(
                                                                event.target
                                                                    .value,
                                                            )
                                                        }
                                                        className="h-8 border-slate-300 text-xs"
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={handleResetFilters}
                                    className="col-span-2 flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs text-slate-500 transition-colors duration-150 ease-out hover:bg-[#E21E26]/10 hover:text-[#E21E26] sm:col-span-1 sm:ml-0 sm:justify-start"
                                >
                                    ✕ ล้างค่า
                                </Button>
                            </div>
                        </div>

                        <div className="py-3">
                            {/* Below sm the eight floor cards run as two rows that slide
                                sideways, so a phone shows four at a time instead of one
                                and a half off the edge of a single very long row. From sm
                                up it is the original single strip. */}
                            <div className="[scrollbar-width:none] overflow-x-auto [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                                <div className="grid min-w-max grid-flow-col grid-rows-2 gap-3 sm:flex sm:grid-rows-1">
                                    {departmentCards.map((card) => (
                                        <div
                                            key={card.title}
                                            className="w-[210px] shrink-0 sm:w-[220px]"
                                        >
                                            <DepartmentCard
                                                title={card.title}
                                                icon={card.icon}
                                                rows={card.rows}
                                                accent={card.accent}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <OrdersTable
                            rows={orders}
                            pagination={pagination}
                            onPageChange={handlePageChange}
                            onOpenDetail={setSelectedOrder}
                            onOpenTimeline={setTimelineOrder}
                            onOpenPdf={handlePrintDeliveryNote}
                            isAdmin={isAdmin}
                            onDuplicate={handleDuplicateOrder}
                            onDelete={setPendingDelete}
                        />
                    </section>
                </div>
            </div>

            <Dialog
                open={pendingDelete !== null}
                onOpenChange={(open) => !open && setPendingDelete(null)}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>ยืนยันการลบออเดอร์</DialogTitle>
                        <DialogDescription>
                            ต้องการลบออเดอร์{' '}
                            <span className="font-semibold text-slate-900">
                                {pendingDelete?.order_code}
                            </span>{' '}
                            ({pendingDelete?.customer_name}) ใช่หรือไม่?
                            ออเดอร์จะถูกนำออกจากหน้าเคาน์เตอร์
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPendingDelete(null)}
                            disabled={deleting}
                        >
                            ยกเลิก
                        </Button>
                        <Button
                            type="button"
                            className="bg-[#E21E26] text-white hover:bg-[#C4161C]"
                            onClick={handleConfirmDelete}
                            disabled={deleting}
                        >
                            {deleting ? 'กำลังลบ...' : 'ยืนยันการลบ'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {selectedOrder?.details ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
                    onClick={() => setSelectedOrder(null)}
                >
                    <div
                        className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="sticky top-0 z-20">
                            <WorkReceiptTopBar
                                orderCode={selectedOrder.details.order_code}
                                onPrint={handlePrintDocument}
                                onClose={() => setSelectedOrder(null)}
                                actions={
                                    (
                                        selectedOrder.details
                                            .personalization_rows ?? []
                                    ).length > 0 ? (
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="h-8 bg-white/95 px-3 text-xs font-semibold text-blue-800 hover:bg-white"
                                            onClick={() =>
                                                handlePrintRoster(selectedOrder)
                                            }
                                        >
                                            <Printer className="size-3.5" />
                                            ปริ้นใบรายชื่อ
                                        </Button>
                                    ) : null
                                }
                            />
                        </div>

                        <div ref={printRef} className="space-y-3 p-3 md:p-4">
                            <WorkReceiptBillHeader
                                branchName={selectedOrder.details.branch_name}
                                phone={selectedOrder.details.customer.phone}
                            />

                            <div className="grid gap-3 md:grid-cols-[1fr_320px]">
                                <section className="rounded-lg border border-slate-300 bg-white p-3">
                                    <h3 className="mb-2 border-b border-slate-200 pb-1 text-sm font-bold text-slate-800">
                                        รูปแบบงาน / รูปที่แนบ
                                    </h3>
                                    {detailImages.length > 0 ? (
                                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                            {detailImages.map((url, index) => (
                                                <div
                                                    key={`${url}-${index}`}
                                                    className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                                                >
                                                    <img
                                                        src={url}
                                                        alt={`attachment-${index + 1}`}
                                                        className="h-44 w-full bg-slate-50 object-contain"
                                                        onError={(event) => {
                                                            event.currentTarget.style.display =
                                                                'none';
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
                                            ไม่มีรูป Artwork
                                        </div>
                                    )}
                                </section>

                                <aside className="space-y-3">
                                    <section className="rounded-lg border border-slate-300 bg-white p-3">
                                        <h3 className="mb-2 border-b border-slate-200 pb-1 text-sm font-bold text-slate-800">
                                            ข้อมูลบิล
                                        </h3>
                                        <div className="space-y-1 text-xs text-slate-700">
                                            <p>
                                                ชื่อหน่วยงาน, ชื่องาน:{' '}
                                                <span className="font-semibold text-[#174395]">
                                                    {selectedOrder.details
                                                        .job_name || '-'}
                                                </span>
                                            </p>
                                            <p>
                                                ชื่อลูกค้า:{' '}
                                                {selectedOrder.details.customer
                                                    .name || '-'}
                                            </p>
                                            <p>
                                                ประเภทงาน:{' '}
                                                {selectedOrder.details
                                                    .job_type || '-'}
                                            </p>
                                            <p>
                                                วันที่เปิดบิล:{' '}
                                                {selectedOrder.details
                                                    .billing_date || '-'}
                                            </p>
                                            <p>
                                                วันที่รับสินค้า:{' '}
                                                <span className="font-semibold text-[#E21E26]">
                                                    {selectedOrder.details
                                                        .due_date || '-'}
                                                </span>
                                            </p>
                                            <p>
                                                ช่องทางติดต่อ:{' '}
                                                {selectedOrder.details.customer
                                                    .line_fb || '-'}
                                            </p>
                                        </div>
                                    </section>

                                    {deliveryMethodValue &&
                                    ['shipping', 'onsite'].includes(
                                        deliveryMethodValue,
                                    ) ? (
                                        <section className="rounded-lg border border-[#E21E26]/30 bg-[#E21E26]/10 p-3">
                                            <h3 className="mb-2 border-b border-[#E21E26]/20 pb-1 text-sm font-bold text-[#E21E26]">
                                                ข้อมูลการจัดส่ง
                                            </h3>
                                            <div className="space-y-1 text-xs text-slate-700">
                                                <p>
                                                    วิธีจัดส่ง:{' '}
                                                    <span className="font-semibold text-[#E21E26]">
                                                        {deliveryMethodLabel(
                                                            deliveryMethodValue,
                                                        )}
                                                    </span>
                                                </p>
                                                <p>
                                                    ข้อมูลที่บันทึกไว้:{' '}
                                                    <span className="font-medium text-slate-900">
                                                        {shippingAddressValue ||
                                                            '—'}
                                                    </span>
                                                </p>
                                            </div>
                                        </section>
                                    ) : null}

                                    <section className="rounded-lg border border-[#E21E26]/30 bg-[#E21E26]/10 p-3">
                                        <h3 className="mb-2 border-b border-[#E21E26]/20 pb-1 text-sm font-bold text-slate-800">
                                            สรุปการเงิน
                                        </h3>
                                        <div className="space-y-1.5 text-sm">
                                            <div className="flex justify-between">
                                                <span>รวมเป็นเงิน</span>
                                                <span className="font-bold text-[#E21E26]">
                                                    {formatMoney(
                                                        selectedOrder.details
                                                            .pricing
                                                            .total_amount,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>ส่วนลด %</span>
                                                <span className="font-semibold">
                                                    {
                                                        selectedOrder.details
                                                            .pricing
                                                            .discount_percent
                                                    }
                                                    %
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>ส่วนลด</span>
                                                <span>
                                                    {formatMoney(
                                                        selectedOrder.details
                                                            .pricing
                                                            .discount_amount,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex justify-between border-t border-[#E21E26]/20 pt-1">
                                                <span>ยอดรวมหลังลด</span>
                                                <span className="font-bold text-[#E21E26]">
                                                    {formatMoney(
                                                        selectedOrder.details
                                                            .pricing.net_amount,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>ชำระแล้ว</span>
                                                <span>
                                                    {formatMoney(
                                                        selectedOrder.details
                                                            .pricing
                                                            .paid_amount,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex justify-between border-t border-[#E21E26]/20 pt-1">
                                                <span>คงเหลือ</span>
                                                <span className="font-bold text-[#E21E26]">
                                                    {formatMoney(
                                                        Math.max(
                                                            selectedOrder
                                                                .details.pricing
                                                                .net_amount -
                                                                selectedOrder
                                                                    .details
                                                                    .pricing
                                                                    .paid_amount,
                                                            0,
                                                        ),
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </section>
                                </aside>
                            </div>

                            <section className="rounded-lg border border-slate-300 bg-white p-3">
                                <h3 className="mb-2 text-xs font-bold text-slate-700">
                                    รายการไซซ์และราคา
                                </h3>
                                {isIndividualOrder ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[760px] text-left text-xs">
                                            <thead>
                                                <tr className="text-slate-600">
                                                    <th className="px-2 py-1">
                                                        สกรีนชื่อ (Name)
                                                    </th>
                                                    <th className="px-2 py-1">
                                                        ไซซ์
                                                    </th>
                                                    <th className="px-2 py-1">
                                                        เบอร์
                                                    </th>
                                                    <th className="px-2 py-1 text-right">
                                                        จำนวน
                                                    </th>
                                                    <th className="px-2 py-1 text-right">
                                                        ราคาต่อหน่วย
                                                    </th>
                                                    <th className="px-2 py-1 text-right">
                                                        รวม
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {personalizationRows.map(
                                                    (item, index) => (
                                                        <tr
                                                            key={`${item.name}-${item.number}-${index}`}
                                                            className="border-t border-slate-200"
                                                        >
                                                            <td className="px-2 py-1.5 font-medium text-slate-900">
                                                                {item.name ||
                                                                    '-'}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-slate-700">
                                                                {item.size ||
                                                                    '-'}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-slate-700">
                                                                {item.number ||
                                                                    '-'}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-right">
                                                                {item.quantity}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-right">
                                                                ฿{' '}
                                                                {formatMoney(
                                                                    item.unit_price,
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-right">
                                                                ฿{' '}
                                                                {formatMoney(
                                                                    item.total_price,
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ),
                                                )}
                                                <tr className="border-t border-slate-300 bg-slate-50">
                                                    <td
                                                        colSpan={3}
                                                        className="px-2 py-1.5 text-right font-bold text-slate-800"
                                                    >
                                                        รวม
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right font-bold text-slate-900">
                                                        {personalizationRows.reduce(
                                                            (sum, item) =>
                                                                sum +
                                                                Number(
                                                                    item.quantity ||
                                                                        0,
                                                                ),
                                                            0,
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-1.5" />
                                                    <td className="px-2 py-1.5 text-right font-bold text-[#E21E26]">
                                                        ฿{' '}
                                                        {formatMoney(
                                                            personalizationRows.reduce(
                                                                (sum, item) =>
                                                                    sum +
                                                                    Number(
                                                                        item.total_price ||
                                                                            0,
                                                                    ),
                                                                0,
                                                            ),
                                                        )}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                ) : dialogSportsDayMatrices.length > 0 ? (
                                    <div className="space-y-3">
                                        {dialogSportsDayMatrices.map(
                                            (matrix) => {
                                                const isKids =
                                                    matrix.sizeGroup === 'kids';

                                                return (
                                                    <div
                                                        key={`${matrix.sizeGroup}-${matrix.garment}`}
                                                        className={`overflow-hidden rounded-xl border shadow-sm ${isKids ? 'border-emerald-200' : 'border-orange-200'}`}
                                                    >
                                                        <div
                                                            className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs font-bold text-white ${isKids ? 'bg-emerald-700' : 'bg-orange-700'}`}
                                                        >
                                                            <span>
                                                                {matrix.title}
                                                            </span>
                                                            <span className="font-mono text-[11px] font-semibold">
                                                                {matrix.grandTotal.toLocaleString(
                                                                    'th-TH',
                                                                )}{' '}
                                                                ตัว · ฿{' '}
                                                                {formatMoney(
                                                                    matrix.grandAmount,
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full min-w-max border-collapse text-xs tabular-nums">
                                                                <thead>
                                                                    <tr>
                                                                        <th className="border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-left font-bold text-slate-700">
                                                                            ไซซ์
                                                                        </th>
                                                                        {matrix.houses.map(
                                                                            (
                                                                                house,
                                                                            ) => (
                                                                                <th
                                                                                    key={
                                                                                        house.name
                                                                                    }
                                                                                    className="border border-slate-200 px-2.5 py-1.5 text-center font-bold"
                                                                                    style={{
                                                                                        backgroundColor:
                                                                                            house.background,
                                                                                        color: house.text,
                                                                                    }}
                                                                                >
                                                                                    {
                                                                                        house.name
                                                                                    }
                                                                                </th>
                                                                            ),
                                                                        )}
                                                                        <th className="border border-slate-200 bg-indigo-50 px-2.5 py-1.5 text-center font-bold text-slate-700">
                                                                            รวม
                                                                        </th>
                                                                        <th className="border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-right font-bold text-slate-700">
                                                                            ราคา
                                                                        </th>
                                                                        <th className="border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-right font-bold text-slate-700">
                                                                            เป็นเงิน
                                                                        </th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {matrix.rows.map(
                                                                        (
                                                                            row,
                                                                            rowIndex,
                                                                        ) => (
                                                                            <tr
                                                                                key={
                                                                                    row.sizeLabel
                                                                                }
                                                                                className={
                                                                                    rowIndex %
                                                                                        2 ===
                                                                                    1
                                                                                        ? 'bg-slate-50/70'
                                                                                        : undefined
                                                                                }
                                                                            >
                                                                                <td className="border border-slate-200 bg-slate-50 px-2.5 py-1 font-bold text-slate-800">
                                                                                    {
                                                                                        row.sizeLabel
                                                                                    }
                                                                                </td>
                                                                                {row.quantities.map(
                                                                                    (
                                                                                        quantity,
                                                                                        index,
                                                                                    ) => (
                                                                                        <td
                                                                                            key={
                                                                                                matrix
                                                                                                    .houses[
                                                                                                    index
                                                                                                ]
                                                                                                    .name
                                                                                            }
                                                                                            className={`border border-slate-200 px-2.5 py-1 text-center font-mono ${quantity > 0 ? 'font-bold text-slate-900' : 'text-slate-300'}`}
                                                                                        >
                                                                                            {quantity >
                                                                                            0
                                                                                                ? quantity.toLocaleString(
                                                                                                      'th-TH',
                                                                                                  )
                                                                                                : '·'}
                                                                                        </td>
                                                                                    ),
                                                                                )}
                                                                                <td className="border border-slate-200 bg-indigo-50/60 px-2.5 py-1 text-center font-mono font-bold text-slate-900">
                                                                                    {row.quantity.toLocaleString(
                                                                                        'th-TH',
                                                                                    )}
                                                                                </td>
                                                                                <td className="border border-slate-200 px-2.5 py-1 text-right font-mono text-slate-500">
                                                                                    {
                                                                                        row.price
                                                                                    }
                                                                                </td>
                                                                                <td className="border border-slate-200 px-2.5 py-1 text-right font-mono font-bold text-slate-900">
                                                                                    {formatMoney(
                                                                                        row.amount,
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        ),
                                                                    )}
                                                                </tbody>
                                                                <tfoot>
                                                                    <tr className="bg-slate-100 font-bold">
                                                                        <td className="border border-slate-200 px-2.5 py-1 text-slate-700">
                                                                            รวมตัว
                                                                        </td>
                                                                        {matrix.houseTotals.map(
                                                                            (
                                                                                total,
                                                                                index,
                                                                            ) => (
                                                                                <td
                                                                                    key={
                                                                                        matrix
                                                                                            .houses[
                                                                                            index
                                                                                        ]
                                                                                            .name
                                                                                    }
                                                                                    className="border border-slate-200 px-2.5 py-1 text-center font-mono text-slate-900"
                                                                                >
                                                                                    {total.toLocaleString(
                                                                                        'th-TH',
                                                                                    )}
                                                                                </td>
                                                                            ),
                                                                        )}
                                                                        <td className="border border-slate-200 bg-indigo-100 px-2.5 py-1 text-center font-mono text-slate-900">
                                                                            {matrix.grandTotal.toLocaleString(
                                                                                'th-TH',
                                                                            )}
                                                                        </td>
                                                                        <td
                                                                            className="border border-slate-200 px-2.5 py-1"
                                                                            colSpan={
                                                                                2
                                                                            }
                                                                        />
                                                                    </tr>
                                                                    <tr className="bg-slate-200 font-bold">
                                                                        <td className="border border-slate-300 px-2.5 py-1 text-slate-800">
                                                                            รวมเงิน
                                                                        </td>
                                                                        {matrix.houseAmounts.map(
                                                                            (
                                                                                amount,
                                                                                index,
                                                                            ) => (
                                                                                <td
                                                                                    key={
                                                                                        matrix
                                                                                            .houses[
                                                                                            index
                                                                                        ]
                                                                                            .name
                                                                                    }
                                                                                    className="border border-slate-300 px-2.5 py-1 text-right font-mono text-slate-900"
                                                                                >
                                                                                    {formatMoney(
                                                                                        amount,
                                                                                    )}
                                                                                </td>
                                                                            ),
                                                                        )}
                                                                        <td
                                                                            className="border border-slate-300 px-2.5 py-1"
                                                                            colSpan={
                                                                                2
                                                                            }
                                                                        />
                                                                        <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-sm text-slate-900">
                                                                            ฿{' '}
                                                                            {formatMoney(
                                                                                matrix.grandAmount,
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                </tfoot>
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            },
                                        )}
                                    </div>
                                ) : dialogSizeGroups.length === 0 ? (
                                    <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
                                        ยังไม่มีรายการไซซ์
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {dialogSizeGroups.map((group) => {
                                            const groupQuantity =
                                                group.lines.reduce(
                                                    (sum, line) =>
                                                        sum + line.quantity,
                                                    0,
                                                );
                                            const groupTotal =
                                                group.lines.reduce(
                                                    (sum, line) =>
                                                        sum + line.total,
                                                    0,
                                                );
                                            const isKids =
                                                group.sizeGroup === 'kids';

                                            return (
                                                <div
                                                    key={group.sizeGroup}
                                                    className={`overflow-hidden rounded-lg border ${isKids ? 'border-emerald-200' : 'border-orange-200'}`}
                                                >
                                                    <div
                                                        className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-bold text-white ${
                                                            isKids
                                                                ? 'bg-emerald-700'
                                                                : 'bg-orange-700'
                                                        }`}
                                                    >
                                                        <span>
                                                            {group.title}
                                                        </span>
                                                        <span className="font-semibold">
                                                            {groupQuantity.toLocaleString(
                                                                'th-TH',
                                                            )}{' '}
                                                            ตัว · ฿{' '}
                                                            {formatMoney(
                                                                groupTotal,
                                                            )}
                                                        </span>
                                                    </div>

                                                    <div className="overflow-x-auto">
                                                        <table className="w-full min-w-[680px] text-left text-xs">
                                                            <thead>
                                                                <tr
                                                                    className={
                                                                        isKids
                                                                            ? 'bg-emerald-50 text-emerald-900'
                                                                            : 'bg-orange-50 text-orange-900'
                                                                    }
                                                                >
                                                                    <th className="px-2.5 py-1.5 font-semibold">
                                                                        ไซซ์
                                                                    </th>
                                                                    <th className="px-2.5 py-1.5 font-semibold">
                                                                        รายการ
                                                                    </th>
                                                                    <th className="px-2.5 py-1.5 font-semibold">
                                                                        แขนเสื้อ
                                                                    </th>
                                                                    <th className="px-2.5 py-1.5 font-semibold">
                                                                        ขากางเกง
                                                                    </th>
                                                                    <th className="px-2.5 py-1.5 text-right font-semibold">
                                                                        จำนวน
                                                                    </th>
                                                                    <th className="px-2.5 py-1.5 text-right font-semibold">
                                                                        ราคา/หน่วย
                                                                    </th>
                                                                    <th className="px-2.5 py-1.5 text-right font-semibold">
                                                                        รวม
                                                                    </th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {group.lines.map(
                                                                    (line) => (
                                                                        <tr
                                                                            key={
                                                                                line.key
                                                                            }
                                                                            className="border-t border-slate-200 odd:bg-white even:bg-slate-50/70"
                                                                        >
                                                                            <td className="px-2.5 py-1.5 font-bold text-slate-900">
                                                                                {
                                                                                    line.sizeLabel
                                                                                }
                                                                            </td>
                                                                            <td className="px-2.5 py-1.5 text-slate-700">
                                                                                {
                                                                                    line.item
                                                                                }
                                                                            </td>
                                                                            <td className="px-2.5 py-1.5">
                                                                                {line.shirtStyle ? (
                                                                                    <span
                                                                                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                                                                            STYLE_CHIP_CLASSES[
                                                                                                line
                                                                                                    .shirtStyleCode
                                                                                            ] ??
                                                                                            'bg-slate-100 text-slate-700'
                                                                                        }`}
                                                                                    >
                                                                                        {
                                                                                            line.shirtStyle
                                                                                        }
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-400">
                                                                                        -
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-2.5 py-1.5">
                                                                                {line.pantsStyle ? (
                                                                                    <span
                                                                                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                                                                            STYLE_CHIP_CLASSES[
                                                                                                line
                                                                                                    .pantsStyleCode
                                                                                            ] ??
                                                                                            'bg-slate-100 text-slate-700'
                                                                                        }`}
                                                                                    >
                                                                                        {
                                                                                            line.pantsStyle
                                                                                        }
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-400">
                                                                                        -
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-2.5 py-1.5 text-right text-slate-900 tabular-nums">
                                                                                {line.quantity.toLocaleString(
                                                                                    'th-TH',
                                                                                )}
                                                                            </td>
                                                                            <td className="px-2.5 py-1.5 text-right text-slate-600 tabular-nums">
                                                                                ฿{' '}
                                                                                {formatMoney(
                                                                                    line.unitPrice,
                                                                                )}
                                                                            </td>
                                                                            <td className="px-2.5 py-1.5 text-right font-semibold text-slate-900 tabular-nums">
                                                                                ฿{' '}
                                                                                {formatMoney(
                                                                                    line.total,
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    ),
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
                                            <span className="text-xs font-bold text-slate-800">
                                                รวมทั้งบิล
                                            </span>
                                            <span className="text-sm font-extrabold text-[#E21E26]">
                                                {dialogSizeGroups
                                                    .reduce(
                                                        (sum, group) =>
                                                            sum +
                                                            group.lines.reduce(
                                                                (inner, line) =>
                                                                    inner +
                                                                    line.quantity,
                                                                0,
                                                            ),
                                                        0,
                                                    )
                                                    .toLocaleString(
                                                        'th-TH',
                                                    )}{' '}
                                                ตัว · ฿{' '}
                                                {formatMoney(
                                                    dialogSizeGroups.reduce(
                                                        (sum, group) =>
                                                            sum +
                                                            group.lines.reduce(
                                                                (inner, line) =>
                                                                    inner +
                                                                    line.total,
                                                                0,
                                                            ),
                                                        0,
                                                    ),
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </section>

                            <div
                                className={`grid items-stretch gap-3 ${pantsSpecificationRows.length > 0 ? 'lg:grid-cols-2' : ''}`}
                            >
                                <SpecTable
                                    title="สเปกแบบเสื้อ"
                                    rows={shirtSpecificationRows}
                                    accent="blue"
                                    split={pantsSpecificationRows.length === 0}
                                />
                                {pantsSpecificationRows.length > 0 ? (
                                    <SpecTable
                                        title="สเปกแบบกางเกง"
                                        rows={pantsSpecificationRows}
                                        accent="red"
                                    />
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

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
                            Timeline ออเดอร์{' '}
                            {timelineOrder?.details?.order_code}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
                            <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                                <p>
                                    ลูกค้า:{' '}
                                    <span className="font-semibold text-slate-900">
                                        {timelineOrder?.details?.customer
                                            .name || '-'}
                                    </span>
                                </p>
                                <p>
                                    ชื่อหน่วยงาน, ชื่องาน:{' '}
                                    <span className="font-semibold text-slate-900">
                                        {timelineOrder?.details?.job_name ||
                                            '-'}
                                    </span>
                                </p>
                                <p>
                                    ประเภทงาน:{' '}
                                    <span className="font-semibold text-slate-900">
                                        {timelineOrder?.details?.job_type ||
                                            '-'}
                                    </span>
                                </p>
                                <p>
                                    กำหนดส่ง:{' '}
                                    <span className="font-semibold text-slate-900">
                                        {formatTableDate(
                                            timelineOrder?.due_date ?? '',
                                        )}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {[...(timelineOrder?.details?.routings ?? [])]
                                .filter((routing) => routing.is_required)
                                .sort((a, b) => a.id - b.id)
                                .map((routing, index, routings) => {
                                    const detailLabel =
                                        timelineDetailLabel(routing);
                                    const isFuture =
                                        routing.status === 'pending';
                                    const nextRoom = routings[index + 1];
                                    const incomingDate = isFuture
                                        ? '-'
                                        : dateTime(routing.created_at);

                                    return (
                                        <div
                                            key={`${routing.station_name}-${index}`}
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
                                                                {stationLabel(
                                                                    routing.station_name,
                                                                )}
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
                                                                    {
                                                                        incomingDate
                                                                    }
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
                                                            <p>
                                                                {routing.station_name ===
                                                                'print'
                                                                    ? 'เครื่องพิมพ์'
                                                                    : 'ทีม/ผู้รับผิดชอบ'}
                                                                :{' '}
                                                                <span className="font-medium text-slate-900">
                                                                    {detailLabel ||
                                                                        '-'}
                                                                </span>
                                                            </p>
                                                        </div>
                                                        {routing.rework_note ? (
                                                            <p className="rounded-xl border border-[#E21E26]/25 bg-[#E21E26]/10 px-3 py-2 text-xs text-[#E21E26]">
                                                                หมายเหตุแก้ไข:{' '}
                                                                {
                                                                    routing.rework_note
                                                                }
                                                            </p>
                                                        ) : null}
                                                    </div>

                                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                                        ห้องต่อไป:{' '}
                                                        <span
                                                            className={`font-semibold ${nextRoom ? 'text-slate-900' : 'text-slate-400'}`}
                                                        >
                                                            {nextRoom
                                                                ? stationLabel(
                                                                      nextRoom.station_name,
                                                                  )
                                                                : 'จบกระบวนการ'}
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

Counter.layout = (props: { currentTeam?: { slug: string } | null }) => ({
    breadcrumbs: [
        {
            title: 'เคาน์เตอร์',
            href: props.currentTeam
                ? `/${props.currentTeam.slug}/counter`
                : '/counter',
        },
    ],
});
