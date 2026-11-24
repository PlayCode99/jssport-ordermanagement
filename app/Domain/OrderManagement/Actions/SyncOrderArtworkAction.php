<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions;

use App\Models\Order;
use App\Models\User;
use App\Support\Orders\ArtworkMediaStore;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;

/**
 * Adds, removes and re-files a bill's artwork.
 *
 * This is the one place a saved bill's pictures change. The edit form reaches
 * it through UpdateOrderAction, which rewrites the whole bill; the counter's
 * "อัปเดตรูป" reaches it on its own, so a bill already on the floor can have
 * its pictures brought up to date without its sizes, prices or routings being
 * rewritten around them.
 *
 * It takes the same field names either way, so the two paths cannot drift:
 *
 *   removed_media_ids          ids to delete, this order's artwork only
 *   design_artwork             the single cover image (replaces)
 *   shirt_artwork              files for every shirt sheet
 *   pants_artwork              files for every trouser sheet
 *   shirt_artwork_scoped       files keyed by the one sheet they belong to
 *   pants_artwork_scoped       likewise
 *   artwork_scopes             sheet re-pinned, keyed by media id
 *   sports_day_artwork         files keyed by colour house index
 *   sports_day_artwork_houses  house re-filed, keyed by media id
 *   pe_uniform_artwork         files keyed by size table (kids|adults)
 *   reference_designs          loose reference pictures
 *
 * Removal runs first: the user sees one gallery, and swapping a picture there
 * is a delete and an upload arriving together. Doing it the other way round
 * would delete the replacement when both name the same sheet.
 *
 * Callers are responsible for the transaction and for authorisation.
 */
class SyncOrderArtworkAction
{
    public function __construct(private readonly ArtworkMediaStore $store = new ArtworkMediaStore) {}

    /**
     * Who added a picture and when, written onto the media row itself. The
     * bill has no audit table, and these answer the question that actually
     * comes up on the floor: this picture is not the one we printed from —
     * when did it arrive, and who put it there. A picture with neither
     * property was attached when the bill was written.
     */
    public const UPLOADED_BY_PROPERTY = 'uploaded_by';

    public const UPLOADED_BY_NAME_PROPERTY = 'uploaded_by_name';

    public const UPLOADED_AT_PROPERTY = 'uploaded_at';

    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(Order $order, array $data, ?User $actor = null): void
    {
        $this->removeArtworkMedia($order, $data['removed_media_ids'] ?? []);

        if (($data['design_artwork'] ?? null) instanceof UploadedFile) {
            $order->clearMediaCollection('artwork');
            $this->attach($order, $data['design_artwork'], 'artwork', [], $actor);
        }

        // Shirt/pants artwork support multiple images per order. Saving
        // appends the newly selected files; images the user removed are
        // deleted above, by media id.
        foreach (Arr::wrap($data['shirt_artwork'] ?? []) as $shirtArtworkFile) {
            $this->attach($order, $shirtArtworkFile, 'shirt_artwork', [], $actor);
        }

        foreach (Arr::wrap($data['pants_artwork'] ?? []) as $pantsArtworkFile) {
            $this->attach($order, $pantsArtworkFile, 'pants_artwork', [], $actor);
        }

        // Artwork drawn for one production batch only. The batch rides
        // on the media itself, so only that batch's sheet takes it.
        foreach (Order::batchedArtworkCollections() as $collection) {
            foreach (Arr::wrap($data[$collection.'_scoped'] ?? []) as $batch => $batchFiles) {
                $normalizedBatch = Order::normalizeArtworkBatch($batch, $collection);
                $properties = $normalizedBatch === null
                    ? []
                    : [Order::ARTWORK_BATCH_PROPERTY => $normalizedBatch];

                foreach (Arr::wrap($batchFiles) as $batchFile) {
                    $this->attach($order, $batchFile, $collection, $properties, $actor);
                }
            }
        }

        $this->pinArtworkBatches($order, $data['artwork_scopes'] ?? []);
        $this->refileSportsDayArtwork($order, $data['sports_day_artwork_houses'] ?? []);

        // Form 3 (กีฬาสี): files arrive keyed by colour house index. The
        // index is stored on the media itself so the artwork can be
        // handed back to the right house on the printed sheet.
        foreach (Arr::wrap($data['sports_day_artwork'] ?? []) as $groupIndex => $groupFiles) {
            if (! is_numeric($groupIndex)) {
                continue;
            }

            foreach (Arr::wrap($groupFiles) as $groupFile) {
                $this->attach(
                    $order,
                    $groupFile,
                    'sports_day_artwork',
                    ['sports_day_group' => (int) $groupIndex],
                    $actor,
                );
            }
        }

        // ชุดพละ: files arrive keyed by size table, and the table is stored on
        // the media so each table gets its own gallery back on the form.
        foreach (Arr::wrap($data['pe_uniform_artwork'] ?? []) as $tableType => $tableFiles) {
            if ($tableType !== 'kids' && $tableType !== 'adults') {
                continue;
            }

            foreach (Arr::wrap($tableFiles) as $tableFile) {
                $this->attach(
                    $order,
                    $tableFile,
                    'pe_uniform_artwork',
                    ['pe_table' => $tableType],
                    $actor,
                );
            }
        }

        foreach (Arr::wrap($data['reference_designs'] ?? []) as $referenceDesign) {
            $this->attach($order, $referenceDesign, 'reference_designs', [], $actor);
        }
    }

    /**
     * Stores one uploaded file against the order, converted and stamped with
     * who attached it.
     * Anything that is not an uploaded file is skipped rather than refused:
     * the form sends a mix of new files and placeholders for saved ones.
     *
     * @param  array<string, mixed>  $properties
     */
    private function attach(
        Order $order,
        mixed $file,
        string $collection,
        array $properties,
        ?User $actor,
    ): void {
        if (! $file instanceof UploadedFile) {
            return;
        }

        // Stored as webp where the slot takes pictures only, the same way a
        // bill's first artwork is stored, so a picture added later is no
        // heavier than the one it replaces.
        $this->store->store(
            $order,
            $file,
            $collection,
            $properties + $this->uploadStamp($actor),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function uploadStamp(?User $actor): array
    {
        if ($actor === null) {
            return [];
        }

        return [
            self::UPLOADED_BY_PROPERTY => (int) $actor->id,
            self::UPLOADED_BY_NAME_PROPERTY => (string) $actor->name,
            self::UPLOADED_AT_PROPERTY => now()->toDateTimeString(),
        ];
    }

    /**
     * Form 3 files a house's pictures by the house's position on the bill. A
     * house removed ahead of another moves it up, so each saved picture is
     * filed again under the position its house holds now.
     */
    private function refileSportsDayArtwork(Order $order, mixed $houses): void
    {
        $positions = [];

        foreach (Arr::wrap($houses) as $mediaId => $house) {
            if (is_numeric($mediaId) && is_numeric($house)) {
                $positions[(int) $mediaId] = (int) $house;
            }
        }

        if ($positions === []) {
            return;
        }

        // Read fresh rather than from the loaded relation, which still holds
        // pictures deleted earlier in this same save.
        foreach ($order->media()->where('collection_name', 'sports_day_artwork')->get() as $media) {
            $position = $positions[(int) $media->id] ?? null;

            if ($position === null || $media->getCustomProperty('sports_day_group') === $position) {
                continue;
            }

            $media->setCustomProperty('sports_day_group', $position);
            $media->save();
        }
    }

    /**
     * Re-pins artwork already on file: to one production batch, or back to
     * every sheet of its garment when the batch is empty.
     *
     * Only this order's own shirt and trouser artwork can be re-pinned, so a
     * crafted request cannot reach another bill's images.
     *
     * @param  mixed  $scopes  batch keyed by media id
     */
    private function pinArtworkBatches(Order $order, mixed $scopes): void
    {
        $requested = [];

        foreach (Arr::wrap($scopes) as $mediaId => $batch) {
            if (is_numeric($mediaId)) {
                $requested[(int) $mediaId] = $batch;
            }
        }

        if ($requested === []) {
            return;
        }

        foreach (Order::batchedArtworkCollections() as $collection) {
            foreach ($order->getMedia($collection) as $media) {
                if (! array_key_exists((int) $media->id, $requested)) {
                    continue;
                }

                $batch = Order::normalizeArtworkBatch($requested[(int) $media->id], $collection);
                $properties = $media->custom_properties;

                if ($batch === null) {
                    unset($properties[Order::ARTWORK_BATCH_PROPERTY]);
                } else {
                    $properties[Order::ARTWORK_BATCH_PROPERTY] = $batch;
                }

                $media->custom_properties = $properties;
                $media->save();
            }
        }
    }

    /**
     * Deletes artwork the user removed while editing. Every id is checked to
     * belong to this order and to an artwork collection before anything is
     * touched, so a stray or hand-crafted id can never delete another order's
     * images -- or any non-artwork media.
     */
    private function removeArtworkMedia(Order $order, mixed $removedMediaIds): void
    {
        $ids = array_values(array_filter(
            array_map(
                static fn ($id): int => is_numeric($id) ? (int) $id : 0,
                Arr::wrap($removedMediaIds),
            ),
            static fn (int $id): bool => $id > 0,
        ));

        if ($ids === []) {
            return;
        }

        $order->media()
            ->whereIn('id', $ids)
            ->whereIn('collection_name', Order::artworkCollections())
            ->get()
            ->each(static fn ($media) => $media->delete());
    }
}
