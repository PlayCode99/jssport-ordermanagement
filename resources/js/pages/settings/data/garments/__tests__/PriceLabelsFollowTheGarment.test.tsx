import type * as InertiaModuleImport from '@inertiajs/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import GarmentPricesPage from '@/pages/settings/data/garments/prices';

type InertiaModule = typeof InertiaModuleImport;

/**
 * Shirts and trousers are priced apart — a row of this list belongs to one
 * garment type — so a shirt has no legs to name and a pair of trousers has no
 * sleeves. The long-price boxes said "แขนยาว/ขายาว" whatever was being priced,
 * which was written when one row covered either, and left a trouser row headed
 * with a word about sleeves.
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
        category: 'SHIRT',
        name: 'เย็บคอ',
        child_price: '10.00',
        adult_price: '20.00',
        child_price_long: null,
        adult_price_long: null,
        display_order: 1,
        is_active: true,
    },
    {
        id: 12,
        garment_type_id: 3,
        garment_type_name: 'กางเกงขาสั้น',
        category: 'PANTS',
        name: 'เย็บขา',
        child_price: '8.00',
        adult_price: '15.00',
        child_price_long: null,
        adult_price_long: null,
        display_order: 2,
        is_active: true,
    },
];

/** The page as it arrives, with whatever the reader opened it for. */
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

describe('the price list headings', () => {
    it('name neither sleeves nor legs while both are listed', () => {
        renderPage();

        expect(headings()).toContain('เด็ก แบบยาว');
        expect(headings()).toContain('ผู้ใหญ่ แบบยาว');
        expect(headings()).toContain('ประเภทงาน');
        // The word that belongs to the other garment is nowhere in the row.
        expect(headings().join(' ')).not.toContain('แขนยาว/ขายาว');
    });

    it('name sleeves when the list is showing shirts', () => {
        renderPage({ selectedCategory: 'SHIRT' });

        expect(headings()).toContain('เด็ก แขนยาว');
        expect(headings()).toContain('ผู้ใหญ่ แขนยาว');
        expect(headings()).toContain('ประเภทเสื้อ');
        expect(headings().join(' ')).not.toContain('ขายาว');
    });

    it('name legs when the list is showing trousers', () => {
        renderPage({ selectedCategory: 'PANTS' });

        expect(headings()).toContain('เด็ก ขายาว');
        expect(headings()).toContain('ผู้ใหญ่ ขายาว');
        expect(headings()).toContain('ประเภทกางเกง');
        expect(headings().join(' ')).not.toContain('แขนยาว');
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

    it('names the sleeves of the shirt it was opened for', () => {
        renderPage({
            selectedGarmentTypeId: 2,
            selectedGarmentTypeName: 'เสื้อประตู',
            selectedGarmentTypeCategory: 'SHIRT',
            selectedGarmentTypeStyle: 'long',
        });
        openForm();

        expect(priceLabels()).toContain('ราคาเด็ก แขนยาว');
        expect(priceLabels()).toContain('ราคาผู้ใหญ่ แขนยาว');
        expect(priceLabels().join(' ')).not.toContain('ขายาว');
    });

    it('names the legs of the trousers it was opened for', () => {
        renderPage({
            selectedGarmentTypeId: 3,
            selectedGarmentTypeName: 'กางเกงขาสั้น',
            selectedGarmentTypeCategory: 'PANTS',
            selectedGarmentTypeStyle: 'short',
        });
        openForm();

        expect(priceLabels()).toContain('ราคาเด็ก ขายาว');
        expect(priceLabels()).toContain('ราคาผู้ใหญ่ ขายาว');
        expect(priceLabels().join(' ')).not.toContain('แขนยาว');
    });

    /**
     * Opened on nothing in particular, the form picks the first garment on the
     * list for itself — so it still has one, and still knows what to call it.
     */
    it('names whatever garment it picked when it was opened on none', () => {
        renderPage({ selectedCategory: 'PANTS' });
        openForm();

        expect(priceLabels()).toContain('ราคาเด็ก ขายาว');
        expect(priceLabels().join(' ')).not.toContain('แขนยาว');
    });
});
