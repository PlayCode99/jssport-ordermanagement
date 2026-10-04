import type * as InertiaModuleImport from '@inertiajs/react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
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
    shirtTypes: [
        { id: 21, name: 'เสื้อโปโล' },
        { id: 22, name: 'เสื้อคอกลม' },
    ],
    pantsTypes: [{ id: 31, name: 'กางเกงขาสั้น' }],
    kidsSizes: ['JS', 'JM'],
    adultSizes: ['M', 'L'],
    defaultBranchId: 1,
};

/**
 * The bill is typed in a hurry at the counter, so the form must catch what it
 * cannot save correctly, point at it, and never get in the way of typing.
 */
const renderForm = () =>
    render(<OrderCreatePage {...(props as unknown as PageProps)} />);

const save = () => {
    const button = screen
        .getAllByRole('button')
        .find((node) => /บันทึกใบสั่งผลิต/.test(node.textContent ?? ''));
    fireEvent.click(button!);
};

const missingList = (): string[] =>
    within(screen.getByRole('dialog'))
        .getAllByRole('listitem')
        .map(
            (item) => item.textContent?.replace('ไปที่ช่อง ›', '').trim() ?? '',
        );

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('a garment-table row that cannot be billed as typed', () => {
    it('is stopped when it has a quantity and a price but no size', () => {
        renderForm();
        type('จำนวนเสื้อ แถวที่ 1', '20');
        type('ราคาต่อตัวเสื้อ แถวที่ 1', '100');
        save();

        expect(missingList()).toContain('• ไซส์ในตารางเลือกไซซ์');
        expect(screen.getByLabelText('ไซซ์เสื้อ แถวที่ 1').className).toContain(
            'border-red-500',
        );
    });

    it('is stopped when it has a quantity and no price, instead of dropping off the bill', () => {
        renderForm();
        type('จำนวนเสื้อ แถวที่ 1', '20');
        save();

        expect(missingList()).toContain('• ราคาของรายการที่กรอกจำนวนไว้');
        expect(
            screen.getByLabelText('ราคาต่อตัวเสื้อ แถวที่ 1').className,
        ).toContain('border-red-500');
    });

    it('lets rows that only carry the linked price stay blank', () => {
        renderForm();
        // The price link copies this down every row of the table; rows
        // nobody gave a quantity are still unused slots.
        type('ราคาต่อตัวเสื้อ แถวที่ 1', '100');
        save();

        expect(missingList()).not.toContain('• ไซส์ในตารางเลือกไซซ์');
        expect(missingList()).not.toContain('• ราคาของรายการที่กรอกจำนวนไว้');
    });
});

describe('Enter while typing a table', () => {
    it('moves to the next box rather than saving the bill', () => {
        renderForm();
        const quantity = screen.getByLabelText('จำนวนเสื้อ แถวที่ 1');
        quantity.focus();

        fireEvent.keyDown(quantity, { key: 'Enter' });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(
            screen.getByLabelText('ราคาต่อตัวเสื้อ แถวที่ 1'),
        );
    });

    it('is left alone when something else already used it', () => {
        renderForm();
        const quantity = screen.getByLabelText('จำนวนเสื้อ แถวที่ 1');
        quantity.focus();
        quantity.addEventListener('keydown', (event) => event.preventDefault());

        fireEvent.keyDown(quantity, { key: 'Enter' });

        expect(document.activeElement).toBe(quantity);
    });

    it('asks for numbers on a phone keyboard', () => {
        renderForm();

        expect(screen.getByLabelText('จำนวนเสื้อ แถวที่ 1')).toHaveAttribute(
            'inputmode',
            'numeric',
        );
        expect(
            screen.getByLabelText('ราคาต่อตัวเสื้อ แถวที่ 1'),
        ).toHaveAttribute('inputmode', 'decimal');
    });
});

describe('the missing-fields dialog', () => {
    it('lets every message take the counter to its box', () => {
        renderForm();
        save();

        const items = within(screen.getByRole('dialog')).getAllByRole(
            'button',
            { name: /ไปที่ช่อง ›/ },
        );

        expect(items.length).toBe(missingList().length);
    });

    it('lands on the box a message is about', async () => {
        renderForm();
        save();

        const customer = within(screen.getByRole('dialog')).getByRole(
            'button',
            { name: /ชื่อลูกค้า/ },
        );

        await act(async () => {
            fireEvent.click(customer);
        });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        // The dialog hands focus back on a timer; the jump takes it then.
        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByPlaceholderText('กรอกชื่อลูกค้า'),
            ),
        );
    });

    it('lands on the first missing box from the footer button', async () => {
        renderForm();
        save();

        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'ไปที่ช่องแรกที่ขาด' }),
            );
        });

        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByLabelText('ชื่อหน่วยงาน, ชื่องาน'),
            ),
        );
    });

    it('still closes without moving anything', async () => {
        renderForm();
        save();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
        });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});

/**
 * Forms 2 and 3 keep what they are — a list of people, a grid of colour
 * houses — and get the same care: a line that would be saved wrong is stopped,
 * the box is marked, and the dialog takes the counter to it.
 */
const openForm = (name: 'รายตัว (Form 2)' | 'กีฬาสี (Form 3)') => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name }));
};

const isMarked = (element: HTMLElement) =>
    element.className.includes('border-red-500');

const choose = (trigger: HTMLElement, option: string) => {
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: option }));
};

describe('Form 3, the colour-house grid', () => {
    const box = (label: string, row = 1, house = 1) =>
        screen.getByLabelText(`${label}แถวที่ ${row} ของคณะที่ ${house}`);

    it('marks the house with no name and takes the counter to it', async () => {
        openForm('กีฬาสี (Form 3)');
        save();

        expect(missingList()).toContain('• ชื่อคณะสี');
        expect(isMarked(screen.getByLabelText('ชื่อคณะสีที่ 1'))).toBe(true);

        await act(async () => {
            fireEvent.click(
                within(screen.getByRole('dialog')).getByRole('button', {
                    name: /ชื่อคณะสี/,
                }),
            );
        });

        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByLabelText('ชื่อคณะสีที่ 1'),
            ),
        );
    });

    it('marks the size of a counted row that names none', () => {
        openForm('กีฬาสี (Form 3)');
        fireEvent.change(box('จำนวนเสื้อ'), { target: { value: '5' } });
        save();

        expect(missingList()).toContain('• ไซซ์ในตารางคณะสี');
        expect(isMarked(box('ไซซ์'))).toBe(true);
    });

    it('marks the price of a counted row that has none', () => {
        openForm('กีฬาสี (Form 3)');
        fireEvent.change(box('จำนวนเสื้อ'), { target: { value: '5' } });
        save();

        expect(missingList()).toContain('• ราคาของรายการที่กรอกจำนวนไว้');
        expect(isMarked(box('ราคาเสื้อ'))).toBe(true);
    });

    it('marks the first row’s price when the column is linked, since the others cannot be typed in', () => {
        openForm('กีฬาสี (Form 3)');
        fireEvent.change(box('จำนวนเสื้อ', 2), { target: { value: '5' } });
        save();

        expect(box('ราคาเสื้อ', 2)).toHaveAttribute('readonly');
        expect(isMarked(box('ราคาเสื้อ', 1))).toBe(true);
        expect(isMarked(box('ราคาเสื้อ', 2))).toBe(false);
    });

    it('accepts a row once it has a size and a price', () => {
        openForm('กีฬาสี (Form 3)');
        fireEvent.change(box('จำนวนเสื้อ'), { target: { value: '5' } });
        fireEvent.change(box('ราคาเสื้อ'), { target: { value: '180' } });
        choose(box('ไซซ์'), 'M');
        save();

        expect(missingList()).not.toContain('• ไซซ์ในตารางคณะสี');
        expect(missingList()).not.toContain('• ราคาของรายการที่กรอกจำนวนไว้');
    });

    it('moves on with Enter instead of saving', () => {
        openForm('กีฬาสี (Form 3)');
        const quantity = box('จำนวนเสื้อ');
        quantity.focus();

        fireEvent.keyDown(quantity, { key: 'Enter' });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(box('ราคาเสื้อ'));
        expect(quantity).toHaveAttribute('inputmode', 'numeric');
        expect(box('ราคาเสื้อ')).toHaveAttribute('inputmode', 'decimal');
    });
});

describe('Form 2, the list of people', () => {
    const typeName = (person: number, name: string) =>
        fireEvent.change(screen.getByLabelText(`สกรีนชื่อคนที่ ${person}`), {
            target: { value: name },
        });

    it('takes the counter to the first person when nobody is typed in', async () => {
        openForm('รายตัว (Form 2)');
        save();

        expect(missingList()).toContain('• ข้อมูลรายตัวในฟอร์มรายตัว');

        await act(async () => {
            fireEvent.click(
                within(screen.getByRole('dialog')).getByRole('button', {
                    name: /ข้อมูลรายตัว/,
                }),
            );
        });

        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByLabelText('สกรีนชื่อคนที่ 1'),
            ),
        );
    });

    it('marks what the first person is still short of', () => {
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');
        save();

        expect(isMarked(screen.getByLabelText('สกรีนชื่อคนที่ 1'))).toBe(false);
        expect(isMarked(screen.getByLabelText('ไซซ์คนที่ 1'))).toBe(true);
        expect(isMarked(screen.getByLabelText('เบอร์คนที่ 1'))).toBe(true);
    });

    it('stops a person with no size, who would be cut as "-"', () => {
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');
        save();

        expect(missingList()).toContain('• ไซซ์เสื้อในรายชื่อรายตัว');
    });

    it('leaves people nobody has typed in alone', () => {
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');
        save();

        expect(isMarked(screen.getByLabelText('ไซซ์คนที่ 2'))).toBe(false);
    });

    it('stops trousers counted and left unpriced, which would drop off the bill', () => {
        openForm('รายตัว (Form 2)');
        fireEvent.click(screen.getByLabelText('สั่งกางเกงด้วย'));
        typeName(1, 'สมชาย');
        typeName(2, 'สมหญิง');
        fireEvent.change(screen.getByLabelText('จำนวนกางเกงคนที่ 2'), {
            target: { value: '1' },
        });
        save();

        expect(missingList()).toContain(
            '• ราคากางเกงของคนที่กรอกจำนวนกางเกงไว้',
        );
        // Linked: the price is typed on the first person.
        expect(isMarked(screen.getByLabelText('ราคากางเกงคนที่ 1'))).toBe(true);
        expect(isMarked(screen.getByLabelText('ราคากางเกงคนที่ 2'))).toBe(
            false,
        );
    });

    it('unfolds the trousers sheet to reach one of its spec boxes', async () => {
        openForm('รายตัว (Form 2)');
        fireEvent.click(screen.getByLabelText('สั่งกางเกงด้วย'));
        typeName(1, 'สมชาย');
        fireEvent.change(screen.getByLabelText('จำนวนกางเกงคนที่ 1'), {
            target: { value: '1' },
        });
        save();

        await act(async () => {
            fireEvent.click(
                within(screen.getByRole('dialog')).getByRole('button', {
                    name: /สเปกกางเกงผู้ใหญ่ · ขาสั้น/,
                }),
            );
        });

        await waitFor(() =>
            expect(
                [...(document.activeElement?.classList ?? [])].some((name) =>
                    name.startsWith('fx-pants_adults_short.'),
                ),
            ).toBe(true),
        );
    });

    it('still bills a person at the price typed, even none', () => {
        // Unchanged on purpose: Form 2 has always billed a person typed in at
        // whatever price the row carries.
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');
        save();

        expect(missingList()).not.toContain('• ราคาของรายการที่กรอกจำนวนไว้');
    });
});

describe('a bill with rows counted but nothing billable yet', () => {
    it('points at the row that is short, not at an empty first row (Form 3)', async () => {
        openForm('กีฬาสี (Form 3)');
        const quantity = screen.getByLabelText(
            'จำนวนเสื้อแถวที่ 2 ของคณะที่ 1',
        );
        fireEvent.change(quantity, { target: { value: '8' } });
        save();

        expect(missingList()).toContain(
            '• จำนวนและราคาสินค้าอย่างน้อย 1 รายการ',
        );
        expect(
            isMarked(screen.getByLabelText('จำนวนเสื้อแถวที่ 1 ของคณะที่ 1')),
        ).toBe(false);

        await act(async () => {
            fireEvent.click(
                within(screen.getByRole('dialog')).getByRole('button', {
                    name: /จำนวนและราคาสินค้า/,
                }),
            );
        });

        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByLabelText('ราคาเสื้อแถวที่ 1 ของคณะที่ 1'),
            ),
        );
    });

    it('points at the first row when nothing has been counted at all (Form 1)', () => {
        renderForm();
        save();

        expect(isMarked(screen.getByLabelText('จำนวนเสื้อ แถวที่ 1'))).toBe(
            true,
        );
    });

    it('does not mark the first row when a later row was counted (Form 1)', () => {
        renderForm();
        type('จำนวนเสื้อ แถวที่ 2', '10');
        save();

        expect(isMarked(screen.getByLabelText('จำนวนเสื้อ แถวที่ 1'))).toBe(
            false,
        );
    });
});

describe('the spec on Form 3 reads like Forms 1 and 4', () => {
    it('keeps it in step 2, after the houses, folded under a heading that says what is missing', () => {
        openForm('กีฬาสี (Form 3)');

        const stepTwo = screen
            .getByRole('heading', { name: 'รายการสินค้า, สเปก และรูปงาน' })
            .closest('section') as HTMLElement;
        const toggle = within(stepTwo).getByRole('button', {
            name: /^สเปกเสื้อ/,
        });

        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(toggle.textContent).toMatch(/ยังขาด \d+ ช่อง/);
        expect(
            screen.queryByRole('heading', {
                name: 'รายละเอียดสเปกงานตัดเย็บ',
            }),
        ).not.toBeInTheDocument();
    });

    it('opens on click and shows the same grouped boxes as a table spec', () => {
        openForm('กีฬาสี (Form 3)');
        fireEvent.click(screen.getByRole('button', { name: /^สเปกเสื้อ/ }));

        const spec = document.querySelector(
            '[data-slot="garment-spec"][data-garment="shirt"]',
        ) as HTMLElement;

        expect(within(spec).getByText('ผ้าและแพทเทิร์น')).toBeInTheDocument();
        expect(within(spec).getByLabelText('แพทเทิร์น')).toBeInTheDocument();
    });
});

/**
 * Form 2 keeps its list of people, and is sewn a sheet at a time like Form 1:
 * everyone in the same garment, size range and length is one sheet, with its
 * own spec. A long-sleeved shirt and a short one are two sheets — two sets of
 * instructions, two garment types, two rates — never one spec for both.
 */
describe('Form 2 takes a spec per sheet, like Form 1 takes one per table', () => {
    const typeName = (person: number, name: string) =>
        fireEvent.change(screen.getByLabelText(`สกรีนชื่อคนที่ ${person}`), {
            target: { value: name },
        });

    const sheet = (title: string) =>
        screen.getByRole('article', { name: title });

    const giveSecondPersonLongSleeves = () => {
        fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกลิงก์แขน' }));
        choose(screen.getByLabelText('แขนคนที่ 2'), 'แขนยาว');
    };

    it('asks for the shirt spec before anyone is typed in', () => {
        openForm('รายตัว (Form 2)');

        const shirts = sheet('เสื้อผู้ใหญ่ · แขนสั้น');

        expect(within(shirts).getByText(/ยังไม่มีรายชื่อ/)).toBeInTheDocument();
        expect(
            within(shirts).getByRole('button', { name: /^สเปกเสื้อ/ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('article', { name: /^กางเกง/ }),
        ).not.toBeInTheDocument();
    });

    it('keeps a spec typed before the list once people are on it', () => {
        openForm('รายตัว (Form 2)');
        const shirts = sheet('เสื้อผู้ใหญ่ · แขนสั้น');
        fireEvent.click(
            within(shirts).getByRole('button', { name: /^สเปกเสื้อ/ }),
        );
        fireEvent.change(within(shirts).getByLabelText('แพทเทิร์น'), {
            target: { value: 'โปโล' },
        });

        typeName(1, 'สมชาย');

        expect(
            within(sheet('เสื้อผู้ใหญ่ · แขนสั้น')).getByText(/1\s*คน/),
        ).toBeInTheDocument();
        expect(
            within(
                sheet('เสื้อผู้ใหญ่ · แขนสั้น'),
            ).getByLabelText<HTMLInputElement>('แพทเทิร์น').value,
        ).toBe('โปโล');
    });

    it('does not ask for the spec of a sheet nobody is on yet', () => {
        openForm('รายตัว (Form 2)');
        save();

        expect(
            missingList().some((message) => message.includes('สเปกเสื้อ')),
        ).toBe(false);
    });

    it('names the sheet a person is on and counts them', () => {
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');
        typeName(2, 'สมหญิง');

        const shortSleeves = sheet('เสื้อผู้ใหญ่ · แขนสั้น');

        expect(within(shortSleeves).getByText(/2\s*คน/)).toBeInTheDocument();
        expect(
            within(shortSleeves).getByRole('button', { name: /^สเปกเสื้อ/ }),
        ).toHaveAttribute('aria-expanded', 'false');
    });

    it('splits long and short sleeves onto two sheets with a spec each', () => {
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');
        typeName(2, 'สมหญิง');
        giveSecondPersonLongSleeves();

        expect(
            within(sheet('เสื้อผู้ใหญ่ · แขนสั้น')).getByText(/1\s*คน/),
        ).toBeInTheDocument();
        expect(
            within(sheet('เสื้อผู้ใหญ่ · แขนยาว')).getByText(/1\s*คน/),
        ).toBeInTheDocument();
    });

    it('starts the new sheet from the other with only the garment type to pick', () => {
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');
        typeName(2, 'สมหญิง');

        const shortToggle = () =>
            within(sheet('เสื้อผู้ใหญ่ · แขนสั้น')).getByRole('button', {
                name: /^สเปกเสื้อ/,
            });
        const shortBlanks = Number(
            shortToggle().textContent?.match(/ยังขาด (\d+)/)?.[1] ?? 0,
        );

        giveSecondPersonLongSleeves();

        // Typed once on the short sleeves, so the long sleeves inherit it and
        // are short only of their own garment type.
        fireEvent.click(shortToggle());
        fireEvent.change(
            within(sheet('เสื้อผู้ใหญ่ · แขนสั้น')).getByLabelText('แพทเทิร์น'),
            { target: { value: 'โปโล' } },
        );

        const longToggle = within(sheet('เสื้อผู้ใหญ่ · แขนยาว')).getByRole(
            'button',
            { name: /^สเปกเสื้อ/ },
        );

        expect(longToggle.textContent).toMatch(/ยังขาด \d+ ช่อง/);
        expect(shortBlanks).toBeGreaterThan(0);
    });

    it('keeps what is typed on one sheet off the other', () => {
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');
        typeName(2, 'สมหญิง');
        giveSecondPersonLongSleeves();

        const longSheet = sheet('เสื้อผู้ใหญ่ · แขนยาว');
        fireEvent.click(
            within(longSheet).getByRole('button', { name: /^สเปกเสื้อ/ }),
        );
        fireEvent.change(within(longSheet).getByLabelText('ปลายแขน'), {
            target: { value: 'จั๊มปลายแขน' },
        });

        const shortSheet = sheet('เสื้อผู้ใหญ่ · แขนสั้น');
        fireEvent.click(
            within(shortSheet).getByRole('button', { name: /^สเปกเสื้อ/ }),
        );

        expect(
            within(longSheet).getByLabelText<HTMLInputElement>('ปลายแขน').value,
        ).toBe('จั๊มปลายแขน');
        expect(
            within(shortSheet).getByLabelText<HTMLInputElement>('ปลายแขน')
                .value,
        ).not.toBe('จั๊มปลายแขน');
    });

    it('offers to copy a spec from the other sheet of the same garment', () => {
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');
        typeName(2, 'สมหญิง');
        giveSecondPersonLongSleeves();

        expect(
            screen.getByRole('combobox', {
                name: 'คัดลอกสเปกมาที่ เสื้อผู้ใหญ่ · แขนยาว',
            }),
        ).toBeInTheDocument();
    });

    it('asks for every sheet’s spec by name, and unfolds the short ones', async () => {
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');
        typeName(2, 'สมหญิง');
        giveSecondPersonLongSleeves();
        save();

        expect(
            missingList().some((message) =>
                message.startsWith(
                    '• สเปกเสื้อผู้ใหญ่ · แขนสั้น ยังไม่ได้กรอก',
                ),
            ),
        ).toBe(true);
        expect(
            missingList().some((message) =>
                message.startsWith('• สเปกเสื้อผู้ใหญ่ · แขนยาว ยังไม่ได้กรอก'),
            ),
        ).toBe(true);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
        });

        for (const title of [
            'เสื้อผู้ใหญ่ · แขนสั้น',
            'เสื้อผู้ใหญ่ · แขนยาว',
        ]) {
            expect(
                within(sheet(title)).getByRole('button', {
                    name: /^สเปกเสื้อ/,
                }),
            ).toHaveAttribute('aria-expanded', 'true');
        }
    });

    it('asks for the trousers spec as soon as the bill sells trousers', () => {
        openForm('รายตัว (Form 2)');
        typeName(1, 'สมชาย');

        expect(
            screen.queryByRole('article', { name: /^กางเกง/ }),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('สั่งกางเกงด้วย'));

        // Before anyone's trousers are counted: spec now, people later.
        expect(
            within(sheet('กางเกงผู้ใหญ่ · ขาสั้น')).getByText(
                /ยังไม่มีรายชื่อ/,
            ),
        ).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('จำนวนกางเกงคนที่ 1'), {
            target: { value: '1' },
        });

        expect(
            within(sheet('กางเกงผู้ใหญ่ · ขาสั้น')).getByText(/1\s*คน/),
        ).toBeInTheDocument();
    });
});

/**
 * Form 3 sells shirts only. A colour-house bill already saved with trousers
 * keeps them when it is reopened, so nothing it was sold with disappears.
 */
describe('Form 3 sells shirts only', () => {
    const house = (pants: { qty: number; price: number }) => ({
        id: 9,
        order_code: 'ORD-2026-00009',
        customer_id: 1,
        branch_id: 1,
        customer_name: 'โรงเรียนทดสอบ',
        customer_phone: '0812345678',
        contact_detail: '',
        job_name: 'กีฬาสี 2569',
        job_type: 'งานปัก',
        billing_date: '2026-09-01',
        billing_time: '10:00',
        due_date: '2026-09-20',
        delivery_method: 'pickup',
        shipping_address: '',
        discount_percent: 0,
        deposit_amount: 0,
        payment_method: 'cash',
        artwork_url: null,
        shirt_artwork_urls: [],
        pants_artwork_urls: [],
        reference_designs: [],
        items: [],
        specification: {
            decoded: {
                schema: 'spec-v2',
                mode: 'sports_day',
                shirt_specs: { shirt_type_id: '21' },
                pants_specs: { pants_type_id: '31' },
                sports_day_groups: [
                    {
                        team_name: 'คณะสีแดง',
                        fabric_color_id: '3',
                        rows: [
                            {
                                size_group: 'adults',
                                size_label: 'M',
                                shirt_qty: 10,
                                shirt_price: 200,
                                pants_qty: pants.qty,
                                pants_price: pants.price,
                            },
                        ],
                    },
                ],
            },
        },
    });

    const reopen = (pants: { qty: number; price: number }) =>
        render(
            <OrderCreatePage
                {...(props as unknown as PageProps)}
                order={house(pants) as never}
            />,
        );

    const columnCount = (table: HTMLTableElement) =>
        [...table.querySelectorAll('thead th')].length;

    const footSpan = (table: HTMLTableElement) =>
        [...table.querySelectorAll('tfoot td')].reduce(
            (span, cell) => span + Number(cell.getAttribute('colspan') ?? 1),
            0,
        );

    it('asks a new colour-house bill for shirts only', () => {
        openForm('กีฬาสี (Form 3)');

        expect(
            screen.getByLabelText('จำนวนเสื้อแถวที่ 1 ของคณะที่ 1'),
        ).toBeInTheDocument();
        expect(
            screen.queryByLabelText('จำนวนกางเกงแถวที่ 1 ของคณะที่ 1'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByLabelText('ราคากางเกงแถวที่ 1 ของคณะที่ 1'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /^สเปกกางเกง/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /^สเปกเสื้อ/ }),
        ).toBeInTheDocument();
    });

    it('keeps the total row lined up with the narrower table', () => {
        openForm('กีฬาสี (Form 3)');
        const table = screen
            .getByLabelText('จำนวนเสื้อแถวที่ 1 ของคณะที่ 1')
            .closest('table') as HTMLTableElement;

        expect(columnCount(table)).toBe(6);
        expect(footSpan(table)).toBe(6);
    });

    it('still bills the shirts and saves nothing for trousers', () => {
        openForm('กีฬาสี (Form 3)');
        fireEvent.change(
            screen.getByLabelText('จำนวนเสื้อแถวที่ 1 ของคณะที่ 1'),
            { target: { value: '5' } },
        );
        save();

        // Nothing about trousers is asked for on a shirts-only bill.
        expect(
            missingList().some((message) => message.includes('กางเกง')),
        ).toBe(false);
    });

    it('keeps the trouser columns and spec of a bill saved with trousers', () => {
        reopen({ qty: 4, price: 150 });

        expect(
            screen.getByLabelText<HTMLInputElement>(
                'จำนวนกางเกงแถวที่ 1 ของคณะที่ 1',
            ).value,
        ).toBe('4');
        expect(
            screen.getByLabelText<HTMLInputElement>(
                'ราคากางเกงแถวที่ 1 ของคณะที่ 1',
            ).value,
        ).toBe('150');
        expect(
            screen.getByRole('button', { name: /^สเปกกางเกง/ }),
        ).toBeInTheDocument();

        const table = screen
            .getByLabelText('จำนวนกางเกงแถวที่ 1 ของคณะที่ 1')
            .closest('table') as HTMLTableElement;

        expect(columnCount(table)).toBe(8);
        expect(footSpan(table)).toBe(8);
    });

    it('treats a saved bill with no trousers as shirts only', () => {
        reopen({ qty: 0, price: 0 });

        expect(
            screen.queryByLabelText('จำนวนกางเกงแถวที่ 1 ของคณะที่ 1'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /^สเปกกางเกง/ }),
        ).not.toBeInTheDocument();
    });
});

describe('Form 2 when the length of a whole list changes', () => {
    it('keeps what was typed, leaving the garment type of the new length to pick', () => {
        openForm('รายตัว (Form 2)');
        fireEvent.change(screen.getByLabelText('สกรีนชื่อคนที่ 1'), {
            target: { value: 'สมชาย' },
        });

        const shortSheet = screen.getByRole('article', {
            name: 'เสื้อผู้ใหญ่ · แขนสั้น',
        });
        fireEvent.click(
            within(shortSheet).getByRole('button', { name: /^สเปกเสื้อ/ }),
        );
        fireEvent.change(within(shortSheet).getByLabelText('แพทเทิร์น'), {
            target: { value: 'โปโล' },
        });

        // Linked, so the first person's sleeve is everyone's.
        choose(screen.getByLabelText('แขนคนที่ 1'), 'แขนยาว');

        const longSheet = screen.getByRole('article', {
            name: 'เสื้อผู้ใหญ่ · แขนยาว',
        });
        fireEvent.click(
            within(longSheet).getByRole('button', { name: /^สเปกเสื้อ/ }),
        );

        expect(
            within(longSheet).getByLabelText<HTMLInputElement>('แพทเทิร์น')
                .value,
        ).toBe('โปโล');
        expect(
            screen.queryByRole('article', { name: 'เสื้อผู้ใหญ่ · แขนสั้น' }),
        ).not.toBeInTheDocument();
    });
});

describe('Form 2 trousers follow the shirt until changed', () => {
    const typeIn = (label: string, value: string) =>
        fireEvent.change(screen.getByLabelText(label), { target: { value } });

    it('shows the shirt number as the trousers number, and takes a different one', () => {
        openForm('รายตัว (Form 2)');
        fireEvent.click(screen.getByLabelText('สั่งกางเกงด้วย'));
        typeIn('เบอร์คนที่ 1', '10');

        const pantsNumber =
            screen.getByLabelText<HTMLInputElement>('เบอร์กางเกงคนที่ 1');

        expect(pantsNumber.value).toBe('');
        expect(pantsNumber.placeholder).toBe('10');

        typeIn('เบอร์คนที่ 1', '11');
        expect(pantsNumber.placeholder).toBe('11');

        typeIn('เบอร์กางเกงคนที่ 1', '7');
        expect(pantsNumber.value).toBe('7');
    });

    it('shows the shirt size as the trousers size, and takes a different one', () => {
        openForm('รายตัว (Form 2)');
        fireEvent.click(screen.getByLabelText('สั่งกางเกงด้วย'));
        choose(screen.getByLabelText('ไซซ์คนที่ 1'), 'M');

        const pantsSize = screen.getByLabelText('ไซซ์กางเกงคนที่ 1');

        expect(pantsSize.textContent).toContain('M · ตามเสื้อ');

        choose(pantsSize, 'L');
        expect(screen.getByLabelText('ไซซ์กางเกงคนที่ 1').textContent).toBe(
            'L',
        );

        choose(screen.getByLabelText('ไซซ์กางเกงคนที่ 1'), 'ตามไซซ์เสื้อ');
        expect(
            screen.getByLabelText('ไซซ์กางเกงคนที่ 1').textContent,
        ).toContain('M · ตามเสื้อ');
    });
});
