<?php

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentOperation;

class UpsertGarmentOperationAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data, ?GarmentOperation $operation = null): GarmentOperation
    {
        $model = $operation ?? new GarmentOperation;

        $model->fill([
            'garment_type_id' => (int) $data['garment_type_id'],
            'name' => trim((string) $data['name']),
            'child_price' => number_format((float) $data['child_price'], 2, '.', ''),
            'adult_price' => number_format((float) $data['adult_price'], 2, '.', ''),
            'child_price_long' => $this->optionalPrice($data['child_price_long'] ?? null),
            'adult_price_long' => $this->optionalPrice($data['adult_price_long'] ?? null),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'display_order' => (int) ($data['display_order'] ?? 0),
        ]);

        $model->save();

        return $model->fresh();
    }

    /**
     * A blank long price means "same as the short one", and must be stored as
     * null rather than as 0.00, which would make the garment free to make.
     */
    private function optionalPrice(mixed $value): ?string
    {
        if ($value === null || $value === '' || ! is_numeric($value)) {
            return null;
        }

        return number_format((float) $value, 2, '.', '');
    }
}
