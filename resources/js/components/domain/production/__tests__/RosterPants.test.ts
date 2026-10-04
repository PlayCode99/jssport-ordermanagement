import { describe, expect, it } from 'vitest';

import { rosterHasPants } from '@/components/domain/production/ProductionBoardPage';

/**
 * The floor's name list gives trousers their own columns only when someone on
 * it ordered trousers, so a shirts-only team prints as it always has.
 */
const person = (pants_quantity: number) => ({
    name: 'สมชาย',
    number: '10',
    size: 'M',
    quantity: 1,
    pants_size: pants_quantity > 0 ? 'M' : '-',
    pants_number: pants_quantity > 0 ? '10' : '-',
    pants_quantity,
});

describe('the roster’s trousers columns', () => {
    it('appear when anyone on the list ordered trousers', () => {
        expect(rosterHasPants([person(0), person(1)])).toBe(true);
    });

    it('stay off a shirts-only list', () => {
        expect(rosterHasPants([person(0), person(0)])).toBe(false);
    });
});
