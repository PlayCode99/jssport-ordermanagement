import { router } from '@inertiajs/react';
import { Calendar, CheckCircle2, Clock3, Factory, FileCheck2, FilePlus2, FileText, Package, Pencil, Printer, Search, Truck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    resolveScreenFlexActionStatus as resolveScreenFlexActionStatusState,
    resolveScreenFlexAssignedTeamLabel,
    resolveScreenFlexRouting as resolveScreenFlexRoutingState,
} from '@/components/domain/production/screenFlexState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Order } from '@/types/models';

type DepartmentFilter = 'all' | 'design' | 'print_room' | 'heat_press' | 'embroidery' | 'cutting' | 'sewing' | 'screen_flex' | 'qc' | 'shipping';

export interface PrintRoomStats {
    new_job_orders: number;
    new_job_pieces: number;
    printer_1_orders: number;
    printer_1_pieces: number;
    printer_2_orders: number;
    printer_2_pieces: number;
    printer_3_orders: number;
    printer_3_pieces: number;
    completed_orders: number;
    completed_pieces: number;
}

export interface HeatPressStats {
    new_job_orders: number;
    new_job_pieces: number;
    screen_orders: number;
    screen_pieces: number;
    flex_orders: number;
    flex_pieces: number;
    revising_orders: number;
    revising_pieces: number;
    completed_orders: number;
    completed_pieces: number;
}

export interface StageStats {
    new_job_orders: number;
    new_job_pieces: number;
    assigned_orders: number;
    assigned_pieces: number;
    revising_orders: number;
    revising_pieces: number;
    completed_orders: number;
    completed_pieces: number;
}

type RoutingStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'rejected';
type PrintStatusFilter = 'new_job' | 'printer_1' | 'printer_2' | 'printer_3' | 'completed';
type RoutingStatusFilter = 'pending' | 'completed';

type DeliveryFormState = {
    carrier_name: string;
    tracking_no: string;
    parcel_weight_kg: string;
    parcel_shipping_cost: string;
    onsite_sender_name: string;
    onsite_vehicle_plate: string;
    sender_signature: string;
};

function escapeHtml(value: string | number | null | undefined): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const emptyDeliveryFormState = (): DeliveryFormState => ({
    carrier_name: '',
    tracking_no: '',
    parcel_weight_kg: '',
    parcel_shipping_cost: '',
    onsite_sender_name: '',
    onsite_vehicle_plate: '',
    sender_signature: '',
});

const normalizeDeliveryFormState = (value: unknown): DeliveryFormState => {
    if (!value || typeof value !== 'object') {
        return emptyDeliveryFormState();
    }

    const source = value as Partial<DeliveryFormState>;

    return {
        carrier_name: String(source.carrier_name ?? ''),
        tracking_no: String(source.tracking_no ?? ''),
        parcel_weight_kg: String(source.parcel_weight_kg ?? ''),
        parcel_shipping_cost: String(source.parcel_shipping_cost ?? ''),
        onsite_sender_name: String(source.onsite_sender_name ?? ''),
        onsite_vehicle_plate: String(source.onsite_vehicle_plate ?? ''),
        sender_signature: String(source.sender_signature ?? ''),
    };
};

const hasDeliveryInfo = (value: DeliveryFormState | null | undefined): boolean => {
    if (!value) {
        return false;
    }

    return [
        value.carrier_name,
        value.tracking_no,
        value.parcel_weight_kg,
        value.parcel_shipping_cost,
        value.onsite_sender_name,
        value.onsite_vehicle_plate,
        value.sender_signature,
    ].some((item) => item.trim() !== '');
};

const defaultPrintStatusFilters: PrintStatusFilter[] = ['new_job', 'completed'];

const printStatusFilterOptions: Array<{ value: PrintStatusFilter; label: string }> = [
    { value: 'new_job', label: 'งานเข้าใหม่' },
    { value: 'completed', label: 'เสร็จสิ้น' },
];

const defaultRoutingStatusFilters: RoutingStatusFilter[] = ['pending', 'completed'];

const routingStatusFilterOptions: Array<{ value: RoutingStatusFilter; label: string }> = [
    { value: 'pending', label: 'งานเข้าใหม่' },
    { value: 'completed', label: 'เสร็จสิ้น' },
];

const factoryRoutingOrder = ['design', 'print', 'embroidery', 'screen', 'flex', 'cutting', 'sewing', 'qc', 'shipping'] as const;

const routingStatusPriority: RoutingStatus[] = ['in_progress', 'rejected', 'completed', 'skipped', 'pending'];

export interface OrderTableRow {
    id: number;
    billing_date: string;
    due_date: string;
    incoming_date?: string;
    order_code: string;
    has_order_pdf?: boolean;
    branch_name: string;
    customer_name: string;
    job_name: string;
    job_type: string;
    source_room: string;
    order_item_count: number;
    status: 'design' | 'print_room' | 'heat_press' | 'embroidery' | 'cutting' | 'sewing' | 'screen_flex' | 'qc' | 'shipping' | 'completed';
    order_status: string;
    print_status_bucket: PrintStatusFilter;
    print_assigned_date: string;
    print_completed_date: string;
    delivery_method?: string | null;
    shipping_address?: string | null;
    receipt_code?: string;
    payment_status: 'paid' | 'deposit' | 'pending';
    net_amount: number;
    has_payment_pdf?: boolean;
    receiver_name: string;
    print_machine?: 'printer_1' | 'printer_2' | 'printer_3' | null;
    action_status_label?: string;
    action_status_class?: string;
    assigned_team_label?: string;
    department_routing_status?: RoutingStatus | null;
    inspection_signed_off: boolean;
    inspection_checkpoint_ids: number[];
    inspection_inspector_name?: string;
    inspection_signed_at?: string;
    inspection_note?: string;
    shipping_delivery_info?: DeliveryFormState;
    shipping_sender_name?: string;
    shipping_completed_at?: string;
    size_breakdown: Array<{
        size_group: string;
        size_label: string;
        quantity: number;
        screen_name?: string;
    }>;
    timeline_checkpoints: Array<{
        id: number;
        station_name: string;
        station_label: string;
        status: string;
        is_done: boolean;
    }>;
}

type ProductionKanbanBoardProps = {
    orders: Order[];
    branches?: Array<{ value: string; label: string }>;
    initialDepartmentFilter?: DepartmentFilter;
    showDepartmentFilter?: boolean;
    hideBillingColumns?: boolean;
    cuttingTeamByOrderId?: Record<number, string>;
    cuttingReworkByOrderId?: Record<number, string>;
    heatPressMachineByOrderId?: Record<number, string>;
    heatPressReworkByOrderId?: Record<number, string>;
    embroideryTeamByOrderId?: Record<number, string>;
    embroideryReworkByOrderId?: Record<number, string>;
    sewingTeamByOrderId?: Record<number, string>;
    sewingReworkByOrderId?: Record<number, string>;
    screenTeamByOrderId?: Record<number, string>;
    onOpenDetail?: (row: OrderTableRow) => void;
    onOpenTimeline?: (row: OrderTableRow) => void;
};

const departmentOptions: Array<{ value: DepartmentFilter; label: string }> = [
    { value: 'all', label: 'ทุกห้องการผลิต' },
    { value: 'design', label: 'ห้องออกแบบ' },
    { value: 'print_room', label: 'ห้องพิมพ์' },
    { value: 'heat_press', label: 'ห้องอัด' },
    { value: 'embroidery', label: 'ห้องปัก' },
    { value: 'cutting', label: 'ห้องตัด' },
    { value: 'sewing', label: 'ห้องเย็บ' },
    { value: 'screen_flex', label: 'สกรีน,เฟล็ค' },
    { value: 'qc', label: 'ตรวจสอบ' },
    { value: 'shipping', label: 'จัดส่ง' },
];

const tableDateFormatter = new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});

function parseDateOnly(value: string | null | undefined): Date | null {
    if (!value) {
        return null;
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
        return null;
    }

    const parsedDate = new Date(trimmedValue);

    if (!Number.isNaN(parsedDate.getTime())) {
        return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    }

    const [year, month, day] = trimmedValue.split('-').map(Number);

    if (!year || !month || !day) {
        return null;
    }

    return new Date(year, month - 1, day);
}

function isSameDate(left: Date | null, right: Date | null): boolean {
    if (!left || !right) {
        return false;
    }

    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}

function formatTableDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return tableDateFormatter.format(date);
}

function formatTableDateTime(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return new Intl.DateTimeFormat('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
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

function formatDateTime(value: string | null | undefined): string {
    if (!value) {
        return '-';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return new Intl.DateTimeFormat('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function statusLabel(status: OrderTableRow['status']): string {
    switch (status) {
        case 'design':
            return 'ออกแบบ';
        case 'print_room':
            return 'ห้องพิมพ์';
        case 'embroidery':
            return 'ปัก';
        case 'cutting':
            return 'ตัด';
        case 'heat_press':
            return 'อัด';
        case 'sewing':
            return 'เย็บ';
        case 'screen_flex':
            return 'เฟล็ก/สกรีน';
        case 'qc':
            return 'ตรวจสอบ';
        case 'shipping':
            return 'จัดส่ง';
        case 'completed':
            return 'เสร็จสิ้น';
    }
}

function statusClass(status: OrderTableRow['status']): string {
    switch (status) {
        case 'design':
            return 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]';
        case 'print_room':
            return 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]';
        case 'embroidery':
            return 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]';
        case 'cutting':
        case 'heat_press':
        case 'sewing':
        case 'screen_flex':
            return 'border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A]';
        case 'qc':
            return 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]';
        case 'shipping':
            return 'border-[#DCFCE7] bg-[#F0FDF4] text-[#166534]';
        case 'completed':
            return 'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]';
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
            return 'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]';
        case 'deposit':
            return 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]';
        case 'pending':
            return 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]';
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

function getRoutingStatusLabel(status: string): string {
    switch (status) {
        case 'pending':
            return 'รอดำเนินการ';
        case 'in_progress':
            return 'กำลังดำเนินการ';
        case 'completed':
            return 'เสร็จสิ้น';
        case 'skipped':
            return 'ข้ามขั้นตอน';
        case 'rejected':
            return 'ตีกลับ';
        default:
            return status || '-';
    }
}

function sizeGroupLabel(sizeGroup: string): string {
    switch (sizeGroup) {
        case 'kids':
            return 'เด็ก';
        case 'adults':
            return 'ผู้ใหญ่';
        case 'oversize':
            return 'โอเวอร์ไซส์';
        default:
            return sizeGroup || '-';
    }
}

export function getLatestRequiredRoutingForStation(order: Order, stationName: string): Order['routings'][number] | null {
    const routings = (order.routings ?? [])
        .filter((routing) => routing.is_required && routing.station_name === stationName)
        .sort((a, b) => a.id - b.id);

    if (routings.length === 0) {
        return null;
    }

    for (const status of routingStatusPriority) {
        const match = [...routings].reverse().find((routing) => routing.status === status);

        if (match) {
            return match;
        }
    }

    return routings[routings.length - 1] ?? null;
}

function resolveFirstInertiaError(errors: Record<string, string> | undefined): string | null {
    const firstError = errors ? Object.values(errors)[0] : null;

    if (typeof firstError !== 'string') {
        return null;
    }

    const trimmed = firstError.trim();

    return trimmed !== '' ? trimmed : null;
}

function parsePersonalizationRows(order: Order): Array<{ screen_name: string; size_label: string; quantity: number }> {
    const raw = order.specification?.screen_print_detail;

    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw) as {
            mode?: string;
            personalization_rows?: Array<{ name?: unknown; size?: unknown; quantity?: unknown }>;
        };

        if (parsed.mode !== 'individual' || !Array.isArray(parsed.personalization_rows)) {
            return [];
        }

        return parsed.personalization_rows
            .map((row) => {
                const screen_name = typeof row.name === 'string' ? row.name.trim() : '';
                const size_label = typeof row.size === 'string' ? row.size.trim() : '';
                const quantity = Number(row.quantity ?? 1);

                return {
                    screen_name,
                    size_label,
                    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
                };
            })
            .filter((row) => Boolean(row.screen_name || row.size_label));
    } catch {
        return [];
    }
}

function parseQcInspectionRemark(remark: string | null | undefined): { checkpointIds: number[]; note: string } {
    if (!remark) {
        return { checkpointIds: [], note: '' };
    }

    try {
        const parsed = JSON.parse(remark) as {
            qc_checkpoints?: unknown;
            note?: unknown;
        };
        const checkpointIds = Array.isArray(parsed.qc_checkpoints)
            ? parsed.qc_checkpoints
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0)
            : [];
        const note = typeof parsed.note === 'string' ? parsed.note.trim() : '';

        return { checkpointIds, note };
    } catch {
        return { checkpointIds: [], note: remark.trim() };
    }
}

export function mapRoutingStationToDepartmentStatus(stationName: string): OrderTableRow['status'] {
    switch (stationName) {
        case 'print':
            return 'print_room';
        case 'screen':
        case 'flex':
            return 'screen_flex';
        case 'embroidery':
            return 'embroidery';
        case 'cutting':
            return 'cutting';
        case 'sewing':
            return 'sewing';
        case 'qc':
            return 'qc';
        case 'shipping':
            return 'shipping';
        case 'design':
        default:
            return 'design';
    }
}

function isRoutingVisibleForDepartment(order: Order, stationName: string): boolean {
    const routing = (order.routings ?? []).find(
        (item) => item.is_required && item.station_name === stationName,
    );

    if (!routing) {
        return false;
    }

    return true;
}

export function shouldMapOrderToHeatPressView(order: Order, heatPressRouting: Order['routings'][number] | undefined): boolean {
    if (!heatPressRouting) {
        return false;
    }

    if (!isRoutingVisibleForDepartment(order, heatPressRouting.station_name)) {
        return false;
    }

    const jobType = (order.job_type ?? '').toLowerCase();
    const looksLikeSublimation = jobType.includes('ซับ') || jobType.includes('sublimation');
    const hasHeatPressRouting = (order.routings ?? []).some((routing) => routing.is_required && ['screen', 'flex'].includes(routing.station_name));

    if (!hasHeatPressRouting) {
        return false;
    }

    return looksLikeSublimation;
}

export function isOrderVisibleInDepartment(order: Order, department: DepartmentFilter): boolean {
    const requiredRoutings = [...(order.routings ?? [])]
        .filter((routing) => routing.is_required)
        .sort((a, b) => a.id - b.id);

    switch (department) {
        case 'print_room':
            return requiredRoutings.some((routing) => routing.station_name === 'print');
        case 'heat_press':
            return requiredRoutings.some((routing) => ['screen', 'flex'].includes(routing.station_name));
        case 'embroidery':
            return requiredRoutings.some((routing) => routing.station_name === 'embroidery');
        case 'cutting':
            return requiredRoutings.some((routing) => routing.station_name === 'cutting');
        case 'sewing':
            return requiredRoutings.some((routing) => routing.station_name === 'sewing');
        case 'screen_flex':
            return requiredRoutings.some((routing) => ['screen', 'flex'].includes(routing.station_name));
        case 'qc':
            return requiredRoutings.some((routing) => routing.station_name === 'qc');
        case 'shipping':
            return requiredRoutings.some((routing) => routing.station_name === 'shipping');
        case 'design':
            return requiredRoutings.some((routing) => routing.station_name === 'design');
        case 'all':
        default:
            return true;
    }
}

function resolveDepartmentStatus(order: Order): OrderTableRow['status'] {
    if (order.order_status === 'completed') {
        return 'completed';
    }

    const requiredRoutings = [...(order.routings ?? [])]
        .filter((routing) => routing.is_required)
        .sort((a, b) => a.id - b.id);

    const rejectedRouting = requiredRoutings.find((routing) => routing.status === 'rejected');

    if (rejectedRouting) {
        return mapRoutingStationToDepartmentStatus(rejectedRouting.station_name);
    }

    const inProgressRouting = requiredRoutings.find((routing) => routing.status === 'in_progress');

    if (inProgressRouting) {
        return mapRoutingStationToDepartmentStatus(inProgressRouting.station_name);
    }

    const pendingRouting = requiredRoutings.find((routing) => routing.status === 'pending');

    if (pendingRouting) {
        return mapRoutingStationToDepartmentStatus(pendingRouting.station_name);
    }

    return 'design';
}

function isRequiredRoutingReady(order: Order, targetStation: string): boolean {
    const requiredRoutings = [...(order.routings ?? [])]
        .filter((routing) => routing.is_required)
        .sort((a, b) => a.id - b.id);
    const targetIndex = requiredRoutings.findIndex((routing) => routing.station_name === targetStation);

    if (targetIndex === -1) {
        return false;
    }

    if (targetIndex === 0) {
        return true;
    }

    const precedentRoutings = requiredRoutings.slice(0, targetIndex);
    const allPrecedentComplete = precedentRoutings.every((routing) => ['completed', 'skipped'].includes(routing.status));

    if (allPrecedentComplete) {
        return true;
    }

    return targetStation === 'embroidery' || targetStation === 'sewing';
}

function resolveRoomRoutingStatus(order: Order, stationName: 'print' | 'screen' | 'flex'): RoutingStatus | null {
    const routing = order.routings?.find(
        (item) => item.is_required && item.station_name === stationName,
    );

    return routing?.status ?? null;
}

function resolveHeatPressRouting(order: Order) {
    const routings = [...(order.routings ?? [])]
        .filter((routing) => routing.is_required && ['screen', 'flex'].includes(routing.station_name))
        .sort((a, b) => a.id - b.id);

    return routings.find((routing) => routing.status === 'rejected')
        ?? routings.find((routing) => routing.status === 'in_progress')
        ?? routings.find((routing) => routing.status === 'pending')
        ?? routings.find((routing) => ['completed', 'skipped'].includes(routing.status))
        ?? null;
}

export function buildHeatPressStats(orders: Order[]): HeatPressStats {
    return orders.reduce<HeatPressStats>(
        (acc, order) => {
            const heatPressRouting = resolveHeatPressRouting(order);
            const orderPieces = getOrderPieceCount(order);

            if (!heatPressRouting) {
                return acc;
            }

            if (heatPressRouting.status === 'pending') {
                acc.new_job_orders += 1;
                acc.new_job_pieces += orderPieces;
            } else if (heatPressRouting.status === 'in_progress') {
                if (heatPressRouting.station_name === 'flex') {
                    acc.flex_orders += 1;
                    acc.flex_pieces += orderPieces;
                } else {
                    acc.screen_orders += 1;
                    acc.screen_pieces += orderPieces;
                }
            } else if (heatPressRouting.status === 'rejected') {
                acc.revising_orders += 1;
                acc.revising_pieces += orderPieces;
            } else if (heatPressRouting.status === 'completed' || heatPressRouting.status === 'skipped') {
                acc.completed_orders += 1;
                acc.completed_pieces += orderPieces;
            }

            return acc;
        },
        {
            new_job_orders: 0,
            new_job_pieces: 0,
            screen_orders: 0,
            screen_pieces: 0,
            flex_orders: 0,
            flex_pieces: 0,
            revising_orders: 0,
            revising_pieces: 0,
            completed_orders: 0,
            completed_pieces: 0,
        },
    );
}

export function buildVisibleStageStats(rows: Array<Pick<OrderTableRow, 'department_routing_status' | 'order_item_count'>>): StageStats {
    return rows.reduce<StageStats>(
        (acc, row) => {
            const status = row.department_routing_status;
            const orderPieces = Number(row.order_item_count ?? 0);

            if (!status) {
                return acc;
            }

            if (status === 'pending') {
                acc.new_job_orders += 1;
                acc.new_job_pieces += orderPieces;
            } else if (status === 'in_progress') {
                acc.assigned_orders += 1;
                acc.assigned_pieces += orderPieces;
            } else if (status === 'rejected') {
                acc.revising_orders += 1;
                acc.revising_pieces += orderPieces;
            } else if (status === 'completed' || status === 'skipped') {
                acc.completed_orders += 1;
                acc.completed_pieces += orderPieces;
            }

            return acc;
        },
        {
            new_job_orders: 0,
            new_job_pieces: 0,
            assigned_orders: 0,
            assigned_pieces: 0,
            revising_orders: 0,
            revising_pieces: 0,
            completed_orders: 0,
            completed_pieces: 0,
        },
    );
}

export function buildStageStats(orders: Order[], activeDepartment: DepartmentFilter): StageStats {
    const targetStations: string[] =
        activeDepartment === 'cutting'
            ? ['cutting']
            : activeDepartment === 'sewing'
                ? ['sewing']
                : activeDepartment === 'embroidery'
                    ? ['embroidery']
                    : activeDepartment === 'screen_flex'
                        ? ['screen', 'flex']
                        : activeDepartment === 'all'
                            ? ['cutting', 'sewing', 'embroidery', 'screen', 'flex']
                            : [];

    if (targetStations.length === 0) {
        return {
            new_job_orders: 0,
            new_job_pieces: 0,
            assigned_orders: 0,
            assigned_pieces: 0,
            revising_orders: 0,
            revising_pieces: 0,
            completed_orders: 0,
            completed_pieces: 0,
        };
    }

    return orders.reduce<StageStats>(
        (acc, order) => {
            let routing = null as ReturnType<typeof resolveScreenFlexRouting> | null;

            if (activeDepartment === 'screen_flex') {
                const screenFlexRoutings = [...(order.routings ?? [])]
                    .filter((item) => item.is_required && ['screen', 'flex'].includes(item.station_name))
                    .sort((a, b) => a.id - b.id);

                if (screenFlexRoutings.length === 0) {
                    return acc;
                }

                const hasInProgress = screenFlexRoutings.some((item) => item.status === 'in_progress');
                const hasRejected = screenFlexRoutings.some((item) => item.status === 'rejected');
                const readyPendingRouting = screenFlexRoutings.find((item) => item.status === 'pending' && isRequiredRoutingReady(order, item.station_name));

                if (hasInProgress) {
                    routing = screenFlexRoutings.find((item) => item.status === 'in_progress') ?? null;
                } else if (hasRejected) {
                    routing = screenFlexRoutings.find((item) => item.status === 'rejected') ?? null;
                } else if (readyPendingRouting) {
                    routing = readyPendingRouting;
                } else if (screenFlexRoutings.every((item) => ['completed', 'skipped'].includes(item.status))) {
                    routing = [...screenFlexRoutings].reverse().find((item) => ['completed', 'skipped'].includes(item.status)) ?? null;
                }
            } else {
                routing = activeDepartment === 'all'
                    ? (order.routings ?? []).find(
                        (item) => item.is_required && targetStations.includes(item.station_name),
                    ) ?? null
                    : (order.routings ?? []).find(
                        (item) => item.is_required && targetStations.includes(item.station_name),
                    );
            }

            if (!routing) {
                return acc;
            }

            const orderPieces = getOrderPieceCount(order);
            const isReadyForStage = isRequiredRoutingReady(order, routing.station_name);

            if (routing.status === 'pending' && isReadyForStage) {
                acc.new_job_orders += 1;
                acc.new_job_pieces += orderPieces;
            } else if (routing.status === 'in_progress') {
                acc.assigned_orders += 1;
                acc.assigned_pieces += orderPieces;
            } else if (routing.status === 'rejected') {
                acc.revising_orders += 1;
                acc.revising_pieces += orderPieces;
            } else if (routing.status === 'completed' || routing.status === 'skipped') {
                acc.completed_orders += 1;
                acc.completed_pieces += orderPieces;
            }

            return acc;
        },
        {
            new_job_orders: 0,
            new_job_pieces: 0,
            assigned_orders: 0,
            assigned_pieces: 0,
            revising_orders: 0,
            revising_pieces: 0,
            completed_orders: 0,
            completed_pieces: 0,
        },
    );
}

function resolveScreenFlexRouting(order: Order) {
    return resolveScreenFlexRoutingState(order);
}

function stationRoomLabel(stationName: string): string {
    switch (stationName) {
        case 'design':
            return 'ห้องออกแบบ';
        case 'print':
            return 'ห้องพิมพ์';
        case 'embroidery':
            return 'ห้องปัก';
        case 'screen':
        case 'flex':
            return 'ห้องสกรีน เฟล็กซ์';
        case 'cutting':
            return 'ห้องตัด';
        case 'sewing':
            return 'ห้องเย็บ';
        case 'qc':
            return 'ห้องตรวจสอบ';
        case 'shipping':
            return 'จัดส่ง';
        default:
            return stationName;
    }
}

function resolveHeatPressSourceRoom(order: Order): string {
    const heatPressRouting = resolveHeatPressRouting(order);

    if (!heatPressRouting) {
        return '-';
    }

    const currentStation = heatPressRouting.station_name;
    const currentIndex = factoryRoutingOrder.indexOf(currentStation as (typeof factoryRoutingOrder)[number]);

    if (currentIndex <= 0) {
        return '-';
    }

    for (let index = currentIndex - 1; index >= 0; index -= 1) {
        const stationName = factoryRoutingOrder[index];
        const prerequisiteRouting = (order.routings ?? []).find(
            (routing) => routing.is_required && routing.station_name === stationName,
        );

        if (!prerequisiteRouting) {
            continue;
        }

        if (['completed', 'skipped', 'in_progress'].includes(prerequisiteRouting.status)) {
            if (stationName === 'print') {
                const machineSuffix = prerequisiteRouting.print_machine
                    ? prerequisiteRouting.print_machine.replace('printer_', ' ') 
                    : '';

                return `เครื่องพิมพ์${machineSuffix}`;
            }

            return stationRoomLabel(stationName);
        }
    }

    return '-';
}

function sourceRoomBadgeClass(sourceRoom: string): string {
    switch (sourceRoom) {
        case 'เครื่องพิมพ์':
        case 'เครื่องพิมพ์ 1':
        case 'เครื่องพิมพ์ 2':
        case 'เครื่องพิมพ์ 3':
            return 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]';
        case 'ห้องปัก':
            return 'border-[#CFFAFE] bg-[#ECFEFF] text-[#0E7490]';
        case 'ห้องออกแบบ':
            return 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155]';
        case 'ห้องตัด':
            return 'border-[#FDE68A] bg-[#FEFCE8] text-[#A16207]';
        case 'ห้องเย็บ':
            return 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]';
        default:
            return 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]';
    }
}

function resolvePrintStatusBucket(order: Order): PrintStatusFilter {
    const printRouting = order.routings?.find(
        (routing) => routing.is_required && routing.station_name === 'print',
    );

    if (!printRouting || printRouting.status === 'pending') {
        return 'new_job';
    }

    if (printRouting.status === 'completed' || printRouting.status === 'skipped') {
        return 'completed';
    }

    if (printRouting.print_machine === 'printer_2') {
        return 'printer_2';
    }

    if (printRouting.print_machine === 'printer_3') {
        return 'printer_3';
    }

    return 'printer_1';
}

function getOrderPieceCount(order: Order): number {
    return (order.items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
}

function resolveCurrentRouting(order: Order) {
    const requiredRoutings = [...(order.routings ?? [])]
        .filter((routing) => routing.is_required)
        .sort((a, b) => a.id - b.id);

    const isRoutingReady = (routingId: number): boolean => {
        const targetIndex = requiredRoutings.findIndex((routing) => routing.id === routingId);

        if (targetIndex <= 0) {
            return true;
        }

        return requiredRoutings
            .slice(0, targetIndex)
            .every((routing) => ['completed', 'skipped'].includes(routing.status));
    };

    const rejectedRouting = requiredRoutings.find((routing) => routing.status === 'rejected');

    if (rejectedRouting) {
        return rejectedRouting;
    }

    return requiredRoutings.find(
        (routing) => routing.status === 'in_progress' || (routing.status === 'pending' && isRoutingReady(routing.id)),
    ) ?? null;
}

function resolvePrintActionStatus(order: Order): { label: string; className: string } | null {
    const printRouting = order.routings?.find(
        (routing) => routing.is_required && routing.station_name === 'print',
    );

    if (!printRouting) {
        return null;
    }

    if (printRouting.status === 'pending') {
        return {
            label: 'งานเข้าใหม่',
            className: 'border-[#94A3B8] bg-[#F1F5F9] text-[#475569]',
        };
    }

    if (printRouting.status === 'in_progress') {
        if (printRouting.print_machine === 'printer_2') {
            return {
                label: 'เครื่องพิมพ์ 2',
                className: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
            };
        }

        if (printRouting.print_machine === 'printer_3') {
            return {
                label: 'เครื่องพิมพ์ 3',
                className: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
            };
        }

        return {
            label: 'เครื่องพิมพ์ 1',
            className: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
        };
    }

    if (printRouting.status === 'completed' || printRouting.status === 'skipped') {
        return {
            label: 'เสร็จสิ้น',
            className: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
        };
    }

    if (printRouting.status === 'rejected') {
        return {
            label: 'ตีกลับ',
            className: 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
        };
    }

    return null;
}

function resolveHeatPressActionStatus(
    order: Order,
    heatPressMachineByOrderId: Record<number, string>,
    heatPressReworkByOrderId: Record<number, string>,
): { label: string; className: string } | null {
    const heatPressRouting = resolveHeatPressRouting(order);

    if (!heatPressRouting) {
        return null;
    }

    if (heatPressRouting.status === 'pending' || (heatPressRouting.status === 'in_progress' && !heatPressRouting.started_at)) {
        return {
            label: 'งานเข้าใหม่',
            className: 'border-[#94A3B8] bg-[#F1F5F9] text-[#475569]',
        };
    }

    if (heatPressRouting.status === 'in_progress') {
        const machineLabel = heatPressRouting.heat_press_machine?.machine_name ?? heatPressMachineByOrderId[order.id];

        return {
            label: machineLabel ? `แจกงาน (${machineLabel})` : 'แจกงาน',
            className: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
        };
    }

    if (heatPressRouting.status === 'completed' || heatPressRouting.status === 'skipped') {
        return {
            label: 'เสร็จสิ้น',
            className: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
        };
    }

    if (heatPressRouting.status === 'rejected') {
        const note = heatPressRouting.rework_note ?? heatPressReworkByOrderId[order.id];

        return {
            label: note ? `แก้ไข (${note})` : 'แก้ไข',
            className: 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
        };
    }

    return null;
}

function resolveCuttingActionStatus(
    order: Order,
    cuttingTeamByOrderId: Record<number, string>,
    cuttingReworkByOrderId: Record<number, string>,
): { label: string; className: string } | null {
    const cuttingRouting = getLatestRequiredRoutingForStation(order, 'cutting');

    if (!cuttingRouting) {
        return null;
    }

    if (cuttingRouting.status === 'pending') {
        return {
            label: 'งานเข้าใหม่',
            className: 'border-[#94A3B8] bg-[#F1F5F9] text-[#475569]',
        };
    }

    if (cuttingRouting.status === 'in_progress') {
        const assignedTeam = cuttingRouting.cutting_team?.team_name ?? cuttingTeamByOrderId[order.id];

        return {
            label: assignedTeam ? `กำลังทำ (แจกงานให้${assignedTeam})` : 'กำลังทำ',
            className: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
        };
    }

    if (cuttingRouting.status === 'completed' || cuttingRouting.status === 'skipped') {
        return {
            label: 'เสร็จสิ้น',
            className: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
        };
    }

    if (cuttingRouting.status === 'rejected') {
        const note = cuttingRouting.rework_note ?? cuttingReworkByOrderId[order.id];

        return {
            label: note ? `ตีกลับ (${note})` : 'ตีกลับ',
            className: 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
        };
    }

    return null;
}

function resolveEmbroideryActionStatus(
    order: Order,
    embroideryTeamByOrderId: Record<number, string>,
    embroideryReworkByOrderId: Record<number, string>,
): { label: string; className: string } | null {
    const embroideryRouting = getLatestRequiredRoutingForStation(order, 'embroidery');

    if (!embroideryRouting) {
        return null;
    }

    if (embroideryRouting.status === 'pending') {
        return {
            label: 'งานเข้าใหม่',
            className: 'border-[#94A3B8] bg-[#F1F5F9] text-[#475569]',
        };
    }

    if (embroideryRouting.status === 'in_progress') {
        const assignedTeam = embroideryRouting.embroidery_team?.team_name ?? embroideryTeamByOrderId[order.id];

        return {
            label: assignedTeam ? `แจกงาน (${assignedTeam})` : 'แจกงาน',
            className: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
        };
    }

    if (embroideryRouting.status === 'rejected') {
        const note = embroideryRouting.rework_note ?? embroideryReworkByOrderId[order.id];

        return {
            label: note ? `แก้ไข (${note})` : 'แก้ไข',
            className: 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
        };
    }

    if (embroideryRouting.status === 'completed' || embroideryRouting.status === 'skipped') {
        return {
            label: 'เสร็จสิ้น',
            className: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
        };
    }

    return null;
}

function resolveSewingActionStatus(
    order: Order,
    sewingTeamByOrderId: Record<number, string>,
    sewingReworkByOrderId: Record<number, string>,
): { label: string; className: string } | null {
    const sewingRouting = getLatestRequiredRoutingForStation(order, 'sewing');

    if (!sewingRouting) {
        return null;
    }

    if (sewingRouting.status === 'pending') {
        return {
            label: 'งานเข้าใหม่',
            className: 'border-[#94A3B8] bg-[#F1F5F9] text-[#475569]',
        };
    }

    if (sewingRouting.status === 'in_progress') {
        const assignedTeam = sewingRouting.sewing_team?.team_name ?? sewingTeamByOrderId[order.id];

        return {
            label: assignedTeam ? `แจกงาน (${assignedTeam})` : 'แจกงาน',
            className: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
        };
    }

    if (sewingRouting.status === 'rejected') {
        const note = sewingRouting.rework_note ?? sewingReworkByOrderId[order.id];

        return {
            label: note ? `แก้ไข (${note})` : 'แก้ไข',
            className: 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
        };
    }

    if (sewingRouting.status === 'completed' || sewingRouting.status === 'skipped') {
        return {
            label: 'เสร็จสิ้น',
            className: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
        };
    }

    return null;
}

function resolveScreenFlexActionStatus(order: Order): { label: string; className: string } | null {
    return resolveScreenFlexActionStatusState(order);
}

function resolveQcActionStatus(order: Order): { label: string; className: string } {
    const routing = getLatestRequiredRoutingForStation(order, 'qc');

    if (routing && (routing.status === 'completed' || routing.status === 'skipped')) {
        return {
            label: 'เสร็จสิ้น',
            className: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
        };
    }

    return {
        label: 'รอตรวจสอบ',
        className: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
    };
}

function resolveShippingActionStatus(order: Order): { label: string; className: string } {
    const routing = getLatestRequiredRoutingForStation(order, 'shipping');

    if (routing && (routing.status === 'completed' || routing.status === 'skipped')) {
        return {
            label: 'ส่งสำเร็จ',
            className: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
        };
    }

    return {
        label: 'รอจัดส่ง',
        className: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
    };
}

function deriveStageStatsFromRows(rows: OrderTableRow[]): StageStats {
    return rows.reduce<StageStats>(
        (acc, row) => {
            const label = (row.action_status_label ?? '').trim();

            if (label.startsWith('งานเข้าใหม่')) {
                acc.new_job_orders += 1;
                acc.new_job_pieces += row.order_item_count;
            } else if (label.startsWith('แจกงาน') || label.startsWith('กำลังทำ') || label === 'สกรีน เฟล็ก') {
                acc.assigned_orders += 1;
                acc.assigned_pieces += row.order_item_count;
            } else if (label.startsWith('แก้ไข') || label.startsWith('ตีกลับ')) {
                acc.revising_orders += 1;
                acc.revising_pieces += row.order_item_count;
            } else if (label.startsWith('เสร็จสิ้น')) {
                acc.completed_orders += 1;
                acc.completed_pieces += row.order_item_count;
            }

            return acc;
        },
        {
            new_job_orders: 0,
            new_job_pieces: 0,
            assigned_orders: 0,
            assigned_pieces: 0,
            revising_orders: 0,
            revising_pieces: 0,
            completed_orders: 0,
            completed_pieces: 0,
        },
    );
}

type DepartmentCardProps = {
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    rows: Array<{ label: string; value: number; tone?: 'red' | 'blue' | 'neutral'; kind?: 'jobs' | 'pieces' }>;
    accent: 'red' | 'blue' | 'slate' | 'amber' | 'green';
    surfaceClass?: string;
    darkSurface?: boolean;
    glowClass?: string;
    layerClass?: string;
};

function DepartmentCard({ title, subtitle, icon, rows, accent, surfaceClass, darkSurface = false, glowClass, layerClass }: DepartmentCardProps) {
    const borderClass = darkSurface
        ? 'border-slate-700/80'
        : accent === 'amber'
            ? 'border-[#E21E26]/25'
            : accent === 'green'
                ? 'border-[#A7F3D0]'
        : accent === 'red'
            ? 'border-[#FECACA]'
            : accent === 'blue'
                ? 'border-[#E21E26]/25'
                : 'border-[#E2E8F0]';
    const glowGradientClass = glowClass ?? (accent === 'red'
        ? 'from-[#FECACA]'
        : accent === 'blue'
            ? 'from-[#FECACA]'
            : accent === 'amber'
                ? 'from-[#FECACA]'
                : accent === 'green'
                    ? 'from-[#A7F3D0]'
                    : 'from-[#E2E8F0]');
    const iconClass = darkSurface
        ? accent === 'red'
            ? 'border-[#E21E26]/35 bg-white/10 text-[#E21E26]/90'
            : accent === 'amber'
                ? 'border-white/10 bg-white/10 text-white'
                : accent === 'green'
                    ? 'border-white/10 bg-white/10 text-white'
                    : 'border-white/10 bg-white/10 text-white'
        : accent === 'amber'
            ? 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]'
            : accent === 'green'
                ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
        : accent === 'red'
            ? 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
            : accent === 'blue'
                ? 'border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]'
                : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155]';
    const primaryRow = rows[0];
    const secondaryRow = rows[1];
    const primaryValueClass = darkSurface
        ? accent === 'green'
            ? 'text-white'
            : 'text-white'
        : accent === 'green'
            ? 'text-emerald-700'
            : 'text-[#E21E26]';
    const secondaryValueClass = darkSurface
        ? 'text-slate-100'
        : accent === 'green'
            ? 'text-emerald-700'
            : 'text-slate-900';
    const metricLabelClass = darkSurface ? 'text-slate-300/80' : 'text-slate-500';

    return (
        <article className={`relative overflow-hidden rounded-2xl border ${borderClass} ${surfaceClass ?? 'bg-white'} p-4 shadow-sm transition-all duration-200 ease-out hover:translate-y-1 hover:shadow-lg`}>
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${glowGradientClass} to-transparent`} />
            {layerClass ? <div className={`pointer-events-none absolute inset-0 ${layerClass}`} /> : null}

            <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <div className={`flex size-8 items-center justify-center rounded-lg border ${iconClass}`}>
                            {icon}
                        </div>
                        <div className="min-w-0">
                            <h3 className={`text-sm font-semibold ${darkSurface ? 'text-slate-100' : 'text-slate-900'}`}>{title}</h3>
                            {subtitle ? <p className="mt-0.5 text-[10px] text-slate-300/80">{subtitle}</p> : null}
                        </div>
                    </div>
                </div>

                {primaryRow ? (
                    <div className="text-right">
                        <p className={`mt-1 text-3xl font-semibold leading-none tabular-nums ${primaryValueClass}`}>{primaryRow.value}</p>
                        <p className="mt-1 text-[10px] text-slate-300/80">{primaryRow.label}</p>
                    </div>
                ) : null}
            </div>

            {secondaryRow ? (
                <div className="relative z-10 mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <span className={`text-[10px] font-medium ${metricLabelClass}`}>{secondaryRow.label}</span>
                    <div className="text-right">
                        <span className={`block text-base font-semibold tabular-nums ${secondaryValueClass}`}>{secondaryRow.value}</span>
                        <span className="mt-0.5 block text-[10px] text-slate-300/80">{secondaryRow.kind === 'pieces' ? 'จำนวนตัว' : 'จำนวนงาน'}</span>
                    </div>
                </div>
            ) : null}
            {secondaryRow ? null : rows.slice(1).map((row) => (
                <div key={row.label} className="relative z-10 mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <span className={`text-[10px] font-medium ${metricLabelClass}`}>{row.label}</span>
                    <span className={`text-base font-semibold tabular-nums ${secondaryValueClass}`}>{row.value}</span>
                </div>
            ))}
        </article>
    );
}

function HeatPressVirtualizedGrid({
    rows,
    onOpenDetail,
    onOpenTimeline,
    onOpenInspection,
    onOpenDeliveryInfo,
    hideBillingColumns,
    isHeatPressView,
    isEmbroideryView,
    isCuttingView,
    isSewingView,
    isScreenFlexView,
    isQcView,
    isShippingView,
}: {
    rows: OrderTableRow[];
    onOpenDetail: (row: OrderTableRow) => void;
    onOpenTimeline?: (row: OrderTableRow) => void;
    onOpenInspection?: (row: OrderTableRow) => void;
    onOpenDeliveryInfo?: (row: OrderTableRow) => void;
    hideBillingColumns: boolean;
    isHeatPressView: boolean;
    isEmbroideryView: boolean;
    isCuttingView: boolean;
    isSewingView: boolean;
    isScreenFlexView: boolean;
    isQcView: boolean;
    isShippingView: boolean;
}) {
    const isTimelineView = isEmbroideryView || isCuttingView || isSewingView || isScreenFlexView;
    const isIncomingDateView = isTimelineView || isHeatPressView;
    const isCounterHeaderView = isQcView || isShippingView;
    const showDeliveryTypeColumn = isShippingView;
    const showInspectorColumn = !hideBillingColumns && !isShippingView;
    const showShippingSenderColumn = isShippingView;
    const showShippingCompletedAtColumn = isShippingView;
    const showTimelineColumn = isIncomingDateView || isQcView;
    const showInspectionColumn = isQcView;
    const billingDateColClass = isShippingView ? 'w-[10%]' : 'w-[7%]';
    const dueDateColClass = isShippingView ? 'w-[8%]' : 'w-[7%]';
    const tableViewportHeightClass = isCounterHeaderView
        ? 'h-[calc(100dvh-240px)]'
        : 'h-[calc(100dvh-360px)]';
    const totalColumns =
        8
        + (showDeliveryTypeColumn ? 1 : 0)
        + (showShippingSenderColumn ? 1 : 0)
        + (showShippingCompletedAtColumn ? 1 : 0)
        + (isCounterHeaderView ? 0 : 1)
        + (hideBillingColumns || isCounterHeaderView ? 0 : 1)
        + (hideBillingColumns || isCounterHeaderView ? 0 : 1)
        + (showInspectorColumn ? 1 : 0)
        + (showTimelineColumn ? 1 : 0)
        + (showInspectionColumn ? 1 : 0);

    return (
        <div className={`${tableViewportHeightClass} min-h-[460px] w-full overflow-y-auto overflow-x-auto rounded-b-xl border border-[#E2E8F0] bg-white shadow-[0_2px_6px_rgba(15,23,42,0.05)]`}>
            <table className="w-full table-fixed divide-y divide-[#E2E8F0] text-left">
                <thead className="sticky top-0 z-10 bg-[#F8FAFC]">
                    <tr className="text-xs font-bold uppercase tracking-[0.4px] text-[#64748B]">
                        <th className={`${billingDateColClass} px-2 py-2.5`}>วันที่เปิดบิล</th>
                        <th className={`${dueDateColClass} whitespace-nowrap px-2 py-2.5`}>วันที่ส่งงาน</th>
                        <th className="w-[9%] whitespace-nowrap px-2 py-2.5">เลขที่ออเดอร์</th>
                        <th className="w-[7%] px-2 py-2.5">สาขา</th>
                        <th className="w-[9%] px-2 py-2.5">ชื่อลูกค้า</th>
                        <th className="w-[7%] px-2 py-2.5">ประเภทงาน</th>
                        {showDeliveryTypeColumn ? <th className="w-[8%] whitespace-nowrap px-2 py-2.5">ประเภทการจัดส่ง</th> : null}
                        {showShippingSenderColumn ? <th className="w-[8%] whitespace-nowrap px-2 py-2.5">ผู้ส่ง</th> : null}
                        {showShippingCompletedAtColumn ? <th className="w-[10%] whitespace-nowrap px-2 py-2.5">ส่งสำเร็จ (วันที่เวลา)</th> : null}
                        <th className="w-[6%] whitespace-nowrap px-2 py-2.5 text-right">จำนวนตัว</th>
                        <th className="w-[10%] whitespace-nowrap px-2 py-2.5">สถานะงาน</th>
                        {isCounterHeaderView ? null : <th className="w-[8%] whitespace-nowrap px-2 py-2.5">{isHeatPressView ? 'วันที่อัดเสร็จ' : 'วันที่พิมพ์เสร็จ'}</th>}
                        {hideBillingColumns || isCounterHeaderView ? null : <th className="w-[9%] whitespace-nowrap px-2 py-2.5">เลขที่ใบเสร็จ</th>}
                        {hideBillingColumns || isCounterHeaderView ? null : <th className="w-[11%] whitespace-nowrap px-2 py-2.5">สถานะชำระเงิน</th>}
                        {showInspectorColumn ? <th className="w-[8%] px-2 py-2.5">ผู้ตรวจสอบ</th> : null}
                        {showTimelineColumn ? <th className="w-[7%] px-2 py-2.5">ไทม์ไลน์</th> : null}
                        {showInspectionColumn ? <th className="w-[8%] px-2 py-2.5 text-center">ตรวจสอบ</th> : null}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={totalColumns} className="h-[400px] px-4 text-center text-sm text-[#64748B]">
                                ไม่พบข้อมูลออเดอร์ตามเงื่อนไขที่เลือก
                            </td>
                        </tr>
                    ) : rows.map((row) => (
                        <tr key={row.id} className="h-[50px] border-b border-[#E2E8F0] text-xs text-[#334155] transition-colors hover:bg-[#F8FAFC]">
                            <td className={`${billingDateColClass} whitespace-nowrap px-2 py-2.5 text-xs text-[#64748B]`}>{formatTableDateTime(row.billing_date)}</td>
                            <td className={`${dueDateColClass} whitespace-nowrap px-2 py-2.5 text-xs font-semibold text-[#0F172A]`}>{formatTableDate(row.due_date)}</td>
                            <td className="w-[9%] whitespace-nowrap px-2 py-2.5">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-[#E21E26]">
                                    <button
                                        type="button"
                                        className="truncate underline-offset-2 hover:underline"
                                        onClick={() => onOpenDetail(row)}
                                        title="ดูรายละเอียดออเดอร์"
                                    >
                                        {row.order_code}
                                    </button>
                                </div>
                            </td>
                            <td className="w-[7%] px-2 py-2.5 text-xs text-[#64748B]">
                                <span className="block truncate">{row.branch_name}</span>
                            </td>
                            <td className="w-[9%] px-2 py-2.5 text-xs" title={row.customer_name}>
                                <span className="block truncate font-medium text-[#0F172A]">{row.customer_name}</span>
                                <span className="mt-0.5 block truncate text-[11px] text-[#64748B]">{row.job_name || '-'}</span>
                            </td>
                            <td className="w-[7%] px-2 py-2.5 text-xs text-[#64748B]">
                                <span className="block truncate">{row.job_type}</span>
                            </td>
                            {showDeliveryTypeColumn ? (
                                <td className="w-[8%] whitespace-nowrap px-2 py-2.5 text-xs text-[#64748B]">
                                    {row.delivery_method === 'shipping' || row.delivery_method === 'onsite' || row.delivery_method === 'pickup' ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className={row.delivery_method === 'shipping'
                                                ? 'h-7 border-[#174395] bg-[#174395] px-2 text-[11px] text-white hover:bg-[#12367A] hover:text-white'
                                                : row.delivery_method === 'pickup'
                                                    ? 'h-7 border-[#166534]/25 bg-[#166534]/10 px-2 text-[11px] text-[#166534] hover:bg-[#166534]/20'
                                                    : 'h-7 border-[#E21E26]/25 bg-[#E21E26]/10 px-2 text-[11px] text-[#B91C1C] hover:bg-[#E21E26]/20'}
                                            onClick={() => onOpenDeliveryInfo?.(row)}
                                        >
                                            {deliveryMethodLabel(row.delivery_method)}
                                        </Button>
                                    ) : (
                                        deliveryMethodLabel(row.delivery_method)
                                    )}
                                </td>
                            ) : null}
                            {showShippingSenderColumn ? (
                                <td className="w-[8%] whitespace-nowrap px-2 py-2.5 text-xs text-[#64748B]">
                                    {row.shipping_sender_name || '-'}
                                </td>
                            ) : null}
                            {showShippingCompletedAtColumn ? (
                                <td className="w-[10%] whitespace-nowrap px-2 py-2.5 text-xs text-[#64748B]">
                                    {row.shipping_completed_at ? formatDateTime(row.shipping_completed_at) : '-'}
                                </td>
                            ) : null}
                            <td className="w-[6%] whitespace-nowrap px-2 py-2.5 text-right font-mono text-xs font-semibold text-[#0F172A]">
                                {row.order_item_count}
                            </td>
                            <td className="w-[10%] px-2 py-2.5">
                                <div className="space-y-0.5">
                                    {row.action_status_label ? (
                                        <Badge variant="outline" className={`${row.action_status_class ?? statusClass(row.status)} max-w-full px-1.5 py-0.5 text-[11px] uppercase tracking-[0.5px]`}>
                                            <span className="block truncate">{row.action_status_label}</span>
                                        </Badge>
                                    ) : null}
                                </div>
                            </td>
                            {isCounterHeaderView ? null : <td className="w-[8%] whitespace-nowrap px-2 py-2.5 text-xs text-[#64748B]">{formatTableDate(row.print_completed_date)}</td>}
                            {hideBillingColumns || isCounterHeaderView ? null : (
                                <td className="w-[9%] whitespace-nowrap px-2 py-2.5">
                                    <span className="inline-flex rounded border border-[#E2E8F0] bg-[#F8FAFC] px-1 py-0.5 font-mono text-[11px] text-[#334155]">
                                        {row.receipt_code || '-'}
                                    </span>
                                </td>
                            )}
                            {hideBillingColumns || isCounterHeaderView ? null : (
                                <td className="w-[11%] whitespace-nowrap px-2 py-2.5">
                                    <div className="flex items-center gap-1.5">
                                        <Badge variant="outline" className={`${paymentClass(row.payment_status)} px-1.5 py-0.5 text-[11px] uppercase tracking-[0.5px]`}>
                                            {paymentLabel(row.payment_status)}
                                        </Badge>
                                        <button type="button" className={row.has_payment_pdf ? 'text-[#059669] transition-colors hover:text-[#047857]' : 'text-slate-300'}>
                                            <FileCheck2 className="size-3.5" />
                                        </button>
                                    </div>
                                </td>
                            )}
                            {showInspectorColumn ? (
                                <td className="w-[8%] px-2 py-2.5 text-xs text-[#64748B]">
                                    <span className="block truncate">{row.receiver_name}</span>
                                    {row.inspection_signed_at ? (
                                        <span className="mt-0.5 block truncate text-[11px] text-[#94A3B8]">{formatDateTime(row.inspection_signed_at)}</span>
                                    ) : null}
                                </td>
                            ) : null}
                            {showTimelineColumn ? (
                                <td className="w-[7%] px-2 py-2.5 text-xs text-slate-600">
                                    <Button type="button" variant="outline" size="sm" className="h-7 border-[#174395] bg-[#174395] px-2 text-[11px] text-white transition-colors duration-150 ease-out hover:border-[#12367A] hover:bg-[#12367A] hover:text-white" onClick={() => onOpenTimeline?.(row)}>
                                        ไทม์ไลน์
                                    </Button>
                                </td>
                            ) : null}
                            {showInspectionColumn ? (
                                <td className="w-[8%] px-2 py-2.5 text-center">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className={row.inspection_signed_off
                                            ? 'h-7 border-[#CBD5E1] bg-[#F1F5F9] px-2 text-[11px] text-[#475569] transition-colors duration-150 ease-out hover:bg-[#E2E8F0]'
                                            : 'h-7 border-[#E21E26]/25 bg-[#E21E26]/10 px-2 text-[11px] text-[#E21E26] transition-colors duration-150 ease-out hover:bg-[#E21E26]/20'}
                                        onClick={() => onOpenInspection?.(row)}
                                    >
                                        {row.inspection_signed_off ? 'ดูข้อมูล' : 'ตรวจสอบ'}
                                    </Button>
                                </td>
                            ) : null}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function ProductionKanbanBoard({ 
    orders, 
    branches = [], 
    initialDepartmentFilter = 'all', 
    showDepartmentFilter = true, 
    hideBillingColumns = false,
    cuttingTeamByOrderId = {},
    cuttingReworkByOrderId = {},
    heatPressMachineByOrderId = {},
    heatPressReworkByOrderId = {},
    embroideryTeamByOrderId = {},
    embroideryReworkByOrderId = {},
    sewingTeamByOrderId = {},
    sewingReworkByOrderId = {},
    screenTeamByOrderId = {},
    onOpenDetail, 
    onOpenTimeline,
}: ProductionKanbanBoardProps) {
    const effectiveDepartmentFilter: DepartmentFilter = initialDepartmentFilter;
    const [department, setDepartment] = useState<DepartmentFilter>(effectiveDepartmentFilter);
    const [search, setSearch] = useState('');
    const [branchId, setBranchId] = useState('all');
    const [selectedPrintStatuses, setSelectedPrintStatuses] = useState<PrintStatusFilter[]>(defaultPrintStatusFilters);
    const [selectedRoutingStatuses, setSelectedRoutingStatuses] = useState<RoutingStatusFilter[]>(defaultRoutingStatusFilters);
    const [incomingDateFrom, setIncomingDateFrom] = useState('');
    const [incomingDateTo, setIncomingDateTo] = useState('');
    const [completedDateFrom, setCompletedDateFrom] = useState('');
    const [completedDateTo, setCompletedDateTo] = useState('');
    const [dateFilterOpen, setDateFilterOpen] = useState<'incoming' | 'completed' | null>(null);
    const [inspectionRow, setInspectionRow] = useState<OrderTableRow | null>(null);
    const [inspectionChecks, setInspectionChecks] = useState<Record<number, boolean>>({});
    const [inspectionNote, setInspectionNote] = useState('');
    const [isSubmittingInspection, setIsSubmittingInspection] = useState(false);
    const [optimisticQcCompletedOrderIds, setOptimisticQcCompletedOrderIds] = useState<number[]>([]);
    const [deliveryInfoRow, setDeliveryInfoRow] = useState<OrderTableRow | null>(null);
    const [deliveryForm, setDeliveryForm] = useState<DeliveryFormState>(emptyDeliveryFormState);
    const [deliveryFormsByOrderId, setDeliveryFormsByOrderId] = useState<Record<number, DeliveryFormState>>(() => {
        return orders.reduce<Record<number, DeliveryFormState>>((acc, order) => {
            acc[order.id] = normalizeDeliveryFormState(order.shipping_delivery_info);

            return acc;
        }, {});
    });
    const [isDeliveryEditing, setIsDeliveryEditing] = useState(false);
    const [isSavingDeliveryInfo, setIsSavingDeliveryInfo] = useState(false);
    const [isCompletingShipping, setIsCompletingShipping] = useState(false);
    const activeDepartment: DepartmentFilter = showDepartmentFilter ? department : effectiveDepartmentFilter;
    const showPrinterFilter = activeDepartment === 'print_room' || effectiveDepartmentFilter === 'print_room';
    const isPrintRoomView = activeDepartment === 'print_room';
    const isHeatPressView = activeDepartment === 'heat_press';
    const isEmbroideryView = activeDepartment === 'embroidery';
    const isCuttingView = activeDepartment === 'cutting';
    const isSewingView = activeDepartment === 'sewing';
    const isScreenFlexView = activeDepartment === 'screen_flex';
    const isQcView = activeDepartment === 'qc';
    const isShippingView = activeDepartment === 'shipping';
    const showAllOrdersInCurrentRoom = isQcView || isShippingView;
    const isStageView = ['cutting', 'sewing', 'embroidery', 'screen_flex'].includes(activeDepartment);
    const showRoutingStatusFilter = isHeatPressView || isStageView;
    const showStatsCards = !isQcView && !isShippingView;

    useEffect(() => {
        setDepartment(effectiveDepartmentFilter);
    }, [effectiveDepartmentFilter]);

    useEffect(() => {
        if (!isScreenFlexView) {
            return;
        }

        setSearch('');
        setBranchId('all');
    }, [isScreenFlexView]);

    useEffect(() => {
        setSelectedRoutingStatuses(defaultRoutingStatusFilters);
    }, [activeDepartment]);

    useEffect(() => {
        setDeliveryFormsByOrderId(
            orders.reduce<Record<number, DeliveryFormState>>((acc, order) => {
                acc[order.id] = normalizeDeliveryFormState(order.shipping_delivery_info);

                return acc;
            }, {}),
        );
    }, [orders]);

    // Convert Order to OrderTableRow for display
    const tableRows: OrderTableRow[] = useMemo(() => {
        return orders.map((order) => {
            const departmentStatus = resolveDepartmentStatus(order);
            const heatPressRouting = resolveHeatPressRouting(order);
            const screenFlexRouting = resolveScreenFlexRouting(order);
            const shouldRenderInHeatPressView = shouldMapOrderToHeatPressView(order, heatPressRouting);
            const isOptimisticQcCompleted = isQcView && optimisticQcCompletedOrderIds.includes(order.id);
            const actionStatus = isPrintRoomView
                ? resolvePrintActionStatus(order)
                : isOptimisticQcCompleted
                    ? {
                        label: 'เสร็จสิ้น',
                        className: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
                    }
                : isQcView
                    ? resolveQcActionStatus(order)
                : isShippingView
                    ? resolveShippingActionStatus(order)
                : isHeatPressView
                    ? (shouldRenderInHeatPressView
                        ? resolveHeatPressActionStatus(order, heatPressMachineByOrderId, heatPressReworkByOrderId)
                        : null)
                    : isEmbroideryView
                        ? resolveEmbroideryActionStatus(order, embroideryTeamByOrderId, embroideryReworkByOrderId)
                    : isCuttingView
                        ? resolveCuttingActionStatus(order, cuttingTeamByOrderId, cuttingReworkByOrderId)
                    : isSewingView
                        ? resolveSewingActionStatus(order, sewingTeamByOrderId, sewingReworkByOrderId)
                    : isScreenFlexView
                        ? resolveScreenFlexActionStatus(order)
                    : departmentStatus === 'print_room'
                        ? resolvePrintActionStatus(order)
                        : departmentStatus === 'heat_press' || departmentStatus === 'screen_flex'
                            ? resolveHeatPressActionStatus(order, heatPressMachineByOrderId, heatPressReworkByOrderId)
                            : null;
            const orderItemCount = (order.items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
            const printRouting = order.routings?.find(
                (routing) => routing.is_required && routing.station_name === 'print',
            );
            const stageRoutingStations = activeDepartment === 'cutting'
                ? 'cutting'
                : activeDepartment === 'sewing'
                    ? 'sewing'
                    : activeDepartment === 'embroidery'
                        ? 'embroidery'
                        : null;
            const stageRouting = stageRoutingStations
                ? order.routings?.find((routing) => {
                    if (!routing.is_required) {
                        return false;
                    }

                    if (Array.isArray(stageRoutingStations)) {
                        return stageRoutingStations.includes(routing.station_name);
                    }

                    return routing.station_name === stageRoutingStations;
                })
                : isScreenFlexView
                    ? screenFlexRouting
                    : null;
            const activeDateRouting = isCuttingView
                ? stageRouting
                : isSewingView
                    ? stageRouting
                : isEmbroideryView
                    ? stageRouting
                : isHeatPressView
                    ? heatPressRouting
                    : stageRouting ?? printRouting;
            const mappedPrintMachine =
                printRouting?.status === 'in_progress'
                    ? (printRouting.print_machine ?? 'printer_1')
                    : null;
            const mappedStatus = isPrintRoomView && printRouting && isRoutingVisibleForDepartment(order, 'print')
                ? 'print_room'
                : isHeatPressView
                    ? (shouldRenderInHeatPressView ? 'heat_press' : 'design')
                    : isEmbroideryView && stageRouting && isRoutingVisibleForDepartment(order, 'embroidery')
                        ? 'embroidery'
                        : isCuttingView && stageRouting && isRoutingVisibleForDepartment(order, 'cutting')
                            ? 'cutting'
                            : isSewingView && stageRouting && isRoutingVisibleForDepartment(order, 'sewing')
                                ? 'sewing'
                                : isScreenFlexView && screenFlexRouting && isRoutingVisibleForDepartment(order, screenFlexRouting.station_name)
                                    ? 'screen_flex'
                                    : departmentStatus;
            const printStatusBucket = resolvePrintStatusBucket(order);
            const assignedTeamLabel = isScreenFlexView
                ? resolveScreenFlexAssignedTeamLabel(order, screenTeamByOrderId)
                : isHeatPressView
                    ? heatPressRouting?.heat_press_machine?.machine_name ?? heatPressMachineByOrderId[order.id]
                : isEmbroideryView
                    ? order.routings?.find((routing) => routing.station_name === 'embroidery')?.embroidery_team?.team_name ?? embroideryTeamByOrderId[order.id]
                : isSewingView
                    ? order.routings?.find((routing) => routing.station_name === 'sewing')?.sewing_team?.team_name ?? sewingTeamByOrderId[order.id]
                : order.routings?.find((routing) => routing.station_name === 'cutting')?.cutting_team?.team_name ?? cuttingTeamByOrderId[order.id];
            const departmentRoutingStatus = isHeatPressView
                ? heatPressRouting?.status ?? null
                : isEmbroideryView || isCuttingView || isSewingView
                    ? stageRouting?.status ?? null
                    : isScreenFlexView
                        ? screenFlexRouting?.status ?? null
                        : null;
            const timelineCheckpoints = [...(order.routings ?? [])]
                .filter((routing) => routing.is_required)
                .sort((a, b) => a.id - b.id)
                .map((routing) => ({
                    id: routing.id,
                    station_name: routing.station_name,
                    station_label: stationRoomLabel(routing.station_name),
                    status: routing.status,
                    is_done: routing.status === 'completed' || routing.status === 'skipped',
                }));
            const shippingRouting = [...(order.routings ?? [])]
                .filter((routing) => routing.is_required && routing.station_name === 'shipping')
                .sort((a, b) => b.id - a.id)[0];
            const qcPassHistories = [...(order.status_histories ?? [])]
                .filter((history) => String(history.to_status) === 'shipping')
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const latestQcPassHistory = qcPassHistories[0];
            const historyWithChecklist = qcPassHistories.find((history) => {
                const parsed = parseQcInspectionRemark(history.remark ?? null);

                return parsed.checkpointIds.length > 0;
            });
            const parsedInspection = parseQcInspectionRemark((historyWithChecklist ?? latestQcPassHistory)?.remark ?? null);
            const inspectorSourceHistory = historyWithChecklist ?? latestQcPassHistory;
            const isInspectionSignedOff = isOptimisticQcCompleted
                || Boolean(latestQcPassHistory)
                || actionStatus?.label === 'เสร็จสิ้น';
            const persistedDeliveryInfo = deliveryFormsByOrderId[order.id] ?? normalizeDeliveryFormState(order.shipping_delivery_info);
            const personalizationRows = parsePersonalizationRows(order);
            const size_breakdown = personalizationRows.length > 0
                ? personalizationRows.map((row) => ({
                    size_group: '-',
                    size_label: row.size_label || '-',
                    quantity: row.quantity,
                    screen_name: row.screen_name || '-',
                }))
                : Array.from((order.items ?? []).reduce<Map<string, { size_group: string; size_label: string; quantity: number; screen_name?: string }>>((acc, item) => {
                    const key = `${item.size_group}::${item.size_label}`;
                    const current = acc.get(key);

                    if (current) {
                        current.quantity += Number(item.quantity ?? 0);
                    } else {
                        acc.set(key, {
                            size_group: String(item.size_group ?? ''),
                            size_label: String(item.size_label ?? '-'),
                            quantity: Number(item.quantity ?? 0),
                        });
                    }

                    return acc;
                }, new Map()).values()).sort((left, right) => {
                    const groupOrder = { kids: 0, adults: 1, oversize: 2 } as const;
                    const leftRank = groupOrder[left.size_group as keyof typeof groupOrder] ?? 99;
                    const rightRank = groupOrder[right.size_group as keyof typeof groupOrder] ?? 99;

                    if (leftRank !== rightRank) {
                        return leftRank - rightRank;
                    }

                    return left.size_label.localeCompare(right.size_label, 'th');
                });

            return {
                id: order.id,
                billing_date: order.created_at || order.order_date || '',
                due_date: order.due_date || '',
                incoming_date: activeDateRouting?.created_at || order.order_date || '',
                order_code: order.order_code,
                has_order_pdf: false,
                branch_name: order.branch?.branch_name || '-',
                customer_name: order.customer?.customer_name || 'Unknown',
                job_name: order.job_name || '-',
                job_type: order.job_type || '-',
                source_room: isHeatPressView ? resolveHeatPressSourceRoom(order) : '-',
                order_item_count: orderItemCount,
                status: mappedStatus,
                order_status: String(order.order_status ?? ''),
                print_status_bucket: printStatusBucket,
                print_assigned_date: activeDateRouting?.started_at || '',
                print_completed_date: activeDateRouting?.completed_at || order.order_date || '',
                delivery_method: order.delivery_method ?? null,
                shipping_address: order.shipping_address ?? null,
                receipt_code: order.receipts?.sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))[0]?.receipt_code || '',
                payment_status:
                    (order.receipts?.reduce((sum, receipt) => sum + Number(receipt.amount_paid || 0), 0) ?? 0) >= Number(order.net_amount || 0)
                        ? 'paid'
                        : (order.receipts?.reduce((sum, receipt) => sum + Number(receipt.amount_paid || 0), 0) ?? 0) > 0
                            ? 'deposit'
                            : 'pending',
                net_amount: Number(order.net_amount || 0),
                has_payment_pdf: false,
                receiver_name: inspectorSourceHistory?.user?.name || '-',
                print_machine: mappedPrintMachine,
                action_status_label: actionStatus?.label,
                action_status_class: actionStatus?.className,
                assigned_team_label: assignedTeamLabel,
                department_routing_status: departmentRoutingStatus,
                inspection_signed_off: isInspectionSignedOff,
                inspection_checkpoint_ids: parsedInspection.checkpointIds,
                inspection_inspector_name: inspectorSourceHistory?.user?.name ?? undefined,
                inspection_signed_at: inspectorSourceHistory?.created_at ?? undefined,
                inspection_note: parsedInspection.note,
                shipping_delivery_info: persistedDeliveryInfo,
                shipping_sender_name: persistedDeliveryInfo.sender_signature.trim() || '-',
                shipping_completed_at: shippingRouting && ['completed', 'skipped'].includes(String(shippingRouting.status))
                    ? (shippingRouting.completed_at ?? null)
                    : null,
                size_breakdown,
                timeline_checkpoints: timelineCheckpoints,
            };
        });
    }, [orders, isPrintRoomView, isQcView, isShippingView, isHeatPressView, isEmbroideryView, isCuttingView, isSewingView, isScreenFlexView, activeDepartment, cuttingTeamByOrderId, cuttingReworkByOrderId, heatPressMachineByOrderId, heatPressReworkByOrderId, embroideryTeamByOrderId, embroideryReworkByOrderId, sewingTeamByOrderId, sewingReworkByOrderId, screenTeamByOrderId, optimisticQcCompletedOrderIds, deliveryFormsByOrderId]);

    // Filter orders to apply search and branch filters.
    const filteredOrders = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();

        return tableRows.filter((row) => {
            if (activeDepartment === 'all') {
                return Boolean(row.action_status_label) || row.status === 'completed';
            }

            if (activeDepartment === 'heat_press') {
                const matchesHeatPressView = row.status === 'heat_press' || (Boolean(row.action_status_label) && row.status !== 'design');

                if (!matchesHeatPressView) {
                    return false;
                }
            }

            if (branchId !== 'all' && row.branch_name !== branchId) {
                return false;
            }

            if (activeDepartment !== 'all' && !showAllOrdersInCurrentRoom && row.status !== activeDepartment) {
                return false;
            }

            if (isShippingView && row.order_status !== 'shipping') {
                return false;
            }

            if (normalizedSearch) {
                const matched =
                    row.order_code.toLowerCase().includes(normalizedSearch) ||
                    row.customer_name.toLowerCase().includes(normalizedSearch) ||
                    row.job_type.toLowerCase().includes(normalizedSearch);

                if (!matched) {
                    return false;
                }
            }

            if (showPrinterFilter && selectedPrintStatuses.length > 0) {
                if (!selectedPrintStatuses.includes(row.print_status_bucket)) {
                    return false;
                }
            }

            if (showRoutingStatusFilter && selectedRoutingStatuses.length > 0) {
                const normalizedStatus = row.department_routing_status === 'in_progress' || row.department_routing_status === 'rejected' || row.department_routing_status === 'skipped'
                    ? 'pending'
                    : row.department_routing_status;

                if (!normalizedStatus || !selectedRoutingStatuses.includes(normalizedStatus as RoutingStatusFilter)) {
                    return false;
                }
            }

            const incomingDate = row.incoming_date ? parseDateOnly(row.incoming_date) : null;
            const completedDate = row.print_completed_date ? parseDateOnly(row.print_completed_date) : null;
            const fromIncomingDate = parseDateOnly(incomingDateFrom);
            const toIncomingDate = parseDateOnly(incomingDateTo);
            const fromCompletedDate = parseDateOnly(completedDateFrom);
            const toCompletedDate = parseDateOnly(completedDateTo);

            if (fromIncomingDate && !toIncomingDate && incomingDate && !isSameDate(incomingDate, fromIncomingDate)) {
                return false;
            }

            if (toIncomingDate && !fromIncomingDate && incomingDate && !isSameDate(incomingDate, toIncomingDate)) {
                return false;
            }

            if (fromIncomingDate && toIncomingDate && incomingDate && (incomingDate < fromIncomingDate || incomingDate > toIncomingDate)) {
                return false;
            }

            if (fromCompletedDate && !toCompletedDate && completedDate && !isSameDate(completedDate, fromCompletedDate)) {
                return false;
            }

            if (toCompletedDate && !fromCompletedDate && completedDate && !isSameDate(completedDate, toCompletedDate)) {
                return false;
            }

            if (fromCompletedDate && toCompletedDate && completedDate && (completedDate < fromCompletedDate || completedDate > toCompletedDate)) {
                return false;
            }

            return true;
        });
    }, [tableRows, activeDepartment, showAllOrdersInCurrentRoom, branchId, search, showPrinterFilter, selectedPrintStatuses, showRoutingStatusFilter, selectedRoutingStatuses, incomingDateFrom, incomingDateTo, completedDateFrom, completedDateTo]);

    const heatPressStats = useMemo(() => buildHeatPressStats(orders), [orders]);
    const visibleHeatPressStats = useMemo(() => {
        const visibleOrders = filteredOrders
            .map((row) => orders.find((order) => order.id === row.id))
            .filter((order): order is Order => Boolean(order));

        return buildHeatPressStats(visibleOrders);
    }, [filteredOrders, orders]);

    const printRoomStats = useMemo(() => {
        return orders.reduce<PrintRoomStats>(
            (acc, order) => {
                const routingStatus = resolveRoomRoutingStatus(order, 'print');
                const orderPieces = getOrderPieceCount(order);

                if (!routingStatus) {
                    return acc;
                }

                if (routingStatus === 'pending') {
                    acc.new_job_orders += 1;
                    acc.new_job_pieces += orderPieces;
                } else if (routingStatus === 'in_progress') {
                    acc.printer_1_orders += 1;
                    acc.printer_1_pieces += orderPieces;
                } else if (routingStatus === 'rejected') {
                    acc.printer_2_orders += 1;
                    acc.printer_2_pieces += orderPieces;
                } else if (routingStatus === 'completed' || routingStatus === 'skipped') {
                    acc.completed_orders += 1;
                    acc.completed_pieces += orderPieces;
                }

                return acc;
            },
            {
                new_job_orders: 0,
                new_job_pieces: 0,
                printer_1_orders: 0,
                printer_1_pieces: 0,
                printer_2_orders: 0,
                printer_2_pieces: 0,
                printer_3_orders: 0,
                printer_3_pieces: 0,
                completed_orders: 0,
                completed_pieces: 0,
            },
        );
    }, [orders]);

    const visiblePrintRoomStats = useMemo(() => {
        const visibleOrders = filteredOrders
            .map((row) => orders.find((order) => order.id === row.id))
            .filter((order): order is Order => Boolean(order));

        return visibleOrders.reduce<PrintRoomStats>(
            (acc, order) => {
                const routingStatus = resolveRoomRoutingStatus(order, 'print');
                const orderPieces = getOrderPieceCount(order);

                if (!routingStatus) {
                    return acc;
                }

                if (routingStatus === 'pending') {
                    acc.new_job_orders += 1;
                    acc.new_job_pieces += orderPieces;
                } else if (routingStatus === 'in_progress') {
                    acc.printer_1_orders += 1;
                    acc.printer_1_pieces += orderPieces;
                } else if (routingStatus === 'rejected') {
                    acc.printer_2_orders += 1;
                    acc.printer_2_pieces += orderPieces;
                } else if (routingStatus === 'completed' || routingStatus === 'skipped') {
                    acc.completed_orders += 1;
                    acc.completed_pieces += orderPieces;
                }

                return acc;
            },
            {
                new_job_orders: 0,
                new_job_pieces: 0,
                printer_1_orders: 0,
                printer_1_pieces: 0,
                printer_2_orders: 0,
                printer_2_pieces: 0,
                printer_3_orders: 0,
                printer_3_pieces: 0,
                completed_orders: 0,
                completed_pieces: 0,
            },
        );
    }, [filteredOrders, orders]);

    const stageStats = useMemo<StageStats>(() => buildStageStats(orders, activeDepartment), [orders, activeDepartment]);

    const visibleStageStats = useMemo<StageStats>(() => {
        if (isScreenFlexView || activeDepartment === 'embroidery' || activeDepartment === 'cutting' || activeDepartment === 'sewing') {
            return buildVisibleStageStats(filteredOrders);
        }

        return buildVisibleStageStats(filteredOrders);
    }, [filteredOrders, isScreenFlexView, activeDepartment]);

    const branchOptions = useMemo(
        () => [{ value: 'all', label: 'ทุกสาขา' }, ...branches],
        [branches],
    );

    const selectedPrintStatusLabel = useMemo(() => {
        if (selectedPrintStatuses.length === printStatusFilterOptions.length) {
            return 'สถานะ: ทั้งหมด';
        }

        if (selectedPrintStatuses.length === defaultPrintStatusFilters.length
            && defaultPrintStatusFilters.every((value) => selectedPrintStatuses.includes(value))) {
            return 'สถานะ: งานเข้าใหม่ + เครื่อง 1-3';
        }

        return `สถานะ: ${selectedPrintStatuses.length} รายการ`;
    }, [selectedPrintStatuses]);

    const selectedRoutingStatusLabel = useMemo(() => {
        if (selectedRoutingStatuses.length === routingStatusFilterOptions.length) {
            return 'สถานะงาน: ทั้งหมด';
        }

        return `สถานะงาน: ${selectedRoutingStatuses.length} รายการ`;
    }, [selectedRoutingStatuses]);

    const togglePrintStatus = (value: PrintStatusFilter, checked: boolean) => {
        setSelectedPrintStatuses((prev) => {
            if (checked) {
                return prev.includes(value) ? prev : [...prev, value];
            }

            if (prev.length === 1) {
                return prev;
            }

            return prev.filter((item) => item !== value);
        });
    };

    const toggleRoutingStatus = (value: RoutingStatusFilter, checked: boolean) => {
        setSelectedRoutingStatuses((prev) => {
            if (checked) {
                return prev.includes(value) ? prev : [...prev, value];
            }

            if (prev.length === 1) {
                return prev;
            }

            return prev.filter((item) => item !== value);
        });
    };

    const heatPressActiveOrders = heatPressStats.screen_orders + heatPressStats.flex_orders;
    const heatPressActivePieces = heatPressStats.screen_pieces + heatPressStats.flex_pieces;

    const applyDateFilterInstantly = () => {
        setDateFilterOpen(null);
    };

    const formatDateFilterLabel = (value: string) => {
        if (!value) {
            return '';
        }

        const parsed = parseDateOnly(value);

        if (!parsed) {
            return '';
        }

        return new Intl.DateTimeFormat('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        }).format(parsed);
    };

    const incomingDateLabel = [incomingDateFrom, incomingDateTo].filter(Boolean).map(formatDateFilterLabel).filter(Boolean).join(' – ');
    const completedDateLabel = [completedDateFrom, completedDateTo].filter(Boolean).map(formatDateFilterLabel).filter(Boolean).join(' – ');

    const clearIncomingDateFilters = () => {
        setIncomingDateFrom('');
        setIncomingDateTo('');
        setDateFilterOpen(null);
    };

    const clearCompletedDateFilters = () => {
        setCompletedDateFrom('');
        setCompletedDateTo('');
        setDateFilterOpen(null);
    };

    const closeInspectionDialog = () => {
        setInspectionRow(null);
        setInspectionChecks({});
        setInspectionNote('');
    };

    const openInspectionDialog = (row: OrderTableRow) => {
        const checkpoints = row.timeline_checkpoints.filter((checkpoint) => checkpoint.station_name !== 'shipping');
        const fallbackCheckpointIds = row.inspection_signed_off && row.inspection_checkpoint_ids.length === 0
            ? checkpoints.map((checkpoint) => checkpoint.id)
            : row.inspection_checkpoint_ids;
        const nextChecks = checkpoints.reduce<Record<number, boolean>>((acc, checkpoint) => {
            acc[checkpoint.id] = row.inspection_signed_off
                ? fallbackCheckpointIds.includes(checkpoint.id)
                : false;

            return acc;
        }, {});

        setInspectionChecks(nextChecks);
        setInspectionNote(row.inspection_signed_off ? (row.inspection_note ?? '') : '');
        setInspectionRow(row);
    };

    const inspectionCheckpoints = (inspectionRow?.timeline_checkpoints ?? []).filter((checkpoint) => checkpoint.station_name !== 'shipping');
    const isInspectionReadOnly = Boolean(inspectionRow?.inspection_signed_off);
    const inspectionCompleted = inspectionCheckpoints.length > 0
        && inspectionCheckpoints.every((checkpoint) => Boolean(inspectionChecks[checkpoint.id]));
    const hasScreenNameColumn = (inspectionRow?.size_breakdown ?? []).some((item) => Boolean(item.screen_name));
    const submitInspectionSignOff = async () => {
        if (!inspectionRow) {
            return;
        }

        if (isInspectionReadOnly) {
            closeInspectionDialog();

            return;
        }

        if (!inspectionCompleted) {
            window.alert('กรุณาติ๊กตรวจสอบให้ครบทุกขั้นตอนก่อนลงชื่อ');

            return;
        }

        setIsSubmittingInspection(true);
        const trimmedRemark = inspectionNote.trim();
        const payload: { decision: 'pass'; remark?: string } = { decision: 'pass' };
        const checkedCheckpointIds = inspectionCheckpoints
            .filter((checkpoint) => Boolean(inspectionChecks[checkpoint.id]))
            .map((checkpoint) => checkpoint.id);

        const remarkPayload = {
            qc_checkpoints: checkedCheckpointIds,
            note: trimmedRemark,
        };

        if (checkedCheckpointIds.length > 0 || trimmedRemark) {
            payload.remark = JSON.stringify(remarkPayload);
        }

        router.post(`/orders/${inspectionRow.id}/qc`, payload, {
            preserveState: true,
            preserveScroll: true,
            onSuccess: () => {
                setOptimisticQcCompletedOrderIds((prev) => (prev.includes(inspectionRow.id) ? prev : [...prev, inspectionRow.id]));
                closeInspectionDialog();
                router.reload({
                    preserveScroll: true,
                    preserveState: true,
                });
            },
            onError: (errors) => {
                const firstError = resolveFirstInertiaError(errors);
                window.alert(firstError ?? 'ไม่สามารถลงชื่อตรวจสอบได้');
            },
            onFinish: () => {
                setIsSubmittingInspection(false);
            },
        });
    };

    const openDeliveryInfoDialog = (row: OrderTableRow) => {
        const savedForm = deliveryFormsByOrderId[row.id];

        setDeliveryInfoRow(row);
        setDeliveryForm(savedForm ?? emptyDeliveryFormState());
        setIsDeliveryEditing(!hasDeliveryInfo(savedForm));
    };

    const printDeliveryNote = () => {
        if (!deliveryInfoRow) {
            return;
        }

        const deliveryInfo = deliveryFormsByOrderId[deliveryInfoRow.id] ?? deliveryForm;
        const deliveryDate = deliveryInfoRow.shipping_completed_at
            ? formatTableDate(deliveryInfoRow.shipping_completed_at)
            : '-';
        const deliveryMethod = deliveryMethodLabel(deliveryInfoRow.delivery_method);
        const carrierDetails = [deliveryInfo.carrier_name, deliveryInfo.tracking_no]
            .filter((value) => value.trim() !== '')
            .join(' / ');
        const deliveryDetails = deliveryInfoRow.delivery_method === 'onsite'
            ? [deliveryInfo.onsite_sender_name, deliveryInfo.onsite_vehicle_plate]
                .filter((value) => value.trim() !== '')
                .join(' / ')
            : carrierDetails;
        const printWindow = window.open('', '_blank', 'width=900,height=1100');

        if (!printWindow) {
            return;
        }

        printWindow.document.open();
        printWindow.document.write(`
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>ใบส่งมอบสินค้า ${escapeHtml(deliveryInfoRow.order_code)}</title>
                    <style>
                        @page { size: A4 portrait; margin: 8mm; }
                        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        body { margin: 0; color: #172554; font-family: 'TH Sarabun New', 'Noto Sans Thai', Arial, sans-serif; font-size: 15px; }
                        .note { min-height: 270mm; border: 2px solid #486581; border-radius: 10px; padding: 8px; }
                        .header { display: grid; grid-template-columns: 1fr 235px; gap: 16px; align-items: start; }
                        .logo { width: 145px; height: auto; }
                        .tax-note { margin: 4px 0 0; color: #a04848; font-weight: 700; }
                        .document-title { border: 2px solid #486581; border-radius: 9px; padding: 7px 10px; text-align: center; font-size: 24px; font-weight: 700; }
                        .original { margin: 3px 0 0; color: #a04848; text-align: center; font-weight: 700; }
                        .top-grid { display: grid; grid-template-columns: 1fr 235px; gap: 16px; margin-top: 8px; }
                        .box { min-height: 116px; border: 2px solid #486581; border-radius: 18px; padding: 10px 14px; }
                        .customer-line { margin: 0 0 7px; font-size: 17px; }
                        .meta { display: grid; grid-template-columns: 1fr auto; gap: 5px 14px; margin: 0; font-size: 16px; }
                        .meta dt, .meta dd { margin: 0; }
                        .meta dd { text-align: right; font-weight: 700; }
                        table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 8px; border: 2px solid #486581; border-radius: 14px; overflow: hidden; }
                        th, td { border-right: 1px solid #486581; border-bottom: 1px solid #486581; padding: 6px 8px; vertical-align: top; }
                        th:last-child, td:last-child { border-right: 0; }
                        tbody tr:last-child td { border-bottom: 0; }
                        th { background: #f8fafc; text-align: center; font-weight: 700; }
                        .number, .quantity, .money { text-align: center; white-space: nowrap; }
                        .item-row td { height: 270px; }
                        .summary-label { text-align: right; font-weight: 700; }
                        .summary-value { text-align: right; font-weight: 700; }
                        .amount-words { padding: 10px; text-align: center; font-weight: 700; }
                        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
                        .signature { min-height: 120px; border: 2px solid #486581; border-radius: 14px; padding: 10px; }
                        .signature-line { margin: 60px 14px 0; border-bottom: 1px dotted #172554; }
                        .signature-date { margin-top: 8px; text-align: center; }
                        @media print { .note { min-height: 281mm; } }
                    </style>
                </head>
                <body>
                    <main class="note">
                        <header class="header">
                            <div>
                                <img class="logo" src="/images/logo/logo.png" alt="J.S. Sport" />
                                <p class="tax-note">ไม่ใช่ใบกำกับภาษี</p>
                            </div>
                            <div>
                                <div class="document-title">ใบส่งมอบสินค้า</div>
                                <p class="original">ต้นฉบับ</p>
                            </div>
                        </header>
                        <section class="top-grid">
                            <div class="box">
                                <p class="customer-line"><strong>ลูกค้า</strong> ${escapeHtml(deliveryInfoRow.customer_name || '-')}</p>
                                <p class="customer-line"><strong>ที่อยู่</strong> ${escapeHtml(deliveryInfoRow.shipping_address || '-')}</p>
                                <p class="customer-line"><strong>วิธีส่งมอบ</strong> ${escapeHtml(deliveryMethod)}</p>
                                <p class="customer-line"><strong>รายละเอียดขนส่ง</strong> ${escapeHtml(deliveryDetails || '-')}</p>
                            </div>
                            <div class="box">
                                <dl class="meta">
                                    <dt>เลขที่ออเดอร์</dt><dd>${escapeHtml(deliveryInfoRow.order_code)}</dd>
                                    <dt>วันที่ส่งมอบ</dt><dd>${escapeHtml(deliveryDate)}</dd>
                                    <dt>ชื่องาน</dt><dd>${escapeHtml(deliveryInfoRow.job_name || '-')}</dd>
                                </dl>
                            </div>
                        </section>
                        <table>
                            <thead>
                                <tr><th style="width:9%">ลำดับ</th><th>รายการ</th><th style="width:13%">จำนวน</th><th style="width:18%">จำนวนเงิน</th></tr>
                            </thead>
                            <tbody>
                                <tr class="item-row"><td class="number">1</td><td>${escapeHtml(deliveryInfoRow.job_type || '-')}: ${escapeHtml(deliveryInfoRow.job_name || '-')}</td><td class="quantity">${deliveryInfoRow.order_item_count.toLocaleString('th-TH')}</td><td class="money">${deliveryInfoRow.net_amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                                <tr><td colspan="2" class="amount-words">ได้รับสินค้าตามรายการข้างบนนี้ถูกต้องแล้ว</td><td class="summary-label">รวม</td><td class="summary-value">${deliveryInfoRow.net_amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                            </tbody>
                        </table>
                        <section class="signatures">
                            <div class="signature"><strong>ผู้รับสินค้า</strong><div class="signature-line"></div><div class="signature-date">วันที่ ................................</div></div>
                            <div class="signature"><strong>ผู้ส่งสินค้า</strong><div class="signature-line"></div><div class="signature-date">${escapeHtml(deliveryInfo.sender_signature || '-')}<br />วันที่ ${escapeHtml(deliveryDate)}</div></div>
                        </section>
                    </main>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        window.setTimeout(() => printWindow.print(), 250);
    };

    const saveDeliveryInfo = () => {
        if (!deliveryInfoRow) {
            return;
        }

        const normalizedForm: DeliveryFormState = {
            carrier_name: deliveryForm.carrier_name.trim(),
            tracking_no: deliveryForm.tracking_no.trim(),
            parcel_weight_kg: deliveryForm.parcel_weight_kg.trim(),
            parcel_shipping_cost: deliveryForm.parcel_shipping_cost.trim(),
            onsite_sender_name: deliveryForm.onsite_sender_name.trim(),
            onsite_vehicle_plate: deliveryForm.onsite_vehicle_plate.trim(),
            sender_signature: deliveryForm.sender_signature.trim(),
        };

        setIsSavingDeliveryInfo(true);

        router.post(`/orders/${deliveryInfoRow.id}/shipping-delivery-info`, normalizedForm, {
            preserveState: true,
            preserveScroll: true,
            onSuccess: () => {
                setDeliveryFormsByOrderId((prev) => ({
                    ...prev,
                    [deliveryInfoRow.id]: normalizedForm,
                }));
                setDeliveryForm(normalizedForm);
                setDeliveryInfoRow((prev) => (prev
                    ? {
                        ...prev,
                        shipping_delivery_info: normalizedForm,
                        shipping_sender_name: normalizedForm.sender_signature || '-',
                    }
                    : prev));
                setIsDeliveryEditing(false);
            },
            onError: (errors) => {
                const firstError = resolveFirstInertiaError(errors);
                window.alert(firstError ?? 'ไม่สามารถบันทึกข้อมูลจัดส่งได้');
            },
            onFinish: () => {
                setIsSavingDeliveryInfo(false);
            },
        });
    };

    const markShippingAsCompleted = async () => {
        if (!deliveryInfoRow || isCompletingShipping) {
            return;
        }

        const isStorePickup = deliveryInfoRow.delivery_method === 'pickup';
        const confirmMessage = isStorePickup
            ? `ยืนยันรับงานแล้วสำหรับออเดอร์ ${deliveryInfoRow.order_code} ?`
            : `ยืนยันส่งงานสำเร็จสำหรับออเดอร์ ${deliveryInfoRow.order_code} ?`;

        const shouldContinue = window.confirm(confirmMessage);

        if (!shouldContinue) {
            return;
        }

        setIsCompletingShipping(true);

        router.post(
            `/orders/${deliveryInfoRow.id}/routing/advance`,
            {
                station_name: 'shipping',
                new_status: 'completed',
                direct_complete: true,
                shipping_delivery_info: {
                    carrier_name: deliveryForm.carrier_name.trim(),
                    tracking_no: deliveryForm.tracking_no.trim(),
                    parcel_weight_kg: deliveryForm.parcel_weight_kg.trim(),
                    parcel_shipping_cost: deliveryForm.parcel_shipping_cost.trim(),
                    onsite_sender_name: deliveryForm.onsite_sender_name.trim(),
                    onsite_vehicle_plate: deliveryForm.onsite_vehicle_plate.trim(),
                    sender_signature: deliveryForm.sender_signature.trim(),
                },
            },
            {
                preserveState: true,
                preserveScroll: true,
                onSuccess: () => {
                    setDeliveryInfoRow(null);
                    setIsDeliveryEditing(false);
                    router.reload({
                        preserveScroll: true,
                        preserveState: true,
                    });
                },
                onError: (errors) => {
                    const firstError = resolveFirstInertiaError(errors);
                    window.alert(firstError ?? (isStorePickup ? 'ไม่สามารถเปลี่ยนสถานะเป็นรับงานแล้วได้' : 'ไม่สามารถเปลี่ยนสถานะส่งงานสำเร็จได้'));
                },
                onFinish: () => {
                    setIsCompletingShipping(false);
                },
            },
        );
    };

    const statsGridClass = 'grid w-full gap-2 md:grid-cols-2 xl:grid-cols-2';

    return (
        <section className="space-y-4">
            {/* Stats Cards */}
            {showStatsCards ? (
                <div className={statsGridClass}>
                    {isHeatPressView ? (
                        <>
                            <DepartmentCard
                                title="งานเข้าใหม่"
                                icon={<Clock3 className="size-5" />}
                                accent="blue"
                                darkSurface={true}
                                surfaceClass="bg-gradient-to-br from-[#E21E26] via-[#9A1E36] to-[#174395]"
                                glowClass="from-[rgba(225,30,38,0.45)]"
                                layerClass="bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.10),transparent_58%)]"
                                rows={[
                                    { label: 'จำนวนงาน', value: visibleHeatPressStats.new_job_orders, tone: 'red', kind: 'jobs' },
                                    { label: 'จำนวนตัว', value: visibleHeatPressStats.new_job_pieces, tone: 'red', kind: 'pieces' },
                                ]}
                            />
                            <DepartmentCard
                                title="เสร็จสิ้น"
                                icon={<CheckCircle2 className="size-5" />}
                                accent="green"
                                darkSurface={true}
                                surfaceClass="bg-gradient-to-br from-[#071A33] via-[#0A2344] to-[#0E2B52]"
                                glowClass="from-[rgba(255,255,255,0.18)]"
                                layerClass="bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.10),transparent_58%)]"
                                rows={[
                                    { label: 'จำนวนงาน', value: visibleHeatPressStats.completed_orders, tone: 'red', kind: 'jobs' },
                                    { label: 'จำนวนตัว', value: visibleHeatPressStats.completed_pieces, tone: 'red', kind: 'pieces' },
                                ]}
                            />
                        </>
                    ) : isStageView ? (
                        <>
                            <DepartmentCard
                                title="งานเข้าใหม่"
                                icon={<Clock3 className="size-5" />}
                                accent="blue"
                                darkSurface={true}
                                surfaceClass="bg-gradient-to-br from-[#E21E26] via-[#9A1E36] to-[#174395]"
                                glowClass="from-[rgba(225,30,38,0.45)]"
                                layerClass="bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.10),transparent_58%)]"
                                rows={[
                                    { label: 'จำนวนงาน', value: visibleStageStats.new_job_orders, tone: 'red', kind: 'jobs' },
                                    { label: 'จำนวนตัว', value: visibleStageStats.new_job_pieces, tone: 'red', kind: 'pieces' },
                                ]}
                            />
                            <DepartmentCard
                                title="เสร็จสิ้น"
                                icon={<CheckCircle2 className="size-5" />}
                                accent="green"
                                darkSurface={true}
                                surfaceClass="bg-gradient-to-br from-[#071A33] via-[#0A2344] to-[#0E2B52]"
                                glowClass="from-[rgba(255,255,255,0.18)]"
                                layerClass="bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.10),transparent_58%)]"
                                rows={[
                                    { label: 'จำนวนงาน', value: visibleStageStats.completed_orders, tone: 'neutral', kind: 'jobs' },
                                    { label: 'จำนวนตัว', value: visibleStageStats.completed_pieces, tone: 'neutral', kind: 'pieces' },
                                ]}
                            />
                        </>
                    ) : (
                        <>
                            <DepartmentCard
                                title="งานเข้าใหม่"
                                icon={<Clock3 className="size-5" />}
                                accent="blue"
                                darkSurface={true}
                                surfaceClass="bg-gradient-to-br from-[#E21E26] via-[#9A1E36] to-[#174395]"
                                glowClass="from-[rgba(225,30,38,0.45)]"
                                layerClass="bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.10),transparent_58%)]"
                                rows={[
                                    { label: 'จำนวนงาน', value: visiblePrintRoomStats.new_job_orders, tone: 'red', kind: 'jobs' },
                                    { label: 'จำนวนตัว', value: visiblePrintRoomStats.new_job_pieces, tone: 'red', kind: 'pieces' },
                                ]}
                            />
                            <DepartmentCard
                                title="เสร็จสิ้น"
                                icon={<CheckCircle2 className="size-5" />}
                                accent="green"
                                darkSurface={true}
                                surfaceClass="bg-gradient-to-br from-[#071A33] via-[#0A2344] to-[#0E2B52]"
                                glowClass="from-[rgba(255,255,255,0.18)]"
                                layerClass="bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.10),transparent_58%)]"
                                rows={[
                                    { label: 'จำนวนงาน', value: visiblePrintRoomStats.completed_orders, tone: 'neutral', kind: 'jobs' },
                                    { label: 'จำนวนตัว', value: visiblePrintRoomStats.completed_pieces, tone: 'neutral', kind: 'pieces' },
                                ]}
                            />
                        </>
                    )}
                </div>
            ) : null}

            {/* Filters */}
            <div className="flex flex-col gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.05)] md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:flex-wrap">
                    <div className="relative w-full md:w-[240px]">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-[#94A3B8]" />
                        <Input
                            placeholder="ค้นหา เลขที่ออเดอร์, ชื่อลูกค้า..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <Select value={branchId} onValueChange={setBranchId}>
                        <SelectTrigger className="w-full border-[#E2E8F0] bg-white md:w-[200px]">
                            <SelectValue placeholder="เลือกสาขา" />
                        </SelectTrigger>
                        <SelectContent>
                            {branchOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {showDepartmentFilter ? (
                        <Select value={department} onValueChange={(value) => setDepartment(value as DepartmentFilter)}>
                            <SelectTrigger className="w-full border-[#E2E8F0] bg-white md:w-[220px]">
                                <SelectValue placeholder="เลือกห้อง" />
                            </SelectTrigger>
                            <SelectContent>
                                {departmentOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex items-center">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 border-[#E2E8F0] bg-white px-3 text-sm text-[#334155]"
                                onClick={() => setDateFilterOpen((current) => current === 'incoming' ? null : 'incoming')}
                            >
                                <Calendar className="mr-2 size-4" />
                                <span className="truncate">{incomingDateLabel ? `${incomingDateLabel}` : 'วันที่งานเข้ามา'}</span>
                            </Button>
                            {dateFilterOpen === 'incoming' ? (
                                <div className="absolute left-0 top-full z-20 mt-2 w-[300px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-[#0F172A]">ช่วงวันที่งานเข้ามา</p>
                                            {(incomingDateFrom || incomingDateTo) ? (
                                                <button
                                                    type="button"
                                                    className="text-xs font-medium text-[#64748B] underline-offset-2 hover:text-[#0F172A] hover:underline"
                                                    onClick={clearIncomingDateFilters}
                                                >
                                                    ล้าง
                                                </button>
                                            ) : null}
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <label className="flex flex-col gap-1 text-[11px] font-medium text-[#475569]">
                                                <span>จาก</span>
                                                <Input aria-label="วันที่งานเข้ามา จาก" type="date" value={incomingDateFrom} onChange={(e) => {
                                                    setIncomingDateFrom(e.target.value);
                                                    applyDateFilterInstantly();
                                                }} className="h-8 border-[#E2E8F0] bg-white" />
                                            </label>
                                            <label className="flex flex-col gap-1 text-[11px] font-medium text-[#475569]">
                                                <span>ถึง</span>
                                                <Input aria-label="วันที่งานเข้ามา ถึง" type="date" value={incomingDateTo} onChange={(e) => {
                                                    setIncomingDateTo(e.target.value);
                                                    applyDateFilterInstantly();
                                                }} className="h-8 border-[#E2E8F0] bg-white" />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        <div className="relative">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 border-[#E2E8F0] bg-white px-3 text-sm text-[#334155]"
                                onClick={() => setDateFilterOpen((current) => current === 'completed' ? null : 'completed')}
                            >
                                <Calendar className="mr-2 size-4" />
                                <span className="truncate">{completedDateLabel ? `${completedDateLabel}` : 'วันที่เสร็จสิ้น'}</span>
                            </Button>
                            {dateFilterOpen === 'completed' ? (
                                <div className="absolute left-0 top-full z-20 mt-2 w-[300px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-[#0F172A]">ช่วงวันที่เสร็จสิ้น</p>
                                            {(completedDateFrom || completedDateTo) ? (
                                                <button
                                                    type="button"
                                                    className="text-xs font-medium text-[#64748B] underline-offset-2 hover:text-[#0F172A] hover:underline"
                                                    onClick={clearCompletedDateFilters}
                                                >
                                                    ล้าง
                                                </button>
                                            ) : null}
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <label className="flex flex-col gap-1 text-[11px] font-medium text-[#475569]">
                                                <span>จาก</span>
                                                <Input aria-label="วันที่เสร็จสิ้น จาก" type="date" value={completedDateFrom} onChange={(e) => {
                                                    setCompletedDateFrom(e.target.value);
                                                    applyDateFilterInstantly();
                                                }} className="h-8 border-[#E2E8F0] bg-white" />
                                            </label>
                                            <label className="flex flex-col gap-1 text-[11px] font-medium text-[#475569]">
                                                <span>ถึง</span>
                                                <Input aria-label="วันที่เสร็จสิ้น ถึง" type="date" value={completedDateTo} onChange={(e) => {
                                                    setCompletedDateTo(e.target.value);
                                                    applyDateFilterInstantly();
                                                }} className="h-8 border-[#E2E8F0] bg-white" />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    {showPrinterFilter ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button type="button" variant="outline" className="w-full justify-between border-[#E2E8F0] bg-white md:w-[240px]">
                                    <span className="truncate">{selectedPrintStatusLabel}</span>
                                    <span className="ml-2 text-xs text-[#64748B]">{selectedPrintStatuses.length}</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-60">
                                {printStatusFilterOptions.map((option) => (
                                    <DropdownMenuCheckboxItem
                                        key={option.value}
                                        checked={selectedPrintStatuses.includes(option.value)}
                                        onCheckedChange={(checked) => togglePrintStatus(option.value, checked === true)}
                                    >
                                        {option.label}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                    {showRoutingStatusFilter ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button type="button" variant="outline" className="w-full justify-between border-[#E2E8F0] bg-white md:w-[240px]">
                                    <span className="truncate">{selectedRoutingStatusLabel}</span>
                                    <span className="ml-2 text-xs text-[#64748B]">{selectedRoutingStatuses.length}</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-60">
                                {routingStatusFilterOptions.map((option) => (
                                    <DropdownMenuCheckboxItem
                                        key={option.value}
                                        checked={selectedRoutingStatuses.includes(option.value)}
                                        onCheckedChange={(checked) => toggleRoutingStatus(option.value, checked === true)}
                                    >
                                        {option.label}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </div>

                {showDepartmentFilter && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setSearch('');
                            setBranchId('all');
                            setSelectedPrintStatuses(defaultPrintStatusFilters);
                            setSelectedRoutingStatuses(defaultRoutingStatusFilters);
                            setIncomingDateFrom('');
                            setIncomingDateTo('');
                            setCompletedDateFrom('');
                            setCompletedDateTo('');
                        }}
                    >
                        <X className="size-3.5" />
                        รีเซ็ต
                    </Button>
                )}
            </div>

            {/* Table */}
            <HeatPressVirtualizedGrid
                key={`${activeDepartment}-${hideBillingColumns ? 'billing-hidden' : 'billing-visible'}`}
                rows={filteredOrders}
                onOpenDetail={(row) => onOpenDetail?.(row)}
                onOpenTimeline={onOpenTimeline}
                onOpenInspection={openInspectionDialog}
                onOpenDeliveryInfo={openDeliveryInfoDialog}
                hideBillingColumns={hideBillingColumns}
                isHeatPressView={isHeatPressView}
                isEmbroideryView={isEmbroideryView}
                isCuttingView={isCuttingView}
                isSewingView={isSewingView}
                isScreenFlexView={isScreenFlexView}
                isQcView={isQcView}
                isShippingView={isShippingView}
            />

            <Dialog open={inspectionRow !== null} onOpenChange={(open) => {
                if (!open) {
                    closeInspectionDialog();
                }
            }}>
                <DialogContent className="w-[96vw] sm:max-w-5xl max-h-[88vh] overflow-y-auto p-0">
                    <DialogHeader className="sticky top-0 z-20 border-b border-[#E2E8F0] bg-white px-6 py-4">
                        <DialogTitle className="flex items-center gap-2 text-[#0F172A]">
                            <span
                                className={`inline-flex h-7 items-center rounded-md px-2 text-xs font-semibold ${inspectionCompleted
                                    ? 'bg-[#ECFDF5] text-[#166534]'
                                    : 'bg-[#FEFCE8] text-[#92400E]'}`}
                            >
                                สถานะ: {inspectionCompleted ? 'เสร็จสิ้นแล้ว' : 'รอตรวจสอบ'}
                            </span>
                            ตรวจสอบไทม์ไลน์ {inspectionRow?.order_code}
                        </DialogTitle>
                        <DialogDescription>
                            เช็กงานแต่ละห้องก่อนส่งต่อขั้นตอนถัดไป
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 px-6 py-4">

                    <div className="grid gap-3 rounded-xl border border-[#E2E8F0] bg-gradient-to-r from-[#FFF7ED] via-white to-[#F8FAFC] p-3">
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-[#64748B]">ข้อมูลออร์เดอร์</p>
                            <p className="text-sm font-semibold text-[#0F172A]">{inspectionRow?.customer_name || '-'}</p>
                            <p className="text-xs text-[#64748B]">{inspectionRow?.job_name || '-'}</p>
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[#475569]">
                                <span className="rounded-md bg-white px-2 py-1">สาขา: {inspectionRow?.branch_name || '-'}</span>
                                <span className="rounded-md bg-white px-2 py-1">จำนวน: {inspectionRow?.order_item_count ?? 0} ตัว</span>
                                <span className="rounded-md bg-white px-2 py-1">ประเภทงาน: {inspectionRow?.job_type || '-'}</span>
                                <span className="rounded-md bg-white px-2 py-1">วันที่เปิดบิล: {formatTableDateTime(inspectionRow?.billing_date || '')}</span>
                                <span className="rounded-md bg-white px-2 py-1">วันที่รับงาน: {formatTableDateTime(inspectionRow?.due_date || '')}</span>
                                <span className="rounded-md bg-white px-2 py-1">การจัดส่ง: {deliveryMethodLabel(inspectionRow?.delivery_method)}</span>
                            </div>
                            {(inspectionRow?.delivery_method === 'shipping' || inspectionRow?.delivery_method === 'onsite') ? (
                                <p className="pt-1 text-xs text-[#475569]">โน้ตการจัดส่ง/หน้างาน: <span className="font-medium text-[#0F172A]">{inspectionRow.shipping_address || '-'}</span></p>
                            ) : null}
                        </div>
                    </div>

                    {isInspectionReadOnly ? (
                        <div className="grid gap-2 rounded-xl border border-[#BBF7D0] bg-[#ECFDF5] p-3 sm:grid-cols-2">
                            <p className="text-xs text-[#166534]">ผู้ตรวจสอบ: <span className="font-semibold">{inspectionRow?.inspection_inspector_name || '-'}</span></p>
                            <p className="text-xs text-[#166534]">วันที่เวลา: <span className="font-semibold">{formatDateTime(inspectionRow?.inspection_signed_at)}</span></p>
                        </div>
                    ) : null}

                    <div className="grid gap-3">
                        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-3">
                            <h4 className="mb-2 text-xs font-semibold tracking-wide text-[#64748B]">รายละเอียดไซต์เสื้อ</h4>
                            {inspectionRow && inspectionRow.size_breakdown.length > 0 ? (
                                <div className="max-h-[28vh] md:max-h-[46vh] overflow-auto rounded-lg border border-[#E2E8F0]">
                                    <table className="min-w-[520px] w-full text-xs">
                                        <thead className="sticky top-0 z-10 bg-[#F8FAFC] text-[#64748B]">
                                            <tr>
                                                {hasScreenNameColumn ? <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">ชื่อที่สกรีน</th> : null}
                                                <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">กลุ่ม</th>
                                                <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">ไซส์</th>
                                                <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium">จำนวน</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inspectionRow.size_breakdown.map((item) => (
                                                <tr key={`${item.size_group}-${item.size_label}-${item.screen_name ?? ''}`} className="border-t border-[#E2E8F0] text-[#334155]">
                                                    {hasScreenNameColumn ? <td className="whitespace-nowrap px-2 py-1.5">{item.screen_name || '-'}</td> : null}
                                                    <td className="whitespace-nowrap px-2 py-1.5">{sizeGroupLabel(item.size_group)}</td>
                                                    <td className="whitespace-nowrap px-2 py-1.5">{item.size_label || '-'}</td>
                                                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold text-[#0F172A]">{item.quantity}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-xs text-[#64748B]">
                                    ไม่มีข้อมูลไซต์เสื้อ
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="max-h-[36vh] space-y-2 overflow-y-auto pr-1">
                        {inspectionCheckpoints.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-6 text-center text-sm text-[#64748B]">
                                ไม่พบขั้นตอนไทม์ไลน์สำหรับการตรวจสอบ
                            </div>
                        ) : inspectionCheckpoints.map((checkpoint) => (
                            <label key={checkpoint.id} className="flex items-start gap-3 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2">
                                <Checkbox
                                    checked={Boolean(inspectionChecks[checkpoint.id])}
                                    onCheckedChange={(checked) => {
                                        setInspectionChecks((prev) => ({
                                            ...prev,
                                            [checkpoint.id]: checked === true,
                                        }));
                                    }}
                                    className="mt-0.5"
                                    disabled={isInspectionReadOnly}
                                />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-[#0F172A]">{checkpoint.station_label}</p>
                                    <p className="text-xs text-[#64748B]">สถานะระบบ: {getRoutingStatusLabel(checkpoint.status)}</p>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div className="space-y-1">
                        <label htmlFor="inspection-note" className="text-xs font-medium text-[#475569]">หมายเหตุ</label>
                        <textarea
                            id="inspection-note"
                            value={inspectionNote}
                            onChange={(event) => setInspectionNote(event.target.value)}
                            placeholder="บันทึกข้อสังเกตหรือจุดที่ต้องแก้ไขก่อนส่งต่อ..."
                            rows={3}
                            className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition-colors focus:border-[#E21E26]/40 focus:ring-2 focus:ring-[#E21E26]/15"
                            readOnly={isInspectionReadOnly}
                        />
                    </div>

                    </div>

                    <div className="sticky bottom-0 z-20 flex items-center justify-end gap-2 border-t border-[#E2E8F0] bg-white px-6 py-3">
                        <Button type="button" variant="outline" className="border-[#CBD5E1] text-[#334155]" onClick={closeInspectionDialog} disabled={isSubmittingInspection}>
                            {isInspectionReadOnly ? 'ปิด' : 'ยกเลิก'}
                        </Button>
                        {isInspectionReadOnly ? null : (
                            <Button
                                type="button"
                                className="bg-[#E21E26] text-white hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void submitInspectionSignOff()}
                                disabled={!inspectionCompleted || isSubmittingInspection}
                                title={!inspectionCompleted ? 'กรุณาติ๊กตรวจสอบให้ครบทุกขั้นตอน' : undefined}
                            >
                                {isSubmittingInspection ? 'กำลังบันทึก...' : 'ลงชื่อตรวจสอบ'}
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={deliveryInfoRow !== null} onOpenChange={(open) => {
                if (!open) {
                    setDeliveryInfoRow(null);
                    setIsDeliveryEditing(false);
                }
            }}>
                <DialogContent className="sm:max-w-lg [&>button]:hidden">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between gap-2">
                            <span>รายละเอียดการจัดส่ง {deliveryInfoRow?.order_code}</span>
                            {deliveryInfoRow && hasDeliveryInfo(deliveryFormsByOrderId[deliveryInfoRow.id]) && !isDeliveryEditing ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => setIsDeliveryEditing(true)}
                                >
                                    <Pencil className="size-3.5" />
                                    แก้ไข
                                </Button>
                            ) : null}
                        </DialogTitle>
                        <DialogDescription>
                            ตรวจสอบข้อมูลการจัดส่งของออร์เดอร์นี้
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                        <p className="text-sm text-[#334155]">ประเภทการจัดส่ง: <span className="font-semibold text-[#0F172A]">{deliveryMethodLabel(deliveryInfoRow?.delivery_method)}</span></p>
                        <p className="text-sm text-[#334155]">ชื่อลูกค้า: <span className="font-semibold text-[#0F172A]">{deliveryInfoRow?.customer_name || '-'}</span></p>
                        <p className="text-sm text-[#334155]">ชื่องาน: <span className="font-semibold text-[#0F172A]">{deliveryInfoRow?.job_name || '-'}</span></p>
                        <p className="text-sm text-[#334155]">โน้ตการจัดส่ง/หน้างาน: <span className="font-semibold text-[#0F172A]">{deliveryInfoRow?.shipping_address || '-'}</span></p>
                        <p className="text-sm text-[#334155]">วันที่รับงาน: <span className="font-semibold text-[#0F172A]">{formatTableDateTime(deliveryInfoRow?.due_date || '')}</span></p>
                    </div>

                    {deliveryInfoRow?.delivery_method === 'shipping' ? (
                        <div className="grid gap-3 rounded-lg border border-[#E2E8F0] bg-white p-3 md:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-xs font-medium text-[#475569]">ชื่อขนส่ง</span>
                                <Input
                                    value={deliveryForm.carrier_name}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, carrier_name: event.target.value }))}
                                    placeholder="เช่น Kerry, Flash, J&T"
                                    readOnly={!isDeliveryEditing}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-xs font-medium text-[#475569]">เลขที่พัสดุ</span>
                                <Input
                                    value={deliveryForm.tracking_no}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, tracking_no: event.target.value }))}
                                    placeholder="กรอกเลข Tracking"
                                    readOnly={!isDeliveryEditing}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-xs font-medium text-[#475569]">กิโล</span>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={deliveryForm.parcel_weight_kg}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, parcel_weight_kg: event.target.value }))}
                                    placeholder="0.00"
                                    readOnly={!isDeliveryEditing}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-xs font-medium text-[#475569]">ราคาส่งพัสดุ</span>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={deliveryForm.parcel_shipping_cost}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, parcel_shipping_cost: event.target.value }))}
                                    placeholder="0.00"
                                    readOnly={!isDeliveryEditing}
                                />
                            </label>
                        </div>
                    ) : null}

                    {deliveryInfoRow?.delivery_method === 'onsite' ? (
                        <div className="grid gap-3 rounded-lg border border-[#E2E8F0] bg-white p-3 md:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-xs font-medium text-[#475569]">ผู้จัดส่ง</span>
                                <Input
                                    value={deliveryForm.onsite_sender_name}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, onsite_sender_name: event.target.value }))}
                                    placeholder="ชื่อผู้จัดส่ง"
                                    readOnly={!isDeliveryEditing}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-xs font-medium text-[#475569]">ทะเบียนรถจัดส่ง</span>
                                <Input
                                    value={deliveryForm.onsite_vehicle_plate}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, onsite_vehicle_plate: event.target.value }))}
                                    placeholder="เช่น 1กข-1234"
                                    readOnly={!isDeliveryEditing}
                                />
                            </label>
                        </div>
                    ) : null}

                    <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
                        <label className="space-y-1">
                            <span className="text-xs font-medium text-[#475569]">ลงชื่อผู้ส่ง</span>
                            <Input
                                value={deliveryForm.sender_signature}
                                onChange={(event) => setDeliveryForm((prev) => ({ ...prev, sender_signature: event.target.value }))}
                                placeholder="ชื่อผู้ส่ง / ลายเซ็นผู้ส่ง"
                                readOnly={!isDeliveryEditing}
                            />
                        </label>
                    </div>

                    <div className="flex justify-end">
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                className="bg-[#166534] text-white hover:bg-[#14532D] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void markShippingAsCompleted()}
                                disabled={deliveryInfoRow?.action_status_label === 'ส่งสำเร็จ' || deliveryInfoRow?.action_status_label === 'ปิดงาน' || isCompletingShipping}
                            >
                                {(deliveryInfoRow?.action_status_label === 'ส่งสำเร็จ' || deliveryInfoRow?.action_status_label === 'ปิดงาน')
                                    ? (deliveryInfoRow?.delivery_method === 'pickup' ? 'รับงานแล้ว' : 'ส่งงานสำเร็จแล้ว')
                                    : isCompletingShipping
                                        ? 'กำลังบันทึก...'
                                        : (deliveryInfoRow?.delivery_method === 'pickup' ? 'รับงานแล้ว' : 'ส่งงานสำเร็จ')}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setDeliveryInfoRow(null)}>
                                {isDeliveryEditing ? 'ยกเลิก' : 'ปิด'}
                            </Button>
                            {isDeliveryEditing ? (
                                <Button
                                    type="button"
                                    className="bg-[#E21E26] text-white hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => void saveDeliveryInfo()}
                                    disabled={isSavingDeliveryInfo}
                                >
                                    {isSavingDeliveryInfo ? 'กำลังบันทึก...' : 'บันทึก'}
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    );
}
