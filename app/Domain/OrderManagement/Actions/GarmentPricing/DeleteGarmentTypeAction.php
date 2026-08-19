<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentType;
use Illuminate\Validation\ValidationException;

class DeleteGarmentTypeAction
{
    public function execute(GarmentType $garmentType): void
    {
        if ($garmentType->operations()->exists()) {
            throw ValidationException::withMessages([
                'garment_type' => 'ไม่สามารถลบประเภทที่ยังมีรายการราคาอยู่ได้',
            ]);
        }

        $garmentType->delete();
    }
}
