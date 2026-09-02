import { describe, expect, it } from 'vitest';

import { buildRequestItemsFromIndividual, rowIndividualTotal } from '@/pages/Orders/Create';

/**
 * Form 2 orders can include pants for each person. When they do, the pants must
 * reach order_items as their own line so costing, revenue and the printed work
 * sheets all see them — the same way Form 1 behaves.
 */
const person = (over = {}) => ({
    id: 'p1',
    name: 'สมชาย',
    size_group: 'adults' as const,
    size: 'M',
    number: '10',
    quantity: 1,
    unit_price: 250,
    pants_size: 'L',
    pants_quantity: 1,
    pants_unit_price: 180,
    ...over,
});

describe('form 2 with pants', () => {
    it('leaves pants out entirely when the order is shirts only', () => {
        const items = buildRequestItemsFromIndividual([person()], false);

        expect(items).toHaveLength(1);
        expect(items[0].item_type).toBe('shirt');
        expect(rowIndividualTotal(person(), false)).toBe(250);
    });

    it('adds a pants line of its own when pants are included', () => {
        const items = buildRequestItemsFromIndividual([person()], true);

        expect(items.map((item) => item.item_type)).toEqual(['shirt', 'pants']);
        expect(items[1]).toMatchObject({ size_label: 'L', quantity: 1, unit_price: 180 });
        expect(rowIndividualTotal(person(), true)).toBe(430);
    });

    it('falls back to the shirt size when no pants size was picked', () => {
        const items = buildRequestItemsFromIndividual([person({ pants_size: '' })], true);

        expect(items[1].size_label).toBe('M');
    });

    it('skips the pants line for a person who is not taking pants', () => {
        const items = buildRequestItemsFromIndividual(
            [person({ id: 'a' }), person({ id: 'b', pants_quantity: 0 })],
            true,
        );

        expect(items.map((item) => item.item_type)).toEqual(['shirt', 'pants', 'shirt']);
    });

    it('keeps each person on their own size group', () => {
        const items = buildRequestItemsFromIndividual(
            [person({ size_group: 'kids', size: 'JM', pants_size: 'JL' })],
            true,
        );

        expect(items.map((item) => item.size_group)).toEqual(['kids', 'kids']);
        expect(items.map((item) => item.size_label)).toEqual(['JM', 'JL']);
    });

    it('totals several people with pants correctly', () => {
        const rows = [person({ id: 'a' }), person({ id: 'b', quantity: 2, pants_quantity: 2 })];
        const total = rows.reduce((sum, row) => sum + rowIndividualTotal(row, true), 0);

        // (250 + 180) + (500 + 360)
        expect(total).toBe(1290);

        const lineTotal = buildRequestItemsFromIndividual(rows, true)
            .reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        expect(lineTotal).toBe(total);
    });
});
