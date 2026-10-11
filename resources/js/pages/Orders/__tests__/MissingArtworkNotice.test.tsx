import type * as InertiaModuleImport from '@inertiajs/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
 * Artwork is not required to open a bill. Plenty are taken over the counter
 * from a sample the customer brought in or from a description, and the picture
 * follows later — so the form must not block the save. It is worth asking
 * about once, though, because a bill that reaches the floor without one is the
 * usual reason work comes back, and the confirmation step is the last place
 * anyone looks before it goes.
 */
const catalogs = {
    patterns: [{ id: 1, name: 'แพทเทิร์นมาตรฐาน' }],
    fabrics: [{ id: 2, name: 'Micro' }],
    fabric_colors: [{ id: 3, name: 'ขาว' }],
    neck_styles: [{ id: 4, name: 'คอกลม' }],
    neck_colors: [{ id: 5, name: 'กรมท่า' }],
    collars: [{ id: 6, name: 'คอกลม' }],
    placket_styles: [{ id: 7, name: 'สาบซ่อน' }],
    placket_outer_colors: [{ id: 8, name: 'กรมท่า' }],
    placket_inner_colors: [{ id: 9, name: 'กรมท่า' }],
    sleeve_cuffs: [{ id: 10, name: 'ปลายแขนตรง' }],
    panel_styles: [{ id: 11, name: 'ต่อข้าง' }],
    screen_colors: [{ id: 12, name: 'ขาว' }],
    embroidery_colors: [{ id: 13, name: 'ขาว' }],
    sublimations: [{ id: 14, name: 'เต็มตัว' }],
    leg_styles: [{ id: 15, name: 'ขาตรง' }],
    leg_cuffs: [{ id: 16, name: 'ปลายยาง' }],
};

const props = {
    branches: [{ id: 1, name: 'สาขาหนองบัวลำภู', code: '01', phone: null }],
    jobTypes: [{ id: 1, name: 'ปัก' }],
    shirtCatalogs: catalogs,
    pantsCatalogs: catalogs,
    shirtTypes: [{ id: 21, name: 'เสื้อโปโล' }],
    pantsTypes: [{ id: 31, name: 'กางเกงขาสั้น' }],
    kidsSizes: ['JS', 'JM'],
    adultSizes: ['M', 'L'],
    defaultBranchId: 1,
};

/** Every box the form insists on before it will offer to save. */
const completeShirtSpec = {
    shirt_type_id: '21',
    pattern_id: '1',
    fabric_id: '2',
    fabric_color_id: '3',
    neck_style_id: '4',
    neck_color_id: '5',
    collar_id: '6',
    placket_style_id: '7',
    placket_outer_color_id: '8',
    placket_inner_color_id: '9',
    sleeve_cuff_id: '10',
    screen_color_id: '12',
    embroidery_color_id: '13',
    sublimation_id: '14',
    sleeve_style_text: 'ธรรมดา',
    piping_style_text: '-',
    stripe_style_text: '-',
    screen_text: 'โลโก้โรงเรียน',
    embroidery_code_text: 'EMB-1',
    embroidery_note_text: 'อกซ้าย',
};

/**
 * A bill complete enough that the form offers to save it: one shirt sheet with
 * a size, a count and a price, and a spec with nothing left blank.
 */
const completeBill = (
    over: Record<string, unknown> = {},
): Record<string, unknown> => ({
    // Carries no id: this is the form opened on a copy of an earlier bill, so
    // it is a new bill with everything already typed in — which is the only
    // way to reach the confirmation step without filling twenty boxes by hand.
    duplicate_from_id: 11,
    customer_id: 1,
    branch_id: 1,
    customer_name: 'โรงเรียนทดสอบ',
    job_name: 'งานทดสอบคำเตือนรูป',
    job_type: 'ปัก',
    billing_date: '2026-10-11',
    billing_time: '10:00',
    due_date: '2026-10-29',
    delivery_method: 'pickup',
    discount_percent: 0,
    deposit_amount: 0,
    payment_method: 'cash',
    items: [
        {
            item_type: 'separate_shirt',
            size_group: 'kids',
            size_tier: 'kids',
            size_label: 'JM',
            shirt_style: 'short',
            quantity: 10,
            unit_price: 250,
        },
    ],
    specification: {
        pattern_id: 1,
        fabric_id: 2,
        decoded: {
            schema: 'spec-v3',
            mode: 'matrix',
            garment_specs: { shirt_kids_short: completeShirtSpec },
            shirt_specs: completeShirtSpec,
        },
    },
    ...over,
});

const renderForm = (order: Record<string, unknown>) =>
    render(
        <OrderCreatePage
            {...(props as unknown as PageProps)}
            order={order as never}
        />,
    );

/** Opens the confirmation step the way the footer button does. */
const save = () => {
    const button = screen
        .getAllByRole('button')
        .find((node) => /บันทึกใบสั่งผลิต/.test(node.textContent ?? ''));

    fireEvent.click(button!);
};

const confirmDialog = (): HTMLElement =>
    screen
        .getAllByRole('dialog')
        .find((node) =>
            /ยืนยันการบันทึก/.test(node.textContent ?? ''),
        ) as HTMLElement;

describe('the confirmation step on a bill with no artwork', () => {
    it('is reached at all, because artwork was never required', () => {
        renderForm(completeBill());
        save();

        expect(confirmDialog()).toBeInTheDocument();
    });

    it('says the bill carries no picture and what the receipt will show', () => {
        renderForm(completeBill());
        save();

        const notice = within(confirmDialog()).getByTestId('no-artwork-notice');

        expect(notice).toHaveTextContent('ยังไม่ได้แนบรูปงาน');
        expect(notice).toHaveTextContent('บันทึกต่อได้ตามปกติ');
        expect(notice).toHaveTextContent('ไม่ได้แนบรูปภาพ');
    });

    /**
     * Asking is not blocking. The way on stays, and says plainly what it does,
     * so nobody has to wonder whether the bill will save.
     */
    it('offers a way back and a way on, both named for what they do', () => {
        renderForm(completeBill());
        save();

        const dialog = within(confirmDialog());

        expect(
            dialog.getByRole('button', { name: 'กลับไปแนบรูป' }),
        ).toBeInTheDocument();
        expect(
            dialog.getByRole('button', { name: 'บันทึกโดยไม่มีรูป' }),
        ).toBeInTheDocument();
        expect(dialog.queryByRole('button', { name: 'ยกเลิก' })).toBeNull();
    });
});

describe('the confirmation step on a bill that has a picture', () => {
    const withArtwork = () =>
        completeBill({
            shirt_artwork_media: [
                {
                    id: 900,
                    url: 'https://example.test/art.webp',
                    batch: 'shirt_kids_short',
                },
            ],
        });

    it('says nothing about artwork', () => {
        renderForm(withArtwork());
        save();

        expect(
            within(confirmDialog()).queryByTestId('no-artwork-notice'),
        ).toBeNull();
    });

    it('keeps the ordinary buttons', () => {
        renderForm(withArtwork());
        save();

        const dialog = within(confirmDialog());

        expect(
            dialog.getByRole('button', { name: 'ยกเลิก' }),
        ).toBeInTheDocument();
        expect(
            dialog.getByRole('button', { name: /ยืนยันและบันทึก/ }),
        ).toBeInTheDocument();
        expect(
            dialog.queryByRole('button', { name: 'บันทึกโดยไม่มีรูป' }),
        ).toBeNull();
    });
});
