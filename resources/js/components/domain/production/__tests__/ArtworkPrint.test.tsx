import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { Order } from '@/types/models';

const { mockRouterGet, mockRouterReload } = vi.hoisted(() => ({
    mockRouterGet: vi.fn(),
    mockRouterReload: vi.fn(),
}));

const mockPage = vi.hoisted(() => ({ props: {} as Record<string, unknown>, url: '/production/embroidery' }));

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

const makeOrder = (over: Record<string, unknown>): Order =>
    ({
        id: 70,
        order_code: 'ORD-070',
        job_name: 'หลายรูป',
        job_type: 'ปัก',
        order_status: 'in_production',
        order_date: '2026-09-01',
        due_date: '2026-09-05',
        branch: { branch_name: 'สาขา 1' },
        customer: { customer_name: 'ลูกค้า' },
        creator_user: { name: 'ผู้สร้าง' },
        items: [{ item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 5 }],
        receipts: [],
        status_histories: [],
        specification: { screen_print_detail: JSON.stringify({ schema: 'spec-v2', mode: 'matrix' }) },
        routings: [
            {
                id: 7001,
                station_name: 'embroidery',
                is_required: true,
                status: 'pending',
                created_at: '2026-09-01T10:00:00.000000Z',
                updated_at: '2026-09-01T10:00:00.000000Z',
                started_at: null,
                completed_at: null,
            },
        ],
        ...over,
    }) as unknown as Order;

const openDetail = (order: Order) => {
    mockPage.props = { productionPricingMap: { '70': pricing } };

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

const printedImages = () =>
    Array.from(document.querySelectorAll('.p-print-page img'))
        .map((img) => img.getAttribute('src'))
        .filter((src) => !src?.includes('/images/logo/'));

describe('shirt and pants artwork on the print form', () => {
    it('prints every shirt artwork, not just the first', () => {
        openDetail(
            makeOrder({
                shirt_artwork_url: '/storage/shirt-1.webp',
                shirt_artwork_urls: ['/storage/shirt-1.webp', '/storage/shirt-2.webp', '/storage/shirt-3.webp'],
            }),
        );

        const images = printedImages();
        expect(images).toContain('/storage/shirt-1.webp');
        expect(images).toContain('/storage/shirt-2.webp');
        expect(images).toContain('/storage/shirt-3.webp');
        // 3 attached -> 3 printed.
        expect(images.filter((src) => src?.includes('/storage/shirt-')).length).toBe(3);
    });

    it('keeps pants artwork on the pants sheet and shirt artwork on the shirt sheet', () => {
        openDetail(
            makeOrder({
                items: [
                    { item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 5 },
                    { item_type: 'pants', size_group: 'adults', size_label: 'M', quantity: 5 },
                ],
                specification: {
                    screen_print_detail: JSON.stringify({
                        schema: 'spec-v2',
                        mode: 'matrix',
                        shirt_specs: { pattern_id: '1' },
                        pants_specs: { pattern_id: '2' },
                    }),
                },
                shirt_artwork_urls: ['/storage/shirt-a.webp', '/storage/shirt-b.webp'],
                pants_artwork_urls: ['/storage/pants-a.webp'],
            }),
        );

        const pages = Array.from(document.querySelectorAll('.p-print-page'));
        const srcsOn = (page: Element) =>
            Array.from(page.querySelectorAll('img'))
                .map((i) => i.getAttribute('src'))
                .filter((src) => !src?.includes('/images/logo/'));
        const all = pages.map(srcsOn);

        const shirtPage = all.find((srcs) => srcs.some((s) => s?.includes('shirt-')));
        const pantsPage = all.find((srcs) => srcs.some((s) => s?.includes('pants-')));

        expect(shirtPage).toHaveLength(2);
        expect(pantsPage).toHaveLength(1);
        expect(shirtPage).not.toContain('/storage/pants-a.webp');
        expect(pantsPage).not.toContain('/storage/shirt-a.webp');
    });

    it('falls back to the general artwork when the garment has none of its own', () => {
        openDetail(
            makeOrder({
                artwork_url: '/storage/general.webp',
                shirt_artwork_urls: [],
            }),
        );

        expect(printedImages()).toContain('/storage/general.webp');
    });

    it('still shows the empty placeholder when nothing is attached at all', () => {
        openDetail(makeOrder({ shirt_artwork_urls: [] }));

        expect(screen.getAllByText('ไม่มีรูป Artwork').length).toBeGreaterThan(0);
    });

    it('puts the company logo on every printed sheet', () => {
        openDetail(makeOrder({ shirt_artwork_urls: ['/storage/a.webp'] }));

        const pages = Array.from(document.querySelectorAll('.p-print-page'));
        expect(pages.length).toBeGreaterThan(0);

        pages.forEach((page) => {
            const logos = Array.from(page.querySelectorAll('img')).filter((img) =>
                img.getAttribute('src')?.includes('/images/logo/'),
            );

            expect(logos.length).toBe(1);
        });
    });

    it('carries the order identity onto the work sheet', () => {
        openDetail(makeOrder({}));

        const page = document.querySelector('.p-print-page') as HTMLElement;

        expect(page.textContent).toContain('ORD-070');
        expect(page.textContent).toContain('หลายรูป');
        expect(page.textContent).toContain('ลูกค้า');
    });

    it('prints the size breakdown the order was placed with', () => {
        openDetail(
            makeOrder({
                items: [
                    { item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 7 },
                    { item_type: 'shirt', size_group: 'adults', size_label: 'L', quantity: 3 },
                ],
            }),
        );

        const page = document.querySelector('.p-print-page') as HTMLElement;

        expect(page.textContent).toContain('7');
        expect(page.textContent).toContain('3');
    });
});
