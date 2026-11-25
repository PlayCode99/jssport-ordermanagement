import { describe, expect, it } from 'vitest';

import {
    bahtText,
    deliveryNoteRows,
    deliveryNoteTotals,
} from '../deliveryNote';

/**
 * The delivery note is what the customer signs. It has to say what is in the
 * bag — type, size, quantity, price — and it carries a discount of its own
 * that must never reach the bill behind it.
 */
const items = [
    {
        item_type: 'separate_shirt',
        size_group: 'kids',
        size_tier: 'kids',
        size_label: 'S',
        shirt_style: 'short',
        quantity: 5,
        unit_price: 200,
        total_price: 1000,
    },
    {
        item_type: 'separate_shirt',
        size_group: 'kids',
        size_tier: 'kids',
        size_label: 'M',
        shirt_style: 'short',
        quantity: 3,
        unit_price: 200,
        total_price: 600,
    },
    {
        item_type: 'separate_pants',
        size_group: 'kids',
        size_tier: 'kids',
        size_label: 'S',
        pants_style: 'long',
        quantity: 5,
        unit_price: 150,
        total_price: 750,
    },
];

describe('what the note says is in the bag', () => {
    it('gives a row per size, named the way the floor names it', () => {
        expect(deliveryNoteRows(items)).toEqual([
            {
                type: 'เสื้อเด็ก · แขนสั้น',
                size: 'S',
                quantity: 5,
                unitPrice: 200,
                total: 1000,
            },
            {
                type: 'เสื้อเด็ก · แขนสั้น',
                size: 'M',
                quantity: 3,
                unitPrice: 200,
                total: 600,
            },
            {
                type: 'กางเกงเด็ก · ขายาว',
                size: 'S',
                quantity: 5,
                unitPrice: 150,
                total: 750,
            },
        ]);
    });

    it('says nothing at all for a bill with no lines', () => {
        expect(deliveryNoteRows([])).toEqual([]);
    });
});

describe("the note's own discount", () => {
    /** A bill of 2,350 goods and 150 of charges, less a 10% receipt discount. */
    const bill = {
        gross: 2500,
        billDiscountPercent: 10,
        billDiscountAmount: 250,
        billNet: 2250,
    };

    it('comes off what the bill already came to', () => {
        const totals = deliveryNoteTotals(bill, 10);

        expect(totals.billNet).toBe(2250);
        expect(totals.discountAmount).toBe(225);
        expect(totals.payable).toBe(2025);
    });

    it('carries the whole chain, so the note can be read end to end', () => {
        const totals = deliveryNoteTotals(bill, 10);

        // goods + charges, less the bill's own discount, less the note's.
        expect(totals.gross).toBe(2500);
        expect(totals.billDiscountAmount).toBe(250);
        expect(totals.gross - totals.billDiscountAmount).toBe(totals.billNet);
        expect(totals.billNet - totals.discountAmount).toBe(totals.payable);
    });

    it('leaves the bill alone when it is not set', () => {
        const totals = deliveryNoteTotals(bill, 0);

        expect(totals.discountAmount).toBe(0);
        expect(totals.payable).toBe(2250);
    });

    it('never gives away more than the counter may', () => {
        // The bill's own discount stops at 50%; this must not be the way past it.
        const totals = deliveryNoteTotals(
            {
                gross: 1000,
                billDiscountPercent: 0,
                billDiscountAmount: 0,
                billNet: 1000,
            },
            90,
        );

        expect(totals.discountPercent).toBe(50);
        expect(totals.payable).toBe(500);
    });

    it('never turns a discount into a charge', () => {
        const totals = deliveryNoteTotals(
            {
                gross: 1000,
                billDiscountPercent: 0,
                billDiscountAmount: 0,
                billNet: 1000,
            },
            -20,
        );

        expect(totals.discountAmount).toBe(0);
        expect(totals.payable).toBe(1000);
    });
});

/**
 * The amount in words. Thai delivery notes and receipts carry it because a
 * figure in digits can be altered after it is signed and a sentence cannot.
 */
describe('the amount written out in Thai', () => {
    it.each([
        [0, 'ศูนย์บาทถ้วน'],
        [1, 'หนึ่งบาทถ้วน'],
        [11, 'สิบเอ็ดบาทถ้วน'],
        [20, 'ยี่สิบบาทถ้วน'],
        [21, 'ยี่สิบเอ็ดบาทถ้วน'],
        [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
        [2115, 'สองพันหนึ่งร้อยสิบห้าบาทถ้วน'],
        [2137.5, 'สองพันหนึ่งร้อยสามสิบเจ็ดบาทห้าสิบสตางค์'],
        [1000000, 'หนึ่งล้านบาทถ้วน'],
    ])('reads %d as %s', (amount, words) => {
        expect(bahtText(amount)).toBe(words);
    });

    it('rounds to the satang rather than printing a fraction of one', () => {
        expect(bahtText(10.005)).toBe('สิบบาทหนึ่งสตางค์');
    });

    it('never reads a negative as money owed back', () => {
        expect(bahtText(-50)).toBe('ศูนย์บาทถ้วน');
    });
});
