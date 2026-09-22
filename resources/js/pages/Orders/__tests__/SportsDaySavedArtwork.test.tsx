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
 * A colour house's artwork on a saved กีฬาสี bill used to be shown as bare
 * URLs with no way to take one off: re-opening the bill (or opening it again
 * as a new one) carried every image along whether it was wanted or not. The
 * form now gets each image with its media id, so a house image is removed
 * the same way any other saved artwork is — and stays counted honestly.
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

const houseArtwork = {
    '0': [
        { id: 601, url: '/storage/red-1.webp' },
        { id: 602, url: '/storage/red-2.webp' },
    ],
    '1': [{ id: 603, url: '/storage/blue-1.webp' }],
};

/** A saved กีฬาสี bill with two colour houses, as the edit or duplicate page sends it. */
const sportsDayOrder = (mode: 'edit' | 'duplicate') => ({
    id: mode === 'edit' ? 9 : null,
    order_code: mode === 'edit' ? 'ORD-2026-00009' : null,
    duplicate_from_id: mode === 'duplicate' ? 9 : null,
    customer_id: 1,
    branch_id: 1,
    customer_name: 'โรงเรียนทดสอบ',
    customer_phone: '0812345678',
    contact_detail: '',
    job_name: 'กีฬาสี 2569',
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
    sports_day_artwork_urls: {
        '0': houseArtwork['0'].map((media) => media.url),
        '1': houseArtwork['1'].map((media) => media.url),
    },
    sports_day_artwork_media: houseArtwork,
    items: [],
    specification: {
        decoded: {
            schema: 'spec-v2',
            mode: 'sports_day',
            shirt_specs: { shirt_type_id: '21' },
            sports_day_groups: [
                {
                    team_name: 'คณะสีแดง',
                    fabric_color_id: '3',
                    rows: [
                        {
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_qty: 10,
                            shirt_price: 200,
                            pants_qty: 0,
                            pants_price: 0,
                        },
                    ],
                },
                {
                    team_name: 'คณะสีน้ำเงิน',
                    fabric_color_id: '3',
                    rows: [
                        {
                            size_group: 'adults',
                            size_label: 'L',
                            shirt_qty: 5,
                            shirt_price: 200,
                            pants_qty: 0,
                            pants_price: 0,
                        },
                    ],
                },
            ],
        },
    },
});

const renderForm = (mode: 'edit' | 'duplicate') =>
    render(
        <OrderCreatePage
            {...(props as unknown as PageProps)}
            order={sportsDayOrder(mode) as never}
        />,
    );

const redRemoveButtons = () =>
    screen.queryAllByLabelText('ลบรูปที่บันทึกไว้ของ คณะสีแดง');

/** The "แนบแล้ว N รูป (บันทึกแล้ว M)" line of the house that owns the given remove button. */
const attachedCountFor = (button: HTMLElement): string =>
    (
        button
            .closest('.rounded-lg.border.border-slate-200.bg-white.p-2\\.5')
            ?.querySelector('.text-xs.text-slate-500')?.textContent ?? ''
    ).replace(/\s+/g, ' ');

describe.each(['duplicate', 'edit'] as const)(
    'saved colour-house artwork when the bill is opened to %s',
    (mode) => {
        it('shows every saved image with a way to remove it', () => {
            renderForm(mode);

            expect(redRemoveButtons()).toHaveLength(2);
            expect(
                screen.getAllByLabelText('ลบรูปที่บันทึกไว้ของ คณะสีน้ำเงิน'),
            ).toHaveLength(1);
            expect(screen.getAllByAltText('Art Work คณะสีแดง')).toHaveLength(2);
        });

        it('takes an image off the house and keeps the count honest', () => {
            renderForm(mode);

            expect(attachedCountFor(redRemoveButtons()[0])).toContain(
                'แนบแล้ว 2 รูป (บันทึกแล้ว 2)',
            );

            fireEvent.click(redRemoveButtons()[0]);

            expect(redRemoveButtons()).toHaveLength(1);
            expect(screen.getAllByAltText('Art Work คณะสีแดง')).toHaveLength(1);
            expect(attachedCountFor(redRemoveButtons()[0])).toContain(
                'แนบแล้ว 1 รูป (บันทึกแล้ว 1)',
            );
            // The other house is untouched.
            expect(
                screen.getAllByLabelText('ลบรูปที่บันทึกไว้ของ คณะสีน้ำเงิน'),
            ).toHaveLength(1);

            fireEvent.click(redRemoveButtons()[0]);

            expect(redRemoveButtons()).toHaveLength(0);
            expect(screen.queryByAltText('Art Work คณะสีแดง')).toBeNull();
        });
    },
);
