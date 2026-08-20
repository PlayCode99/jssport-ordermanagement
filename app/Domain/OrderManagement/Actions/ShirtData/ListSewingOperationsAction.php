<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\ShirtData;

use App\Enums\SewingTargetGroup;
use App\Models\SewingOperation;

class ListSewingOperationsAction
{
    /**
     * @return array<int, array{id: int, shirt_type_id: int, shirt_type_code: string, shirt_type_name: string, target_group: string, name: string, price: string, is_active: bool, display_order: int, created_at: string, updated_at: string}>
     */
    public function execute(?int $shirtTypeId = null, ?string $targetGroup = null, bool $onlyActive = false): array
    {
        $query = SewingOperation::query()
            ->with(['shirtType:id,code,name'])
            ->orderBy('display_order')
            ->orderBy('id');

        if ($shirtTypeId !== null) {
            $query->where('shirt_type_id', $shirtTypeId);
        }

        if ($targetGroup !== null && $targetGroup !== '') {
            $query->where('target_group', $targetGroup);
        }

        if ($onlyActive) {
            $query->where('is_active', true);
        }

        return $query
            ->get()
            ->map(static fn (SewingOperation $operation): array => [
                'id' => (int) $operation->id,
                'shirt_type_id' => (int) $operation->shirt_type_id,
                'shirt_type_code' => (string) ($operation->shirtType?->code ?? ''),
                'shirt_type_name' => (string) ($operation->shirtType?->name ?? ''),
                'target_group' => ($operation->target_group instanceof SewingTargetGroup)
                    ? $operation->target_group->value
                    : (string) $operation->target_group,
                'name' => (string) $operation->name,
                'price' => (string) $operation->price,
                'is_active' => (bool) $operation->is_active,
                'display_order' => (int) $operation->display_order,
                'created_at' => $operation->created_at?->toIso8601String() ?? now()->toIso8601String(),
                'updated_at' => $operation->updated_at?->toIso8601String() ?? now()->toIso8601String(),
            ])
            ->values()
            ->all();
    }
}
