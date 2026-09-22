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
 * The bill no longer takes a general artwork or a job status: artwork belongs
 * to a garment, a colour house or a size table. Bills already on file carry
 * general artwork, though, and a duplicate copies it onto the new bill — so
 * the form still shows what is there and lets it be dropped, rather than
 * carrying it along unseen onto the printed sheets.
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

const savedOrder = (artworkMedia: Array<{ id: number; url: string }>) => ({
    id: 7,
    order_code: 'ORD-2026-00007',
    customer_id: 1,
    branch_id: 1,
    customer_name: 'โรงเรียนทดสอบ',
    customer_phone: '0812345678',
    contact_detail: '',
    job_name: 'งานทดสอบ',
    job_type: 'งานปัก',
    billing_date: '2026-09-01',
    billing_time: '10:00',
    due_date: '2026-09-20',
    delivery_method: 'pickup',
    shipping_address: '',
    discount_percent: 0,
    deposit_amount: 0,
    payment_method: 'cash',
    artwork_url: artworkMedia[0]?.url ?? null,
    shirt_artwork_urls: [],
    pants_artwork_urls: [],
    reference_designs: [],
    artwork_media: artworkMedia,
    items: [],
    specification: {
        decoded: {
            schema: 'spec-v2',
            mode: 'matrix',
            shirt_specs: { shirt_type_id: '21' },
        },
    },
});

const renderForm = (order?: ReturnType<typeof savedOrder>) =>
    render(
        <OrderCreatePage
            {...(props as unknown as PageProps)}
            {...(order ? { order } : {})}
        />,
    );

describe('general artwork on the order form', () => {
    it('is not offered on a new bill', () => {
        renderForm();

        expect(screen.queryByText(/Art Work ทั่วไป/)).toBeNull();
        expect(screen.queryByText('เลือกไฟล์ Art Work ทั่วไป')).toBeNull();
        expect(screen.queryByText('สถานะแบบ')).toBeNull();
        expect(screen.queryByText('คอนเฟิร์มแบบ')).toBeNull();
    });

    it('still takes artwork for each garment', () => {
        renderForm();

        // The garment uploads are the artwork path now, and stay.
        expect(screen.getByText('Art Work เสื้อ')).toBeInTheDocument();
    });

    it('stays silent on a saved bill that never had any', () => {
        renderForm(savedOrder([]));

        expect(screen.queryByText(/Art Work ทั่วไป/)).toBeNull();
    });

    it('shows what a saved bill already carries, and lets it be dropped', () => {
        renderForm(
            savedOrder([
                { id: 501, url: '/storage/old-general-1.webp' },
                { id: 502, url: '/storage/old-general-2.webp' },
            ]),
        );

        // Shown, so nothing rides along unseen onto the printed sheets...
        expect(
            screen.getByText('Art Work ทั่วไปที่แนบไว้เดิม'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/ระบบปิดการแนบ Art Work ทั่วไปแล้ว/),
        ).toBeInTheDocument();

        const removeButtons = screen.getAllByLabelText('ลบรูปที่บันทึกไว้');

        expect(removeButtons).toHaveLength(2);

        // ...but never added to: no picker, no drop zone.
        expect(screen.queryByText('เลือกไฟล์ Art Work ทั่วไป')).toBeNull();

        // Dropping one takes it out of the list; the other stays.
        fireEvent.click(removeButtons[0]);

        expect(screen.getAllByLabelText('ลบรูปที่บันทึกไว้')).toHaveLength(1);

        // And once the last one is gone the section goes with it.
        fireEvent.click(screen.getByLabelText('ลบรูปที่บันทึกไว้'));

        expect(screen.queryByText('Art Work ทั่วไปที่แนบไว้เดิม')).toBeNull();
    });
});
