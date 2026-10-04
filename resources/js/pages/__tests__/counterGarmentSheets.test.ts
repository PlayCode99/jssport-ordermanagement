import { describe, expect, it } from 'vitest';

import {
    buildGarmentSheets,
    garmentSheetTotals,
    groupSpecRows,
    sheetSizeSummary,
    specDifferences,
} from '@/pages/counterGarmentSheets';

/**
 * The counter reads a bill back as the sheets the floor makes it on, keyed
 * `{garment}_{tier}_{length}` exactly as the order form and production key
 * them. These pin the rules both the dialog and the printed receipt rely on.
 */
const shirt = (over: Record<string, unknown> = {}) => ({
    item_type: 'separate_shirt',
    size_group: 'adults',
    size_label: 'M',
    shirt_style: 'short',
    quantity: 10,
    unit_price: 200,
    total_price: 2000,
    ...over,
});

const pants = (over: Record<string, unknown> = {}) => ({
    item_type: 'separate_pants',
    size_group: 'adults',
    size_label: 'M',
    pants_style: 'long',
    quantity: 4,
    unit_price: 150,
    total_price: 600,
    ...over,
});

const fallbackShirt = [{ label: 'เนื้อผ้า', value: 'ผ้าเดิม' }];
const fallbackPants = [{ label: 'แบบขา', value: 'ขาตรง' }];

describe('the sheets a bill is read back as', () => {
    it('keys a sheet by garment, tier and length the way production does', () => {
        const sheets = buildGarmentSheets(
            [
                shirt(),
                shirt({ size_group: 'kids', size_label: 'JM' }),
                shirt({
                    size_group: 'kids',
                    size_tier: 'junior',
                    size_label: 'JL',
                }),
                shirt({ shirt_style: 'sleeveless' }),
                pants(),
            ],
            undefined,
            fallbackShirt,
            fallbackPants,
        );

        expect(sheets.map((sheet) => [sheet.key, sheet.title])).toEqual([
            ['shirt_kids_short', 'เสื้อเด็ก · แขนสั้น'],
            ['shirt_junior_short', 'เสื้อประถม - มัธยมต้น · แขนสั้น'],
            ['shirt_adults_short', 'เสื้อผู้ใหญ่ · แขนสั้น'],
            ['shirt_adults_sleeveless', 'เสื้อผู้ใหญ่ · แขนกุด'],
            ['pants_adults_long', 'กางเกงผู้ใหญ่ · ขายาว'],
        ]);
    });

    it('reads a line saved before tiers by the rate it was billed at', () => {
        const [sheet] = buildGarmentSheets(
            [shirt({ size_group: 'kids', size_tier: null })],
            undefined,
            fallbackShirt,
            fallbackPants,
        );

        expect(sheet.tier).toBe('kids');
    });

    it('files a line with no length as unspecified rather than short', () => {
        const [sheet] = buildGarmentSheets(
            [pants({ pants_style: null })],
            undefined,
            fallbackShirt,
            fallbackPants,
        );

        expect(sheet.key).toBe('pants_adults_unspecified');
        expect(sheet.title).toBe('กางเกงผู้ใหญ่');
    });

    it('never gives trousers a sleeveless sheet', () => {
        const [sheet] = buildGarmentSheets(
            [pants({ pants_style: 'sleeveless' })],
            undefined,
            fallbackShirt,
            fallbackPants,
        );

        expect(sheet.key).toBe('pants_adults_unspecified');
    });

    it('leaves out a line that is not one garment', () => {
        expect(
            buildGarmentSheets(
                [shirt({ item_type: 'set' })],
                undefined,
                fallbackShirt,
                fallbackPants,
            ),
        ).toEqual([]);
    });

    it('gathers one size at one price into one line, in size order', () => {
        const [sheet] = buildGarmentSheets(
            [
                shirt({ size_label: 'L', quantity: 1, total_price: 200 }),
                shirt({ size_label: 'S', quantity: 2, total_price: 400 }),
                shirt({ size_label: 'L', quantity: 3, total_price: 600 }),
                shirt({
                    size_label: 'L',
                    quantity: 1,
                    unit_price: 250,
                    total_price: 250,
                }),
            ],
            undefined,
            fallbackShirt,
            fallbackPants,
        );

        expect(
            sheet.lines.map((line) => [
                line.sizeLabel,
                line.quantity,
                line.unitPrice,
                line.total,
            ]),
        ).toEqual([
            ['S', 2, 200, 400],
            ['L', 4, 200, 800],
            ['L', 1, 250, 250],
        ]);
        expect([sheet.quantity, sheet.amount]).toEqual([7, 1450]);
    });

    it('keeps the total the bill was saved with', () => {
        const [sheet] = buildGarmentSheets(
            [shirt({ quantity: 10, unit_price: 200, total_price: 1800 })],
            undefined,
            fallbackShirt,
            fallbackPants,
        );

        expect(sheet.amount).toBe(1800);
    });
});

describe('the spec under each sheet', () => {
    it('is the one saved under the sheet’s own key', () => {
        const sheets = buildGarmentSheets(
            [shirt(), shirt({ shirt_style: 'long' }), pants()],
            {
                shirt_adults_short: [{ label: 'แพทเทิร์น', value: 'สั้น' }],
                shirt_adults_long: [{ label: 'แพทเทิร์น', value: 'ยาว' }],
                pants_adults_long: [{ label: 'แบบขา', value: 'ขาจั๊ม' }],
            },
            fallbackShirt,
            fallbackPants,
        );

        expect(sheets.map((sheet) => sheet.spec[0].value)).toEqual([
            'สั้น',
            'ยาว',
            'ขาจั๊ม',
        ]);
    });

    it('falls back to the garment’s single spec on a bill saved before specs were split', () => {
        const sheets = buildGarmentSheets(
            [shirt(), shirt({ shirt_style: 'long' }), pants()],
            undefined,
            fallbackShirt,
            fallbackPants,
        );

        expect(sheets.map((sheet) => sheet.spec)).toEqual([
            fallbackShirt,
            fallbackShirt,
            fallbackPants,
        ]);
    });

    it('falls back when the sheet’s own spec is empty', () => {
        const [sheet] = buildGarmentSheets(
            [shirt()],
            { shirt_adults_short: [] },
            fallbackShirt,
            fallbackPants,
        );

        expect(sheet.spec).toBe(fallbackShirt);
    });
});

describe('what the sheets come to', () => {
    it('adds up to every line on the bill, per garment and in all', () => {
        const items = [
            shirt(),
            shirt({ size_group: 'kids', quantity: 5, total_price: 750 }),
            pants(),
        ];
        const totals = garmentSheetTotals(
            buildGarmentSheets(items, undefined, fallbackShirt, fallbackPants),
        );

        expect(totals).toEqual({
            shirt: { quantity: 15, amount: 2750 },
            pants: { quantity: 4, amount: 600 },
            quantity: 19,
            amount: 3350,
        });
        expect(totals.amount).toBe(
            items.reduce((sum, item) => sum + item.total_price, 0),
        );
    });
});

describe('a spec written out the way a person reads it', () => {
    it('deals the settings into pattern and fabric, shape, then decoration', () => {
        const groups = groupSpecRows(
            [
                { label: 'ข้อความสกรีน', value: 'JS SPORT' },
                { label: 'แบบคอ', value: 'คอกลม' },
                { label: 'เนื้อผ้า', value: 'ไมโคร' },
                { label: 'แพทเทิร์น', value: 'โปโล' },
            ],
            'shirt',
        );

        expect(
            groups.map((group) => [
                group.title,
                group.rows.map((row) => row.label),
            ]),
        ).toEqual([
            ['แพทเทิร์น · ผ้า', ['แพทเทิร์น', 'เนื้อผ้า']],
            ['ทรงเสื้อ', ['แบบคอ']],
            ['สกรีน · ปัก · ซับ', ['ข้อความสกรีน']],
        ]);
    });

    it('leads with the garment type, which tells one sheet from another', () => {
        const groups = groupSpecRows(
            [
                { label: 'แพทเทิร์น', value: 'โปโล' },
                { label: 'แบบเสื้อ', value: 'เสื้อประตู' },
            ],
            'shirt',
        );

        expect(groups[0].rows.map((row) => row.label)).toEqual([
            'แบบเสื้อ',
            'แพทเทิร์น',
        ]);
        expect(
            groupSpecRows([{ label: 'แบบกางเกง', value: 'ขาสั้น' }], 'pants')[0]
                .rows[0].label,
        ).toBe('แบบกางเกง');
    });

    it('gives trousers a shape group of their own', () => {
        const groups = groupSpecRows(
            [{ label: 'แบบขา', value: 'ขาจั๊ม' }],
            'pants',
        );

        expect(groups.map((group) => group.title)).toEqual(['ทรงกางเกง']);
    });

    it('never drops a setting it does not know', () => {
        const groups = groupSpecRows(
            [{ label: 'ป้ายคอ', value: 'ทอผ้า' }],
            'shirt',
        );

        expect(groups).toEqual([
            { title: 'อื่นๆ', rows: [{ label: 'ป้ายคอ', value: 'ทอผ้า' }] },
        ]);
    });

    it('states the sizes a sheet covers and how many of each', () => {
        const [sheet] = buildGarmentSheets(
            [
                shirt({ size_label: 'L', quantity: 3 }),
                shirt({ size_label: 'M', quantity: 2 }),
                shirt({ size_label: 'L', quantity: 1, unit_price: 250 }),
            ],
            undefined,
            fallbackShirt,
            fallbackPants,
        );

        expect(sheetSizeSummary(sheet)).toBe('M 2 · L 4');
    });
});

describe('the settings marked for the floor to check', () => {
    const sheets = buildGarmentSheets(
        [shirt(), shirt({ shirt_style: 'long' }), pants()],
        {
            shirt_adults_short: [
                { label: 'เนื้อผ้า', value: 'ไมโคร' },
                { label: 'ปลายแขน', value: 'ธรรมดา' },
            ],
            shirt_adults_long: [
                { label: 'เนื้อผ้า', value: 'ไมโคร' },
                { label: 'ปลายแขน', value: 'จั๊ม' },
            ],
            pants_adults_long: [{ label: 'เนื้อผ้า', value: 'วอร์ม' }],
        },
        fallbackShirt,
        fallbackPants,
    );

    it('are the ones that differ between sheets of one garment', () => {
        expect([...specDifferences(sheets)].sort()).toEqual([
            'shirt_adults_long|ปลายแขน',
            'shirt_adults_short|ปลายแขน',
        ]);
    });

    it('never compare a shirt with trousers', () => {
        // The trousers' fabric differs from the shirts' and is not marked:
        // they are different garments, not a mistake.
        expect(specDifferences(sheets).has('pants_adults_long|เนื้อผ้า')).toBe(
            false,
        );
    });

    it('are none when a garment has only one sheet', () => {
        expect(specDifferences([sheets[0], sheets[2]]).size).toBe(0);
    });
});
