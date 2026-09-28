import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { Order } from '@/types/models';

const mockPage = vi.hoisted(() => ({
    props: {} as Record<string, unknown>,
    url: '/production/sewing',
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
    router: { get: vi.fn(), reload: vi.fn() },
    usePage: () => mockPage,
}));

/**
 * A work sheet is a fixed 200mm tall box — exactly the height of A4 landscape
 * inside the 5mm print margin — and it is a flex column with its overflow
 * hidden. Push one past that height by even a millimetre and the browser has
 * to fragment it: the header lands on the page and everything under it is
 * dropped, leaving a blank sheet.
 *
 * That is what an 8mm gap between the stacked sheets did. The gap spaces the
 * preview and must never reach paper, so the rule that draws it is screen-only
 * and the print stylesheet states the invariant outright — including for the
 * sibling selector, which would otherwise outrank a plain reset.
 */
const makeOrder = (
    id: number,
    extraItems: Array<Record<string, unknown>> = [],
): Order =>
    ({
        id,
        order_code: `ORD-${id}`,
        job_name: 'งานหลายใบ',
        job_type: 'งานปัก',
        order_status: 'in_production',
        order_date: '2026-09-01',
        due_date: '2026-09-10',
        branch: { branch_name: 'สาขา 1' },
        customer: { customer_name: 'ลูกค้า' },
        creator_user: { name: 'ผู้สร้าง' },
        items: [
            {
                item_type: 'shirt',
                shirt_style: 'short',
                size_group: 'kids',
                size_label: 'JM',
                quantity: 12,
            },
            {
                item_type: 'shirt',
                shirt_style: 'long',
                size_group: 'adults',
                size_label: 'L',
                quantity: 8,
            },
            {
                item_type: 'pants',
                pants_style: 'short',
                size_group: 'kids',
                size_label: 'JM',
                quantity: 12,
            },
            {
                item_type: 'pants',
                pants_style: 'long',
                size_group: 'adults',
                size_label: 'L',
                quantity: 8,
            },
            ...extraItems,
        ],
        receipts: [],
        status_histories: [],
        specification: {
            screen_print_detail: JSON.stringify({
                schema: 'spec-v2',
                mode: 'matrix',
            }),
        },
        routings: [
            {
                id: id * 100,
                station_name: 'sewing',
                is_required: true,
                status: 'pending',
                created_at: '2026-09-01T10:00:00.000000Z',
                updated_at: '2026-09-01T10:00:00.000000Z',
                started_at: null,
                completed_at: null,
            },
        ],
    }) as unknown as Order;

/** The document handed to the print window. */
const printedDocument = (
    extraItems: Array<Record<string, unknown>> = [],
): string => {
    let written = '';
    vi.spyOn(window, 'open').mockReturnValue({
        document: {
            open: vi.fn(),
            close: vi.fn(),
            images: [],
            querySelectorAll: () => [],
            write: (html: string) => {
                written += html;
            },
        },
        focus: vi.fn(),
        print: vi.fn(),
        close: vi.fn(),
    } as unknown as Window);

    mockPage.props = {};

    render(
        <ProductionBoardPage
            orders={[makeOrder(77, extraItems)]}
            branches={[]}
            initialDepartmentFilter="sewing"
            showDepartmentFilter={false}
            pageTitle="ห้องเย็บ"
        />,
    );

    fireEvent.click(screen.getAllByTitle('ดูรายละเอียดออเดอร์')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Print เอกสาร/ }));

    return written;
};

/** Every `@media <query> { ... }` block in the document, with its contents. */
const mediaBlocks = (html: string, query: string): string[] => {
    const blocks: string[] = [];
    const opener = `@media ${query} {`;
    let from = html.indexOf(opener);

    while (from !== -1) {
        let depth = 0;
        let cursor = from + opener.length - 1;

        do {
            if (html[cursor] === '{') {
                depth += 1;
            } else if (html[cursor] === '}') {
                depth -= 1;
            }

            cursor += 1;
        } while (depth > 0 && cursor < html.length);

        blocks.push(html.slice(from, cursor));
        from = html.indexOf(opener, cursor);
    }

    return blocks;
};

const withoutSpace = (value: string): string => value.replace(/\s+/g, '');

afterEach(() => {
    vi.restoreAllMocks();
});

describe('the printed work sheets', () => {
    it('prints every sheet, not just the first', () => {
        const html = printedDocument();

        // Four batches on this bill: a shirt and a trouser sheet per length.
        expect(html.split('p-print-page').length - 1).toBeGreaterThanOrEqual(4);
    });

    it('never carries the preview gap onto paper', () => {
        const html = printedDocument();

        // The gap is drawn for the screen only. On paper it would make each
        // sheet 208mm tall in a 200mm page and blank everything but the header.
        const screenOnly = mediaBlocks(html, 'screen').join('');

        expect(withoutSpace(screenOnly)).toContain(
            withoutSpace('.p-print-page + .p-print-page { margin-top: 8mm; }'),
        );

        // Nothing outside a screen-only block may space the sheets apart.
        const outsideScreenBlocks = mediaBlocks(html, 'screen').reduce(
            (rest, block) => rest.replace(block, ''),
            html,
        );

        expect(withoutSpace(outsideScreenBlocks)).not.toContain(
            withoutSpace('.p-print-page + .p-print-page { margin-top: 8mm; }'),
        );
    });

    it('resets the margin on paper, sibling selector included', () => {
        const print = withoutSpace(
            mediaBlocks(printedDocument(), 'print').join(''),
        );

        // A reset on .p-print-page alone is outranked by any rule written as
        // .p-print-page + .p-print-page, so the sibling case is spelled out.
        expect(print).toContain(
            withoutSpace('.p-print-page, .p-print-page + .p-print-page {'),
        );
        expect(print).toContain(withoutSpace('margin: 0;'));
    });

    /**
     * The printable area of A4 landscape inside a 5mm margin is 200mm, and a
     * sheet cut to exactly that had no room for a printer whose own unprintable
     * border is wider than the margin asks for. The last millimetre spilled and
     * every sheet was followed by a page carrying nothing but the spill — on
     * some machines and not others, which is what made it look random. The
     * sheet is kept a few millimetres short of the page on purpose.
     */
    it('keeps each sheet a little short of the page it prints on', () => {
        const html = withoutSpace(printedDocument());

        expect(html).toContain(
            withoutSpace('@page { size: A4 landscape; margin: 5mm; }'),
        );
        const sheet = /\.p-print-page\{width:([\d.]+)mm;height:([\d.]+)mm/.exec(
            html,
        );
        const width = Number(sheet?.[1]);
        const height = Number(sheet?.[2]);

        // A4 landscape at a 5mm margin leaves 287 x 200mm to print on, and the
        // sheet stays inside that on both dimensions. Too tall and a sliver is
        // pushed onto a page of its own; too wide and the right-hand edge is
        // simply taken off the paper, which is worse for being quiet.
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
        expect(width).toBeLessThanOrEqual(282);
        expect(height).toBeLessThanOrEqual(196);
    });

    /**
     * The name list is the one sheet allowed to grow: height:auto with a 200mm
     * floor, so a team of more than eighteen flows onto a second page instead
     * of being cut off. Nothing gives it a ceiling, so its fixed-height parts
     * have to come to 200mm on their own — and at 8mm a row they came to
     * 201.37mm, measured in Chrome at print size. The last 1.37mm of the
     * bottom strip was pushed onto a sheet of its own, and every name list
     * printed a blank page behind it.
     */
    it('keeps the name list from printing a blank page behind it', () => {
        const rowHeightMm = Number(
            /\.p-personalization-table\s+tbody\s+td\s*\{[^}]*height:\s*([\d.]+)mm/.exec(
                printedDocument(),
            )?.[1],
        );

        expect(rowHeightMm).toBeGreaterThan(0);

        // Everything on that sheet other than the rows, measured together:
        // the header, the table head, the bottom strip and the two gaps.
        const fixedPartsMm = 49.37;
        // Eighteen writing lines, which short teams are padded out to, and
        // the total row under them.
        const rows = 19;

        // The list has to fit the sheet, which is itself kept short of the
        // page; it cannot spend the slack the sheet was given.
        expect(fixedPartsMm + rows * rowHeightMm).toBeLessThanOrEqual(195);
    });

    /**
     * The board builds a sheet for every length a garment can be cut in, then
     * files each row of the bill under one. A length missing from that list
     * left a row with nowhere to go, and writing its quantity into nothing
     * took the whole production room down to a white page — one shirt on one
     * bill, and the floor could not see any of its work.
     */
    it('prints a sleeveless shirt on a sheet of its own instead of failing', () => {
        const html = printedDocument([
            {
                item_type: 'shirt',
                shirt_style: 'sleeveless',
                size_group: 'adults',
                size_label: 'L',
                quantity: 6,
            },
        ]);

        expect(html).toContain('แขนกุด');
    });

    it('starts a new page after every sheet but the last', () => {
        const print = withoutSpace(
            mediaBlocks(printedDocument(), 'print').join(''),
        );

        expect(print).toContain(withoutSpace('break-after: page;'));
        expect(print).toContain(
            withoutSpace('.p-print-page:last-child { page-break-after: auto;'),
        );
    });
});
