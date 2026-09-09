import { router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Package, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export type DeliveryCalendarOrder = {
    id: number;
    order_code: string;
    customer_name: string;
    branch_name: string;
    job_name: string | null;
    job_type: string | null;
    delivery_method: string | null;
    delivery_label: string;
    order_status: string | null;
    status_label: string;
    is_closed: boolean;
    quantity: number;
};

export type DeliveryCalendarDay = {
    count: number;
    quantity: number;
    orders: DeliveryCalendarOrder[];
};

export type DeliveryCalendar = {
    month: string;
    today: string;
    days: Record<string, DeliveryCalendarDay>;
};

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const THAI_MONTHS = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
];

/** Local date key, never via toISOString() which would shift by the UTC offset. */
export function dateKey(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
    const [year, monthIndex] = month.split('-').map(Number);
    const shifted = new Date(year, monthIndex - 1 + delta, 1);

    return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
    const [year, monthIndex] = month.split('-').map(Number);

    // Thai calendar years run 543 ahead, the same as every other date on the sheet.
    return `${THAI_MONTHS[monthIndex - 1] ?? month} ${year + 543}`;
}

/**
 * Lays a month out as weeks of date keys, padding to whole weeks with nulls so
 * the grid keeps seven columns.
 */
export function buildMonthGrid(month: string): Array<Array<string | null>> {
    const [year, monthIndex] = month.split('-').map(Number);
    const first = new Date(year, monthIndex - 1, 1);
    const daysInMonth = new Date(year, monthIndex, 0).getDate();

    const cells: Array<string | null> = Array.from(
        { length: first.getDay() },
        () => null,
    );

    for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push(dateKey(year, monthIndex - 1, day));
    }

    while (cells.length % 7 !== 0) {
        cells.push(null);
    }

    return Array.from({ length: cells.length / 7 }, (_, week) =>
        cells.slice(week * 7, week * 7 + 7),
    );
}

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    calendar: DeliveryCalendar;
    showBranch: boolean;
};

export default function DeliveryCalendarDialog({
    open,
    onOpenChange,
    calendar,
    showBranch,
}: Props) {
    const [pickedDate, setPickedDate] = useState<string | null>(null);
    const [requestedMonth, setRequestedMonth] = useState<string | null>(null);
    const [openedForMonth, setOpenedForMonth] = useState<string | null>(null);

    // Derived rather than synced through an effect: the month is still loading
    // for exactly as long as the server has not sent the one that was asked for.
    const isLoadingMonth =
        requestedMonth !== null && requestedMonth !== calendar.month;

    // Opening the dialog, or moving to another month, starts on today when today
    // is in view. Computing it during render avoids a second pass just to move
    // the highlight.
    const monthKey = `${open ? 'open' : 'closed'}:${calendar.month}`;
    let selected = pickedDate;

    if (openedForMonth !== monthKey) {
        selected =
            open && calendar.days[calendar.today] ? calendar.today : null;
        setOpenedForMonth(monthKey);
        setPickedDate(selected);
    }

    const setSelected = setPickedDate;

    const weeks = useMemo(
        () => buildMonthGrid(calendar.month),
        [calendar.month],
    );

    const monthTotals = useMemo(
        () =>
            Object.values(calendar.days).reduce(
                (acc, day) => ({
                    count: acc.count + day.count,
                    quantity: acc.quantity + day.quantity,
                }),
                { count: 0, quantity: 0 },
            ),
        [calendar.days],
    );

    const goToMonth = (month: string) => {
        setRequestedMonth(month);
        setSelected(null);
        router.get(
            '/counter',
            { calendar_month: month },
            {
                only: ['deliveryCalendar'],
                preserveState: true,
                preserveScroll: true,
                replace: true,
            },
        );
    };

    const selectedDay =
        selected === null ? null : (calendar.days[selected] ?? null);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[980px]">
                <DialogHeader className="border-b border-slate-100 px-5 py-4">
                    <DialogTitle className="text-base font-semibold text-slate-900">
                        ปฏิทินกำหนดส่ง
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        {showBranch ? 'ทุกสาขา' : 'เฉพาะสาขาของคุณ'} · เดือนนี้{' '}
                        {monthTotals.count} งาน
                        {monthTotals.quantity > 0
                            ? ` (${monthTotals.quantity.toLocaleString('th-TH')} ตัว)`
                            : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-between gap-3 px-5 py-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        aria-label="เดือนก่อนหน้า"
                        onClick={() =>
                            goToMonth(shiftMonth(calendar.month, -1))
                        }
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <div className="text-sm font-semibold text-slate-900">
                        {monthLabel(calendar.month)}
                        {isLoadingMonth ? (
                            <span className="ml-2 text-xs font-normal text-slate-400">
                                กำลังโหลด...
                            </span>
                        ) : null}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        aria-label="เดือนถัดไป"
                        onClick={() => goToMonth(shiftMonth(calendar.month, 1))}
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                </div>

                <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div>
                        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">
                            {WEEKDAYS.map((weekday) => (
                                <div key={weekday} className="py-1">
                                    {weekday}
                                </div>
                            ))}
                        </div>

                        <div className="mt-1 grid grid-cols-7 gap-1">
                            {weeks.flat().map((key, index) => {
                                if (key === null) {
                                    return (
                                        <div
                                            key={`pad-${index}`}
                                            className="min-h-[62px] rounded-md bg-slate-50/60"
                                        />
                                    );
                                }

                                const day = calendar.days[key];
                                const isToday = key === calendar.today;
                                const isSelected = key === selected;
                                const dayNumber = Number(key.slice(-2));

                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() =>
                                            setSelected(day ? key : null)
                                        }
                                        aria-label={`วันที่ ${dayNumber}${day ? ` มี ${day.count} งาน` : ' ไม่มีงาน'}`}
                                        aria-pressed={isSelected}
                                        className={[
                                            'min-h-[62px] rounded-md border p-1.5 text-left transition-colors',
                                            day
                                                ? 'cursor-pointer'
                                                : 'cursor-default',
                                            isSelected
                                                ? 'border-[#E21E26] bg-[#E21E26]/5 ring-1 ring-[#E21E26]/30'
                                                : isToday
                                                  ? 'border-[#174395] bg-[#174395]/5'
                                                  : 'border-slate-200 bg-white hover:border-slate-300',
                                        ].join(' ')}
                                    >
                                        <div
                                            className={[
                                                'text-xs font-semibold',
                                                isToday
                                                    ? 'text-[#174395]'
                                                    : 'text-slate-700',
                                            ].join(' ')}
                                        >
                                            {dayNumber}
                                        </div>
                                        {day ? (
                                            <div className="mt-1 space-y-0.5">
                                                <div className="inline-flex items-center rounded bg-[#E21E26] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                    {day.count} งาน
                                                </div>
                                                <div className="text-[10px] text-slate-500">
                                                    {day.quantity.toLocaleString(
                                                        'th-TH',
                                                    )}{' '}
                                                    ตัว
                                                </div>
                                            </div>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                        {selectedDay === null ? (
                            <p className="py-8 text-center text-xs text-slate-400">
                                เลือกวันที่มีงานเพื่อดูรายละเอียด
                            </p>
                        ) : (
                            <>
                                <div className="mb-2 flex items-baseline justify-between gap-2">
                                    <span className="text-xs font-semibold text-slate-900">
                                        {Number(selected?.slice(-2))}{' '}
                                        {monthLabel(calendar.month)}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                        {selectedDay.count} งาน ·{' '}
                                        {selectedDay.quantity.toLocaleString(
                                            'th-TH',
                                        )}{' '}
                                        ตัว
                                    </span>
                                </div>

                                <ul className="max-h-[420px] space-y-2 overflow-y-auto">
                                    {selectedDay.orders.map((order) => (
                                        <li
                                            key={order.id}
                                            className="rounded-md border border-slate-200 bg-white p-2"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <span className="text-xs font-bold text-slate-900">
                                                    {order.order_code}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className={[
                                                        'shrink-0 text-[10px]',
                                                        order.is_closed
                                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                            : 'border-amber-200 bg-amber-50 text-amber-700',
                                                    ].join(' ')}
                                                >
                                                    {order.status_label}
                                                </Badge>
                                            </div>
                                            <div className="mt-0.5 truncate text-[11px] font-medium text-slate-700">
                                                {order.job_name || '-'}
                                            </div>
                                            <div className="truncate text-[11px] text-slate-500">
                                                {order.customer_name}
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                                                <span className="inline-flex items-center gap-1">
                                                    <Truck className="size-3" />
                                                    {order.delivery_label}
                                                </span>
                                                <span className="inline-flex items-center gap-1">
                                                    <Package className="size-3" />
                                                    {order.quantity.toLocaleString(
                                                        'th-TH',
                                                    )}{' '}
                                                    ตัว
                                                </span>
                                                {showBranch ? (
                                                    <span>
                                                        {order.branch_name}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
