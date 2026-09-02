<?php

declare(strict_types=1);

namespace App\Support\Production;

use App\Models\GarmentType;
use App\Models\Order;
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
     * @return Collection<string, Collection<int, GarmentType>>
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
            ->groupBy(fn (GarmentType $type): string => $type->category->value);
    }
}
