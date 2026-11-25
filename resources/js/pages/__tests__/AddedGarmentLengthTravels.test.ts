import { beforeEach, describe, expect, it } from 'vitest';

import { buildGarmentSheets } from '../counterGarmentSheets';
import {
    readPantsStyle,
    readShirtStyle,
    setGarmentStyles,
} from '../Orders/garmentTables';
import { sortRoster } from '../screenRoster';

/**
 * A length the shop added itself has to travel the whole way, not just appear
 * in the menu it was typed into.
 *
 * Every one of these covers a place that read the three lengths spelled out in
 * the code. Each was green while the shop could already add a fourth, so each
 * quietly did something wrong to a bill sold at it: dropped it when the bill
 * was reopened, filed it under a sheet that named no length, or mixed it into
 * the short sleeves at the press. A suite that only checked the menu would
 * have passed through all of it.
 */
describe('a length the shop added itself', () => {
    beforeEach(() => {
        setGarmentStyles({
            SHIRT: [
                { code: 'short', name: 'แขนสั้น', is_active: true },
                { code: 'long', name: 'แขนยาว', is_active: true },
                { code: 'sleeveless', name: 'แขนกุด', is_active: true },
                { code: 'three_quarter', name: 'แขนสามส่วน', is_active: true },
            ],
            PANTS: [
                { code: 'short', name: 'ขาสั้น', is_active: true },
                { code: 'long', name: 'ขายาว', is_active: true },
                { code: 'cropped', name: 'ขาสี่ส่วน', is_active: true },
            ],
        });
    });

    it('comes back as itself when the bill is reopened for editing', () => {
        // The one that mattered most: read as 'short', the next save rewrote
        // the bill into a garment the customer never ordered.
        expect(readShirtStyle('three_quarter')).toBe('three_quarter');
        expect(readPantsStyle('cropped')).toBe('cropped');
    });

    it('still falls back to the shop list when a row recorded nothing', () => {
        expect(readShirtStyle(null)).toBe('short');
        expect(readShirtStyle('   ')).toBe('short');
        expect(readPantsStyle(undefined)).toBe('short');
    });

    it('gets a sheet of its own on the counter, named after it', () => {
        const sheets = buildGarmentSheets(
            [
                {
                    item_type: 'separate_shirt',
                    size_group: 'kids',
                    size_tier: 'kids',
                    size_label: 'JM',
                    shirt_style: 'three_quarter',
                    quantity: 4,
                    unit_price: 120,
                    total_price: 480,
                },
                {
                    item_type: 'separate_shirt',
                    size_group: 'kids',
                    size_tier: 'kids',
                    size_label: 'JM',
                    shirt_style: 'short',
                    quantity: 2,
                    unit_price: 100,
                    total_price: 200,
                },
            ],
            undefined,
            [],
            [],
        );

        const keys = sheets.map((sheet) => sheet.key);

        // Two lengths are two sheets, and the added one is not folded in with
        // the lines whose bill never said a length.
        expect(keys).toEqual(['shirt_kids_short', 'shirt_kids_three_quarter']);
        expect(
            sheets.find((sheet) => sheet.key === 'shirt_kids_three_quarter')
                ?.title,
        ).toBe('เสื้อเด็ก · แขนสามส่วน');
    });

    it('is a press block of its own on the name list', () => {
        const people = [
            {
                size_group: 'adults',
                shirt_style: 'long',
                size: 'M',
                number: '1',
            },
            {
                size_group: 'adults',
                shirt_style: 'three_quarter',
                size: 'M',
                number: '2',
            },
            {
                size_group: 'adults',
                shirt_style: 'short',
                size: 'M',
                number: '3',
            },
        ];

        // The press sets up once per length. The three the shop has always had
        // keep the order the floor already reads, and the added one runs after
        // them rather than being shuffled in among the short sleeves.
        expect(sortRoster(people).map((person) => person.shirt_style)).toEqual(
            ['short', 'sleeveless', 'long', 'three_quarter'].filter((style) =>
                people.some((person) => person.shirt_style === style),
            ),
        );
    });
});
