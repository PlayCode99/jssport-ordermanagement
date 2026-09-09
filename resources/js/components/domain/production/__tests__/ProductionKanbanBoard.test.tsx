import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
    buildHeatPressStats,
    buildStageStats,
    buildVisibleStageStats,
    getLatestRequiredRoutingForStation,
    mapRoutingStationToDepartmentStatus,
    ProductionKanbanBoard,
    shouldMapOrderToHeatPressView,
} from '@/components/domain/production/ProductionKanbanBoard';
import type { Order } from '@/types/models';

const { mockRouterPost, mockRouterReload } = vi.hoisted(() => ({
    mockRouterPost: vi.fn(),
    mockRouterReload: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    router: {
        post: mockRouterPost,
        reload: mockRouterReload,
    },
}));

describe('production kanban room mapping', () => {
    it('maps screen and flex stations to the screen_flex department', () => {
        expect(mapRoutingStationToDepartmentStatus('screen')).toBe(
            'screen_flex',
        );
        expect(mapRoutingStationToDepartmentStatus('flex')).toBe('screen_flex');
    });

    it('counts pending heat press routings for the heat press room', () => {
        const order = {
            id: 1,
            order_code: 'ORD-001',
            items: [{ quantity: 3 }],
            routings: [
                {
                    id: 10,
                    is_required: true,
                    station_name: 'flex',
                    status: 'pending',
                },
            ],
        } as Order;

        const stats = buildHeatPressStats([order]);

        expect(stats.new_job_orders).toBe(1);
        expect(stats.new_job_pieces).toBe(3);
    });

    it('maps screen and flex routings into the heat press view for sublimation work', () => {
        const order = {
            id: 2,
            order_code: 'ORD-002',
            job_type: 'ซับลิเมชั่น',
            items: [{ quantity: 1 }],
            routings: [
                {
                    id: 20,
                    is_required: true,
                    station_name: 'screen',
                    status: 'pending',
                },
            ],
        } as Order;

        const routing = order.routings?.[0];

        expect(shouldMapOrderToHeatPressView(order, routing)).toBe(true);
    });

    it('does not map embroidery plus screen/flex work into the heat press view', () => {
        const order = {
            id: 2,
            order_code: 'ORD-002',
            job_type: 'ปัก+สกรีน',
            items: [{ quantity: 1 }],
            routings: [
                {
                    id: 20,
                    is_required: true,
                    station_name: 'screen',
                    status: 'pending',
                },
            ],
        } as Order;

        const routing = order.routings?.[0];

        expect(shouldMapOrderToHeatPressView(order, routing)).toBe(false);
    });

    it('counts embroidery jobs as new work even when earlier stations are still pending', () => {
        const order = {
            id: 3,
            order_code: 'ORD-003',
            items: [{ quantity: 5 }],
            routings: [
                {
                    id: 30,
                    is_required: true,
                    station_name: 'print',
                    status: 'pending',
                },
                {
                    id: 31,
                    is_required: true,
                    station_name: 'embroidery',
                    status: 'pending',
                },
            ],
        } as Order;

        const stats = buildStageStats([order], 'embroidery');

        expect(stats.new_job_orders).toBe(1);
        expect(stats.new_job_pieces).toBe(5);
    });

    it('prefers the latest embroidery routing when multiple records exist', () => {
        const order = {
            id: 33,
            order_code: 'ORD-033',
            routings: [
                {
                    id: 330,
                    is_required: true,
                    station_name: 'embroidery',
                    status: 'pending',
                },
                {
                    id: 331,
                    is_required: true,
                    station_name: 'embroidery',
                    status: 'completed',
                },
            ],
        } as Order;

        const routing = getLatestRequiredRoutingForStation(order, 'embroidery');

        expect(routing?.id).toBe(331);
        expect(routing?.status).toBe('completed');
    });

    it('keeps heat-press work visible when a required screen or flex routing exists', () => {
        const order = {
            id: 6,
            order_code: 'ORD-006',
            items: [{ quantity: 2 }],
            routings: [
                {
                    id: 60,
                    is_required: true,
                    station_name: 'print',
                    status: 'pending',
                },
                {
                    id: 61,
                    is_required: true,
                    station_name: 'screen',
                    status: 'pending',
                },
            ],
        } as Order;

        const stats = buildHeatPressStats([order]);

        expect(stats.new_job_orders).toBe(1);
        expect(stats.new_job_pieces).toBe(2);
    });

    it('aggregates stage-room counters across all stage departments in the all-departments view', () => {
        const cuttingOrder = {
            id: 4,
            order_code: 'ORD-004',
            items: [{ quantity: 2 }],
            routings: [
                {
                    id: 40,
                    is_required: true,
                    station_name: 'cutting',
                    status: 'pending',
                },
            ],
        } as Order;

        const embroideryOrder = {
            id: 5,
            order_code: 'ORD-005',
            items: [{ quantity: 4 }],
            routings: [
                {
                    id: 50,
                    is_required: true,
                    station_name: 'print',
                    status: 'completed',
                },
                {
                    id: 51,
                    is_required: true,
                    station_name: 'embroidery',
                    status: 'pending',
                },
            ],
        } as Order;

        const stats = buildStageStats([cuttingOrder, embroideryOrder], 'all');

        expect(stats.new_job_orders).toBe(2);
        expect(stats.new_job_pieces).toBe(6);
    });

    it('renders the heat-press board without crashing when no heat-press rows match the current view', () => {
        const order = {
            id: 7,
            order_code: 'ORD-007',
            items: [{ quantity: 1 }],
            routings: [
                {
                    id: 70,
                    is_required: true,
                    station_name: 'print',
                    status: 'completed',
                },
            ],
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 1' },
            job_type: 'เสื้อ',
            receipts: [],
            creator_user: { name: 'พนักงาน' },
            order_date: '2026-01-01',
            due_date: '2026-01-02',
        } as Order;

        render(
            <ProductionKanbanBoard
                orders={[order]}
                initialDepartmentFilter="heat_press"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                onOpenDetail={() => undefined}
                onOpenTimeline={() => undefined}
            />,
        );

        expect(
            screen.getByText('ไม่พบข้อมูลออเดอร์ตามเงื่อนไขที่เลือก'),
        ).toBeInTheDocument();
    });

    it('counts a screen/flex order as new work when a later screen/flex step is still pending', () => {
        const order = {
            id: 8,
            order_code: 'ORD-008',
            items: [{ quantity: 4 }],
            routings: [
                {
                    id: 80,
                    is_required: true,
                    station_name: 'screen',
                    status: 'completed',
                },
                {
                    id: 81,
                    is_required: true,
                    station_name: 'flex',
                    status: 'pending',
                },
            ],
        } as Order;

        const stats = buildStageStats([order], 'screen_flex');

        expect(stats.new_job_orders).toBe(1);
        expect(stats.new_job_pieces).toBe(4);
    });

    it('builds stage stats from the same visible rows shown in the table', () => {
        const rows = [
            {
                id: 9,
                order_code: 'ORD-009',
                order_item_count: 4,
                department_routing_status: 'pending' as const,
            },
            {
                id: 10,
                order_code: 'ORD-010',
                order_item_count: 2,
                department_routing_status: 'in_progress' as const,
            },
            {
                id: 11,
                order_code: 'ORD-011',
                order_item_count: 6,
                department_routing_status: 'rejected' as const,
            },
            {
                id: 12,
                order_code: 'ORD-012',
                order_item_count: 1,
                department_routing_status: 'completed' as const,
            },
        ];

        const stats = buildVisibleStageStats(rows);

        expect(stats.new_job_orders).toBe(1);
        expect(stats.new_job_pieces).toBe(4);
        expect(stats.assigned_orders).toBe(1);
        expect(stats.assigned_pieces).toBe(2);
        expect(stats.revising_orders).toBe(1);
        expect(stats.revising_pieces).toBe(6);
        expect(stats.completed_orders).toBe(1);
        expect(stats.completed_pieces).toBe(1);
    });

    it('hides the assigned-work summary card and assigned-work column from the shared production board', () => {
        const order = {
            id: 13,
            order_code: 'ORD-013',
            items: [{ quantity: 2 }],
            routings: [
                {
                    id: 130,
                    is_required: true,
                    station_name: 'embroidery',
                    status: 'pending',
                },
            ],
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 1' },
            job_type: 'เสื้อ',
            receipts: [],
            creator_user: { name: 'พนักงาน' },
            order_date: '2026-01-01',
            due_date: '2026-01-02',
        } as Order;

        render(
            <ProductionKanbanBoard
                orders={[order]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                onOpenDetail={() => undefined}
                onOpenTimeline={() => undefined}
            />,
        );

        expect(screen.queryByText('แจกงาน')).not.toBeInTheDocument();
        expect(screen.queryByText('วันที่แจกงาน')).not.toBeInTheDocument();
    });

    it('renders incoming and completed date range filters in the shared production board', () => {
        render(
            <ProductionKanbanBoard
                orders={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                onOpenDetail={() => undefined}
                onOpenTimeline={() => undefined}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: /วันที่งานเข้ามา/i }),
        );
        expect(
            screen.getByLabelText('วันที่งานเข้ามา จาก'),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText('วันที่งานเข้ามา ถึง'),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', { name: /วันที่เสร็จสิ้น/i }),
        );
        expect(
            screen.getByLabelText('วันที่เสร็จสิ้น จาก'),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText('วันที่เสร็จสิ้น ถึง'),
        ).toBeInTheDocument();
    });

    it('shows only new-job and completed options for the print-room status filter', () => {
        render(
            <ProductionKanbanBoard
                orders={[]}
                initialDepartmentFilter="print_room"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                onOpenDetail={() => undefined}
                onOpenTimeline={() => undefined}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /สถานะ/i }));

        expect(screen.getByText('งานเข้าใหม่')).toBeInTheDocument();
        expect(screen.getByText('เสร็จสิ้น')).toBeInTheDocument();
        expect(screen.queryByText('เครื่องพิมพ์ 1')).not.toBeInTheDocument();
        expect(screen.queryByText('เครื่องพิมพ์ 2')).not.toBeInTheDocument();
        expect(screen.queryByText('เครื่องพิมพ์ 3')).not.toBeInTheDocument();
    });

    it('filters by a single selected date for incoming-date when only one side is chosen', () => {
        const orders = [
            {
                id: 14,
                order_code: 'ORD-014',
                items: [{ quantity: 1 }],
                incoming_date: '2026-07-29T10:00:00.000000Z',
                branch: { branch_name: 'สาขา 1' },
                customer: { customer_name: 'ลูกค้า 1' },
                job_type: 'เสื้อ',
                receipts: [],
                creator_user: { name: 'พนักงาน' },
                order_date: '2026-07-29',
                due_date: '2026-08-01',
                routings: [
                    {
                        id: 1,
                        is_required: true,
                        station_name: 'embroidery',
                        status: 'pending',
                    },
                ],
            },
            {
                id: 15,
                order_code: 'ORD-015',
                items: [{ quantity: 1 }],
                incoming_date: '2026-07-30',
                branch: { branch_name: 'สาขา 1' },
                customer: { customer_name: 'ลูกค้า 2' },
                job_type: 'เสื้อ',
                receipts: [],
                creator_user: { name: 'พนักงาน' },
                order_date: '2026-07-30',
                due_date: '2026-08-01',
                routings: [
                    {
                        id: 2,
                        is_required: true,
                        station_name: 'embroidery',
                        status: 'pending',
                    },
                ],
            },
        ] as Order[];

        render(
            <ProductionKanbanBoard
                orders={orders}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                onOpenDetail={() => undefined}
                onOpenTimeline={() => undefined}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: /วันที่งานเข้ามา/i }),
        );
        fireEvent.change(screen.getByLabelText('วันที่งานเข้ามา จาก'), {
            target: { value: '2026-07-29' },
        });

        expect(screen.getByText('ORD-014')).toBeInTheDocument();
        expect(screen.queryByText('ORD-015')).not.toBeInTheDocument();
    });

    it('reloads data immediately after shipping completion succeeds', () => {
        mockRouterPost.mockImplementation(
            (
                _url: string,
                _payload: unknown,
                options: { onSuccess?: () => void },
            ) => {
                options.onSuccess?.();
            },
        );

        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

        const order = {
            id: 99,
            order_code: 'ORD-SHIP-099',
            items: [{ quantity: 2 }],
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 99' },
            job_type: 'เสื้อ',
            order_date: '2026-01-01',
            due_date: '2026-01-02',
            order_status: 'shipping',
            delivery_method: 'shipping',
            shipping_address: 'Address 99',
            receipts: [],
            creator_user: { name: 'พนักงาน' },
            routings: [
                {
                    id: 990,
                    is_required: true,
                    station_name: 'shipping',
                    status: 'pending',
                },
            ],
        } as Order;

        render(
            <ProductionKanbanBoard
                orders={[order]}
                initialDepartmentFilter="shipping"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                onOpenDetail={() => undefined}
                onOpenTimeline={() => undefined}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'ขนส่ง' }));
        fireEvent.click(screen.getByRole('button', { name: 'ส่งงานสำเร็จ' }));

        expect(mockRouterPost).toHaveBeenCalled();
        expect(mockRouterReload).toHaveBeenCalledWith({
            preserveScroll: true,
            preserveState: true,
        });

        confirmSpy.mockRestore();
    });

    it('does not reload data when shipping completion fails', () => {
        mockRouterReload.mockClear();
        mockRouterPost.mockImplementation(
            (
                _url: string,
                _payload: unknown,
                options: {
                    onError?: (errors: Record<string, string[]>) => void;
                },
            ) => {
                options.onError?.({ status: ['ไม่สามารถอัปเดตสถานะได้'] });
            },
        );

        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const alertSpy = vi
            .spyOn(window, 'alert')
            .mockImplementation(() => undefined);

        const order = {
            id: 100,
            order_code: 'ORD-SHIP-100',
            items: [{ quantity: 2 }],
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 100' },
            job_type: 'เสื้อ',
            order_date: '2026-01-01',
            due_date: '2026-01-02',
            order_status: 'shipping',
            delivery_method: 'shipping',
            shipping_address: 'Address 100',
            receipts: [],
            creator_user: { name: 'พนักงาน' },
            routings: [
                {
                    id: 1000,
                    is_required: true,
                    station_name: 'shipping',
                    status: 'pending',
                },
            ],
        } as Order;

        render(
            <ProductionKanbanBoard
                orders={[order]}
                initialDepartmentFilter="shipping"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                onOpenDetail={() => undefined}
                onOpenTimeline={() => undefined}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'ขนส่ง' }));
        fireEvent.click(screen.getByRole('button', { name: 'ส่งงานสำเร็จ' }));

        expect(mockRouterReload).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalled();

        alertSpy.mockRestore();
        confirmSpy.mockRestore();
    });
});

/**
 * The job is what the floor looks a row up by; the customer is the context
 * under it. The counter table and this table's own card view already read that
 * way, and the desktop table used to have them the other way round.
 */
describe('the job column', () => {
    it('puts the job name above the customer name', () => {
        const order = {
            id: 41,
            order_code: 'ORD-041',
            job_name: 'เสื้อทีมโรงเรียนทดสอบ',
            job_type: 'งานสกรีน',
            items: [{ quantity: 3 }],
            routings: [
                {
                    id: 410,
                    is_required: true,
                    station_name: 'sewing',
                    status: 'pending',
                },
            ],
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'โรงเรียนทดสอบ' },
            receipts: [],
            creator_user: { name: 'พนักงาน' },
            order_date: '2026-01-01',
            due_date: '2026-01-02',
        } as unknown as Order;

        render(
            <ProductionKanbanBoard
                orders={[order]}
                initialDepartmentFilter="sewing"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                onOpenDetail={() => undefined}
                onOpenTimeline={() => undefined}
            />,
        );

        const cell = screen
            .getAllByTitle('เสื้อทีมโรงเรียนทดสอบ — โรงเรียนทดสอบ')
            .at(0) as HTMLElement;
        const lines = [...cell.querySelectorAll('span')].map((span) =>
            span.textContent?.trim(),
        );

        expect(lines).toEqual(['เสื้อทีมโรงเรียนทดสอบ', 'โรงเรียนทดสอบ']);
    });
});
