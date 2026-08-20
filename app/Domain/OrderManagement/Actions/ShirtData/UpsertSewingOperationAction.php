<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\ShirtData;

use App\Models\SewingOperation;

class UpsertSewingOperationAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data, ?SewingOperation $sewingOperation = null): SewingOperation
    {
        $model = $sewingOperation ?? new SewingOperation();

        $model->fill([
            'shirt_type_id' => (int) $data['shirt_type_id'],
            'target_group' => (string) $data['target_group'],
            'name' => trim((string) $data['name']),
            'price' => number_format((float) $data['price'], 2, '.', ''),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'display_order' => (int) ($data['display_order'] ?? 0),
        ]);

        $model->save();

        return $model->fresh();
    }
}
