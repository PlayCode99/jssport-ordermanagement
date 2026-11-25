<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentStyle;
use App\Models\GarmentType;
use App\Support\Orders\GarmentStyles;
use Illuminate\Validation\ValidationException;

class DeleteGarmentStyleAction
{
    /**
     * A length may only be deleted while nothing depends on it.
     *
     * A bill stores the length's code on every line it sold, and its sheets
     * and artwork are keyed by it. Deleting a length a bill names would
     * leave that bill with a heading nothing explains and artwork pinned to
     * a sheet that no longer exists — and the bill is already out of the
     * shop. Switching the length off is the answer there: it disappears from
     * new bills and every old one still reads.
     */
    public function execute(GarmentStyle $style): void
    {
        $typeCount = GarmentType::query()
            ->where('category', $style->category->value)
            ->where('style', $style->code)
            ->count();

        if ($typeCount > 0) {
            throw ValidationException::withMessages([
                'garment_style' => sprintf(
                    'ลบไม่ได้ เพราะยังมีชิ้นงานอยู่ใต้ความยาวนี้ %d รายการ ย้ายหรือลบชิ้นงานก่อน หรือปิดการใช้งานแทน',
                    $typeCount,
                ),
            ]);
        }

        $billed = GarmentStyles::billedLineCount($style);

        if ($billed > 0) {
            throw ValidationException::withMessages([
                'garment_style' => sprintf(
                    'ลบไม่ได้ เพราะมีบิลที่ขายความยาวนี้ไปแล้ว %d รายการ ใช้ปิดการใช้งานแทน บิลเก่าจะยังอ่านได้',
                    $billed,
                ),
            ]);
        }

        $style->delete();
        GarmentStyles::flushCache();
    }
}
