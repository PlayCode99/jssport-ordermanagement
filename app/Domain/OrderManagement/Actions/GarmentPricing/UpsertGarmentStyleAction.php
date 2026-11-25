<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentStyle;
use App\Support\Orders\GarmentStyles;
use Illuminate\Validation\ValidationException;

class UpsertGarmentStyleAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data, ?GarmentStyle $style = null): GarmentStyle
    {
        $model = $style ?? new GarmentStyle;
        $category = strtoupper(trim((string) ($data['category'] ?? $model->category?->value ?? 'SHIRT')));
        $category = $category === 'PANTS' ? 'PANTS' : 'SHIRT';

        // The code is what bills already carry and what sheet keys are built
        // from. Renaming "แขนกุด" is a correction; changing its code would
        // orphan every bill sold at that length, so it is settled once.
        $code = $style === null
            ? $this->resolveCode($category, $data['code'] ?? null, (string) ($data['name'] ?? ''))
            : (string) $model->code;

        $model->fill([
            'category' => $category,
            'code' => $code,
            'name' => trim((string) ($data['name'] ?? '')),
            'display_order' => (int) ($data['display_order'] ?? 0),
            'is_active' => (bool) ($data['is_active'] ?? true),
        ]);

        $model->save();
        GarmentStyles::flushCache();

        return $model->fresh();
    }

    /**
     * A machine name for a new length: what the user typed if they typed one,
     * otherwise one made from the name. A Thai name leaves nothing to
     * transliterate, so it falls back to a numbered code — never shown to
     * anyone, only stored and matched.
     */
    private function resolveCode(string $category, mixed $given, string $name): string
    {
        $typed = strtolower(trim((string) ($given ?? '')));
        $typed = preg_replace('/[^a-z0-9_]/', '', $typed) ?? '';

        if ($typed === '') {
            $fromName = strtolower(trim($name));
            $fromName = preg_replace('/[^a-z0-9]+/', '_', $fromName) ?? '';
            $typed = trim($fromName, '_');
        }

        if ($typed === '') {
            $typed = 'style_'.(GarmentStyle::query()->where('category', $category)->count() + 1);
        }

        $typed = substr($typed, 0, 20);
        $base = $typed;
        $suffix = 2;

        while (
            GarmentStyle::query()
                ->where('category', $category)
                ->where('code', $typed)
                ->exists()
        ) {
            $typed = substr($base, 0, 17).'_'.$suffix;
            $suffix++;

            if ($suffix > 99) {
                throw ValidationException::withMessages([
                    'code' => 'สร้างรหัสความยาวไม่สำเร็จ กรุณาระบุรหัสเอง',
                ]);
            }
        }

        return $typed;
    }
}
