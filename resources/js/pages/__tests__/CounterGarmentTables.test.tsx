import { fireEvent, render, screen, within } from '@testing-library/react';
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

/**
 * Forms 1 and 4 sell shirts and trousers as separate pieces, each list with
 * its own sizes. The bill reads back as two tables side by side — size,
 * length, how many, price per piece and the line total — with what each
 * garment comes to and the grand total underneath.
 *
 * Bills written before the set was retired keep the layout they were sold on,
 * and the other two forms are untouched: a name list and a colour-house grid
 * are not garment tables, whatever their line items look like.
 */
const garmentItems = [
    {
        item_type: 'separate_shirt',
        size_group: 'adults',
        size_label: 'S',
        shirt_style: 'short',
        quantity: 20,
        unit_price: 100,
        total_price: 2000,
    },
    {
        item_type: 'separate_shirt',
        size_group: 'adults',
        size_label: 'M',
        shirt_style: 'long',
        quantity: 20,
        unit_price: 120,
        total_price: 2400,
    },
    {
        item_type: 'separate_pants',
        size_group: 'adults',
        size_label: 'S',
        pants_style: 'short',
        quantity: 20,
        unit_price: 100,
        total_price: 2000,
    },
];

const garmentBill = (over: Record<string, unknown> = {}) =>
    makeRow({
        details: {
            ...makeRow().details,
            form_mode: 'matrix',
            items: garmentItems,
            ...over,
        },
    });

/** The summary strip under a size group, as [label, quantity, money] per cell. */
const printedSummaries = (html: string): string[][] =>
    [
        ...html.matchAll(
            /<table class="size-table g-summary">([\s\S]*?)<\/table>/g,
        ),
    ].map((match) =>
        [
            ...match[1].matchAll(
                /<span class="g-sum-[a-z]+">([\s\S]*?)<\/span>/g,
            ),
        ].map((cell) => cell[1].replace(/<[^>]*>/g, '').trim()),
    );

/** The printed tables as [heading, ...row labels]. */
const printedTables = (html: string): string[][] =>
    [
        ...html.matchAll(
            /<table class="size-table g-table">([\s\S]*?)<\/table>/g,
        ),
    ].map((match) =>
        [...match[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) =>
            cell[1].replace(/<[^>]*>/g, '').trim(),
        ),
    );

beforeEach(() => {
    vi.restoreAllMocks();
    Element.prototype.scrollTo =
        Element.prototype.scrollTo ?? (() => undefined);
    vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(() => undefined);
});

describe('a Form 1 bill on the printed receipt', () => {
    it('prints a shirt table and a trouser table, each with its own sizes', () => {
        const tables = printedTables(printedHtml(garmentBill()));

        expect(tables).toHaveLength(2);
        expect(tables[0].slice(0, 5)).toEqual([
            'ไซซ์เสื้อ',
            'แขน',
            'จำนวน',
            'ราคา/ตัว',
            'รวม',
        ]);
        expect(tables[1].slice(0, 5)).toEqual([
            'ไซซ์กางเกง',
            'ขา',
            'จำนวน',
            'ราคา/ตัว',
            'รวม',
        ]);
    });

    it('states the length on every line, so both lengths of one size stay apart', () => {
        const shirtTable = printedTables(printedHtml(garmentBill()))[0].join(
            ' | ',
        );

        expect(shirtTable).toContain('S | แขนสั้น | 20 | 100.00 | 2,000.00');
        expect(shirtTable).toContain('M | แขนยาว | 20 | 120.00 | 2,400.00');
    });

    it('prices per piece and totals the money, not the price column', () => {
        const html = printedHtml(garmentBill());

        // 20 x 100 plus 20 x 120 is 4,400 — never 220, the two prices added up.
        // The price column is left blank on the totals row: a total price per
        // piece would not mean anything.
        expect(printedTables(html)[0].slice(-4)).toEqual([
            'รวม',
            '40 ตัว',
            '',
            '4,400.00 บ.',
        ]);
        // One line under the tables: each garment, then the figure the
        // customer is asked for.
        expect(printedSummaries(html)[0]).toEqual([
            'เสื้อ',
            '40 ตัว',
            '4,400.00 บ.',
            'กางเกง',
            '20 ตัว',
            '2,000.00 บ.',
            'ราคารวม',
            '60 ตัว',
            '6,400.00 บาท',
        ]);
    });

    it('keeps the kids and adult sizes in their own block', () => {
        const html = printedHtml(
            garmentBill({
                items: [
                    ...garmentItems,
                    {
                        item_type: 'separate_shirt',
                        size_group: 'kids',
                        size_label: 'JM',
                        shirt_style: 'short',
                        quantity: 5,
                        unit_price: 80,
                        total_price: 400,
                    },
                ],
            }),
        );

        expect(html).toContain('ขนาดเด็ก');
        expect(html).toContain('ขนาดผู้ใหญ่');
        // Four tables: a shirt and a trouser list per size group.
        expect(printedTables(html)).toHaveLength(4);
    });

    it('keeps ประถม - มัธยมต้น in a table of its own, between kids and adults', () => {
        const html = printedHtml(
            garmentBill({
                form_mode: 'pe_uniform',
                items: [
                    ...garmentItems,
                    {
                        item_type: 'separate_shirt',
                        size_group: 'kids',
                        size_tier: 'junior',
                        size_label: 'JL',
                        shirt_style: 'short',
                        quantity: 6,
                        unit_price: 110,
                        total_price: 660,
                    },
                    {
                        item_type: 'separate_shirt',
                        size_group: 'kids',
                        size_tier: 'kids',
                        size_label: 'JM',
                        shirt_style: 'short',
                        quantity: 5,
                        unit_price: 80,
                        total_price: 400,
                    },
                ],
            }),
        );
        const titles = [
            ...html.matchAll(
                /<div class="size-block theme-([a-z]+)">\s*<div class="table-title">([^<]*)<\/div>/g,
            ),
        ].map((match) => `${match[1]}:${match[2]}`);

        expect(titles).toEqual([
            'kids:ขนาดเด็ก',
            'junior:ขนาดประถม - มัธยมต้น',
            'adults:ขนาดผู้ใหญ่',
        ]);
        // Six tables: a shirt and a trouser list per range.
        expect(printedTables(html)).toHaveLength(6);
        // The ประถม table carries only its own line.
        expect(printedTables(html)[2].join(' | ')).toContain(
            'JL | แขนสั้น | 6 | 110.00 | 660.00',
        );
    });

    it('splits the ranges the same way in the counter preview', () => {
        openDetail(
            garmentBill({
                form_mode: 'pe_uniform',
                items: [
                    ...garmentItems,
                    {
                        item_type: 'separate_shirt',
                        size_group: 'kids',
                        size_tier: 'junior',
                        size_label: 'JL',
                        shirt_style: 'short',
                        quantity: 6,
                        unit_price: 110,
                        total_price: 660,
                    },
                ],
            }),
        );

        expect(screen.getByText('ขนาดประถม - มัธยมต้น')).toBeInTheDocument();
        expect(screen.getByText('ขนาดผู้ใหญ่')).toBeInTheDocument();
    });

    it('shows a dash rather than an empty box when a garment was not ordered', () => {
        const trouserTable = printedTables(
            printedHtml(garmentBill({ items: [garmentItems[0]] })),
        )[1];

        expect(trouserTable).toContain('—');
        expect(trouserTable.slice(-4)).toEqual(['รวม', '0 ตัว', '', '0.00 บ.']);
    });

    it('does the same for a Form 4 bill, which is billed the same way', () => {
        const html = printedHtml(garmentBill({ form_mode: 'pe_uniform' }));

        expect(printedTables(html)).toHaveLength(2);
        expect(printedSummaries(html)[0].slice(-3)).toEqual([
            'ราคารวม',
            '60 ตัว',
            '6,400.00 บาท',
        ]);
    });
});

describe('bills that must keep the layout they were sold on', () => {
    it('leaves a bill carrying a set on the old table', () => {
        const html = printedHtml(
            garmentBill({
                items: [
                    ...garmentItems,
                    {
                        item_type: 'set',
                        size_group: 'adults',
                        size_label: 'L',
                        quantity: 4,
                        unit_price: 300,
                        total_price: 1200,
                    },
                ],
            }),
        );

        expect(printedTables(html)).toHaveLength(0);
        expect(html).toContain('ราคารวมต่อชุด');
    });

    it('leaves a colour-house bill on its own grid', () => {
        const html = printedHtml(garmentBill({ form_mode: 'sports_day' }));

        expect(printedTables(html)).toHaveLength(0);
    });

    it('leaves a bill saved before the form was recorded alone', () => {
        const html = printedHtml(garmentBill({ form_mode: '' }));

        expect(printedTables(html)).toHaveLength(0);
    });
});

describe('a Form 1 bill in the counter preview', () => {
    it('reads back as the same two tables the sheet prints', () => {
        openDetail(garmentBill());

        expect(screen.getByText('ไซซ์เสื้อ')).toBeInTheDocument();
        expect(screen.getByText('ไซซ์กางเกง')).toBeInTheDocument();
        // No set anywhere on a bill that has none.
        expect(
            screen.queryByText('ชุด (เสื้อ + กางเกง)'),
        ).not.toBeInTheDocument();
    });

    it('agrees with the sheet on the money', () => {
        openDetail(garmentBill());

        const summary = screen
            .getByText(/ราคารวม/)
            .closest('div') as HTMLElement;

        expect(summary.textContent?.replace(/\s+/g, ' ')).toContain('6,400.00');
    });
});

/**
 * Form 2 takes its numbers one person at a time, but the shop bills and cuts
 * it by size like Forms 1 and 4, so the counter reads it back the same way.
 * The name list is a sheet of its own and stays that way.
 */
const person = (
    over: Record<string, unknown> = {},
): Record<string, unknown> => ({
    item_type: 'shirt',
    size_group: 'adults',
    size_label: 'M',
    shirt_style: 'short',
    quantity: 1,
    unit_price: 250,
    total_price: 250,
    ...over,
});

const form2Bill = (items: Array<Record<string, unknown>>) =>
    makeRow({
        details: {
            ...makeRow().details,
            form_mode: 'individual',
            items,
            personalization_rows: [
                {
                    role: 'player' as const,
                    name: 'สมชาย',
                    size_group: 'adults' as const,
                    size: 'M',
                    number: '10',
                    pants_size: '',
                    pants_number: '',
                    quantity: 1,
                    unit_price: 250,
                    total_price: 250,
                },
            ],
        },
    });

describe('a Form 2 bill on the printed receipt', () => {
    it('reads back as the same two tables Forms 1 and 4 use', () => {
        const tables = printedTables(
            printedHtml(form2Bill([person(), person({ size_label: 'L' })])),
        );

        expect(tables).toHaveLength(2);
        expect(tables[0].slice(0, 5)).toEqual([
            'ไซซ์เสื้อ',
            'แขน',
            'จำนวน',
            'ราคา/ตัว',
            'รวม',
        ]);
    });

    it('gathers people of one size into a single line', () => {
        // Twenty-five people in M is one line of twenty-five to cut, not
        // twenty-five lines to read down.
        const tables = printedTables(
            printedHtml(form2Bill(Array.from({ length: 25 }, () => person()))),
        );

        expect(tables[0].slice(5)).toEqual([
            'M',
            'แขนสั้น',
            '25',
            '250.00',
            '6,250.00',
            'รวม',
            '25 ตัว',
            '',
            '6,250.00 บ.',
        ]);
    });

    it('keeps two lengths of one size apart, and two prices apart', () => {
        const shirtCells = printedTables(
            printedHtml(
                form2Bill([
                    person(),
                    person(),
                    person({
                        shirt_style: 'long',
                        unit_price: 280,
                        total_price: 280,
                    }),
                    person({ unit_price: 300, total_price: 300 }),
                ]),
            ),
        )[0];

        // Same size, but three things to bill: two short at 250, one long at
        // 280, one short at 300.
        expect(shirtCells.slice(5, 20)).toEqual([
            'M',
            'แขนยาว',
            '1',
            '280.00',
            '280.00',
            'M',
            'แขนสั้น',
            '2',
            '250.00',
            '500.00',
            'M',
            'แขนสั้น',
            '1',
            '300.00',
            '300.00',
        ]);
    });

    it('prints the trousers of a bill that ordered them too', () => {
        const tables = printedTables(
            printedHtml(
                form2Bill([
                    person(),
                    person({
                        item_type: 'pants',
                        pants_style: 'long',
                        shirt_style: null,
                        unit_price: 180,
                        total_price: 180,
                    }),
                ]),
            ),
        );

        expect(tables[1].slice(5, 10)).toEqual([
            'M',
            'ขายาว',
            '1',
            '180.00',
            '180.00',
        ]);
    });

    it('never claims a length a bill saved before lengths existed never had', () => {
        const shirtCells = printedTables(
            printedHtml(
                form2Bill([
                    person({ shirt_style: null }),
                    person({ shirt_style: null }),
                ]),
            ),
        )[0];

        // A dash, not "แขนสั้น": the bill never said which.
        expect(shirtCells.slice(5, 10)).toEqual([
            'M',
            '-',
            '2',
            '250.00',
            '500.00',
        ]);
    });

    it('still offers the name list as its own sheet', () => {
        openDetail(form2Bill([person()]) as never);

        expect(
            screen.getByRole('button', { name: /ปริ้นใบรายชื่อ/ }),
        ).toBeInTheDocument();
    });

    it('reads back the same way in the counter preview', () => {
        openDetail(form2Bill([person(), person()]) as never);

        expect(screen.getByText('ไซซ์เสื้อ')).toBeInTheDocument();
        expect(screen.getByText('ไซซ์กางเกง')).toBeInTheDocument();
    });
});

/**
 * The sizes stay on the shirt-and-trouser tables above; the spec is printed
 * one card per sheet the floor sews, each with the spec saved under its own
 * key, shirts first.
 */
const specCards = (html: string): Array<{ key: string; text: string }> =>
    [
        ...html.matchAll(
            /<div class="spec-card [^"]*" data-sheet="([^"]+)">([\s\S]*?)(?=<div class="spec-card |<table class="footer-table">)/g,
        ),
    ].map((match) => ({
        key: match[1],
        text: match[2]
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
    }));

const perSheetSpecs = {
    spec_sections: {
        shirt: [{ label: 'แพทเทิร์น', value: 'แพทเทิร์นมาตรฐาน' }],
        pants: [{ label: 'แบบขา', value: 'ขาตรง' }],
        batches: {
            shirt_adults_short: [
                { label: 'แพทเทิร์น', value: 'โปโล' },
                { label: 'ปลายแขน', value: 'ธรรมดา' },
            ],
            shirt_adults_long: [
                { label: 'แพทเทิร์น', value: 'โปโล' },
                { label: 'ปลายแขน', value: 'จั๊ม' },
            ],
            pants_adults_short: [{ label: 'แบบขา', value: 'ขาจั๊ม' }],
        },
    },
};

/**
 * The spec used to print as a card per production sheet. It was the one thing
 * that could push the receipt past its A4 page — six differing sheets meant
 * six blocks of twenty settings — and it is read on screen instead, where
 * there is room to group it and to mark what differs between sheets. The
 * receipt carries what the customer signs for; the floor works from the
 * production sheets.
 */
describe('the spec on a Form 1 receipt', () => {
    it('prints no spec at all, however many sheets the bill has', () => {
        const html = printedHtml(garmentBill(perSheetSpecs));

        expect(specCards(html)).toHaveLength(0);
        expect(html).not.toContain('spec-sections');
        expect(html).not.toContain('เสื้อผู้ใหญ่ · แขนสั้น');
        expect(html).not.toContain('ขาจั๊ม');
    });

    it('still prints the sizes and the signatures', () => {
        const html = printedHtml(garmentBill(perSheetSpecs));

        expect(html).toContain('ลงชื่อผู้สั่งสินค้า');
        expect(html).toContain('size: A4 portrait');
    });
});

describe('the spec in the counter preview', () => {
    it('shows the same cards the receipt prints', () => {
        openDetail(garmentBill(perSheetSpecs));

        const shortSleeve = screen.getByRole('article', {
            name: 'สเปกเสื้อผู้ใหญ่ · แขนสั้น',
        });
        const trousers = screen.getByRole('article', {
            name: 'สเปกกางเกงผู้ใหญ่ · ขาสั้น',
        });

        expect(within(shortSleeve).getByText('▲ ธรรมดา')).toBeInTheDocument();
        expect(
            within(shortSleeve).getByText('ไซซ์ S 20', { exact: false }),
        ).toBeInTheDocument();
        expect(within(trousers).getByText('ขาจั๊ม')).toBeInTheDocument();
        expect(within(trousers).queryByText('โปโล')).not.toBeInTheDocument();
        expect(
            screen.getByRole('article', { name: 'สเปกเสื้อผู้ใหญ่ · แขนยาว' }),
        ).toBeInTheDocument();
    });
});

describe('a colour-house bill in the counter preview', () => {
    it('shows the pictures of each house, as its printed receipt does', () => {
        openDetail(
            garmentBill({
                form_mode: 'sports_day',
                sports_day_artwork_urls: [
                    'https://example.test/red-house.webp',
                ],
            }),
        );

        expect(
            document.querySelector(
                'img[src="https://example.test/red-house.webp"]',
            ),
        ).not.toBeNull();
    });
});
