import { fireEvent, render, screen, within } from '@testing-library/react';
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
 * The costing column is the part of the sheet the floor is paid from, so it
 * has to carry every operation the order was priced at. It used to keep only
 * the first twelve rows (fifteen before that) while the total underneath still
 * added up all of them — a worker reading the sheet could not get from the
 * rows to the money. Now:
 *
 *  - up to twelve operations print at the standard row height, padded with
 *    blank rows for handwriting;
 *  - thirteen to twenty drop to the dense row height and still fit the page;
 *  - past twenty the sheet grows rather than hiding the tail of the list;
 *  - no operations at all prints a notice, because a garment type without a
 *    rate card is not the same thing as free labour.
 */
const OPERATION_NAMES = [
    'โพ้งไหล่',
    'ต่อปก',
    'กลับปก+ทับปกบน',
    'ทำสาบ',
    'ติดสาบ',
    'โพ้งข้าง',
    'ต่อแขน',
    'ลาแขน',
    'ลาชายเสื้อ',
    'ติดกระดุม',
    'รังดุม',
    'ลาปลายแขน',
    'กุ๊นคอ',
    'ติดป้ายไซส์',
    'ตัดด้าย',
    'รีด',
    'พับ/แพ็ค',
    'ปักโลโก้อก',
    'เย็บกระเป๋า',
    'ต่อข้างลาย',
    'ลาสาบใน',
    'เย็บซิป',
];

const operations = (count: number) =>
    OPERATION_NAMES.slice(0, count).map((name, index) => ({
        name,
        child_price: 1 + index,
        adult_price: 2 + index,
        child_price_long: null,
        adult_price_long: null,
    }));

const sum = (rows: { adult_price: number }[]) =>
    rows.reduce((total, row) => total + row.adult_price, 0);

/** Money the way the sheet prints it: two decimals, thousands separated. */
const money = (value: number) =>
    value.toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

/** One adult short-sleeve shirt batch of ten, priced at the given operations. */
const makeOrder = (id: number): Order =>
    ({
        id,
        order_code: `ORD-${id}`,
        job_name: 'งานทดสอบค่าแรง',
        job_type: 'งานปัก',
        order_status: 'in_production',
        order_date: '2026-09-01',
        due_date: '2026-09-10',
        branch: { branch_name: 'สาขา 1' },
        customer: { customer_name: 'ลูกค้า' },
        creator_user: { name: 'ผู้สร้าง' },
        items: [
            {
                item_type: 'shirt',
                shirt_style: 'short',
                size_group: 'adults',
                size_label: 'L',
                quantity: 10,
            },
        ],
        receipts: [],
        status_histories: [],
        specification: {
            screen_print_detail: JSON.stringify({
                schema: 'spec-v2',
                mode: 'matrix',
                shirt_specs: { shirt_type_id: '2' },
            }),
        },
        routings: [
            {
                id: id * 100,
                station_name: 'sewing',
                is_required: true,
                status: 'pending',
                created_at: '2026-09-01T10:00:00.000000Z',
                updated_at: '2026-09-01T10:00:00.000000Z',
                started_at: null,
                completed_at: null,
            },
        ],
    }) as unknown as Order;

const renderPriced = (id: number, operationCount: number) => {
    const components = operations(operationCount);
    const unitTotal = sum(components);

    mockPage.props = {
        productionPricingMap: {
            [String(id)]: {
                shirt_type_id: 2,
                shirt_type_name: 'เสื้อคอกลม',
                pants_type_id: 4,
                pants_type_name: 'กางเกง',
                components,
                pants_components: [],
                child_unit_total: 0,
                adult_unit_total: unitTotal,
                child_total: 0,
                adult_total: unitTotal * 10,
                grand_total: unitTotal * 10,
                groups: [
                    {
                        key: 'shirt_adults_short',
                        unit_total: unitTotal,
                        subtotal: unitTotal * 10,
                    },
                ],
            },
        },
    };

    const view = render(
        <ProductionBoardPage
            orders={[makeOrder(id)]}
            branches={[]}
            initialDepartmentFilter="sewing"
            showDepartmentFilter={false}
            pageTitle="ห้องเย็บ"
        />,
    );

    fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);

    return { ...view, components, unitTotal };
};

const sheet = () =>
    document.querySelector(
        '#production-sheet-shirt_adults_short',
    ) as HTMLElement;

const costingTable = () =>
    sheet().querySelector('.p-process-table') as HTMLTableElement;

const bodyRows = () => [...costingTable().querySelectorAll('tbody tr')];

const operationRows = () =>
    bodyRows().filter(
        (row) =>
            !row.classList.contains('p-process-sum') &&
            !row.classList.contains('p-process-formula') &&
            !row.classList.contains('p-process-notice'),
    );

const rowText = (row: Element) =>
    (row.querySelector('td')?.textContent ?? '').trim();

afterEach(() => {
    vi.restoreAllMocks();
});

describe('the costing rows on a production sheet', () => {
    it('pads a short list with blank rows at the standard height', () => {
        renderPriced(301, 5);

        const rows = operationRows();

        expect(rows.map(rowText).filter(Boolean)).toEqual(
            OPERATION_NAMES.slice(0, 5),
        );
        // Twelve lines to write on, whatever the list length.
        expect(rows).toHaveLength(12);
        expect(costingTable().dataset.processDensity).toBe('standard');
        expect(costingTable().className).not.toContain('p-process-table-dense');
    });

    it('prints all eighteen operations instead of the first twelve', () => {
        const { unitTotal } = renderPriced(302, 18);

        const rows = operationRows();

        expect(rows.map(rowText)).toEqual(OPERATION_NAMES.slice(0, 18));
        // No blank padding once the list is already taller than the standard column.
        expect(rows).toHaveLength(18);
        expect(costingTable().dataset.processDensity).toBe('dense');
        expect(costingTable().className).toContain('p-process-table-dense');
        expect(sheet().className).not.toContain('p-print-page-flow');

        // Every row carries its own price, and the total is still the sum of them.
        const prices = rows.map((row) =>
            (row.querySelectorAll('td')[1]?.textContent ?? '').trim(),
        );
        expect(prices[17]).toBe('19.00');
        expect(
            within(
                costingTable().querySelector('.p-process-sum') as HTMLElement,
            ).getByText(money(unitTotal * 10)),
        ).toBeInTheDocument();
        expect(
            within(
                costingTable().querySelector(
                    '.p-process-formula',
                ) as HTMLElement,
            ).getByText(`10 x ${money(unitTotal)} = ${money(unitTotal * 10)}`),
        ).toBeInTheDocument();
    });

    it('lets the sheet grow past twenty operations rather than cut the list', () => {
        renderPriced(303, 22);

        expect(operationRows().map(rowText)).toEqual(
            OPERATION_NAMES.slice(0, 22),
        );
        expect(costingTable().dataset.processDensity).toBe('overflow');
        expect(sheet().className).toContain('p-print-page-flow');
    });

    it('carries every row through to the print window', () => {
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

        renderPriced(304, 18);
        fireEvent.click(screen.getByRole('button', { name: /Print เอกสาร/ }));

        const body = written.slice(written.indexOf('<body>'));

        for (const name of OPERATION_NAMES.slice(0, 18)) {
            expect(body).toContain(name);
        }

        // The dense rules travel with the sheet, so paper gets the same fit.
        expect(body).toContain('p-process-table-dense');
        expect(body).toContain('.p-process-table-dense th');
    });
});

describe('a garment type with no rate card', () => {
    it('says so on the sheet instead of printing 0.00', () => {
        renderPriced(305, 0);

        const table = costingTable();

        expect(
            within(table).getByText(
                /ยังไม่ได้ตั้งค่าแรงสำหรับ เสื้อคอกลม — ตั้งได้ที่ จัดการข้อมูล › เซ็ทราคาเด็กและผู้ใหญ่/,
            ),
        ).toBeInTheDocument();
        expect(
            within(
                table.querySelector('.p-process-sum') as HTMLElement,
            ).getByText('ยังไม่ได้ตั้งค่าแรง'),
        ).toBeInTheDocument();
        expect(
            within(
                table.querySelector('.p-process-formula') as HTMLElement,
            ).getByText('10 x — = —'),
        ).toBeInTheDocument();
        expect(within(table).queryByText('0.00')).not.toBeInTheDocument();
        // Still twelve lines to write the real operations on by hand.
        expect(operationRows()).toHaveLength(12);
    });

    it('warns in the dialog and links to the rate card for that type', () => {
        renderPriced(306, 0);

        const alert = screen.getByRole('alert');

        expect(alert).toHaveTextContent('ยังไม่ได้ตั้งค่าแรง');
        expect(alert).toHaveTextContent('เสื้อคอกลม');
        expect(alert).toHaveTextContent(
            'ใบงาน 1 ใบจะพิมพ์โดยไม่มีรายการและไม่คิดยอด',
        );
        expect(alert).toHaveTextContent('มีผลกับบิลที่เปิดหลังจากตั้ง');
        expect(
            within(alert).getByRole('link', { name: /ตั้งค่าแรงที่/ }),
        ).toHaveAttribute(
            'href',
            '/settings/data/garments/prices?category=SHIRT&garment_type_id=2',
        );
    });

    it('stays quiet when every garment on the bill is priced', () => {
        renderPriced(307, 3);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(
            screen.queryByText(/ยังไม่ได้ตั้งค่าแรง/),
        ).not.toBeInTheDocument();
    });
});
