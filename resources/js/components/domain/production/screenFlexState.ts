import type { Order, ScreenTeam } from '@/types/models';

export type ScreenFlexRouting = NonNullable<Order['routings']>[number];

export type ScreenFlexStatusBucket =
    'new_job' | 'assigned' | 'rework' | 'completed' | 'none';

function isRoutingReady(order: Order, routingId: number): boolean {
    const requiredRoutings = [...(order.routings ?? [])]
        .filter((routing) => routing.is_required)
        .sort((a, b) => a.id - b.id);
    const targetIndex = requiredRoutings.findIndex(
        (routing) => routing.id === routingId,
    );

    if (targetIndex === -1) {
        return false;
    }

    if (targetIndex === 0) {
        return true;
    }

    return requiredRoutings
        .slice(0, targetIndex)
        .every((routing) => ['completed', 'skipped'].includes(routing.status));
}

export function getScreenFlexRoutings(order: Order): ScreenFlexRouting[] {
    return [...(order.routings ?? [])]
        .filter((routing) => ['screen', 'flex'].includes(routing.station_name))
        .sort((a, b) => a.id - b.id);
}

export function resolveScreenFlexRouting(
    order: Order,
): ScreenFlexRouting | null {
    const routings = getScreenFlexRoutings(order);

    if (routings.length === 0) {
        return null;
    }

    const requiredRoutings = [...(order.routings ?? [])]
        .filter((routing) => routing.is_required)
        .sort((a, b) => a.id - b.id);

    const requiredScreenFlexRoutings = requiredRoutings.filter((routing) =>
        ['screen', 'flex'].includes(routing.station_name),
    );

    if (requiredScreenFlexRoutings.length === 0) {
        return routings[0];
    }

    const routingById = (routingId: number) =>
        routings.find((routing) => routing.id === routingId) ?? null;

    const inProgressRouting = requiredScreenFlexRoutings.find(
        (routing) => routing.status === 'in_progress',
    );

    if (inProgressRouting) {
        return routingById(inProgressRouting.id);
    }

    const rejectedRouting = requiredScreenFlexRoutings.find(
        (routing) => routing.status === 'rejected',
    );

    if (rejectedRouting) {
        return routingById(rejectedRouting.id);
    }

    const readyPendingRouting = requiredScreenFlexRoutings.find(
        (routing) =>
            routing.status === 'pending' && isRoutingReady(order, routing.id),
    );

    if (readyPendingRouting) {
        return routingById(readyPendingRouting.id);
    }

    const pendingRouting = requiredScreenFlexRoutings.find(
        (routing) => routing.status === 'pending',
    );

    if (pendingRouting) {
        return routingById(pendingRouting.id);
    }

    return [...requiredScreenFlexRoutings]
        .reverse()
        .find((routing) => ['completed', 'skipped'].includes(routing.status))
        ? routingById(
              [...requiredScreenFlexRoutings]
                  .reverse()
                  .find((routing) =>
                      ['completed', 'skipped'].includes(routing.status),
                  )!.id,
          )
        : routings[0];
}

export function resolveScreenFlexStatusBucket(
    order: Order,
): ScreenFlexStatusBucket {
    const routing = resolveScreenFlexRouting(order);

    if (!routing) {
        return 'none';
    }

    if (routing.status === 'pending') {
        return 'new_job';
    }

    if (routing.status === 'in_progress') {
        return 'assigned';
    }

    if (routing.status === 'rejected') {
        return 'rework';
    }

    if (routing.status === 'completed' || routing.status === 'skipped') {
        return 'completed';
    }

    return 'none';
}

export function resolveScreenFlexActionStatus(
    order: Order,
): { label: string; className: string } | null {
    const bucket = resolveScreenFlexStatusBucket(order);

    if (bucket === 'new_job') {
        return {
            label: 'งานเข้าใหม่',
            className: 'border-[#94A3B8] bg-[#F1F5F9] text-[#475569]',
        };
    }

    if (bucket === 'assigned') {
        return {
            label: 'สกรีน เฟล็ก',
            className: 'border-[#FCD34D] bg-[#FEFCE8] text-[#92400E]',
        };
    }

    if (bucket === 'rework') {
        return {
            label: 'แก้ไข',
            className: 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
        };
    }

    if (bucket === 'completed') {
        return {
            label: 'เสร็จสิ้น',
            className: 'border-[#BBF7D0] bg-[#ECFDF5] text-[#166534]',
        };
    }

    return null;
}

export function resolveScreenFlexAssignedTeamLabel(
    order: Order,
    screenTeamByOrderId: Record<number, string>,
): string | undefined {
    const routing = resolveScreenFlexRouting(order);

    if (!routing || routing.status !== 'in_progress') {
        return undefined;
    }

    return routing.screen_team?.team_name ?? screenTeamByOrderId[order.id];
}

export function resolveScreenFlexCurrentStatusLabel(
    order: Order,
    screenTeamByOrderId: Record<number, string>,
    screenReworkByOrderId: Record<number, string>,
): string {
    const routing = resolveScreenFlexRouting(order);

    if (!routing) {
        return 'งานเข้าใหม่';
    }

    const teamLabel =
        routing.screen_team?.team_name ?? screenTeamByOrderId[order.id];
    const reworkNote = routing.rework_note ?? screenReworkByOrderId[order.id];

    if (routing.status === 'pending') {
        return 'งานเข้าใหม่';
    }

    if (routing.status === 'in_progress') {
        return teamLabel ? `สกรีน เฟล็ก (${teamLabel})` : 'สกรีน เฟล็ก';
    }

    if (routing.status === 'rejected') {
        return reworkNote ? `แก้ไข (${reworkNote})` : 'แก้ไข';
    }

    if (routing.status === 'completed' || routing.status === 'skipped') {
        return 'เสร็จสิ้น';
    }

    return 'งานเข้าใหม่';
}

export function canAssignScreenFlexStation(
    order: Order | null,
    station: 'screen' | 'flex',
): boolean {
    if (!order) {
        return false;
    }

    return getScreenFlexRoutings(order).some(
        (routing) => routing.station_name === station,
    );
}

export function resolveScreenTeamOptionLabel(
    station: 'screen' | 'flex',
    team: ScreenTeam,
): string {
    return station === 'flex'
        ? `แจกงาน - ${team.team_name}`
        : `ทีมสกรีน - ${team.team_name}`;
}
