import { describe, expect, it } from 'vitest';

import {
    individualSheets,
    savedIndividualSheetSpecs,
} from '@/pages/Orders/Create';
import { emptyPantsSpecs, emptyShirtSpecs } from '@/pages/Orders/garmentTables';

/**
 * Form 2's list of people is cut a sheet at a time, keyed exactly as Form 1
 * keys a table — `{garment}_{tier}_{length}` — so the counter, the production
 * board and the costing all read the same name.
 */
const person = (over: Record<string, unknown> = {}) =>
    ({
        id: Math.random().toString(36),
        role: 'player',
        name: 'สมชาย',
        size_group: 'adults',
        size: 'M',
        shirt_style: 'short',
        number: '10',
        quantity: 1,
        unit_price: 250,
        pants_size: '',
        pants_style: 'short',
        pants_number: '',
        pants_quantity: 0,
        pants_unit_price: 0,
        ...over,
    }) as never;

describe('the sheets a list of people is cut on', () => {
    it('puts everyone in one length on one sheet, and counts them', () => {
        expect(
            individualSheets([person(), person({ name: 'สมหญิง' })], false).map(
                (sheet) => [sheet.key, sheet.title, sheet.people],
            ),
        ).toEqual([['shirt_adults_short', 'เสื้อผู้ใหญ่ · แขนสั้น', 2]]);
    });

    it('splits long and short sleeves, and kids from adults', () => {
        expect(
            individualSheets(
                [
                    person({ shirt_style: 'long' }),
                    person(),
                    person({ size_group: 'kids', size: 'JM' }),
                    person({ shirt_style: 'sleeveless' }),
                ],
                false,
            ).map((sheet) => sheet.key),
        ).toEqual([
            'shirt_kids_short',
            'shirt_adults_short',
            'shirt_adults_long',
            'shirt_adults_sleeveless',
        ]);
    });

    it('adds trousers only for people who ordered them, when the bill sells them', () => {
        const people = [
            person({ pants_quantity: 1, pants_style: 'long' }),
            person({ name: 'สมหญิง' }),
        ];

        expect(
            individualSheets(people, false).map((sheet) => sheet.key),
        ).toEqual(['shirt_adults_short']);
        expect(
            individualSheets(people, true).map((sheet) => [
                sheet.key,
                sheet.people,
            ]),
        ).toEqual([
            ['shirt_adults_short', 2],
            ['pants_adults_long', 1],
        ]);
    });

    it('leaves people nobody has typed in off every sheet', () => {
        expect(
            individualSheets(
                [person({ name: '', size: '', number: '' })],
                false,
            ),
        ).toEqual([]);
    });
});

describe('the spec each sheet reopens with', () => {
    const saved = {
        shirt: { ...emptyShirtSpecs('21'), pattern_id: '1' },
        pants: { ...emptyPantsSpecs('31'), leg_style_id: '15' },
    };
    const sheets = individualSheets(
        [person(), person({ shirt_style: 'long', pants_quantity: 1 })],
        true,
    );

    it('is the one saved under the sheet’s own key', () => {
        const specs = savedIndividualSheetSpecs(
            sheets,
            {
                garment_specs: {
                    shirt_adults_short: {
                        shirt_type_id: '21',
                        pattern_id: '1',
                    },
                    shirt_adults_long: { shirt_type_id: '22', pattern_id: '2' },
                },
            },
            saved,
        );

        expect(specs.shirt_adults_short).toMatchObject({
            shirt_type_id: '21',
            pattern_id: '1',
        });
        expect(specs.shirt_adults_long).toMatchObject({
            shirt_type_id: '22',
            pattern_id: '2',
        });
    });

    it('is the bill’s single spec, type and all, on a bill saved before sheets had their own', () => {
        // That one spec is what every sheet of the bill was sewn from, so
        // reopening it must not leave a sheet short of anything.
        const specs = savedIndividualSheetSpecs(sheets, {}, saved);

        expect(specs.shirt_adults_short).toMatchObject({
            shirt_type_id: '21',
            pattern_id: '1',
        });
        expect(specs.shirt_adults_long).toMatchObject({
            shirt_type_id: '21',
            pattern_id: '1',
        });
        expect(specs.pants_adults_short).toMatchObject({
            pants_type_id: '31',
            leg_style_id: '15',
        });
    });
});
