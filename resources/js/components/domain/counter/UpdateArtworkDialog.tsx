import { router } from '@inertiajs/react';
import { Image as ImageIcon, Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { artworkPlaceLabel } from '@/components/domain/orders/artworkGallery';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** The bill whose pictures are being updated. */
export type ArtworkTarget = {
    id: number;
    orderCode: string;
    jobName?: string | null;
};

/** One slot on the bill that holds pictures, as the server works it out. */
export type ArtworkPlace = {
    key: string;
    kind:
        'cover' | 'garment_all' | 'sheet' | 'house' | 'pe_table' | 'reference';
    garment: 'shirt' | 'pants' | null;
    quantity: number;
};

export type ArtworkImage = {
    id: number;
    url: string;
    name: string;
    place: string;
    collection: string;
    uploaded_by_name: string | null;
    uploaded_at: string | null;
};

export type ArtworkPayload = {
    places: ArtworkPlace[];
    house_names: string[];
    images: ArtworkImage[];
};

/**
 * The two slots that are not a production sheet: the cover picture the receipt
 * heads with, and the loose references kept beside the bill. artworkPlaceLabel
 * calls both "ทั้งบิล", which is right on the printed gallery and too vague
 * here, where the user is choosing which of them to add a picture to.
 */
const PLACE_NAMES: Record<string, string> = {
    artwork: 'รูปปกใบรับงาน',
    reference: 'รูปอ้างอิง',
};

export function placeTitle(
    place: ArtworkPlace,
    houseNames: readonly string[],
): string {
    return PLACE_NAMES[place.key] ?? artworkPlaceLabel(place.key, houseNames);
}

/** "Every sheet of this garment" — the slot a picture sits in when unpinned. */
export function everySheetPlace(garment: 'shirt' | 'pants'): ArtworkPlace {
    return { key: garment, kind: 'garment_all', garment, quantity: 0 };
}

/**
 * The sheets a saved picture may be moved to: the other sheets of its own
 * garment, plus "every sheet of this garment".
 *
 * "Every sheet" is always offered, even though the server lists it as a slot
 * of its own only while it already holds a picture. The slot list answers
 * "which job types may I add a picture to", and unpinning is not adding — a
 * picture pinned to the wrong sheet has to have a way back that is not delete
 * and upload again.
 *
 * Only shirt and trouser artwork carries a sheet: a colour house's pictures
 * and an old ชุดพละ table's are filed by the house and the table instead, and
 * are moved by deleting and adding them again.
 */
export function moveTargets(
    image: ArtworkImage,
    places: ArtworkPlace[],
): ArtworkPlace[] {
    if (
        image.collection !== 'shirt_artwork' &&
        image.collection !== 'pants_artwork'
    ) {
        return [];
    }

    const garment =
        image.collection === 'pants_artwork' ? 'pants' : ('shirt' as const);
    const listed = places.filter(
        (place) =>
            place.garment === garment &&
            (place.kind === 'sheet' || place.kind === 'garment_all'),
    );

    return listed.some((place) => place.kind === 'garment_all')
        ? listed
        : [...listed, everySheetPlace(garment)];
}

/**
 * The form field a new file goes into, which is how the server knows the sheet
 * it was dropped on. Mirrors what UpdateOrderArtworkRequest accepts.
 */
export function uploadFieldFor(place: ArtworkPlace): string | null {
    switch (place.kind) {
        case 'cover':
            return 'design_artwork';
        case 'garment_all':
            return `${place.garment}_artwork[]`;
        case 'sheet':
            return `${place.garment}_artwork_scoped[${place.key}][]`;
        case 'house':
            return `sports_day_artwork[${place.key.replace('sports_day_', '')}][]`;
        case 'pe_table':
            return `pe_uniform_artwork[${place.key.replace('pe_', '')}][]`;
        case 'reference':
            return 'reference_designs[]';
        default:
            return null;
    }
}

/**
 * "อัปเดตรูป": add, remove and re-file a bill's pictures on their own.
 *
 * The counter form closes as soon as the floor starts cutting, which is right
 * for sizes and prices and wrong for pictures — a corrected logo arrives
 * mid-run, and a finished job gets a photograph of what actually shipped. This
 * is the one part of a locked bill that still opens, and it opens no further:
 * it posts to an endpoint that accepts nothing but artwork.
 *
 * Nothing is saved until บันทึก. A picture marked for removal stays on screen,
 * dimmed, with its own undo, because deleting the wrong one of four similar
 * logos is the easy mistake to make here and an unsaved dialog is the cheapest
 * place to catch it.
 */
export function UpdateArtworkDialog({
    target,
    onClose,
}: {
    target: ArtworkTarget | null;
    onClose: () => void;
}) {
    const [payload, setPayload] = useState<ArtworkPayload | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [removedIds, setRemovedIds] = useState<number[]>([]);
    const [added, setAdded] = useState<Record<string, File[]>>({});
    const [moved, setMoved] = useState<Record<string, string>>({});
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

    // Nothing here is cleared between bills on purpose: the counter mounts
    // this under a key of the bill's id, so a second bill arrives as a new
    // component with empty state. Clearing it by hand as well would set state
    // from inside an effect and make every open render twice over.
    useEffect(() => {
        if (target === null) {
            return;
        }

        let cancelled = false;

        fetch(`/orders/${target.id}/artwork`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(String(response.status));
                }

                return response.json();
            })
            .then((body: { data: ArtworkPayload }) => {
                if (!cancelled) {
                    setPayload(body.data);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLoadError('โหลดรูปของบิลนี้ไม่สำเร็จ กรุณาลองใหม่');
                }
            });

        return () => {
            cancelled = true;
        };
    }, [target]);

    const houseNames = payload?.house_names ?? [];
    const places = useMemo(() => payload?.places ?? [], [payload]);

    const imagesByPlace = useMemo(() => {
        const grouped: Record<string, ArtworkImage[]> = {};

        for (const image of payload?.images ?? []) {
            // A picture moved on this visit is shown where it is going, so the
            // dialog reads as the bill will look once saved.
            const place = moved[String(image.id)] ?? image.place;

            (grouped[place] ??= []).push(image);
        }

        return grouped;
    }, [payload, moved]);

    /**
     * The slots to draw: the bill's own job types, plus "every sheet of this
     * garment" once a picture has been moved there on this visit. Without the
     * second part a picture being unpinned would vanish from the dialog until
     * the save reloaded it, and look deleted.
     */
    const sections = useMemo(() => {
        const extra = (['shirt', 'pants'] as const)
            .filter(
                (garment) =>
                    (imagesByPlace[garment] ?? []).length > 0 &&
                    !places.some((place) => place.key === garment),
            )
            .map(everySheetPlace);

        return [...places, ...extra];
    }, [places, imagesByPlace]);

    /**
     * Thumbnails for the files picked on this visit. Made once per file
     * rather than in render: an object URL is a live handle on the file and a
     * fresh one each render holds every copy in memory until the tab closes.
     */
    const previews = useMemo(() => {
        const urls = new Map<File, string>();

        for (const files of Object.values(added)) {
            for (const file of files) {
                urls.set(file, URL.createObjectURL(file));
            }
        }

        return urls;
    }, [added]);

    useEffect(
        () => () => {
            previews.forEach((url) => URL.revokeObjectURL(url));
        },
        [previews],
    );

    const addedCount = Object.values(added).reduce(
        (sum, files) => sum + files.length,
        0,
    );
    const dirty =
        addedCount > 0 ||
        removedIds.length > 0 ||
        Object.keys(moved).length > 0;

    const toggleRemoved = (id: number) =>
        setRemovedIds((previous) =>
            previous.includes(id)
                ? previous.filter((other) => other !== id)
                : [...previous, id],
        );

    const addFiles = (placeKey: string, files: FileList | null) => {
        if (files === null || files.length === 0) {
            return;
        }

        // Copied out of the FileList here, before the updater runs. A
        // FileList is a live view of the input, and the caller clears that
        // input as soon as this returns so the same picture can be picked
        // again — read it inside the updater and React, which may run an
        // updater more than once, reads an input that has since been emptied
        // and the pictures are quietly dropped.
        const picked = Array.from(files);

        setAdded((previous) => ({
            ...previous,
            [placeKey]: [...(previous[placeKey] ?? []), ...picked],
        }));
    };

    const dropAdded = (placeKey: string, index: number) =>
        setAdded((previous) => ({
            ...previous,
            [placeKey]: (previous[placeKey] ?? []).filter(
                (_, position) => position !== index,
            ),
        }));

    const save = () => {
        if (target === null || !dirty) {
            return;
        }

        const form = new FormData();

        // Over the slots that were DRAWN, not just the bill's own job types:
        // a file picked in a slot this loop skipped would be dropped without
        // a word, which is the worst way to lose one.
        for (const place of sections) {
            const files = added[place.key] ?? [];
            const field = uploadFieldFor(place);

            if (files.length === 0 || field === null) {
                continue;
            }

            // The cover is one picture: the last one picked wins, the same way
            // the order form treats it.
            if (place.kind === 'cover') {
                form.append(field, files[files.length - 1]);

                continue;
            }

            files.forEach((file) => form.append(field, file));
        }

        // Keyed by media id, so they travel as JSON rather than as one POST
        // variable each — past PHP's max_input_vars a multipart request is
        // truncated without a word rather than refused.
        form.append('removed_media_ids', JSON.stringify(removedIds));
        form.append(
            'artwork_scopes',
            JSON.stringify(
                Object.fromEntries(
                    Object.entries(moved).map(([mediaId, placeKey]) => [
                        mediaId,
                        // "Every sheet of this garment" is stored as no sheet
                        // at all, which is what unpins a picture.
                        placeKey === 'shirt' || placeKey === 'pants'
                            ? ''
                            : placeKey,
                    ]),
                ),
            ),
        );
        // PHP drops uploads past max_file_uploads in silence; the server
        // compares this against what arrived and refuses a short delivery.
        form.append('artwork_file_count', String(addedCount));

        setSaving(true);
        setSaveError(null);
        router.post(`/orders/${target.id}/artwork`, form, {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => onClose(),
            onError: (errors) =>
                setSaveError(
                    Object.values(errors)[0] ??
                        'บันทึกรูปไม่สำเร็จ กรุณาลองใหม่',
                ),
            onFinish: () => setSaving(false),
        });
    };

    return (
        <Dialog
            open={target !== null}
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
        >
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ImageIcon className="size-5 text-[#174395]" />
                        อัปเดตรูป {target?.orderCode}
                    </DialogTitle>
                    <DialogDescription>
                        เพิ่ม ลบ หรือย้ายรูปของบิลนี้ได้ตลอด
                        แม้งานจะเข้าไลน์ผลิตหรือปิดงานไปแล้ว ขนาดไซซ์ ราคา
                        และวันส่งจะไม่ถูกแตะต้อง
                    </DialogDescription>
                </DialogHeader>

                {loadError !== null && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-[#E21E26]">
                        {loadError}
                    </p>
                )}

                {payload === null && loadError === null && (
                    <p className="py-6 text-center text-sm text-slate-500">
                        กำลังโหลดรูป…
                    </p>
                )}

                {payload !== null && (
                    <div className="grid gap-4">
                        {/* One slot per job type on the bill, empty ones
                            included: adding the first picture to a sheet that
                            has none is half of what this dialog is for. */}
                        {sections.map((place) => {
                            const saved = imagesByPlace[place.key] ?? [];
                            const fresh = added[place.key] ?? [];

                            const takesMany = place.kind !== 'cover';

                            return (
                                <section
                                    key={place.key}
                                    // Dropping is the other way in, and the
                                    // one that takes a handful at once without
                                    // the file dialog's modifier-click.
                                    onDragOver={(event) => {
                                        if (takesMany) {
                                            event.preventDefault();
                                            setDropTarget(place.key);
                                        }
                                    }}
                                    onDragLeave={() => setDropTarget(null)}
                                    onDrop={(event) => {
                                        if (!takesMany) {
                                            return;
                                        }

                                        event.preventDefault();
                                        setDropTarget(null);
                                        addFiles(
                                            place.key,
                                            event.dataTransfer.files,
                                        );
                                    }}
                                    className={cn(
                                        'rounded-xl border p-3',
                                        dropTarget === place.key
                                            ? 'border-[#174395] bg-blue-50/60'
                                            : 'border-slate-200',
                                    )}
                                >
                                    <header className="mb-2 flex items-center justify-between gap-2">
                                        <h3 className="text-sm font-bold text-slate-700">
                                            {placeTitle(place, houseNames)}
                                            {place.quantity > 0 && (
                                                <span className="ml-2 text-xs font-normal text-slate-400">
                                                    {place.quantity} ตัว
                                                </span>
                                            )}
                                        </h3>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                fileInputs.current[
                                                    place.key
                                                ]?.click()
                                            }
                                        >
                                            <Plus className="size-4" />
                                            เพิ่มรูป
                                        </Button>
                                        <input
                                            ref={(element) => {
                                                fileInputs.current[place.key] =
                                                    element;
                                            }}
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp"
                                            multiple={place.kind !== 'cover'}
                                            className="hidden"
                                            aria-label={`เพิ่มรูป ${placeTitle(place, houseNames)}`}
                                            onChange={(event) => {
                                                addFiles(
                                                    place.key,
                                                    event.target.files,
                                                );
                                                event.target.value = '';
                                            }}
                                        />
                                    </header>

                                    {takesMany && (
                                        // The file dialog needs ⌘ or Shift to
                                        // take more than one, which is not
                                        // obvious and reads as a one-picture
                                        // limit. Said here, next to the two
                                        // ways of doing it.
                                        <p className="mb-2 text-[11px] text-slate-400">
                                            ใส่ได้หลายรูป — ลากไฟล์มาวางตรงนี้
                                            หรือกด ⌘ / Shift ค้างไว้ตอนเลือกไฟล์
                                        </p>
                                    )}

                                    {saved.length === 0 &&
                                        fresh.length === 0 && (
                                            <p className="text-xs text-slate-400">
                                                ยังไม่มีรูป
                                            </p>
                                        )}

                                    <div className="flex flex-wrap gap-3">
                                        {saved.map((image) => {
                                            const removed = removedIds.includes(
                                                image.id,
                                            );
                                            const targets = moveTargets(
                                                image,
                                                places,
                                            );

                                            return (
                                                <figure
                                                    key={image.id}
                                                    className="w-44"
                                                >
                                                    {/* cn() rather than a
                                                        template literal:
                                                        formatting strips the
                                                        space around an
                                                        interpolated class and
                                                        glues two names into
                                                        one that matches
                                                        nothing. */}
                                                    <div className="relative">
                                                        <img
                                                            src={image.url}
                                                            alt={image.name}
                                                            className={cn(
                                                                'h-24 w-44 rounded-lg border border-slate-200 object-contain',
                                                                removed &&
                                                                    'opacity-30',
                                                            )}
                                                        />
                                                        <button
                                                            type="button"
                                                            aria-label={
                                                                removed
                                                                    ? `คืนค่ารูป ${image.name}`
                                                                    : `ลบรูป ${image.name}`
                                                            }
                                                            title={
                                                                removed
                                                                    ? 'คืนค่า'
                                                                    : 'ลบรูปนี้'
                                                            }
                                                            onClick={() =>
                                                                toggleRemoved(
                                                                    image.id,
                                                                )
                                                            }
                                                            className="absolute -top-2 -right-2 rounded-full bg-white p-1 shadow ring-1 ring-slate-200"
                                                        >
                                                            {removed ? (
                                                                <RotateCcw className="size-3.5 text-slate-600" />
                                                            ) : (
                                                                <X className="size-3.5 text-[#E21E26]" />
                                                            )}
                                                        </button>
                                                    </div>

                                                    {targets.length > 1 &&
                                                        !removed && (
                                                            <Select
                                                                value={
                                                                    moved[
                                                                        String(
                                                                            image.id,
                                                                        )
                                                                    ] ??
                                                                    image.place
                                                                }
                                                                onValueChange={(
                                                                    value,
                                                                ) =>
                                                                    setMoved(
                                                                        (
                                                                            previous,
                                                                        ) => ({
                                                                            ...previous,
                                                                            [String(
                                                                                image.id,
                                                                            )]:
                                                                                value,
                                                                        }),
                                                                    )
                                                                }
                                                            >
                                                                <SelectTrigger
                                                                    className="mt-1 h-7 w-44 text-[11px]"
                                                                    title={placeTitle(
                                                                        place,
                                                                        houseNames,
                                                                    )}
                                                                    aria-label={`ใบงานของรูป ${image.name}`}
                                                                >
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {targets.map(
                                                                        (
                                                                            option,
                                                                        ) => (
                                                                            <SelectItem
                                                                                key={
                                                                                    option.key
                                                                                }
                                                                                value={
                                                                                    option.key
                                                                                }
                                                                            >
                                                                                {placeTitle(
                                                                                    option,
                                                                                    houseNames,
                                                                                )}
                                                                            </SelectItem>
                                                                        ),
                                                                    )}
                                                                </SelectContent>
                                                            </Select>
                                                        )}

                                                    {image.uploaded_by_name !==
                                                        null && (
                                                        <figcaption className="mt-1 text-[10px] leading-tight text-slate-400">
                                                            อัปเดตโดย{' '}
                                                            {
                                                                image.uploaded_by_name
                                                            }
                                                        </figcaption>
                                                    )}
                                                </figure>
                                            );
                                        })}

                                        {fresh.map((file, index) => (
                                            <figure
                                                key={`${file.name}-${index}`}
                                                className="w-44"
                                            >
                                                <div className="relative">
                                                    <img
                                                        src={previews.get(file)}
                                                        alt={file.name}
                                                        className="h-24 w-44 rounded-lg border-2 border-dashed border-[#174395] object-contain"
                                                    />
                                                    <button
                                                        type="button"
                                                        aria-label={`เอารูปใหม่ ${file.name} ออก`}
                                                        onClick={() =>
                                                            dropAdded(
                                                                place.key,
                                                                index,
                                                            )
                                                        }
                                                        className="absolute -top-2 -right-2 rounded-full bg-white p-1 shadow ring-1 ring-slate-200"
                                                    >
                                                        <X className="size-3.5 text-[#E21E26]" />
                                                    </button>
                                                </div>
                                                <figcaption className="mt-1 text-[10px] text-[#174395]">
                                                    รูปใหม่
                                                </figcaption>
                                            </figure>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}

                {saveError !== null && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-[#E21E26]">
                        {saveError}
                    </p>
                )}

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={saving}
                    >
                        ยกเลิก
                    </Button>
                    <Button
                        type="button"
                        onClick={save}
                        disabled={saving || !dirty}
                    >
                        {saving ? 'กำลังบันทึก…' : 'บันทึกรูป'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
