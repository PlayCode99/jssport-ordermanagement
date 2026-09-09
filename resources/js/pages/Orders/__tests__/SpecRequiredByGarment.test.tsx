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
    pantsTypes: [{ id: 31, name: 'กางเกง' }],
    kidsSizes: ['JS', 'JM'],
    adultSizes: ['M', 'L'],
    defaultBranchId: 1,
};

const submit = () => {
    const save = screen
        .getAllByRole('button')
        .find((node) => /บันทึก/.test(node.textContent ?? ''));
    fireEvent.click(save!);
};

/** Everything the validation modal listed as missing. */
const missingMessages = (): string[] =>
    [...document.querySelectorAll('li')].map(
        (node) => node.textContent?.trim() ?? '',
    );

const typeInto = (label: RegExp | string, value: string) => {
    const field = screen.getAllByLabelText(label)[0] as HTMLInputElement;
    fireEvent.change(field, { target: { value } });
};

describe('the spec a bill has to fill in', () => {
    it('asks for the shirt spec when the table only orders shirts', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        // The separate column, not the set one: a set is a shirt and a pair of
        // pants together, so it would rightly ask for both specs.
        typeInto('จำนวนเสื้อแยก แถวที่ 1', '10');
        submit();

        const messages = missingMessages().join(' | ');

        expect(messages).toContain('สเปกแบบเสื้อ');
        // No pants were ordered, so nothing about pants may be demanded.
        expect(messages).not.toContain('สเปกแบบกางเกง');
    });

    it('asks for both specs for a set, which is a shirt and a pair of pants', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        typeInto('จำนวนเสื้อชุด แถวที่ 1', '10');
        submit();

        const messages = missingMessages().join(' | ');

        expect(messages).toContain('สเปกแบบเสื้อ');
        expect(messages).toContain('สเปกแบบกางเกง');
    });

    it('asks for the pants spec as soon as the table orders pants', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        typeInto('จำนวนกางเกงแยก แถวที่ 1', '4');
        submit();

        expect(missingMessages().join(' | ')).toContain('สเปกแบบกางเกง');
    });

    it('asks for both when the bill carries shirts and pants', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        typeInto('จำนวนเสื้อแยก แถวที่ 1', '10');
        typeInto('จำนวนกางเกงแยก แถวที่ 1', '10');
        submit();

        const messages = missingMessages().join(' | ');

        expect(messages).toContain('สเปกแบบเสื้อ');
        expect(messages).toContain('สเปกแบบกางเกง');
    });

    it('counts every blank box, not just a handful of them', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        typeInto('จำนวนเสื้อแยก แถวที่ 1', '10');
        submit();

        // 21 fields on the shirt tab, of which the garment type arrives already
        // chosen, so a blank form is short of the other 20.
        expect(missingMessages().join(' | ')).toContain(
            'สเปกแบบเสื้อ ยังไม่ได้กรอก 20 ช่อง',
        );
    });

    it('opens the tab that is short of information', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        // Start on the pants tab with only shirts ordered: the complaint is
        // about the shirt spec, so that is the tab the counter must land on.
        fireEvent.click(screen.getByRole('button', { name: 'แบบกางเกง' }));
        typeInto('จำนวนเสื้อแยก แถวที่ 1', '10');
        submit();

        expect(
            document.querySelectorAll('input.border-red-500, .border-red-500')
                .length,
        ).toBeGreaterThan(0);
        expect(screen.getAllByText('แบบเสื้อ').length).toBeGreaterThan(0);
    });
});
