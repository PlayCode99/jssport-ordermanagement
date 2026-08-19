<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentType;

class UpsertGarmentTypeAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data, ?GarmentType $garmentType = null): GarmentType
    {
        $model = $garmentType ?? new GarmentType();

        $model->fill([
            'category' => (string) $data['category'],
            'code' => strtoupper(trim((string) $data['code'])),
            'name' => trim((string) $data['name']),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'display_order' => (int) ($data['display_order'] ?? 0),
        ]);

        $model->save();

        return $model->fresh();
    }
}
