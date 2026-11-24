import { describe, expect, it } from 'vitest';

import { billableCharges, chargesTotal } from '../Create';
import type { ExtraChargeForm } from '../Create';

/**
 * "คิดเงินเพิ่มเติม" on the counter form: money for something that is not a
 * garment. The counter types these while the bill is open, so a line is in
 * every half-finished state on the way to being one — what matters is which
 * of them reach the bill and what they add up to.
 */
const charge = (over: Partial<ExtraChargeForm> = {}): ExtraChargeForm => ({
    id: 'charge-1',
    label: 'ค่าจัดส่ง',
    amount: '500',
    ...over,
});

describe('which lines reach the bill', () => {
    it('keeps a line that has both a name and money', () => {
        expect(billableCharges([charge()])).toEqual([
            { label: 'ค่าจัดส่ง', amount: 500 },
        ]);
    });

    it('drops a row the counter has only started typing', () => {
        expect(
            billableCharges([
                charge({ id: 'a', label: '', amount: '500' }),
                charge({ id: 'b', label: 'ยังไม่ได้ใส่เงิน', amount: '' }),
                charge({ id: 'c', label: 'ค่าทำด่วน', amount: '0' }),
            ]),
        ).toEqual([]);
    });

    it('trims the name, so spaces alone are not a line', () => {
        expect(
            billableCharges([charge({ label: '   ', amount: '500' })]),
        ).toEqual([]);
        expect(
            billableCharges([charge({ label: '  ค่าส่ง  ', amount: '500' })]),
        ).toEqual([{ label: 'ค่าส่ง', amount: 500 }]);
    });

    it('never lets a negative through as a second discount', () => {
        expect(
            billableCharges([charge({ label: 'หักเงิน', amount: '-500' })]),
        ).toEqual([]);
    });

    it('keeps the order the counter typed them in', () => {
        expect(
            billableCharges([
                charge({ id: 'a', label: 'ค่าจัดส่ง', amount: '500' }),
                charge({ id: 'b', label: 'ค่าทำด่วน', amount: '1200' }),
            ]).map((line) => line.label),
        ).toEqual(['ค่าจัดส่ง', 'ค่าทำด่วน']);
    });
});

describe('what the live summary adds up', () => {
    it('totals only the lines that count', () => {
        expect(
            chargesTotal([
                charge({ id: 'a', amount: '500' }),
                charge({ id: 'b', label: '', amount: '9999' }),
                charge({ id: 'c', amount: '1200.50' }),
            ]),
        ).toBe(1700.5);
    });

    it('is zero on a bill that charges for nothing but garments', () => {
        expect(chargesTotal([])).toBe(0);
    });
});
