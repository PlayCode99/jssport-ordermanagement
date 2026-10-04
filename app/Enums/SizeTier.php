<?php

namespace App\Enums;

/**
 * A bill separates two ideas that used to be the same one.
 *
 * The TIER is how the floor cuts and sews. Kids, ประถม - มัธยมต้น and adults are
 * cut to different patterns, so each gets its own sheet, its own spec and its
 * own artwork.
 *
 * The PRICING GROUP is how labour is costed, and the shop keeps two rates — a
 * child's and an adult's. ประถม - มัธยมต้น is charged at the child's rate.
 *
 * Keeping the two apart is what lets a ประถม batch print on a sheet of its own
 * without anyone having to set up a third price.
 */
enum SizeTier: string
{
    case Kids = 'kids';
    case Junior = 'junior';
    case Adults = 'adults';

    /**
     * The tier a stored value names, or null when it names none. Bills written
     * before tiers existed carry only a pricing group, and 'oversize' is an
     * adult size the form used to write, so both still resolve.
     */
    public static function normalize(mixed $value): ?self
    {
        if ($value instanceof self) {
            return $value;
        }

        $key = mb_strtolower(trim((string) $value));

        return $key === 'oversize' ? self::Adults : self::tryFrom($key);
    }

    /**
     * The tier an order line belongs to. `size_tier` is what the form writes
     * now; a line saved before the column existed falls back to the pricing
     * group it was billed under, which is the tier it was cut at.
     */
    public static function forItem(mixed $sizeTier, mixed $sizeGroup): ?self
    {
        return self::normalize($sizeTier) ?? self::normalize($sizeGroup);
    }

    /** The rate a garment in this tier is costed at. */
    public function pricingGroup(): self
    {
        return $this === self::Adults ? self::Adults : self::Kids;
    }

    public function label(): string
    {
        return match ($this) {
            self::Kids => 'เด็ก',
            self::Junior => 'ประถม - มัธยมต้น',
            self::Adults => 'ผู้ใหญ่',
        };
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $tier): string => $tier->value, self::cases());
    }
}
