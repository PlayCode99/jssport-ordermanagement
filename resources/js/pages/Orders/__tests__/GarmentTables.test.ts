import { describe, expect, it } from 'vitest';

import {
    buildGarmentSpecsPayload,
    buildItemsFromGarmentTables,
    createGarmentTableRow,
    createPantsTable,
    createShirtTable,
    emptyPantsSpecs,
    emptyShirtSpecs,
    garmentTableKey,
    hasGarmentTableFor,
    hydrateGarmentTables,
    pricingGroupForTier,
    resolveGarmentTableBatches,
    representativeSpecs,
    specsForKey,
    stylesFor,
} from '../garmentTables';
import type { GarmentTable, SavedOrderItem } from '../garmentTables';

const defaults = { shirt: emptyShirtSpecs(), pants: emptyPantsSpecs() };

const row = (sizeLabel: string, quantity: number, unitPrice: number) => ({
    ...createGarmentTableRow(sizeLabel),
    quantity,
    unit_price: unitPrice,
});

const shirtTable = (
    tier: Parameters<typeof createShirtTable>[0],
    style: Parameters<typeof createShirtTable>[1],
    rows: ReturnType<typeof row>[],
    specs = emptyShirtSpecs(),
): GarmentTable => ({ ...createShirtTable(tier, style, specs), rows });

const pantsTable = (
    tier: Parameters<typeof createPantsTable>[0],
    style: Parameters<typeof createPantsTable>[1],
    rows: ReturnType<typeof row>[],
    specs = emptyPantsSpecs(),
): GarmentTable => ({ ...createPantsTable(tier, style, specs), rows });

const item = (over: Partial<SavedOrderItem>): SavedOrderItem => ({
    item_type: 'separate_shirt',
    size_group: 'kids',
    size_label: 'JS',
    shirt_style: 'short',
    quantity: 5,
    unit_price: 100,
    ...over,
});

describe('the name a table, its pictures and its sheet all share', () => {
    it('spells the key the way production spells it', () => {
        expect(garmentTableKey(shirtTable('junior', 'sleeveless', []))).toBe(
            'shirt_junior_sleeveless',
        );
        expect(garmentTableKey(pantsTable('adults', 'long', []))).toBe(
            'pants_adults_long',
        );
    });

    it('offers a shirt three lengths and a pair of trousers two', () => {
        expect(stylesFor('shirt')).toEqual(['short', 'long', 'sleeveless']);
        expect(stylesFor('pants')).toEqual(['short', 'long']);
    });

    it('refuses a second table for a sheet the bill already has', () => {
        const tables = [shirtTable('kids', 'short', [])];

        expect(hasGarmentTableFor(tables, 'shirt', 'kids', 'short')).toBe(true);
        expect(hasGarmentTableFor(tables, 'shirt', 'kids', 'long')).toBe(false);
        expect(hasGarmentTableFor(tables, 'pants', 'kids', 'short')).toBe(
            false,
        );
    });
});

describe('the lines a bill is sent as', () => {
    it('carries the tier it is cut at and the rate it is billed at', () => {
        const items = buildItemsFromGarmentTables([
            shirtTable('junior', 'long', [row('S', 6, 150)]),
        ]);

        expect(items).toEqual([
            {
                item_type: 'separate_shirt',
                // ประถม is cut apart and billed as a child.
                size_group: 'kids',
                size_tier: 'junior',
                size_label: 'S',
                shirt_style: 'long',
                quantity: 6,
                unit_price: 150,
            },
        ]);
        expect(pricingGroupForTier('junior')).toBe('kids');
    });

    it('sends trousers as trousers, with a leg length and no sleeve', () => {
        const [line] = buildItemsFromGarmentTables([
            pantsTable('adults', 'short', [row('M', 2, 90)]),
        ]);

        expect(line.item_type).toBe('separate_pants');
        expect(line.pants_style).toBe('short');
        expect(line.shirt_style).toBeUndefined();
    });

    it('leaves out a row nobody is billed for', () => {
        const items = buildItemsFromGarmentTables([
            shirtTable('kids', 'short', [
                row('', 0, 0),
                row('JS', 5, 0),
                row('JM', 0, 100),
                row('JL', 3, 120),
            ]),
        ]);

        // Only the row with both a count and a price is something to make.
        expect(items).toHaveLength(1);
        expect(items[0].size_label).toBe('JL');
    });
});

describe('the sheets a bill will produce', () => {
    it('lists them in the order they come off the printer', () => {
        const batches = resolveGarmentTableBatches([
            pantsTable('adults', 'long', [row('M', 1, 10)]),
            shirtTable('adults', 'short', [row('M', 1, 10)]),
            shirtTable('junior', 'short', [row('S', 1, 10)]),
            shirtTable('kids', 'sleeveless', [row('JS', 1, 10)]),
        ]);

        expect(batches.map((batch) => batch.key)).toEqual([
            'shirt_kids_sleeveless',
            'shirt_junior_short',
            'shirt_adults_short',
            'pants_adults_long',
        ]);
    });

    it('does not offer a sheet for a table nobody ordered from', () => {
        const batches = resolveGarmentTableBatches([
            shirtTable('kids', 'short', [row('JS', 0, 0)]),
            shirtTable('kids', 'long', [row('JS', 4, 100)]),
        ]);

        expect(batches.map((batch) => batch.key)).toEqual(['shirt_kids_long']);
        expect(batches[0].quantity).toBe(4);
    });
});

describe('the spec a table carries', () => {
    it('saves one spec per sheet', () => {
        const payload = buildGarmentSpecsPayload([
            shirtTable('kids', 'short', [], {
                ...emptyShirtSpecs('2'),
                screen_text: 'เด็กแขนสั้น',
            }),
            shirtTable('kids', 'long', [], {
                ...emptyShirtSpecs('3'),
                screen_text: 'เด็กแขนยาว',
            }),
        ]);

        expect(Object.keys(payload)).toEqual([
            'shirt_kids_short',
            'shirt_kids_long',
        ]);
        expect(payload.shirt_kids_short).toMatchObject({
            shirt_type_id: '2',
            screen_text: 'เด็กแขนสั้น',
        });
        expect(payload.shirt_kids_long).toMatchObject({
            shirt_type_id: '3',
            screen_text: 'เด็กแขนยาว',
        });
    });

    it('reads a bill saved with one spec per sheet', () => {
        const decoded = {
            garment_specs: {
                shirt_kids_long: { shirt_type_id: '7', screen_text: 'ยาว' },
            },
            shirt_specs: { shirt_type_id: '1', screen_text: 'ก้อนกลาง' },
        };

        expect(
            specsForKey(decoded, 'shirt_kids_long', 'shirt', defaults),
        ).toMatchObject({ shirt_type_id: '7', screen_text: 'ยาว' });
    });

    /**
     * The whole point of the fallback: a bill written when an order had one
     * spec for everything must reopen with that spec on every table, not with
     * blanks the shop never agreed to.
     */
    it('gives every table of an older bill the one spec it was sewn from', () => {
        const decoded = {
            shirt_specs: { shirt_type_id: '4', screen_text: 'สเปกเดิม' },
            pants_specs: { pants_type_id: '9', screen_text: 'กางเกงเดิม' },
        };

        expect(
            specsForKey(decoded, 'shirt_kids_short', 'shirt', defaults),
        ).toMatchObject({ shirt_type_id: '4', screen_text: 'สเปกเดิม' });
        expect(
            specsForKey(decoded, 'shirt_adults_sleeveless', 'shirt', defaults),
        ).toMatchObject({ shirt_type_id: '4', screen_text: 'สเปกเดิม' });
        expect(
            specsForKey(decoded, 'pants_adults_long', 'pants', defaults),
        ).toMatchObject({ pants_type_id: '9', screen_text: 'กางเกงเดิม' });
    });

    it('completes a half-filled spec instead of blanking the rest', () => {
        const specs = specsForKey(
            {
                garment_specs: {
                    shirt_kids_short: { screen_text: 'มีแค่นี้' },
                },
            },
            'shirt_kids_short',
            'shirt',
            { shirt: emptyShirtSpecs('5'), pants: emptyPantsSpecs() },
        );

        expect(specs).toMatchObject({
            screen_text: 'มีแค่นี้',
            shirt_type_id: '5',
        });
    });
});

describe('reopening a saved bill', () => {
    it('splits a bill that mixed lengths into the tables it is cut as', () => {
        const tables = hydrateGarmentTables(
            [
                item({ size_label: 'JS', shirt_style: 'short' }),
                item({ size_label: 'JM', shirt_style: 'long' }),
                item({ size_label: 'JL', shirt_style: 'short' }),
            ],
            {},
            defaults,
        );

        expect(tables.map(garmentTableKey)).toEqual([
            'shirt_kids_short',
            'shirt_kids_long',
        ]);
        expect(tables[0].rows.map((r) => r.size_label)).toEqual(['JS', 'JL']);
        expect(tables[1].rows.map((r) => r.size_label)).toEqual(['JM']);
    });

    it('keeps a line written before tiers existed on the tier it was cut at', () => {
        const tables = hydrateGarmentTables(
            [
                item({ size_group: 'kids', size_tier: null }),
                item({
                    size_group: 'adults',
                    size_tier: null,
                    size_label: 'M',
                }),
            ],
            {},
            defaults,
        );

        expect(tables.map((table) => table.tier)).toEqual(['kids', 'adults']);
    });

    it('reads a ประถม line onto a table of its own', () => {
        const tables = hydrateGarmentTables(
            [
                item({ size_group: 'kids', size_tier: 'kids' }),
                item({
                    size_group: 'kids',
                    size_tier: 'junior',
                    size_label: 'S',
                }),
            ],
            {},
            defaults,
        );

        expect(tables.map(garmentTableKey)).toEqual([
            'shirt_kids_short',
            'shirt_junior_short',
        ]);
    });

    it('keeps each row at the price it was sold for', () => {
        const [table] = hydrateGarmentTables(
            [
                item({ size_label: 'JS', quantity: 4, unit_price: 120 }),
                item({ size_label: 'JM', quantity: 7, unit_price: 135 }),
            ],
            {},
            defaults,
        );

        expect(table.rows).toMatchObject([
            { size_label: 'JS', quantity: 4, unit_price: 120 },
            { size_label: 'JM', quantity: 7, unit_price: 135 },
        ]);
    });

    it('hands each rebuilt table the spec its sheet was saved with', () => {
        const [shirt, pants] = hydrateGarmentTables(
            [
                item({}),
                item({
                    item_type: 'separate_pants',
                    pants_style: 'long',
                    shirt_style: null,
                }),
            ],
            {
                garment_specs: {
                    shirt_kids_short: { screen_text: 'เสื้อ' },
                    pants_kids_long: { screen_text: 'กางเกง' },
                },
            },
            defaults,
        );

        expect(shirt.specs).toMatchObject({ screen_text: 'เสื้อ' });
        expect(pants.specs).toMatchObject({ screen_text: 'กางเกง' });
    });

    it('ignores a line that is neither a shirt nor a pair of trousers', () => {
        const tables = hydrateGarmentTables(
            [item({ item_type: 'set' }), item({ item_type: 'delivery_fee' })],
            {},
            defaults,
        );

        expect(tables).toEqual([]);
    });

    it('survives a round trip without changing what the bill says', () => {
        const original = [
            shirtTable('junior', 'sleeveless', [row('S', 3, 210)]),
            pantsTable('adults', 'long', [row('L', 2, 180)]),
        ];

        const reopened = hydrateGarmentTables(
            buildItemsFromGarmentTables(original),
            { garment_specs: buildGarmentSpecsPayload(original) },
            defaults,
        );

        expect(reopened.map(garmentTableKey)).toEqual([
            'shirt_junior_sleeveless',
            'pants_adults_long',
        ]);
        expect(buildItemsFromGarmentTables(reopened)).toEqual(
            buildItemsFromGarmentTables(original),
        );
    });
});

/**
 * `order_specifications` keeps flat columns the server still insists on —
 * pattern, fabric, collar. Forms 1 and 4 moved their spec onto the tables, and
 * for a while those columns were still read off the retired bill-wide card:
 * the counter filled everything in, and the bill came back refused for a
 * pattern and a fabric that were plainly on the screen.
 */
describe('the spec the flat columns are written from', () => {
    const filled = (
        over: Partial<ReturnType<typeof emptyShirtSpecs>> = {},
    ) => ({
        ...emptyShirtSpecs('2'),
        pattern_id: '11',
        fabric_id: '22',
        ...over,
    });

    it("takes a table's spec when the bill is written on tables", () => {
        const tables = [
            { ...createShirtTable('kids', 'short', filled()), rows: [] },
            {
                ...createPantsTable('kids', 'short', {
                    ...emptyPantsSpecs('4'),
                    pattern_id: '33',
                    fabric_id: '44',
                }),
                rows: [],
            },
        ];

        const picked = representativeSpecs(
            true,
            tables,
            emptyShirtSpecs(),
            emptyPantsSpecs(),
        );

        expect(picked.shirt.pattern_id).toBe('11');
        expect(picked.shirt.fabric_id).toBe('22');
        expect(picked.pants.pattern_id).toBe('33');
    });

    it('keeps the bill-wide card for the forms that still sell one spec', () => {
        const picked = representativeSpecs(
            false,
            [{ ...createShirtTable('kids', 'short', filled()), rows: [] }],
            { ...emptyShirtSpecs('9'), pattern_id: '99' },
            emptyPantsSpecs(),
        );

        expect(picked.shirt.pattern_id).toBe('99');
    });

    it('falls back to the card when the bill has no table of that garment', () => {
        const picked = representativeSpecs(
            true,
            [{ ...createShirtTable('kids', 'short', filled()), rows: [] }],
            emptyShirtSpecs(),
            { ...emptyPantsSpecs('4'), pattern_id: '77' },
        );

        expect(picked.shirt.pattern_id).toBe('11');
        expect(picked.pants.pattern_id).toBe('77');
    });
});
