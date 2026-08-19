<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\ShirtData;

use App\Models\ShirtType;
use Illuminate\Validation\ValidationException;

class DeleteShirtTypeAction
{
    public function execute(ShirtType $shirtType): void
    {
        if ($shirtType->sewingOperations()->exists()) {
            throw ValidationException::withMessages([
                'shirt_type' => 'ไม่สามารถลบประเภทเสื้อที่มีจุดเย็บผูกอยู่ได้',
            ]);
        }

        $shirtType->delete();
    }
}
