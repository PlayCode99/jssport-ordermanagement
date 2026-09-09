import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DeliveryCalendarDialog from '../DeliveryCalendarDialog';
import type { DeliveryCalendar } from '../DeliveryCalendarDialog';

vi.mock('@inertiajs/react', () => ({ router: { get: vi.fn() } }));

const order = (over: Record<string, unknown> = {}) => ({
    id: 1,
    order_code: 'ORD-2026-00007',
    customer_name: 'โรงเรียนทดสอบ',
    branch_name: 'ศรีบุญเรือง',
    job_name: 'เสื้อกีฬาสี',
    job_type: 'ปัก',
    delivery_method: 'shipping',
    delivery_label: 'ขนส่ง',
    order_status: 'confirmed',
    status_label: 'ห้องปัก (กำลังทำ)',
    is_closed: false,
    quantity: 40,
    ...over,
});

const calendar: DeliveryCalendar = {
    month: '2026-09',
    today: '2026-09-15',
    days: {
        '2026-09-15': {
            count: 2,
            quantity: 60,
            orders: [
                order(),
                order({ id: 2, order_code: 'ORD-2026-00008', quantity: 20 }),
            ],
        },
        '2026-09-22': {
            count: 1,
            quantity: 10,
            orders: [
                order({ id: 3, order_code: 'ORD-2026-00009', quantity: 10 }),
            ],
        },
    },
};

describe('DeliveryCalendarDialog', () => {
    it('opens on today when today has jobs due', () => {
        render(
            <DeliveryCalendarDialog
                open
                onOpenChange={vi.fn()}
                calendar={calendar}
                showBranch={false}
            />,
        );

        expect(screen.getByText('ปฏิทินกำหนดส่ง')).toBeInTheDocument();
        // Today's two orders are listed straight away.
        expect(screen.getByText('ORD-2026-00007')).toBeInTheDocument();
        expect(screen.getByText('ORD-2026-00008')).toBeInTheDocument();
        expect(screen.queryByText('ORD-2026-00009')).not.toBeInTheDocument();
    });

    it('marks each day with how many jobs are due', () => {
        render(
            <DeliveryCalendarDialog
                open
                onOpenChange={vi.fn()}
                calendar={calendar}
                showBranch={false}
            />,
        );

        expect(screen.getByLabelText('วันที่ 15 มี 2 งาน')).toBeInTheDocument();
        expect(screen.getByLabelText('วันที่ 22 มี 1 งาน')).toBeInTheDocument();
        expect(screen.getByLabelText('วันที่ 16 ไม่มีงาน')).toBeInTheDocument();
    });

    it('sums the month in the header', () => {
        render(
            <DeliveryCalendarDialog
                open
                onOpenChange={vi.fn()}
                calendar={calendar}
                showBranch={false}
            />,
        );

        expect(screen.getByText(/เดือนนี้ 3 งาน/)).toBeInTheDocument();
        expect(screen.getByText(/เฉพาะสาขาของคุณ/)).toBeInTheDocument();
    });

    it('names the branch only for the head office view', () => {
        const { rerender } = render(
            <DeliveryCalendarDialog
                open
                onOpenChange={vi.fn()}
                calendar={calendar}
                showBranch={false}
            />,
        );

        expect(screen.queryByText('ศรีบุญเรือง')).not.toBeInTheDocument();

        rerender(
            <DeliveryCalendarDialog
                open
                onOpenChange={vi.fn()}
                calendar={calendar}
                showBranch
            />,
        );

        expect(screen.getAllByText('ศรีบุญเรือง').length).toBeGreaterThan(0);
        expect(screen.getByText(/ทุกสาขา/)).toBeInTheDocument();
    });

    it('shows an empty state when today has nothing due', () => {
        const quiet: DeliveryCalendar = { ...calendar, today: '2026-09-02' };

        render(
            <DeliveryCalendarDialog
                open
                onOpenChange={vi.fn()}
                calendar={quiet}
                showBranch={false}
            />,
        );

        expect(
            screen.getByText('เลือกวันที่มีงานเพื่อดูรายละเอียด'),
        ).toBeInTheDocument();
    });

    it('keeps the day list to that day only', () => {
        render(
            <DeliveryCalendarDialog
                open
                onOpenChange={vi.fn()}
                calendar={calendar}
                showBranch={false}
            />,
        );

        const list = screen.getByRole('list');
        expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    });
});
