import { describe, expect, it } from 'vitest';

import { isLongSpecValue } from '../ProductionBoardPage';

/**
 * The spec grid gives each field a third of the printed row, which suits a
 * colour or a pattern name. A typed note runs to a sentence, and squeezed
 * into a third it wrapped into a tall narrow column pinched between two
 * dividing lines — the state the counter reported as unreadable.
 */
describe('which spec values take the whole row', () => {
    it('leaves a short value in its own third', () => {
        expect(isLongSpecValue('แขนสั้น')).toBe(false);
        expect(isLongSpecValue('ปักอกซ้าย')).toBe(false);
    });

    it('gives a typed note the whole row', () => {
        expect(
            isLongSpecValue(
                'ปักอกซ้ายชื่อโรงเรียน ปักแขนขวาเบอร์ ปักหลังชื่อทีมเต็ม',
            ),
        ).toBe(true);
    });

    it('treats a blank or missing value as short', () => {
        expect(isLongSpecValue('')).toBe(false);
        expect(isLongSpecValue(null)).toBe(false);
        expect(isLongSpecValue(undefined)).toBe(false);
        // Spaces alone are not a note.
        expect(
            isLongSpecValue('                                          '),
        ).toBe(false);
    });

    it('reads a numeric value without falling over', () => {
        expect(isLongSpecValue(12345)).toBe(false);
    });
});
