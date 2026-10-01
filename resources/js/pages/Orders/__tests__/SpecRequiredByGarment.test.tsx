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

        typeInto('จำนวนเสื้อ แถวที่ 1', '10');
        submit();

        const messages = missingMessages().join(' | ');

        // Named by the table it belongs to, because a bill can carry several
        // shirt specs and the counter has to know which one is short.
        expect(messages).toContain('สเปกตารางเสื้อ');
        // No trousers were ordered, so nothing about them may be demanded.
        expect(messages).not.toContain('สเปกตารางกางเกง');
    });

    it('asks for the pants spec as soon as the table orders pants', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        typeInto('จำนวนกางเกง แถวที่ 1', '4');
        submit();

        expect(missingMessages().join(' | ')).toContain('สเปกตารางกางเกง');
    });

    it('asks for both when the bill carries shirts and pants', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        typeInto('จำนวนเสื้อ แถวที่ 1', '10');
        typeInto('จำนวนกางเกง แถวที่ 1', '10');
        submit();

        const messages = missingMessages().join(' | ');

        expect(messages).toContain('สเปกตารางเสื้อ');
        expect(messages).toContain('สเปกตารางกางเกง');
    });

    it('names the table that is short, not just the garment', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        typeInto('จำนวนเสื้อ แถวที่ 1', '10');
        submit();

        // The bill opens on one kids short-sleeve table, and the complaint
        // says so — a bill with three shirt tables would name each separately.
        expect(missingMessages().join(' | ')).toContain(
            'ตารางเสื้อไซซ์เด็ก · แขนสั้น',
        );
    });

    it('counts every blank box, not just a handful of them', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        typeInto('จำนวนเสื้อ แถวที่ 1', '10');
        submit();

        // 20 fields on the shirt spec now that สาบนอก is retired, of which the
        // garment type arrives already chosen, so a blank table is short of 19.
        expect(missingMessages().join(' | ')).toContain(
            'ยังไม่ได้กรอก 19 ช่อง',
        );
    });

    /**
     * There is no tab to open any more: both specs are on screen at once, each
     * under its own table. What has to be right instead is which boxes go red
     * — marking the trouser spec because the shirts are short would send the
     * counter to fill in the wrong table.
     */
    it('reddens the boxes of the table that is short, and only that one', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        const redBoxesIn = (garment: 'shirt' | 'pants') =>
            (
                document.querySelector(
                    `[data-slot="garment-spec"][data-garment="${garment}"]`,
                ) as HTMLElement
            ).querySelectorAll('.border-red-500').length;

        typeInto('จำนวนเสื้อ แถวที่ 1', '10');
        submit();

        expect(redBoxesIn('shirt')).toBeGreaterThan(0);
        // No trousers were ordered, so its spec is not yet owed anything.
        expect(redBoxesIn('pants')).toBe(0);
    });
});
