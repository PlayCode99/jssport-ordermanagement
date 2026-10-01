import type * as InertiaModuleImport from '@inertiajs/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Counter from '@/pages/Counter';

type InertiaModule = typeof InertiaModuleImport;

/**
 * The receipt is fitted to one A4 sheet. A bill whose sheets are sewn
 * differently now prints a spec block each, which is the one thing that can
 * make it taller — so the document this bill produces is written out for a
 * real renderer to measure rather than trusted to a jsdom layout, which has
 * none.
 */
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
        usePage: () => ({ props: { currentTeam: null }, url: '/counter' }),
    };
});

const emptyFloorStats = {
    print_room: {
        new_job: 0,
        new_job_qty: 0,
        printer_1: 0,
        printer_2: 0,
        printer_3: 0,
        completed: 0,
        completed_qty: 0,
    },
    cutting: {
        new_job: 0,
        new_job_qty: 0,
        assigned: 0,
        completed: 0,
        completed_qty: 0,
    },
    heat_press: {
        new_job: 0,
        new_job_qty: 0,
        assigned: 0,
        revising: 0,
        completed: 0,
        completed_qty: 0,
    },
    sewing: {
        new_job: 0,
        new_job_qty: 0,
        assigned: 0,
        completed: 0,
        completed_qty: 0,
    },
    embroidery: {
        new_job: 0,
        new_job_qty: 0,
        assigned: 0,
        completed: 0,
        completed_qty: 0,
    },
    screen_flex: {
        new_job: 0,
        new_job_qty: 0,
        assigned: 0,
        revising: 0,
        completed: 0,
        completed_qty: 0,
    },
    qc: {
        new_job: 0,
        new_job_qty: 0,
        pending_inspect: 0,
        completed: 0,
        completed_qty: 0,
    },
    shipping: {
        pending_ship: 0,
        pending_ship_qty: 0,
        store_pickup: 0,
        courier: 0,
        onsite_delivery: 0,
        completed_qty: 0,
    },
};

const specRows = (text: string) => [
    { label: 'แพทเทิร์น', value: 'แพทเทิร์นมาตรฐาน' },
    { label: 'เนื้อผ้า', value: 'ผ้าไมโคร' },
    { label: 'สีผ้า', value: 'ขาว' },
    { label: 'แบบคอ', value: 'คอกลม' },
    { label: 'สีแบบคอ', value: 'ขาว' },
    { label: 'ปก', value: 'ปกธรรมดา' },
    { label: 'แบบสาบ', value: 'สาบตรง' },
    { label: 'สีสาบ (ใน)', value: 'ขาว' },
    { label: 'สีสาบ (นอก)', value: 'ขาว' },
    { label: 'ปลายแขน', value: 'จั๊ม' },
    { label: 'สีสกรีน', value: 'ดำ' },
    { label: 'สีงานปัก', value: 'ทอง' },
    { label: 'ซับลิเมชั่น', value: 'ซับ A' },
    { label: 'ข้อความสกรีน', value: text },
];

const item = (
    sizeLabel: string,
    style: string,
    quantity: number,
    type = 'separate_shirt',
) => ({
    item_type: type,
    size_group: 'adults',
    size_label: sizeLabel,
    quantity,
    unit_price: 200,
    total_price: quantity * 200,
    ...(type === 'separate_pants'
        ? { pants_style: style }
        : { shirt_style: style }),
});

const makeRow = (over: Record<string, unknown> = {}) => ({
    id: 1,
    billing_date: '2026-09-02',
    billing_time: '10:30',
    due_date: '2026-09-12',
    order_code: 'ORD-2026-00042',
    order_item_count: 14,
    branch_name: 'สาขาหนองบัวลำภู',
    customer_name: 'โรงเรียนทดสอบ',
    job_type: 'ปัก',
    order_status: 'confirmed',
    status: 'cutting' as const,
    payment_status: 'deposit' as const,
    receiver_name: 'Owner 01',
    details: {
        order_code: 'ORD-2026-00042',
        job_name: 'เสื้อกีฬาโรงเรียน',
        job_type: 'ปัก',
        order_status: 'confirmed',
        billing_date: '2026-09-02',
        due_date: '2026-09-12',
        branch_name: 'สาขาหนองบัวลำภู',
        delivery_method: 'pickup',
        shipping_address: null,
        customer: {
            name: 'โรงเรียนทดสอบ',
            phone: '0812345678',
            line_fb: '@testschool',
        },
        pricing: {
            total_amount: 3000,
            discount_percent: 10,
            discount_amount: 300,
            net_amount: 2700,
            paid_amount: 1000,
        },
        specification: null,
        spec_sections: {
            shirt: [
                { label: 'แพทเทิร์น', value: 'แพทเทิร์นมาตรฐาน' },
                { label: 'สีผ้า', value: 'ขาว' },
            ],
            pants: [{ label: 'แบบขา', value: 'ขาตรง' }],
        },
        items: [
            {
                item_type: 'shirt',
                size_group: 'adults',
                size_label: 'M',
                quantity: 10,
                unit_price: 200,
                total_price: 2000,
            },
            {
                item_type: 'pants',
                size_group: 'adults',
                size_label: 'L',
                quantity: 4,
                unit_price: 250,
                total_price: 1000,
            },
        ],
        routings: [],
        receipts: [
            {
                receipt_code: 'RC-001',
                payment_date: '2026-09-02',
                payment_type: 'deposit',
                payment_method: 'cash',
                amount_paid: 1000,
                note: null,
            },
        ],
        artwork_url: null,
        shirt_artwork_urls: [],
        pants_artwork_urls: [],
        reference_designs: [],
        ...((over.details as Record<string, unknown>) ?? {}),
    },
    // `details` is merged above, so it must not be clobbered by the outer spread.
    ...Object.fromEntries(
        Object.entries(over).filter(([key]) => key !== 'details'),
    ),
});

/** A bill whose four sheets are each sewn from a different spec. */
const row = makeRow({
    order_code: '01-2026-00001',
    job_type: 'ซับลิเมชั่น + ปัก + สกรีน',
    details: {
        order_code: '01-2026-00001',
        job_name: 'UAT หลายสเปก โรงเรียนทดสอบการพิมพ์ชื่อยาว',
        job_type: 'ซับลิเมชั่น + ปัก + สกรีน',
        items: [
            item('M', 'short', 10),
            item('L', 'short', 6),
            item('XL', 'long', 4),
            item('L', 'long', 4, 'separate_pants'),
        ],
        spec_sections: {
            shirt: specRows('โลโก้เด็ก'),
            pants: specRows('ลายข้างขา'),
            batches: {
                shirt_kids_short: specRows('โลโก้เด็ก'),
                shirt_junior_short: specRows('โลโก้ประถม'),
                shirt_adults_long: specRows('โลโก้ผู้ใหญ่'),
                pants_adults_long: specRows('ลายข้างขา'),
            },
        },
    },
});

describe('the receipt a bill with four different specs prints', () => {
    it('builds a document a real renderer can be given to measure', () => {
        // jsdom has no scroll implementation; the table scrolls itself when the
        // detail dialog opens.
        Element.prototype.scrollTo =
            Element.prototype.scrollTo ?? (() => undefined);
        vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(
            () => undefined,
        );

        let written = '';
        const fakeDoc = {
            open: vi.fn(),
            write: (html: string) => {
                written += html;
            },
            close: vi.fn(),
            images: [],
            querySelectorAll: () => [],
        };

        vi.spyOn(window, 'open').mockReturnValue({
            document: fakeDoc,
            focus: vi.fn(),
            print: vi.fn(),
            close: vi.fn(),
        } as unknown as Window);

        render(
            <Counter
                branches={[{ value: '1', label: 'สาขาหนองบัวลำภู' }]}
                floorStats={emptyFloorStats as never}
                filters={{} as never}
                orders={[row as never]}
                deliveryCalendar={{
                    month: '2026-09',
                    today: '2026-09-30',
                    days: {},
                }}
                pagination={{
                    current_page: 1,
                    last_page: 1,
                    per_page: 10,
                    total: 1,
                    from: 1,
                    to: 1,
                }}
            />,
        );

        fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);
        fireEvent.click(screen.getByRole('button', { name: /Print เอกสาร/ }));

        expect(written).toContain('size: A4 portrait');
        // Four specs that differ means four blocks; identical ones would fold
        // into one, which is what nearly every bill prints.
        expect(written).toContain('สเปกเสื้อ · เสื้อ เด็ก · แขนสั้น');
        expect(written).toContain('สเปกกางเกง · กางเกง ผู้ใหญ่ · ขายาว');

        // Handed to whatever wants to render it for real. jsdom has no layout,
        // so page fit is measured by printing this document with a browser and
        // reading the PDF back, never by measuring it here.
        (globalThis as { __printedReceiptHtml?: string }).__printedReceiptHtml =
            written;
    });
});
