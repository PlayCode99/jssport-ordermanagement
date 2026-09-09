import { describe, expect, it } from 'vitest';

import { canEditOrderStatus } from '@/pages/Counter';

describe('canEditOrderStatus', () => {
    it('allows editing only for "confirmed" orders', () => {
        expect(canEditOrderStatus({ orderStatus: 'confirmed' })).toBe(true);
        expect(canEditOrderStatus({ orderStatus: ' Confirmed ' })).toBe(true);
        expect(canEditOrderStatus({ orderStatus: 'CONFIRMED' })).toBe(true);
    });

    it('blocks editing for confirmed orders once production has progressed', () => {
        expect(
            canEditOrderStatus({
                orderStatus: 'confirmed',
                hasProductionProgress: true,
            }),
        ).toBe(false);
    });

    it('blocks editing for every status other than "confirmed"', () => {
        expect(canEditOrderStatus({ orderStatus: 'draft' })).toBe(false);
        expect(canEditOrderStatus({ orderStatus: 'designing' })).toBe(false);
        expect(
            canEditOrderStatus({ orderStatus: 'waiting_customer_confirm' }),
        ).toBe(false);
        expect(canEditOrderStatus({ orderStatus: 'in_production' })).toBe(
            false,
        );
        expect(canEditOrderStatus({ orderStatus: ' IN_PRODUCTION ' })).toBe(
            false,
        );
        expect(canEditOrderStatus({ orderStatus: 'qc_checking' })).toBe(false);
        expect(canEditOrderStatus({ orderStatus: 'qc_rejected' })).toBe(false);
        expect(canEditOrderStatus({ orderStatus: 'shipping' })).toBe(false);
        expect(canEditOrderStatus({ orderStatus: 'completed' })).toBe(false);
        expect(canEditOrderStatus({ orderStatus: 'cancelled' })).toBe(false);
        expect(canEditOrderStatus(null)).toBe(false);
        expect(canEditOrderStatus(undefined)).toBe(false);
    });
});
