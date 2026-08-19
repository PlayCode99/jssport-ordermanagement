<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentOperation;

class DeleteGarmentOperationAction
{
    public function execute(GarmentOperation $operation): void
    {
        $operation->delete();
    }
}
