<?php

use App\Enums\OrderStatus;
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
            ])
            ->update([
                'order_status' => OrderStatus::Confirmed->value,
                'updated_at' => now(),
            ]);
    }

    public function down(): void {}
};
