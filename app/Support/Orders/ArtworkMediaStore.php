<?php

declare(strict_types=1);

namespace App\Support\Orders;

use App\Models\Order;
use Illuminate\Http\UploadedFile;

/**
 * Stores one artwork file against a bill, as webp where the slot takes
 * pictures only.
 *
 * Artwork is uploaded straight from a phone or a designer's export, so the
 * same logo arrives as a 4 MB PNG from one person and a 400 KB webp from the
 * next. Every sheet the floor prints shows these at a few centimetres across,
 * and a bill is re-opened and re-printed for years, so the shop stores one
 * format and stores it small.
 *
 * Two slots are left exactly as they came: the cover image and the loose
 * reference pictures both accept a PDF, and a PDF is not an image to convert.
 *
 * Shared by CreateOrderAction, which writes a bill, and by
 * SyncOrderArtworkAction, which the counter form and "อัปเดตรูป" both go
 * through — so a picture is stored the same way whenever it arrives, and a
 * bill does not end up half webp and half whatever was uploaded.
 */
final class ArtworkMediaStore
{
    /**
     * The collections validated as images and nothing else, which are the
     * ones worth converting. 'artwork' and 'reference_designs' take a PDF too.
     */
    private const WEBP_COLLECTIONS = [
        'shirt_artwork',
        'pants_artwork',
        'sports_day_artwork',
        'pe_uniform_artwork',
    ];

    /**
     * Quality for the stored webp. 82 is where the shop's artwork stops
     * losing anything the eye catches at print size while the file stays a
     * fraction of the PNG it came from.
     */
    private const WEBP_QUALITY = 82;

    /**
     * @param  array<string, mixed>  $properties  custom properties, e.g. the sheet the picture is pinned to
     */
    public function store(
        Order $order,
        UploadedFile $file,
        string $collection,
        array $properties = [],
    ): void {
        if (! in_array($collection, self::WEBP_COLLECTIONS, true)) {
            $order->addMedia($file)
                ->withCustomProperties($properties)
                ->toMediaCollection($collection);

            return;
        }

        $webpBinary = $this->toWebpBinary($file);

        if ($webpBinary === null) {
            // Already webp: nothing to gain by decoding and re-encoding it,
            // which would only throw away a little more of the picture.
            if (strtolower((string) $file->getClientOriginalExtension()) === 'webp') {
                $order->addMedia($file)
                    ->withCustomProperties($properties)
                    ->toMediaCollection($collection);

                return;
            }

            // Refused rather than stored as-is. A bill that quietly kept one
            // unconverted picture is a bill nobody knows is different.
            throw new ArtworkNotConvertibleException(
                sprintf('Unable to convert %s to webp before persistence.', $collection),
            );
        }

        $baseName = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $safeBaseName = trim((string) $baseName) !== '' ? (string) $baseName : 'artwork';

        $order->addMediaFromString($webpBinary)
            ->usingFileName($safeBaseName.'.webp')
            ->usingName($safeBaseName)
            ->withCustomProperties($properties)
            ->toMediaCollection($collection);
    }

    /**
     * The file re-encoded as webp, or null when it cannot be — not an image,
     * no GD on this host, or a file that will not decode. The caller decides
     * what that means.
     */
    private function toWebpBinary(UploadedFile $file): ?string
    {
        $mimeType = strtolower((string) $file->getMimeType());

        if (! str_starts_with($mimeType, 'image/')) {
            return null;
        }

        if (! function_exists('imagecreatefromstring') || ! function_exists('imagewebp')) {
            return null;
        }

        $contents = @file_get_contents($file->getRealPath());

        if ($contents === false) {
            return null;
        }

        $image = @imagecreatefromstring($contents);

        if ($image === false) {
            return null;
        }

        ob_start();
        $written = @imagewebp($image, null, self::WEBP_QUALITY);
        $binary = ob_get_clean();
        imagedestroy($image);

        if ($written !== true || ! is_string($binary) || $binary === '') {
            return null;
        }

        return $binary;
    }
}
