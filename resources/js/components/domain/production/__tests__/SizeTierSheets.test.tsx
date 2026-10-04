import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { Order, OrderItem } from '@/types/models';

const mockPage = vi.hoisted(() => ({
    props: {} as Record<string, unknown>,
    url: '/production/sewing',
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        href,
        className,
        children,
    }: {
        href: string;
        className?: string;
        children: ReactNode;
    }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
    router: { get: vi.fn(), reload: vi.fn() },
    usePage: () => mockPage,
}));

/**
 * ประถม - มัธยมต้น is cut to a pattern of its own, so the floor gets a sheet of
 * its own — even though the shirt on it is billed at the child's rate. The
 * board is where that split becomes visible: one sheet per tier, per garment,
 * per length.
 *
 * A bill written before tiers existed names none, and has to keep printing on
 * exactly the sheet it always did.
 */
const line = (over: Partial<OrderItem>): OrderItem =>
    ({
        item_type: 'shirt',
        shirt_style: 'short',
        size_group: 'kids',
        size_label: 'JS',
        quantity: 5,
        ...over,
    }) as unknown as OrderItem;

const makeOrder = (id: number, items: OrderItem[]): Order =>
    ({
        id,
        order_code: `ORD-${id}`,
        job_name: 'งานทดสอบชั้นไซซ์',
        job_type: 'งานปัก',
        order_status: 'in_production',
        order_date: '2026-09-01',
        due_date: '2026-09-10',
        branch: { branch_name: 'สาขา 1' },
        customer: { customer_name: 'ลูกค้า' },
        creator_user: { name: 'ผู้สร้าง' },
        items,
        receipts: [],
        status_histories: [],
        specification: {
            screen_print_detail: JSON.stringify({
                schema: 'spec-v2',
                mode: 'matrix',
                shirt_specs: { shirt_type_id: '2' },
            }),
        },
        routings: [
            {
                id: id * 100,
                station_name: 'sewing',
                is_required: true,
                status: 'pending',
                created_at: '2026-09-01T10:00:00.000000Z',
                updated_at: '2026-09-01T10:00:00.000000Z',
                started_at: null,
                completed_at: null,
            },
        ],
    }) as unknown as Order;

/** A payload that prices per garment only, with no batch of its own. */
const pricingWithoutBatches = (id: number) => ({
    [String(id)]: {
        shirt_type_id: 2,
        shirt_type_name: 'เสื้อคอกลม',
        pants_type_id: null,
        pants_type_name: null,
        components: [
            {
                name: 'ตัดเย็บ',
                child_price: 10,
                adult_price: 25,
                child_price_long: null,
                adult_price_long: null,
            },
        ],
        pants_components: [],
        child_unit_total: 10,
        adult_unit_total: 25,
        child_total: 0,
        adult_total: 0,
        grand_total: 0,
        groups: [],
    },
});

const openSheetsFor = (id: number, items: OrderItem[]) => {
    mockPage.props = { productionPricingMap: pricingWithoutBatches(id) };

    render(
        <ProductionBoardPage
            orders={[makeOrder(id, items)]}
            branches={[]}
            initialDepartmentFilter="sewing"
            showDepartmentFilter={false}
            pageTitle="ห้องเย็บ"
        />,
    );

    fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);
};

const sheet = (key: string) =>
    document.querySelector(`#production-sheet-${key}`) as HTMLElement | null;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('the sheets a size tier prints', () => {
    it('cuts ประถม - มัธยมต้น on a sheet of its own', () => {
        openSheetsFor(401, [
            line({ size_tier: 'kids', size_label: 'JS', quantity: 4 }),
            line({ size_tier: 'junior', size_label: 'S', quantity: 6 }),
        ]);

        // Same garment, same sleeve, same rate — two sheets all the same,
        // because the two are cut to different patterns.
        expect(sheet('shirt_kids_short')).not.toBeNull();
        expect(sheet('shirt_junior_short')).not.toBeNull();
    });

    it('names the ประถม sheet so the floor can tell it apart', () => {
        openSheetsFor(402, [line({ size_tier: 'junior', size_label: 'S' })]);

        expect(sheet('shirt_junior_short')?.textContent).toContain(
            'เสื้อไซต์ประถม - มัธยมต้น แขนสั้น',
        );
    });

    it('keeps ประถม out of the sheet the younger children are cut on', () => {
        openSheetsFor(403, [line({ size_tier: 'junior', size_label: 'S' })]);

        expect(sheet('shirt_kids_short')).toBeNull();
    });

    it('prices a ประถม sheet at the child rate when the payload has no batch for it', () => {
        openSheetsFor(404, [
            line({ size_tier: 'junior', size_label: 'S', quantity: 3 }),
        ]);

        // 10 is the child's rate, 25 the adult's. Falling through to the adult
        // rate here would overstate what the floor is owed.
        expect(sheet('shirt_junior_short')?.textContent).toContain('10');
        expect(sheet('shirt_junior_short')?.textContent).not.toContain('25.00');
    });

    it('leaves a bill written before tiers existed on the sheet it always had', () => {
        openSheetsFor(405, [
            line({
                size_tier: undefined,
                size_group: 'kids',
                size_label: 'JS',
            }),
            line({
                size_tier: undefined,
                size_group: 'adults',
                size_label: 'M',
            }),
        ]);

        expect(sheet('shirt_kids_short')).not.toBeNull();
        expect(sheet('shirt_adults_short')).not.toBeNull();
        expect(sheet('shirt_junior_short')).toBeNull();
    });

    it('heads the ประถม costing table with the rate it is actually paid at', () => {
        openSheetsFor(407, [
            line({ size_tier: 'junior', size_label: 'S', quantity: 3 }),
        ]);

        const costing = sheet('shirt_junior_short')?.querySelector(
            '.p-process-table thead',
        );

        // The sheet is cut as ประถม and paid as a child. Heading the column
        // 'ผู้ใหญ่' while the total below is worked out at the child's rate is
        // a sheet nobody on the floor can reconcile.
        expect(costing?.textContent).toContain('เด็ก');
        expect(costing?.textContent).not.toContain('ผู้ใหญ่');
    });

    it('still reads oversize as an adult', () => {
        openSheetsFor(406, [
            line({
                size_tier: undefined,
                size_group: 'oversize',
                size_label: '5XL',
            }),
        ]);

        expect(sheet('shirt_adults_short')).not.toBeNull();
    });
});
