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
    shirtTypes: [
        { id: 21, name: 'เสื้อโปโล' },
        { id: 22, name: 'เสื้อคอกลม' },
    ],
    pantsTypes: [{ id: 31, name: 'กางเกงขาสั้น' }],
    kidsSizes: ['JS', 'JM'],
    adultSizes: ['M', 'L'],
    defaultBranchId: 1,
};

const duplicatedOrder = {
    id: 7,
    order_code: 'ORD-2026-00007',
    customer_id: 1,
    branch_id: 1,
    customer_name: 'โรงเรียนทดสอบ',
    customer_phone: '0812345678',
    contact_detail: '',
    job_name: 'งานทดสอบ',
    job_type: 'งานปัก',
    billing_date: '2026-09-01',
    billing_time: '10:00',
    due_date: '2026-09-20',
    delivery_method: 'pickup',
    shipping_address: '',
    discount_percent: 0,
    deposit_amount: 0,
    payment_method: 'cash',
    artwork_url: null,
    shirt_artwork_urls: [],
    pants_artwork_urls: [],
    reference_designs: [],
    items: [],
    specification: {
        decoded: {
            schema: 'spec-v2',
            mode: 'matrix',
            shirt_specs: {
                shirt_type_id: '22',
                pattern_id: '1',
                fabric_id: '2',
            },
            pants_specs: { pants_type_id: '31', leg_style_id: '15' },
        },
    },
};

const SHIRT_TYPE_TEXTS = ['เสื้อโปโล', 'เสื้อคอกลม', 'เลือกแบบเสื้อ'];

/** Text shown on the "แบบเสื้อ" trigger, which is what the user actually sees. */
const shirtTypeTriggerText = (): string => {
    const trigger = screen
        .getAllByRole('combobox')
        .find((node) =>
            SHIRT_TYPE_TEXTS.includes(node.textContent?.trim() ?? ''),
        );

    return trigger?.textContent?.trim() ?? '(no shirt type trigger)';
};

const PANTS_TYPE_TEXTS = ['กางเกงขาสั้น', 'เลือกแบบกางเกง'];

const pantsTypeTriggerText = (): string => {
    const trigger = screen
        .getAllByRole('combobox')
        .find((node) =>
            PANTS_TYPE_TEXTS.includes(node.textContent?.trim() ?? ''),
        );

    return trigger?.textContent?.trim() ?? '(no pants type trigger)';
};

const showShirtTab = () =>
    fireEvent.click(screen.getByRole('button', { name: /^แบบเสื้อ/ }));
const showPantsTab = () =>
    fireEvent.click(screen.getByRole('button', { name: /^แบบกางเกง/ }));

/**
 * Regression tests for a reopened bill losing its saved dropdown choices.
 * Radix Select keeps a hidden native <select> whose remount fired a change with
 * an empty value, and the spec tabs unmount their side when switched, so every
 * round trip silently cleared the selection.
 */
describe('spec tab switching keeps the saved dropdown choices', () => {
    it('keeps the shirt type after switching to pants and back', () => {
        render(
            <OrderCreatePage
                {...(props as unknown as PageProps)}
                order={duplicatedOrder as never}
            />,
        );

        expect(shirtTypeTriggerText()).toBe('เสื้อคอกลม');

        showPantsTab();
        showShirtTab();

        expect(shirtTypeTriggerText()).toBe('เสื้อคอกลม');
    });

    it('does not ask for the pants type any more', () => {
        // Leg length is chosen per row in the size table, and the pants type
        // only picks the labour rate, so asking for it here made the counter
        // answer the same question twice and let the two answers disagree.
        render(
            <OrderCreatePage
                {...(props as unknown as PageProps)}
                order={duplicatedOrder as never}
            />,
        );

        showPantsTab();

        expect(pantsTypeTriggerText()).toBe('(no pants type trigger)');
        expect(screen.queryByText('เลือกแบบกางเกง')).toBeNull();
    });

    it('survives repeated switching', () => {
        render(
            <OrderCreatePage
                {...(props as unknown as PageProps)}
                order={duplicatedOrder as never}
            />,
        );

        for (let round = 0; round < 3; round += 1) {
            showPantsTab();
            showShirtTab();
        }

        expect(shirtTypeTriggerText()).toBe('เสื้อคอกลม');
    });

    it('keeps the other spec dropdowns too', () => {
        render(
            <OrderCreatePage
                {...(props as unknown as PageProps)}
                order={duplicatedOrder as never}
            />,
        );

        showPantsTab();
        showShirtTab();

        // The catalog fields are comboboxes now: the saved id is shown as the
        // catalog name in the text box, and must still be there after the
        // round trip.
        expect(screen.getByLabelText<HTMLInputElement>('แพทเทิร์น').value).toBe(
            'แพทเทิร์นมาตรฐาน',
        );
        expect(screen.getByLabelText<HTMLInputElement>('เนื้อผ้า').value).toBe(
            'ผ้าไมโคร',
        );
    });
});

describe('missing required fields are marked on the form', () => {
    const emptyOrderProps = { ...props };

    const submit = () => {
        const save = screen
            .getAllByRole('button')
            .find((node) => /บันทึก/.test(node.textContent ?? ''));
        fireEvent.click(save!);
    };

    it('turns empty required boxes red only after a failed save', () => {
        render(
            <OrderCreatePage {...(emptyOrderProps as unknown as PageProps)} />,
        );

        // Nothing is accused before the user has tried to save.
        expect(document.querySelectorAll('.border-red-500')).toHaveLength(0);

        submit();

        expect(
            document.querySelectorAll('.border-red-500').length,
        ).toBeGreaterThan(0);
    });

    it('clears the red as soon as the field is filled in', () => {
        render(
            <OrderCreatePage {...(emptyOrderProps as unknown as PageProps)} />,
        );

        submit();
        const flaggedBefore =
            document.querySelectorAll('.border-red-500').length;
        expect(flaggedBefore).toBeGreaterThan(0);

        const jobNameInput = document.querySelector(
            'input.border-red-500',
        ) as HTMLInputElement | null;

        if (jobNameInput) {
            fireEvent.change(jobNameInput, { target: { value: 'งานใหม่' } });
            expect(
                document.querySelectorAll('.border-red-500').length,
            ).toBeLessThan(flaggedBefore);
        }
    });
});

describe('saved artwork can be removed while editing', () => {
    const withArtwork = {
        ...duplicatedOrder,
        shirt_artwork_media: [
            { id: 101, url: 'https://example.test/shirt-a.webp' },
            { id: 102, url: 'https://example.test/shirt-b.webp' },
        ],
        artwork_media: [{ id: 201, url: 'https://example.test/main.webp' }],
        reference_design_media: [
            { id: 202, url: 'https://example.test/ref.webp' },
        ],
    };

    const removeButtons = () => screen.getAllByLabelText('ลบรูปที่บันทึกไว้');

    it('shows a remove button on every saved image', () => {
        render(
            <OrderCreatePage
                {...(props as unknown as PageProps)}
                order={withArtwork as never}
            />,
        );

        // Two general images on the left, two shirt images on the shirt tab.
        expect(removeButtons()).toHaveLength(4);
    });

    it('drops the image from the gallery once removed', () => {
        render(
            <OrderCreatePage
                {...(props as unknown as PageProps)}
                order={withArtwork as never}
            />,
        );

        expect(
            document.querySelectorAll(
                'img[src="https://example.test/shirt-a.webp"]',
            ),
        ).toHaveLength(1);

        const shirtImage = document.querySelector(
            'img[src="https://example.test/shirt-a.webp"]',
        );
        const card = shirtImage?.closest('div.overflow-hidden');
        fireEvent.click(card!.querySelector('button')!);

        expect(
            document.querySelectorAll(
                'img[src="https://example.test/shirt-a.webp"]',
            ),
        ).toHaveLength(0);
        // The other saved images stay put.
        expect(
            document.querySelectorAll(
                'img[src="https://example.test/shirt-b.webp"]',
            ),
        ).toHaveLength(1);
    });

    it('keeps the removal after switching spec tabs', () => {
        render(
            <OrderCreatePage
                {...(props as unknown as PageProps)}
                order={withArtwork as never}
            />,
        );

        const shirtImage = document.querySelector(
            'img[src="https://example.test/shirt-a.webp"]',
        );
        fireEvent.click(
            shirtImage!
                .closest('div.overflow-hidden')!
                .querySelector('button')!,
        );

        fireEvent.click(screen.getByRole('button', { name: /^แบบกางเกง/ }));
        fireEvent.click(screen.getByRole('button', { name: /^แบบเสื้อ/ }));

        expect(
            document.querySelectorAll(
                'img[src="https://example.test/shirt-a.webp"]',
            ),
        ).toHaveLength(0);
    });

    it('shows the empty state once every saved image is removed', () => {
        render(
            <OrderCreatePage
                {...(props as unknown as PageProps)}
                order={withArtwork as never}
            />,
        );

        ['shirt-a', 'shirt-b'].forEach((name) => {
            const image = document.querySelector(
                `img[src="https://example.test/${name}.webp"]`,
            );
            fireEvent.click(
                image!.closest('div.overflow-hidden')!.querySelector('button')!,
            );
        });

        expect(screen.getAllByText('ยังไม่ได้แนบรูป').length).toBeGreaterThan(
            0,
        );
    });
});

describe('the size table opens ready to type into', () => {
    const sizeTable = () =>
        document.querySelector('table.min-w-\\[1480px\\]') as HTMLTableElement;
    const bodyRows = () => sizeTable().querySelectorAll('tbody tr');

    it('starts with three blank rows instead of one per size in the catalogue', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        // Two adult sizes are configured; the table must not pre-fill a row each.
        expect(bodyRows()).toHaveLength(3);
    });

    it('leaves the size unset so the box reads ไม่ระบุ', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        const sizeTriggers = [
            ...sizeTable().querySelectorAll('tbody [role="combobox"]'),
        ];
        const firstRowSize = sizeTriggers[0];

        expect(firstRowSize?.textContent).toBe('ไม่ระบุ');
    });

    it('does not block saving on rows nobody filled in', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        const save = screen
            .getAllByRole('button')
            .find((node) => /บันทึก/.test(node.textContent ?? ''));
        fireEvent.click(save!);

        // The order is incomplete for other reasons, but never because three
        // untouched rows have no size.
        expect(
            screen.queryByText('ไซส์ในตารางเลือกไซซ์'),
        ).not.toBeInTheDocument();
    });
});

describe('price link', () => {
    const priceInputs = () => {
        const table = document.querySelector(
            'table.min-w-\\[1480px\\]',
        ) as HTMLTableElement;

        return [...table.querySelectorAll('tbody tr')].map(
            (row) =>
                [
                    ...row.querySelectorAll('input[type="number"]'),
                ][2] as HTMLInputElement,
        );
    };

    it('starts linked and carries the first row price down the table', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        const toggle = screen.getByLabelText('ยกเลิกลิงก์ราคาต่อชุด');
        expect(toggle).toHaveAttribute('aria-pressed', 'true');

        fireEvent.change(priceInputs()[0], { target: { value: '250' } });

        expect(priceInputs().map((input) => input.value)).toEqual([
            '250',
            '250',
            '250',
        ]);
    });

    it('still lets a single row differ without breaking the link', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        fireEvent.change(priceInputs()[0], { target: { value: '250' } });
        fireEvent.change(priceInputs()[2], { target: { value: '300' } });

        expect(priceInputs().map((input) => input.value)).toEqual([
            '250',
            '250',
            '300',
        ]);

        // The first row still sweeps the table afterwards.
        fireEvent.change(priceInputs()[0], { target: { value: '200' } });
        expect(priceInputs().map((input) => input.value)).toEqual([
            '200',
            '200',
            '200',
        ]);
    });

    it('leaves every row alone once the link is switched off', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        fireEvent.click(screen.getByLabelText('ยกเลิกลิงก์ราคาต่อชุด'));
        expect(
            screen.getByLabelText('ลิงก์ราคาต่อชุดกับแถวแรก'),
        ).toHaveAttribute('aria-pressed', 'false');

        fireEvent.change(priceInputs()[0], { target: { value: '250' } });

        expect(priceInputs().map((input) => input.value)).toEqual([
            '250',
            '',
            '',
        ]);
    });

    it('links each price column on its own', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        fireEvent.click(screen.getByLabelText('ยกเลิกลิงก์ราคาต่อชุด'));

        // Turning one column off leaves the other two linked.
        expect(screen.getByLabelText('ยกเลิกลิงก์ราคาเสื้อ')).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(screen.getByLabelText('ยกเลิกลิงก์ราคากางเกง')).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });
});

describe('size table dropdowns', () => {
    it('opens downwards by default', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        const table = document.querySelector(
            'table.min-w-\\[1480px\\]',
        ) as HTMLTableElement;
        const firstRow = table.querySelector('tbody tr')!;

        fireEvent.click(firstRow.querySelector('[role="combobox"]')!);

        const menu = document.querySelector('[role="listbox"]');
        expect(menu).not.toBeNull();
        expect(menu!.getAttribute('data-side')).toBe('bottom');
    });

    it('is positioned so it can flip above the row when the page runs out of space', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        const table = document.querySelector(
            'table.min-w-\\[1480px\\]',
        ) as HTMLTableElement;
        fireEvent.click(table.querySelector('tbody [role="combobox"]')!);

        const menu = document.querySelector('[role="listbox"]') as HTMLElement;

        // The popper strategy is what gives the menu collision handling; the
        // default item-aligned strategy would simply run off the bottom.
        expect(
            menu.closest('[data-radix-popper-content-wrapper]'),
        ).not.toBeNull();
    });
});

describe('set quantity link', () => {
    const table = () =>
        document.querySelector('table.min-w-\\[1480px\\]') as HTMLTableElement;
    const rowInputs = (rowIndex: number) =>
        [
            ...table()
                .querySelectorAll('tbody tr')
                [rowIndex].querySelectorAll('input[type="number"]'),
        ] as HTMLInputElement[];
    const setShirt = (rowIndex: number) => rowInputs(rowIndex)[0];
    const setPants = (rowIndex: number) => rowInputs(rowIndex)[1];

    it('keeps the table square: one header cell per body cell', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        const headers = table().querySelectorAll('thead th').length;
        const bodyCells = table()
            .querySelectorAll('tbody tr')[0]
            .querySelectorAll('td').length;
        const footerCells = table().querySelectorAll('tfoot td').length;

        expect(bodyCells).toBe(headers);
        expect(footerCells).toBe(headers);
    });

    it('fills the pants count from the shirt count while linked', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        expect(
            screen.getAllByLabelText('แยกจำนวนเสื้อและกางเกง')[0],
        ).toHaveAttribute('aria-pressed', 'true');

        fireEvent.change(setShirt(0), { target: { value: '10' } });

        expect(setShirt(0).value).toBe('10');
        expect(setPants(0).value).toBe('10');
    });

    it('works from either box', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        fireEvent.change(setPants(0), { target: { value: '7' } });

        expect(setShirt(0).value).toBe('7');
        expect(setPants(0).value).toBe('7');
    });

    it('links only its own row', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        fireEvent.change(setShirt(0), { target: { value: '10' } });

        // The second row is untouched: the link is per row, not down the column.
        expect(setShirt(1).value).toBe('');
        expect(setPants(1).value).toBe('');
    });

    it('lets the two counts differ once unlinked', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        fireEvent.click(screen.getAllByLabelText('แยกจำนวนเสื้อและกางเกง')[0]);
        fireEvent.change(setShirt(0), { target: { value: '10' } });

        expect(setShirt(0).value).toBe('10');
        expect(setPants(0).value).toBe('');
    });

    it('unlinks one row without unlinking the others', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        fireEvent.click(screen.getAllByLabelText('แยกจำนวนเสื้อและกางเกง')[0]);

        fireEvent.change(setShirt(1), { target: { value: '5' } });
        expect(setPants(1).value).toBe('5');
    });

    it('can be linked again after unlinking', () => {
        render(<OrderCreatePage {...(props as unknown as PageProps)} />);

        fireEvent.click(screen.getAllByLabelText('แยกจำนวนเสื้อและกางเกง')[0]);
        fireEvent.click(
            screen.getAllByLabelText('ล็อกจำนวนเสื้อและกางเกงให้เท่ากัน')[0],
        );

        fireEvent.change(setShirt(0), { target: { value: '8' } });
        expect(setPants(0).value).toBe('8');
    });
});
