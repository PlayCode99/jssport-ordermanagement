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

/**
 * A bill carrying one picture pinned to no sheet. Forms 1 and 4 do not take
 * artwork that way any more — every table takes its own — so this is the one
 * state in which the bill-level dialog is still offered: to see what an older
 * bill is carrying and move it onto the sheets it belongs to.
 */
const billWithUnpinnedArtwork = (
    over: Record<string, unknown> = {},
): Record<string, unknown> => ({
    id: 9,
    order_code: 'ORD-2026-00009',
    customer_id: 1,
    branch_id: 1,
    customer_name: 'โรงเรียนทดสอบ',
    job_name: 'งานทดสอบ',
    job_type: 'งานปัก',
    billing_date: '2026-09-01',
    billing_time: '10:00',
    due_date: '2026-09-20',
    delivery_method: 'pickup',
    discount_percent: 0,
    deposit_amount: 0,
    payment_method: 'cash',
    // A shirt table and a trouser table to carry the sheets, so the dialog has
    // something to pin the stray picture onto.
    items: [
        {
            item_type: 'separate_shirt',
            size_group: 'kids',
            size_tier: 'kids',
            size_label: 'JS',
            shirt_style: 'short',
            quantity: 0,
            unit_price: 0,
        },
        {
            item_type: 'separate_pants',
            size_group: 'kids',
            size_tier: 'kids',
            size_label: 'JS',
            pants_style: 'short',
            quantity: 0,
            unit_price: 0,
        },
    ],
    shirt_artwork_media: [
        { id: 900, url: 'https://example.test/legacy.webp', batch: null },
    ],
    specification: {
        decoded: { schema: 'spec-v2', mode: 'matrix' },
    },
    ...over,
});

/** The dialog is only reachable while the bill still has unpinned artwork. */
const renderFormWithDialog = (order?: Record<string, unknown>) =>
    renderForm(order ?? billWithUnpinnedArtwork());

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
    it('is not offered at all on a bill with nothing left unpinned', () => {
        renderForm();

        // Every table takes its own pictures, so there is nothing to attach at
        // bill level and no reason to send the counter to a dialog for it.
        expect(
            screen.queryByRole('button', { name: /จัดการรูป Art Work/ }),
        ).not.toBeInTheDocument();
        // Nor is the old per-garment gallery anywhere on the form.
        expect(screen.queryByText(/^Art Work เสื้อ$/)).not.toBeInTheDocument();
    });

    it('is offered once while the bill still carries unpinned artwork', () => {
        renderFormWithDialog();

        expect(
            screen.getAllByRole('button', { name: /จัดการรูป Art Work/ }),
        ).toHaveLength(1);
    });

    it('gives every table a gallery of its own, named after its sheet', () => {
        renderForm();

        // The bill opens on a shirt table and a trouser table, each taking the
        // artwork for its own sheet — no batch for the counter to choose,
        // because the table it sits under already says which sheet it is.
        expect(
            screen.getByText('Art Work · ตารางเสื้อไซซ์เด็ก · แขนสั้น'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Art Work · ตารางกางเกงไซซ์เด็ก · ขาสั้น'),
        ).toBeInTheDocument();
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
        renderFormWithDialog();
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
        renderFormWithDialog();
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
        renderFormWithDialog();
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

    /**
     * A sheet with no artwork used to be called out inside the dialog. On
     * Forms 1 and 4 the gallery now sits on the sheet's own table, so the gap
     * is visible without opening anything — which is the whole reason the
     * dialog stopped being the way in.
     */
    it('says on the table itself when a sheet has no artwork', () => {
        renderForm();

        expect(screen.getAllByText('ยังไม่ได้แนบรูป').length).toBeGreaterThan(
            0,
        );
    });

    it('states the quantity of each sheet, so the counter knows which is which', () => {
        renderFormWithDialog();
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
                // Pinned to nothing, which is what still opens the dialog.
                {
                    id: 102,
                    url: 'https://example.test/loose.webp',
                    batch: null,
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
                // Pinned to nothing, which is what still opens the dialog.
                {
                    id: 102,
                    url: 'https://example.test/loose.webp',
                    batch: null,
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

        // Both images stay on the bill; they simply go on every sheet again —
        // the one that was pinned to the short sleeves, and the one that never
        // was pinned at all.
        expect(
            within(dialog()).getAllByRole('img', { name: /Art Work เสื้อ/ }),
        ).toHaveLength(2);
        expect(
            within(dialog()).queryByText('ยังไม่มีรูป'),
        ).not.toBeInTheDocument();
    });
});

/**
 * Every form pins artwork to the sheets the bill will produce, and none of them
 * keeps the old per-garment gallery that put every picture on every sheet —
 * a bill with both short and long sleeves had no way to say which was which.
 *
 * Forms 2 and 3 sell one garment spec for the whole bill, so the dialog is the
 * only place they take pictures. Forms 1 and 4 also take them table by table,
 * which pins them without anyone having to choose a batch.
 */
describe('every form takes its artwork pinned to a sheet', () => {
    it('gives each รายตัว (Form 2) sheet a gallery of its own, as Form 1 does a table', () => {
        renderForm();
        fireEvent.click(screen.getByRole('button', { name: /^รายตัว/ }));
        fireEvent.change(screen.getByLabelText('สกรีนชื่อคนที่ 1'), {
            target: { value: 'สมชาย' },
        });

        expect(
            screen.getByText('Art Work · เสื้อผู้ใหญ่ · แขนสั้น'),
        ).toBeInTheDocument();
        // Nothing pinned to no sheet, so no bill-level dialog either.
        expect(
            screen.queryByRole('button', { name: /จัดการรูป Art Work/ }),
        ).not.toBeInTheDocument();
    });

    it('keeps the dialog on รายตัว (Form 2) for a picture pinned to no sheet', () => {
        renderFormWithDialog();
        fireEvent.click(screen.getByRole('button', { name: /^รายตัว/ }));

        expect(
            screen.getByRole('button', { name: /จัดการรูป Art Work/ }),
        ).toBeInTheDocument();
    });

    it.each([['กีฬาสี (Form 3)', /^กีฬาสี/]])(
        'offers %s the dialog and no gallery of its own',
        (_name, tab) => {
            renderFormWithDialog();
            fireEvent.click(screen.getByRole('button', { name: tab }));

            expect(
                screen.getByRole('button', { name: /จัดการรูป Art Work/ }),
            ).toBeInTheDocument();

            // No spec, opened, asks for artwork a second time. Form 3 sells
            // shirts only, so it has no trousers spec to open.
            fireEvent.click(screen.getByRole('button', { name: /^สเปกเสื้อ/ }));
            const pantsSpec = screen.queryByRole('button', {
                name: /^สเปกกางเกง/,
            });

            if (pantsSpec) {
                fireEvent.click(pantsSpec);
            }

            expect(
                screen.queryByText('Art Work เสื้อ'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('Art Work กางเกง'),
            ).not.toBeInTheDocument();
        },
    );

    it.each([
        ['แพทเทรินเสื้อเหมือนกัน (Form 1)', /^แพทเทรินเสื้อเหมือนกัน/],
        ['ชุดพละ (Form 4)', /^ชุดพละ/],
    ])('offers %s both the dialog and a gallery per table', (_name, tab) => {
        renderFormWithDialog();
        fireEvent.click(screen.getByRole('button', { name: tab }));

        expect(
            screen.getByRole('button', { name: /จัดการรูป Art Work/ }),
        ).toBeInTheDocument();
        // Named after the sheet, never the bare garment: the old
        // "Art Work เสื้อ" meant every shirt sheet at once.
        expect(screen.queryByText('Art Work เสื้อ')).not.toBeInTheDocument();
        expect(
            screen.getByText('Art Work · ตารางเสื้อไซซ์เด็ก · แขนสั้น'),
        ).toBeInTheDocument();
    });
});
