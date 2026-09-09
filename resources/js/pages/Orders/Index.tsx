import { Head, router } from '@inertiajs/react';
import { FilePlus2, Search } from 'lucide-react';
import { useState } from 'react';

import { OrderVirtualizedTable } from '@/components/domain/orders/OrderVirtualizedTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { Order, OrderStatus } from '@/types/models';

type CursorPagination<T> = {
    data: T[];
    next_page_url: string | null;
    prev_page_url: string | null;
};

type Props = {
    orders: CursorPagination<Order>;
    filters: {
        search: string;
        status: string;
    };
};

const orderStatuses: Array<{ value: OrderStatus; label: string }> = [
    { value: 'draft', label: 'ร่าง' },
    { value: 'designing', label: 'กำลังออกแบบ' },
    { value: 'waiting_customer_confirm', label: 'รอยืนยันแบบ' },
    { value: 'confirmed', label: 'คอนเฟิร์มแบบ' },
    { value: 'in_production', label: 'กำลังดำเนินการ' },
    { value: 'qc_checking', label: 'ตรวจสอบ' },
    { value: 'qc_rejected', label: 'ตีกลับแก้ไข' },
    { value: 'shipping', label: 'จัดส่ง' },
    { value: 'completed', label: 'ปิดงาน' },
    { value: 'cancelled', label: 'ยกเลิก' },
];

export default function OrdersIndex({ orders, filters }: Props) {
    const [search, setSearch] = useState(filters.search);
    const [status, setStatus] = useState(filters.status || 'all');

    const applyFilters = (nextSearch = search, nextStatus = status) => {
        router.get(
            '/orders',
            {
                search: nextSearch || undefined,
                status: nextStatus === 'all' ? undefined : nextStatus,
            },
            {
                preserveState: true,
                replace: true,
            },
        );
    };

    return (
        <>
            <Head title="รายการออเดอร์" />

            <main className="mx-auto w-full max-w-[1600px] space-y-4 px-4 py-5 lg:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-xl font-bold text-slate-900">
                        รายการออเดอร์
                    </h1>
                    <Button
                        type="button"
                        onClick={() => router.visit('/orders/create')}
                    >
                        <FilePlus2 className="size-4" />
                        เปิดออร์เดอร์ใหม่
                    </Button>
                </div>

                <div className="flex flex-wrap items-end gap-3 border-y border-slate-200 py-3">
                    <label className="grid min-w-[260px] flex-1 gap-1.5 text-xs font-semibold text-slate-600">
                        ค้นหา
                        <div className="flex gap-2">
                            <Input
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        applyFilters();
                                    }
                                }}
                                placeholder="เลขออเดอร์, ชื่อหน่วยงาน, ชื่องาน, ลูกค้า"
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => applyFilters()}
                                title="ค้นหา"
                            >
                                <Search className="size-4" />
                            </Button>
                        </div>
                    </label>

                    <label className="grid w-52 gap-1.5 text-xs font-semibold text-slate-600">
                        สถานะ
                        <Select
                            value={status}
                            onValueChange={(value) => {
                                setStatus(value);
                                applyFilters(search, value);
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="ทุกสถานะ" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">ทุกสถานะ</SelectItem>
                                {orderStatuses.map((item) => (
                                    <SelectItem
                                        key={item.value}
                                        value={item.value}
                                    >
                                        {item.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                </div>

                <OrderVirtualizedTable
                    orders={orders.data}
                    onRowClick={(order) =>
                        router.visit(`/orders/${order.id}/edit`)
                    }
                />

                <div className="flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!orders.prev_page_url}
                        onClick={() =>
                            orders.prev_page_url &&
                            router.visit(orders.prev_page_url)
                        }
                    >
                        ก่อนหน้า
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!orders.next_page_url}
                        onClick={() =>
                            orders.next_page_url &&
                            router.visit(orders.next_page_url)
                        }
                    >
                        ถัดไป
                    </Button>
                </div>
            </main>
        </>
    );
}
