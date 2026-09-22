import type * as InertiaModuleImport from '@inertiajs/react';
import { fireEvent, render, screen } from '@testing-library/react';
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
 * A ชุดพละ bill keeps its artwork per size table (kids / adults). Like the
 * colour houses of a กีฬาสี bill, those images used to come back as bare URLs
 * with no way to take one off. The form now gets each with its media id, so
 * a table's image is removed the same way any other saved artwork is — when
 * the bill is edited and when it is opened again as a new one.
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

const kidsRemoveButtons = () =>
    screen.queryAllByLabelText('ลบรูปที่บันทึกไว้ของ ตารางไซส์เด็ก');

/** The "แนบแล้ว N รูป (บันทึกแล้ว M)" line of the table that owns the given remove button. */
const attachedCountFor = (button: HTMLElement): string =>
    (
        button
            .closest('.border-t.border-slate-200')
            ?.querySelector('.text-xs.text-slate-500')?.textContent ?? ''
    ).replace(/\s+/g, ' ');

describe.each(['duplicate', 'edit'] as const)(
    'saved ชุดพละ artwork when the bill is opened to %s',
    (mode) => {
        it('reopens on Form 4, so the per-table artwork is there at all', () => {
            renderForm(mode);

            // The tables carry their artwork panels, which only Form 4 has;
            // the bill used to fall through to Form 1 and lose them.
            expect(screen.getByText(/Art Work ของชุดเด็ก/)).toBeInTheDocument();
            expect(
                screen.getByText(/Art Work ของชุดผู้ใหญ่/),
            ).toBeInTheDocument();
        });

        it('shows every saved image with a way to remove it', () => {
            renderForm(mode);

            expect(kidsRemoveButtons()).toHaveLength(2);
            expect(
                screen.getAllByLabelText(
                    'ลบรูปที่บันทึกไว้ของ ตารางไซส์ผู้ใหญ่',
                ),
            ).toHaveLength(1);
            expect(
                screen.getAllByAltText('Art Work ตารางไซส์เด็ก'),
            ).toHaveLength(2);
        });

        it('takes an image off the table and keeps the count honest', () => {
            renderForm(mode);

            expect(attachedCountFor(kidsRemoveButtons()[0])).toContain(
                'แนบแล้ว 2 รูป (บันทึกแล้ว 2)',
            );

            fireEvent.click(kidsRemoveButtons()[0]);

            expect(kidsRemoveButtons()).toHaveLength(1);
            expect(
                screen.getAllByAltText('Art Work ตารางไซส์เด็ก'),
            ).toHaveLength(1);
            expect(attachedCountFor(kidsRemoveButtons()[0])).toContain(
                'แนบแล้ว 1 รูป (บันทึกแล้ว 1)',
            );
            // The other table is untouched.
            expect(
                screen.getAllByLabelText(
                    'ลบรูปที่บันทึกไว้ของ ตารางไซส์ผู้ใหญ่',
                ),
            ).toHaveLength(1);

            fireEvent.click(kidsRemoveButtons()[0]);

            expect(kidsRemoveButtons()).toHaveLength(0);
            expect(screen.queryByAltText('Art Work ตารางไซส์เด็ก')).toBeNull();
        });
    },
);
