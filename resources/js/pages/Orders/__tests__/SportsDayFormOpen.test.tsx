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

const openSportsDayForm = () => {
    fireEvent.click(screen.getByRole('button', { name: 'กีฬาสี (Form 3)' }));
};

const shirtPriceField = (row: number, group = 1) =>
    screen.getByLabelText<HTMLInputElement>(
        `ราคาเสื้อแถวที่ ${row} ของคณะที่ ${group}`,
    );

const shirtQtyField = (row: number, group = 1) =>
    screen.getByLabelText<HTMLInputElement>(
        `จำนวนเสื้อแถวที่ ${row} ของคณะที่ ${group}`,
    );

describe('the sports day form', () => {
    it('opens one colour house with three blank size rows', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openSportsDayForm();

        expect(shirtQtyField(1).value).toBe('');
        expect(shirtQtyField(2).value).toBe('');
        expect(shirtQtyField(3).value).toBe('');
        expect(
            screen.queryByLabelText('จำนวนเสื้อแถวที่ 4 ของคณะที่ 1'),
        ).toBeNull();
    });

    it('holds the first row price down the column while the link is on', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openSportsDayForm();

        fireEvent.change(shirtPriceField(1), { target: { value: '250' } });

        expect(shirtPriceField(2).value).toBe('250');
        expect(shirtPriceField(3).value).toBe('250');
        // Linked rows follow the first one, so they are not typed into directly.
        expect(shirtPriceField(2).readOnly).toBe(true);
    });

    it('lets each row carry its own price once the link is switched off', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openSportsDayForm();

        fireEvent.change(shirtPriceField(1), { target: { value: '250' } });
        fireEvent.click(screen.getByLabelText('ยกเลิกลิงก์ราคาเสื้อ'));

        expect(shirtPriceField(2).readOnly).toBe(false);

        fireEvent.change(shirtPriceField(2), { target: { value: '300' } });

        expect(shirtPriceField(1).value).toBe('250');
        expect(shirtPriceField(2).value).toBe('300');
        expect(shirtPriceField(3).value).toBe('250');
    });

    it('starts a new colour house from the first one with the counts cleared', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);
        openSportsDayForm();

        fireEvent.change(shirtPriceField(1), { target: { value: '250' } });
        fireEvent.change(shirtQtyField(1), { target: { value: '12' } });

        fireEvent.click(screen.getByRole('button', { name: /เพิ่มคณะสี/ }));

        // Same size list and prices as the first house — only the quantities,
        // the name and the colour differ between houses.
        expect(shirtPriceField(1, 2).value).toBe('250');
        expect(shirtQtyField(1, 2).value).toBe('');
        expect(shirtQtyField(1, 1).value).toBe('12');
    });
});
