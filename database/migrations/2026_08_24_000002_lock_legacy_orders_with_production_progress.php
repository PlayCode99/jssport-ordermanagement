<?php

use App\Enums\OrderStatus;
use App\Enums\RoutingStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('orders')
            ->whereIn('order_status', [
                OrderStatus::Draft->value,
                OrderStatus::Designing->value,
                OrderStatus::WaitingCustomerConfirm->value,
                OrderStatus::Confirmed->value,
            ])
            ->whereExists(function ($query): void {
                $query
                    ->selectRaw('1')
                    ->from('order_routings')
                    ->whereColumn('order_routings.order_id', 'orders.id')
                    ->where('order_routings.is_required', true)
                    ->whereIn('order_routings.status', [
                        RoutingStatus::InProgress->value,
                        RoutingStatus::Completed->value,
                    ]);
            })
            ->update([
                'order_status' => OrderStatus::InProduction->value,
                'updated_at' => now(),
            ]);
    }

    public function down(): void {}
};
