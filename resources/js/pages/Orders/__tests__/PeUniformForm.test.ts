import { describe, expect, it } from 'vitest';

import { resolveRequestItems, usesSizeTables } from '@/pages/Orders/Create';

const table = (tableType: 'kids' | 'adults', sizeLabel: string) => ({
    id: `t-${tableType}`,
    table_type: tableType,
    title: tableType === 'kids' ? 'ตารางไซส์เด็ก' : 'ตารางไซส์ผู้ใหญ่',
    artwork_files: [],
    saved_artwork: [],
    rows: [
        {
            id: `r-${tableType}`,
            size_label: sizeLabel,
            shirt_style: 'short' as const,
            pants_style: 'long' as const,
            set_shirt_qty: 4,
            set_pants_qty: 4,
            set_price: 300,
            separate_shirt_qty: 2,
            separate_pants_qty: 0,
            separate_shirt_price: 150,
            separate_pants_price: 0,
        },
    ],
});

describe('ชุดพละ (Form 4)', () => {
    it('is a size-table form, like Form 1 and unlike the other two', () => {
        expect(usesSizeTables('pe_uniform')).toBe(true);
        expect(usesSizeTables('matrix')).toBe(true);
        expect(usesSizeTables('individual')).toBe(false);
        expect(usesSizeTables('sports_day')).toBe(false);
    });

    it('sends production exactly what Form 1 sends', () => {
        const tables = [table('kids', 'JM'), table('adults', 'L')];

        // Production reads order_items, not which form the counter used, so the
        // two must produce byte-for-byte the same items or a ชุดพละ bill would
        // reach the floor mis-shaped.
        const fromForm1 = resolveRequestItems('matrix', tables, [], [], false);
        const fromForm4 = resolveRequestItems(
            'pe_uniform',
            tables,
            [],
            [],
            false,
        );

        expect(fromForm4).toEqual(fromForm1);
        expect(fromForm4.length).toBeGreaterThan(0);
    });

    it('carries the size group, the size and both garment styles', () => {
        const items = resolveRequestItems(
            'pe_uniform',
            [table('kids', 'JM')],
            [],
            [],
            false,
        );

        const set = items.find((item) => item.item_type === 'set');
        expect(set).toMatchObject({
            size_group: 'kids',
            size_label: 'JM',
            shirt_style: 'short',
            pants_style: 'long',
            quantity: 4,
        });

        // The separately sold shirts stay their own line, the way the floor
        // counts them.
        expect(
            items.some(
                (item) =>
                    item.item_type === 'separate_shirt' && item.quantity === 2,
            ),
        ).toBe(true);
    });

    it('never routes a ชุดพละ bill through the name-list builder', () => {
        // The mode used to fall through to Form 2's builder, which would have
        // produced an empty order from a full size table.
        const items = resolveRequestItems(
            'pe_uniform',
            [table('adults', 'L')],
            [],
            [],
            false,
        );

        expect(items.length).toBeGreaterThan(0);
    });
});
