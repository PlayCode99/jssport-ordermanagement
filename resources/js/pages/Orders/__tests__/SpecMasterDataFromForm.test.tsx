import type * as InertiaModuleImport from '@inertiajs/react';
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import OrderCreatePage from '@/pages/Orders/Create';

type InertiaModule = typeof InertiaModuleImport;
type PageProps = Parameters<typeof OrderCreatePage>[0];

const mockPage = vi.hoisted(() => ({
    props: {
        currentTeam: null,
        auth: { user: { access_role: 'OWNER' } },
    } as Record<string, unknown>,
    url: '/orders/create',
}));

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
        usePage: () => mockPage,
    };
});

/**
 * The sewing-spec master data is managed from this form and nowhere else.
 * Every catalog field is a combobox that can add to its catalog; owners and
 * system admins can also rename or hide from it; and the shirt and pants tabs
 * share the catalogs the server says they share.
 */
const catalogs = {
    patterns: [{ id: 1, name: 'แพทเทิร์นมาตรฐาน' }],
    fabrics: [{ id: 2, name: 'ผ้าไมโคร' }],
    fabric_colors: [
        { id: 3, name: 'ขาว' },
        { id: 4, name: 'กรมท่า' },
        { id: 5, name: 'สีเก่าที่ซ่อนแล้ว', active: false },
    ],
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

// The tables the server sends: which catalog each field writes to.
const shirtCatalogKeys = {
    patterns: 'jssport.shirt-patterns',
    fabrics: 'jssport.shirt-fabrics',
    fabric_colors: 'jssport.shirt-fabric-colors',
    neck_styles: 'jssport.shirt-collars',
    neck_colors: 'jssport.shirt-neck-colors',
    collars: 'jssport.shirt-collars',
    placket_styles: 'jssport.shirt-plackets',
    placket_outer_colors: 'jssport.shirt-placket-outer-colors',
    placket_inner_colors: 'jssport.shirt-placket-inner-colors',
    sleeve_cuffs: 'jssport.shirt-cuffs',
    panel_styles: 'jssport.shirt-panels',
    screen_colors: 'jssport.shirt-screen-colors',
    embroidery_colors: 'jssport.shirt-embroidery-colors',
    sublimations: 'jssport.shirt-sublimation',
};
const pantsCatalogKeys = {
    patterns: 'jssport.pants-patterns',
    fabrics: 'jssport.shirt-fabrics',
    fabric_colors: 'jssport.shirt-fabric-colors',
    leg_styles: 'jssport.pants-leg-style',
    leg_cuffs: 'jssport.pants-leg-hem',
    screen_colors: 'jssport.shirt-screen-colors',
    embroidery_colors: 'jssport.shirt-embroidery-colors',
    sublimations: 'jssport.shirt-sublimation',
};

const props = {
    branches: [{ id: 1, name: 'สาขาหนองบัวลำภู', code: '01', phone: null }],
    jobTypes: [{ id: 1, name: 'งานปัก' }],
    shirtCatalogs: catalogs,
    pantsCatalogs: catalogs,
    shirtCatalogKeys,
    pantsCatalogKeys,
    shirtTypes: [{ id: 21, name: 'เสื้อโปโล' }],
    pantsTypes: [{ id: 31, name: 'กางเกงขาสั้น' }],
    kidsSizes: ['JS', 'JM'],
    adultSizes: ['M', 'L'],
    defaultBranchId: 1,
};

const renderForm = (order?: Record<string, unknown>) =>
    render(
        <OrderCreatePage
            {...(props as unknown as PageProps)}
            {...(order ? { order } : {})}
        />,
    );

const asOwner = () => {
    mockPage.props = {
        currentTeam: null,
        auth: { user: { access_role: 'OWNER' } },
    };
};
const asCounter = () => {
    mockPage.props = {
        currentTeam: null,
        auth: { user: { access_role: 'COUNTER' } },
    };
};

const showPantsTab = () =>
    fireEvent.click(screen.getByRole('button', { name: /^แบบกางเกง/ }));

const savedOrder = (shirtSpecs: Record<string, string>) => ({
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
            shirt_specs: { shirt_type_id: '21', ...shirtSpecs },
        },
    },
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    asOwner();
});

describe('spec master data is managed from the form', () => {
    it('makes every catalog field on the shirt tab a combobox that can add', () => {
        renderForm();

        const shirtFields = [
            'แพทเทิร์น',
            'เนื้อผ้า',
            'สีผ้า',
            'แบบคอ',
            'สีแบบคอ',
            'ปก',
            'แบบสาบ',
            'สีสาบ (ใน)',
            'สีสาบ (นอก)',
            'ปลายแขน',
            'สาบนอก',
            'สีสกรีน',
            'สีงานปัก',
            'ซับลิเมชั่น',
        ];

        for (const label of shirtFields) {
            const box = screen.getByLabelText(label);

            expect(box.tagName).toBe('INPUT');
        }

        // One add button per catalog field; the shirt type stays a dropdown.
        expect(
            screen.getAllByRole('button', { name: 'เพิ่มเป็นมาสเตอร์' }).length,
        ).toBeGreaterThanOrEqual(shirtFields.length);
    });

    it('does the same on the pants tab', () => {
        renderForm();
        showPantsTab();

        for (const label of [
            'แพทเทิร์น',
            'เนื้อผ้า',
            'สีผ้า',
            'แบบขา',
            'ปลายขา',
            'สีสกรีน',
            'สีงานปัก',
            'ซับลิเมชั่น',
        ]) {
            expect(screen.getByLabelText(label).tagName).toBe('INPUT');
        }
    });

    it('offers rename and hide to an owner but not to counter staff', () => {
        asCounter();
        renderForm();

        // Adding stays; managing is not offered.
        expect(
            screen.getAllByRole('button', { name: 'เพิ่มเป็นมาสเตอร์' }).length,
        ).toBeGreaterThan(0);
        expect(
            screen.queryByRole('button', { name: /^จัดการรายการ/ }),
        ).toBeNull();

        cleanup();
        asOwner();
        renderForm();

        expect(
            screen.getByRole('button', { name: 'จัดการรายการ แบบคอ' }),
        ).toBeInTheDocument();
    });

    it('shows a saved bill the name of a colour that was hidden since', () => {
        renderForm(savedOrder({ fabric_color_id: '5' }));

        expect(screen.getByLabelText<HTMLInputElement>('สีผ้า').value).toBe(
            'สีเก่าที่ซ่อนแล้ว',
        );
    });

    it('offers a colour added on the pants tab on the shirt tab too', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    item: { id: 99, name: 'เขียวสะท้อนแสง' },
                    created: true,
                }),
            }),
        );

        renderForm();
        showPantsTab();

        const pantsColour = screen.getByLabelText('สีผ้า');
        fireEvent.change(pantsColour, { target: { value: 'เขียวสะท้อนแสง' } });

        // The add button that belongs to this field sits right after it.
        const addButtons = screen.getAllByRole('button', {
            name: 'เพิ่มเป็นมาสเตอร์',
        });
        const pantsColourAdd = addButtons.find((button) =>
            button.parentElement?.contains(pantsColour),
        ) as HTMLElement;
        fireEvent.click(pantsColourAdd);

        await waitFor(() =>
            expect(screen.getByLabelText<HTMLInputElement>('สีผ้า').value).toBe(
                'เขียวสะท้อนแสง',
            ),
        );

        // Back on the shirt tab the same catalog now offers it.
        fireEvent.click(screen.getByRole('button', { name: /^แบบเสื้อ/ }));
        const shirtColour = screen.getByLabelText('สีผ้า');
        fireEvent.change(shirtColour, { target: { value: '' } });
        fireEvent.focus(shirtColour);

        expect(screen.getByText('เขียวสะท้อนแสง')).toBeInTheDocument();
    });

    it('clears a field on either tab whose colour is hidden from the form', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    item: { id: 3, name: 'ขาว', active: false },
                }),
            }),
        );
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        // Both garments in white, then hide white from the shirt tab.
        renderForm(savedOrder({ fabric_color_id: '3' }));
        showPantsTab();
        fireEvent.change(screen.getByLabelText('สีผ้า'), {
            target: { value: '3' },
        });
        fireEvent.click(screen.getByRole('button', { name: /^แบบเสื้อ/ }));

        expect(screen.getByLabelText<HTMLInputElement>('สีผ้า').value).toBe(
            'ขาว',
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'จัดการรายการ สีผ้า' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'ซ่อน ขาว' }));

        // The shirt's colour is cleared, not left pointing at a hidden row...
        await waitFor(() =>
            expect(screen.getByLabelText<HTMLInputElement>('สีผ้า').value).toBe(
                '',
            ),
        );

        // ...and so is the pants', which shares the catalog. The dialog is
        // modal, so it has to be closed before the tab can be reached.
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        showPantsTab();
        expect(screen.getByLabelText<HTMLInputElement>('สีผ้า').value).toBe('');
    });
});
