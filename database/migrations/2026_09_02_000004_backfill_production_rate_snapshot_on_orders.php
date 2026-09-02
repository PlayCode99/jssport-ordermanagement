<?php

use App\Models\Order;
use App\Support\Production\ProductionRateSnapshotBuilder;
use Illuminate\Database\Migrations\Migration;

/**
 * Orders taken before rates were recorded get today's rates written onto them,
 * so their cost stops moving from this point on. It cannot recover what they
 * were originally booked at — that information was never stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        $builder = app(ProductionRateSnapshotBuilder::class);
        $garmentTypes = $builder->activeGarmentTypes();

        Order::query()
            ->withTrashed()
            ->whereNull('production_rate_snapshot')
            ->with(['items', 'specification'])
            ->chunkById(100, function ($orders) use ($builder, $garmentTypes): void {
                foreach ($orders as $order) {
                    $order->forceFill([
                        'production_rate_snapshot' => $builder->buildProductionRateSnapshot($order, $garmentTypes),
                    ])->saveQuietly();
                }
            });
    }

    public function down(): void
    {
        Order::query()->withTrashed()->update(['production_rate_snapshot' => null]);
    }
};
