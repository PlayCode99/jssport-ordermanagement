import { describe, expect, it } from 'vitest';

import {
    garmentRowTotal,
    garmentRowsTotals,
    isBlankGarmentRow,
    resolveRequestItems,
    usesLegacySizeRows,
} from '@/pages/Orders/Create';

/**
 * Forms 1 and 4 sell shirts and trousers as separate pieces. Each garment
 * keeps its own list of sizes, every line is priced per piece, and a line
 * reaches production as one order item of that garment.
 *
 * A bill written before the set was retired still totals and bills the way it
 * was sold — the data says which layout a bill is on, so nothing has to
 * remember to pass a flag around.
 */
const garmentRow = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    size_label: 'M',
    style: 'short' as const,
    quantity: 0,
    unit_price: 0,
    ...over,
});

const table = (over: Record<string, unknown> = {}) => ({
    id: 't-adults',
    table_type: 'adults' as const,
    title: 'ตารางไซส์ผู้ใหญ่',
    artwork_files: [],
    saved_artwork: [],
    shirt_rows: [],
    pants_rows: [],
    rows: [],
    ...over,
});

const itemsFor = (tables: ReturnType<typeof table>[]) =>
    resolveRequestItems('matrix', tables as never, [], [], false);

describe('a garment row', () => {
    it('costs quantity times the price of one piece', () => {
        expect(
            garmentRowTotal(garmentRow({ quantity: 20, unit_price: 100 })),
        ).toBe(2000);
    });

    it('is blank until it has a quantity, whatever else was touched', () => {
        expect(isBlankGarmentRow(garmentRow())).toBe(true);
        // A size picked and then thought better of is still nothing ordered.
        expect(isBlankGarmentRow(garmentRow({ size_label: 'L' }))).toBe(true);
        expect(isBlankGarmentRow(garmentRow({ unit_price: 100 }))).toBe(true);
        expect(isBlankGarmentRow(garmentRow({ quantity: 1 }))).toBe(false);
    });

    it('totals pieces and money over the rows that will reach the bill', () => {
        expect(
            garmentRowsTotals([
                garmentRow({ quantity: 20, unit_price: 100 }),
                garmentRow({ id: 'r2', quantity: 20, unit_price: 120 }),
                garmentRow({ id: 'r3', unit_price: 120 }),
            ]),
        ).toEqual({ quantity: 40, amount: 4400 });
    });
});

describe('what Form 1 sends production', () => {
    it('sends one line per garment row, as a separate piece', () => {
        const items = itemsFor([
            table({
                shirt_rows: [
                    garmentRow({ quantity: 20, unit_price: 100 }),
                    garmentRow({
                        id: 'r2',
                        size_label: 'L',
                        style: 'long',
                        quantity: 10,
                        unit_price: 120,
                    }),
                ],
                pants_rows: [
                    garmentRow({ id: 'p1', quantity: 20, unit_price: 90 }),
                ],
            }),
        ]);

        expect(items).toEqual([
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
            {
                item_type: 'separate_pants',
                size_group: 'adults',
                size_label: 'M',
                pants_style: 'short',
                quantity: 20,
                unit_price: 90,
            },
        ]);
        // No sets: the bill is pieces now, however they are grouped on paper.
        expect(items.some((item) => item.item_type === 'set')).toBe(false);
    });

    it('never sends a row nobody filled in', () => {
        expect(
            itemsFor([
                table({
                    shirt_rows: [garmentRow(), garmentRow({ id: 'r2' })],
                    pants_rows: [garmentRow({ id: 'p1' })],
                }),
            ]),
        ).toEqual([]);
    });

    it('still sends a piece given away, because it is a piece to cut', () => {
        const items = itemsFor([
            table({ shirt_rows: [garmentRow({ quantity: 5 })] }),
        ]);

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ quantity: 5, unit_price: 0 });
    });

    it('keeps the kids and adult tables in their own size group', () => {
        const items = itemsFor([
            table({
                id: 't-kids',
                table_type: 'kids',
                shirt_rows: [
                    garmentRow({
                        size_label: 'JM',
                        quantity: 5,
                        unit_price: 80,
                    }),
                ],
            }),
            table({
                shirt_rows: [garmentRow({ quantity: 20, unit_price: 100 })],
            }),
        ]);

        expect(items.map((item) => item.size_group)).toEqual([
            'kids',
            'adults',
        ]);
    });

    it('writes a size nobody chose as "-" rather than leaving it empty', () => {
        const items = itemsFor([
            table({
                shirt_rows: [
                    garmentRow({ size_label: '', quantity: 3, unit_price: 50 }),
                ],
            }),
        ]);

        expect(items[0].size_label).toBe('-');
    });

    it('bills Form 4 exactly as Form 1, so production reads one shape', () => {
        const tables = [
            table({
                shirt_rows: [garmentRow({ quantity: 20, unit_price: 100 })],
            }),
        ];

        expect(
            resolveRequestItems('pe_uniform', tables as never, [], [], false),
        ).toEqual(
            resolveRequestItems('matrix', tables as never, [], [], false),
        );
    });
});

describe('a bill written before the set was retired', () => {
    const legacyRow = {
        id: 'legacy-1',
        size_label: 'M',
        shirt_style: 'short' as const,
        pants_style: 'short' as const,
        set_shirt_qty: 4,
        set_pants_qty: 4,
        set_price: 300,
        separate_shirt_qty: 0,
        separate_pants_qty: 0,
        separate_shirt_price: 0,
        separate_pants_price: 0,
    };

    it('is recognised from its own rows, with no flag passed around', () => {
        expect(usesLegacySizeRows([table() as never])).toBe(false);
        expect(
            usesLegacySizeRows([table({ rows: [legacyRow] }) as never]),
        ).toBe(true);
    });

    it('still bills as the set it was sold as', () => {
        const items = itemsFor([table({ rows: [legacyRow] })]);

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            item_type: 'set',
            quantity: 4,
            unit_price: 300,
        });
    });

    it('is not double-billed if garment rows are somehow present too', () => {
        // The form shows one layout or the other, never both; this pins the
        // rule down so a future change cannot quietly bill a bill twice.
        const items = itemsFor([
            table({
                rows: [legacyRow],
                shirt_rows: [garmentRow({ quantity: 20, unit_price: 100 })],
            }),
        ]);

        expect(items).toHaveLength(1);
        expect(items[0].item_type).toBe('set');
    });
});
