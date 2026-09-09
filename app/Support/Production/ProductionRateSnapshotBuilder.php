<?php

declare(strict_types=1);

namespace App\Support\Production;

use App\Models\GarmentType;
use App\Models\Order;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;

/**
 * Captures the production labour rates in force at the moment an order is
 * taken, so the order carries its own cost basis instead of being re-priced
 * every time master data changes.
 */
class ProductionRateSnapshotBuilder
{
    use ProductionCostCalculation;

    /**
     * @return array<string, mixed>
     */
    public function forOrder(Order $order): array
    {
        return $this->buildProductionRateSnapshot($order, $this->activeGarmentTypes());
    }

    /**
     * Active garment types grouped by category.
     *
     * @return Collection<array-key, EloquentCollection<int, GarmentType>>
     */
    public function activeGarmentTypes(): Collection
    {
        return GarmentType::query()
            ->with(['operations' => fn ($query) => $query
                ->where('is_active', true)
                ->orderBy('display_order')
                ->orderBy('id')])
            ->where('is_active', true)
            ->get()
            ->groupBy(fn (GarmentType $type): string => $type->category->value ?? '')
            // Eloquent's collection may only hold models, and this one holds
            // groups, so the grouped result is a plain collection.
            ->toBase();
    }
}
