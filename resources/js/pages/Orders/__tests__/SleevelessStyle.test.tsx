import type * as InertiaModuleImport from '@inertiajs/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
    PANTS_STYLES,
    readPantsStyle,
    readShirtStyle,
    resolveArtworkBatches,
    resolveIndividualArtworkBatches,
    SHIRT_STYLES,
} from '@/pages/Orders/Create';
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
 * A sleeveless shirt is not a short-sleeved one at another price: there is no
 * sleeve to attach and no cuff to hem, and there is an armhole to bind that
 * the others do not have. It is cut on its own sheet and priced from its own
 * card, so the form has to be able to sell one. Trousers have no such cut.
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

describe('the lengths a garment can be cut in', () => {
    it('offers a shirt three and a pair of trousers two', () => {
        expect([...SHIRT_STYLES]).toEqual(['short', 'long', 'sleeveless']);
        expect([...PANTS_STYLES]).toEqual(['short', 'long']);
    });

    it('brings a saved bill back as the length it was sold at', () => {
        // Reading anything unrecognised as 'short' would quietly turn a
        // sleeveless order into a short-sleeved one the next time it is saved.
        expect(readShirtStyle('sleeveless')).toBe('sleeveless');
        expect(readShirtStyle('long')).toBe('long');
        expect(readShirtStyle(undefined)).toBe('short');
        expect(readShirtStyle('three-quarter')).toBe('short');

        // Trousers have no sleeveless cut, so the value is not carried over.
        expect(readPantsStyle('sleeveless')).toBe('short');
        expect(readPantsStyle('long')).toBe('long');
    });
});

describe('the sheets a sleeveless bill will be split into', () => {
    const table = (over: Record<string, unknown> = {}) => ({
        id: 't-adults',
        table_type: 'adults' as const,
        title: 'ตารางไซส์ผู้ใหญ่',
        shirt_rows: [],
        pants_rows: [],
        rows: [],
        ...over,
    });

    const row = (over: Record<string, unknown> = {}) => ({
        id: 'r1',
        size_label: 'L',
        style: 'short' as const,
        quantity: 5,
        unit_price: 100,
        ...over,
    });

    it('gives a sleeveless shirt a sheet of its own on Form 1', () => {
        const batches = resolveArtworkBatches([
            table({
                shirt_rows: [
                    row({ id: 'a', style: 'short' }),
                    row({ id: 'b', style: 'sleeveless', quantity: 3 }),
                ],
            }),
        ] as never);

        expect(batches.map((batch) => batch.key)).toEqual([
            'shirt_adults_short',
            'shirt_adults_sleeveless',
        ]);
        expect(batches[1].label).toContain('แขนกุด');
    });

    it('gives a sleeveless shirt a sheet of its own on Form 2', () => {
        const person = (over: Record<string, unknown> = {}) => ({
            id: 'p1',
            role: 'player' as const,
            name: 'สมชาย',
            size_group: 'adults' as const,
            size: 'L',
            shirt_style: 'short' as const,
            number: '9',
            quantity: 1,
            unit_price: 250,
            pants_size: 'L',
            pants_style: 'short' as const,
            pants_number: '9',
            pants_quantity: 0,
            pants_unit_price: 0,
            ...over,
        });

        const batches = resolveIndividualArtworkBatches(
            [
                person({ id: 'p1', shirt_style: 'short' }),
                person({ id: 'p2', shirt_style: 'sleeveless' }),
            ] as never,
            false,
        );

        expect(batches.map((batch) => batch.key)).toEqual([
            'shirt_adults_short',
            'shirt_adults_sleeveless',
        ]);
    });
});

describe('the order form', () => {
    it('lets the counter sell a sleeveless shirt', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        // Every length a shirt can be cut in is on the form; the shop cannot
        // sell what it cannot pick.
        expect(screen.getAllByText('แขนสั้น').length).toBeGreaterThan(0);
        expect(screen.getAllByText('แขนกุด').length).toBeGreaterThan(0);
    });
});
