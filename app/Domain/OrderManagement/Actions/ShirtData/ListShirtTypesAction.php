<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\ShirtData;

use App\Models\ShirtType;

class ListShirtTypesAction
{
    /**
     * @return array<int, array{id: int, code: string, name: string, is_active: bool, display_order: int, created_at: string, updated_at: string}>
     */
    public function execute(bool $onlyActive = false): array
    {
        $query = ShirtType::query()
            ->orderBy('display_order')
            ->orderBy('id');

        if ($onlyActive) {
            $query->where('is_active', true);
        }

        return $query
            ->get()
            ->map(static fn (ShirtType $shirtType): array => [
                'id' => (int) $shirtType->id,
                'code' => (string) $shirtType->code,
                'name' => (string) $shirtType->name,
                'is_active' => (bool) $shirtType->is_active,
                'display_order' => (int) $shirtType->display_order,
                'created_at' => $shirtType->created_at?->toIso8601String() ?? now()->toIso8601String(),
                'updated_at' => $shirtType->updated_at?->toIso8601String() ?? now()->toIso8601String(),
            ])
            ->values()
            ->all();
    }
}
