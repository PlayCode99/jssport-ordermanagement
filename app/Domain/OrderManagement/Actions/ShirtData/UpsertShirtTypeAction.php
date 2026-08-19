<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\ShirtData;

use App\Models\ShirtType;

class UpsertShirtTypeAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data, ?ShirtType $shirtType = null): ShirtType
    {
        $model = $shirtType ?? new ShirtType();

        $model->fill([
            'code' => strtoupper(trim((string) $data['code'])),
            'name' => trim((string) $data['name']),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'display_order' => (int) ($data['display_order'] ?? 0),
        ]);

        $model->save();

        return $model->fresh();
    }
}
