import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { Order } from '@/types/models';

const { mockRouterGet, mockRouterReload } = vi.hoisted(() => ({
    mockRouterGet: vi.fn(),
    mockRouterReload: vi.fn(),
}));

const mockPage = vi.hoisted(() => ({
    props: {} as Record<string, unknown>,
    url: '/production/embroidery',
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    router: { get: mockRouterGet, reload: mockRouterReload },
    usePage: () => mockPage,
}));

const pricing = {
    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
    child_unit_total: 10,
    adult_unit_total: 20,
    pants_child_unit_total: 5,
    pants_adult_unit_total: 15,
    child_total: 0,
    adult_total: 0,
    pants_child_total: 0,
    pants_adult_total: 0,
    grand_total: 0,
};

const sportsDaySpec = (groups: unknown[]) =>
    JSON.stringify({ schema: 'spec-v2', mode: 'sports_day', sports_day_groups: groups });

const makeOrder = (
    spec: string,
    items: Array<Record<string, unknown>>,
    sportsDayArtwork: Record<string, string[]> = {},
): Order =>
    ({
        sports_day_artwork_urls: sportsDayArtwork,
        id: 90,
        order_code: 'ORD-090',
        job_name: 'กีฬาสีโรงเรียน',
        job_type: 'งานปัก',
        order_status: 'in_production',
        order_date: '2026-08-01',
        due_date: '2026-08-05',
        branch: { branch_name: 'สาขา 1' },
        customer: { customer_name: 'โรงเรียนทดสอบ' },
        creator_user: { name: 'ผู้สร้าง' },
        items,
        receipts: [],
        status_histories: [],
        specification: { screen_print_detail: spec },
        routings: [
            {
                id: 9001,
                station_name: 'embroidery',
                is_required: true,
                status: 'pending',
                created_at: '2026-08-01T10:00:00.000000Z',
                updated_at: '2026-08-01T10:00:00.000000Z',
                started_at: null,
                completed_at: null,
            },
        ],
    }) as unknown as Order;

const openDetail = (order: Order) => {
    mockPage.props = { productionPricingMap: { '90': pricing } };

    render(
        <ProductionBoardPage
            orders={[order]}
            branches={[]}
            initialDepartmentFilter="embroidery"
            showDepartmentFilter={false}
            hideBillingColumns={true}
            pageTitle="ห้องปัก"
        />,
    );

    fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));
};

describe('sports day print form', () => {
    it('prints one page per colour house', () => {
        const order = makeOrder(
            sportsDaySpec([
                { team_name: 'คณะสีแดง', rows: [{ size_group: 'adults', size_label: 'M', shirt_qty: 35, pants_qty: 0 }] },
                { team_name: 'คณะสีน้ำเงิน', rows: [{ size_group: 'adults', size_label: 'L', shirt_qty: 40, pants_qty: 0 }] },
                { team_name: 'คณะสีเหลือง', rows: [{ size_group: 'adults', size_label: 'M', shirt_qty: 20, pants_qty: 0 }] },
            ]),
            [{ item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 95 }],
        );

        openDetail(order);

        expect(document.querySelectorAll('.p-print-page').length).toBe(3);
        expect(screen.getAllByText('คณะสีแดง').length).toBeGreaterThan(0);
        expect(screen.getAllByText('คณะสีน้ำเงิน').length).toBeGreaterThan(0);
        expect(screen.getAllByText('คณะสีเหลือง').length).toBeGreaterThan(0);
    });

    it('splits a colour house that has both kids and adults sizes onto its own pages', () => {
        const order = makeOrder(
            sportsDaySpec([
                {
                    team_name: 'คณะสีแดง',
                    rows: [
                        { size_group: 'adults', size_label: 'M', shirt_qty: 30, pants_qty: 0 },
                        { size_group: 'kids', size_label: 'JM', shirt_qty: 10, pants_qty: 0 },
                    ],
                },
            ]),
            [{ item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 40 }],
        );

        openDetail(order);

        // Kids and adults size bars use different column headers, so they cannot
        // share one sheet — two pages, both still labelled with the same house.
        expect(document.querySelectorAll('.p-print-page').length).toBe(2);
        expect(screen.getAllByText('คณะสีแดง').length).toBeGreaterThan(0);
    });

    it('gives shirts and pants of one house separate pages', () => {
        const order = makeOrder(
            sportsDaySpec([
                { team_name: 'คณะสีแดง', rows: [{ size_group: 'adults', size_label: 'M', shirt_qty: 30, pants_qty: 30 }] },
            ]),
            [{ item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 60 }],
        );

        openDetail(order);

        expect(document.querySelectorAll('.p-print-page').length).toBe(2);
    });

    it('skips a house/garment combination that has no quantity', () => {
        const order = makeOrder(
            sportsDaySpec([
                { team_name: 'คณะสีแดง', rows: [{ size_group: 'adults', size_label: 'M', shirt_qty: 30, pants_qty: 0 }] },
                { team_name: 'คณะสีว่าง', rows: [{ size_group: 'adults', size_label: 'L', shirt_qty: 0, pants_qty: 0 }] },
            ]),
            [{ item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 30 }],
        );

        openDetail(order);

        expect(document.querySelectorAll('.p-print-page').length).toBe(1);
        expect(screen.queryByText('คณะสีว่าง')).not.toBeInTheDocument();
    });

    it('leaves a normal (non sports day) order grouped the old way', () => {
        const order = makeOrder(
            JSON.stringify({ schema: 'spec-v2', mode: 'matrix' }),
            [
                { item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 3 },
                { item_type: 'shirt', size_group: 'kids', size_label: 'JM', quantity: 2 },
            ],
        );

        openDetail(order);

        expect(document.querySelectorAll('.p-print-page').length).toBe(2);
        expect(screen.queryByText(/คณะสี/)).not.toBeInTheDocument();
    });

    it('prints exactly the artwork attached to each colour house, on that house’s page', () => {
        const order = makeOrder(
            sportsDaySpec([
                { team_name: 'คณะสีแดง', rows: [{ size_group: 'adults', size_label: 'M', shirt_qty: 30, pants_qty: 0 }] },
                { team_name: 'คณะสีน้ำเงิน', rows: [{ size_group: 'adults', size_label: 'L', shirt_qty: 20, pants_qty: 0 }] },
            ]),
            [{ item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 50 }],
            {
                // 3 attached to the red house, 1 to the blue one.
                '0': ['/storage/red-1.webp', '/storage/red-2.webp', '/storage/red-3.webp'],
                '1': ['/storage/blue-1.webp'],
            },
        );

        openDetail(order);

        const pages = Array.from(document.querySelectorAll('.p-print-page'));
        expect(pages.length).toBe(2);

        const imagesOn = (page: Element) =>
            Array.from(page.querySelectorAll('img'))
                .map((img) => img.getAttribute('src'))
                .filter((src) => !src?.includes('/images/logo/'));

        // Attached 3 -> 3 printed, and only the red house's own files.
        expect(imagesOn(pages[0])).toEqual(['/storage/red-1.webp', '/storage/red-2.webp', '/storage/red-3.webp']);
        // Attached 1 -> 1 printed.
        expect(imagesOn(pages[1])).toEqual(['/storage/blue-1.webp']);
    });

    it('does not leak one house’s artwork onto another house’s page', () => {
        const order = makeOrder(
            sportsDaySpec([
                { team_name: 'คณะสีแดง', rows: [{ size_group: 'adults', size_label: 'M', shirt_qty: 30, pants_qty: 0 }] },
                { team_name: 'คณะสีเหลือง', rows: [{ size_group: 'adults', size_label: 'L', shirt_qty: 20, pants_qty: 0 }] },
            ]),
            [{ item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 50 }],
            { '0': ['/storage/red-only.webp'] },
        );

        openDetail(order);

        const pages = Array.from(document.querySelectorAll('.p-print-page'));
        const yellowImages = Array.from(pages[1].querySelectorAll('img'))
            .map((img) => img.getAttribute('src'))
            .filter((src) => !src?.includes('/images/logo/'));

        expect(yellowImages).not.toContain('/storage/red-only.webp');
    });

    it('falls back to the empty-artwork placeholder for a house with nothing attached', () => {
        const order = makeOrder(
            sportsDaySpec([{ team_name: 'คณะสีแดง', rows: [{ size_group: 'adults', size_label: 'M', shirt_qty: 30, pants_qty: 0 }] }]),
            [{ item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 30 }],
            {},
        );

        openDetail(order);

        expect(screen.getAllByText('ไม่มีรูป Artwork').length).toBeGreaterThan(0);
    });
});
