import { describe, expect, it } from 'vitest';

import {
    buildSportsDayMatrices,
    resolveSportsDaySwatch,
} from '@/pages/Counter';

const house = (
    name: string,
    counts: Record<string, number>,
    price = 250,
    sizeGroup: 'kids' | 'adults' = 'adults',
) => ({
    team_name: `คณะสี${name}`,
    color_name: name,
    rows: Object.entries(counts)
        .filter(([, quantity]) => quantity > 0)
        .map(([size_label, quantity]) => ({
            size_group: sizeGroup,
            size_label,
            shirt_qty: quantity,
            shirt_price: price,
            pants_qty: 0,
            pants_price: 0,
        })),
});

describe('the colour house grid on the counter sheet', () => {
    it('lays the houses out as columns and the sizes as rows', () => {
        const [matrix] = buildSportsDayMatrices([
            house('ชมพู', { S: 9, M: 65, L: 128 }),
            house('น้ำเงิน', { S: 10, M: 65, L: 146 }),
        ]);

        expect(matrix.houses.map((item) => item.name)).toEqual([
            'คณะสีชมพู',
            'คณะสีน้ำเงิน',
        ]);
        expect(matrix.rows.map((row) => row.sizeLabel)).toEqual([
            'S',
            'M',
            'L',
        ]);
        expect(matrix.rows[2].quantities).toEqual([128, 146]);
        expect(matrix.houseTotals).toEqual([202, 221]);
        expect(matrix.grandTotal).toBe(423);
    });

    it('puts the sizes in the order the shop reads them, not alphabetically', () => {
        const [matrix] = buildSportsDayMatrices([
            house('แดง', { '2XL': 16, S: 5, XL: 60, M: 63 }),
        ]);

        expect(matrix.rows.map((row) => row.sizeLabel)).toEqual([
            'S',
            'M',
            'XL',
            '2XL',
        ]);
    });

    it('leaves out a size nobody ordered', () => {
        const [matrix] = buildSportsDayMatrices([
            house('ส้ม', { SS: 0, M: 29 }),
        ]);

        expect(matrix.rows.map((row) => row.sizeLabel)).toEqual(['M']);
    });

    it('shows a range when the houses are not all on the same price', () => {
        const [matrix] = buildSportsDayMatrices([
            house('ชมพู', { M: 10 }, 250),
            house('แดง', { M: 10 }, 270),
        ]);

        expect(matrix.rows[0].price).toBe('250.00-270.00');
    });

    it('splits kids from adults and shirts from pants', () => {
        const matrices = buildSportsDayMatrices([
            {
                team_name: 'คณะสีเขียว',
                color_name: 'เขียว',
                rows: [
                    {
                        size_group: 'kids',
                        size_label: 'JM',
                        shirt_qty: 4,
                        shirt_price: 150,
                        pants_qty: 0,
                        pants_price: 0,
                    },
                    {
                        size_group: 'adults',
                        size_label: 'L',
                        shirt_qty: 6,
                        shirt_price: 250,
                        pants_qty: 3,
                        pants_price: 180,
                    },
                ],
            },
        ]);

        expect(
            matrices.map((matrix) => `${matrix.sizeGroup}-${matrix.garment}`),
        ).toEqual(['kids-shirt', 'adults-shirt', 'adults-pants']);
    });

    it('paints a house with its own colour and keeps the label readable', () => {
        // White on ส้ม measures about 3:1 on paper, so the pale grounds take
        // dark text instead.
        expect(resolveSportsDaySwatch('ส้ม')).toEqual({
            background: '#F97316',
            text: '#0F172A',
        });
        expect(resolveSportsDaySwatch('น้ำเงิน').text).toBe('#FFFFFF');
        // น้ำตาล must not be mistaken for น้ำเงิน.
        expect(resolveSportsDaySwatch('น้ำตาล').background).toBe('#92400E');
        // An unknown colour falls back to grey rather than guessing.
        expect(resolveSportsDaySwatch('สีประจำคณะ').background).toBe('#94A3B8');
    });

    it('carries the money as well as the counts', () => {
        const [matrix] = buildSportsDayMatrices([
            house('ชมพู', { M: 10, L: 20 }, 250),
            house('แดง', { M: 5, L: 5 }, 250),
        ]);

        expect(matrix.rows[0].quantity).toBe(15);
        expect(matrix.rows[0].amount).toBe(3750);
        expect(matrix.rows[1].amount).toBe(6250);
        expect(matrix.houseAmounts).toEqual([7500, 2500]);
        expect(matrix.grandAmount).toBe(10000);
    });

    it('adds the money house by house when the prices differ', () => {
        // Quantity times one price would have charged both houses the same and
        // quietly lost the difference.
        const [matrix] = buildSportsDayMatrices([
            house('ชมพู', { M: 10 }, 250),
            house('แดง', { M: 10 }, 270),
        ]);

        expect(matrix.rows[0].quantity).toBe(20);
        expect(matrix.rows[0].amount).toBe(2500 + 2700);
        expect(matrix.houseAmounts).toEqual([2500, 2700]);
        expect(matrix.grandAmount).toBe(5200);
    });
});
