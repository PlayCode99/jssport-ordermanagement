import type { Order } from '@/types/models';

type OrderRoutingRecord = NonNullable<Order['routings']>[number];

export function getEmbroideryRoutings(
    order: Order | null,
): OrderRoutingRecord[] {
    if (!order) {
        return [];
    }

    return [...(order.routings ?? [])]
        .filter(
            (routing) =>
                routing.is_required && routing.station_name === 'embroidery',
        )
        .sort((a, b) => a.id - b.id);
}

export function resolveEmbroideryRouting(
    order: Order | null,
): OrderRoutingRecord | null {
    const routings = getEmbroideryRoutings(order);

    if (routings.length === 0) {
        return null;
    }

    const preferredStatuses: Array<OrderRoutingRecord['status']> = [
        'in_progress',
        'rejected',
        'completed',
        'skipped',
        'pending',
    ];

    for (const status of preferredStatuses) {
        const matchingRouting = [...routings]
            .reverse()
            .find((routing) => routing.status === status);

        if (matchingRouting) {
            return matchingRouting;
        }
    }

    return routings[routings.length - 1] ?? null;
}

export function getEmbroideryTimelineLabel(
    routing: OrderRoutingRecord,
    allRoutings: OrderRoutingRecord[],
): string {
    const embroideryOccurrences = allRoutings.filter(
        (item) => item.station_name === 'embroidery',
    );

    if (embroideryOccurrences.length <= 1) {
        return 'ห้องปัก';
    }

    const occurrenceIndex = embroideryOccurrences.findIndex(
        (item) => item.id === routing.id,
    );

    if (occurrenceIndex <= 0) {
        return 'ห้องปัก';
    }

    return `ห้องปัก (รอบที่ ${occurrenceIndex + 1})`;
}
