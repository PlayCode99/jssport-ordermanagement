import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { Order } from '@/types/models';

const mockPage = vi.hoisted(() => ({
    props: {} as Record<string, unknown>,
    url: '/production/sewing',
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        href,
        className,
        children,
    }: {
        href: string;
        className?: string;
        children: ReactNode;
    }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
    router: { get: vi.fn(), reload: vi.fn() },
    usePage: () => mockPage,
}));

/**
 * How many sheets the floor is actually handed.
 *
 * The costing side is checked in ProductionSheetMatrixUatTest, which opens real
 * bills through POST /orders and reads /production/kanban. This walks the other
 * half of the same flow: the sheets the dialog renders and the print button
 * sends to paper. The two have to agree — a bill costed as eight batches that
 * prints six sheets is a bill the shop cannot reconcile.
 */

type SpecPayload = Record<string, unknown>;

const spec = (over: SpecPayload = {}): SpecPayload => ({
    schema: 'spec-v2',
    mode: 'matrix',
    shirt_specs: { shirt_type_id: '21', fabric_color_id: '3' },
    pants_specs: { pants_type_id: '31', fabric_color_id: '3' },
    ...over,
});

const makeOrder = (
    id: number,
    items: Array<Record<string, unknown>>,
    specPayload: SpecPayload = spec(),
): Order =>
    ({
        id,
        order_code: `ORD-${id}`,
        job_name: 'ใบงานทดสอบ',
        job_type: 'งานสกรีน',
        order_status: 'in_production',
        order_date: '2026-09-09',
        due_date: '2026-09-20',
        branch: { branch_name: 'สาขาทดสอบ' },
        customer: { customer_name: 'ลูกค้าทดสอบ' },
        creator_user: { name: 'ผู้สร้าง' },
        items,
        receipts: [],
        status_histories: [],
        specification: {
            pattern_id: 1,
            fabric_id: 1,
            screen_print_detail: JSON.stringify(specPayload),
        },
        routings: [
            {
                id: id * 100,
                station_name: 'sewing',
                is_required: true,
                status: 'pending',
                created_at: '2026-09-09T10:00:00.000000Z',
                updated_at: '2026-09-09T10:00:00.000000Z',
                started_at: null,
                completed_at: null,
            },
        ],
    }) as unknown as Order;

/** The sheets that reach the floor, in the order they are printed. */
const sheetsFor = (order: Order): string[] => {
    mockPage.props = {};

    render(
        <ProductionBoardPage
            orders={[order]}
            branches={[]}
            initialDepartmentFilter="sewing"
            showDepartmentFilter={false}
            pageTitle="ห้องเย็บ"
        />,
    );

    fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);

    return [
        ...document.querySelectorAll(
            '.p-print-page:not(.p-print-page-flow) .p-head-row-main',
        ),
    ].map((node) => node.textContent?.trim() ?? '');
};

const set = (
    sizeGroup: string,
    sizeLabel: string,
    shirtStyle: string,
    pantsStyle: string,
    quantity: number,
) => ({
    item_type: 'set',
    size_group: sizeGroup,
    size_label: sizeLabel,
    shirt_style: shirtStyle,
    pants_style: pantsStyle,
    quantity,
});

const fullLengthMatrix = [
    set('kids', 'JM', 'short', 'short', 12),
    set('kids', 'JL', 'long', 'long', 8),
    set('adults', 'M', 'short', 'short', 20),
    set('adults', 'L', 'long', 'long', 10),
];

const eightSheets = [
    'เสื้อไซต์เด็ก แขนสั้น',
    'เสื้อไซต์เด็ก แขนยาว',
    'เสื้อไซต์ผู้ใหญ่ แขนสั้น',
    'เสื้อไซต์ผู้ใหญ่ แขนยาว',
    'กางเกงเด็ก ขาสั้น',
    'กางเกงเด็ก ขายาว',
    'กางเกงผู้ใหญ่ ขาสั้น',
    'กางเกงผู้ใหญ่ ขายาว',
];

afterEach(() => {
    cleanup();
});

describe('the sheets the floor is handed', () => {
    it('form 1: kids and adults, both sleeves and both legs, prints eight', () => {
        expect(sheetsFor(makeOrder(201, fullLengthMatrix))).toEqual(
            eightSheets,
        );
    });

    it('form 4 prints the same eight as form 1', () => {
        expect(
            sheetsFor(
                makeOrder(202, fullLengthMatrix, spec({ mode: 'pe_uniform' })),
            ),
        ).toEqual(eightSheets);
    });

    it('one length only prints four', () => {
        expect(
            sheetsFor(
                makeOrder(203, [
                    set('kids', 'JM', 'short', 'short', 10),
                    set('adults', 'L', 'short', 'short', 20),
                ]),
            ),
        ).toEqual([
            'เสื้อไซต์เด็ก แขนสั้น',
            'เสื้อไซต์ผู้ใหญ่ แขนสั้น',
            'กางเกงเด็ก ขาสั้น',
            'กางเกงผู้ใหญ่ ขาสั้น',
        ]);
    });

    it('a shirts-only bill never prints a pants sheet', () => {
        expect(
            sheetsFor(
                makeOrder(
                    204,
                    [
                        {
                            item_type: 'separate_shirt',
                            size_group: 'adults',
                            size_label: 'M',
                            shirt_style: 'short',
                            quantity: 15,
                        },
                        {
                            item_type: 'separate_shirt',
                            size_group: 'adults',
                            size_label: 'L',
                            shirt_style: 'long',
                            quantity: 5,
                        },
                    ],
                    spec({ pants_specs: {} }),
                ),
            ),
        ).toEqual(['เสื้อไซต์ผู้ใหญ่ แขนสั้น', 'เสื้อไซต์ผู้ใหญ่ แขนยาว']);
    });

    it('form 2 with a length per person prints eight, plus the name list', () => {
        const order = makeOrder(
            205,
            [
                {
                    item_type: 'shirt',
                    size_group: 'kids',
                    size_label: 'JM',
                    shirt_style: 'short',
                    quantity: 12,
                },
                {
                    item_type: 'shirt',
                    size_group: 'kids',
                    size_label: 'JL',
                    shirt_style: 'long',
                    quantity: 8,
                },
                {
                    item_type: 'shirt',
                    size_group: 'adults',
                    size_label: 'M',
                    shirt_style: 'short',
                    quantity: 20,
                },
                {
                    item_type: 'shirt',
                    size_group: 'adults',
                    size_label: 'L',
                    shirt_style: 'long',
                    quantity: 10,
                },
                {
                    item_type: 'pants',
                    size_group: 'kids',
                    size_label: 'JM',
                    pants_style: 'short',
                    quantity: 12,
                },
                {
                    item_type: 'pants',
                    size_group: 'kids',
                    size_label: 'JL',
                    pants_style: 'long',
                    quantity: 8,
                },
                {
                    item_type: 'pants',
                    size_group: 'adults',
                    size_label: 'M',
                    pants_style: 'short',
                    quantity: 20,
                },
                {
                    item_type: 'pants',
                    size_group: 'adults',
                    size_label: 'L',
                    pants_style: 'long',
                    quantity: 10,
                },
            ],
            spec({
                mode: 'individual',
                personalization_rows: [
                    {
                        name: 'สมชาย',
                        size: 'M',
                        number: '9',
                        shirt_style: 'short',
                        pants_style: 'short',
                        quantity: 1,
                    },
                ],
            }),
        );

        expect(sheetsFor(order)).toEqual(eightSheets);
        // The name list is a sheet of its own on top of the eight.
        expect(document.querySelectorAll('.p-print-page-flow')).toHaveLength(1);
        expect(document.querySelectorAll('.p-print-page')).toHaveLength(9);
    });

    it('a form 2 bill written before lengths existed prints the unspecified batches', () => {
        expect(
            sheetsFor(
                makeOrder(
                    206,
                    [
                        {
                            item_type: 'shirt',
                            size_group: 'adults',
                            size_label: 'L',
                            quantity: 10,
                        },
                        {
                            item_type: 'pants',
                            size_group: 'adults',
                            size_label: 'L',
                            quantity: 10,
                        },
                    ],
                    spec({
                        mode: 'individual',
                        personalization_rows: [
                            {
                                name: 'สมชาย',
                                size: 'L',
                                number: '9',
                                quantity: 1,
                            },
                        ],
                    }),
                ),
            ),
        ).toEqual(['เสื้อไซต์ผู้ใหญ่ ไม่ระบุแขน', 'กางเกงผู้ใหญ่ ไม่ระบุขา']);
    });

    it('splits a set on the same evidence the costing uses', () => {
        // The only thing this bill says about pants is which garment type they
        // are. The costing counts that as pants and books two batches, so the
        // floor has to be handed two sheets or the two sides stop agreeing.
        expect(
            sheetsFor(
                makeOrder(207, [set('adults', 'M', 'short', 'short', 10)], {
                    schema: 'spec-v2',
                    mode: 'matrix',
                    shirt_specs: { shirt_type_id: '21' },
                    pants_specs: { pants_type_id: '31' },
                }),
            ),
        ).toEqual(['เสื้อไซต์ผู้ใหญ่ แขนสั้น', 'กางเกงผู้ใหญ่ ขาสั้น']);
    });

    it('prints every sheet it shows', () => {
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

        const shown = sheetsFor(makeOrder(208, fullLengthMatrix));

        fireEvent.click(screen.getByRole('button', { name: /Print เอกสาร/ }));

        const body = written.slice(written.indexOf('<body>'));

        for (const label of shown) {
            expect(body).toContain(label);
        }

        // Eight sheets on screen, eight pages on paper.
        expect(body.split('p-print-page').length - 1).toBeGreaterThanOrEqual(8);

        vi.restoreAllMocks();
    });
});
