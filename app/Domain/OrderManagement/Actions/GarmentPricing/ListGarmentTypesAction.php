<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentType;

class ListGarmentTypesAction
{
    /**
     * @return array<int, array{id: int, category: string, code: string, name: string, is_active: bool, display_order: int, created_at: string, updated_at: string}>
     */
    public function execute(?string $category = null): array
    {
        $query = GarmentType::query()
            ->orderBy('category')
            ->orderBy('display_order')
            ->orderBy('id');

        if (is_string($category) && $category !== '') {
            $query->where('category', $category);
        }

        return $query
            ->get()
            ->map(static fn (GarmentType $type): array => [
                'id' => (int) $type->id,
                'category' => (string) $type->category->value,
                'code' => (string) $type->code,
                'name' => (string) $type->name,
                'is_active' => (bool) $type->is_active,
                'display_order' => (int) $type->display_order,
                'created_at' => $type->created_at?->toIso8601String() ?? now()->toIso8601String(),
                'updated_at' => $type->updated_at?->toIso8601String() ?? now()->toIso8601String(),
            ])
            ->values()
            ->all();
    }
}
