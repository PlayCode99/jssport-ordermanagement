<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentOperation;

class ListGarmentOperationsAction
{
    /**
     * @return array<int, array{id: int, garment_type_id: int, category: string, garment_type_code: string, garment_type_name: string, name: string, child_price: string, adult_price: string, is_active: bool, display_order: int, created_at: string, updated_at: string}>
     */
    public function execute(?int $garmentTypeId = null, ?string $category = null): array
    {
        $query = GarmentOperation::query()
            ->with(['garmentType:id,category,code,name'])
            ->orderBy('display_order')
            ->orderBy('id');

        if ($garmentTypeId !== null) {
            $query->where('garment_type_id', $garmentTypeId);
        }

        if (is_string($category) && $category !== '') {
            $query->whereHas('garmentType', fn ($builder) => $builder->where('category', $category));
        }

        return $query
            ->get()
            ->map(static fn (GarmentOperation $operation): array => [
                'id' => (int) $operation->id,
                'garment_type_id' => (int) $operation->garment_type_id,
                'category' => (string) ($operation->garmentType?->category?->value ?? ''),
                'garment_type_code' => (string) ($operation->garmentType?->code ?? ''),
                'garment_type_name' => (string) ($operation->garmentType?->name ?? ''),
                'name' => (string) $operation->name,
                'child_price' => (string) $operation->child_price,
                'adult_price' => (string) $operation->adult_price,
                'is_active' => (bool) $operation->is_active,
                'display_order' => (int) $operation->display_order,
                'created_at' => $operation->created_at?->toIso8601String() ?? now()->toIso8601String(),
                'updated_at' => $operation->updated_at?->toIso8601String() ?? now()->toIso8601String(),
            ])
            ->values()
            ->all();
    }
}
