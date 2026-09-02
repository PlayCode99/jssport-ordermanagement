<?php

declare(strict_types=1);

namespace App\Support\Orders;

use App\Enums\OrderStatus;
use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use App\Models\Order;
use App\Models\OrderRouting;

/**
 * When an order counts as finished.
 *
 * The counter page has always treated a completed (or skipped) shipping step as
 * "closed" even while order_status still reads `shipping`, because that is the
 * moment the goods actually left. Anything reporting on finished work has to use
 * the same rule, or the dashboard and the counter contradict each other.
 */
final class OrderCompletion
{
    public static function isClosed(Order $order): bool
    {
        if ($order->order_status === OrderStatus::Completed) {
            return true;
        }

        $shippingRouting = $order->routings
            ->first(fn (OrderRouting $routing): bool => (bool) $routing->is_required
                && $routing->station_name === RoutingStationName::Shipping);

        return $shippingRouting instanceof OrderRouting
            && in_array($shippingRouting->status, [RoutingStatus::Completed, RoutingStatus::Skipped], true);
    }
}
