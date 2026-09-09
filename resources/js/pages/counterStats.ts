/**
 * Reference implementation of the counter floor-card rules.
 *
 * The counter page itself no longer calls this: the numbers are computed on the
 * server (DashboardController::buildCounterFloorStats) so they can summarise
 * every matching order without shipping every order to the browser. This file
 * stays as the executable spec that the PHP port mirrors 1:1 — if you change a
 * rule here, change it there too, and vice versa.
 */
type RoutingSummary = {
    id: number;
    is_required?: boolean | null;
    station_name?: string | null;
    status?: string | null;
    print_machine?: string | null;
};

type OrderSummary = {
    job_type?: string | null;
    order_item_count?: number | null;
    status?: string | null;
    details?: {
        delivery_method?: string | null;
        routings?: RoutingSummary[];
    };
};

export type FloorStats = {
    print_room: {
        new_job: number;
        new_job_qty: number;
        printer_1: number;
        printer_2: number;
        printer_3: number;
        completed: number;
        completed_qty: number;
    };
    cutting: {
        new_job: number;
        new_job_qty: number;
        assigned: number;
        completed: number;
        completed_qty: number;
    };
    heat_press: {
        new_job: number;
        new_job_qty: number;
        assigned: number;
        revising: number;
        completed: number;
        completed_qty: number;
    };
    sewing: {
        new_job: number;
        new_job_qty: number;
        assigned: number;
        completed: number;
        completed_qty: number;
    };
    embroidery: {
        new_job: number;
        new_job_qty: number;
        assigned: number;
        completed: number;
        completed_qty: number;
    };
    screen_flex: {
        new_job: number;
        new_job_qty: number;
        assigned: number;
        revising: number;
        completed: number;
        completed_qty: number;
    };
    qc: {
        new_job: number;
        new_job_qty: number;
        pending_inspect: number;
        completed: number;
        completed_qty: number;
    };
    shipping: {
        pending_ship: number;
        pending_ship_qty: number;
        store_pickup: number;
        courier: number;
        onsite_delivery: number;
        completed_qty: number;
    };
};

const emptyFloorStats = (): FloorStats => ({
    print_room: {
        new_job: 0,
        new_job_qty: 0,
        printer_1: 0,
        printer_2: 0,
        printer_3: 0,
        completed: 0,
        completed_qty: 0,
    },
    cutting: {
        new_job: 0,
        new_job_qty: 0,
        assigned: 0,
        completed: 0,
        completed_qty: 0,
    },
    heat_press: {
        new_job: 0,
        new_job_qty: 0,
        assigned: 0,
        revising: 0,
        completed: 0,
        completed_qty: 0,
    },
    sewing: {
        new_job: 0,
        new_job_qty: 0,
        assigned: 0,
        completed: 0,
        completed_qty: 0,
    },
    embroidery: {
        new_job: 0,
        new_job_qty: 0,
        assigned: 0,
        completed: 0,
        completed_qty: 0,
    },
    screen_flex: {
        new_job: 0,
        new_job_qty: 0,
        assigned: 0,
        revising: 0,
        completed: 0,
        completed_qty: 0,
    },
    qc: {
        new_job: 0,
        new_job_qty: 0,
        pending_inspect: 0,
        completed: 0,
        completed_qty: 0,
    },
    shipping: {
        pending_ship: 0,
        pending_ship_qty: 0,
        store_pickup: 0,
        courier: 0,
        onsite_delivery: 0,
        completed_qty: 0,
    },
});

function isSublimationJobType(jobType?: string | null): boolean {
    if (!jobType) {
        return false;
    }

    const normalized = jobType.toLowerCase();

    return normalized.includes('ซับ') || normalized.includes('sublimation');
}

function incrementStageStats(
    stats: FloorStats,
    key:
        | 'cutting'
        | 'sewing'
        | 'embroidery'
        | 'qc'
        | 'heat_press'
        | 'screen_flex',
    routing: RoutingSummary | undefined,
    requiredRoutings: RoutingSummary[],
    quantity: number,
    includeRevising = false,
): void {
    if (!routing) {
        return;
    }

    void requiredRoutings;

    if (routing.status === 'pending') {
        stats[key].new_job += 1;
        stats[key].new_job_qty += quantity;

        return;
    }

    if (routing.status === 'in_progress') {
        if ('pending_inspect' in stats[key]) {
            stats[key].pending_inspect += 1;
        } else {
            stats[key].assigned += 1;
        }

        return;
    }

    if (includeRevising && routing.status === 'rejected') {
        stats[key].revising += 1;

        return;
    }

    if (routing.status === 'completed' || routing.status === 'skipped') {
        stats[key].completed += 1;
        stats[key].completed_qty += quantity;
    }
}

export function deriveFloorStats(orders: OrderSummary[]): FloorStats {
    const stats = emptyFloorStats();

    orders.forEach((order) => {
        const quantity = Number(order.order_item_count ?? 0);
        const requiredRoutings = [...(order.details?.routings ?? [])]
            .filter((routing) => routing.is_required)
            .sort((a, b) => a.id - b.id);

        const printRouting = requiredRoutings.find(
            (routing) => routing.station_name === 'print',
        );

        if (printRouting) {
            if (printRouting.status === 'pending') {
                stats.print_room.new_job += 1;
                stats.print_room.new_job_qty += quantity;
            } else if (printRouting.status === 'in_progress') {
                if (printRouting.print_machine === 'printer_2') {
                    stats.print_room.printer_2 += 1;
                } else if (printRouting.print_machine === 'printer_3') {
                    stats.print_room.printer_3 += 1;
                } else {
                    stats.print_room.printer_1 += 1;
                }
            } else if (
                printRouting.status === 'completed' ||
                printRouting.status === 'skipped'
            ) {
                stats.print_room.completed += 1;
                stats.print_room.completed_qty += quantity;
            }
        }

        const cuttingRouting = requiredRoutings.find(
            (routing) => routing.station_name === 'cutting',
        );
        const sewingRouting = requiredRoutings.find(
            (routing) => routing.station_name === 'sewing',
        );
        const embroideryRouting = requiredRoutings.find(
            (routing) => routing.station_name === 'embroidery',
        );
        const qcRouting = requiredRoutings.find(
            (routing) => routing.station_name === 'qc',
        );
        const heatPressLikeRouting = requiredRoutings.find(
            (routing) =>
                routing.station_name === 'screen' ||
                routing.station_name === 'flex',
        );

        incrementStageStats(
            stats,
            'cutting',
            cuttingRouting,
            requiredRoutings,
            quantity,
        );
        incrementStageStats(
            stats,
            'sewing',
            sewingRouting,
            requiredRoutings,
            quantity,
        );
        incrementStageStats(
            stats,
            'embroidery',
            embroideryRouting,
            requiredRoutings,
            quantity,
        );
        incrementStageStats(stats, 'qc', qcRouting, requiredRoutings, quantity);

        if (heatPressLikeRouting) {
            const targetRoom = isSublimationJobType(order.job_type)
                ? 'heat_press'
                : 'screen_flex';
            incrementStageStats(
                stats,
                targetRoom,
                heatPressLikeRouting,
                requiredRoutings,
                quantity,
                true,
            );
        }

        if (order.status === 'shipping') {
            stats.shipping.pending_ship += 1;
            stats.shipping.pending_ship_qty += quantity;
        }

        if (order.status === 'completed') {
            if (order.details?.delivery_method === 'pickup') {
                stats.shipping.store_pickup += 1;
                stats.shipping.completed_qty += quantity;
            } else if (order.details?.delivery_method === 'shipping') {
                stats.shipping.courier += 1;
                stats.shipping.completed_qty += quantity;
            } else if (order.details?.delivery_method === 'onsite') {
                stats.shipping.onsite_delivery += 1;
                stats.shipping.completed_qty += quantity;
            } else {
                // Fallback bucket so completed shipping is still reflected on the card.
                stats.shipping.store_pickup += 1;
                stats.shipping.completed_qty += quantity;
            }
        }
    });

    return stats;
}
