import { describe, expect, it } from 'vitest';

import { buildSpecBlocks } from '@/pages/Counter';

/**
 * A bill names a spec per production sheet. Nearly every bill sews all its
 * sheets the same way, because the counter fills one spec in and copies it
 * across — so the receipt shows that spec once, titled with every sheet it
 * covers, rather than repeating twenty rows per sheet and pushing the receipt
 * onto another page for nothing.
 */
const rows = (screenText: string) => [
    { label: 'เนื้อผ้า', value: 'ผ้าไมโคร' },
    { label: 'ข้อความสกรีน', value: screenText },
];

const fallbackShirt = [{ label: 'เนื้อผ้า', value: 'ผ้าเดิม' }];
const fallbackPants = [{ label: 'แบบขา', value: 'ขาตรง' }];

describe('the spec blocks a receipt shows', () => {
    it('shows the single spec an older bill carries', () => {
        const blocks = buildSpecBlocks(undefined, fallbackShirt, fallbackPants);

        expect(blocks.map((block) => block.title)).toEqual([
            'สเปกเสื้อ',
            'สเปกกางเกง',
        ]);
        expect(blocks[0].rows).toEqual(fallbackShirt);
    });

    it('leaves out a garment the older bill never had', () => {
        const blocks = buildSpecBlocks(undefined, fallbackShirt, []);

        expect(blocks.map((block) => block.title)).toEqual(['สเปกเสื้อ']);
    });

    it('shows one block for sheets that are sewn the same way', () => {
        const blocks = buildSpecBlocks(
            {
                shirt_kids_short: rows('โลโก้'),
                shirt_adults_short: rows('โลโก้'),
            },
            fallbackShirt,
            fallbackPants,
        );

        expect(blocks).toHaveLength(1);
        expect(blocks[0].title).toBe(
            'สเปกเสื้อ · เสื้อ เด็ก · แขนสั้น, เสื้อ ผู้ใหญ่ · แขนสั้น',
        );
    });

    it('splits sheets that are genuinely sewn differently', () => {
        const blocks = buildSpecBlocks(
            {
                shirt_kids_short: rows('ลายเด็ก'),
                shirt_adults_short: rows('ลายผู้ใหญ่'),
            },
            fallbackShirt,
            fallbackPants,
        );

        expect(blocks).toHaveLength(2);
        expect(blocks[0].rows).toEqual(rows('ลายเด็ก'));
        expect(blocks[1].rows).toEqual(rows('ลายผู้ใหญ่'));
    });

    it('never folds a shirt sheet in with a trouser sheet', () => {
        const blocks = buildSpecBlocks(
            {
                shirt_kids_short: rows('เหมือนกัน'),
                pants_kids_short: rows('เหมือนกัน'),
            },
            fallbackShirt,
            fallbackPants,
        );

        expect(blocks.map((block) => block.title)).toEqual([
            'สเปกเสื้อ · เสื้อ เด็ก · แขนสั้น',
            'สเปกกางเกง · กางเกง เด็ก · ขาสั้น',
        ]);
    });

    it('names the ประถม - มัธยมต้น sheets the way the bill does', () => {
        const blocks = buildSpecBlocks(
            { shirt_junior_sleeveless: rows('กุด') },
            fallbackShirt,
            fallbackPants,
        );

        expect(blocks[0].title).toBe(
            'สเปกเสื้อ · เสื้อ ประถม - มัธยมต้น · แขนกุด',
        );
    });

    it('ignores a sheet that carries no spec at all', () => {
        const blocks = buildSpecBlocks(
            { shirt_kids_short: rows('มี'), shirt_kids_long: [] },
            fallbackShirt,
            fallbackPants,
        );

        expect(blocks).toHaveLength(1);
        expect(blocks[0].title).toBe('สเปกเสื้อ · เสื้อ เด็ก · แขนสั้น');
    });
});
