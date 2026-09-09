import { describe, expect, it } from 'vitest';

import {
    buildMonthGrid,
    dateKey,
    monthLabel,
    shiftMonth,
} from '../DeliveryCalendarDialog';

describe('delivery calendar month grid', () => {
    it('pads the first week so the month starts on its real weekday', () => {
        // 1 September 2026 is a Tuesday, so Sunday and Monday are blank.
        const weeks = buildMonthGrid('2026-09');

        expect(weeks[0][0]).toBeNull();
        expect(weeks[0][1]).toBeNull();
        expect(weeks[0][2]).toBe('2026-09-01');
    });

    it('lays out every day of the month and nothing more', () => {
        const days = buildMonthGrid('2026-09')
            .flat()
            .filter((key) => key !== null);

        expect(days).toHaveLength(30);
        expect(days[0]).toBe('2026-09-01');
        expect(days[29]).toBe('2026-09-30');
    });

    it('handles a leap February', () => {
        const days = buildMonthGrid('2028-02')
            .flat()
            .filter((key) => key !== null);

        expect(days).toHaveLength(29);
        expect(days[28]).toBe('2028-02-29');
    });

    it('always fills whole weeks', () => {
        ['2026-01', '2026-02', '2026-08', '2026-11'].forEach((month) => {
            expect(buildMonthGrid(month).flat().length % 7).toBe(0);
        });
    });

    it('builds keys from local date parts, not UTC', () => {
        // toISOString() on a local midnight shifts the day in +07:00, which would
        // silently file every job against the wrong date.
        expect(dateKey(2026, 8, 1)).toBe('2026-09-01');
        expect(dateKey(2026, 11, 31)).toBe('2026-12-31');
    });
});

describe('delivery calendar month navigation', () => {
    it('steps within a year', () => {
        expect(shiftMonth('2026-09', 1)).toBe('2026-10');
        expect(shiftMonth('2026-09', -1)).toBe('2026-08');
    });

    it('rolls over the year boundary in both directions', () => {
        expect(shiftMonth('2026-12', 1)).toBe('2027-01');
        expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    });

    it('labels months in Thai years', () => {
        expect(monthLabel('2026-09')).toBe('กันยายน 2569');
        expect(monthLabel('2026-01')).toBe('มกราคม 2569');
    });
});
