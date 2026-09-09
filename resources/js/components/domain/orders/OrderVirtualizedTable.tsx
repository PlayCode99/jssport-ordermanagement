import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/models';

type OrderVirtualizedTableProps = {
    orders: Order[];
    onRowClick?: (order: Order) => void;
};

type SortField =
    'order_code' | 'order_date' | 'due_date' | 'net_amount' | 'order_status';
type SortOrder = 'asc' | 'desc';

const HEADER_HEIGHT = 56;

const moneyFormatter = new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
});

function getStatusBadgeClass(status: Order['order_status']): string {
    if (status === 'completed') {
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }

    if (status === 'qc_rejected') {
        return 'bg-rose-100 text-rose-800 border-rose-200';
    }

    if (status === 'in_production') {
        return 'bg-[#E21E26]/10 text-[#E21E26] border-[#E21E26]/25';
    }

    if (status === 'draft') {
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }

    return 'bg-sky-100 text-sky-800 border-sky-200';
}

function formatDueDate(rawDate: string): string {
    const date = new Date(rawDate);

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return dateFormatter.format(date);
}

function compareValues(
    left: Order,
    right: Order,
    sortField: SortField,
): number {
    if (sortField === 'net_amount') {
        return left.net_amount - right.net_amount;
    }

    if (sortField === 'order_date' || sortField === 'due_date') {
        const leftTime = new Date(left[sortField]).getTime();
        const rightTime = new Date(right[sortField]).getTime();

        return leftTime - rightTime;
    }

    return String(left[sortField]).localeCompare(String(right[sortField]));
}

export function OrderVirtualizedTable({
    orders,
    onRowClick,
}: OrderVirtualizedTableProps) {
    const scrollParentRef = useRef<HTMLDivElement | null>(null);
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const sortedOrders = useMemo(() => {
        if (sortField === null) {
            return orders;
        }

        const copy = [...orders];
        copy.sort((a, b) => {
            const result = compareValues(a, b, sortField);

            return sortOrder === 'asc' ? result : -result;
        });

        return copy;
    }, [orders, sortField, sortOrder]);

    const virtualizer = useVirtualizer({
        count: sortedOrders.length,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: () => 56,
        overscan: 10,
    });

    const hasRows = sortedOrders.length > 0;
    const virtualRows = virtualizer.getVirtualItems();

    useEffect(() => {
        setSelectedIndex((current) => {
            if (sortedOrders.length === 0) {
                return 0;
            }

            return Math.min(current, sortedOrders.length - 1);
        });
    }, [sortedOrders.length]);

    const toggleSort = (field: SortField) => {
        setSortField((current) => {
            if (current === field) {
                setSortOrder((currentOrder) =>
                    currentOrder === 'asc' ? 'desc' : 'asc',
                );

                return current;
            }

            setSortOrder('asc');

            return field;
        });
    };

    const onTableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!hasRows) {
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelectedIndex((current) => {
                const nextIndex = Math.min(
                    current + 1,
                    sortedOrders.length - 1,
                );
                virtualizer.scrollToIndex(nextIndex, { align: 'auto' });

                return nextIndex;
            });

            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedIndex((current) => {
                const nextIndex = Math.max(current - 1, 0);
                virtualizer.scrollToIndex(nextIndex, { align: 'auto' });

                return nextIndex;
            });

            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            const selectedOrder = sortedOrders[selectedIndex];

            if (selectedOrder) {
                onRowClick?.(selectedOrder);
            }
        }
    };

    const sortIndicator = (field: SortField): string => {
        if (sortField !== field) {
            return '↕';
        }

        return sortOrder === 'asc' ? '↑' : '↓';
    };

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div
                ref={scrollParentRef}
                className="relative h-[650px] overflow-y-auto"
                tabIndex={0}
                onKeyDown={onTableKeyDown}
            >
                <div className="sticky top-0 z-10 grid grid-cols-[1.2fr_1.1fr_1.3fr_1.2fr_1fr_1fr_1fr] bg-white px-4 py-3 text-xs font-semibold tracking-wide text-slate-600 uppercase shadow-sm dark:bg-gray-900">
                    <button
                        type="button"
                        className="text-left"
                        onClick={() => toggleSort('order_code')}
                    >
                        Order Code {sortIndicator('order_code')}
                    </button>
                    <button
                        type="button"
                        className="text-left"
                        onClick={() => toggleSort('order_date')}
                    >
                        Order Date {sortIndicator('order_date')}
                    </button>
                    <div>Job Name</div>
                    <div>Customer</div>
                    <button
                        type="button"
                        className="text-right"
                        onClick={() => toggleSort('net_amount')}
                    >
                        Net Amount {sortIndicator('net_amount')}
                    </button>
                    <button
                        type="button"
                        className="text-center"
                        onClick={() => toggleSort('order_status')}
                    >
                        Status {sortIndicator('order_status')}
                    </button>
                    <button
                        type="button"
                        className="text-right"
                        onClick={() => toggleSort('due_date')}
                    >
                        Due Date {sortIndicator('due_date')}
                    </button>
                </div>

                {!hasRows && (
                    <div className="flex h-[calc(650px-56px)] items-center justify-center text-sm text-slate-500">
                        No orders found.
                    </div>
                )}

                {hasRows && (
                    <div
                        className="relative w-full"
                        style={{
                            height: `${virtualizer.getTotalSize() + HEADER_HEIGHT}px`,
                        }}
                    >
                        {virtualRows.map((virtualRow) => {
                            const order = sortedOrders[virtualRow.index];
                            const isSelected =
                                virtualRow.index === selectedIndex;

                            return (
                                <button
                                    key={order.id}
                                    type="button"
                                    className={cn(
                                        'absolute top-0 left-0 grid w-full grid-cols-[1.2fr_1.1fr_1.3fr_1.2fr_1fr_1fr_1fr] items-center border-b border-slate-100 px-4 text-left text-sm text-slate-700 transition hover:bg-slate-50',
                                        isSelected &&
                                            'bg-indigo-50/50 ring-2 ring-indigo-500',
                                    )}
                                    style={{
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start + HEADER_HEIGHT}px)`,
                                    }}
                                    onClick={() => {
                                        setSelectedIndex(virtualRow.index);
                                        onRowClick?.(order);
                                    }}
                                >
                                    <div className="truncate font-medium text-slate-900">
                                        {order.order_code}
                                    </div>
                                    <div className="truncate">
                                        {formatDueDate(order.order_date)}
                                    </div>
                                    <div className="truncate">
                                        {order.job_name}
                                    </div>
                                    <div className="truncate">
                                        {order.customer?.customer_name ?? '-'}
                                    </div>
                                    <div className="text-right font-medium text-slate-900">
                                        {moneyFormatter.format(
                                            order.net_amount,
                                        )}
                                    </div>
                                    <div className="flex justify-center">
                                        <Badge
                                            variant="outline"
                                            className={getStatusBadgeClass(
                                                order.order_status,
                                            )}
                                        >
                                            {order.order_status}
                                        </Badge>
                                    </div>
                                    <div className="text-right">
                                        {formatDueDate(order.due_date)}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
