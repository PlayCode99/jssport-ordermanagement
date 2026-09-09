import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { Order } from '@/types/models';

const mockPage = vi.hoisted(() => ({
    props: {} as Record<string, unknown>,
    url: '/production/sewing',
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    router: { get: vi.fn(), reload: vi.fn() },
    usePage: () => mockPage,
}));

/**
 * The dialog used to open onto a stack of full A4 sheets — six of them on an
 * ordinary bill, thousands of pixels of scrolling before the floor reached
 * anything it could act on. The sheets are now folded away behind a toggle and
 * a row of chips leads to them. They must stay mounted while folded, because
 * printing reads them straight out of this DOM.
 */
const makeOrder = (id: number, over: Record<string, unknown> = {}): Order =>
    ({
        id,
        order_code: `ORD-${id}`,
        job_name: 'งานพับใบ',
        job_type: 'งานสกรีน',
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
                size_group: 'kids',
                size_label: 'JM',
                quantity: 12,
            },
            {
                item_type: 'shirt',
                shirt_style: 'long',
                size_group: 'adults',
                size_label: 'L',
                quantity: 8,
            },
            {
                item_type: 'pants',
                pants_style: 'short',
                size_group: 'kids',
                size_label: 'JM',
                quantity: 12,
            },
            {
                item_type: 'pants',
                pants_style: 'long',
                size_group: 'adults',
                size_label: 'L',
                quantity: 8,
            },
        ],
        receipts: [],
        status_histories: [],
        specification: {
            screen_print_detail: JSON.stringify({
                schema: 'spec-v2',
                mode: 'matrix',
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
        ...over,
    }) as unknown as Order;

const renderBoard = (orders: Order[]) => {
    mockPage.props = {};

    return render(
        <ProductionBoardPage
            orders={orders}
            branches={[]}
            initialDepartmentFilter="sewing"
            showDepartmentFilter={false}
            pageTitle="ห้องเย็บ"
        />,
    );
};

const openDetail = (index = 0) => {
    fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[index]);
};

const sheetStack = () =>
    document.querySelector('[data-print-sheets]') as HTMLElement;

describe('folding the production sheets', () => {
    it('opens with the sheets folded and says how many there are', () => {
        renderBoard([makeOrder(91)]);
        openDetail();

        expect(sheetStack().className).toContain('hidden');
        expect(
            screen.getByRole('button', {
                name: /ตัวอย่างใบงานก่อนพิมพ์ \(4 ใบ\)/,
            }),
        ).toBeInTheDocument();
        // Folded, not unmounted: printing reads the sheets from here.
        expect(document.querySelectorAll('.p-print-page').length).toBe(4);
    });

    it('unfolds and folds again from the toggle', () => {
        renderBoard([makeOrder(92)]);
        openDetail();

        const toggle = screen.getByRole('button', {
            name: /ตัวอย่างใบงานก่อนพิมพ์/,
        });

        fireEvent.click(toggle);
        expect(sheetStack().className).not.toContain('hidden');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        fireEvent.click(toggle);
        expect(sheetStack().className).toContain('hidden');
    });

    it('leads to a sheet from its chip', () => {
        renderBoard([makeOrder(93)]);
        openDetail();

        // Every group is one chip, carrying the quantity the floor sews.
        const chip = screen.getByTitle('ไปที่ใบงาน กางเกงผู้ใหญ่ ขายาว');

        expect(chip.textContent).toContain('8');

        fireEvent.click(chip);

        expect(sheetStack().className).not.toContain('hidden');
        expect(
            document.getElementById('production-sheet-pants_adults_long'),
        ).toBeTruthy();
    });

    it('puts the floor figures above the fold', () => {
        renderBoard([makeOrder(94)]);
        openDetail();

        expect(screen.getByText('ใบงานที่ต้องพิมพ์')).toBeInTheDocument();
        expect(screen.getByText('4 ใบ')).toBeInTheDocument();
        expect(screen.getByText('40 ตัว')).toBeInTheDocument();
    });

    it('prints every sheet even while they are folded away', () => {
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

        renderBoard([makeOrder(95)]);
        openDetail();

        // Nobody opened the preview, so the stack is still folded on screen.
        expect(sheetStack().className).toContain('hidden');

        fireEvent.click(screen.getByRole('button', { name: /Print เอกสาร/ }));

        const body = written.slice(written.indexOf('<body>'));

        // The paper gets all four regardless, and none of them carries the
        // class that folds it away on screen.
        for (const label of [
            'เสื้อไซต์เด็ก แขนสั้น',
            'เสื้อไซต์ผู้ใหญ่ แขนยาว',
            'กางเกงเด็ก ขาสั้น',
            'กางเกงผู้ใหญ่ ขายาว',
        ]) {
            expect(body).toContain(label);
        }

        // 297 - 2*5 wide and 210 - 2*5 tall: the paper margin and the page box
        // agree, so a sheet occupies exactly one side of A4 landscape.
        expect(written).toContain('@page { size: A4 landscape; margin: 5mm; }');
        expect(body).toContain('data-print-sheets');
        expect(body).not.toContain('data-print-sheets="true" class="hidden"');
        // The navigator is a screen control, so it stays off the paper.
        expect(body).not.toContain('ตัวอย่างใบงานก่อนพิมพ์');
        expect(body).not.toContain('ใบงานที่ต้องพิมพ์');

        vi.restoreAllMocks();
    });

    it('folds again when a different order is opened', () => {
        renderBoard([makeOrder(96), makeOrder(97)]);
        openDetail(0);

        fireEvent.click(
            screen.getByRole('button', { name: /ตัวอย่างใบงานก่อนพิมพ์/ }),
        );
        expect(sheetStack().className).not.toContain('hidden');

        fireEvent.keyDown(document.body, { key: 'Escape' });
        openDetail(1);

        // A fresh order starts from the summary, not wherever the last one was
        // left scrolled to.
        expect(sheetStack().className).toContain('hidden');
    });
});

/**
 * A spec sheet has around thirty fields and an ordinary bill fills about half.
 * The blank half used to print a column of dashes down the middle of the
 * dialog, so it is folded away behind a count instead.
 */
describe('blank spec fields', () => {
    const specSections = {
        shirt: [
            { label: 'แพทเทิร์น', value: 'แพทเทิร์นเข้ารูป' },
            { label: 'เนื้อผ้า', value: 'TK' },
            { label: 'แบบแขน', value: '' },
            { label: 'แบบกุ๊น', value: '-' },
        ],
        pants: [
            { label: 'แพทเทิร์น', value: 'ขาสั้นมาตรฐาน' },
            { label: 'กุ๊นกางเกง', value: '' },
        ],
    };

    const renderWithSpecs = () => {
        const order = makeOrder(98);
        mockPage.props = {
            specSectionsMap: { '98': specSections },
        };

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="sewing"
                showDepartmentFilter={false}
                pageTitle="ห้องเย็บ"
                specSectionsMap={{ '98': specSections } as never}
            />,
        );

        openDetail();
    };

    const specValues = () =>
        Array.from(document.querySelectorAll('.p-spec-row')).map(
            (row) => row.textContent ?? '',
        );

    it('shows only the fields somebody filled in', () => {
        renderWithSpecs();

        const rows = specValues();

        expect(rows).toHaveLength(3);
        expect(rows.join(' ')).toContain('แพทเทิร์นเข้ารูป');
        expect(rows.join(' ')).not.toContain('แบบแขน');
        // '-' is the placeholder a blank prints as, so it counts as blank.
        expect(rows.join(' ')).not.toContain('แบบกุ๊น');
    });

    it('counts the blanks on the toggle and brings them all back', () => {
        renderWithSpecs();

        const toggle = screen.getByRole('button', {
            name: 'ดูช่องที่ยังไม่ได้กรอก (3)',
        });

        fireEvent.click(toggle);

        expect(specValues()).toHaveLength(6);
        expect(specValues().join(' ')).toContain('แบบแขน');
        expect(
            screen.getByRole('button', { name: 'ซ่อนช่องที่ยังไม่ได้กรอก' }),
        ).toBeInTheDocument();
    });

    it('says so plainly when a garment has no spec at all', () => {
        renderBoard([makeOrder(99)]);
        openDetail();

        expect(screen.getAllByText(/ยังไม่ได้กรอกสเปก/).length).toBeGreaterThan(
            0,
        );
        // Nothing to unfold, so no toggle is offered.
        expect(
            screen.queryByRole('button', { name: /ช่องที่ยังไม่ได้กรอก/ }),
        ).toBeNull();
    });
});

/**
 * The order card used to split the two dates across different columns and bury
 * the barcode inside the block of figures. It now reads job, then dates, then
 * the people involved.
 */
describe('the order card', () => {
    it('puts the two dates together with the due date picked out', () => {
        renderBoard([makeOrder(100)]);
        openDetail();

        const created = screen.getByText('วันที่สร้างใบงาน').parentElement;
        const due = screen.getByText('วันที่รับสินค้า').parentElement;

        expect(created?.parentElement).toBe(due?.parentElement);
        expect(due?.className).toContain('red');
    });

    it('keeps the job, the people and the figures apart', () => {
        renderBoard([makeOrder(101)]);
        openDetail();

        const card = within(document.querySelector('.p-head') as HTMLElement);

        expect(card.getByText('ชื่อหน่วยงาน, ชื่องาน')).toBeInTheDocument();
        expect(card.getByText('งานพับใบ')).toBeInTheDocument();
        expect(card.getByText(/สรุปตามกลุ่มการผลิต/)).toBeInTheDocument();

        // The barcode is scanned, not read, so it is no longer inside the
        // block that carries the quantity.
        const badge = document.querySelector('.p-badge') as HTMLElement;

        expect(badge.querySelector('.p-barcode-wrap')).toBeNull();
        expect(document.querySelector('.p-barcode-wrap')).toBeTruthy();
    });
});

/**
 * A Form 2 bill carries a name list as a sheet of its own. The floor hands that
 * list around on its own, so it prints without the group sheets attached.
 */
describe('the name list', () => {
    const nameListOrder = (id: number) =>
        makeOrder(id, {
            specification: {
                screen_print_detail: JSON.stringify({
                    schema: 'spec-v2',
                    mode: 'individual',
                    personalization_rows: [
                        {
                            name: 'สุวรรณชารี',
                            number: '10',
                            size: 'M',
                            quantity: 1,
                        },
                        { name: 'พรช', number: '7', size: 'L', quantity: 1 },
                    ],
                }),
            },
        });

    const capturePrint = (buttonName: RegExp) => {
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

        fireEvent.click(screen.getByRole('button', { name: buttonName }));

        return written;
    };

    it('offers its own print button only on a bill that has one', () => {
        renderBoard([nameListOrder(120)]);
        openDetail();

        expect(
            screen.getByRole('button', { name: /ปริ้นใบรายชื่อ/ }),
        ).toBeInTheDocument();
    });

    it('keeps the button away from a bill with no names', () => {
        renderBoard([makeOrder(121)]);
        openDetail();

        expect(
            screen.queryByRole('button', { name: /ปริ้นใบรายชื่อ/ }),
        ).toBeNull();
    });

    it('prints the list on its own, without the group sheets', () => {
        renderBoard([nameListOrder(122)]);
        openDetail();

        const written = capturePrint(/ปริ้นใบรายชื่อ/);
        const body = written.slice(written.indexOf('<body>'));

        expect(written).toContain('ใบรายชื่อสกรีน ORD-122');
        expect(body).toContain('รายชื่อสกรีนรายตัว');
        expect(body).toContain('สุวรรณชารี');
        // The costing sheets belong to the other button.
        expect(body).not.toContain('รายการค่าแรง');
        expect(body).not.toContain('เสื้อไซต์ผู้ใหญ่');

        vi.restoreAllMocks();
    });

    it('still sends every sheet when the whole receipt is printed', () => {
        renderBoard([nameListOrder(123)]);
        openDetail();

        const written = capturePrint(/Print เอกสาร/);
        const body = written.slice(written.indexOf('<body>'));

        expect(body).toContain('รายชื่อสกรีนรายตัว');
        expect(body).toContain('รายการค่าแรง');

        vi.restoreAllMocks();
    });

    it('fills the sheet with numbered lines a name can be added to', () => {
        renderBoard([nameListOrder(124)]);
        openDetail();

        // Two people on the list, eighteen lines on the page: the sheet reaches
        // the bottom of its card instead of trailing off after two rows.
        const rows = document.querySelectorAll(
            '.p-personalization-table tbody tr',
        );

        expect(rows).toHaveLength(19);
        expect(
            document.querySelectorAll('.p-personalization-table thead th'),
        ).toHaveLength(5);
    });
});

/**
 * A Form 2 sheet used to print without the size bar, on the grounds that the
 * name list carries a size per person. The floor still cuts by size, so the
 * first sheet needs the same bar every other form prints.
 */
describe('sizes on a name-list sheet', () => {
    const individualSpec = {
        screen_print_detail: JSON.stringify({
            schema: 'spec-v2',
            mode: 'individual',
            personalization_rows: [
                { name: 'สมชาย', number: '10', size: 'L', quantity: 1 },
            ],
        }),
    };

    it('prints the sizes and the total the bill was written with', () => {
        renderBoard([
            makeOrder(130, {
                specification: individualSpec,
                items: [
                    {
                        item_type: 'shirt',
                        size_group: 'adults',
                        size_label: 'M',
                        quantity: 4,
                    },
                    {
                        item_type: 'shirt',
                        size_group: 'adults',
                        size_label: 'L',
                        quantity: 6,
                    },
                ],
            }),
        ]);
        openDetail();

        const bar = document.querySelector('.p-size-bar') as HTMLElement;
        const headers = [...bar.querySelectorAll('thead th')].map((cell) =>
            cell.textContent?.trim(),
        );
        const cells = [...bar.querySelectorAll('tbody td')].map((cell) =>
            cell.textContent?.trim(),
        );

        expect(headers).toContain('M');
        expect(headers).toContain('L');
        expect(headers.at(-1)).toBe('รวม');
        expect(cells[headers.indexOf('M')]).toBe('4');
        expect(cells[headers.indexOf('L')]).toBe('6');
        expect(cells.at(-1)).toBe('10');
    });

    it('gives an unlisted size a column of its own so the row still adds up', () => {
        renderBoard([
            makeOrder(131, {
                specification: individualSpec,
                items: [
                    {
                        item_type: 'shirt',
                        size_group: 'adults',
                        size_label: 'M',
                        quantity: 2,
                    },
                    {
                        // Somebody on the list has no size yet, which reaches
                        // order_items as '-'. Its count has to sit somewhere,
                        // or the columns stop matching the total.
                        item_type: 'shirt',
                        size_group: 'adults',
                        size_label: '-',
                        quantity: 3,
                    },
                ],
            }),
        ]);
        openDetail();

        const bar = document.querySelector('.p-size-bar') as HTMLElement;
        const headers = [...bar.querySelectorAll('thead th')].map((cell) =>
            cell.textContent?.trim(),
        );
        const cells = [...bar.querySelectorAll('tbody td')].map(
            (cell) => cell.textContent?.trim() ?? '',
        );

        expect(headers).toContain('-');

        const columnSum = cells
            .slice(0, -1)
            .reduce((total, value) => total + Number(value || 0), 0);

        expect(columnSum).toBe(5);
        expect(cells.at(-1)).toBe('5');
    });
});
