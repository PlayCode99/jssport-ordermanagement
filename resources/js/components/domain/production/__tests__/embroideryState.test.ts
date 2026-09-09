import { describe, expect, it } from 'vitest';

import { resolveEmbroideryRouting } from '@/components/domain/production/embroideryState';

describe('resolveEmbroideryRouting', () => {
    it('prefers a completed embroidery routing over a pending one when both exist', () => {
        const order = {
            routings: [
                {
                    id: 1,
                    is_required: true,
                    station_name: 'embroidery',
                    status: 'pending',
                },
                {
                    id: 2,
                    is_required: true,
                    station_name: 'embroidery',
                    status: 'completed',
                },
            ],
        };

        const routing = resolveEmbroideryRouting(order as never);

        expect(routing?.id).toBe(2);
        expect(routing?.status).toBe('completed');
    });
});
