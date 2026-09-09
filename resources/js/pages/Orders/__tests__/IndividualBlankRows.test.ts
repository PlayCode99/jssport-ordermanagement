import { describe, expect, it } from 'vitest';

import {
    buildRequestItemsFromIndividual,
    isBlankPersonalizationRow,
    rowIndividualTotal,
} from '@/pages/Orders/Create';

/**
 * Form 2 now opens with three blank people ready to type into. Those rows carry
 * quantity 1 from the moment they appear, so without an emptiness check every
 * order written on this form would pick up junk shirts sized "-".
 */
const blankRow = (over = {}) => ({
    id: 'p1',
    role: 'player' as const,
    name: '',
    size_group: 'adults' as const,
    size: '',
    shirt_style: 'short' as const,
    number: '',
    quantity: 1,
    unit_price: 0,
    pants_size: '',
    pants_style: 'short' as const,
    pants_number: '',
    pants_quantity: 0,
    pants_unit_price: 0,
    ...over,
});

describe('blank rows on the individual form', () => {
    it('treats an untouched row as blank even though its quantity is 1', () => {
        expect(isBlankPersonalizationRow(blankRow())).toBe(true);
    });

    it.each([
        ['a name', { name: 'สมชาย' }],
        ['a size', { size: 'M' }],
        ['a number', { number: '10' }],
        ['a pants size', { pants_size: 'L' }],
    ])('does not treat a row carrying %s as blank', (_label, over) => {
        expect(isBlankPersonalizationRow(blankRow(over))).toBe(false);
    });

    it.each([
        ['a shirt price', { unit_price: 250 }],
        ['a pants price', { pants_unit_price: 180 }],
        ['a pants quantity', { pants_quantity: 1 }],
    ])('still treats a row carrying only %s as blank', (_label, over) => {
        // The linked price column copies the first person's price into every
        // row on the list. If money counted as content, switching the link on
        // would turn all the untouched rows into people on the order.
        expect(isBlankPersonalizationRow(blankRow(over))).toBe(true);
    });

    it('adds nobody to the order when a linked price reaches untouched rows', () => {
        const items = buildRequestItemsFromIndividual(
            [
                blankRow({
                    id: 'p1',
                    name: 'สมชาย',
                    size: 'M',
                    number: '10',
                    unit_price: 250,
                }),
                blankRow({ id: 'p2', unit_price: 250 }),
                blankRow({ id: 'p3', unit_price: 250 }),
            ],
            false,
        );

        expect(items).toHaveLength(1);
        expect(items[0].size_label).toBe('M');
    });

    it('produces no order items for the rows the counter never filled in', () => {
        const items = buildRequestItemsFromIndividual(
            [blankRow(), blankRow({ id: 'p2' }), blankRow({ id: 'p3' })],
            true,
        );

        expect(items).toEqual([]);
    });

    it('keeps the filled-in people when blank rows sit alongside them', () => {
        const items = buildRequestItemsFromIndividual(
            [
                blankRow(),
                blankRow({
                    id: 'p2',
                    name: 'สมชาย',
                    size: 'M',
                    number: '10',
                    unit_price: 250,
                }),
                blankRow({ id: 'p3' }),
            ],
            false,
        );

        expect(items).toEqual([
            {
                item_type: 'shirt',
                size_group: 'adults',
                size_label: 'M',
                shirt_style: 'short',
                quantity: 1,
                unit_price: 250,
            },
        ]);
    });

    it('adds nothing to the order total for a blank row', () => {
        expect(rowIndividualTotal(blankRow(), true)).toBe(0);
    });
});
