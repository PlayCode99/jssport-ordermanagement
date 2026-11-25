<?php

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentType;
use App\Support\Orders\GarmentStyles;

class UpsertGarmentTypeAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data, ?GarmentType $garmentType = null): GarmentType
    {
        $model = $garmentType ?? new GarmentType;

        $model->fill([
            'category' => (string) $data['category'],
            'style' => $this->style($data['category'] ?? null, $data['style'] ?? null),
            'code' => strtoupper(trim((string) $data['code'])),
            'name' => trim((string) $data['name']),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'display_order' => (int) ($data['display_order'] ?? 0),
        ]);

        $model->save();

        return $model->fresh();
    }

    /**
     * The length this garment is made to, checked against the lengths the
     * shop actually keeps. A length that belongs to the other category — or
     * one that has been deleted — falls back to the category's first rather
     * than being stored as a cut the floor cannot make.
     */
    private function style(mixed $category, mixed $style): string
    {
        $allowed = GarmentStyles::codes((string) $category);

        if (in_array($style, $allowed, true)) {
            return (string) $style;
        }

        return $allowed[0] ?? 'short';
    }
}
