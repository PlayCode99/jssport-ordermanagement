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

const specGrid = (): HTMLElement =>
    cardOf(/รายละเอียดสเปกงานตัดเย็บ/).querySelector(
        '.grid.gap-3',
    ) as HTMLElement;

describe('the top of the order form', () => {
    it('lays the shirt spec out three to a row on a wide screen', () => {
        renderForm();

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
        fireEvent.click(screen.getByRole('button', { name: /^แบบกางเกง/ }));

        const grid = specGrid();

        expect(grid.className).toContain('xl:grid-cols-3');

        for (const wide of grid.querySelectorAll('.md\\:col-span-2')) {
            expect(wide.className).toContain('xl:col-span-3');
        }
    });

    it('gives the general-info card the same height as the spec card', () => {
        renderForm();

        const card = cardOf(/ข้อมูลทั่วไป/);
        const column = card.parentElement as HTMLElement;
        const summary = screen
            .getByRole('heading', { name: /สรุปการเงินแบบเรียลไทม์/ })
            .closest('.bg-yellow-50')?.parentElement as HTMLElement;

        // The column is a flex column and the card takes all of it, so the two
        // cards in the row finish on the same line...
        expect(column.className).toContain('flex-col');
        expect(card.className).toContain('flex-1');
        expect(card.className).toContain('flex-col');
        // ...with the money summary holding the card's bottom edge.
        expect(summary.className).toContain('mt-auto');
    });

    it('never gives the general-info column a scrollbar of its own', () => {
        renderForm();

        const column = cardOf(/ข้อมูลทั่วไป/).parentElement as HTMLElement;

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

        const card = cardOf(/ข้อมูลทั่วไป/);
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
 * The placket is filled in inside-out, the way the spec tables print it:
 * แบบสาบ, then สีสาบ (ใน), then สีสาบ (นอก).
 */
describe('the order of the placket fields', () => {
    it('asks for the inner placket colour before the outer one', () => {
        renderForm();

        const labels = [
            ...cardOf(/รายละเอียดสเปกงานตัดเย็บ/).querySelectorAll(
                'label > span.font-semibold',
            ),
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
        ['spec', /รายละเอียดสเปกงานตัดเย็บ/],
        ['general-info', /ข้อมูลทั่วไป/],
    ])('keeps every %s box at the 12px the selects use', (_name, heading) => {
        renderForm();

        const card = cardOf(heading);
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
