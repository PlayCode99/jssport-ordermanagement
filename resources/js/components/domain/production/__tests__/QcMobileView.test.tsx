import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPage, routerMocks } = vi.hoisted(() => ({
    mockPage: { props: {} as Record<string, unknown>, url: '/production/qc' },
    routerMocks: {
        get: vi.fn(),
        post: vi.fn(),
        reload: vi.fn(),
        patch: vi.fn(),
    },
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        href,
        className,
        children,
    }: {
        href: string;
        className?: string;
        children: ReactNode;
    }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
    router: routerMocks,
    usePage: () => mockPage,
}));

vi.mock('jsbarcode', () => ({ default: () => undefined }));

import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { Order } from '@/types/models';

const order = {
    id: 91,
    order_code: 'ORD-091',
    job_name: 'เสื้อกีฬาสี 2569',
    job_type: 'งานปัก',
    order_status: 'qc_checking',
    order_date: '2026-08-01T09:00:00.000000Z',
    due_date: '2026-08-05',
    branch: { branch_name: 'สาขา 1' },
    customer: { customer_name: 'โรงเรียนทดสอบ' },
    creator_user: { name: 'ผู้สร้าง 91' },
    items: [
        {
            item_type: 'shirt',
            size_group: 'adults',
            size_label: 'L',
            quantity: 12,
        },
    ],
    receipts: [],
    status_histories: [],
    routings: [
        {
            id: 9101,
            station_name: 'qc',
            is_required: true,
            status: 'in_progress',
            created_at: '2026-08-01T10:00:00.000000Z',
            updated_at: '2026-08-01T10:00:00.000000Z',
            started_at: null,
            completed_at: null,
        },
    ],
} as unknown as Order;

const renderRoom = (
    department: 'qc' | 'shipping' | 'embroidery',
    title: string,
) => {
    render(
        <ProductionBoardPage
            orders={[order]}
            branches={[]}
            initialDepartmentFilter={department}
            showDepartmentFilter={false}
            hideBillingColumns={true}
            pageTitle={title}
        />,
    );
};

/** The card list rendered for small screens; the table stays for md and up. */
const mobileList = () =>
    document.querySelector(
        '.md\\:hidden.space-y-2\\.5, .space-y-2\\.5.md\\:hidden',
    );

describe('QC and shipping on a phone', () => {
    beforeEach(() => {
        mockPage.props = {};
        Object.values(routerMocks).forEach((mock) => mock.mockClear());
    });

    it('gives the QC room a card per order for small screens', () => {
        renderRoom('qc', 'ห้องตรวจสอบ');

        const list = mobileList();

        expect(list).not.toBeNull();
        expect(list!.querySelectorAll('article')).toHaveLength(1);
    });

    it('gives the shipping room the same', () => {
        renderRoom('shipping', 'ห้องจัดส่ง');

        expect(mobileList()).not.toBeNull();
    });

    it('leaves the other rooms exactly as they were', () => {
        renderRoom('embroidery', 'ห้องปัก');

        expect(mobileList()).toBeNull();
    });

    it('hides the wide table below md so the two never show at once', () => {
        renderRoom('qc', 'ห้องตรวจสอบ');

        const table = document.querySelector('table')?.parentElement;

        expect(table?.className).toContain('hidden');
        expect(table?.className).toContain('md:block');
    });

    it('carries what the room is worked from: order, job, due date and quantity', () => {
        renderRoom('qc', 'ห้องตรวจสอบ');

        const card = mobileList()!.querySelector('article')!;

        expect(card.textContent).toContain('ORD-091');
        expect(card.textContent).toContain('เสื้อกีฬาสี 2569');
        expect(card.textContent).toContain('โรงเรียนทดสอบ');
        expect(card.textContent).toContain('12 ตัว');
    });

    it('offers the inspection button the room exists for', () => {
        renderRoom('qc', 'ห้องตรวจสอบ');

        const card = mobileList()!.querySelector('article')!;
        const buttons = [...card.querySelectorAll('button')].map(
            (node) => node.textContent,
        );

        expect(buttons).toContain('ตรวจสอบ');
        expect(buttons).toContain('ไทม์ไลน์');
        expect(buttons).toContain('รายละเอียด');
    });

    it('opens the same detail dialog the table opens', () => {
        renderRoom('qc', 'ห้องตรวจสอบ');

        const card = mobileList()!.querySelector('article')!;
        const detail = [...card.querySelectorAll('button')].find(
            (node) => node.textContent === 'รายละเอียด',
        )!;

        fireEvent.click(detail);

        expect(screen.getAllByText('ใบสั่งผลิต').length).toBeGreaterThan(0);
    });

    it('says so plainly when the room is empty', () => {
        render(
            <ProductionBoardPage
                orders={[]}
                branches={[]}
                initialDepartmentFilter="qc"
                showDepartmentFilter={false}
                hideBillingColumns={true}
                pageTitle="ห้องตรวจสอบ"
            />,
        );

        expect(mobileList()!.textContent).toContain('ไม่พบข้อมูลออเดอร์');
    });
});

/**
 * The costing column used to end wherever its rows ran out, leaving a block of
 * white down the right of the printed sheet while the artwork column carried on.
 * Both columns now stretch to the same height and the costing table fills its
 * card, which is writing room for the floor rather than wasted paper.
 */
describe('production sheet costing column', () => {
    const printStyles = () => {
        renderRoom('qc', 'ห้องตรวจสอบ');
        fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);

        return [...document.querySelectorAll('style')]
            .map((node) => node.innerHTML)
            .join('\n');
    };

    it('stretches both columns to the same height', () => {
        const css = printStyles();

        // Scoped to the form grid: other blocks on the page legitimately align
        // their own items to the start.
        const formGrid = css.match(/\.p-form-grid \{[^}]*\}/s)?.[0] ?? '';

        expect(formGrid).toContain('align-items: stretch');
        expect(formGrid).not.toContain('align-items: start');
    });

    it('lets the costing table fill its card', () => {
        const css = printStyles();

        // The table is the tallest thing on the sheet and the shop reads it
        // first, so it takes the whole right column rather than stopping where
        // its rows run out.
        expect(css).toMatch(/\.p-process-wrap \{[^}]*flex: 1 1 auto/s);
        expect(css).toMatch(/\.p-process-table \{[^}]*height: 100%/s);
    });

    it('keeps the columns able to shrink so the sheet cannot widen past the page', () => {
        const css = printStyles();

        // fr tracks with minmax(0, ...) instead of fixed percentages: content can
        // never push a column wider than its share of the sheet.
        expect(css).toContain('minmax(0, 55fr) minmax(0, 45fr)');
        expect(css).not.toContain('grid-template-columns: 55% 45%');
    });

    it('is exactly one A4 landscape page', () => {
        const css = printStyles();

        // The sheet used to lay out 942px of content inside a 748px page, so
        // every other group printed onto a second sheet. The page is now a box
        // of a fixed size and the blocks are fitted into it.
        const page = css.match(/\.p-print-page \{[^}]*\}/s)?.[0] ?? '';

        expect(page).toContain('width: 287mm');
        expect(page).toContain('height: 200mm');
        expect(page).toContain('overflow: hidden');
    });

    it('never sets print type below the size a shop floor can read', () => {
        const css = printStyles();

        // The old sheet set 86 of its 91 pieces of text at 8-9px. Readers here
        // are in their late thirties and up.
        const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
            .map((match) => Number(match[1]))
            .filter((size) => size > 0);

        expect(sizes.length).toBeGreaterThan(10);
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
    });
});
