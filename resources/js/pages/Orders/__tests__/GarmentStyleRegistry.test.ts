import { beforeEach, describe, expect, it } from 'vitest';

import {
    pantsStyleLabels,
    setGarmentStyles,
    shirtStyleLabels,
    shirtStyles,
    styleLabel,
    stylesFor,
} from '../garmentTables';

/**
 * The lengths a garment is cut to are the shop's own list, shared onto every
 * page by the server. These cover the handover: what the app reads before
 * the server has spoken, what it reads after, and what happens to a bill
 * sold at a length that has since been removed from the list.
 */
describe('the lengths the app labels a garment by', () => {
    beforeEach(() => {
        // Back to what a page starts with, so one test cannot colour another.
        setGarmentStyles(null);
    });

    it('starts with the lengths the shop has always had', () => {
        expect(shirtStyles()).toEqual(['short', 'long', 'sleeveless']);
        expect(stylesFor('pants')).toEqual(['short', 'long']);
        expect(shirtStyleLabels().short).toBe('แขนสั้น');
        expect(pantsStyleLabels().long).toBe('ขายาว');
    });

    it('takes the shop list once the server sends one', () => {
        setGarmentStyles({
            SHIRT: [
                { code: 'short', name: 'แขนสั้น', is_active: true },
                { code: 'three_quarter', name: 'แขนสามส่วน', is_active: true },
            ],
            PANTS: [{ code: 'long', name: 'ขายาว', is_active: true }],
        });

        expect(shirtStyles()).toEqual(['short', 'three_quarter']);
        expect(styleLabel('shirt', 'three_quarter')).toBe('แขนสามส่วน');
        expect(stylesFor('pants')).toEqual(['long']);
    });

    it('keeps the old five when the server sends nothing', () => {
        // A page served before the table existed must not leave every length
        // on the bill nameless.
        setGarmentStyles({ SHIRT: [], PANTS: [] });

        expect(shirtStyles()).toEqual(['short', 'long', 'sleeveless']);
    });

    it('shows a deleted length by its code rather than nothing', () => {
        setGarmentStyles({
            SHIRT: [{ code: 'short', name: 'แขนสั้น', is_active: true }],
            PANTS: [{ code: 'short', name: 'ขาสั้น', is_active: true }],
        });

        // The bill was sold at it; the sheet still has to say something.
        expect(styleLabel('shirt', 'sleeveless')).toBe('sleeveless');
    });
});
