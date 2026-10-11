import type * as InertiaModuleImport from '@inertiajs/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import GarmentPricesPage from '@/pages/settings/data/garments/prices';

type InertiaModule = typeof InertiaModuleImport;

/**
 * An operation used to carry a second rate per size group, for when the garment
 * was a long one, and this page had a box and a column for each. It was added
 * while one garment type covered both lengths.
 *
 * A garment type carries its own length now, and the order form will only offer
 * a long one for a long sheet — so a short type's long rate could never be
 * read, and a long type's ordinary rate could never be read either, because the
 * costing looked at the long column first. Two columns describing one thing,
 * and a zero typed into the live one silently replaced a real price beside it
 * and costed a whole sheet at nothing.
 *
 * One rate per size group is what is left, and the heading over the garment
 * still names whichever kind is being listed.
 */
const garmentTypes = [
    { id: 1, name: 'เสื้อโปโล', category: 'SHIRT', style: 'short' },
    { id: 2, name: 'เสื้อประตู', category: 'SHIRT', style: 'long' },
    { id: 3, name: 'กางเกงขาสั้น', category: 'PANTS', style: 'short' },
];

const rows = [
    {
        id: 11,
        garment_type_id: 1,
        garment_type_name: 'เสื้อโปโล',
        garment_type_code: 'S-1',
        category: 'SHIRT',
        name: 'เย็บคอ',
        child_price: '10.00',
        adult_price: '20.00',
        display_order: 1,
        is_active: true,
    },
    {
        id: 12,
        garment_type_id: 3,
        garment_type_name: 'กางเกงขาสั้น',
        garment_type_code: 'P-1',
        category: 'PANTS',
        name: 'เย็บขา',
        child_price: '8.00',
        adult_price: '15.00',
        display_order: 2,
        is_active: true,
    },
];

const pageProps = (over: Record<string, unknown> = {}) => ({
    garmentTypes,
    rows,
    selectedCategory: null,
    selectedGarmentTypeId: null,
    selectedGarmentTypeName: null,
    selectedGarmentTypeStyle: null,
    selectedGarmentTypeCategory: null,
    ...over,
});

let currentProps: Record<string, unknown> = pageProps();

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
            props: currentProps,
            url: '/settings/data/garments/prices',
        }),
    };
});

const renderPage = (over: Record<string, unknown> = {}) => {
    currentProps = pageProps(over);

    return render(<GarmentPricesPage />);
};

const headings = (): string[] =>
    screen
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '');

describe('the price list', () => {
    it('offers one rate per size group and no second one for a long garment', () => {
        renderPage();

        expect(headings()).toContain('เด็ก ราคา');
        expect(headings()).toContain('ผู้ใหญ่ ราคา');

        for (const gone of [
            'แขนยาว',
            'ขายาว',
            'แบบยาว',
            'แขนยาว/ขายาว',
            'เท่าราคาสั้น',
        ]) {
            expect(screen.queryByText(gone)).not.toBeInTheDocument();
        }
    });

    /**
     * The garment column still says which kind it is listing: a trouser row
     * under a heading about shirts was the same mistake, one column over.
     */
    it('names the garment it is listing', () => {
        renderPage();
        expect(headings()).toContain('ประเภทงาน');

        renderPage({ selectedCategory: 'SHIRT' });
        expect(headings()).toContain('ประเภทเสื้อ');

        renderPage({ selectedCategory: 'PANTS' });
        expect(headings()).toContain('ประเภทกางเกง');
    });
});

describe('the price form', () => {
    /** The words written above the form's own boxes, and nothing else. */
    const priceLabels = (): string[] =>
        [...screen.getByRole('dialog').querySelectorAll('label')]
            .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
            .filter((text) => text.startsWith('ราคา'));

    const openForm = () => {
        fireEvent.click(
            screen.getByRole('button', { name: /เพิ่มรายการราคา/ }),
        );
    };

    it('asks for a child rate and an adult rate, and nothing more', () => {
        renderPage({
            selectedGarmentTypeId: 2,
            selectedGarmentTypeName: 'เสื้อประตู',
            selectedGarmentTypeCategory: 'SHIRT',
            selectedGarmentTypeStyle: 'long',
        });
        openForm();

        expect(priceLabels()).toEqual(['ราคาเด็ก', 'ราคาผู้ใหญ่']);
    });

    /**
     * Even on a garment that is itself a long one: its rate is the rate for
     * the length it is cut at, so there is nothing else to ask.
     */
    it('asks no more of a long garment than of a short one', () => {
        renderPage({
            selectedGarmentTypeId: 3,
            selectedGarmentTypeName: 'กางเกงขาสั้น',
            selectedGarmentTypeCategory: 'PANTS',
            selectedGarmentTypeStyle: 'short',
        });
        openForm();

        const shortFormLabels = priceLabels();

        expect(shortFormLabels).toEqual(['ราคาเด็ก', 'ราคาผู้ใหญ่']);
        expect(shortFormLabels.join(' ')).not.toContain('ยาว');
    });

    /**
     * The warning that a zero in the long box costs a whole sheet nothing goes
     * with the box it was about.
     */
    it('no longer warns about a box that is not there', () => {
        renderPage({ selectedCategory: 'PANTS' });
        openForm();

        expect(
            screen.queryByText(/ไม่คิดค่าแรงเลยเมื่อเป็นแบบยาว/),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/เว้นว่าง = เท่าราคาสั้น/)).toBeNull();
    });
});
