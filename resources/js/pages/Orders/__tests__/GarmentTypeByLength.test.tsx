import type * as InertiaModuleImport from '@inertiajs/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

/**
 * A table is one garment cut in one length, and a garment type is made in one
 * length too. Offering every type on every table let a short-sleeve table be
 * costed from a long-sleeve rate card — the two answers to "how long is it"
 * could disagree, and the sheet was priced from the wrong one.
 */
const props = {
    branches: [{ id: 1, name: 'สาขาหนองบัวลำภู', code: '01', phone: null }],
    jobTypes: [{ id: 1, name: 'งานปัก' }],
    shirtCatalogs: catalogs,
    pantsCatalogs: catalogs,
    shirtTypes: [
        { id: 21, name: 'โปโลแขนสั้น', style: 'short' },
        { id: 22, name: 'คอกลมแขนสั้น', style: 'short' },
        { id: 23, name: 'โปโลแขนยาว', style: 'long' },
        { id: 24, name: 'กล้ามแขนกุด', style: 'sleeveless' },
    ],
    pantsTypes: [
        { id: 31, name: 'กางเกงขาสั้น', style: 'short' },
        { id: 32, name: 'กางเกงขายาว', style: 'long' },
    ],
    kidsSizes: ['JS', 'JM'],
    adultSizes: ['M', 'L'],
    defaultBranchId: 1,
};

const renderForm = () =>
    render(<OrderCreatePage {...(props as unknown as PageProps)} />);

const openSpec = (garment: 'shirt' | 'pants') =>
    fireEvent.click(
        screen
            .getAllByRole('button')
            .find((button) =>
                button.textContent?.startsWith(
                    garment === 'pants' ? 'สเปกกางเกง' : 'สเปกเสื้อ',
                ),
            ) as HTMLElement,
    );

const typeTrigger = (garment: 'shirt' | 'pants') => {
    const grid = document.querySelector(
        `[data-slot="garment-spec"][data-garment="${garment}"]`,
    ) as HTMLElement;

    return within(grid).getByLabelText(
        garment === 'pants' ? 'แบบกางเกง' : 'แบบเสื้อ',
    );
};

/** What the dropdown offers, read from the listbox it opens. */
const optionsOf = (garment: 'shirt' | 'pants'): string[] => {
    fireEvent.click(typeTrigger(garment));

    return [...document.querySelectorAll('[role="option"]')].map(
        (node) => node.textContent?.trim() ?? '',
    );
};

/** Switches a table to another length using its header dropdown. */
const setLength = (garment: 'shirt' | 'pants', label: string) => {
    const trigger = screen.getAllByLabelText(
        new RegExp(`^แบบ${garment === 'pants' ? 'ขา' : 'แขน'} `),
    )[0];

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: label }));
};

describe('the garment types a table offers', () => {
    it('offers a short-sleeve table only the shirts made short', () => {
        renderForm();
        openSpec('shirt');

        expect(optionsOf('shirt')).toEqual(['โปโลแขนสั้น', 'คอกลมแขนสั้น']);
    });

    it('offers the sleeveless shirts once the table is cut sleeveless', () => {
        renderForm();
        setLength('shirt', 'แขนกุด');
        openSpec('shirt');

        expect(optionsOf('shirt')).toEqual(['กล้ามแขนกุด']);
    });

    it('does the same for trousers', () => {
        renderForm();
        openSpec('pants');

        expect(optionsOf('pants')).toEqual(['กางเกงขาสั้น']);

        fireEvent.keyDown(document.activeElement ?? document.body, {
            key: 'Escape',
        });
        setLength('pants', 'ขายาว');

        expect(optionsOf('pants')).toEqual(['กางเกงขายาว']);
    });
});

/**
 * Shirts and trousers are added separately. A bill that sells the same shirt
 * in two size ranges should not be typed out twice, so a new table copies the
 * spec of one the bill already has — but not the garment type, which is a
 * different pattern with a rate card of its own for each size range.
 */
describe('adding another size tier', () => {
    const tableTitles = () =>
        [...document.querySelectorAll('article[data-garment-table]')].map(
            (article) => article.getAttribute('data-garment-table') ?? '',
        );

    const addTier = (garment: 'shirt' | 'pants', label: string) => {
        const group = document.querySelector(
            `[data-garment-group="${garment}"]`,
        ) as HTMLElement;

        fireEvent.click(
            within(group)
                .getAllByRole('button')
                .find(
                    (button) => button.textContent?.trim() === label,
                ) as HTMLElement,
        );
    };

    it('adds only the garment whose section was used', () => {
        renderForm();

        expect(tableTitles()).toEqual(['shirt_kids_short', 'pants_kids_short']);

        addTier('shirt', 'ผู้ใหญ่');

        expect(tableTitles()).toEqual([
            'shirt_kids_short',
            'shirt_adults_short',
            'pants_kids_short',
        ]);
    });

    it('carries the spec across but leaves the garment type to be chosen', () => {
        renderForm();
        openSpec('shirt');

        // Something typed into the first table's spec...
        fireEvent.change(screen.getByLabelText('ข้อความสกรีน'), {
            target: { value: 'โลโก้โรงเรียน' },
        });
        // ...and a type that is not the one a new table would default to.
        fireEvent.click(typeTrigger('shirt'));
        fireEvent.click(screen.getByRole('option', { name: 'คอกลมแขนสั้น' }));

        addTier('shirt', 'ผู้ใหญ่');

        const adultsSpec = document.querySelector(
            'article[data-garment-table="shirt_adults_short"]',
        ) as HTMLElement;

        fireEvent.click(
            within(adultsSpec)
                .getAllByRole('button')
                .find((button) =>
                    button.textContent?.startsWith('สเปกเสื้อ'),
                ) as HTMLElement,
        );

        expect(
            within(adultsSpec).getByLabelText<HTMLInputElement>('ข้อความสกรีน')
                .value,
        ).toBe('โลโก้โรงเรียน');
        // The type went back to the default for this length, not the one the
        // kids' table was switched to.
        expect(within(adultsSpec).getByLabelText('แบบเสื้อ').textContent).toBe(
            'โปโลแขนสั้น',
        );
    });
});
