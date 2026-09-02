import { describe, expect, it } from 'vitest';

import { buildRequestItemsFromSportsDay } from '@/pages/Orders/Create';

/**
 * order_items has to say which garment each line is. When every row was saved
 * as the generic 'garment', production costing had to guess from the spec — and
 * charged pants labour on orders that never ordered any pants.
 */
describe('order item garment types', () => {
    const row = (over = {}) => ({
        id: 'r1',
        size_group: 'adults' as const,
        size_label: 'M',
        shirt_qty: 0,
        shirt_price: 0,
        pants_qty: 0,
        pants_price: 0,
        ...over,
    });

    const group = (rows: ReturnType<typeof row>[]) => ({
        id: 'g1',
        team_name: 'คณะสีแดง',
        fabric_color_id: '1',
        rows,
        artwork_files: [] as File[],
        artwork_urls: [] as string[],
    });

    it('marks a shirt-only line as a shirt so no pants cost is charged', () => {
        const items = buildRequestItemsFromSportsDay([group([row({ shirt_qty: 30, shirt_price: 200 })])]);

        expect(items).toHaveLength(1);
        expect(items[0].item_type).toBe('shirt');
    });

    it('marks a pants-only line as pants', () => {
        const items = buildRequestItemsFromSportsDay([group([row({ pants_qty: 12, pants_price: 150 })])]);

        expect(items).toHaveLength(1);
        expect(items[0].item_type).toBe('pants');
    });

    it('keeps shirt and pants on separate lines with their own type', () => {
        const items = buildRequestItemsFromSportsDay([
            group([row({ shirt_qty: 30, shirt_price: 200, pants_qty: 10, pants_price: 150 })]),
        ]);

        expect(items.map((item) => item.item_type)).toEqual(['shirt', 'pants']);
        expect(items.map((item) => item.quantity)).toEqual([30, 10]);
    });

    it('never emits the ambiguous generic type from the sports day form', () => {
        const items = buildRequestItemsFromSportsDay([
            group([row({ shirt_qty: 5, shirt_price: 100, pants_qty: 5, pants_price: 100 })]),
        ]);

        expect(items.every((item) => item.item_type !== 'garment')).toBe(true);
    });
});
