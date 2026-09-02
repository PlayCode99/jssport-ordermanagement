import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { Order } from '@/types/models';

const { mockRouterGet, mockRouterReload } = vi.hoisted(() => ({
    mockRouterGet: vi.fn(),
    mockRouterReload: vi.fn(),
}));

const mockPage = vi.hoisted(() => ({
    props: {} as Record<string, unknown>,
    url: '/production/embroidery',
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    router: {
        get: mockRouterGet,
        reload: mockRouterReload,
    },
    usePage: () => mockPage,
}));

const makePricingSummary = (grandTotal = 20) => ({
    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
    pants_components: [],
    child_unit_total: 10,
    adult_unit_total: 20,
    pants_child_unit_total: 0,
    pants_adult_unit_total: 0,
    child_total: 0,
    adult_total: grandTotal,
    pants_child_total: 0,
    pants_adult_total: 0,
    grand_total: grandTotal,
});

const makeSpecOrder = (id: number): Order => ({
    id,
    order_code: `ORD-${id}`,
    job_name: `Spec Order ${id}`,
    job_type: 'งานปัก',
    order_status: 'in_production',
    order_date: '2026-08-01',
    due_date: '2026-08-05',
    branch: { branch_name: 'สาขา 1' },
    customer: { customer_name: `ลูกค้า ${id}` },
    creator_user: { name: `ผู้สร้าง ${id}` },
    items: [{ item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 1 }],
    receipts: [],
    status_histories: [],
    routings: [
        {
            id: id * 100,
            station_name: 'embroidery',
            is_required: true,
            status: 'pending',
            created_at: '2026-08-01T10:00:00.000000Z',
            updated_at: '2026-08-01T10:00:00.000000Z',
            started_at: null,
            completed_at: null,
        },
    ],
}) as Order;

describe('production board timeline sync', () => {
    it('renders 4 grouped sections in the detail dialog when all shirt/pants kid/adult data exists', () => {
        mockPage.props = {
            productionPricingMap: {
                '61': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 10,
                    adult_unit_total: 20,
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                    child_total: 20,
                    adult_total: 60,
                    pants_child_total: 20,
                    pants_adult_total: 15,
                    grand_total: 115,
                },
            },
        };

        const order = {
            id: 61,
            order_code: 'ORD-061',
            job_name: 'Full Group Order',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 61' },
            creator_user: { name: 'ผู้สร้าง 61' },
            items: [
                { item_type: 'shirt', size_group: 'kids', size_label: 'JM', quantity: 2 },
                { item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 3 },
                { item_type: 'pants', size_group: 'kids', size_label: 'JL', quantity: 4 },
                { item_type: 'pants', size_group: 'oversize', size_label: '2XL', quantity: 1 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 6101,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(screen.getByText('เสื้อไซต์เด็ก')).toBeInTheDocument();
        expect(screen.getAllByText('เสื้อไซต์ผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.getByText('กางเกงเด็ก')).toBeInTheDocument();
        expect(screen.getByText('กางเกงผู้ใหญ่')).toBeInTheDocument();

        const printPages = document.querySelectorAll('.p-print-page');
        expect(printPages.length).toBe(4);
        expect(document.querySelectorAll('.p-yellow-head').length).toBeGreaterThan(0);
        expect(screen.getAllByText('รายการ').length).toBeGreaterThan(0);
        expect(screen.getAllByText('ผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.getAllByText('subtotal').length).toBe(4);
        expect(screen.getAllByText(/วิธีคิดคำนวณเงิน/).length).toBe(4);
        expect(screen.getAllByText('20.00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('15.00').length).toBeGreaterThan(0);
        expect(screen.queryByText(/หน้า\s*\d+\s*\/\s*\d+/)).not.toBeInTheDocument();
        expect(screen.queryByText(/พิมพ์:/)).not.toBeInTheDocument();
        expect(screen.queryByText('ชื่อช่าง')).not.toBeInTheDocument();
        expect(screen.getAllByText(/ผู้ตรวจสอบ/).length).toBeGreaterThan(0);

        const normalizedMarkup = (document.querySelector('.p-sheet')?.innerHTML ?? '')
            .replace(/พิมพ์: [^<]+/g, 'พิมพ์: <TIME>')
            .replace(/หน้า \d+ \/ \d+/g, 'หน้า <P> / <N>');
        expect(normalizedMarkup).toMatchSnapshot();
    });

    it('renders four groups for generic garment items when both shirt and pants specs exist', () => {
        mockPage.props = {
            productionPricingMap: {
                '82': {
                    components: [{ name: 'เสื้อคอวี', child_price: 5, adult_price: 8 }],
                    pants_components: [
                        { name: 'ใส่เชือก', child_price: 10, adult_price: 30 },
                        { name: 'ทดสอบ', child_price: 10, adult_price: 15 },
                    ],
                    child_unit_total: 5,
                    adult_unit_total: 8,
                    pants_child_unit_total: 20,
                    pants_adult_unit_total: 45,
                    child_total: 100,
                    adult_total: 480,
                    pants_child_total: 400,
                    pants_adult_total: 2700,
                    grand_total: 3680,
                },
            },
        };

        const order = {
            id: 82,
            order_code: 'ORD-2026-00020',
            job_name: 'ชุดพละภาคค้อ',
            job_type: 'ปัก+สกรีน เฟล๊กซ์',
            order_status: 'in_production',
            order_date: '2026-08-15',
            due_date: '2026-08-31',
            branch: { branch_name: 'เมืองเลย' },
            customer: { customer_name: 'ผอ อุดมร์' },
            creator_user: { name: 'ส้มโอ03' },
            items: [
                { item_type: 'garment', size_group: 'kids', size_label: 'JM', quantity: 10 },
                { item_type: 'garment', size_group: 'kids', size_label: 'JS', quantity: 10 },
                { item_type: 'garment', size_group: 'adults', size_label: 'L', quantity: 20 },
                { item_type: 'garment', size_group: 'adults', size_label: 'M', quantity: 20 },
                { item_type: 'garment', size_group: 'adults', size_label: 'S', quantity: 20 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 8201,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-15T07:25:56.000000Z',
                    updated_at: '2026-08-15T07:25:56.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                specSectionsMap={{
                    '82': {
                        shirt: [
                            { label: 'แพทเทิร์น', value: 'เสื้อแพทเทิร์น' },
                            { label: 'เนื้อผ้า', value: 'ผ้าเสื้อ' },
                        ],
                        pants: [
                            { label: 'แพทเทิร์น', value: 'กางเกงแพทเทิร์น' },
                            { label: 'เนื้อผ้า', value: 'ผ้ากางเกง' },
                        ],
                    },
                }}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(4);
        expect(screen.getAllByText('เสื้อไซต์เด็ก').length).toBeGreaterThan(0);
        expect(screen.getAllByText('เสื้อไซต์ผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.getAllByText('กางเกงเด็ก').length).toBeGreaterThan(0);
        expect(screen.getAllByText('กางเกงผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.getByText('20 x 20.00 = 400.00')).toBeInTheDocument();
        expect(screen.getByText('60 x 45.00 = 2,700.00')).toBeInTheDocument();
    });

    it('does not render pants sections when order has no real pants data', () => {
        mockPage.props = {
            productionPricingMap: {
                '83': makePricingSummary(100),
            },
        };

        const order = {
            id: 83,
            order_code: 'ORD-083',
            job_name: 'No Pants Data',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-15',
            due_date: '2026-08-20',
            branch: { branch_name: 'เมืองเลย' },
            customer: { customer_name: 'ลูกค้า 83' },
            creator_user: { name: 'ผู้สร้าง 83' },
            items: [
                { item_type: 'garment', size_group: 'adults', size_label: 'M', quantity: 5 },
            ],
            specification: {
                screen_print_detail: JSON.stringify({
                    shirt_specs: {
                        fabric_id: 'FAB-SHIRT-1',
                    },
                }),
            },
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 8301,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-15T07:25:56.000000Z',
                    updated_at: '2026-08-15T07:25:56.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                specSectionsMap={{
                    '83': {
                        shirt: [{ label: 'เนื้อผ้า', value: 'ผ้าเสื้อ' }],
                        pants: [],
                    },
                }}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(1);
        expect(screen.getAllByText('เสื้อไซต์ผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.queryByText('กางเกงเด็ก')).not.toBeInTheDocument();
        expect(screen.queryByText('กางเกงผู้ใหญ่')).not.toBeInTheDocument();
        expect(screen.queryByText('กางเกง', { selector: 'h4' })).not.toBeInTheDocument();
    });

    it('renders Form 2 screen names, numbers, sizes, and quantities in the production document', () => {
        mockPage.props = {
            productionPricingMap: {
                '901': makePricingSummary(60),
            },
        };

        const order = {
            ...makeSpecOrder(901),
            items: [{ item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 3 }],
            specification: {
                screen_print_detail: JSON.stringify({
                    mode: 'individual',
                    personalization_rows: [
                        { name: 'สมชาย', number: '10', size: 'M', quantity: 1 },
                        { name: 'สมหญิง', number: '25', size: 'L', quantity: 2 },
                    ],
                }),
            },
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        const personalizationTable = document.querySelector('.p-personalization-table');

        expect(document.querySelectorAll('.p-print-page')).toHaveLength(2);
        expect(personalizationTable).not.toBeNull();
        expect(personalizationTable).toHaveTextContent('สกรีนชื่อ');
        expect(personalizationTable).toHaveTextContent('สมชาย');
        expect(personalizationTable).toHaveTextContent('10');
        expect(personalizationTable).toHaveTextContent('M');
        expect(personalizationTable).toHaveTextContent('สมหญิง');
        expect(personalizationTable).toHaveTextContent('25');
        expect(personalizationTable).toHaveTextContent('L');
        expect(personalizationTable).toHaveTextContent('รวม');
        expect(personalizationTable).toHaveTextContent('3');
        expect(document.querySelectorAll('.p-size-bar')).toHaveLength(0);
    });

    it('renders only one job when only shirt adults has real data', () => {
        mockPage.props = {
            productionPricingMap: {
                '84': makePricingSummary(60),
            },
        };

        const order = {
            ...makeSpecOrder(84),
            order_code: 'ORD-084',
            items: [
                { item_type: 'shirt', size_group: 'adults', size_label: 'L', quantity: 3 },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(1);
        expect(screen.getAllByText('เสื้อไซต์ผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.queryByText('กางเกงเด็ก')).not.toBeInTheDocument();
        expect(screen.queryByText('กางเกงผู้ใหญ่')).not.toBeInTheDocument();
    });

    it('does not render pants when pants quantities are all zero', () => {
        mockPage.props = {
            productionPricingMap: {
                '85': {
                    ...makePricingSummary(40),
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                },
            },
        };

        const order = {
            ...makeSpecOrder(85),
            order_code: 'ORD-085',
            items: [
                { item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 2 },
                { item_type: 'pants', size_group: 'adults', size_label: 'L', quantity: 0 },
                { item_type: 'pants', size_group: 'kids', size_label: 'JM', quantity: 0 },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(1);
        expect(screen.queryByText('กางเกงเด็ก')).not.toBeInTheDocument();
        expect(screen.queryByText('กางเกงผู้ใหญ่')).not.toBeInTheDocument();
    });

    it('renders pants when at least one pants size has quantity greater than zero', () => {
        mockPage.props = {
            productionPricingMap: {
                '86': {
                    ...makePricingSummary(15),
                    components: [],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 0,
                    adult_unit_total: 0,
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 0,
                    pants_child_total: 15,
                    pants_adult_total: 0,
                    grand_total: 15,
                },
            },
        };

        const order = {
            ...makeSpecOrder(86),
            order_code: 'ORD-086',
            items: [
                { item_type: 'pants', size_group: 'kids', size_label: 'JM', quantity: 3 },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(1);
        expect(screen.getAllByText('กางเกงเด็ก').length).toBeGreaterThan(0);
    });

    it('keeps dialog group count equal to pdf page count', () => {
        mockPage.props = {
            productionPricingMap: {
                '87': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 0,
                    adult_unit_total: 20,
                    pants_child_unit_total: 0,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 80,
                    pants_child_total: 0,
                    pants_adult_total: 45,
                    grand_total: 125,
                },
            },
        };

        const order = {
            ...makeSpecOrder(87),
            order_code: 'ORD-087',
            items: [
                { item_type: 'shirt', size_group: 'adults', size_label: 'L', quantity: 4 },
                { item_type: 'pants', size_group: 'adults', size_label: 'L', quantity: 3 },
            ],
        } as Order;

        const { container } = render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        const pageCount = document.querySelectorAll('.p-print-page').length;
        const summaryLabel = screen.getByText(/สรุปตามกลุ่มการผลิต/).textContent ?? '';
        const summaryCount = Number(summaryLabel.match(/(\d+)\s*กลุ่ม/)?.[1] ?? '0');

        expect(summaryCount).toBe(pageCount);
    });

    it('keeps four real groups visible when all shirt and pants groups have data', () => {
        mockPage.props = {
            productionPricingMap: {
                '88': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 10,
                    adult_unit_total: 20,
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                    child_total: 20,
                    adult_total: 60,
                    pants_child_total: 20,
                    pants_adult_total: 45,
                    grand_total: 145,
                },
            },
        };

        const order = {
            ...makeSpecOrder(88),
            order_code: 'ORD-088',
            items: [
                { item_type: 'shirt', size_group: 'kids', size_label: 'JM', quantity: 2 },
                { item_type: 'shirt', size_group: 'adults', size_label: 'L', quantity: 3 },
                { item_type: 'pants', size_group: 'kids', size_label: 'JL', quantity: 4 },
                { item_type: 'pants', size_group: 'adults', size_label: 'M', quantity: 3 },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(4);
        expect(screen.getAllByText('เสื้อไซต์เด็ก').length).toBeGreaterThan(0);
        expect(screen.getAllByText('เสื้อไซต์ผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.getAllByText('กางเกงเด็ก').length).toBeGreaterThan(0);
        expect(screen.getAllByText('กางเกงผู้ใหญ่').length).toBeGreaterThan(0);
    });

    it('renders only one print page when only one production group has data', () => {
        mockPage.props = {
            productionPricingMap: {
                '62': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 10,
                    adult_unit_total: 20,
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 80,
                    pants_child_total: 0,
                    pants_adult_total: 0,
                    grand_total: 80,
                },
            },
        };

        const singleGroupOrder = {
            id: 62,
            order_code: 'ORD-062',
            job_name: 'Single Group Order',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 62' },
            creator_user: { name: 'ผู้สร้าง 62' },
            items: [
                { item_type: 'shirt', size_group: 'adults', size_label: 'L', quantity: 4 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 6201,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        const { container } = render(
            <ProductionBoardPage
                orders={[singleGroupOrder]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(1);
        expect(screen.getAllByText('เสื้อไซต์ผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.queryByText('กางเกงเด็ก')).not.toBeInTheDocument();
        expect(screen.getAllByText('ผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.queryByText('เด็ก')).not.toBeInTheDocument();
        expect(screen.getByText('วิธีคิดคำนวณเงิน (ผู้ใหญ่)')).toBeInTheDocument();
        expect(screen.queryByText('วิธีคิดคำนวณเงิน (เด็ก)')).not.toBeInTheDocument();
        expect(screen.getByText('4 x 20.00 = 80.00')).toBeInTheDocument();
        expect(screen.getByText('จำนวน 0 โหล')).toBeInTheDocument();
    });

    it('renders only child calculation row for child-only documents and computes dozen by floor rule', () => {
        mockPage.props = {
            productionPricingMap: {
                '63': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [],
                    child_unit_total: 10,
                    adult_unit_total: 20,
                    pants_child_unit_total: 0,
                    pants_adult_unit_total: 0,
                    child_total: 110,
                    adult_total: 0,
                    pants_child_total: 0,
                    pants_adult_total: 0,
                    grand_total: 110,
                },
            },
        };

        const childOnlyOrder = {
            id: 63,
            order_code: 'ORD-063',
            job_name: 'Child Group Order',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 63' },
            creator_user: { name: 'ผู้สร้าง 63' },
            items: [
                { item_type: 'shirt', size_group: 'kids', size_label: 'JM', quantity: 11 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 6301,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[childOnlyOrder]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(screen.getAllByText('เด็ก').length).toBeGreaterThan(0);
        expect(screen.queryByText('ผู้ใหญ่')).not.toBeInTheDocument();
        expect(screen.getByText('วิธีคิดคำนวณเงิน (เด็ก)')).toBeInTheDocument();
        expect(screen.queryByText('วิธีคิดคำนวณเงิน (ผู้ใหญ่)')).not.toBeInTheDocument();
        expect(screen.getByText('11 x 10.00 = 110.00')).toBeInTheDocument();
        expect(screen.getByText('จำนวน 0 โหล')).toBeInTheDocument();
    });

    it('renders one page for pants kids only and uses only the child pricing column', () => {
        mockPage.props = {
            productionPricingMap: {
                '65': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 0,
                    adult_unit_total: 0,
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 0,
                    pants_child_total: 30,
                    pants_adult_total: 0,
                    grand_total: 30,
                },
            },
        };

        const pantsKidsOrder = {
            id: 65,
            order_code: 'ORD-065',
            job_name: 'Pants Kids Order',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 65' },
            creator_user: { name: 'ผู้สร้าง 65' },
            items: [
                { item_type: 'pants', size_group: 'kids', size_label: 'JL', quantity: 6 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 6501,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[pantsKidsOrder]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(1);
        expect(screen.getAllByText('กางเกงเด็ก').length).toBeGreaterThan(0);
        expect(screen.queryByText('เสื้อไซต์เด็ก')).not.toBeInTheDocument();
        expect(screen.queryByText('เสื้อไซต์ผู้ใหญ่')).not.toBeInTheDocument();
        expect(screen.queryByText('กางเกงผู้ใหญ่')).not.toBeInTheDocument();
        expect(screen.getAllByText('เด็ก').length).toBeGreaterThan(0);
        expect(screen.queryByText('ผู้ใหญ่')).not.toBeInTheDocument();
        expect(screen.getByText('6 x 5.00 = 30.00')).toBeInTheDocument();
        expect(screen.getByText('จำนวน 0 โหล')).toBeInTheDocument();
    });

    it('renders one page for pants adults only and uses only the adult pricing column', () => {
        mockPage.props = {
            productionPricingMap: {
                '66': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 0,
                    adult_unit_total: 0,
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 0,
                    pants_child_total: 0,
                    pants_adult_total: 105,
                    grand_total: 105,
                },
            },
        };

        const pantsAdultsOrder = {
            id: 66,
            order_code: 'ORD-066',
            job_name: 'Pants Adults Order',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 66' },
            creator_user: { name: 'ผู้สร้าง 66' },
            items: [
                { item_type: 'pants', size_group: 'oversize', size_label: '2XL', quantity: 7 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 6601,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[pantsAdultsOrder]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(1);
        expect(screen.getAllByText('กางเกงผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.queryByText('กางเกงเด็ก')).not.toBeInTheDocument();
        expect(screen.queryByText('เสื้อไซต์เด็ก')).not.toBeInTheDocument();
        expect(screen.queryByText('เสื้อไซต์ผู้ใหญ่')).not.toBeInTheDocument();
        expect(screen.getAllByText('ผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.queryByText('เด็ก')).not.toBeInTheDocument();
        expect(screen.getByText('7 x 15.00 = 105.00')).toBeInTheDocument();
        expect(screen.getByText('จำนวน 0 โหล')).toBeInTheDocument();
    });

    it('renders two pages for pants kids and adults when both groups have data', () => {
        mockPage.props = {
            productionPricingMap: {
                '67': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 0,
                    adult_unit_total: 0,
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 0,
                    pants_child_total: 20,
                    pants_adult_total: 45,
                    grand_total: 65,
                },
            },
        };

        const pantsTwoGroupsOrder = {
            id: 67,
            order_code: 'ORD-067',
            job_name: 'Pants Two Groups Order',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 67' },
            creator_user: { name: 'ผู้สร้าง 67' },
            items: [
                { item_type: 'pants', size_group: 'kids', size_label: 'JM', quantity: 4 },
                { item_type: 'pants', size_group: 'adults', size_label: 'L', quantity: 3 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 6701,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[pantsTwoGroupsOrder]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(2);
        expect(screen.getAllByText('กางเกงเด็ก').length).toBeGreaterThan(0);
        expect(screen.getAllByText('กางเกงผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.queryByText('เสื้อไซต์เด็ก')).not.toBeInTheDocument();
        expect(screen.queryByText('เสื้อไซต์ผู้ใหญ่')).not.toBeInTheDocument();
        expect(screen.getByText('4 x 5.00 = 20.00')).toBeInTheDocument();
        expect(screen.getByText('3 x 15.00 = 45.00')).toBeInTheDocument();
    });

    it('does not render empty groups when quantities are zero', () => {
        mockPage.props = {
            productionPricingMap: {
                '68': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 10,
                    adult_unit_total: 20,
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 80,
                    pants_child_total: 0,
                    pants_adult_total: 0,
                    grand_total: 80,
                },
            },
        };

        const zeroQtyOrder = {
            id: 68,
            order_code: 'ORD-068',
            job_name: 'Zero Quantity Guard',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 68' },
            creator_user: { name: 'ผู้สร้าง 68' },
            items: [
                { item_type: 'shirt', size_group: 'adults', size_label: 'L', quantity: 4 },
                { item_type: 'shirt', size_group: 'kids', size_label: 'JM', quantity: 0 },
                { item_type: 'pants', size_group: 'kids', size_label: 'JL', quantity: 0 },
                { item_type: 'pants', size_group: 'adults', size_label: 'M', quantity: 0 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 6801,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[zeroQtyOrder]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(document.querySelectorAll('.p-print-page').length).toBe(1);
        expect(screen.getAllByText('เสื้อไซต์ผู้ใหญ่').length).toBeGreaterThan(0);
        expect(screen.queryByText('เสื้อไซต์เด็ก')).not.toBeInTheDocument();
        expect(screen.queryByText('กางเกงเด็ก')).not.toBeInTheDocument();
        expect(screen.queryByText('กางเกงผู้ใหญ่')).not.toBeInTheDocument();
    });

    it('uses shirt and pants artwork by group when all artwork sources exist', () => {
        mockPage.props = {
            productionPricingMap: {
                '69': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 0,
                    adult_unit_total: 20,
                    pants_child_unit_total: 0,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 80,
                    pants_child_total: 0,
                    pants_adult_total: 45,
                    grand_total: 125,
                },
            },
        };

        const order = {
            id: 69,
            order_code: 'ORD-069',
            job_name: 'Artwork Mapping Full',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            artwork_url: 'https://example.com/general-art.webp',
            shirt_artwork_url: 'https://example.com/shirt-art.webp',
            pants_artwork_url: 'https://example.com/pants-art.webp',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 69' },
            creator_user: { name: 'ผู้สร้าง 69' },
            items: [
                { item_type: 'shirt', size_group: 'adults', size_label: 'L', quantity: 4 },
                { item_type: 'pants', size_group: 'adults', size_label: 'L', quantity: 3 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 6901,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        const shirtArtwork = screen.getByAltText('เสื้อไซต์ผู้ใหญ่-artwork-1');
        const pantsArtwork = screen.getByAltText('กางเกงผู้ใหญ่-artwork-1');

        expect(shirtArtwork.getAttribute('src')).toBe('https://example.com/shirt-art.webp');
        expect(pantsArtwork.getAttribute('src')).toBe('https://example.com/pants-art.webp');
    });

    it('counts every uploaded shirt and pants artwork image in the attached-images gallery', () => {
        mockPage.props = {
            productionPricingMap: {
                '71': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 0,
                    adult_unit_total: 20,
                    pants_child_unit_total: 0,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 80,
                    pants_child_total: 0,
                    pants_adult_total: 45,
                    grand_total: 125,
                },
            },
        };

        const order = {
            id: 71,
            order_code: 'ORD-071',
            job_name: 'Artwork Gallery Count',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            artwork_url: null,
            shirt_artwork_urls: ['https://example.com/shirt-art-1.webp', 'https://example.com/shirt-art-2.webp'],
            pants_artwork_urls: ['https://example.com/pants-art-1.webp'],
            reference_designs: ['https://example.com/reference-1.webp'],
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 71' },
            creator_user: { name: 'ผู้สร้าง 71' },
            items: [
                { item_type: 'shirt', size_group: 'adults', size_label: 'L', quantity: 4 },
                { item_type: 'pants', size_group: 'adults', size_label: 'L', quantity: 3 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 7101,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as unknown as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(screen.getByText('รูปที่แนบทั้งหมด 4 รูป')).toBeInTheDocument();
    });

    it('falls back shirt section artwork to general artwork when shirt artwork is missing', () => {
        mockPage.props = {
            productionPricingMap: {
                '70': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [],
                    child_unit_total: 0,
                    adult_unit_total: 20,
                    pants_child_unit_total: 0,
                    pants_adult_unit_total: 0,
                    child_total: 0,
                    adult_total: 80,
                    pants_child_total: 0,
                    pants_adult_total: 0,
                    grand_total: 80,
                },
            },
        };

        const order = {
            id: 70,
            order_code: 'ORD-070',
            job_name: 'Artwork Mapping Shirt Fallback',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            artwork_url: 'https://example.com/general-art.webp',
            shirt_artwork_url: null,
            pants_artwork_url: 'https://example.com/pants-art.webp',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 70' },
            creator_user: { name: 'ผู้สร้าง 70' },
            items: [
                { item_type: 'shirt', size_group: 'adults', size_label: 'L', quantity: 4 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 7001,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        const shirtArtwork = screen.getByAltText('เสื้อไซต์ผู้ใหญ่-artwork-1');

        expect(shirtArtwork.getAttribute('src')).toBe('https://example.com/general-art.webp');
    });

    it('falls back pants section artwork to general artwork when pants artwork is missing', () => {
        mockPage.props = {
            productionPricingMap: {
                '75': {
                    components: [],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 0,
                    adult_unit_total: 0,
                    pants_child_unit_total: 0,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 0,
                    pants_child_total: 0,
                    pants_adult_total: 45,
                    grand_total: 45,
                },
            },
        };

        const order = {
            id: 75,
            order_code: 'ORD-075',
            job_name: 'Artwork Mapping Pants Fallback',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            artwork_url: 'https://example.com/general-art.webp',
            shirt_artwork_url: 'https://example.com/shirt-art.webp',
            pants_artwork_url: null,
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 75' },
            creator_user: { name: 'ผู้สร้าง 75' },
            items: [
                { item_type: 'pants', size_group: 'adults', size_label: 'L', quantity: 3 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 7501,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        const pantsArtwork = screen.getByAltText('กางเกงผู้ใหญ่-artwork-1');

        expect(pantsArtwork.getAttribute('src')).toBe('https://example.com/general-art.webp');
    });

    it('shows placeholder in both shirt and pants sections when all artwork sources are missing', () => {
        mockPage.props = {
            productionPricingMap: {
                '76': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 0,
                    adult_unit_total: 20,
                    pants_child_unit_total: 0,
                    pants_adult_unit_total: 15,
                    child_total: 0,
                    adult_total: 80,
                    pants_child_total: 0,
                    pants_adult_total: 45,
                    grand_total: 125,
                },
            },
        };

        const order = {
            id: 76,
            order_code: 'ORD-076',
            job_name: 'Artwork Placeholder Order',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            artwork_url: null,
            shirt_artwork_url: null,
            pants_artwork_url: null,
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 76' },
            creator_user: { name: 'ผู้สร้าง 76' },
            items: [
                { item_type: 'shirt', size_group: 'adults', size_label: 'L', quantity: 4 },
                { item_type: 'pants', size_group: 'adults', size_label: 'L', quantity: 3 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 7601,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(screen.queryByAltText('เสื้อไซต์ผู้ใหญ่-artwork-1')).not.toBeInTheDocument();
        expect(screen.queryByAltText('กางเกงผู้ใหญ่-artwork-1')).not.toBeInTheDocument();
        expect(screen.getAllByText('ไม่มีรูป Artwork').length).toBeGreaterThanOrEqual(2);
    });

    it('keeps group header colors and spec rows isolated by garment type in dialog and pdf', () => {
        mockPage.props = {
            productionPricingMap: {
                '77': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 10,
                    adult_unit_total: 20,
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                    child_total: 20,
                    adult_total: 60,
                    pants_child_total: 20,
                    pants_adult_total: 45,
                    grand_total: 125,
                },
            },
        };

        const order = {
            id: 77,
            order_code: 'ORD-077',
            job_name: 'Header Color and Spec Isolation',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 77' },
            creator_user: { name: 'ผู้สร้าง 77' },
            specification: {
                id: 7701,
                order_id: 77,
                pattern_id: 1,
                fabric_id: 2,
                neck_style_id: 3,
                collar_color: null,
                leg_style: 'ขาตรงจริง',
                leg_hem: 'ปลายขาจั๊มจริง',
                placket_style: null,
                placket_color: null,
                sleeve_style: 'แขนสั้นจริง',
                sleeve_hem: 'ปลายแขนจั๊มจริง',
                sublimation_detail: null,
                screen_print_detail: JSON.stringify({
                    shirt_specs: {
                        pattern_id: 1,
                        fabric_id: 2,
                        neck_style_id: 3,
                        sleeve_style_text: 'แขนสั้นจริง',
                        sleeve_cuff_id: 'ปลายแขนจั๊มจริง',
                        embroidery_code_text: 'EMB-SHIRT',
                    },
                    pants_specs: {
                        pattern_id: 1,
                        fabric_id: 2,
                        leg_style_id: 'ขาตรงจริง',
                        leg_cuff_id: 'ปลายขาจั๊มจริง',
                        embroidery_code_text: 'EMB-PANTS',
                    },
                }),
                embroidery_code: null,
                created_at: '2026-08-01T10:00:00.000000Z',
                updated_at: '2026-08-01T10:00:00.000000Z',
            },
            items: [
                { item_type: 'shirt', size_group: 'kids', size_label: 'JM', quantity: 2 },
                { item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 3 },
                { item_type: 'pants', size_group: 'kids', size_label: 'JL', quantity: 4 },
                { item_type: 'pants', size_group: 'adults', size_label: 'L', quantity: 1 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 7701,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        const shirtKidHeader = screen.getByText('เสื้อไซต์เด็ก');
        const shirtAdultHeader = screen.getByText('เสื้อไซต์ผู้ใหญ่');
        const pantsKidHeader = screen.getByText('กางเกงเด็ก');
        const pantsAdultHeader = screen.getByText('กางเกงผู้ใหญ่');

        const shirtKidStyle = shirtKidHeader.getAttribute('style') ?? '';
        const shirtAdultStyle = shirtAdultHeader.getAttribute('style') ?? '';
        const pantsKidStyle = pantsKidHeader.getAttribute('style') ?? '';
        const pantsAdultStyle = pantsAdultHeader.getAttribute('style') ?? '';

        expect(shirtKidStyle).toContain('background-color: rgb(15, 118, 110)');
        expect(shirtAdultStyle).toContain('background-color: rgb(29, 78, 216)');
        expect(pantsKidStyle).toContain('background-color: rgb(180, 83, 9)');
        expect(pantsAdultStyle).toContain('background-color: rgb(124, 58, 237)');
        expect(shirtKidStyle).not.toBe(shirtAdultStyle);
        expect(shirtKidStyle).not.toBe(pantsKidStyle);
        expect(shirtKidStyle).not.toBe(pantsAdultStyle);
        expect(shirtAdultStyle).not.toBe(pantsKidStyle);
        expect(shirtAdultStyle).not.toBe(pantsAdultStyle);
        expect(pantsKidStyle).not.toBe(pantsAdultStyle);

        const printPages = Array.from(document.querySelectorAll('.p-print-page'));
        const shirtKidPage = printPages.find((page) => page.textContent?.includes('เสื้อไซต์เด็ก'));
        const shirtAdultPage = printPages.find((page) => page.textContent?.includes('เสื้อไซต์ผู้ใหญ่'));
        const pantsKidPage = printPages.find((page) => page.textContent?.includes('กางเกงเด็ก'));
        const pantsAdultPage = printPages.find((page) => page.textContent?.includes('กางเกงผู้ใหญ่'));

        expect(shirtKidPage?.querySelectorAll('.p-spec-grid-item').length).toBeGreaterThan(0);
        expect(shirtAdultPage?.querySelectorAll('.p-spec-grid-item').length).toBeGreaterThan(0);
        expect(pantsKidPage?.querySelectorAll('.p-spec-grid-item').length).toBeGreaterThan(0);
        expect(pantsAdultPage?.querySelectorAll('.p-spec-grid-item').length).toBeGreaterThan(0);

        shirtKidPage?.querySelectorAll('.p-spec-grid-item').forEach((row) => {
            expect(row.textContent?.trim()).not.toBe('');
        });

        shirtAdultPage?.querySelectorAll('.p-spec-grid-item').forEach((row) => {
            expect(row.textContent?.trim()).not.toBe('');
        });

        pantsKidPage?.querySelectorAll('.p-spec-grid-item').forEach((row) => {
            expect(row.textContent?.trim()).not.toBe('');
        });

        pantsAdultPage?.querySelectorAll('.p-spec-grid-item').forEach((row) => {
            expect(row.textContent?.trim()).not.toBe('');
        });

        expect(within(shirtKidPage as HTMLElement).queryByText('แบบขา')).not.toBeInTheDocument();
        expect(within(shirtKidPage as HTMLElement).queryByText('ปลายขา')).not.toBeInTheDocument();
        expect(within(pantsKidPage as HTMLElement).queryByText('แบบแขน')).not.toBeInTheDocument();
        expect(within(pantsKidPage as HTMLElement).queryByText('ปลายแขน')).not.toBeInTheDocument();

        expect(within(shirtAdultPage as HTMLElement).getByText('แขนสั้นจริง')).toBeInTheDocument();
        expect(within(pantsAdultPage as HTMLElement).getByText('ขาตรงจริง')).toBeInTheDocument();
        expect(within(pantsAdultPage as HTMLElement).queryByText('แขนสั้นจริง')).not.toBeInTheDocument();
    });

    it('computes dozen count with floor rule for 12 and 24 pieces', () => {
        mockPage.props = {
            productionPricingMap: {
                '64': {
                    components: [{ name: 'เย็บคอ', child_price: 10, adult_price: 20 }],
                    pants_components: [{ name: 'เย็บขา', child_price: 5, adult_price: 15 }],
                    child_unit_total: 10,
                    adult_unit_total: 20,
                    pants_child_unit_total: 5,
                    pants_adult_unit_total: 15,
                    child_total: 120,
                    adult_total: 0,
                    pants_child_total: 120,
                    pants_adult_total: 0,
                    grand_total: 240,
                },
            },
        };

        const dozenOrder = {
            id: 64,
            order_code: 'ORD-064',
            job_name: 'Dozen Rule Order',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 64' },
            creator_user: { name: 'ผู้สร้าง 64' },
            items: [
                { item_type: 'shirt', size_group: 'kids', size_label: 'JM', quantity: 12 },
                { item_type: 'pants', size_group: 'kids', size_label: 'JL', quantity: 24 },
            ],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 6401,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        render(
            <ProductionBoardPage
                orders={[dozenOrder]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(screen.getByText('จำนวน 1 โหล')).toBeInTheDocument();
        expect(screen.getByText('จำนวน 2 โหล')).toBeInTheDocument();
        expect(screen.queryByText(/หน้า\s*\d+\s*\/\s*\d+/)).not.toBeInTheDocument();
        expect(screen.queryByText(/พิมพ์:/)).not.toBeInTheDocument();
    });

    it('uses backend-provided spec rows only when the feature flag is enabled and keeps dialog/pdf consistent', () => {
        mockPage.props = {
            productionPricingMap: {
                '71': makePricingSummary(),
            },
            useBackendSpecMapOnly: true,
        };

        const order = makeSpecOrder(71);

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                specSectionsMap={{
                    '71': {
                        shirt: [
                            { label: 'แพทเทิร์น', value: 'ทรงเข้ารูป' },
                            { label: 'เนื้อผ้า', value: 'ไมโครโพลี' },
                            { label: 'สีผ้า', value: 'แดง' },
                            { label: 'แบบคอ', value: 'คอโปโล' },
                            { label: 'สีแบบคอ', value: 'ขาว' },
                            { label: 'ปก', value: 'ปกจั๊ม' },
                            { label: 'แบบสาบ', value: 'ซ่อนกระดุม' },
                            { label: 'สีสาบ (นอก)', value: 'แดง' },
                            { label: 'สีสาบ (ใน)', value: 'ขาว' },
                        ],
                        pants: [],
                    },
                }}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(screen.getAllByText('แพทเทิร์น')).toHaveLength(2);
        expect(screen.getAllByText('ทรงเข้ารูป')).toHaveLength(2);
        expect(screen.getAllByText('สีสาบ (ใน)')).toHaveLength(2);
        expect(screen.getAllByText('ขาว').length).toBeGreaterThan(1);
    });

    it('renders only populated backend rows for partial specs when backend-only mode is enabled', () => {
        mockPage.props = {
            productionPricingMap: {
                '72': makePricingSummary(),
            },
            useBackendSpecMapOnly: true,
        };

        const order = makeSpecOrder(72);

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                specSectionsMap={{
                    '72': {
                        shirt: [
                            { label: 'แพทเทิร์น', value: 'ทรงมาตรฐาน' },
                            { label: 'เนื้อผ้า', value: 'TK' },
                            { label: 'ปก', value: 'ปกทอ' },
                        ],
                        pants: [],
                    },
                }}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(screen.getAllByText('ปก')).toHaveLength(2);
        expect(screen.queryByText('สีสาบ (นอก)')).not.toBeInTheDocument();
        expect(screen.queryByText('สีแบบคอ')).not.toBeInTheDocument();
    });

    it('filters null and empty shirt spec values without leaking raw screen_print_detail content', () => {
        mockPage.props = {
            productionPricingMap: {
                '73': makePricingSummary(),
            },
            useBackendSpecMapOnly: false,
        };

        const order = {
            ...makeSpecOrder(73),
            specification: {
                id: 7301,
                order_id: 73,
                pattern_id: 2,
                fabric_id: 3,
                neck_style_id: 2,
                collar_color: null,
                leg_style: null,
                leg_hem: null,
                placket_style: null,
                placket_color: null,
                sleeve_style: null,
                sleeve_hem: null,
                sublimation_detail: null,
                screen_print_detail: JSON.stringify({
                    shirt_specs: {
                        pattern_id: '2',
                        fabric_id: '3',
                        neck_style_id: '2',
                        screen_text: '',
                        embroidery_note_text: '',
                    },
                }),
                embroidery_code: null,
                created_at: '2026-08-01T10:00:00.000000Z',
                updated_at: '2026-08-01T10:00:00.000000Z',
            },
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                specCatalogLookups={{
                    'jssport.shirt-patterns': { '2': 'ทรงเข้ารูป' },
                    'jssport.shirt-fabrics': { '3': 'ไมโครโพลี' },
                    'jssport.shirt-collars': { '2': 'คอโปโล' },
                }}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(screen.getAllByText('ทรงเข้ารูป')).toHaveLength(2);
        expect(screen.queryByText('ข้อความสกรีน')).not.toBeInTheDocument();
        expect(screen.queryByText('รายละเอียดปัก')).not.toBeInTheDocument();
        expect(screen.queryByText(/shirt_specs/)).not.toBeInTheDocument();
    });

    it('keeps legacy fallback labels and catalog lookups aligned when backend-only mode is disabled', () => {
        mockPage.props = {
            productionPricingMap: {
                '74': makePricingSummary(),
            },
            useBackendSpecMapOnly: false,
        };

        const order = {
            ...makeSpecOrder(74),
            specification: {
                id: 7401,
                order_id: 74,
                pattern_id: 2,
                fabric_id: 3,
                neck_style_id: 2,
                collar_color: null,
                leg_style: null,
                leg_hem: null,
                placket_style: '2',
                placket_color: '1',
                sleeve_style: 'แขนสั้น',
                sleeve_hem: '2',
                sublimation_detail: '1',
                screen_print_detail: null,
                embroidery_code: 'EMB-01',
                created_at: '2026-08-01T10:00:00.000000Z',
                updated_at: '2026-08-01T10:00:00.000000Z',
            },
        } as Order;

        render(
            <ProductionBoardPage
                orders={[order]}
                branches={[]}
                specCatalogLookups={{
                    'jssport.shirt-patterns': { '2': 'ทรงมาตรฐาน' },
                    'jssport.shirt-fabrics': { '3': 'TK' },
                    'jssport.shirt-collars': { '2': 'คอโปโล' },
                    'jssport.shirt-plackets': { '2': 'ซ่อนกระดุม' },
                    'jssport.shirt-colors': { '1': 'แดง' },
                    'jssport.shirt-cuffs': { '2': 'จั๊มปลายแขน' },
                    'jssport.shirt-sublimation': { '1': 'ซับทั้งตัว' },
                }}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByTitle('ดูรายละเอียดออเดอร์'));

        expect(screen.getAllByText('สีสาบ (นอก)')).toHaveLength(2);
        expect(screen.getAllByText('แดง').length).toBeGreaterThan(1);
        expect(screen.queryByText('สีสาบ (ใน)')).not.toBeInTheDocument();
        expect(screen.queryByText('ข้อความสกรีน')).not.toBeInTheDocument();
    });

    it('keeps timeline dialog in sync when order props update after status change', () => {
        mockPage.props = {};

        const pendingOrder = {
            id: 41,
            order_code: 'ORD-041',
            job_name: 'Embroidery test',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า 41' },
            creator_user: { name: 'ผู้สร้าง' },
            items: [{ quantity: 1 }],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 4101,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        const { rerender } = render(
            <ProductionBoardPage
                orders={[pendingOrder]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'ไทม์ไลน์' }));
        expect(screen.getAllByText('งานเข้า').length).toBeGreaterThan(0);

        const completedOrder = {
            ...pendingOrder,
            routings: [
                {
                    ...pendingOrder.routings![0],
                    status: 'completed',
                    completed_at: '2026-08-01T11:00:00.000000Z',
                    updated_at: '2026-08-01T11:00:00.000000Z',
                },
            ],
        } as Order;

        rerender(
            <ProductionBoardPage
                orders={[completedOrder]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        expect(screen.getAllByText('เสร็จสิ้น').length).toBeGreaterThan(0);
    });

    it('keeps timeline isolated to the selected record when other rows update', () => {
        mockPage.props = {};

        const orderA = {
            id: 51,
            order_code: 'ORD-051',
            job_name: 'Order A',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-05',
            branch: { branch_name: 'สาขา 1' },
            customer: { customer_name: 'ลูกค้า A' },
            creator_user: { name: 'ผู้สร้าง A' },
            items: [{ quantity: 1 }],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 5101,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:00:00.000000Z',
                    updated_at: '2026-08-01T10:00:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        const orderB = {
            id: 52,
            order_code: 'ORD-052',
            job_name: 'Order B',
            job_type: 'งานปัก',
            order_status: 'in_production',
            order_date: '2026-08-01',
            due_date: '2026-08-06',
            branch: { branch_name: 'สาขา 2' },
            customer: { customer_name: 'ลูกค้า B' },
            creator_user: { name: 'ผู้สร้าง B' },
            items: [{ quantity: 1 }],
            receipts: [],
            status_histories: [],
            routings: [
                {
                    id: 5201,
                    station_name: 'embroidery',
                    is_required: true,
                    status: 'pending',
                    created_at: '2026-08-01T10:30:00.000000Z',
                    updated_at: '2026-08-01T10:30:00.000000Z',
                    started_at: null,
                    completed_at: null,
                },
            ],
        } as Order;

        const { rerender } = render(
            <ProductionBoardPage
                orders={[orderA, orderB]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        fireEvent.click(screen.getAllByRole('button', { name: 'ไทม์ไลน์' })[0]);
        expect(screen.getByText('Timeline ออเดอร์ ORD-051')).toBeInTheDocument();
        expect(within(screen.getByRole('dialog')).getByText('ลูกค้า A')).toBeInTheDocument();

        const updatedOrderB = {
            ...orderB,
            routings: [
                {
                    ...orderB.routings![0],
                    status: 'completed',
                    completed_at: '2026-08-01T11:45:00.000000Z',
                    updated_at: '2026-08-01T11:45:00.000000Z',
                },
            ],
        } as Order;

        rerender(
            <ProductionBoardPage
                orders={[orderA, updatedOrderB]}
                branches={[]}
                initialDepartmentFilter="embroidery"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องปัก"
            />,
        );

        expect(screen.getByText('Timeline ออเดอร์ ORD-051')).toBeInTheDocument();
        expect(within(screen.getByRole('dialog')).getByText('ลูกค้า A')).toBeInTheDocument();
        expect(within(screen.getByRole('dialog')).queryByText('ลูกค้า B')).not.toBeInTheDocument();
    });
});
