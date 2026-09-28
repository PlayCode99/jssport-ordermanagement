<?php

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentType;

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
     * The length this garment is made to. A pair of trousers is never
     * sleeveless, so that answer falls back to the base length rather than
     * being stored as a cut the floor cannot make.
     */
    private function style(mixed $category, mixed $style): string
    {
        $allowed = (string) $category === 'PANTS'
            ? ['short', 'long']
            : ['short', 'long', 'sleeveless'];

        return in_array($style, $allowed, true) ? (string) $style : 'short';
    }
}
