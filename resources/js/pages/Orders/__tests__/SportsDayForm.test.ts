import { describe, expect, it } from 'vitest';

import {
    buildEditInitialFormData,
    buildRequestItemsFromSportsDay,
    sportsDayGroupPieces,
    sportsDayGroupTotal,
    sportsDayRowTotal,
} from '@/pages/Orders/Create';

const row = (over: Partial<Parameters<typeof sportsDayRowTotal>[0]> = {}) => ({
    id: 'r1',
    size_group: 'adults' as const,
    size_label: 'M',
    shirt_qty: 0,
    shirt_price: 0,
    pants_qty: 0,
    pants_price: 0,
    ...over,
});

const group = (rows: ReturnType<typeof row>[], over = {}) => ({
    id: 'g1',
    team_name: 'คณะสีแดง',
    fabric_color_id: '12',
    rows,
    artwork_files: [] as File[],
    artwork_urls: [] as string[],
    ...over,
});

describe('sports day pricing', () => {
    it('bills shirt and pants at their own price', () => {
        expect(sportsDayRowTotal(row({ shirt_qty: 40, shirt_price: 200, pants_qty: 40, pants_price: 150 }))).toBe(14000);
    });

    it('handles a shirt-only row, which the set-based formula could not', () => {
        expect(sportsDayRowTotal(row({ shirt_qty: 35, shirt_price: 200 }))).toBe(7000);
    });

    it('handles a pants-only row', () => {
        expect(sportsDayRowTotal(row({ pants_qty: 10, pants_price: 150 }))).toBe(1500);
    });

    it('ignores negative input rather than subtracting from the total', () => {
        expect(sportsDayRowTotal(row({ shirt_qty: -5, shirt_price: 200, pants_qty: 2, pants_price: 100 }))).toBe(200);
    });

    it('sums a whole colour house', () => {
        const g = group([
            row({ id: 'a', shirt_qty: 35, shirt_price: 200 }),
            row({ id: 'b', size_group: 'kids', size_label: 'JS', shirt_qty: 20, shirt_price: 180, pants_qty: 20, pants_price: 150 }),
        ]);

        expect(sportsDayGroupTotal(g)).toBe(7000 + 3600 + 3000);
        expect(sportsDayGroupPieces(g)).toBe(35 + 20 + 20);
    });
});

describe('sports day → order_items', () => {
    it('emits one line per garment, carrying its own size group and price', () => {
        const items = buildRequestItemsFromSportsDay([
            group([row({ shirt_qty: 35, shirt_price: 200, pants_qty: 10, pants_price: 150 })]),
        ]);

        // The garment is named so production costing does not have to guess it.
        expect(items).toEqual([
            { item_type: 'shirt', size_group: 'adults', size_label: 'M', quantity: 35, unit_price: 200 },
            { item_type: 'pants', size_group: 'adults', size_label: 'M', quantity: 10, unit_price: 150 },
        ]);
    });

    it('keeps each colour house’s kids and adults rows in the right size group', () => {
        const items = buildRequestItemsFromSportsDay([
            group([
                row({ id: 'a', size_group: 'kids', size_label: 'JS', shirt_qty: 5, shirt_price: 180 }),
                row({ id: 'b', size_group: 'adults', size_label: 'L', shirt_qty: 7, shirt_price: 200 }),
            ]),
        ]);

        expect(items.map((i) => i.size_group)).toEqual(['kids', 'adults']);
        expect(items.map((i) => i.size_label)).toEqual(['JS', 'L']);
    });

    it('skips rows with no quantity or no price so they never reach the invoice', () => {
        const items = buildRequestItemsFromSportsDay([
            group([
                row({ id: 'a', shirt_qty: 0, shirt_price: 200 }),
                row({ id: 'b', shirt_qty: 10, shirt_price: 0 }),
            ]),
        ]);

        expect(items).toEqual([]);
    });

    it('totals across colour houses match the sum of the line items', () => {
        const groups = [
            group([row({ shirt_qty: 35, shirt_price: 200 })], { id: 'g1', team_name: 'แดง' }),
            group([row({ id: 'r2', shirt_qty: 40, shirt_price: 200, pants_qty: 40, pants_price: 150 })], { id: 'g2', team_name: 'น้ำเงิน' }),
        ];

        const lineTotal = buildRequestItemsFromSportsDay(groups).reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
        const formTotal = groups.reduce((sum, g) => sum + sportsDayGroupTotal(g), 0);

        expect(lineTotal).toBe(formTotal);
        expect(formTotal).toBe(7000 + 14000);
    });
});

describe('sports day round-trip', () => {
    const args = {
        resolvedBranches: [{ id: 1, name: 'Branch 01', code: '01', phone: null }],
        defaultBranchId: 1,
        resolvedJobTypes: [{ id: 1, name: 'uniform' }],
        resolvedShirtTypes: [{ id: 1, name: 'Shirt' }],
        resolvedPantsTypes: [{ id: 1, name: 'Pants' }],
        resolvedKidsSizes: ['JS'],
        resolvedAdultSizes: ['M'],
    };

    it('starts a new order with one empty colour house', () => {
        const result = buildEditInitialFormData(null, args);

        expect(result.sports_day_groups).toHaveLength(1);
        expect(result.sports_day_groups[0].rows).toHaveLength(1);
    });

    it('reads saved colour houses back from the spec, since order_items has no colour column', () => {
        const result = buildEditInitialFormData(
            {
                id: 5,
                specification: {
                    decoded: {
                        mode: 'sports_day',
                        sports_day_groups: [
                            {
                                team_name: 'คณะสีแดง',
                                fabric_color_id: '12',
                                rows: [{ size_group: 'adults', size_label: 'M', shirt_qty: 35, shirt_price: 200, pants_qty: 0, pants_price: 0 }],
                            },
                        ],
                    },
                },
            } as never,
            args,
        );

        expect(result.sports_day_groups).toHaveLength(1);
        expect(result.sports_day_groups[0].team_name).toBe('คณะสีแดง');
        expect(result.sports_day_groups[0].fabric_color_id).toBe('12');
        expect(result.sports_day_groups[0].rows[0]).toMatchObject({
            size_group: 'adults',
            size_label: 'M',
            shirt_qty: 35,
            shirt_price: 200,
        });
    });
});
