import { AlertTriangle, Plus, X } from 'lucide-react';
import type { ChangeEvent, ReactNode } from 'react';

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

/** One production batch a bill will be split into — one printed sheet. */
export type ArtworkBatchOption = {
    key: string;
    garment: 'shirt' | 'pants';
    label: string;
    quantity: number;
};

export type ArtworkSavedImage = {
    id: number;
    url: string;
    batch?: string | null;
};

export type ArtworkGarment = 'shirt' | 'pants';

/** Where an image sits: on every sheet of its garment, or on one batch. */
export const ARTWORK_SCOPE_ALL = '';

/**
 * Radix refuses an empty option value, so "every sheet" is carried through the
 * dropdown under a name of its own and translated back at the boundary. The
 * value that reaches the form — and the server — stays the empty string.
 */
const ALL_OPTION_VALUE = '__all__';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The batches this bill produces, in sheet order. */
    batches: ArtworkBatchOption[];
    /** Newly picked files that go on every sheet of their garment. */
    files: Record<ArtworkGarment, File[]>;
    /** Newly picked files pinned to a batch, keyed by batch. */
    scopedFiles: Record<ArtworkGarment, Record<string, File[]>>;
    /** Artwork already on the bill. */
    savedImages: Record<ArtworkGarment, ArtworkSavedImage[]>;
    /** Batch the user moved a saved image to, keyed by media id. */
    savedScopes: Record<string, string>;
    /** True while the bill pins artwork to individual batches. */
    splitByBatch: boolean;
    onSplitByBatchChange: (split: boolean) => void;
    onAddFiles: (
        garment: ArtworkGarment,
        batchKey: string,
        files: File[],
    ) => void;
    onRemoveFile: (
        garment: ArtworkGarment,
        batchKey: string,
        index: number,
    ) => void;
    onRemoveSaved: (id: number) => void;
    onMoveSaved: (id: number, batchKey: string) => void;
};

const GARMENT_LABELS: Record<ArtworkGarment, string> = {
    shirt: 'เสื้อ',
    pants: 'กางเกง',
};

/**
 * Where an image sits right now: the batch the user just moved it to, else
 * the batch it was saved with, else every sheet of its garment.
 */
export function savedImageScope(
    image: ArtworkSavedImage,
    savedScopes: Record<string, string>,
): string {
    const moved = savedScopes[String(image.id)];

    return moved ?? image.batch ?? ARTWORK_SCOPE_ALL;
}

function Thumb({
    src,
    alt,
    onRemove,
    removeLabel,
    footer,
}: {
    src: string;
    alt: string;
    onRemove: () => void;
    removeLabel: string;
    footer?: ReactNode;
}) {
    return (
        // A tile carrying the sheet dropdown is wider, so the sheet it is
        // pinned to can be read without opening the list.
        <div className={footer ? 'w-[132px]' : 'w-[92px]'}>
            <div className="relative h-[92px] w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                <img src={src} alt={alt} className="size-full object-contain" />
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={removeLabel}
                    className="absolute top-0 right-0 rounded-bl bg-slate-900/70 px-1 text-[10px] leading-4 text-white hover:bg-rose-600"
                >
                    <X className="size-3" />
                </button>
            </div>
            {footer}
        </div>
    );
}

function AddTile({
    inputId,
    label,
    onSelect,
}: {
    inputId: string;
    label: string;
    onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
    return (
        <label
            htmlFor={inputId}
            className="flex size-[92px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-white text-xs text-slate-500 hover:border-[#174395] hover:text-[#174395]"
        >
            <Plus className="size-4" />
            เพิ่มรูป
            <input
                id={inputId}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                aria-label={label}
                onChange={onSelect}
            />
        </label>
    );
}

/**
 * Art Work of a bill, arranged the way the bill is actually produced.
 *
 * A bill is cut and printed as one sheet per batch — garment, size group and
 * length. Most bills use one design across every sheet, so that is what the
 * dialog opens on and nothing extra has to be filled in. A bill whose sheets
 * differ switches to the per-batch list, which shows exactly the sheets this
 * bill produces and nothing it does not, so an empty slot is the only signal
 * needed that something is still missing.
 */
export function ArtworkBatchDialog({
    open,
    onOpenChange,
    batches,
    files,
    scopedFiles,
    savedImages,
    savedScopes,
    splitByBatch,
    onSplitByBatchChange,
    onAddFiles,
    onRemoveFile,
    onRemoveSaved,
    onMoveSaved,
}: Props) {
    const garments: ArtworkGarment[] = ['shirt', 'pants'];
    const hasBatches = batches.length > 0;

    const savedIn = (garment: ArtworkGarment, scope: string) =>
        savedImages[garment].filter(
            (image) => savedImageScope(image, savedScopes) === scope,
        );

    const filesIn = (garment: ArtworkGarment, scope: string) =>
        scope === ARTWORK_SCOPE_ALL
            ? files[garment]
            : (scopedFiles[garment][scope] ?? []);

    const countIn = (garment: ArtworkGarment, scope: string) =>
        savedIn(garment, scope).length + filesIn(garment, scope).length;

    const selectFiles =
        (garment: ArtworkGarment, scope: string) =>
        (event: ChangeEvent<HTMLInputElement>) => {
            const picked = Array.from(event.target.files ?? []);

            if (picked.length > 0) {
                onAddFiles(garment, scope, picked);
            }

            event.target.value = '';
        };

    const renderImages = (garment: ArtworkGarment, scope: string) => (
        <>
            {savedIn(garment, scope).map((image) => (
                <Thumb
                    key={`saved-${image.id}`}
                    src={image.url}
                    alt={`Art Work ${GARMENT_LABELS[garment]}`}
                    onRemove={() => onRemoveSaved(image.id)}
                    removeLabel={`ลบรูปที่บันทึกไว้ของ${GARMENT_LABELS[garment]}`}
                    footer={
                        splitByBatch && hasBatches ? (
                            <Select
                                value={
                                    savedImageScope(image, savedScopes) ||
                                    ALL_OPTION_VALUE
                                }
                                onValueChange={(value) =>
                                    onMoveSaved(
                                        image.id,
                                        value === ALL_OPTION_VALUE
                                            ? ARTWORK_SCOPE_ALL
                                            : value,
                                    )
                                }
                            >
                                <SelectTrigger
                                    className="mt-1 h-7 w-full bg-white px-1.5 text-[11px]"
                                    aria-label={`ใบงานของรูปที่บันทึกไว้ ${image.id}`}
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL_OPTION_VALUE}>
                                        ทุกใบ
                                    </SelectItem>
                                    {batches
                                        .filter(
                                            (batch) =>
                                                batch.garment === garment,
                                        )
                                        .map((batch) => (
                                            <SelectItem
                                                key={batch.key}
                                                value={batch.key}
                                            >
                                                {batch.label}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        ) : null
                    }
                />
            ))}
            {filesIn(garment, scope).map((file, index) => (
                <Thumb
                    key={`file-${file.name}-${file.lastModified}-${index}`}
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    onRemove={() => onRemoveFile(garment, scope, index)}
                    removeLabel={`ลบรูปที่ ${index + 1} ของ${GARMENT_LABELS[garment]}`}
                />
            ))}
        </>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Art Work ของใบงาน</DialogTitle>
                    <DialogDescription>
                        {hasBatches
                            ? 'บิลนี้จะแยกเป็นใบงานตามด้านล่าง เลือกได้ว่าจะใช้รูปเดียวกันทุกใบ หรือแยกรูปตามใบงาน'
                            : 'กรอกตารางไซซ์ก่อน ระบบจึงจะรู้ว่าบิลนี้มีใบงานอะไรบ้าง — ตอนนี้แนบรูปที่ใช้กับทุกใบได้เลย'}
                    </DialogDescription>
                </DialogHeader>

                {hasBatches ? (
                    <div
                        role="radiogroup"
                        aria-label="วิธีแนบรูป"
                        className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1"
                    >
                        {[
                            { split: false, label: 'ใช้รูปเดียวกันทุกใบ' },
                            { split: true, label: 'แยกรูปตามใบงาน' },
                        ].map((choice) => (
                            <button
                                key={choice.label}
                                type="button"
                                role="radio"
                                aria-checked={splitByBatch === choice.split}
                                onClick={() =>
                                    onSplitByBatchChange(choice.split)
                                }
                                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    splitByBatch === choice.split
                                        ? 'bg-[#174395] text-white'
                                        : 'text-slate-600 hover:bg-white'
                                }`}
                            >
                                {choice.label}
                            </button>
                        ))}
                    </div>
                ) : null}

                {!splitByBatch || !hasBatches ? (
                    <div className="space-y-3">
                        {garments.map((garment) => (
                            <section
                                key={garment}
                                className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                            >
                                <p className="mb-2 text-xs font-semibold text-slate-700">
                                    Art Work {GARMENT_LABELS[garment]}
                                    <span className="ml-2 font-normal text-slate-500">
                                        แนบแล้ว{' '}
                                        {countIn(garment, ARTWORK_SCOPE_ALL)}{' '}
                                        รูป
                                    </span>
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {renderImages(garment, ARTWORK_SCOPE_ALL)}
                                    <AddTile
                                        inputId={`artwork-all-${garment}`}
                                        label={`เลือกรูป Art Work ${GARMENT_LABELS[garment]}`}
                                        onSelect={selectFiles(
                                            garment,
                                            ARTWORK_SCOPE_ALL,
                                        )}
                                    />
                                </div>
                            </section>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {garments.some(
                            (garment) =>
                                countIn(garment, ARTWORK_SCOPE_ALL) > 0,
                        ) ? (
                            <section className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                                <p className="mb-2 text-xs font-semibold text-blue-900">
                                    ใช้กับทุกใบงาน
                                    <span className="ml-2 font-normal text-blue-700">
                                        เลือกใบงานใต้รูปเพื่อจำกัดให้ใบใดใบหนึ่ง
                                    </span>
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {garments.map((garment) =>
                                        renderImages(
                                            garment,
                                            ARTWORK_SCOPE_ALL,
                                        ),
                                    )}
                                </div>
                            </section>
                        ) : null}

                        {batches.map((batch) => {
                            const pinned = countIn(batch.garment, batch.key);
                            // Artwork pinned to nothing goes on every sheet of
                            // its garment, so a sheet with none of its own is
                            // only empty when the garment has none spare.
                            const inherited = countIn(
                                batch.garment,
                                ARTWORK_SCOPE_ALL,
                            );
                            const isEmpty = pinned === 0 && inherited === 0;

                            return (
                                <section
                                    key={batch.key}
                                    className={`rounded-lg border p-3 ${
                                        isEmpty
                                            ? 'border-amber-300 bg-amber-50/70'
                                            : 'border-slate-200 bg-slate-50/60'
                                    }`}
                                >
                                    <p className="mb-2 flex flex-wrap items-center gap-x-2 text-xs font-semibold text-slate-700">
                                        <span>{batch.label}</span>
                                        <span className="font-normal text-slate-500">
                                            {batch.quantity.toLocaleString(
                                                'th-TH',
                                            )}{' '}
                                            ตัว
                                        </span>
                                        {isEmpty ? (
                                            <span className="flex items-center gap-1 font-bold text-amber-700">
                                                <AlertTriangle className="size-3.5" />
                                                ยังไม่มีรูป
                                            </span>
                                        ) : null}
                                        {pinned === 0 && inherited > 0 ? (
                                            <span className="font-normal text-slate-500">
                                                · ใช้รูปจาก “ใช้กับทุกใบงาน”
                                            </span>
                                        ) : null}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {renderImages(batch.garment, batch.key)}
                                        <AddTile
                                            inputId={`artwork-batch-${batch.key}`}
                                            label={`เลือกรูป Art Work ${batch.label}`}
                                            onSelect={selectFiles(
                                                batch.garment,
                                                batch.key,
                                            )}
                                        />
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}

                <DialogFooter>
                    <Button type="button" onClick={() => onOpenChange(false)}>
                        เสร็จสิ้น
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Batches that would print with no artwork at all. Shown on the button that
 * opens the dialog, so a gap is noticed without opening it.
 */
export function batchesMissingArtwork(
    batches: ArtworkBatchOption[],
    files: Record<ArtworkGarment, File[]>,
    scopedFiles: Record<ArtworkGarment, Record<string, File[]>>,
    savedImages: Record<ArtworkGarment, ArtworkSavedImage[]>,
    savedScopes: Record<string, string>,
    splitByBatch: boolean,
): ArtworkBatchOption[] {
    if (!splitByBatch) {
        return [];
    }

    return batches.filter((batch) => {
        const unpinned =
            files[batch.garment].length +
            savedImages[batch.garment].filter(
                (image) =>
                    savedImageScope(image, savedScopes) === ARTWORK_SCOPE_ALL,
            ).length;

        if (unpinned > 0) {
            return false;
        }

        const pinnedFiles = scopedFiles[batch.garment][batch.key]?.length ?? 0;
        const pinnedSaved = savedImages[batch.garment].filter(
            (image) => savedImageScope(image, savedScopes) === batch.key,
        ).length;

        return pinnedFiles + pinnedSaved === 0;
    });
}
