import { describe, expect, it } from 'vitest';

import { deriveFloorStats } from '../counterStats';

describe('deriveFloorStats', () => {
    it('counts embroidery pending work as new work even when earlier rooms are still pending', () => {
        const stats = deriveFloorStats([
            {
                job_type: 'Screen Print',
                details: {
                    routings: [
                        {
                            id: 1,
                            is_required: true,
                            station_name: 'print',
                            status: 'pending',
                        },
                        {
                            id: 2,
                            is_required: true,
                            station_name: 'embroidery',
                            status: 'pending',
                        },
                    ],
                },
            },
        ]);

        expect(stats.print_room.new_job).toBe(1);
        expect(stats.embroidery.new_job).toBe(1);
    });

    it('routes screen and flex work into the matching room counters', () => {
        const stats = deriveFloorStats([
            {
                job_type: 'DTG',
                details: {
                    routings: [
                        {
                            id: 10,
                            is_required: true,
                            station_name: 'screen',
                            status: 'pending',
                        },
                    ],
                },
            },
        ]);

        expect(stats.screen_flex.new_job).toBe(1);
        expect(stats.heat_press.new_job).toBe(0);
    });
});
