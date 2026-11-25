import {
    pantsStyleLabels,
    shirtStyleLabels,
    SIZE_TIER_LABELS,
} from '@/pages/Orders/garmentTables';
import type { GarmentStyle, SizeTier } from '@/pages/Orders/garmentTables';

/**
 * One picture on a bill, once, with the sheets it belongs to — as the server
 * reads it (Order::artwork_gallery). The same file attached to two tables is
 * one entry with two places.
 */
export type ArtworkGalleryEntry = { url: string; places: string[] };

export type LabelledArtwork = { url: string; labels: string[] };

const GARMENT_NAMES = { shirt: 'เสื้อ', pants: 'กางเกง' } as const;

function isTier(value: string): value is SizeTier {
    return value in SIZE_TIER_LABELS;
}

function houseName(index: number, houseNames: readonly string[]): string {
    const name = (houseNames[index] ?? '').trim();

    return name !== '' ? name : `คณะที่ ${index + 1}`;
}

/**
 * The sheet a place stands for, in the words the counter and the floor use:
 * "เสื้อเด็ก · แขนสั้น", "คณะสีแดง · เสื้อเด็ก", "ทุกใบงานเสื้อ".
 */
export function artworkPlaceLabel(
    place: string,
    houseNames: readonly string[] = [],
): string {
    if (place === 'shirt' || place === 'pants') {
        return `ทุกใบงาน${GARMENT_NAMES[place]}`;
    }

    if (place === 'pe_kids' || place === 'pe_adults') {
        return `ตาราง${SIZE_TIER_LABELS[place === 'pe_kids' ? 'kids' : 'adults']}`;
    }

    const house = place.match(/^sports_day_(\d+)(?:_(shirt|pants)_(\w+))?$/);

    if (house) {
        const name = houseName(Number(house[1]), houseNames);
        const [, , garment, tier] = house;

        return garment && tier && isTier(tier)
            ? `${name} · ${GARMENT_NAMES[garment as 'shirt' | 'pants']}${SIZE_TIER_LABELS[tier]}`
            : name;
    }

    const sheet = place.match(/^(shirt|pants)_([a-z]+)_([a-z]+)$/);

    if (sheet && isTier(sheet[2])) {
        const garment = sheet[1] as 'shirt' | 'pants';
        const style = sheet[3] as GarmentStyle;
        const length =
            garment === 'pants'
                ? pantsStyleLabels()[style]
                : shirtStyleLabels()[style];
        const name = `${GARMENT_NAMES[garment]}${SIZE_TIER_LABELS[sheet[2]]}`;

        return length ? `${name} · ${length}` : name;
    }

    return 'ทั้งบิล';
}

/**
 * Every picture on the bill, once, each with the sheets it is on. A bill
 * served before the gallery existed falls back to its plain URLs, unlabelled,
 * with repeats of the very same URL dropped.
 */
export function labelArtworkGallery(
    gallery: readonly ArtworkGalleryEntry[] | undefined,
    fallbackUrls: ReadonlyArray<string | null | undefined>,
    houseNames: readonly string[] = [],
): LabelledArtwork[] {
    if (gallery && gallery.length > 0) {
        return gallery.map((entry) => ({
            url: entry.url,
            labels: entry.places.map((place) =>
                artworkPlaceLabel(place, houseNames),
            ),
        }));
    }

    return Array.from(
        new Set(
            fallbackUrls.filter(
                (url): url is string =>
                    typeof url === 'string' && url.trim() !== '',
            ),
        ),
    ).map((url) => ({ url, labels: [] }));
}
