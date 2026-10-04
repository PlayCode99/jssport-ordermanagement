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
 * The two cards at the top of the form — general info on the left, the sewing
 * spec on the right — used to end 459px apart at 1440px: eight fields against
 * twenty-two in two columns. jsdom lays nothing out, so these tests hold the
 * layout contract the CSS classes carry rather than measured pixels:
 *
 *  - on a wide screen the spec runs three fields to a row, so it is shorter and
 *    quicker to fill, with the field order untouched;
 *  - the general-info card grows to the spec card's height, with the money
 *    summary holding its bottom edge, so the row finishes on one line instead
 *    of the left card stopping half way down the right one.
 *
 * Below the xl breakpoint the form is what it always was.
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

const renderForm = () =>
    render(<OrderCreatePage {...(props as unknown as PageProps)} />);

const cardOf = (heading: RegExp): HTMLElement =>
    screen
        .getByRole('heading', { name: heading })
        .closest('section') as HTMLElement;

/**
 * The spec now sits under the table it belongs to, so it is found by what it
 * is rather than by a card heading that Forms 1 and 4 no longer carry.
 */
const specGrid = (garment: 'shirt' | 'pants' = 'shirt'): HTMLElement =>
    document.querySelector(
        `[data-slot="garment-spec"][data-garment="${garment}"]`,
    ) as HTMLElement;

const specToggle = (garment: 'shirt' | 'pants' = 'shirt') =>
    screen
        .getAllByRole('button')
        .find((button) =>
            button.textContent?.startsWith(
                garment === 'pants' ? 'สเปกกางเกง' : 'สเปกเสื้อ',
            ),
        ) as HTMLElement;

/** A spec starts folded, so anything examining its boxes opens it first. */
const openSpec = (garment: 'shirt' | 'pants' = 'shirt') =>
    fireEvent.click(specToggle(garment));

describe('the top of the order form', () => {
    it('lays the shirt spec out three to a row on a wide screen', () => {
        renderForm();

        openSpec();

        const grid = specGrid();

        expect(grid.className).toContain('md:grid-cols-2');
        expect(grid.className).toContain('xl:grid-cols-3');

        // Whatever spans the two narrow columns spans all three wide ones, or
        // it would leave a hole at the end of its row.
        for (const wide of grid.querySelectorAll('.md\\:col-span-2')) {
            expect(wide.className).toContain('xl:col-span-3');
        }
    });

    it('does the same for the pants spec', () => {
        renderForm();

        // The trouser spec sits under the trouser table, not behind a tab.
        openSpec('pants');

        const grid = specGrid('pants');

        expect(grid.className).toContain('xl:grid-cols-3');

        for (const wide of grid.querySelectorAll('.md\\:col-span-2')) {
            expect(wide.className).toContain('xl:col-span-3');
        }
    });

    /**
     * The bill reads top to bottom now: who it is for, what they are buying,
     * what it comes to. The cards used to share a five-column row, with the
     * spec card filling the right half — and once Forms 1 and 4 stopped having
     * one, that half was simply empty.
     */
    it('stacks the steps full width, in the order they are filled in', () => {
        renderForm();

        const steps = [...document.querySelectorAll('section')]
            .map(
                (section) =>
                    section.querySelector('h2')?.textContent?.trim() ?? '',
            )
            .filter((title) =>
                /ข้อมูลบิล|รายการสินค้า|สรุปการเงิน/.test(title),
            );

        expect(steps).toEqual([
            'ข้อมูลบิล, ลูกค้า และการจัดส่ง',
            'รายการสินค้า, สเปก และรูปงาน',
            'สรุปการเงิน',
        ]);

        // Nothing is boxed into a column of its own any more.
        const card = cardOf(/ข้อมูลบิล/);
        expect(card.className).not.toContain('col-span');
        expect((card.parentElement as HTMLElement).className).not.toContain(
            'grid-cols',
        );
    });

    it('numbers each step so the counter knows the order to work in', () => {
        renderForm();

        const numbers = [...document.querySelectorAll('section h2')]
            .map((heading) =>
                heading.parentElement?.parentElement
                    ?.querySelector('span')
                    ?.textContent?.trim(),
            )
            .filter(Boolean);

        expect(numbers.slice(0, 3)).toEqual(['1', '2', '3']);
    });

    it('never gives the general-info column a scrollbar of its own', () => {
        renderForm();

        const column = cardOf(/ข้อมูลบิล/).parentElement as HTMLElement;

        expect(column.className).not.toMatch(/overflow-y|max-h-|sticky/);
    });
});

/**
 * The general-info card asks who the bill is for before when and how it is
 * delivered: job, then customer and contact, then dates and delivery.
 */
describe('the order of the general-info fields', () => {
    it('puts the customer and contact fields straight after the job name', () => {
        renderForm();

        const card = cardOf(/ข้อมูลบิล/);
        const labels = [...card.querySelectorAll('span.font-semibold')]
            .map((node) => node.textContent?.trim() ?? '')
            .filter((text) => text !== '' && !text.includes('฿'));

        expect(labels.slice(0, 9)).toEqual([
            'ประเภทงาน',
            'ชื่อหน่วยงาน, ชื่องาน',
            'ลูกค้า',
            'สาขาที่เปิดบิล',
            'เบอร์ติดต่อ',
            'ข้อมูลการติดต่อ',
            'วันที่เปิดบิล',
            'วันที่รับสินค้า',
            'ช่องทางรับสินค้า',
        ]);
    });
});

/**
 * A bill with four tables carries four specs, and a spec is nineteen boxes. If
 * they all stood open the counter would scroll past screens of boxes that are
 * already answered to reach the one that is not — so a spec folds itself away
 * once nothing is missing from it, and says so.
 */
describe('folding a spec away once it is filled in', () => {
    it('starts folded, and says how much is missing without being opened', () => {
        renderForm();

        expect(specToggle('shirt')).toHaveAttribute('aria-expanded', 'false');
        expect(specToggle('shirt').textContent).toContain('ยังขาด');
        expect(specGrid('shirt')).toBeNull();
    });

    it('opens the one the counter asks for, and leaves the rest folded', () => {
        renderForm();

        openSpec('shirt');

        expect(specToggle('shirt')).toHaveAttribute('aria-expanded', 'true');
        expect(specGrid('shirt')).not.toBeNull();
        expect(specGrid('pants')).toBeNull();
    });

    it('folds again on a second click', () => {
        renderForm();

        openSpec('shirt');
        openSpec('shirt');

        expect(specGrid('shirt')).toBeNull();
    });
});

/**
 * The placket is filled in inside-out, the way the spec tables print it:
 * แบบสาบ, then สีสาบ (ใน), then สีสาบ (นอก).
 */
describe('the order of the placket fields', () => {
    it('asks for the inner placket colour before the outer one', () => {
        renderForm();

        openSpec();

        const labels = [
            ...specGrid().querySelectorAll('label > span.font-semibold'),
        ].map((node) => node.textContent?.trim() ?? '');
        const start = labels.indexOf('แบบสาบ');

        expect(start).toBeGreaterThan(-1);
        expect(labels.slice(start, start + 3)).toEqual([
            'แบบสาบ',
            'สีสาบ (ใน)',
            'สีสาบ (นอก)',
        ]);
    });
});

/**
 * Every box on the form reads at one size. The Input component bumps its text
 * to 14px from the md breakpoint up (its text-base md:text-sm default), which
 * outranks a plain text-xs from the caller — so inputs sat at 14px beside
 * selects at 12px, and "เลือกหรือพิมพ์สีแบบคอ" was visibly bigger than
 * "เลือกแบบคอ" right next to it. A caller that wants 12px has to say so for md
 * as well.
 */
describe('input text size on the form', () => {
    const boxes = (card: HTMLElement) => [
        ...card.querySelectorAll<HTMLElement>(
            'input:not([type="file"]), button[role="combobox"]',
        ),
    ];

    it.each([
        ['spec', null],
        ['general-info', /ข้อมูลบิล/],
    ])('keeps every %s box at the 12px the selects use', (_name, heading) => {
        renderForm();

        if (heading === null) {
            openSpec();
        }

        const card = heading === null ? specGrid() : cardOf(heading);
        const elements = boxes(card);

        expect(elements.length).toBeGreaterThan(5);

        for (const element of elements) {
            const classes = element.className.split(/\s+/);

            expect(classes).toContain('text-xs');

            // Inputs carry the responsive default; only they need the md
            // override. Select triggers replace their default outright.
            if (element.tagName === 'INPUT') {
                expect(classes).toContain('md:text-xs');
            }
        }
    });
});

/**
 * A bill can carry fifteen tables — three size ranges by three lengths of
 * shirt, plus trousers. Folding a finished one away leaves a single line that
 * still says what is on it, so the counter can see the whole bill at once
 * instead of scrolling past boxes that are already answered.
 */
describe('folding a whole table away', () => {
    const tableToggle = (key: string) =>
        (
            document.querySelector(
                `article[data-garment-table="${key}"]`,
            ) as HTMLElement
        ).querySelector('button[aria-expanded]') as HTMLElement;

    const tableBody = (key: string) =>
        (
            document.querySelector(
                `article[data-garment-table="${key}"]`,
            ) as HTMLElement
        ).querySelector('table[data-slot="garment-table"]');

    it('opens with every table unfolded, ready to type into', () => {
        renderForm();

        expect(tableToggle('shirt_kids_short')).toHaveAttribute(
            'aria-expanded',
            'true',
        );
        expect(tableBody('shirt_kids_short')).not.toBeNull();
    });

    it('leaves a one-line summary behind when folded', () => {
        renderForm();

        fireEvent.click(tableToggle('shirt_kids_short'));

        expect(tableBody('shirt_kids_short')).toBeNull();

        // What the counter would have opened it to check.
        const heading = tableToggle('shirt_kids_short').textContent ?? '';

        expect(heading).toContain('ตารางเสื้อไซซ์เด็ก · แขนสั้น');
        expect(heading).toContain('0 ตัว');
        expect(heading).toContain('สเปกขาด');
        expect(heading).toContain('ไม่มีรูป');
    });

    it('folds one table without touching the other', () => {
        renderForm();

        fireEvent.click(tableToggle('shirt_kids_short'));

        expect(tableBody('pants_kids_short')).not.toBeNull();
    });

    it('opens again on a second click', () => {
        renderForm();

        fireEvent.click(tableToggle('shirt_kids_short'));
        fireEvent.click(tableToggle('shirt_kids_short'));

        expect(tableBody('shirt_kids_short')).not.toBeNull();
    });
});
