import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Counter from '@/pages/Counter';

const { mockRouterGet, mockRouterVisit } = vi.hoisted(() => ({
    mockRouterGet: vi.fn(),
    mockRouterVisit: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    router: { get: mockRouterGet, visit: mockRouterVisit, delete: vi.fn(), reload: vi.fn() },
    usePage: () => ({ props: { currentTeam: null, auth: { user: { role: 'admin' } } }, url: '/counter' }),
}));

vi.mock('jsbarcode', () => ({ default: () => undefined }));

const emptyFloorStats = {
    print_room: { new_job: 0, new_job_qty: 0, printer_1: 0, printer_2: 0, printer_3: 0, completed: 0, completed_qty: 0 },
    cutting: { new_job: 0, new_job_qty: 0, assigned: 0, completed: 0, completed_qty: 0 },
    heat_press: { new_job: 0, new_job_qty: 0, assigned: 0, revising: 0, completed: 0, completed_qty: 0 },
    sewing: { new_job: 0, new_job_qty: 0, assigned: 0, completed: 0, completed_qty: 0 },
    embroidery: { new_job: 0, new_job_qty: 0, assigned: 0, completed: 0, completed_qty: 0 },
    screen_flex: { new_job: 0, new_job_qty: 0, assigned: 0, revising: 0, completed: 0, completed_qty: 0 },
    qc: { new_job: 0, new_job_qty: 0, pending_inspect: 0, completed: 0, completed_qty: 0 },
    shipping: { pending_ship: 0, pending_ship_qty: 0, store_pickup: 0, courier: 0, onsite_delivery: 0, completed_qty: 0 },
};

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
        customer: { name: 'โรงเรียนทดสอบ', phone: '0812345678', line_fb: '@testschool' },
        pricing: { total_amount: 3000, discount_percent: 10, discount_amount: 300, net_amount: 2700, paid_amount: 1000 },
        specification: null,
        spec_sections: {
            shirt: [
                { label: 'แพทเทิร์น', value: 'แพทเทิร์นมาตรฐาน' },
                { label: 'สีผ้า', value: 'ขาว' },
            ],
            pants: [{ label: 'แบบขา', value: 'ขาตรง' }],
        },
        items: [
            { item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 10, unit_price: 200, total_price: 2000 },
            { item_type: 'pants', size_group: 'adults', size_label: 'L', quantity: 4, unit_price: 250, total_price: 1000 },
        ],
        routings: [],
        receipts: [
            { receipt_code: 'RC-001', payment_date: '2026-09-02', payment_type: 'deposit', payment_method: 'cash', amount_paid: 1000, note: null },
        ],
        artwork_url: null,
        shirt_artwork_urls: [],
        pants_artwork_urls: [],
        reference_designs: [],
        ...(over.details as Record<string, unknown> ?? {}),
    },
    // `details` is merged above, so it must not be clobbered by the outer spread.
    ...Object.fromEntries(Object.entries(over).filter(([key]) => key !== 'details')),
});

/** Opens the order detail and prints, returning the HTML written to the print window. */
const printedHtml = (row = makeRow()): string => {
    let written = '';
    const fakeDoc = {
        open: vi.fn(),
        write: (html: string) => { written += html; },
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
            floorStats={emptyFloorStats}
            filters={{} as never}
            orders={[row as never]}
            pagination={{ current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 }}
        />,
    );

    fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Print เอกสาร/ }));

    return written;
};

describe('counter work-sheet PDF', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        // jsdom has no scroll implementation; the table scrolls itself on page change.
        Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => undefined);
        vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(() => undefined);
    });

    it('prints on A4 portrait', () => {
        expect(printedHtml()).toContain('size: A4 portrait');
    });

    it('carries the order identity', () => {
        const html = printedHtml();

        expect(html).toContain('ORD-2026-00042');
        expect(html).toContain('เสื้อกีฬาโรงเรียน');
        expect(html).toContain('โรงเรียนทดสอบ');
        expect(html).toContain('สาขาหนองบัวลำภู');
    });

    it('shows the money the customer is asked to pay', () => {
        const html = printedHtml();

        // gross 3,000 - 300 discount = 2,700, of which 1,000 is already paid.
        expect(html).toContain('3,000');
        expect(html).toContain('2,700');
        expect(html).toContain('1,000');
    });

    it('lists every ordered line with its size and quantity', () => {
        const html = printedHtml();

        expect(html).toContain('M');
        expect(html).toContain('L');
        expect(html).toContain('10');
        expect(html).toContain('4');
    });

    it('prints the shirt and pants specification that was saved', () => {
        const html = printedHtml();

        expect(html).toContain('แพทเทิร์นมาตรฐาน');
        expect(html).toContain('ขาว');
        expect(html).toContain('ขาตรง');
    });

    it('escapes customer text instead of letting it break the markup', () => {
        const html = printedHtml(
            makeRow({ details: { customer: { name: '<script>alert(1)</script>', phone: '08', line_fb: null } } }) as never,
        );

        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });
});
