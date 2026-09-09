<?php

declare(strict_types=1);

namespace App\Domain\Production\Actions;

use App\Enums\OrderStatus;
use App\Enums\RoutingStatus;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class ProcessQcInspectionAction
{
    public function execute(
        Order $order,
        string $decision,
        int $inspectorUserId,
        ?string $targetStationToReset = null,
        ?string $remark = null
    ): Order {
        return DB::transaction(function () use ($order, $decision, $inspectorUserId, $targetStationToReset, $remark): Order {
            $decision = strtolower($decision);

            if ($decision === 'reject' && blank($remark)) {
                throw new InvalidArgumentException('A remark is strictly mandatory when rejecting an order in QC.');
            }

            if ($decision === 'pass') {
                $order->update(['order_status' => OrderStatus::Shipping]);
                $order->routings()
                    ->where('station_name', '!=', 'shipping')
                    ->update([
                        'status' => RoutingStatus::Completed,
                        'completed_at' => now(),
                    ]);
            }

            if ($decision === 'reject') {
                $order->update(['order_status' => OrderStatus::QcRejected]);

                if ($targetStationToReset !== null) {
                    $order->routings()->where('station_name', $targetStationToReset)->firstOrFail()->update([
                        'status' => RoutingStatus::InProgress,
                        'started_at' => now(),
                        'completed_at' => null,
                    ]);
                } else {
                    $order->routings()
                        ->where('status', RoutingStatus::Completed)
                        ->whereNotIn('station_name', ['qc', 'shipping'])
                        ->update([
                            'status' => RoutingStatus::InProgress,
                            'started_at' => now(),
                            'completed_at' => null,
                        ]);
                }
            }

            $order->statusHistories()->create([
                'user_id' => $inspectorUserId,
                'from_status' => OrderStatus::QcChecking,
                'to_status' => $decision === 'pass' ? OrderStatus::Shipping : OrderStatus::QcRejected,
                'remark' => $remark,
            ]);

            return $order->fresh(['routings', 'statusHistories']);
        });
    }
}
