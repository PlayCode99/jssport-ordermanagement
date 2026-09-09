<?php

namespace App\Support\Orders;

use App\Enums\OrderStatus;
use App\Enums\RoutingStatus;
use App\Models\Order;
use App\Models\User;
use App\Support\UserAccessControl;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Builds the delivery-due calendar shared by the owner dashboard and the
 * counter. Branch visibility follows applyBranchScope(), so a branch sees its
 * own orders and the head-office branch (branch_cross_view_code, "01") sees
 * every branch — the same rule the counter list itself uses.
 */
final class DeliveryCalendarBuilder
{
    public static function build(?string $requestedMonth, User $actor): array
    {
        $month = self::validMonth($requestedMonth) ?? now()->format('Y-m');

        $start = Carbon::createFromFormat('Y-m-d', $month.'-01')->startOfDay();
        $end = $start->copy()->addMonth();

        $days = self::ordersBetween($start, $end, $actor)
            ->groupBy(fn (Order $order): string => $order->due_date->format('Y-m-d'))
            ->map(fn (Collection $group): array => [
                'count' => $group->count(),
                'quantity' => (int) $group->sum(fn (Order $order): int => (int) $order->items->sum('quantity')),
                'orders' => $group->map(fn (Order $order): array => self::mapOrder($order))->values()->all(),
            ])
            ->all();

        return [
            'month' => $month,
            'today' => now()->format('Y-m-d'),
            'days' => $days,
        ];
    }

    /**
     * How many orders are due today for this actor. Drives the counter button
     * badge, so it is counted with the same scope the calendar is built with.
     */
    public static function dueTodayCount(User $actor): int
    {
        $start = now()->startOfDay();

        return self::baseQuery($actor)
            ->where('due_date', '>=', $start)
            ->where('due_date', '<', $start->copy()->addDay())
            ->count();
    }

    private static function ordersBetween(Carbon $start, Carbon $end, User $actor): Collection
    {
        return self::baseQuery($actor)
            ->with(['customer:id,customer_name', 'branch:id,branch_name', 'items', 'routings'])
            ->where('due_date', '>=', $start)
            ->where('due_date', '<', $end)
            ->orderBy('due_date')
            ->get();
    }

    private static function baseQuery(User $actor)
    {
        $query = Order::query()
            ->where('order_status', '!=', OrderStatus::Cancelled->value)
            ->whereNotNull('due_date');

        if ($actor->branch_id !== null) {
            UserAccessControl::applyBranchScope($query, $actor);
        }

        return $query;
    }

    private static function mapOrder(Order $order): array
    {
        return [
            'id' => $order->id,
            'order_code' => $order->order_code,
            'customer_name' => $order->customer->customer_name ?? '-',
            'branch_name' => $order->branch->branch_name ?? '-',
            'job_name' => $order->job_name,
            'job_type' => $order->job_type,
            'delivery_method' => $order->delivery_method,
            'delivery_label' => match ($order->delivery_method) {
                'shipping' => 'ขนส่ง',
                'onsite' => 'ส่งหน้างาน',
                default => 'รับที่ร้าน',
            },
            'order_status' => $order->order_status?->value,
            'status_label' => self::statusLabel($order),
            'is_closed' => OrderCompletion::isClosed($order),
            'quantity' => (int) $order->items->sum('quantity'),
        ];
    }

    private static function statusLabel(Order $order): string
    {
        if (OrderCompletion::isClosed($order)) {
            return 'ปิดงาน';
        }

        $active = $order->routings
            ->filter(fn ($routing): bool => (bool) $routing->is_required)
            ->sortBy('id')
            ->first(fn ($routing): bool => in_array(
                $routing->status?->value,
                [RoutingStatus::Pending->value, RoutingStatus::InProgress->value, RoutingStatus::Rejected->value],
                true,
            ));

        if ($active === null) {
            return 'รอดำเนินการ';
        }

        $room = match ($active->station_name?->value) {
            'design' => 'ออกแบบ',
            'print' => 'ห้องพิมพ์',
            'screen' => 'ห้องอัด',
            'flex' => 'ห้องสกรีน เฟล็กซ์',
            'embroidery' => 'ห้องปัก',
            'cutting' => 'ห้องตัด',
            'sewing' => 'ห้องเย็บ',
            'qc' => 'ตรวจสอบ',
            'shipping' => 'จัดส่ง',
            default => 'ผลิต',
        };

        return match ($active->status?->value) {
            RoutingStatus::InProgress->value => $room.' (กำลังทำ)',
            RoutingStatus::Rejected->value => $room.' (แก้ไข)',
            default => $room.' (รอคิว)',
        };
    }

    private static function validMonth(?string $value): ?string
    {
        return is_string($value) && $value !== '' && Carbon::canBeCreatedFromFormat($value.'-01', 'Y-m-d')
            ? $value
            : null;
    }
}
