import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export type DeliveryDateLoad = {
    date: string;
    total_quantity: number;
};

type Props = {
    value: string;
    minDate: string;
    dailyCapacity: number;
    loads: DeliveryDateLoad[];
    onChange: (date: string) => void;
};

function dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function dateFromKey(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);

    return new Date(year || 0, (month || 1) - 1, day || 1);
}

function monthLabel(date: Date): string {
    return new Intl.DateTimeFormat('th-TH', {
        month: 'long',
        year: 'numeric',
    }).format(date);
}

export function DeliveryDatePicker({
    value,
    minDate,
    dailyCapacity,
    loads,
    onChange,
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [month, setMonth] = useState(() => {
        const reference = value || minDate;
        const date = reference ? dateFromKey(reference) : new Date();

        return new Date(date.getFullYear(), date.getMonth(), 1);
    });

    const loadsByDate = useMemo(
        () => new Map(loads.map((load) => [load.date, load.total_quantity])),
        [loads],
    );
    const firstWeekday = new Date(
        month.getFullYear(),
        month.getMonth(),
        1,
    ).getDay();
    const daysInMonth = new Date(
        month.getFullYear(),
        month.getMonth() + 1,
        0,
    ).getDate();
    const cells = Array.from(
        { length: firstWeekday + daysInMonth },
        (_, index) => index - firstWeekday + 1,
    );

    return (
        <>
            <Button
                type="button"
                variant="outline"
                className="h-9 w-full justify-start text-xs font-normal"
                onClick={() => setIsOpen(true)}
            >
                <CalendarDays className="size-3.5 text-blue-500" />
                {value || 'เลือกวันที่รับสินค้า'}
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>เลือกวันที่รับสินค้า</DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center justify-between">
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                                setMonth(
                                    new Date(
                                        month.getFullYear(),
                                        month.getMonth() - 1,
                                        1,
                                    ),
                                )
                            }
                            title="เดือนก่อนหน้า"
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <span className="text-sm font-semibold text-slate-800">
                            {monthLabel(month)}
                        </span>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                                setMonth(
                                    new Date(
                                        month.getFullYear(),
                                        month.getMonth() + 1,
                                        1,
                                    ),
                                )
                            }
                            title="เดือนถัดไป"
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">
                        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((day) => (
                            <span key={day}>{day}</span>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {cells.map((day, index) => {
                            if (day < 1) {
                                return <span key={`blank-${index}`} />;
                            }

                            const date = new Date(
                                month.getFullYear(),
                                month.getMonth(),
                                day,
                            );
                            const key = dateKey(date);
                            const load = loadsByDate.get(key) ?? 0;
                            const isFull = load >= dailyCapacity;
                            const isDisabled = key < minDate;
                            const isSelected = key === value;

                            return (
                                <button
                                    key={key}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => {
                                        onChange(key);
                                        setIsOpen(false);
                                    }}
                                    title={`${key}: ${load.toLocaleString('th-TH')} / ${dailyCapacity.toLocaleString('th-TH')} ชิ้น`}
                                    className={`min-h-12 border px-1 text-xs disabled:cursor-not-allowed disabled:opacity-35 ${isFull ? 'border-red-600 bg-red-600 text-white' : 'border-slate-200 bg-white text-slate-700'} ${isSelected ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
                                >
                                    <span className="block font-semibold">
                                        {day}
                                    </span>
                                    <span className="block text-[10px]">
                                        {load}/{dailyCapacity}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-xs text-slate-500">
                        <span className="mr-1 inline-block size-3 bg-red-600 align-middle" />
                        สีแดงหมายถึงยอดจองเต็มหรือเกินกำลังผลิตต่อวัน
                    </p>
                </DialogContent>
            </Dialog>
        </>
    );
}
