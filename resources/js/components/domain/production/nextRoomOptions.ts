import type { Order } from '@/types/models';

export type ProductionRoomDestination =
    | 'print'
    | 'cutting'
    | 'screen_flex'
    | 'embroidery'
    | 'sewing'
    | 'qc'
    | 'shipping';

type OrderRoutingRecord = NonNullable<Order['routings']>[number];

export const nextRoomLabelFromStation = (
    station: ProductionRoomDestination,
): string => {
    switch (station) {
        case 'print':
            return 'ห้องพิมพ์';
        case 'screen_flex':
            return 'ห้องสกรีน เฟล็กซ์';
        case 'embroidery':
            return 'ห้องปัก';
        case 'cutting':
            return 'ห้องตัด';
        case 'sewing':
            return 'ห้องเย็บ';
        case 'qc':
            return 'ห้อง QC';
        case 'shipping':
            return 'จัดส่ง';
    }
};

export const getRequiredRoomSequence = (
    order: Order | null,
): ProductionRoomDestination[] => {
    if (!order?.routings) {
        return [];
    }

    const requiredRoutings = [...order.routings]
        .filter((routing) => routing.is_required)
        .sort((a, b) => a.id - b.id);

    const sequence: ProductionRoomDestination[] = [];

    requiredRoutings.forEach((routing) => {
        switch (routing.station_name) {
            case 'print':
                if (!sequence.includes('print')) {
                    sequence.push('print');
                }

                break;
            case 'cutting':
                if (!sequence.includes('cutting')) {
                    sequence.push('cutting');
                }

                break;
            case 'screen':
            case 'flex':
                if (!sequence.includes('screen_flex')) {
                    sequence.push('screen_flex');
                }

                break;
            case 'embroidery':
                if (!sequence.includes('embroidery')) {
                    sequence.push('embroidery');
                }

                break;
            case 'sewing':
                if (!sequence.includes('sewing')) {
                    sequence.push('sewing');
                }

                break;
            case 'qc':
                if (!sequence.includes('qc')) {
                    sequence.push('qc');
                }

                break;
            case 'shipping':
                if (!sequence.includes('shipping')) {
                    sequence.push('shipping');
                }

                break;
            default:
                break;
        }
    });

    // Insert `print` after `cutting` for sublimation jobs even if no explicit print routing exists.
    const looksLikeSublimation = (order: Order | null): boolean => {
        if (!order) {
            return false;
        }

        const specSublimation = Boolean(
            order.specification?.sublimation_detail,
        );
        const jobType = (order.job_type ?? '').toString().toLowerCase();
        const jobTypeFlag =
            jobType.includes('ซับ') || jobType.includes('sublimation');

        return specSublimation || jobTypeFlag;
    };

    if (looksLikeSublimation(order)) {
        const cuttingIndex = sequence.indexOf('cutting');

        if (cuttingIndex >= 0 && !sequence.includes('print')) {
            sequence.splice(cuttingIndex + 1, 0, 'print');
        }
    }

    return sequence;
};

export const getDestinationRoutingStatus = (
    order: Order | null,
    destination: ProductionRoomDestination,
): string | null => {
    if (!order) {
        return null;
    }

    const routings = (order.routings ?? []).filter(
        (item) => item.is_required,
    ) as OrderRoutingRecord[];

    if (destination === 'screen_flex') {
        const matchingStatuses = routings
            .filter((item) => ['screen', 'flex'].includes(item.station_name))
            .map((item) => item.status);

        if (matchingStatuses.length === 0) {
            return null;
        }

        if (
            matchingStatuses.some(
                (status) =>
                    status === 'in_progress' ||
                    status === 'pending' ||
                    status === 'rejected',
            )
        ) {
            return 'in_progress';
        }

        return matchingStatuses.every((status) => status === 'completed')
            ? 'completed'
            : 'skipped';
    }

    const routing = routings.find((item) => item.station_name === destination);

    return routing?.status ?? null;
};

export const isDestinationFinished = (
    order: Order | null,
    destination: ProductionRoomDestination,
): boolean => {
    if (!order) {
        return true;
    }

    const routings = (order.routings ?? []).filter(
        (item) => item.is_required,
    ) as OrderRoutingRecord[];

    if (destination === 'screen_flex') {
        const matchingStatuses = routings
            .filter((item) => ['screen', 'flex'].includes(item.station_name))
            .map((item) => item.status);

        if (matchingStatuses.length === 0) {
            return true;
        }

        return matchingStatuses.every((status) => status === 'completed');
    }

    const routing = routings.find((item) => item.station_name === destination);

    return routing?.status === 'completed';
};

export const getNextRoomOptionsForCurrentPage = (
    order: Order | null,
    currentRoom: ProductionRoomDestination | null,
): ProductionRoomDestination[] => {
    const sequence = getRequiredRoomSequence(order);
    const currentIndex = currentRoom ? sequence.indexOf(currentRoom) : -1;

    if (currentIndex < 0) {
        return [];
    }

    const availableDestinations: ProductionRoomDestination[] = [];

    sequence.forEach((destination, index) => {
        if (destination === currentRoom) {
            return;
        }

        const destinationStatus = getDestinationRoutingStatus(
            order,
            destination,
        );
        const isForwardDestination = index > currentIndex;
        const isReopenableDestination =
            index < currentIndex &&
            ['skipped', 'pending', 'completed', 'in_progress'].includes(
                destinationStatus ?? '',
            );
        const isCurrentStepStillActive =
            destinationStatus === 'in_progress' ||
            destinationStatus === 'pending';
        const isCompletedDestination = destinationStatus === 'completed';

        if (isCompletedDestination) {
            return;
        }

        if (
            isForwardDestination ||
            (isReopenableDestination && !isCurrentStepStillActive)
        ) {
            availableDestinations.push(destination);
        }
    });

    return availableDestinations;
};

export const getTargetStatusForNextStation = (
    targetStation:
        | ProductionRoomDestination
        | 'screen'
        | 'flex'
        | 'embroidery'
        | 'cutting'
        | 'sewing'
        | 'qc'
        | 'shipping',
): 'pending' | 'in_progress' => {
    return [
        'print',
        'screen',
        'flex',
        'embroidery',
        'cutting',
        'sewing',
    ].includes(targetStation)
        ? 'pending'
        : 'in_progress';
};

export const getCurrentRoomTransitionStatus = (
    currentRoutingStatus: string | null | undefined,
): 'completed' | 'skipped' => {
    return currentRoutingStatus === 'in_progress' ||
        currentRoutingStatus === 'completed'
        ? 'completed'
        : 'skipped';
};

export const getDestinationOptionLabel = (
    order: Order | null,
    destination: ProductionRoomDestination,
    currentRoom: ProductionRoomDestination | null,
): string => {
    const sequence = getRequiredRoomSequence(order);
    const currentIndex = currentRoom ? sequence.indexOf(currentRoom) : -1;
    const destinationIndex = sequence.indexOf(destination);

    if (
        currentIndex >= 0 &&
        destinationIndex >= 0 &&
        destinationIndex < currentIndex
    ) {
        const routingStatus = getDestinationRoutingStatus(order, destination);

        if (routingStatus === 'skipped' || routingStatus === 'completed') {
            return `กลับไป${nextRoomLabelFromStation(destination)}`;
        }
    }

    return `ข้ามไป${nextRoomLabelFromStation(destination)}`;
};
