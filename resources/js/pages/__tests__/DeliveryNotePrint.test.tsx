import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Counter from '@/pages/Counter';

const { mockRouterPost } = vi.hoisted(() => ({ mockRouterPost: vi.fn() }));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    router: {
        get: vi.fn(),
        visit: vi.fn(),
        delete: vi.fn(),
        reload: vi.fn(),
        post: mockRouterPost,
    },
    usePage: () => ({
        props: { currentTeam: null, auth: { user: { role: 'admin' } } },
        url: '/counter',
    }),
}));

vi.mock('jsbarcode', () => ({ default: () => undefined }));

const emptyDepartment = {
    new_job: 0,
    new_job_qty: 0,
    assigned: 0,
    completed: 0,
    completed_qty: 0,
};

const floorStats = {
    print_room: {
        new_job: 0,
        new_job_qty: 0,
        printer_1: 0,
        printer_2: 0,
        printer_3: 0,
        completed: 0,
        completed_qty: 0,
    },
    cutting: emptyDepartment,
    heat_press: { ...emptyDepartment, revising: 0 },
    sewing: emptyDepartment,
    embroidery: emptyDepartment,
    screen_flex: emptyDepartment,
    qc: { pending: 0, passed: 0, rejected: 0 },
    shipping: { pending: 0, shipped: 0 },
} as never;

/**
 * A bill of two shirt sizes and one trouser size, with a 10% receipt
 * discount already taken: 2,350 of goods, 2,115 net.
 */
const row = (over: Record<string, unknown> = {}) => ({
    id: 7,
    billing_date: '2026-09-01',
    billing_time: '09:00',
    due_date: '2026-09-20',
    order_code: 'ORD-2026-00007',
    order_item_count: 13,
    branch_name: 'สาขาหนองบัวลำภู',
    customer_name: 'โรงเรียนทดสอบ',
    job_type: 'สกรีน',
    order_status: 'completed',
    status: 'completed',
    receiver_name: 'Owner01',
    details: {
        order_code: 'ORD-2026-00007',
        job_name: 'เสื้อกีฬาโรงเรียน',
        job_type: 'สกรีน',
        order_status: 'completed',
        branch_name: 'สาขาหนองบัวลำภู',
        due_date: '2026-09-20 00:00:00',
        delivery_method: 'shipping',
        shipping_address: '123 ถนนทดสอบ',
        customer: { name: 'โรงเรียนทดสอบ', phone: '0812345678', line_fb: null },
        pricing: {
            total_amount: 2350,
            discount_percent: 10,
            discount_amount: 235,
            net_amount: 2115,
            delivery_discount_percent: 0,
            paid_amount: 0,
            charges: [],
        },
        can_discount_delivery_note: true,
        items: [
            {
                item_type: 'separate_shirt',
                size_group: 'kids',
                size_tier: 'kids',
                size_label: 'S',
                shirt_style: 'short',
                quantity: 5,
                unit_price: 200,
                total_price: 1000,
            },
            {
                item_type: 'separate_shirt',
                size_group: 'kids',
                size_tier: 'kids',
                size_label: 'M',
                shirt_style: 'short',
                quantity: 3,
                unit_price: 200,
                total_price: 600,
            },
            {
                item_type: 'separate_pants',
                size_group: 'kids',
                size_tier: 'kids',
                size_label: 'S',
                pants_style: 'long',
                quantity: 5,
                unit_price: 150,
                total_price: 750,
            },
        ],
        routings: [],
        receipts: [],
        artwork_url: null,
        shirt_artwork_urls: [],
        pants_artwork_urls: [],
        reference_designs: [],
        ...((over.details as Record<string, unknown>) ?? {}),
    },
    ...Object.fromEntries(
        Object.entries(over).filter(([key]) => key !== 'details'),
    ),
});

const renderCounter = (counterRow = row()) =>
    render(
        <Counter
            branches={[{ value: '1', label: 'สาขาหนองบัวลำภู' }]}
            floorStats={floorStats}
            filters={{} as never}
            orders={[counterRow as never]}
            deliveryCalendar={{
                month: '2026-09',
                today: '2026-09-02',
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

/** Opens the delivery-note popup the ใบจัดส่ง column leads to. */
const openNote = (counterRow = row()) => {
    renderCounter(counterRow);
    fireEvent.click(screen.getAllByRole('button', { name: /เปิด PDF/ })[0]);

    return screen.getByRole('dialog');
};

/** Prints from the popup and returns the markup written to the print window. */
const printedHtml = (counterRow = row()): string => {
    let written = '';
    vi.spyOn(window, 'open').mockReturnValue({
        document: {
            open: vi.fn(),
            write: (html: string) => {
                written += html;
            },
            close: vi.fn(),
            images: [],
            querySelectorAll: () => [],
        },
        focus: vi.fn(),
        print: vi.fn(),
        close: vi.fn(),
    } as unknown as Window);

    const dialog = openNote(counterRow);
    fireEvent.click(
        within(dialog).getByRole('button', { name: /พิมพ์ใบส่งของ/ }),
    );

    return written;
};

beforeEach(() => {
    mockRouterPost.mockReset();
    vi.restoreAllMocks();
    Element.prototype.scrollTo =
        Element.prototype.scrollTo ?? (() => undefined);
    vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(() => undefined);
});

describe('ใบจัดส่ง opens before it prints', () => {
    it('shows the goods rather than going straight to paper', () => {
        const openSpy = vi.spyOn(window, 'open');
        const dialog = openNote();

        expect(
            within(dialog).getByText(/ใบส่งสินค้า ORD-2026-00007/),
        ).toBeInTheDocument();
        expect(openSpy).not.toHaveBeenCalled();
    });

    it('lists type, size, quantity and price for every line', () => {
        const dialog = openNote();
        const table = within(dialog).getByRole('table');

        expect(within(table).getAllByText('เสื้อเด็ก · แขนสั้น')).toHaveLength(
            2,
        );
        expect(
            within(table).getByText('กางเกงเด็ก · ขายาว'),
        ).toBeInTheDocument();
        // The bill's 13 pieces and 2,350 of goods.
        expect(within(table).getByText('13')).toBeInTheDocument();
        expect(within(table).getByText('2,350.00')).toBeInTheDocument();
    });
});

describe("the note's own discount", () => {
    it('opens on the figure last saved for this bill', () => {
        const dialog = openNote(
            row({
                details: {
                    pricing: {
                        total_amount: 2350,
                        discount_percent: 10,
                        discount_amount: 235,
                        net_amount: 2115,
                        delivery_discount_percent: 5,
                        paid_amount: 0,
                    },
                },
            }),
        );

        expect(
            within(dialog).getByLabelText(/ส่วนลดใบส่งของเป็นเปอร์เซ็นต์/),
        ).toHaveValue(5);
    });

    it('opens empty on a bill that gives nothing away', () => {
        // Not "0". A zero in the box is a character to delete before typing,
        // and the keystroke that lands on it turns 5 into 05 — or 50.
        const dialog = openNote();

        expect(
            within(dialog).getByLabelText(/ส่วนลดใบส่งของเป็นเปอร์เซ็นต์/),
        ).toHaveValue(null);
    });

    it('takes the first keystroke as the whole figure', () => {
        const dialog = openNote();
        const box = within(dialog).getByLabelText(
            /ส่วนลดใบส่งของเป็นเปอร์เซ็นต์/,
        ) as HTMLInputElement;

        fireEvent.change(box, { target: { value: '5' } });

        expect(box).toHaveValue(5);
        // 2,115 less 5% = 2,009.25, not 2,115 less 50%.
        expect(within(dialog).getByText('฿ 2,009.25')).toBeInTheDocument();
    });

    it('prints a bill left empty as one with no discount at all', () => {
        const dialog = openNote();

        fireEvent.click(
            within(dialog).getByRole('button', { name: /พิมพ์ใบส่งของ/ }),
        );

        expect(mockRouterPost).not.toHaveBeenCalled();
    });

    it('works the new figure out as it is typed', () => {
        const dialog = openNote();

        fireEvent.change(
            within(dialog).getByLabelText(/ส่วนลดใบส่งของเป็นเปอร์เซ็นต์/),
            { target: { value: '10' } },
        );

        // 2,115 less 10% = 1,903.50.
        expect(within(dialog).getByText('- ฿ 211.50')).toBeInTheDocument();
        expect(within(dialog).getByText('฿ 1,903.50')).toBeInTheDocument();
    });

    it('saves the figure before printing, so both copies agree', () => {
        const dialog = openNote();

        fireEvent.change(
            within(dialog).getByLabelText(/ส่วนลดใบส่งของเป็นเปอร์เซ็นต์/),
            { target: { value: '10' } },
        );
        fireEvent.click(
            within(dialog).getByRole('button', { name: /พิมพ์ใบส่งของ/ }),
        );

        expect(mockRouterPost).toHaveBeenCalledWith(
            '/orders/7/delivery-discount',
            { delivery_discount_percent: 10 },
            expect.anything(),
        );
    });

    it('does not ask the server to save a figure that has not moved', () => {
        const dialog = openNote();

        fireEvent.click(
            within(dialog).getByRole('button', { name: /พิมพ์ใบส่งของ/ }),
        );

        expect(mockRouterPost).not.toHaveBeenCalled();
    });

    it('is read-only for someone who may not move it', () => {
        const dialog = openNote(
            row({ details: { can_discount_delivery_note: false } }),
        );

        expect(
            within(dialog).getByLabelText(/ส่วนลดใบส่งของเป็นเปอร์เซ็นต์/),
        ).toBeDisabled();
    });
});

describe('the printed note', () => {
    it('carries a line per size instead of one line for the whole job', () => {
        const html = printedHtml();

        expect(html).toContain('ใบส่งสินค้า');
        expect(html).toContain('เสื้อเด็ก · แขนสั้น');
        expect(html).toContain('กางเกงเด็ก · ขายาว');
        expect(html).toContain('รายการ');
        expect(html).toContain('ไซส์');
        expect(html).toContain('จำนวนเงิน');
        // Rows size themselves to their content. A fixed height per row is
        // what pushed everything past the first row off the page.
        expect(html).not.toContain('height: 96mm');
    });

    it('shows only one total when the note gives nothing away', () => {
        const html = printedHtml();

        expect(html).toContain('2,115.00');
        expect(html).not.toContain('ส่วนลด 0%');
    });

    it('shows the bill figure, the reduction and what is signed for', () => {
        const html = printedHtml(
            row({
                details: {
                    pricing: {
                        total_amount: 2350,
                        discount_percent: 10,
                        discount_amount: 235,
                        net_amount: 2115,
                        delivery_discount_percent: 10,
                        paid_amount: 0,
                    },
                },
            }),
        );

        expect(html).toContain('ยอดสุทธิตามบิล');
        expect(html).toContain('2,115.00');
        expect(html).toContain('ส่วนลดใบส่งของ 10%');
        expect(html).toContain('211.50');
        expect(html).toContain('ยอดที่ต้องชำระ');
        expect(html).toContain('1,903.50');
    });
});

/**
 * The gap this found in the app: a bill whose goods came to 1,670 while its
 * total read 2,520, because it carried 850 of "คิดเงินเพิ่มเติม" the note
 * said nothing about. A signed note has to account for every baht on it.
 */
describe('a bill that charges for more than garments', () => {
    const withCharges = () =>
        row({
            details: {
                pricing: {
                    total_amount: 2500,
                    discount_percent: 0,
                    discount_amount: 0,
                    net_amount: 2500,
                    delivery_discount_percent: 0,
                    paid_amount: 0,
                    charges: [
                        { label: 'ค่าบล็อคหน้า', amount: 400 },
                        { label: 'ค่าบล็อคหลัง', amount: 450 },
                    ],
                },
            },
        });

    it('names each charge in the popup beside the goods', () => {
        const dialog = openNote(withCharges());
        const table = within(dialog).getByRole('table');

        expect(within(table).getByText('ค่าบล็อคหน้า')).toBeInTheDocument();
        expect(within(table).getByText('ค่าบล็อคหลัง')).toBeInTheDocument();
        // 2,350 of goods and 850 of charges reconcile to the bill's total.
        expect(within(table).getByText('2,500.00')).toBeInTheDocument();
    });

    it('names each charge on the paper too', () => {
        const html = printedHtml(withCharges());

        expect(html).toContain('ค่าบล็อคหน้า');
        expect(html).toContain('ค่าบล็อคหลัง');
        expect(html).toContain('450.00');
    });

    it('shows the bill discount, so every step of the total can be followed', () => {
        const html = printedHtml(
            row({
                details: {
                    pricing: {
                        total_amount: 2500,
                        discount_percent: 10,
                        discount_amount: 250,
                        net_amount: 2250,
                        delivery_discount_percent: 0,
                        paid_amount: 0,
                        charges: [{ label: 'ค่าบล็อค', amount: 150 }],
                    },
                },
            }),
        );

        expect(html).toContain('รวมเป็นเงิน');
        expect(html).toContain('2,500.00');
        expect(html).toContain('ส่วนลดตามบิล 10%');
        expect(html).toContain('ยอดสุทธิตามบิล');
        expect(html).toContain('2,250.00');
    });
});

/**
 * What the note has to carry to be a document rather than a form. The first
 * version printed one row per bill at a fixed 96mm, so a bill of five lines
 * lost everything below the second: the rest of the goods, the total and
 * both signature boxes were clipped off the page.
 */
describe('the note reads as a delivered document', () => {
    it('names the shop, the branch and its phone', () => {
        const html = printedHtml();

        expect(html).toContain('เจ.เอส.สปอร์ต');
        expect(html).toContain('สาขาสาขาหนองบัวลำภู');
    });

    it('carries the customer, the address and how it travelled', () => {
        const html = printedHtml();

        expect(html).toContain('โรงเรียนทดสอบ');
        expect(html).toContain('123 ถนนทดสอบ');
        expect(html).toContain('วิธีส่งมอบ');
    });

    it('writes the amount out in words, which is what stops it being altered', () => {
        const html = printedHtml();

        // 2,115.00 payable with no delivery discount.
        expect(html).toContain('สองพันหนึ่งร้อยสิบห้าบาทถ้วน');
    });

    it('keeps both signature boxes and the receipt wording', () => {
        const html = printedHtml();

        expect(html).toContain('ผู้ส่งสินค้า');
        expect(html).toContain('ผู้รับสินค้า');
        expect(html).toContain(
            'ได้รับสินค้าตามรายการข้างบนนี้ไว้ถูกต้องครบถ้วนแล้ว',
        );
    });

    it('repeats the table head on a bill that runs past one page', () => {
        // A long bill paginates instead of being cut off at the page edge.
        expect(printedHtml()).toContain('display: table-header-group');
    });

    it('states one total, in the table foot and in the summary alike', () => {
        const html = printedHtml();

        expect(html).toContain('รวม 3 รายการ');
        // The bill's own figure, said once. Two totals on a signed note is
        // something the customer is entitled to argue with.
        expect(html.split('2,350.00').length - 1).toBe(2);
    });
});
