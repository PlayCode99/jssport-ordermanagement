import { describe, expect, it } from 'vitest';

import { buildRequestItemsFromIndividual } from '@/pages/Orders/Create';

/**
 * Form 2 now records a sleeve length per person and a leg length per person.
 * Production batches by those lengths, so a row that loses its length on the
 * way to order_items lands in the "ไม่ระบุ" pile and the floor prints the
 * wrong number of sheets.
 */
const person = (over = {}) => ({
    id: 'p1',
    role: 'player' as const,
    name: 'สมชาย',
    size_group: 'adults' as const,
    size: 'M',
    shirt_style: 'short' as const,
    number: '10',
    quantity: 1,
    unit_price: 250,
    pants_size: 'L',
    pants_style: 'short' as const,
    pants_number: '10',
    pants_quantity: 1,
    pants_unit_price: 180,
    ...over,
});

/** The batch key production groups by: garment x size group x length. */
const batchKey = (item: {
    item_type: string;
    size_group: string;
    shirt_style?: string;
    pants_style?: string;
}): string =>
    [
        item.item_type,
        item.size_group,
        item.shirt_style ?? item.pants_style ?? 'unspecified',
    ].join('_');

describe('sleeve and leg length on the individual form', () => {
    it('sends the sleeve length chosen for a person', () => {
        const [shirt] = buildRequestItemsFromIndividual(
            [person({ shirt_style: 'long' as const })],
            false,
        );

        expect(shirt.shirt_style).toBe('long');
    });

    it('sends the leg length chosen for a person', () => {
        const items = buildRequestItemsFromIndividual(
            [person({ pants_style: 'long' as const })],
            true,
        );

        expect(items[1].pants_style).toBe('long');
    });

    it('keeps the two lengths independent of each other', () => {
        const items = buildRequestItemsFromIndividual(
            [person({ shirt_style: 'long' as const })],
            true,
        );

        expect(items[0].shirt_style).toBe('long');
        expect(items[1].pants_style).toBe('short');
    });

    it('never labels a shirt with a leg length or the other way round', () => {
        const items = buildRequestItemsFromIndividual([person()], true);

        expect(items[0].pants_style).toBeUndefined();
        expect(items[1].shirt_style).toBeUndefined();
    });

    it('splits a mixed list into the eight batches production prints', () => {
        const rows = [
            person({
                id: '1',
                size_group: 'kids' as const,
                size: 'JM',
                pants_size: 'JM',
            }),
            person({
                id: '2',
                size_group: 'kids' as const,
                size: 'JM',
                pants_size: 'JM',
                shirt_style: 'long' as const,
                pants_style: 'long' as const,
            }),
            person({ id: '3' }),
            person({
                id: '4',
                shirt_style: 'long' as const,
                pants_style: 'long' as const,
            }),
        ];

        const keys = new Set(
            buildRequestItemsFromIndividual(rows, true).map(batchKey),
        );

        expect([...keys].sort()).toEqual([
            'pants_adults_long',
            'pants_adults_short',
            'pants_kids_long',
            'pants_kids_short',
            'shirt_adults_long',
            'shirt_adults_short',
            'shirt_kids_long',
            'shirt_kids_short',
        ]);
    });

    it('leaves a shirts-only list with four batches', () => {
        const rows = [
            person({ id: '1', size_group: 'kids' as const, size: 'JM' }),
            person({
                id: '2',
                size_group: 'kids' as const,
                size: 'JM',
                shirt_style: 'long' as const,
            }),
            person({ id: '3' }),
            person({ id: '4', shirt_style: 'long' as const }),
        ];

        const keys = new Set(
            buildRequestItemsFromIndividual(rows, false).map(batchKey),
        );

        expect(keys.size).toBe(4);
    });
});
