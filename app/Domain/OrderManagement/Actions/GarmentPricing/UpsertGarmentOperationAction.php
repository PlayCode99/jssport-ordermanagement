<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentOperation;

class UpsertGarmentOperationAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data, ?GarmentOperation $operation = null): GarmentOperation
    {
        $model = $operation ?? new GarmentOperation();

        $model->fill([
            'garment_type_id' => (int) $data['garment_type_id'],
            'name' => trim((string) $data['name']),
            'child_price' => number_format((float) $data['child_price'], 2, '.', ''),
            'adult_price' => number_format((float) $data['adult_price'], 2, '.', ''),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'display_order' => (int) ($data['display_order'] ?? 0),
        ]);

        $model->save();

        return $model->fresh();
    }
}
