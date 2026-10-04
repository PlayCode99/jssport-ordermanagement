import type * as InertiaModuleImport from '@inertiajs/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OrderCreatePage, {
    sportsDayArtworkPayload,
} from '@/pages/Orders/Create';

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

// Pictures go through as picked: the real compressor needs a canvas jsdom
// does not have, and what it does to a picture is not under test here.
vi.mock('@/hooks/useWebpCompress', () => ({
    useWebpCompress: () => ({
        compressImage: async (file: File) => file,
        isCompressing: false,
        error: null,
    }),
}));

URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`);
URL.revokeObjectURL = vi.fn();

/**
 * Form 3 takes its pictures at the end of each colour house, the way Forms 1
 * and 4 take a table's under the table. The house says which sheets they go
 * on, so there is nothing for the counter to choose.
 */
const openSportsDay = () => {
    render(<OrderCreatePage {...(props as unknown as PageProps)} />);
    fireEvent.click(screen.getByRole('button', { name: 'กีฬาสี (Form 3)' }));
};

const houseCard = (house: number) =>
    screen
        .getByLabelText(`ชื่อคณะสีที่ ${house}`)
        .closest('div.overflow-hidden') as HTMLElement;

const picture = (name: string) => new File(['x'], name, { type: 'image/webp' });

const attach = async (house: number, ...files: File[]) => {
    const input = houseCard(house).querySelector(
        'input[type="file"]',
    ) as HTMLInputElement;

    await act(async () => {
        fireEvent.change(input, { target: { files } });
    });
};

describe('a colour house takes its own pictures', () => {
    it('ends every house with a gallery named after it', () => {
        openSportsDay();
        fireEvent.click(screen.getByRole('button', { name: /เพิ่มคณะสี/ }));

        expect(
            within(houseCard(1)).getByText('Art Work · คณะที่ 1'),
        ).toBeInTheDocument();
        expect(
            within(houseCard(2)).getByText('Art Work · คณะที่ 2'),
        ).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('ชื่อคณะสีที่ 1'), {
            target: { value: 'คณะสีแดง' },
        });

        expect(
            within(houseCard(1)).getByText('Art Work · คณะสีแดง'),
        ).toBeInTheDocument();
    });

    it('no longer sends a new bill to the shared Art Work dialog', () => {
        openSportsDay();

        expect(
            screen.queryByRole('button', { name: /จัดการรูป Art Work/ }),
        ).not.toBeInTheDocument();
    });

    it('keeps a picture with the house it was attached to', async () => {
        openSportsDay();
        fireEvent.click(screen.getByRole('button', { name: /เพิ่มคณะสี/ }));

        await attach(2, picture('blue.webp'));

        expect(
            within(houseCard(2)).getByAltText('blue.webp'),
        ).toBeInTheDocument();
        expect(
            within(houseCard(1)).queryByAltText('blue.webp'),
        ).not.toBeInTheDocument();
        expect(
            within(houseCard(1)).getByText('ยังไม่ได้แนบรูป'),
        ).toBeInTheDocument();
    });

    it('adds to what the house already has, and takes one picture off', async () => {
        openSportsDay();

        await attach(1, picture('a.webp'), picture('b.webp'));
        await attach(1, picture('c.webp'));

        expect(
            within(houseCard(1))
                .getAllByRole('img')
                .map((img) => img.getAttribute('alt')),
        ).toEqual(['a.webp', 'b.webp', 'c.webp']);

        fireEvent.click(
            within(houseCard(1)).getAllByRole('button', {
                name: 'ลบรูปที่เลือกไว้ของ คณะที่ 1',
            })[1],
        );

        expect(
            within(houseCard(1))
                .getAllByRole('img')
                .map((img) => img.getAttribute('alt')),
        ).toEqual(['a.webp', 'c.webp']);
    });
});

describe('the pictures as they are saved', () => {
    const red = picture('red.webp');
    const blue = picture('blue.webp');

    it('are sent by the house’s position on the bill', () => {
        expect(
            sportsDayArtworkPayload(
                [{ id: 'red' }, { id: 'green' }, { id: 'blue' }],
                { red: [red], blue: [blue] },
            ),
        ).toEqual({ '0': [red], '2': [blue] });
    });

    it('follow their house when one before it is removed', () => {
        // Green was second and is gone, so blue is now the second house.
        expect(
            sportsDayArtworkPayload([{ id: 'red' }, { id: 'blue' }], {
                red: [red],
                green: [picture('green.webp')],
                blue: [blue],
            }),
        ).toEqual({ '0': [red], '1': [blue] });
    });

    it('leave out a house with none', () => {
        expect(sportsDayArtworkPayload([{ id: 'red' }], { red: [] })).toEqual(
            {},
        );
    });
});

describe('pictures and houses that come and go', () => {
    it('stay with their house when an earlier house is removed', async () => {
        openSportsDay();
        fireEvent.click(screen.getByRole('button', { name: /เพิ่มคณะสี/ }));
        await attach(2, picture('blue.webp'));

        fireEvent.click(screen.getByRole('button', { name: 'ลบคณะที่ 1' }));

        expect(
            within(houseCard(1)).getByAltText('blue.webp'),
        ).toBeInTheDocument();
    });

    it('do not come back on a house added after theirs was removed', async () => {
        openSportsDay();
        fireEvent.click(screen.getByRole('button', { name: /เพิ่มคณะสี/ }));
        await attach(2, picture('blue.webp'));

        fireEvent.click(screen.getByRole('button', { name: 'ลบคณะที่ 2' }));
        fireEvent.click(screen.getByRole('button', { name: /เพิ่มคณะสี/ }));

        expect(
            within(houseCard(2)).queryByAltText('blue.webp'),
        ).not.toBeInTheDocument();
    });
});

describe('a colour-house bill with pictures attached the earlier way', () => {
    it('keeps the shared Art Work dialog so they can still be reached', () => {
        render(
            <OrderCreatePage
                {...(props as unknown as PageProps)}
                order={
                    {
                        id: 9,
                        order_code: 'ORD-2026-00009',
                        customer_id: 1,
                        branch_id: 1,
                        customer_name: 'โรงเรียนทดสอบ',
                        customer_phone: '',
                        contact_detail: '',
                        job_name: 'กีฬาสี 2569',
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
                        shirt_artwork_media: [
                            {
                                id: 501,
                                url: 'https://example.test/house.webp',
                                batch: 'sports_day_0_shirt_adults',
                            },
                        ],
                        items: [],
                        specification: {
                            decoded: {
                                schema: 'spec-v2',
                                mode: 'sports_day',
                                shirt_specs: { shirt_type_id: '21' },
                                sports_day_groups: [
                                    {
                                        team_name: 'คณะสีแดง',
                                        fabric_color_id: '3',
                                        rows: [
                                            {
                                                size_group: 'adults',
                                                size_label: 'M',
                                                shirt_qty: 10,
                                                shirt_price: 200,
                                                pants_qty: 0,
                                                pants_price: 0,
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    } as never
                }
            />,
        );

        expect(
            screen.getByRole('button', { name: /จัดการรูป Art Work/ }),
        ).toBeInTheDocument();
        // And the house still takes new pictures of its own.
        expect(
            within(houseCard(1)).getByText('Art Work · คณะสีแดง'),
        ).toBeInTheDocument();
    });
});
