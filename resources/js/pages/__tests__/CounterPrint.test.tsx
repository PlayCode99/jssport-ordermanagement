import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Counter from '@/pages/Counter';

const { mockRouterGet, mockRouterVisit } = vi.hoisted(() => ({
    mockRouterGet: vi.fn(),
    mockRouterVisit: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    router: {
        get: mockRouterGet,
        visit: mockRouterVisit,
        delete: vi.fn(),
        reload: vi.fn(),
    },
    usePage: () => ({
        props: { currentTeam: null, auth: { user: { role: 'admin' } } },
        url: '/counter',
    }),
}));

vi.mock('jsbarcode', () => ({ default: () => undefined }));

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

/** Renders the counter page with the given row and extra props. */
const renderCounter = (row = makeRow(), extra: Record<string, unknown> = {}) =>
    render(
        <Counter
            branches={[{ value: '1', label: 'สาขาหนองบัวลำภู' }]}
            floorStats={emptyFloorStats}
            filters={{} as never}
            orders={[row as never]}
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
            {...extra}
        />,
    );

/** Opens the order detail dialog for assertions on what it shows. */
const openDetail = (row = makeRow()) => {
    renderCounter(row);
    fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);
};

/** Opens the order detail and prints, returning the HTML written to the print window. */
const printedHtml = (row = makeRow()): string => {
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
            floorStats={emptyFloorStats}
            filters={{} as never}
            orders={[row as never]}
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

    fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Print เอกสาร/ }));

    return written;
};

describe('counter work-sheet PDF', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        // jsdom has no scroll implementation; the table scrolls itself on page change.
        Element.prototype.scrollTo =
            Element.prototype.scrollTo ?? (() => undefined);
        vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(
            () => undefined,
        );
    });

    it('prints on A4 portrait', () => {
        expect(printedHtml()).toContain('size: A4 portrait');
    });

    /**
     * A job type is a list of processes joined with '+'. The masthead used to
     * give its cells fixed fractions of the row, so 'ซับลิเมชั่น + ปัก + สกรีน'
     * was clipped to 'ซับลิเมชั่น + ปัก + ...' — naming a shorter job than the
     * one that was sold — beside a job-name column with room to spare. Each
     * column is sized to its own text now.
     */
    /**
     * A sleeveless shirt is a length like any other, and the sheet has to say
     * so. The print code knew two lengths by name and printed a dash for
     * anything else, so a bill sold as แขนกุด reached the floor saying nothing
     * about its sleeves at all.
     */
    it('prints แขนกุด on the sheet rather than a dash', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'shirt',
                            size_group: 'adults',
                            size_label: 'L',
                            shirt_style: 'sleeveless',
                            quantity: 6,
                            unit_price: 200,
                            total_price: 1200,
                        },
                    ],
                },
            }) as never,
        );

        expect(html).toContain('แขนกุด');
    });

    it('never clips the job type in the masthead', () => {
        const html = printedHtml();

        // The type's column is sized to its own text; the job name, which
        // had room to spare, gives up what is left over.
        expect(html).toContain(
            'grid-template-columns: minmax(0, 1fr) minmax(0, max-content) max-content;',
        );
        expect(html).not.toContain('grid-template-columns: 2.4fr 1fr 1fr;');
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

    /**
     * The spec is read on screen, where there is room to lay it out properly
     * and to mark what differs between sheets. It used to print as well, and
     * it was the one thing that could push the receipt onto a second sheet —
     * a bill with six differing sheets printed six blocks of twenty settings.
     *
     * The receipt is what the customer signs for, so it carries the job, the
     * artwork, the sizes and the money, and leaves the sewing instructions to
     * the production sheets that the floor actually works from.
     */
    it('leaves the specification off the printed receipt', () => {
        const html = printedHtml();

        // Values that are plainly on the saved spec of this bill.
        expect(html).not.toContain('แพทเทิร์นมาตรฐาน');
        expect(html).not.toContain('ขาตรง');

        // And the headings that framed them.
        expect(html).not.toContain('สเปกเสื้อ');
        expect(html).not.toContain('สเปกกางเกง');
        expect(html).not.toContain('spec-section');
        expect(html).not.toContain('spec-card');
    });

    /**
     * A short bill left the signatures and the red warning riding up under its
     * last table, with the rest of the paper blank below them. They close the
     * document, so they belong at the foot of the sheet where someone signing
     * looks for them — the sheet is as tall as the page and pushes them down to
     * it, and a bill long enough to fill the page has no spare room to push
     * them into and simply closes under its last table.
     */
    it('holds the signatures and the warning at the foot of the sheet', () => {
        const html = printedHtml();

        expect(html).toContain('class="sheet-foot"');
        expect(html).toContain('.sheet-foot { margin-top: auto; }');
        expect(html).toMatch(
            /\.page \{[^}]*display: flex[^}]*flex-direction: column/,
        );
    });

    /**
     * Sized to exactly the 283mm a 7mm margin leaves, the sheet spilled and
     * printed its signatures alone on a second, otherwise empty page. The
     * height has to sit under the mark, not level with it.
     */
    it('leaves the page a little slack rather than asking for all of it', () => {
        const html = printedHtml();
        const printable = 297 - 7 * 2;
        const minHeight = Number(
            /\.page \{[^}]*min-height: (\d+)mm/.exec(html)?.[1],
        );

        expect(minHeight).toBeLessThan(printable);
        expect(minHeight).toBeGreaterThanOrEqual(printable - 6);
    });

    it('still prints everything the customer signs for', () => {
        const html = printedHtml();

        expect(html).toContain('ใบรับงาน');
        expect(html).toContain('ลงชื่อผู้สั่งสินค้า');
        expect(html).toContain('ลงชื่อผู้รับงาน');
        expect(html).toContain('image-gallery');
    });

    it('escapes customer text instead of letting it break the markup', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    customer: {
                        name: '<script>alert(1)</script>',
                        phone: '08',
                        line_fb: null,
                    },
                },
            }) as never,
        );

        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('prints a separate table for kids and adults when the order has both', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 5,
                            unit_price: 300,
                            total_price: 1500,
                        },
                        {
                            item_type: 'set',
                            size_group: 'kids',
                            size_label: 'JM',
                            quantity: 4,
                            unit_price: 250,
                            total_price: 1000,
                        },
                    ],
                },
            }) as never,
        );

        expect(html).toContain('ขนาดเด็ก  อนุบาล/ประถม');
        expect(html).toContain('ขนาดผู้ใหญ่  มัธยมต้น/มัธยมปลาย');
        // Two tables, so the header appears twice.
        expect(html.split('ราคารวมต่อชุด').length - 1).toBe(2);
    });

    it('prints only one table when the order has a single size group', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 5,
                            unit_price: 300,
                            total_price: 1500,
                        },
                    ],
                },
            }) as never,
        );

        expect(html).toContain('ขนาดผู้ใหญ่  มัธยมต้น/มัธยมปลาย');
        expect(html).not.toContain('ขนาดเด็ก  อนุบาล/ประถม');
        expect(html.split('ราคารวมต่อชุด').length - 1).toBe(1);
    });

    it('lays the columns out the way the order form does', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 5,
                            unit_price: 300,
                            total_price: 1500,
                        },
                    ],
                },
            }) as never,
        );

        expect(html).toContain('ราคารวมต่อชุด');
        expect(html).toContain('ราคาแยกชุด');
        expect(html).toContain('ราคาต่อชุด');
        expect(html).toContain('ราคารวม');
        expect(html).toContain('จำนวนรวม');
        expect(html).toContain('รวมเป็นเงิน');
    });

    it('puts set lines and separately sold lines in their own columns', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        // 5 sets at 300, plus 2 loose shirts at 200 and 3 loose pants at 150.
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 5,
                            unit_price: 300,
                            total_price: 1500,
                        },
                        {
                            item_type: 'separate_shirt',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 2,
                            unit_price: 200,
                            total_price: 400,
                        },
                        {
                            item_type: 'separate_pants',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 3,
                            unit_price: 150,
                            total_price: 450,
                        },
                    ],
                },
            }) as never,
        );

        const row = html.slice(html.indexOf('<td class="size-label">M</td>'));
        const cells =
            row
                .split('</tr>')[0]
                .match(/<td[^>]*>([^<]*)<\/td>/g)
                ?.map((cell) => cell.replace(/<[^>]+>/g, '')) ?? [];

        // ไซส์, set shirt, set pants, price/set, set subtotal, sep shirt, sep pants, shirt price, pants price, row total
        expect(cells).toEqual([
            'M',
            '5',
            '5',
            '300.00',
            '1,500.00',
            '2',
            '3',
            '200.00',
            '150.00',
            '2,350.00',
        ]);
    });

    it('sums each column in the footer row', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 5,
                            unit_price: 300,
                            total_price: 1500,
                        },
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'L',
                            quantity: 3,
                            unit_price: 300,
                            total_price: 900,
                        },
                        {
                            item_type: 'separate_shirt',
                            size_group: 'adults',
                            size_label: 'L',
                            quantity: 4,
                            unit_price: 200,
                            total_price: 800,
                        },
                    ],
                },
            }) as never,
        );

        // Search the markup, not the stylesheet rule of the same name.
        const footer = html.slice(html.indexOf('<tr class="size-total-row">'));
        const cells =
            footer
                .split('</tr>')[0]
                .match(/<td[^>]*>([^<]*)<\/td>/g)
                ?.map((cell) => cell.replace(/<[^>]+>/g, '')) ?? [];

        // 8 sets of shirts and pants, 4 loose shirts, no loose pants, 3,200 in total.
        expect(cells).toContain('8');
        expect(cells).toContain('4');
        expect(cells).toContain('3,200.00');
    });

    it('orders the sizes the way the shop reads them', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: '2XL',
                            quantity: 1,
                            unit_price: 100,
                            total_price: 100,
                        },
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'S',
                            quantity: 1,
                            unit_price: 100,
                            total_price: 100,
                        },
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 1,
                            unit_price: 100,
                            total_price: 100,
                        },
                    ],
                },
            }) as never,
        );

        expect(html.indexOf('>S<')).toBeLessThan(html.indexOf('>M<'));
        expect(html.indexOf('>M<')).toBeLessThan(html.indexOf('>2XL<'));
    });

    it('reconciles the size tables with the money block', () => {
        // Shaped like a real order that has both size groups and both kinds of
        // line: kids 10 sets @100 + 5 loose shirts @120, adults 20 sets @200.
        const html = printedHtml(
            makeRow({
                details: {
                    pricing: {
                        total_amount: 5600,
                        discount_percent: 0,
                        discount_amount: 0,
                        net_amount: 5600,
                        paid_amount: 0,
                    },
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'kids',
                            size_label: 'JM',
                            quantity: 10,
                            unit_price: 100,
                            total_price: 1000,
                        },
                        {
                            item_type: 'separate_shirt',
                            size_group: 'kids',
                            size_label: 'JM',
                            quantity: 5,
                            unit_price: 120,
                            total_price: 600,
                        },
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 20,
                            unit_price: 200,
                            total_price: 4000,
                        },
                    ],
                },
            }) as never,
        );

        // Each table carries its own money total...
        const subtotals = [
            ...html.matchAll(
                /<tr class="size-total-row">[\s\S]*?<td class="size-subtotal">([\d,.]+)<\/td>/g,
            ),
        ].map((match) => Number(match[1].replace(/,/g, '')));

        expect(subtotals).toHaveLength(2);
        expect(subtotals).toContain(1600); // kids
        expect(subtotals).toContain(4000); // adults

        // ...and together they equal the gross the money block prints.
        expect(subtotals.reduce((sum, value) => sum + value, 0)).toBe(5600);
        expect(html).toContain('รวมเป็นเงิน:</span> 5,600.00');
    });

    it('prints the discount, net, paid and balance the order was saved with', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    pricing: {
                        total_amount: 17000,
                        discount_percent: 5,
                        discount_amount: 850,
                        net_amount: 16150,
                        paid_amount: 3000,
                    },
                    items: [
                        {
                            item_type: 'separate_shirt',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 50,
                            unit_price: 170,
                            total_price: 8500,
                        },
                        {
                            item_type: 'separate_shirt',
                            size_group: 'adults',
                            size_label: 'S',
                            quantity: 50,
                            unit_price: 170,
                            total_price: 8500,
                        },
                    ],
                },
            }) as never,
        );

        expect(html).toContain('รวมเป็นเงิน:</span> 17,000.00');
        expect(html).toContain('ส่วนลด 5%:</span> 850.00');
        expect(html).toContain('16,150.00');
        expect(html).toContain('3,000.00');
        // Balance is net less what has been paid.
        expect(html).toContain('13,150.00');

        // The size table adds up to the gross, not the discounted total.
        const subtotals = [
            ...html.matchAll(
                /<tr class="size-total-row">[\s\S]*?<td class="size-subtotal">([\d,.]+)<\/td>/g,
            ),
        ].map((match) => Number(match[1].replace(/,/g, '')));

        expect(subtotals.reduce((sum, value) => sum + value, 0)).toBe(17000);
    });

    it('never prints a negative balance when the customer has overpaid', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    pricing: {
                        total_amount: 1000,
                        discount_percent: 0,
                        discount_amount: 0,
                        net_amount: 1000,
                        paid_amount: 1500,
                    },
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 10,
                            unit_price: 100,
                            total_price: 1000,
                        },
                    ],
                },
            }) as never,
        );

        expect(html).toContain('ยอดคงเหลือ:</span> <span class="balance">0.00');
        expect(html).not.toContain('-500');
    });

    it('sizes the artwork from a variable the fitter can change', () => {
        const html = printedHtml();

        expect(html).toContain('--artwork-h');
        expect(html).toContain('max-height: var(--artwork-h)');
        // No fixed pixel height left to fight the fitter.
        expect(html).not.toContain('max-height: 220px');
    });

    it('ships a fitter that waits for artwork before measuring', () => {
        const html = printedHtml();

        expect(html).toContain('whenImagesSettled');
        expect(html).toContain("addEventListener('load'");
        expect(html).toContain("addEventListener('error'");
        // A stalled image must not block the print dialog forever.
        expect(html).toContain('3000');
    });

    it('measures the page in real millimetres rather than assuming a dpi', () => {
        const html = printedHtml();

        expect(html).toContain('fit-probe');
        expect(html).toContain('height: 100mm');
        expect(html).toContain('pxPerMm');
        // A4 portrait less the page margins on both sides, taken from the
        // margin the sheet actually asks for rather than written out twice.
        expect(html).toMatch(/297 - \((\d+) \* 2\)/);
    });

    /**
     * A printer keeps a border of its own that it cannot print on, and most
     * want between four and six millimetres. The sheet used to be laid out to
     * exactly the 202 x 289mm a 4mm margin leaves, so those printers cut off
     * its right edge and its foot — and the fitter had no reason to shrink
     * anything, because what it measured did fit. Whatever the margin is, it
     * has to leave the printer room, and the sheet has to be sized from it.
     */
    it('leaves the printer a border of its own', () => {
        const html = printedHtml();
        const margin = Number(
            /@page \{ size: A4 portrait; margin: (\d+)mm/.exec(html)?.[1],
        );

        expect(margin).toBeGreaterThanOrEqual(6);
        // The sheet is exactly the page less that margin on both sides: 210mm
        // of paper, so a 7mm margin leaves 196mm of sheet.
        expect(html).toContain(`max-width: ${210 - margin * 2}mm`);
        expect(html).toContain(`297 - (${margin} * 2)`);
    });

    it('prints the artwork at the same height on every sheet it fits on', () => {
        const html = printedHtml();

        // Every bill starts at the same height, so two receipts printed one
        // after the other look alike rather than one carrying a poster and the
        // next a stamp.
        expect(html).toContain('var FIXED = 58');
        expect(html).toContain('--artwork-h: 58mm');

        // A bill that would run over gives this back before it gives back the
        // figures, and only down to a size still worth looking at.
        expect(html).toContain('var ART_MIN = 26');
        expect(html).not.toContain('var MIN_SCALE');
    });

    it('measures the same layout that comes out of the printer', () => {
        const html = printedHtml();

        // The fitter measures the window it opened, so anything that only
        // takes effect under @media print is a size it never saw. The spec
        // block used to do exactly that — one column on screen, two on paper —
        // and the artwork was sized against a block 46mm taller than the one
        // that printed, so the picture came out trimmed above empty paper.
        for (const selector of [
            '.image-gallery',
            '.image-card',
            '.size-table',
            '.job-value',
        ]) {
            expect(html).not.toMatch(
                new RegExp(
                    `@media print \\{[^}]*\\${selector.replace('.', '.')}`,
                    's',
                ),
            );
        }
    });

    /**
     * The sheet aims at one A4 page and trims to reach it, but only the two
     * things that can be given back without the receipt becoming unreadable,
     * and only as far as their floors. It is never scaled and never clipped:
     * a bill longer than the floors can save takes the page it needs.
     */
    it('trims to stay on the page, but never scales or clips', () => {
        const html = printedHtml();

        expect(html).toContain('var ART_MIN');
        expect(html).toContain('var FONT_MIN');
        expect(html).not.toContain('page.style.transform');
        expect(html).not.toContain("document.body.style.overflow = 'hidden'");
        expect(html).not.toContain('style.zoom');
    });

    const rosterRow = () =>
        makeRow({
            details: {
                individual_keeper_color: 'เขียวสะท้อนแสง',
                personalization_rows: [
                    {
                        role: 'player' as const,
                        name: 'สมชาย',
                        size_group: 'kids' as const,
                        size: 'JM',
                        number: '3',
                        pants_size: 'JM',
                        pants_number: '7',
                        quantity: 1,
                        unit_price: 250,
                        total_price: 250,
                    },
                    {
                        role: 'keeper' as const,
                        name: 'อนุชา',
                        size_group: 'adults' as const,
                        size: 'L',
                        number: '18',
                        pants_size: 'L',
                        pants_number: '18',
                        quantity: 1,
                        unit_price: 250,
                        total_price: 250,
                    },
                ],
            },
        });

    /** The roster prints from its own button, so it needs its own capture. */
    const rosterHtml = (row = rosterRow()): string => {
        let written = '';
        vi.spyOn(window, 'open').mockReturnValue({
            document: {
                open: vi.fn(),
                close: vi.fn(),
                images: [],
                querySelectorAll: () => [],
                write: (html: string) => {
                    written += html;
                },
            },
            focus: vi.fn(),
            print: vi.fn(),
            close: vi.fn(),
        } as unknown as Window);

        renderCounter(row);
        fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);
        fireEvent.click(screen.getByRole('button', { name: /ปริ้นใบรายชื่อ/ }));

        return written;
    };

    /**
     * The name list's masthead is sized the same way as the work sheet's: the
     * customer and the due date take the width their own text needs, and the
     * job name takes what is left, instead of fixed fractions that clipped a
     * long customer name while another cell kept half a column of white.
     */
    it('never clips the masthead on the roster either', () => {
        const html = rosterHtml();

        expect(html).toContain(
            'grid-template-columns: minmax(0, 1fr) minmax(0, max-content) max-content;',
        );
        expect(html).not.toContain('grid-template-columns: 2.4fr 1fr 1fr;');
    });

    it('offers the roster only on a bill that has a name list', () => {
        renderCounter(rosterRow());
        fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);
        expect(
            screen.getByRole('button', { name: /ปริ้นใบรายชื่อ/ }),
        ).toBeTruthy();

        cleanup();

        // A plain size-table bill has nobody to list, so the button stays away.
        renderCounter(makeRow());
        fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);
        expect(
            screen.queryByRole('button', { name: /ปริ้นใบรายชื่อ/ }),
        ).toBeNull();
    });

    it('lists everything the customer checks and nothing they do not', () => {
        const html = rosterHtml();

        for (const heading of [
            'ลำดับ',
            'ประเภท',
            'เด็ก/ผู้ใหญ่',
            'ไซซ์เสื้อ',
            'ชื่อสกรีน',
            'เบอร์เสื้อ',
            'ไซซ์กางเกง',
            'เบอร์กางเกง',
        ]) {
            expect(html).toContain(heading);
        }

        expect(html).toContain('สมชาย');
        expect(html).toContain('อนุชา');
        // This sheet is for checking names, not for settling up, so no money.
        expect(html).not.toContain('ยอดรวม');
        expect(html).not.toContain('มัดจำ');
    });

    /**
     * Production now cuts Form 2 by sleeve and leg length, so both sheets have
     * to say which length each person takes. A whole team in one length is said
     * once in the header rather than repeated down a column of its own.
     */
    const lengthRow = (
        first: Record<string, unknown>,
        second: Record<string, unknown>,
    ) =>
        makeRow({
            details: {
                personalization_rows: [
                    {
                        role: 'player' as const,
                        name: 'สมชาย',
                        size_group: 'adults' as const,
                        size: 'M',
                        number: '3',
                        pants_size: 'M',
                        pants_number: '3',
                        quantity: 1,
                        unit_price: 250,
                        total_price: 250,
                        ...first,
                    },
                    {
                        role: 'player' as const,
                        name: 'อนุชา',
                        size_group: 'adults' as const,
                        size: 'L',
                        number: '18',
                        pants_size: 'L',
                        pants_number: '18',
                        quantity: 1,
                        unit_price: 250,
                        total_price: 250,
                        ...second,
                    },
                ],
            },
        });

    it('says the length once when the whole roster wears the same', () => {
        const html = rosterHtml(
            lengthRow(
                { shirt_style: 'short', pants_style: 'short' },
                { shirt_style: 'short', pants_style: 'short' },
            ),
        );

        expect(html).toContain('แขนสั้น 2 คน');
        expect(html).toContain('ขาสั้น 2 คน');
        // Nothing is gained by repeating it on every row, so no column appears.
        expect(html).not.toContain('<th>แขน</th>');
        expect(html).not.toContain('<th>ขา</th>');
    });

    it('gives the roster a sleeve column when the team is mixed', () => {
        const html = rosterHtml(
            lengthRow(
                { shirt_style: 'short', pants_style: 'short' },
                { shirt_style: 'long', pants_style: 'short' },
            ),
        );

        expect(html).toContain('<th>แขน</th>');
        expect(html).toContain('แขนยาว');
        expect(html).toContain('is-long');
        expect(html).toContain('แขนสั้น 1 คน · แขนยาว 1 คน');
        // Legs still match, so they stay out of the table.
        expect(html).not.toContain('<th>ขา</th>');
    });

    it('gives the roster a leg column when the legs are the mixed ones', () => {
        const html = rosterHtml(
            lengthRow(
                { shirt_style: 'short', pants_style: 'short' },
                { shirt_style: 'short', pants_style: 'long' },
            ),
        );

        expect(html).toContain('<th>ขา</th>');
        expect(html).toContain('ขายาว');
        expect(html).not.toContain('<th>แขน</th>');
    });

    it('counts the legs of the people who ordered trousers, and no one else', () => {
        // A keeper in a shirt alone is not one more pair of shorts.
        const html = rosterHtml(
            lengthRow(
                {
                    shirt_style: 'short',
                    pants_style: 'short',
                    pants_quantity: 1,
                },
                {
                    shirt_style: 'short',
                    pants_style: 'short',
                    pants_quantity: 0,
                    pants_size: '',
                    pants_number: '',
                },
            ),
        );

        expect(html).toContain('ขาสั้น 1 คน');
        expect(html).not.toContain('ขาสั้น 2 คน');
    });

    it('leaves a bill saved before lengths existed exactly as it was', () => {
        const html = rosterHtml(lengthRow({}, {}));

        expect(html).not.toContain('<th>แขน</th>');
        expect(html).not.toContain('<th>ขา</th>');
        expect(html).not.toContain('แขนสั้น');
        expect(html).not.toContain('ขาสั้น');
        // The list itself still prints, of course.
        expect(html).toContain('สมชาย');
    });

    /**
     * The work receipt prints a Form 2 bill the way it prints Form 1: its line
     * items are one shirt or pair of pants per person, and the size tables add
     * them up per size and length. Names belong to the roster sheet.
     */
    it('prints a form 2 bill through the same size tables as form 1', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    personalization_rows: [
                        {
                            role: 'player' as const,
                            name: 'สมชาย',
                            size_group: 'adults' as const,
                            size: 'M',
                            number: '3',
                            shirt_style: 'short',
                            quantity: 1,
                            unit_price: 250,
                            total_price: 250,
                        },
                        {
                            role: 'player' as const,
                            name: 'อนุชา',
                            size_group: 'adults' as const,
                            size: 'M',
                            number: '18',
                            shirt_style: 'long',
                            quantity: 1,
                            unit_price: 280,
                            total_price: 280,
                        },
                    ],
                    items: [
                        {
                            item_type: 'shirt',
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_style: 'short',
                            quantity: 1,
                            unit_price: 250,
                            total_price: 250,
                        },
                        {
                            item_type: 'shirt',
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_style: 'long',
                            quantity: 1,
                            unit_price: 280,
                            total_price: 280,
                        },
                        {
                            item_type: 'pants',
                            size_group: 'adults',
                            size_label: 'L',
                            pants_style: 'short',
                            quantity: 2,
                            unit_price: 180,
                            total_price: 360,
                        },
                    ],
                },
            }),
        );
        const body = html.slice(html.indexOf('<body>'));

        // The Form 1 adult table, with a column per length the bill uses.
        expect(body).toContain('ขนาดผู้ใหญ่  มัธยมต้น/มัธยมปลาย');
        expect(body).toContain('เสื้อแขนสั้น');
        expect(body).toContain('เสื้อแขนยาว');
        expect(body).toContain('กางเกงขาสั้น');

        // The person list is gone from the receipt...
        expect(body).not.toContain('รายละเอียดรายตัว (Form 2)');
        expect(body).not.toContain('ชื่อสกรีน');
        expect(body).not.toContain('สมชาย');
        expect(body).not.toContain('อนุชา');
        // ...and so are the notes and columns that only it needed.
        expect(body).not.toContain('title-note');
        expect(body).not.toContain('len-cell');
    });

    it('marks the keepers and states the colour their shirt is', () => {
        const html = rosterHtml();

        expect(html).toContain('ผู้รักษาประตู');
        expect(html).toContain('is-keeper');
        expect(html).toContain('เสื้อผู้รักษาประตู: เขียวสะท้อนแสง');
    });

    it('waits for the logo and barcode before opening the print dialog', () => {
        const html = rosterHtml();

        // Printing the instant the markup was written caught the logo still
        // downloading, so the first roster of the day came out with an empty
        // masthead and only a reprint -- from cache -- looked right.
        expect(html).toContain("addEventListener('load', finish");
        expect(html).toContain("addEventListener('error', finish");
        expect(html).toContain('window.print();');
        // And a stalled image must never leave the sheet unprintable.
        expect(html).toContain('setTimeout(go, 3000)');
    });

    it('repeats the bill it belongs to on every printed page', () => {
        const html = rosterHtml();

        // A roster runs to several sheets for a big team, and loose pages have
        // to say which order they came from.
        expect(html).toContain('display: table-header-group');
        // The same masthead the work receipt carries, so the two sheets read as
        // one document and a loose page still names its order.
        expect(html).toContain('class="masthead"');
        expect(html).toContain('ใบรายชื่อสกรีน');
        expect(html).toContain('ORD-2026-00042');
        expect(html).toContain('เจ.เอส.สปอร์ต');
    });

    it('prints the ชุดพละ artwork of both size tables in the gallery', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    artwork_url: null,
                    shirt_artwork_urls: [],
                    pants_artwork_urls: [],
                    pe_uniform_artwork_urls: [
                        '/pe-kids.webp',
                        '/pe-adults.webp',
                    ],
                },
            }),
        );

        // Form 4 keeps its artwork per size table; the sheet has one gallery, so
        // both tables' images have to reach it.
        expect(html).toContain('/pe-kids.webp');
        expect(html).toContain('/pe-adults.webp');
    });

    it('prints the colour house artwork in the sheet gallery', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    artwork_url: null,
                    shirt_artwork_urls: [],
                    pants_artwork_urls: [],
                    sports_day_artwork_urls: ['/house-a.webp', '/house-b.webp'],
                },
            }),
        );

        // A sports day bill keeps its artwork per colour house, so without this
        // the sheet printed with an empty gallery even though every house had
        // its mock-up attached.
        expect(html).toContain('/house-a.webp');
        expect(html).toContain('/house-b.webp');
    });

    it('fits four pictures across the first row', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    ...makeRow().details,
                    shirt_artwork_urls: ['/a.webp', '/b.webp', '/c.webp'],
                    pants_artwork_urls: ['/d.webp', '/e.webp', '/f.webp'],
                },
            }),
        );

        // The artwork height was settled on at four across. The columns were
        // auto-fit over a minimum as wide as that height, and 58mm into the
        // 196mm the margins leave only ever divided three ways — so the row
        // came out one picture short of what it was measured for. This bill
        // has six, which is more than a row.
        expect(html).toContain('grid-template-columns: repeat(4, 1fr)');
        expect(html).not.toContain(
            'grid-template-columns: repeat(auto-fit, minmax(var(--artwork-col), 1fr))',
        );
        expect(html).not.toContain('minmax(140px, 1fr)');

        // And a bill with a single artwork must not stretch it into a banner
        // the width of the sheet.
        expect(html).toContain('max-width: calc(var(--artwork-col) * 1.6)');
    });

    it('gives a bill with fewer pictures only the columns it fills', () => {
        expect(
            printedHtml(
                makeRow({
                    details: {
                        ...makeRow().details,
                        shirt_artwork_urls: ['/a.webp', '/b.webp'],
                    },
                }),
            ),
        ).toContain('grid-template-columns: repeat(2, 1fr)');
    });

    it('gives every picture the same height whatever its proportions', () => {
        const html = printedHtml();

        // Height comes from the card, not from the file, so a wide logo and a
        // tall mock-up no longer print as two different sized blocks. contain
        // keeps the whole artwork visible instead of cropping it to fit.
        expect(html).toContain(
            '.image-card img { display: block; width: 100%; height: 100%; object-fit: contain;',
        );
        expect(html).toContain(
            'min-height: var(--artwork-h); max-height: var(--artwork-h)',
        );
        expect(html).not.toContain(
            'height: auto; max-height: var(--artwork-h)',
        );
    });

    it('runs the floor cards as two sliding rows on a phone', () => {
        const { container } = renderCounter();

        const strip = container.querySelector('.grid-rows-2');

        expect(strip).not.toBeNull();
        // Two rows flowing sideways halves the strip, so four rooms are in view
        // instead of one and a half.
        expect(strip!.className).toContain('grid-flow-col');
        expect(strip!.className).toContain('min-w-max');
        // From sm up it is the original single row.
        expect(strip!.className).toContain('sm:flex');
        expect(strip!.className).toContain('sm:grid-rows-1');
        expect(strip!.children.length).toBeGreaterThan(4);

        expect(strip!.parentElement?.className).toContain('overflow-x-auto');
    });

    it('does not show payment standing on the phone card', () => {
        const { container } = renderCounter();

        const badge = [...container.querySelectorAll('span, div')].find(
            (node) =>
                node.textContent?.trim() === 'มัดจำ' &&
                node.className.includes('rounded'),
        );

        expect(
            badge,
            'the payment badge should still exist for the desk view',
        ).toBeDefined();
        // Hidden below sm, back from sm up.
        expect(badge!.className).toContain('hidden');
        expect(badge!.className).toContain('sm:inline-flex');
    });

    it('keeps the job status visible on the phone card', () => {
        const { container } = renderCounter();

        const status = [...container.querySelectorAll('span, div')].find(
            (node) =>
                node.textContent?.trim() === 'คอนเฟิร์มแบบ' &&
                node.className.includes('rounded'),
        );

        // Only the money badge goes; the job's own status is what the phone is for.
        // Checked on classList so utilities like overflow-hidden do not count.
        expect(status?.classList.contains('hidden')).toBe(false);
    });

    it('gives the toolbar tidy rows on a phone', () => {
        const { container } = renderCounter();

        const calendarButton = [...container.querySelectorAll('button')].find(
            (node) => /ปฏิทินกำหนดส่ง/.test(node.textContent ?? ''),
        );
        const newBillButton = [...container.querySelectorAll('button')].find(
            (node) => /เปิดบิลใหม่/.test(node.textContent ?? ''),
        );

        // The two actions share one full-width row instead of being squeezed
        // beside the search box.
        expect(calendarButton?.className).toContain('w-full');
        expect(newBillButton?.className).toContain('w-full');
        expect(calendarButton?.className).toContain('sm:w-auto');
        expect(newBillButton?.className).toContain('sm:w-auto');
        expect(calendarButton?.parentElement?.className).toContain(
            'grid-cols-2',
        );
    });

    it('leads the counter row with the job name and puts the customer under it', () => {
        renderCounter(
            makeRow({
                customer_name: 'โรงเรียนทดสอบ',
                details: { job_name: 'เสื้อกีฬาสี 2569' },
            }) as never,
        );

        const jobName = screen.getAllByText('เสื้อกีฬาสี 2569')[0];
        const customer = screen.getAllByText('โรงเรียนทดสอบ')[0];

        // Same cell, job name first in document order.
        expect(
            jobName.compareDocumentPosition(customer) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();

        // The top line keeps the emphasis, so the column still reads at a glance.
        expect(jobName.className).toContain('font-semibold');
        expect(customer.className).not.toContain('font-semibold');
    });

    it('fills the width with two aligned columns when only the shirt has a spec', () => {
        openDetail(
            makeRow({
                details: {
                    spec_sections: {
                        shirt: [
                            { label: 'แพทเทิร์น', value: 'มาตรฐาน' },
                            { label: 'เนื้อผ้า', value: 'ไมโคร' },
                            { label: 'สีผ้า', value: 'ขาว' },
                            { label: 'แบบคอ', value: 'คอกลม' },
                            { label: 'ปก', value: 'ปกทอ' },
                        ],
                        pants: [],
                    },
                },
            }) as never,
        );

        const shirt = screen.getByText('สเปกเสื้อ').parentElement!;
        const tables = shirt.querySelectorAll('table');

        // A lone section splits into two tables instead of leaving half the
        // dialog empty.
        expect(tables).toHaveLength(2);

        // An odd count is padded so both columns have the same number of rows
        // and the striping stays in step across the divider.
        expect(tables[0].querySelectorAll('tbody tr')).toHaveLength(3);
        expect(tables[1].querySelectorAll('tbody tr')).toHaveLength(3);
        expect(shirt.querySelectorAll('tr[aria-hidden="true"]')).toHaveLength(
            1,
        );

        // The filler is decoration, never a fake setting.
        expect(screen.queryByText('สเปกกางเกง')).not.toBeInTheDocument();
    });

    it('keeps one column per section when both shirt and pants have a spec', () => {
        openDetail(
            makeRow({
                details: {
                    spec_sections: {
                        shirt: [
                            { label: 'แพทเทิร์น', value: 'มาตรฐาน' },
                            { label: 'เนื้อผ้า', value: 'ไมโคร' },
                            { label: 'สีผ้า', value: 'ขาว' },
                            { label: 'แบบคอ', value: 'คอกลม' },
                        ],
                        pants: [{ label: 'แบบขา', value: 'ขาตรง' }],
                    },
                },
            }) as never,
        );

        const shirt = screen.getByText('สเปกเสื้อ').parentElement!;
        const pants = screen.getByText('สเปกกางเกง').parentElement!;

        // Side by side, so neither section splits and no filler rows appear.
        expect(shirt.querySelectorAll('table')).toHaveLength(1);
        expect(pants.querySelectorAll('table')).toHaveLength(1);
        expect(
            document.querySelectorAll('tr[aria-hidden="true"]'),
        ).toHaveLength(0);
    });

    it('does not split a section with only a few settings', () => {
        openDetail(
            makeRow({
                details: {
                    spec_sections: {
                        shirt: [
                            { label: 'แพทเทิร์น', value: 'มาตรฐาน' },
                            { label: 'เนื้อผ้า', value: 'ไมโคร' },
                        ],
                        pants: [],
                    },
                },
            }) as never,
        );

        expect(
            screen
                .getByText('สเปกเสื้อ')
                .parentElement!.querySelectorAll('table'),
        ).toHaveLength(1);
    });

    it('groups the dialog size list by size group, size and garment', () => {
        // The real shape of ORD-2026-00007: one JS row long, one JS row short.
        openDetail(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'kids',
                            size_label: 'JS',
                            shirt_style: 'long',
                            pants_style: 'long',
                            quantity: 10,
                            unit_price: 150,
                            total_price: 1500,
                        },
                        {
                            item_type: 'separate_shirt',
                            size_group: 'kids',
                            size_label: 'JS',
                            shirt_style: 'long',
                            quantity: 5,
                            unit_price: 155,
                            total_price: 775,
                        },
                        {
                            item_type: 'set',
                            size_group: 'kids',
                            size_label: 'JS',
                            shirt_style: 'short',
                            pants_style: 'short',
                            quantity: 10,
                            unit_price: 135,
                            total_price: 1350,
                        },
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_style: 'short',
                            pants_style: 'short',
                            quantity: 4,
                            unit_price: 300,
                            total_price: 1200,
                        },
                    ],
                },
            }) as never,
        );

        // One block per size group, each naming what it holds.
        expect(screen.getByText('ขนาดเด็ก · อนุบาล/ประถม')).toBeInTheDocument();
        expect(
            screen.getByText('ขนาดผู้ใหญ่ · มัธยมต้น/มัธยมปลาย'),
        ).toBeInTheDocument();

        // Every line says what it is instead of leaving item_type to be guessed.
        expect(screen.getAllByText('ชุด (เสื้อ + กางเกง)').length).toBe(3);
        expect(screen.getByText('เสื้อแยก')).toBeInTheDocument();

        // Sleeve and leg length each get their own column.
        expect(screen.getAllByText('แขนเสื้อ').length).toBeGreaterThan(0);
        expect(screen.getAllByText('ขากางเกง').length).toBeGreaterThan(0);
    });

    it('puts sleeve and leg length in their own columns', () => {
        openDetail(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_style: 'long',
                            pants_style: 'short',
                            quantity: 4,
                            unit_price: 300,
                            total_price: 1200,
                        },
                        {
                            item_type: 'separate_shirt',
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_style: 'long',
                            quantity: 2,
                            unit_price: 200,
                            total_price: 400,
                        },
                        {
                            item_type: 'separate_pants',
                            size_group: 'adults',
                            size_label: 'L',
                            pants_style: 'long',
                            quantity: 3,
                            unit_price: 180,
                            total_price: 540,
                        },
                    ],
                },
            }) as never,
        );

        const table = screen
            .getByText('ขนาดผู้ใหญ่ · มัธยมต้น/มัธยมปลาย')
            .closest('div')!
            .parentElement!.querySelector('table')!;
        const headers = [...table.querySelectorAll('thead th')].map(
            (node) => node.textContent,
        );

        expect(headers).toEqual([
            'ไซซ์',
            'รายการ',
            'แขนเสื้อ',
            'ขากางเกง',
            'จำนวน',
            'ราคา/หน่วย',
            'รวม',
        ]);

        const cells = (rowIndex: number) =>
            [
                ...table
                    .querySelectorAll('tbody tr')
                    [rowIndex].querySelectorAll('td'),
            ].map((node) => node.textContent);

        // The set states both lengths.
        expect(cells(0)[1]).toBe('ชุด (เสื้อ + กางเกง)');
        expect(cells(0)[2]).toBe('แขนยาว');
        expect(cells(0)[3]).toBe('ขาสั้น');

        // A shirt-only line leaves the leg column empty instead of borrowing one.
        expect(cells(1)[1]).toBe('เสื้อแยก');
        expect(cells(1)[2]).toBe('แขนยาว');
        expect(cells(1)[3]).toBe('-');

        // And the reverse for a pants-only line.
        expect(cells(2)[1]).toBe('กางเกงแยก');
        expect(cells(2)[2]).toBe('-');
        expect(cells(2)[3]).toBe('ขายาว');
    });

    it('colours short and long differently, and the same way for both garments', () => {
        openDetail(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_style: 'short',
                            pants_style: 'long',
                            quantity: 4,
                            unit_price: 300,
                            total_price: 1200,
                        },
                        {
                            item_type: 'set',
                            size_group: 'kids',
                            size_label: 'JS',
                            shirt_style: 'long',
                            pants_style: 'short',
                            quantity: 2,
                            unit_price: 250,
                            total_price: 500,
                        },
                    ],
                },
            }) as never,
        );

        const chipClass = (text: string) =>
            screen.getAllByText(text)[0].className;

        // Short and long never share a colour.
        expect(chipClass('แขนสั้น')).toContain('bg-sky-100');
        expect(chipClass('แขนยาว')).toContain('bg-violet-100');
        expect(chipClass('แขนสั้น')).not.toContain('bg-violet-100');

        // One rule for both garments: sky is short, violet is long.
        expect(chipClass('ขาสั้น')).toContain('bg-sky-100');
        expect(chipClass('ขายาว')).toContain('bg-violet-100');

        // The length is still spelled out, so colour is never the only signal.
        expect(screen.getAllByText('แขนสั้น').length).toBeGreaterThan(0);
        expect(screen.getAllByText('ขายาว').length).toBeGreaterThan(0);
    });

    it('reconciles the dialog size list to the order total', () => {
        openDetail(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'kids',
                            size_label: 'JS',
                            shirt_style: 'long',
                            pants_style: 'long',
                            quantity: 10,
                            unit_price: 150,
                            total_price: 1500,
                        },
                        {
                            item_type: 'separate_shirt',
                            size_group: 'kids',
                            size_label: 'JS',
                            shirt_style: 'long',
                            quantity: 5,
                            unit_price: 155,
                            total_price: 775,
                        },
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_style: 'short',
                            pants_style: 'short',
                            quantity: 4,
                            unit_price: 300,
                            total_price: 1200,
                        },
                    ],
                },
            }) as never,
        );

        // 1,500 + 775 + 1,200 = 3,475, and 10 + 5 + 4 = 19 pieces.
        expect(screen.getByText(/19 ตัว · ฿ 3,475\.00/)).toBeInTheDocument();
    });

    it('lays the spec out as a table with one row per setting', () => {
        openDetail(makeRow() as never);

        const shirtHeading = screen.getByText('สเปกเสื้อ');
        const table = shirtHeading.parentElement?.querySelector('table');

        expect(table).not.toBeNull();
        // Label and value sit in the same row, label as the row header.
        const firstRow = table!.querySelector('tbody tr');
        expect(firstRow?.querySelector('th')?.textContent).toBe('แพทเทิร์น');
        expect(firstRow?.querySelector('td')?.textContent).toBe(
            'แพทเทิร์นมาตรฐาน',
        );
    });

    it('offers to print the sheet right after an order is saved', () => {
        renderCounter(makeRow() as never, { savedOrderCode: 'ORD-2026-00042' });

        expect(screen.getByText('บันทึกใบสั่งผลิตสำเร็จ')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /พิมพ์ PDF/ }),
        ).toBeInTheDocument();
    });

    it('stays quiet when the redirect carries no saved order', () => {
        renderCounter(makeRow() as never);

        expect(
            screen.queryByText('บันทึกใบสั่งผลิตสำเร็จ'),
        ).not.toBeInTheDocument();
    });

    it('does not offer to print an order that is not on this page', () => {
        renderCounter(makeRow() as never, { savedOrderCode: 'ORD-2026-99999' });

        expect(
            screen.queryByText('บันทึกใบสั่งผลิตสำเร็จ'),
        ).not.toBeInTheDocument();
    });

    it('prints one compact masthead instead of three stacked header blocks', () => {
        const html = printedHtml();

        expect(html).toContain('class="masthead"');
        expect(html).toContain('class="masthead-bar"');
        expect(html).toContain('class="masthead-job"');

        // The logo file is a square canvas with wide empty margins, so it is
        // cropped to its artwork rather than fitted by height -- fitting printed
        // it at a fraction of the space it was given.
        expect(html).toContain(
            '.masthead-logo { height: 15mm; overflow: hidden; }',
        );
        expect(html).toContain('object-fit: cover');
        // The three separately bordered blocks are gone.
        expect(html).not.toContain('class="blue-banner"');
        expect(html).not.toContain('class="job-hero"');
        expect(html).not.toContain('class="header-table"');

        // Everything the old header showed is still on the sheet.
        [
            'ใบรับงาน',
            'ORD-2026-00042',
            'เจ.เอส.สปอร์ต',
            'สาขาหนองบัวลำภู',
            'ชื่อหน่วยงาน, ชื่องาน',
            'ประเภทงาน',
            'วันที่ต้องส่ง',
        ].forEach((text) => {
            expect(html).toContain(text);
        });
    });

    it('tightens the size table only after the artwork has given way', () => {
        const html = printedHtml();

        // Figures on a receipt are read by a customer, so they are the last
        // thing to give and they stop while they are still legible — the
        // picture is only a reminder of what was ordered and goes first.
        expect(html).toContain('var FONT_MIN = 8');
        expect(html).toMatch(/art > ART_MIN[\s\S]*small > FONT_MIN/);
    });

    it('merges the job and payment details into one block', () => {
        const html = printedHtml();

        expect(html).toContain('ข้อมูลงาน / การชำระเงิน');
        expect(html).toContain('class="info-grid"');
        // The two stacked lists are gone, but every figure they carried remains.
        expect(html).not.toContain(
            '<div class="section-title">ข้อมูลงาน</div>',
        );
        expect(html).not.toContain(
            '<div class="section-title">ข้อมูลการชำระเงิน</div>',
        );
        [
            'ชื่อหน่วยงาน, ชื่องาน:',
            'ประเภทงาน:',
            'วันที่สั่งสินค้า:',
            'วันที่รับสินค้า:',
            'ชื่อลูกค้า:',
            'ช่องทางติดต่อ:',
            'จัดส่ง:',
            'รวมเป็นเงิน:',
            'ยอดรวมหลังลด:',
            'ชำระแล้ว:',
            'ยอดคงเหลือ:',
        ].forEach((label) => {
            expect(html).toContain(label);
        });
    });

    it('spends a short order slack on the figures, never on the artwork', () => {
        const html = printedHtml();

        // Room to spare makes the size table easier to read. The picture keeps
        // the height the shop chose, so a two-line bill and a full one print the
        // same block instead of one turning into a poster.
        expect(html).toContain('var FONT_MAX = 15');
        expect(html).toContain('while (font < FONT_MAX)');
        expect(html).toContain(
            'if (page.scrollHeight > limit) { setFont(font - FONT_STEP); break; }',
        );

        // Growth is gated on the sheet already fitting, so it can never push a
        // short order onto a second page.
        expect(html.indexOf('if (page.scrollHeight <= limit) {')).toBeLessThan(
            html.indexOf('while (font < FONT_MAX)'),
        );
    });

    it('drives the size table font from a variable the fitter can change', () => {
        const html = printedHtml();

        expect(html).toContain('--size-font: 11px');
        expect(html).toContain('font-size: var(--size-font, 11px)');
    });

    it('gives the shirt and pants columns their sleeve and leg length', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_style: 'long',
                            pants_style: 'short',
                            quantity: 5,
                            unit_price: 300,
                            total_price: 1500,
                        },
                    ],
                },
            }) as never,
        );

        expect(html).toContain('<th>เสื้อแขนยาว</th>');
        expect(html).toContain('<th>กางเกงขาสั้น</th>');
        // Only the lengths this order uses get a column.
        expect(html).not.toContain('<th>เสื้อแขนสั้น</th>');
        expect(html).not.toContain('<th>กางเกงขายาว</th>');
    });

    it('splits a garment into one column per length when the order mixes them', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_style: 'short',
                            pants_style: 'short',
                            quantity: 5,
                            unit_price: 300,
                            total_price: 1500,
                        },
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'L',
                            shirt_style: 'long',
                            pants_style: 'long',
                            quantity: 3,
                            unit_price: 320,
                            total_price: 960,
                        },
                    ],
                },
            }) as never,
        );

        expect(html).toContain('<th>เสื้อแขนสั้น</th>');
        expect(html).toContain('<th>เสื้อแขนยาว</th>');
        expect(html).toContain('<th>กางเกงขาสั้น</th>');
        expect(html).toContain('<th>กางเกงขายาว</th>');

        const body = html.slice(html.indexOf('<body>'));
        const dataRows = (body.match(/<tr>[\s\S]*?<\/tr>/g) ?? []).filter(
            (tr) => tr.includes('size-label'),
        );

        // A row states one length, so its counts sit in that column and the other
        // reads empty rather than repeating the number.
        expect(dataRows[0].match(/>5</g) ?? []).toHaveLength(2);
        expect(dataRows[0]).toContain('>-<');
        expect(dataRows[1].match(/>3</g) ?? []).toHaveLength(2);
    });

    it('keeps the plain heading for orders saved before lengths were recorded', () => {
        const html = printedHtml();

        expect(html).toContain('<th>เสื้อ</th>');
        expect(html).toContain('<th>กางเกง</th>');
        expect(html).not.toContain('เสื้อแขน');
    });

    it('keeps two sizes of the same label apart when their styles differ', () => {
        // The real shape of ORD-2026-00007: one JS row ordered long, another JS
        // row ordered short, each at its own price.
        const html = printedHtml(
            makeRow({
                total_amount: 4350,
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'kids',
                            size_label: 'JS',
                            shirt_style: 'long',
                            pants_style: 'long',
                            quantity: 10,
                            unit_price: 150,
                            total_price: 1500,
                        },
                        {
                            item_type: 'separate_shirt',
                            size_group: 'kids',
                            size_label: 'JS',
                            shirt_style: 'long',
                            quantity: 5,
                            unit_price: 155,
                            total_price: 775,
                        },
                        {
                            item_type: 'set',
                            size_group: 'kids',
                            size_label: 'JS',
                            shirt_style: 'short',
                            pants_style: 'short',
                            quantity: 10,
                            unit_price: 135,
                            total_price: 1350,
                        },
                        {
                            item_type: 'separate_pants',
                            size_group: 'kids',
                            size_label: 'JS',
                            pants_style: 'short',
                            quantity: 5,
                            unit_price: 145,
                            total_price: 725,
                        },
                    ],
                },
            }) as never,
        );

        const body = html.slice(html.indexOf('<body>'));
        const dataRows = (body.match(/<tr>[\s\S]*?<\/tr>/g) ?? []).filter(
            (tr) => tr.includes('size-label'),
        );

        expect(dataRows).toHaveLength(2);

        // Both set prices survive; merging by size alone printed only one of them.
        expect(body).toContain('150.00');
        expect(body).toContain('135.00');

        // Row totals: 1,500 + 775 and 1,350 + 725. Neither equals the 4,350 grand
        // total any more, which is what made the sheet look duplicated.
        expect(dataRows[0]).toContain('2,275.00');
        expect(dataRows[1]).toContain('2,075.00');

        const total = body.slice(body.indexOf('size-total-row'));
        expect(total).toContain('4,350.00');
    });

    it('names a style only for the garments the row actually orders', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'separate_pants',
                            size_group: 'adults',
                            size_label: 'L',
                            pants_style: 'long',
                            quantity: 3,
                            unit_price: 150,
                            total_price: 450,
                        },
                    ],
                },
            }) as never,
        );

        expect(html).toContain('ขายาว');
        // No shirt on this row, so no sleeve claim.
        expect(html).not.toContain('แขนสั้น');
        expect(html).not.toContain('แขนยาว');
    });

    it('prints orders saved before styles existed without inventing one', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 5,
                            unit_price: 300,
                            total_price: 1500,
                        },
                    ],
                },
            }) as never,
        );

        // The stylesheet always carries the rule; what must be absent is any
        // element using it.
        expect(html).not.toContain('<span class="size-style">');
        expect(html).not.toContain('แขนสั้น');
        expect(html).not.toContain('ขาสั้น');
    });

    it('gives each size group its own accent colour', () => {
        const html = printedHtml(
            makeRow({
                details: {
                    items: [
                        {
                            item_type: 'set',
                            size_group: 'adults',
                            size_label: 'M',
                            quantity: 5,
                            unit_price: 300,
                            total_price: 1500,
                        },
                        {
                            item_type: 'set',
                            size_group: 'kids',
                            size_label: 'JM',
                            quantity: 4,
                            unit_price: 250,
                            total_price: 1000,
                        },
                    ],
                },
            }) as never,
        );

        expect(html).toContain('<div class="size-block theme-kids">');
        expect(html).toContain('<div class="size-block theme-adults">');
        // Green for kids, orange for adults -- the whole block inherits the
        // accent, so title bar, header row and totals stay on one theme.
        expect(html).toContain(
            '.size-block.theme-kids { --tbl-strong: #15803d;',
        );
        expect(html).toContain(
            '.size-block.theme-adults { --tbl-strong: #c2410c;',
        );
        expect(html).toContain(
            '.size-block .table-title { background: var(--tbl-strong); }',
        );
    });

    it('numbers the pages of a receipt that runs to more than one', () => {
        const html = printedHtml();

        // Every page says which bill it belongs to; a receipt of several says
        // which page of how many, so a customer can see none is missing. A
        // single page needs no numbering and gets none.
        expect(html).toContain('class="print-runner"');
        expect(html).toContain("'หน้า ' + (i + 1) + '/' + total");
        expect(html).toContain('total > 1');
        // Out of flow, so placing them cannot itself add a page.
        expect(html).toContain('position: absolute;');
    });

    it('never clips rows off an order too large to fit one page', () => {
        const html = printedHtml();

        // Nothing is hidden and nothing is scaled: the sheet runs on instead.
        expect(html).not.toContain("style.overflow = 'hidden'");
        expect(html).not.toContain('scale(');
    });

    it('prints once, from the fitter, with a fallback if it never runs', () => {
        let written = '';
        const printSpy = vi.fn();
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
            print: printSpy,
            close: vi.fn(),
        } as unknown as Window);

        vi.useFakeTimers();

        render(
            <Counter
                branches={[]}
                floorStats={emptyFloorStats}
                filters={{} as never}
                orders={[makeRow() as never]}
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

        fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);
        fireEvent.click(screen.getByRole('button', { name: /Print เอกสาร/ }));

        // The document carries its own print call.
        expect(written).toContain('window.print()');

        // The fallback only fires because the injected script never executes here.
        expect(printSpy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(4000);
        expect(printSpy).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });
});
