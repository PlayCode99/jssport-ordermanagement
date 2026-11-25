<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions\GarmentPricing;

use App\Models\GarmentStyle;
use App\Models\GarmentType;
use App\Support\Orders\GarmentStyles;

class ListGarmentStylesAction
{
    /**
     * The lengths with what each one is carrying, so the page can say why a
     * length cannot be deleted before the user tries.
     *
     * @return array<int, array{id: int, category: string, code: string, name: string, display_order: int, is_active: bool, garment_type_count: int, billed_line_count: int}>
     */
    public function execute(?string $category = null): array
    {
        $query = GarmentStyle::query()
            ->orderBy('category')
            ->orderBy('display_order')
            ->orderBy('id');

        if (is_string($category) && $category !== '') {
            $query->where('category', $category);
        }

        return $query
            ->get()
            ->map(static fn (GarmentStyle $style): array => [
                'id' => (int) $style->id,
                'category' => $style->category->value,
                'code' => (string) $style->code,
                'name' => (string) $style->name,
                'display_order' => (int) $style->display_order,
                'is_active' => (bool) $style->is_active,
                'garment_type_count' => GarmentType::query()
                    ->where('category', $style->category->value)
                    ->where('style', $style->code)
                    ->count(),
                'billed_line_count' => GarmentStyles::billedLineCount($style),
            ])
            ->values()
            ->all();
    }
}
