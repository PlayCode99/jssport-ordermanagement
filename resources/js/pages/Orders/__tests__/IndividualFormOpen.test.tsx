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

const nameFields = () =>
    screen.queryAllByLabelText<HTMLInputElement>(/^สกรีนชื่อคนที่ /);

const openIndividualForm = () => {
    fireEvent.click(screen.getByRole('button', { name: 'รายตัว (Form 2)' }));
};

const priceField = (person: number) =>
    screen.getByLabelText<HTMLInputElement>(`ราคาเสื้อคนที่ ${person}`);

describe('opening the individual form', () => {
    it('starts with three blank people to type into', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        expect(nameFields()).toHaveLength(0);

        openIndividualForm();

        expect(nameFields()).toHaveLength(3);

        for (const field of nameFields()) {
            expect(field.value).toBe('');
        }
    });

    it('keeps what the counter typed when switching away and back', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        openIndividualForm();
        fireEvent.change(nameFields()[0], { target: { value: 'สมชาย' } });

        fireEvent.click(
            screen.getByRole('button', {
                name: 'แพทเทรินเสื้อเหมือนกัน (Form 1)',
            }),
        );
        openIndividualForm();

        // Coming back must not wipe the row or stack three more blanks on top.
        expect(nameFields()).toHaveLength(3);
        expect(nameFields()[0].value).toBe('สมชาย');
    });

    it('charges the whole list at the first person price while linked', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openIndividualForm();

        fireEvent.change(priceField(1), { target: { value: '250' } });

        expect(priceField(2).value).toBe('250');
        expect(priceField(3).value).toBe('250');
        expect(priceField(2).readOnly).toBe(true);
    });

    it('lets each person carry their own price once the link is off', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openIndividualForm();

        fireEvent.change(priceField(1), { target: { value: '250' } });
        fireEvent.click(screen.getByLabelText('ยกเลิกลิงก์ราคาเสื้อ'));

        expect(priceField(2).readOnly).toBe(false);

        fireEvent.change(priceField(2), { target: { value: '300' } });

        expect(priceField(1).value).toBe('250');
        expect(priceField(2).value).toBe('300');
        expect(priceField(3).value).toBe('250');
    });

    it('adds a new person at the list price rather than at zero', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openIndividualForm();

        fireEvent.change(priceField(1), { target: { value: '250' } });
        fireEvent.click(screen.getByRole('button', { name: /เพิ่มรายชื่อ/ }));

        expect(nameFields()).toHaveLength(4);
        expect(priceField(4).value).toBe('250');
    });

    it('numbers the rows so a long team list stays readable', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openIndividualForm();

        expect(screen.getByLabelText('สกรีนชื่อคนที่ 3')).toBeTruthy();
        expect(screen.getByLabelText('ลบคนที่ 3')).toBeTruthy();
    });
});

/**
 * Production prints one sheet per sleeve length, so Form 2 lets the counter say
 * which length each person takes. A team normally shares one length, which is
 * why the column starts held to the first person.
 */
describe('sleeve and leg length on the individual form', () => {
    const sleeveField = (person: number) =>
        screen.getByLabelText<HTMLButtonElement>(`แขนคนที่ ${person}`);

    it('gives every person a sleeve of their own, short by default', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openIndividualForm();

        expect(screen.getAllByLabelText(/^แขนคนที่ /)).toHaveLength(3);
        expect(sleeveField(1).textContent).toContain('แขนสั้น');
    });

    it('holds the whole list to the first person while linked', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openIndividualForm();

        expect(sleeveField(1).disabled).toBe(false);
        expect(sleeveField(2).disabled).toBe(true);
        expect(sleeveField(3).disabled).toBe(true);
    });

    it('lets each person pick their own sleeve once the link is off', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openIndividualForm();

        fireEvent.click(screen.getByLabelText('ยกเลิกลิงก์แขน'));

        expect(sleeveField(2).disabled).toBe(false);
        expect(sleeveField(3).disabled).toBe(false);
    });

    it('shows the leg length only when the bill includes pants', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openIndividualForm();

        expect(screen.queryAllByLabelText(/^ขาคนที่ /)).toHaveLength(0);

        fireEvent.click(screen.getByLabelText('สั่งกางเกงด้วย'));

        expect(screen.getAllByLabelText(/^ขาคนที่ /)).toHaveLength(3);
        expect(screen.getByLabelText('ขาคนที่ 1').textContent).toContain(
            'ขาสั้น',
        );
    });
});
