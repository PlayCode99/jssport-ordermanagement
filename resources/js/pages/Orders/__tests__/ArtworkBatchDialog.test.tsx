import type * as InertiaModuleImport from '@inertiajs/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

/**
 * A bill is cut and printed as one sheet per production batch — garment, size
 * group and length. Most bills use one design across every sheet, so the Art
 * Work dialog opens on exactly that and nothing extra has to be filled in. A
 * bill whose sheets differ switches to the per-batch list, which shows the
 * sheets this bill produces and nothing it does not.
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

const renderForm = (order?: Record<string, unknown>) =>
    render(
        <OrderCreatePage
            {...(props as unknown as PageProps)}
            {...(order ? { order: order as never } : {})}
        />,
    );

const openDialog = () =>
    fireEvent.click(screen.getByRole('button', { name: /จัดการรูป Art Work/ }));

const dialog = () => screen.getByRole('dialog');

/**
 * One sheet's section. Matched on its heading rather than on the label alone,
 * because a pinned image names its sheet again in its own dropdown.
 */
const sheetSection = (label: string): HTMLElement =>
    [...dialog().querySelectorAll('section')].find((section) =>
        section.querySelector('p')?.textContent?.includes(label),
    ) as HTMLElement;

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the Art Work button on Forms 1 and 4', () => {
    it('replaces the garment galleries on the form itself', () => {
        renderForm();

        expect(
            screen.getByRole('button', { name: /จัดการรูป Art Work/ }),
        ).toBeInTheDocument();
        // The galleries are not on the page until the dialog is opened.
        expect(screen.queryByText(/Art Work เสื้อ/)).not.toBeInTheDocument();
    });

    it('is offered once, on the shirt tab only', () => {
        renderForm();

        expect(
            screen.getAllByRole('button', { name: /จัดการรูป Art Work/ }),
        ).toHaveLength(1);

        // The dialog covers both garments, so the trousers tab does not ask
        // for artwork a second time.
        fireEvent.click(screen.getByRole('button', { name: /^แบบกางเกง/ }));

        expect(
            screen.queryByRole('button', { name: /จัดการรูป Art Work/ }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Art Work/)).not.toBeInTheDocument();
    });

    it('counts the artwork already on the bill', () => {
        renderForm({
            id: 9,
            order_code: 'ORD-2026-00009',
            customer_id: 1,
            branch_id: 1,
            customer_name: 'โรงเรียนทดสอบ',
            job_name: 'งานทดสอบ',
            job_type: 'งานปัก',
            billing_date: '2026-09-01',
            due_date: '2026-09-20',
            delivery_method: 'pickup',
            discount_percent: 0,
            deposit_amount: 0,
            payment_method: 'cash',
            items: [],
            shirt_artwork_media: [
                { id: 101, url: 'https://example.test/a.webp', batch: null },
                { id: 102, url: 'https://example.test/b.webp', batch: null },
            ],
            specification: {
                decoded: {
                    schema: 'spec-v2',
                    mode: 'matrix',
                    shirt_specs: { shirt_type_id: '21' },
                },
            },
        });

        expect(screen.getByText(/แนบแล้ว/).textContent).toContain('2');
    });
});

describe('the Art Work dialog', () => {
    it('opens on one design for the whole bill', () => {
        renderForm();
        openDialog();

        // Both garments, one gallery each — the same thing the form used to
        // show inline, and nothing extra to fill in.
        expect(
            within(dialog()).getByText(/Art Work เสื้อ/),
        ).toBeInTheDocument();
        expect(
            within(dialog()).getByText(/Art Work กางเกง/),
        ).toBeInTheDocument();
    });

    it('offers no split while the bill has no sizes typed in yet', () => {
        renderForm();
        openDialog();

        // Nothing is known about the sheets yet, so there is nothing to split.
        expect(
            within(dialog()).queryByRole('radio', { name: 'แยกรูปตามใบงาน' }),
        ).not.toBeInTheDocument();
        expect(
            within(dialog()).getByText(/กรอกตารางไซซ์ก่อน/),
        ).toBeInTheDocument();
    });

    it('lists exactly the sheets the bill produces once sizes are typed in', () => {
        renderForm();
        type('จำนวนเสื้อ แถวที่ 1', '35');
        type('จำนวนกางเกง แถวที่ 1', '35');
        openDialog();

        fireEvent.click(
            within(dialog()).getByRole('radio', { name: 'แยกรูปตามใบงาน' }),
        );

        expect(
            within(dialog()).getByText('เสื้อไซต์เด็ก แขนสั้น'),
        ).toBeInTheDocument();
        expect(
            within(dialog()).getByText('กางเกงเด็ก ขาสั้น'),
        ).toBeInTheDocument();
        // Lengths this bill does not order never appear.
        expect(
            within(dialog()).queryByText('เสื้อไซต์เด็ก แขนยาว'),
        ).not.toBeInTheDocument();
        expect(
            within(dialog()).queryByText('เสื้อไซต์ผู้ใหญ่ แขนสั้น'),
        ).not.toBeInTheDocument();
    });

    it('never calls a sheet empty while an unpinned image covers it', () => {
        renderForm({
            id: 9,
            order_code: 'ORD-2026-00009',
            customer_id: 1,
            branch_id: 1,
            customer_name: 'โรงเรียนทดสอบ',
            job_name: 'งานทดสอบ',
            job_type: 'งานปัก',
            billing_date: '2026-09-01',
            due_date: '2026-09-20',
            delivery_method: 'pickup',
            discount_percent: 0,
            deposit_amount: 0,
            payment_method: 'cash',
            items: [
                {
                    item_type: 'separate_shirt',
                    size_group: 'adults',
                    size_label: 'M',
                    shirt_style: 'short',
                    quantity: 20,
                    unit_price: 100,
                },
                {
                    item_type: 'separate_shirt',
                    size_group: 'adults',
                    size_label: 'L',
                    shirt_style: 'long',
                    quantity: 10,
                    unit_price: 120,
                },
            ],
            shirt_artwork_media: [
                // One pinned to the long sleeves, one pinned to nothing —
                // which means it goes on both sheets.
                {
                    id: 101,
                    url: 'https://example.test/a.webp',
                    batch: 'shirt_adults_long',
                },
                { id: 102, url: 'https://example.test/b.webp', batch: null },
            ],
            specification: {
                decoded: {
                    schema: 'spec-v2',
                    mode: 'matrix',
                    shirt_specs: { shirt_type_id: '21' },
                },
            },
        });

        openDialog();

        const shortSheet = sheetSection('เสื้อไซต์ผู้ใหญ่ แขนสั้น');

        expect(within(shortSheet).queryByText('ยังไม่มีรูป')).toBeNull();
        expect(within(shortSheet).getByText(/ใช้รูปจาก/)).toBeInTheDocument();
        // And the button on the form agrees: nothing is missing.
        expect(screen.queryByText(/ยังไม่มีรูป \d+ ใบงาน/)).toBeNull();
    });

    it('says which sheets would print with no artwork', () => {
        renderForm();
        type('จำนวนเสื้อ แถวที่ 1', '35');
        openDialog();
        fireEvent.click(
            within(dialog()).getByRole('radio', { name: 'แยกรูปตามใบงาน' }),
        );

        expect(within(dialog()).getByText('ยังไม่มีรูป')).toBeInTheDocument();
    });

    it('states the quantity of each sheet, so the counter knows which is which', () => {
        renderForm();
        type('จำนวนเสื้อ แถวที่ 1', '35');
        openDialog();
        fireEvent.click(
            within(dialog()).getByRole('radio', { name: 'แยกรูปตามใบงาน' }),
        );

        expect(within(dialog()).getByText('35 ตัว')).toBeInTheDocument();
    });

    it('lets a saved image be limited to one sheet, and put back on all of them', () => {
        renderForm({
            id: 9,
            order_code: 'ORD-2026-00009',
            customer_id: 1,
            branch_id: 1,
            customer_name: 'โรงเรียนทดสอบ',
            job_name: 'งานทดสอบ',
            job_type: 'งานปัก',
            billing_date: '2026-09-01',
            due_date: '2026-09-20',
            delivery_method: 'pickup',
            discount_percent: 0,
            deposit_amount: 0,
            payment_method: 'cash',
            items: [
                {
                    item_type: 'separate_shirt',
                    size_group: 'adults',
                    size_label: 'M',
                    shirt_style: 'short',
                    quantity: 20,
                    unit_price: 100,
                },
                {
                    item_type: 'separate_shirt',
                    size_group: 'adults',
                    size_label: 'L',
                    shirt_style: 'long',
                    quantity: 10,
                    unit_price: 120,
                },
            ],
            shirt_artwork_media: [
                {
                    id: 101,
                    url: 'https://example.test/a.webp',
                    batch: 'shirt_adults_long',
                },
            ],
            specification: {
                decoded: {
                    schema: 'spec-v2',
                    mode: 'matrix',
                    shirt_specs: { shirt_type_id: '21' },
                },
            },
        });

        openDialog();

        // A bill that already pins an image opens on the per-batch list, and
        // the image sits under the sheet it belongs to.
        const longSheet = sheetSection('เสื้อไซต์ผู้ใหญ่ แขนยาว');

        expect(
            within(longSheet).getByRole('img', { name: /Art Work เสื้อ/ }),
        ).toBeInTheDocument();

        // The short-sleeve sheet has nothing, and says so.
        const shortSheet = sheetSection('เสื้อไซต์ผู้ใหญ่ แขนสั้น');

        expect(within(shortSheet).getByText('ยังไม่มีรูป')).toBeInTheDocument();
    });

    it('unpins everything when the bill goes back to one design', () => {
        renderForm({
            id: 9,
            order_code: 'ORD-2026-00009',
            customer_id: 1,
            branch_id: 1,
            customer_name: 'โรงเรียนทดสอบ',
            job_name: 'งานทดสอบ',
            job_type: 'งานปัก',
            billing_date: '2026-09-01',
            due_date: '2026-09-20',
            delivery_method: 'pickup',
            discount_percent: 0,
            deposit_amount: 0,
            payment_method: 'cash',
            items: [
                {
                    item_type: 'separate_shirt',
                    size_group: 'adults',
                    size_label: 'M',
                    shirt_style: 'short',
                    quantity: 20,
                    unit_price: 100,
                },
            ],
            shirt_artwork_media: [
                {
                    id: 101,
                    url: 'https://example.test/a.webp',
                    batch: 'shirt_adults_short',
                },
            ],
            specification: {
                decoded: {
                    schema: 'spec-v2',
                    mode: 'matrix',
                    shirt_specs: { shirt_type_id: '21' },
                },
            },
        });

        openDialog();
        fireEvent.click(
            within(dialog()).getByRole('radio', {
                name: 'ใช้รูปเดียวกันทุกใบ',
            }),
        );

        // The image stays on the bill; it simply goes on every sheet again.
        expect(
            within(dialog()).getByRole('img', { name: /Art Work เสื้อ/ }),
        ).toBeInTheDocument();
        expect(
            within(dialog()).queryByText('ยังไม่มีรูป'),
        ).not.toBeInTheDocument();
    });
});

/**
 * All four forms take their artwork the same way: one dialog, pinned to the
 * sheets the bill will produce. Forms 2 and 3 used to keep a gallery of their
 * own on the form instead, which put every picture on every sheet — a bill
 * with both short and long sleeves had no way to say which was which.
 */
describe('every form takes its artwork through the one dialog', () => {
    it.each([
        ['แพทเทรินเสื้อเหมือนกัน (Form 1)', /^แพทเทรินเสื้อเหมือนกัน/],
        ['รายตัว (Form 2)', /^รายตัว/],
        ['กีฬาสี (Form 3)', /^กีฬาสี/],
        ['ชุดพละ (Form 4)', /^ชุดพละ/],
    ])(
        'offers %s the Art Work dialog and no gallery of its own',
        (_name, tab) => {
            renderForm();
            fireEvent.click(screen.getByRole('button', { name: tab }));

            expect(
                screen.getByRole('button', { name: /จัดการรูป Art Work/ }),
            ).toBeInTheDocument();
            expect(
                screen.queryByText('Art Work เสื้อ'),
            ).not.toBeInTheDocument();

            // The trousers tab does not ask for artwork a second time either.
            fireEvent.click(screen.getByRole('button', { name: /^แบบกางเกง/ }));

            expect(
                screen.queryByText('Art Work กางเกง'),
            ).not.toBeInTheDocument();
        },
    );
});
