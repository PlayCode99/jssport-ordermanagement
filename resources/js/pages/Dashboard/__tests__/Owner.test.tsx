import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OwnerDashboard, { type OwnerDashboardProps } from '@/pages/Dashboard/Owner';

const { mockRouterGet } = vi.hoisted(() => ({ mockRouterGet: vi.fn() }));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    router: { get: mockRouterGet },
}));

const baseProps = (over: Partial<OwnerDashboardProps> = {}): OwnerDashboardProps => ({
    filters: { date_from: null, date_to: null, branch_id: null, job_type: null },
    filterOptions: { branches: [{ value: '1', label: 'สาขา 1' }], jobTypes: [{ value: 'งานปัก', label: 'งานปัก' }] },
    revenue: {
        net: 9000,
        gross: 10000,
        discount: 1000,
        order_count: 2,
        by_garment: { shirt: 5400, pants: 1800, set: 1800, unspecified: 0 },
        pieces: { shirt: 30, pants: 10, set: 10, unspecified: 0 },
        monthly: [{ month: '2026-07', net: 9000 }],
    },
    expense: { shirt: 800, pants: 200, total: 1000, monthly: [{ month: '2026-07', shirt: 800, pants: 200, total: 1000 }] },
    orderCounts: { completed: 3, in_progress: 7, total: 10 },
    jobTypeBreakdown: [{ job_type: 'งานปัก', completed: 2, in_progress: 3, total: 5, quantity: 120 }],
    garmentTypeUsage: {
        shirt: [{ name: 'เสื้อโปโล', orders: 4, pieces: 90 }],
        pants: [{ name: 'กางเกงขาสั้น', orders: 2, pieces: 30 }],
    },
    calendar: {
        month: '2026-07',
        today: '2026-07-15',
        days: {
            '2026-07-20': {
                count: 2,
                quantity: 45,
                orders: [
                    { id: 1, order_code: 'ORD-001', customer_name: 'ลูกค้า A', job_name: 'เสื้อทีม A', job_type: 'ปัก', delivery_method: 'shipping', delivery_label: 'ขนส่ง', order_status: 'in_production', status_label: 'ห้องปัก (กำลังทำ)', is_closed: false, quantity: 20 },
                    { id: 2, order_code: 'ORD-002', customer_name: 'ลูกค้า B', job_name: 'เสื้อทีม B', job_type: 'สกรีน เฟล๊กซ์', delivery_method: null, delivery_label: 'รับที่ร้าน', order_status: 'shipping', status_label: 'ปิดงาน', is_closed: true, quantity: 25 },
                ],
            },
        },
    },
    ...over,
});

describe('owner dashboard figures', () => {
    it('shows the expense split and its percentages', () => {
        render(<OwnerDashboard {...baseProps()} />);

        expect(screen.getAllByText('฿ 1,000.00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('฿ 800.00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('฿ 200.00').length).toBeGreaterThan(0);
        // The split is shown as a proportional bar rather than a percentage caption.
        expect(screen.getByLabelText('เสื้อ 80% กางเกง 20%')).toBeInTheDocument();
    });

    it('shows completed and in-progress counts', () => {
        render(<OwnerDashboard {...baseProps()} />);

        expect(screen.getByText('กำลังทำ 7 ออเดอร์')).toBeInTheDocument();
        expect(screen.getByText('(30%)')).toBeInTheDocument();
        expect(screen.getByText('(70%)')).toBeInTheDocument();
    });

    it('never divides by zero when there is no data', () => {
        render(
            <OwnerDashboard
                {...baseProps({
                    expense: { shirt: 0, pants: 0, total: 0, monthly: [] },
                    orderCounts: { completed: 0, in_progress: 0, total: 0 },
                    jobTypeBreakdown: [],
                    garmentTypeUsage: { shirt: [], pants: [] },
                })}
            />,
        );

        expect(screen.getByText('ไม่มีรายจ่ายในช่วงที่เลือก')).toBeInTheDocument();
        expect(screen.getByText('ไม่มีออเดอร์ในช่วงที่เลือก')).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('NaN');
        expect(document.body.textContent).not.toContain('Infinity');
    });

    it('renders the job type table with both counts', () => {
        render(<OwnerDashboard {...baseProps()} />);

        const row = screen.getByText('งานปัก').closest('tr');
        expect(row).not.toBeNull();
        expect(within(row as HTMLElement).getByText('2')).toBeInTheDocument();
        expect(within(row as HTMLElement).getByText('3')).toBeInTheDocument();
        expect(within(row as HTMLElement).getByText('120')).toBeInTheDocument();
    });

    it('renders the top 5 garment tables', () => {
        render(<OwnerDashboard {...baseProps()} />);

        const shirtRow = screen.getByText('เสื้อโปโล').closest('tr') as HTMLElement;
        expect(within(shirtRow).getByText('4')).toBeInTheDocument();
        expect(within(shirtRow).getByText('90')).toBeInTheDocument();

        const pantsRow = screen.getByText('กางเกงขาสั้น').closest('tr') as HTMLElement;
        expect(within(pantsRow).getByText('2')).toBeInTheDocument();
        expect(within(pantsRow).getByText('30')).toBeInTheDocument();
    });
});

describe('owner dashboard calendar', () => {
    it('lays the month out with the right leading blanks and day count', () => {
        render(<OwnerDashboard {...baseProps()} />);

        // 1 July 2026 is a Wednesday -> 3 blank cells before day 1.
        const dayOne = screen.getByRole('button', { name: /^1 ก\.ค\. 2569/ });
        expect(dayOne).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^31 ก\.ค\. 2569/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^32 / })).toBeNull();
    });

    it('marks the day that has deliveries and opens its orders', () => {
        render(<OwnerDashboard {...baseProps()} />);

        const day20 = screen.getByRole('button', { name: /20 ก\.ค\. 2569 มี 2 ออเดอร์ต้องส่ง/ });
        fireEvent.click(day20);

        expect(screen.getByText('ORD-001')).toBeInTheDocument();
        expect(screen.getByText('ORD-002')).toBeInTheDocument();
        expect(screen.getByText('ลูกค้า A')).toBeInTheDocument();
        // Job name and delivery method belong on this row too.
        expect(screen.getByText('เสื้อทีม A')).toBeInTheDocument();
        expect(screen.getByText('เสื้อทีม B')).toBeInTheDocument();
        expect(screen.getByText('ขนส่ง')).toBeInTheDocument();
        expect(screen.getByText('รับที่ร้าน')).toBeInTheDocument();
        // Where each job currently stands.
        expect(screen.getByText('ห้องปัก (กำลังทำ)')).toBeInTheDocument();
        expect(screen.getByText('ปิดงาน')).toBeInTheDocument();
    });

    it('tells the owner plainly when nothing ships today', () => {
        render(<OwnerDashboard {...baseProps()} />);

        expect(screen.getByText(/วันนี้ไม่มีออเดอร์ที่ต้องส่ง/)).toBeInTheDocument();
    });

    it('opens today automatically when today has deliveries', () => {
        render(
            <OwnerDashboard
                {...baseProps({
                    calendar: {
                        month: '2026-07',
                        today: '2026-07-15',
                        days: {
                            '2026-07-15': {
                                count: 1,
                                quantity: 5,
                                orders: [
                                    { id: 9, order_code: 'ORD-TODAY', customer_name: 'ลูกค้าวันนี้', job_name: 'งานวันนี้', job_type: 'ปัก', delivery_method: 'onsite', delivery_label: 'ส่งหน้างาน', order_status: 'shipping', status_label: 'จัดส่ง (รอคิว)', is_closed: false, quantity: 5 },
                                ],
                            },
                        },
                    },
                })}
            />,
        );

        expect(screen.getByText('ORD-TODAY')).toBeInTheDocument();
        expect(screen.getByText(/ต้องส่ง วันนี้/)).toBeInTheDocument();
    });

    it('moves to another month through the server, keeping the current filters', () => {
        mockRouterGet.mockClear();

        render(<OwnerDashboard {...baseProps({ filters: { date_from: '2026-07-01', date_to: null, branch_id: 1, job_type: 'งานปัก' } })} />);

        fireEvent.click(screen.getByRole('button', { name: 'เดือนถัดไป' }));

        expect(mockRouterGet).toHaveBeenCalledTimes(1);
        const [url, query] = mockRouterGet.mock.calls[0];
        expect(url).toBe('/owner-dashboard');
        expect(query).toMatchObject({ calendar_month: '2026-08', date_from: '2026-07-01', branch_id: '1', job_type: 'งานปัก' });
    });
});

describe('owner dashboard job type table', () => {
    it('renders every row the server sends, including types sitting at zero', () => {
        render(
            <OwnerDashboard
                {...baseProps({
                    jobTypeBreakdown: [
                        { job_type: 'งานปัก', completed: 2, in_progress: 3, total: 5, quantity: 120 },
                        { job_type: 'งานสกรีน', completed: 0, in_progress: 0, total: 0, quantity: 0 },
                        { job_type: 'ซับลิเมชั่น', completed: 0, in_progress: 0, total: 0, quantity: 0 },
                    ],
                })}
            />,
        );

        expect(screen.getByText('งานสกรีน')).toBeInTheDocument();
        expect(screen.getByText('ซับลิเมชั่น')).toBeInTheDocument();

        const zeroRow = screen.getByText('งานสกรีน').closest('tr') as HTMLElement;
        expect(within(zeroRow).getAllByText('0').length).toBeGreaterThanOrEqual(4);

        const busyRow = screen.getByText('งานปัก').closest('tr') as HTMLElement;
        expect(within(busyRow).getByText('120')).toBeInTheDocument();
    });

    it('does not read job types from the browser any more', () => {
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                getItem: () => JSON.stringify([{ id: 1, name: 'เฉพาะเครื่องนี้', active: true }]),
                setItem: () => undefined,
                removeItem: () => undefined,
                clear: () => undefined,
                key: () => null,
                length: 0,
            },
        });

        render(<OwnerDashboard {...baseProps()} />);

        expect(screen.queryByText('เฉพาะเครื่องนี้')).not.toBeInTheDocument();
    });
});
