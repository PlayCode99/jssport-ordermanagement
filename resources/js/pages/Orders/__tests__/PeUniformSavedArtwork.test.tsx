import type * as InertiaModuleImport from '@inertiajs/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OrderCreatePage from '@/pages/Orders/Create';

type InertiaModule = typeof InertiaModuleImport;
type PageProps = Parameters<typeof OrderCreatePage>[0];

vi.mock('@inertiajs/react', async () => {
    const actual = await vi.importActual<InertiaModule>('@inertiajs/react');

    return {
        ...actual,
        Head: () => null,
        router: {
            get: vi.fn(),
            visit: vi.fn(),
            post: vi.fn(),
            reload: vi.fn(),
        },
        usePage: () => ({
            props: { currentTeam: null },
            url: '/orders/create',
        }),
    };
});

/**
 * ชุดพละ is Form 1's size-table form with a different name on the bill, so it
 * takes its artwork the same way Form 1 does: through the one Art Work dialog,
 * pinned to the sheets the bill will produce. It used to carry a second
 * gallery per size table as well, which put the same picture on the bill twice
 * and never reached a production sheet.
 */
const catalogs = {
    patterns: [{ id: 1, name: 'แพทเทิร์นมาตรฐาน' }],
    fabrics: [{ id: 2, name: 'ผ้าไมโคร' }],
    fabric_colors: [{ id: 3, name: 'ขาว' }],
    neck_styles: [{ id: 4, name: 'คอกลม' }],
    neck_colors: [{ id: 5, name: 'ขาว' }],
    collars: [{ id: 6, name: 'ปกธรรมดา' }],
    placket_styles: [{ id: 7, name: 'สาบตรง' }],
    placket_outer_colors: [{ id: 8, name: 'ขาว' }],
    placket_inner_colors: [{ id: 9, name: 'ขาว' }],
    sleeve_cuffs: [{ id: 10, name: 'ปลายแขนจั๊ม' }],
    panel_styles: [{ id: 11, name: 'ต่อข้าง' }],
    screen_colors: [{ id: 12, name: 'ดำ' }],
    embroidery_colors: [{ id: 13, name: 'ทอง' }],
    sublimations: [{ id: 14, name: 'ซับ A' }],
    leg_styles: [{ id: 15, name: 'ขาตรง' }],
    leg_cuffs: [{ id: 16, name: 'ปลายขาจั๊ม' }],
};

const props = {
    branches: [{ id: 1, name: 'สาขาหนองบัวลำภู', code: '01', phone: null }],
    jobTypes: [{ id: 1, name: 'งานปัก' }],
    shirtCatalogs: catalogs,
    pantsCatalogs: catalogs,
    shirtTypes: [{ id: 21, name: 'เสื้อโปโล' }],
    pantsTypes: [{ id: 31, name: 'กางเกงขาสั้น' }],
    kidsSizes: ['JS', 'JM'],
    adultSizes: ['M', 'L'],
    defaultBranchId: 1,
};

const tableArtwork = {
    kids: [
        { id: 701, url: '/storage/kids-1.webp' },
        { id: 702, url: '/storage/kids-2.webp' },
    ],
    adults: [{ id: 703, url: '/storage/adults-1.webp' }],
};

/** A saved ชุดพละ bill with both size tables, as the edit or duplicate page sends it. */
const peUniformOrder = (mode: 'edit' | 'duplicate') => ({
    id: mode === 'edit' ? 11 : null,
    order_code: mode === 'edit' ? 'ORD-2026-00011' : null,
    duplicate_from_id: mode === 'duplicate' ? 11 : null,
    customer_id: 1,
    branch_id: 1,
    customer_name: 'โรงเรียนทดสอบ',
    customer_phone: '0812345678',
    contact_detail: '',
    job_name: 'ชุดพละ 2569',
    job_type: 'งานปัก',
    billing_date: '2026-09-01',
    billing_time: '10:00',
    due_date: mode === 'edit' ? '2026-09-20' : '',
    delivery_method: 'pickup',
    shipping_address: '',
    discount_percent: 0,
    deposit_amount: 0,
    payment_method: 'cash',
    artwork_url: null,
    shirt_artwork_urls: [],
    pants_artwork_urls: [],
    reference_designs: [],
    pe_uniform_artwork_urls: {
        kids: tableArtwork.kids.map((media) => media.url),
        adults: tableArtwork.adults.map((media) => media.url),
    },
    pe_uniform_artwork_media: tableArtwork,
    items: [
        {
            item_type: 'set',
            size_group: 'kids',
            size_label: 'JM',
            shirt_style: 'short',
            pants_style: 'short',
            quantity: 10,
            unit_price: 250,
        },
        {
            item_type: 'set',
            size_group: 'adults',
            size_label: 'L',
            shirt_style: 'short',
            pants_style: 'short',
            quantity: 5,
            unit_price: 300,
        },
    ],
    specification: {
        decoded: {
            schema: 'spec-v2',
            mode: 'pe_uniform',
            shirt_specs: { shirt_type_id: '21' },
        },
    },
});

const renderForm = (mode: 'edit' | 'duplicate') =>
    render(
        <OrderCreatePage
            {...(props as unknown as PageProps)}
            order={peUniformOrder(mode) as never}
        />,
    );

/** The mode buttons: the one the bill reopened on carries the filled style. */
const modeButton = (name: RegExp): HTMLElement =>
    screen.getByRole('button', { name });

describe.each(['duplicate', 'edit'] as const)(
    'a saved ชุดพละ bill opened to %s',
    (mode) => {
        it('reopens on Form 4 instead of falling through to Form 1', () => {
            renderForm(mode);

            expect(modeButton(/ชุดพละ \(Form 4\)/).className).toContain(
                'bg-primary',
            );
            expect(
                modeButton(/แพทเทรินเสื้อเหมือนกัน \(Form 1\)/).className,
            ).not.toContain('bg-primary');
        });

        it('takes its artwork through the one dialog, not a gallery per table', () => {
            renderForm(mode);

            expect(screen.getByText(/Art Work ของใบงาน/)).toBeInTheDocument();
            expect(screen.queryByText(/Art Work ของชุดเด็ก/)).toBeNull();
            expect(screen.queryByText(/Art Work ของชุดผู้ใหญ่/)).toBeNull();
        });
    },
);
