<?php

declare(strict_types=1);

namespace App\Support\Orders;

use App\Domain\OrderManagement\Actions\SyncOrderArtworkAction;
use App\Enums\SizeTier;
use App\Models\Order;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * The places a saved bill's pictures can sit, for "อัปเดตรูป".
 *
 * A place is one slot on the bill that holds pictures: the cover, a garment
 * sheet, every sheet of a garment at once, a colour house, an old ชุดพละ
 * table, or the loose reference pictures. The keys are the ones the bill
 * already stores against its media — Order::artworkPlaceOf reads them back —
 * so the counter offers exactly the slots production prints from.
 *
 * Two rules decide the list, and the first one is the strict one:
 *
 *  - a slot is offered when the bill is BILLED for it — one per garment sheet
 *    its own lines produce, and for Form 3 one per colour house. A bill for a
 *    child's short-sleeved shirt, a ประถม short-sleeved shirt and a child's
 *    long trousers offers those three and nothing else. Offering more invites
 *    a picture onto a sheet the shop will never print, where nobody looking
 *    at the bill afterwards will find it;
 *  - a slot that already HOLDS a picture is offered as well, whatever the
 *    bill now says — a sheet whose last line was edited away leaves its
 *    pictures behind, and a picture nobody can see is a picture nobody can
 *    delete.
 *
 * So the cover, the loose references, "every sheet of this garment" and the
 * old ชุดพละ tables appear only on the bills that actually use them. They are
 * not job types, and a bill that has none of them is not asking to be given
 * them here: they are set where the bill is written.
 */
final class OrderArtworkPlaces
{
    public const KIND_COVER = 'cover';

    public const KIND_GARMENT_ALL = 'garment_all';

    public const KIND_SHEET = 'sheet';

    public const KIND_HOUSE = 'house';

    public const KIND_PE_TABLE = 'pe_table';

    public const KIND_REFERENCE = 'reference';

    /**
     * Lines a bill records as a shirt or as trousers. 'separate_*' is what the
     * form writes when the two are billed apart rather than as a set.
     */
    private const SHIRT_ITEM_TYPES = ['shirt', 'separate_shirt'];

    private const PANTS_ITEM_TYPES = ['pants', 'separate_pants'];

    /**
     * @return array{
     *     places: list<array{key: string, kind: string, garment: string|null, quantity: int}>,
     *     house_names: list<string>,
     *     images: list<array{id: int, url: string, name: string, place: string, collection: string, uploaded_by_name: string|null, uploaded_at: string|null}>
     * }
     */
    public static function for(Order $order): array
    {
        $decoded = self::decodedSpecification($order);
        $mode = is_string($decoded['mode'] ?? null) ? $decoded['mode'] : '';
        $houseNames = self::houseNames($decoded, $mode);
        $images = self::images($order);

        $places = [];
        $add = static function (string $key, string $kind, ?string $garment, int $quantity) use (&$places): void {
            if (isset($places[$key])) {
                $places[$key]['quantity'] += $quantity;

                return;
            }

            $places[$key] = ['key' => $key, 'kind' => $kind, 'garment' => $garment, 'quantity' => $quantity];
        };

        // One slot per sheet the bill's own lines produce — the job types the
        // counter wrote and the floor will print.
        foreach (self::sheetsOf($order) as $key => $sheet) {
            $add($key, self::KIND_SHEET, $sheet['garment'], $sheet['quantity']);
        }

        // Form 3 is cut per colour house rather than per sheet, so the houses
        // on the bill are its job types.
        if ($mode === 'sports_day') {
            foreach (array_keys($houseNames) as $index) {
                $add('sports_day_'.$index, self::KIND_HOUSE, null, 0);
            }
        }

        // A picture outliving the sheet it was pinned to still has to be
        // reachable, so its place is offered even though nothing is billed
        // for it any more. This is also what keeps the cover, the references
        // and the old ชุดพละ tables reachable on the bills that use them.
        foreach ($images as $image) {
            if ($image['place'] === 'all' || isset($places[$image['place']])) {
                continue;
            }

            $add($image['place'], self::kindOfHoldingPlace($image['place']), self::garmentOfPlace($image['place']), 0);
        }

        return [
            'places' => array_values($places),
            'house_names' => array_values($houseNames),
            'images' => $images,
        ];
    }

    /**
     * Every picture on the bill with the place it sits in. Unlike the receipt
     * gallery, the same file attached twice is listed twice: each copy is its
     * own media row, and deleting one must not take the other with it.
     *
     * @return list<array{id: int, url: string, name: string, place: string, collection: string, uploaded_by_name: string|null, uploaded_at: string|null}>
     */
    private static function images(Order $order): array
    {
        $images = [];

        foreach (Order::artworkCollections() as $collection) {
            foreach ($order->getMedia($collection) as $media) {
                /** @var Media $media */
                $uploadedBy = $media->getCustomProperty(SyncOrderArtworkAction::UPLOADED_BY_NAME_PROPERTY);
                $uploadedAt = $media->getCustomProperty(SyncOrderArtworkAction::UPLOADED_AT_PROPERTY);

                $images[] = [
                    'id' => (int) $media->id,
                    'url' => $media->getUrl(),
                    'name' => (string) $media->name,
                    // The cover and the loose reference pictures both read
                    // as 'all' on the receipt gallery, where they are just
                    // pictures of the bill. Here they are two slots the user
                    // adds to separately, so each is named.
                    'place' => match ($collection) {
                        'artwork' => 'artwork',
                        'reference_designs' => 'reference',
                        default => Order::artworkPlaceOf($media, $collection),
                    },
                    'collection' => $collection,
                    // Empty for a picture attached when the bill was written:
                    // the stamp is only put on pictures changed afterwards.
                    'uploaded_by_name' => is_string($uploadedBy) && trim($uploadedBy) !== '' ? $uploadedBy : null,
                    'uploaded_at' => is_string($uploadedAt) && trim($uploadedAt) !== '' ? $uploadedAt : null,
                ];
            }
        }

        return $images;
    }

    /**
     * The sheets the bill is actually billed for, keyed `{garment}_{tier}_{length}`
     * exactly as the production sheet and the artwork batch spell them.
     *
     * @return array<string, array{garment: string, quantity: int}>
     */
    private static function sheetsOf(Order $order): array
    {
        $sheets = [];

        foreach ($order->items as $item) {
            $garment = self::garmentOfItem((string) $item->item_type);

            if ($garment === null) {
                continue;
            }

            $tier = SizeTier::forItem($item->size_tier, $item->size_group)?->value ?? SizeTier::Adults->value;
            $style = $garment === 'pants' ? $item->pants_style : $item->shirt_style;
            $allowed = $garment === 'pants' ? ['short', 'long'] : ['short', 'long', 'sleeveless'];
            // A line saved before lengths were recorded has none, and the
            // floor files it under 'unspecified' rather than guessing short.
            $length = in_array($style, $allowed, true) ? (string) $style : 'unspecified';
            $key = $garment.'_'.$tier.'_'.$length;

            $sheets[$key] ??= ['garment' => $garment, 'quantity' => 0];
            $sheets[$key]['quantity'] += max(0, (int) $item->quantity);
        }

        return $sheets;
    }

    private static function garmentOfItem(string $itemType): ?string
    {
        if (in_array($itemType, self::SHIRT_ITEM_TYPES, true)) {
            return 'shirt';
        }

        return in_array($itemType, self::PANTS_ITEM_TYPES, true) ? 'pants' : null;
    }

    /** The garment a place key names, where it names one. */
    private static function garmentOfPlace(string $place): ?string
    {
        if (str_contains($place, '_shirt_') || str_starts_with($place, 'shirt')) {
            return 'shirt';
        }

        return str_contains($place, '_pants_') || str_starts_with($place, 'pants') ? 'pants' : null;
    }

    /**
     * The kind a place belongs to, worked out from its key alone. Used for
     * the slots that are listed because they hold a picture rather than
     * because the bill is billed for them.
     */
    private static function kindOfHoldingPlace(string $place): string
    {
        if ($place === 'artwork') {
            return self::KIND_COVER;
        }

        if ($place === 'reference') {
            return self::KIND_REFERENCE;
        }

        if (str_starts_with($place, 'pe_')) {
            return self::KIND_PE_TABLE;
        }

        if (preg_match('/^sports_day_\d+$/', $place) === 1) {
            return self::KIND_HOUSE;
        }

        return $place === 'shirt' || $place === 'pants'
            ? self::KIND_GARMENT_ALL
            : self::KIND_SHEET;
    }

    /**
     * The colour houses, by position on the bill — the position the artwork is
     * stored against, so renaming a house never orphans its pictures.
     *
     * @param  array<string, mixed>  $decoded
     * @return array<int, string>
     */
    private static function houseNames(array $decoded, string $mode): array
    {
        if ($mode !== 'sports_day' || ! is_array($decoded['sports_day_groups'] ?? null)) {
            return [];
        }

        $names = [];

        foreach (array_values($decoded['sports_day_groups']) as $index => $group) {
            if (! is_array($group)) {
                continue;
            }

            $name = trim((string) ($group['team_name'] ?? ''));

            if ($name === '') {
                $name = trim((string) ($group['color_name'] ?? ''));
            }

            $names[$index] = $name !== '' ? $name : 'คณะที่ '.($index + 1);
        }

        return $names;
    }

    /**
     * @return array<string, mixed>
     */
    private static function decodedSpecification(Order $order): array
    {
        $payload = $order->specification?->screen_print_detail;

        if (! is_string($payload) || trim($payload) === '') {
            return [];
        }

        $decoded = json_decode($payload, true);

        return is_array($decoded) ? $decoded : [];
    }
}
