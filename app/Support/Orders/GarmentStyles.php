<?php

declare(strict_types=1);

namespace App\Support\Orders;

use App\Models\GarmentStyle;
use App\Models\OrderItem;
use Illuminate\Support\Collection;

/**
 * The lengths a garment can be cut to, read from the shop's own list.
 *
 * Everything that used to spell out 'short', 'long' and 'sleeveless' asks
 * here instead, so adding a length is one row rather than an edit in
 * nineteen files.
 *
 * Reads are cached for the request. A single page build asks for the list a
 * dozen times — once per validation rule, once per sheet key, once per
 * label — and they cannot change underneath one another mid-request.
 */
final class GarmentStyles
{
    /** @var array<string, list<string>>|null */
    private static ?array $codeCache = null;

    /** @var array<string, array<string, string>>|null */
    private static ?array $labelCache = null;

    public static function flushCache(): void
    {
        self::$codeCache = null;
        self::$labelCache = null;
    }

    /**
     * Every length on file for a category, switched off ones included.
     *
     * A bill written last year may name a length the shop has since stopped
     * selling, and that bill still has to read, price and print.
     *
     * @return list<string>
     */
    public static function codes(string $category): array
    {
        $category = strtoupper(trim($category)) === 'PANTS' ? 'PANTS' : 'SHIRT';

        if (self::$codeCache === null) {
            self::$codeCache = GarmentStyle::query()
                ->orderBy('display_order')
                ->orderBy('id')
                ->get()
                ->groupBy(fn (GarmentStyle $style): string => $style->category->value)
                ->map(fn (Collection $styles): array => $styles
                    ->map(fn (GarmentStyle $style): string => (string) $style->code)
                    ->values()
                    ->all())
                ->all();
        }

        return self::$codeCache[$category] ?? [];
    }

    /** The lengths a counter may pick from when a bill is being written. */
    public static function activeCodes(string $category): array
    {
        return GarmentStyle::query()
            ->where('category', strtoupper(trim($category)) === 'PANTS' ? 'PANTS' : 'SHIRT')
            ->where('is_active', true)
            ->orderBy('display_order')
            ->orderBy('id')
            ->pluck('code')
            ->map(static fn ($code): string => (string) $code)
            ->all();
    }

    /**
     * The list as the browser needs it: code, name and the order they are
     * read in, so a page can label a length without a table of its own.
     *
     * @return array<string, list<array{code: string, name: string, is_active: bool}>>
     */
    public static function forDisplay(): array
    {
        $grouped = ['SHIRT' => [], 'PANTS' => []];

        foreach (
            GarmentStyle::query()->orderBy('display_order')->orderBy('id')->get() as $style
        ) {
            $grouped[$style->category->value][] = [
                'code' => (string) $style->code,
                'name' => (string) $style->name,
                'is_active' => (bool) $style->is_active,
            ];
        }

        return $grouped;
    }

    /**
     * What a length is called, for a garment.
     *
     * Never throws and never comes back empty: a sheet, a costing row or a
     * receipt will ask about a length the shop has since deleted, and about
     * 'unspecified' for lines recorded before lengths existed. A missing
     * name falls back to the code, which at least says which length it was.
     */
    public static function label(string $garment, ?string $style): string
    {
        $garment = $garment === 'pants' ? 'pants' : 'shirt';
        $code = trim((string) $style);

        if ($code === '' || $code === 'unspecified') {
            return $garment === 'pants' ? 'ไม่ระบุขา' : 'ไม่ระบุแขน';
        }

        if (self::$labelCache === null) {
            self::$labelCache = [];

            foreach (GarmentStyle::query()->get() as $style_) {
                $key = $style_->category->value === 'PANTS' ? 'pants' : 'shirt';
                self::$labelCache[$key][(string) $style_->code] = (string) $style_->name;
            }
        }

        return self::$labelCache[$garment][$code] ?? $code;
    }

    /**
     * How many order lines were sold at this length.
     *
     * The count is what decides whether a length may be deleted: a bill that
     * names a length nothing explains is a bill whose sheets lose their
     * heading and whose artwork loses the sheet it was pinned to.
     */
    public static function billedLineCount(GarmentStyle $style): int
    {
        $column = $style->category->value === 'PANTS' ? 'pants_style' : 'shirt_style';

        return OrderItem::query()->where($column, $style->code)->count();
    }
}
