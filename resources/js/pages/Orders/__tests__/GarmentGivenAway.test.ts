import { describe, expect, it } from 'vitest';

import {
    buildRequestItemsFromIndividual,
    resolveIndividualArtworkBatches,
    resolveRequestItems,
} from '@/pages/Orders/Create';

/**
 * A garment can cost nothing.
 *
 * The shop gives them away: a replacement for one it got wrong, a sample, the
 * extra shirt thrown in on a big order. The floor still cuts and sews them, so
 * they belong on the bill and on the production sheet at ฿0.
 *
 * Every form used to read "no price" as "no line" and drop it on the way to
 * the server. The counter typed it, saw it in the table, and watched it vanish
 * on save — no message, no red box, just a bill that no longer matched what
 * was agreed. These cover the forms the other suites do not reach.
 */
const person = (over = {}) => ({
    id: 'p1',
    role: 'player' as const,
    name: 'สมชาย',
    size_group: 'adults' as const,
    size: 'M',
    shirt_style: 'short',
    number: '10',
    quantity: 1,
    unit_price: 250,
    pants_size: 'L',
    pants_style: 'short',
    pants_number: '10',
    pants_quantity: 1,
    pants_unit_price: 180,
    ...over,
});

describe('Form 2: a person given a garment for nothing', () => {
    it('still bills the shirt', () => {
        const items = buildRequestItemsFromIndividual(
            [person({ unit_price: 0 })],
            false,
        );

        expect(items).toHaveLength(1);
        expect(items[0].quantity).toBe(1);
        expect(items[0].unit_price).toBe(0);
    });

    it('still bills the trousers, which used to drop off silently', () => {
        const items = buildRequestItemsFromIndividual(
            [person({ pants_unit_price: 0 })],
            true,
        );

        const pants = items.find((item) => item.item_type === 'pants');

        expect(pants).toBeDefined();
        expect(pants?.quantity).toBe(1);
        expect(pants?.unit_price).toBe(0);
    });

    it('still prints a trousers sheet for them', () => {
        // The line reaching the bill is not enough: without a batch the floor
        // never gets a sheet to cut them from.
        const batches = resolveIndividualArtworkBatches(
            [person({ pants_unit_price: 0 })],
            true,
        );

        expect(batches.map((batch) => batch.key)).toContain(
            'pants_adults_short',
        );
    });

    it('leaves a person nobody typed in alone', () => {
        // A price of nothing is a decision; an untouched row is not.
        const items = buildRequestItemsFromIndividual(
            [
                person({
                    name: '',
                    size: '',
                    number: '',
                    pants_size: '',
                    pants_number: '',
                }),
            ],
            true,
        );

        expect(items).toEqual([]);
    });
});

describe('a bill still sold on the retired set-and-separate rows', () => {
    const sizeRow = (over = {}) => ({
        id: 'r1',
        size_label: 'M',
        set_shirt_qty: 0,
        set_pants_qty: 0,
        set_price: 0,
        separate_shirt_qty: 0,
        separate_pants_qty: 0,
        separate_shirt_price: 0,
        separate_pants_price: 0,
        ...over,
    });

    // Through the same door the form uses, so this covers the dispatch too.
    const itemsFor = (over = {}) =>
        resolveRequestItems(
            'matrix',
            [
                {
                    id: 't1',
                    table_type: 'adults',
                    title: 'ตารางไซส์ผู้ใหญ่',
                    rows: [sizeRow(over)],
                    shirt_rows: [],
                    pants_rows: [],
                } as never,
            ],
            [],
            [],
            false,
            [],
        );

    it('bills a set counted but not charged for', () => {
        const items = itemsFor({
            set_shirt_qty: 3,
            set_pants_qty: 3,
            set_price: 0,
        });

        expect(items).toHaveLength(1);
        expect(items[0].quantity).toBe(3);
        expect(items[0].unit_price).toBe(0);
    });

    it('bills a separate shirt and a separate pair given away', () => {
        const items = itemsFor({
            separate_shirt_qty: 2,
            separate_shirt_price: 0,
            separate_pants_qty: 4,
            separate_pants_price: 0,
        });

        expect(
            items.map((item) => [
                item.item_type,
                item.quantity,
                item.unit_price,
            ]),
        ).toEqual([
            ['separate_shirt', 2, 0],
            ['separate_pants', 4, 0],
        ]);
    });

    it('leaves a row nothing was counted on alone', () => {
        expect(itemsFor()).toEqual([]);
    });
});
