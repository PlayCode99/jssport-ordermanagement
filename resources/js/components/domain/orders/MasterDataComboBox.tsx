import { Check, Loader2, Plus, Settings2, Trash2 } from 'lucide-react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type MasterDataOption = {
    id: number;
    name: string;
    /**
     * False for a row that was hidden from the choices. It is still passed in
     * so a bill that picked it before it was hidden shows its name rather than
     * a bare id; it is never offered in the dropdown.
     */
    active?: boolean;
};

/**
 * Renaming and hiding are done from the form too, for the people allowed to.
 * The callbacks let the page patch the option lists it shares between fields.
 */
export type MasterDataManageProps = {
    canEdit: boolean;
    onRenamed?: (option: MasterDataOption) => void;
    onHidden?: (option: MasterDataOption) => void;
};

const CSRF_HEADERS = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    'X-CSRF-TOKEN':
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ?? '',
    Accept: 'application/json',
});

/** The server's message for a failed call, or a plain fallback. */
const failureMessage = async (
    response: Response,
    fallback: string,
): Promise<string> => {
    const payload = (await response.json().catch(() => null)) as {
        message?: string;
    } | null;

    return payload?.message ?? fallback;
};

type MasterDataComboBoxProps = {
    /** The catalog's storage_key on the backend (used only for the quick-add call). */
    storageKey: string;
    /** Existing master-data options to offer in the dropdown. */
    options: MasterDataOption[];
    /**
     * Current field value. Either the string form of an existing option's id
     * (when the user picked or added one) or arbitrary free text the user
     * typed without saving it as master data.
     */
    value: string;
    onValueChange: (value: string) => void;
    /** Called after a new master-data row is created, so the parent can add it to shared catalog state. */
    onOptionAdded?: (option: MasterDataOption) => void;
    /**
     * Whether `value` carries the picked option's id (the default, used by the
     * colour catalogs) or its display name. Name mode exists for fields whose
     * database column stores the text itself and is searched with LIKE, so an
     * id would corrupt existing rows.
     */
    valueMode?: 'id' | 'name';
    /** Extra classes for the text input, e.g. invalid-state styling. */
    className?: string;
    placeholder?: string;
    disabled?: boolean;
    id?: string;
    'aria-label'?: string;
    /** What the list is called in the manage dialog, e.g. "แบบคอ". */
    label?: string;
    /** Offer rename/hide for this list. Absent means add-only. */
    manage?: MasterDataManageProps;
};

/**
 * Free-text input combined with a dropdown of existing master-data values,
 * plus an inline "add" control that persists whatever is currently typed as
 * a brand-new master-data row (via a quick-add endpoint) instead of requiring
 * the value to already exist in a dropdown.
 *
 * Typing alone never creates master data — only clicking the add button does.
 */
export function MasterDataComboBox({
    storageKey,
    options,
    value,
    onValueChange,
    onOptionAdded,
    valueMode = 'id',
    className,
    placeholder,
    disabled,
    id,
    'aria-label': ariaLabel,
    label,
    manage,
}: MasterDataComboBoxProps) {
    // Only what is still on offer is listed; a hidden row keeps resolving the
    // name of a value that picked it earlier.
    const offeredOptions = useMemo(
        () => options.filter((option) => option.active !== false),
        [options],
    );
    const canManage = manage?.canEdit === true && !disabled;
    const [isManageOpen, setIsManageOpen] = useState(false);
    // Bumped on every open so the dialog remounts and starts its drafts from
    // the names as they are then, without an effect that sets state.
    const [manageSession, setManageSession] = useState(0);
    // Resolve the display text for the current value: if it matches a known
    // option's id, show that option's name; otherwise show the raw value
    // as-is (free text the user typed).
    const resolveDisplayText = (currentValue: string): string => {
        if (currentValue.trim() === '') {
            return '';
        }

        if (valueMode === 'name') {
            return currentValue;
        }

        const matched = options.find(
            (option) => String(option.id) === currentValue,
        );

        return matched ? matched.name : currentValue;
    };

    /** The form value an option stands for, in whichever mode is active. */
    const valueForOption = (option: MasterDataOption): string =>
        valueMode === 'name' ? option.name : String(option.id);

    const [query, setQuery] = useState<string>(() => resolveDisplayText(value));
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [justAdded, setJustAdded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Keep the visible text in sync if the value changes from outside
    // (e.g. switching between shirt/pants tabs, resetting the form).
    useEffect(() => {
        setQuery(resolveDisplayText(value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const filteredOptions = useMemo(() => {
        const needle = query.trim().toLowerCase();

        if (needle === '') {
            return offeredOptions;
        }

        return offeredOptions.filter((option) =>
            option.name.toLowerCase().includes(needle),
        );
    }, [offeredOptions, query]);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [filteredOptions.length, isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () =>
            document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectOption = (option: MasterDataOption) => {
        setQuery(option.name);
        onValueChange(valueForOption(option));
        setIsOpen(false);
        setError(null);
    };

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextText = event.target.value;
        setQuery(nextText);
        onValueChange(nextText);
        setIsOpen(true);
        setJustAdded(false);
        setError(null);
    };

    const handleAdd = async () => {
        const name = query.trim();

        if (name === '' || isSaving) {
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const response = await fetch(
                '/settings/data/catalog-items/quick-add',
                {
                    method: 'POST',
                    headers: CSRF_HEADERS(),
                    body: JSON.stringify({ storage_key: storageKey, name }),
                },
            );

            if (!response.ok) {
                setError(
                    await failureMessage(
                        response,
                        'บันทึกไม่สำเร็จ กรุณาลองใหม่',
                    ),
                );

                return;
            }

            const payload = (await response.json()) as {
                item: MasterDataOption;
            };
            const savedOption = payload.item;

            onOptionAdded?.(savedOption);
            setQuery(savedOption.name);
            onValueChange(valueForOption(savedOption));
            setJustAdded(true);
            setIsOpen(false);
            window.setTimeout(() => setJustAdded(false), 1600);
        } catch {
            setError('บันทึกไม่สำเร็จ กรุณาลองใหม่');
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((prev) =>
                Math.min(prev + 1, filteredOptions.length - 1),
            );

            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));

            return;
        }

        if (event.key === 'Enter') {
            if (isOpen && filteredOptions[highlightedIndex]) {
                event.preventDefault();
                selectOption(filteredOptions[highlightedIndex]);
            }

            return;
        }

        if (event.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                    <Input
                        id={id}
                        aria-label={ariaLabel}
                        value={query}
                        className={className}
                        placeholder={placeholder}
                        disabled={disabled}
                        autoComplete="off"
                        onChange={handleInputChange}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={handleKeyDown}
                    />
                    {isOpen && filteredOptions.length > 0 && (
                        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
                            {filteredOptions.map((option, index) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={cn(
                                        'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm',
                                        index === highlightedIndex
                                            ? 'bg-accent text-accent-foreground'
                                            : 'hover:bg-accent hover:text-accent-foreground',
                                    )}
                                    onMouseDown={(event) => {
                                        // prevent the input's blur from firing before the click registers
                                        event.preventDefault();
                                        selectOption(option);
                                    }}
                                    onMouseEnter={() =>
                                        setHighlightedIndex(index)
                                    }
                                >
                                    <span>{option.name}</span>
                                    {valueForOption(option) === value && (
                                        <Check className="size-3.5 shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    disabled={disabled || isSaving || query.trim() === ''}
                    onClick={handleAdd}
                    title="เพิ่มเป็นมาสเตอร์"
                    aria-label="เพิ่มเป็นมาสเตอร์"
                    className={cn(
                        'inline-flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors',
                        justAdded
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950'
                            : 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
                        (disabled || query.trim() === '') &&
                            'pointer-events-none opacity-50',
                    )}
                >
                    {isSaving ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : justAdded ? (
                        <Check className="size-4" />
                    ) : (
                        <Plus className="size-4" />
                    )}
                </button>
                {canManage ? (
                    <button
                        type="button"
                        onClick={() => {
                            setManageSession((session) => session + 1);
                            setIsManageOpen(true);
                        }}
                        title={`จัดการรายการ${label ? ` ${label}` : ''}`}
                        aria-label={`จัดการรายการ${label ? ` ${label}` : ''}`}
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-input bg-background text-slate-600 transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                        <Settings2 className="size-4" />
                    </button>
                ) : null}
            </div>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
            {canManage ? (
                <MasterDataManageDialog
                    key={manageSession}
                    open={isManageOpen}
                    onOpenChange={setIsManageOpen}
                    storageKey={storageKey}
                    label={label ?? placeholder ?? ''}
                    options={offeredOptions}
                    onRenamed={manage?.onRenamed}
                    onHidden={manage?.onHidden}
                />
            ) : null}
        </div>
    );
}

/**
 * Rename or hide the rows of one list. Hiding retires a row rather than
 * deleting it, so bills that used it keep its name; the same name added again
 * later brings it back.
 */
function MasterDataManageDialog({
    open,
    onOpenChange,
    storageKey,
    label,
    options,
    onRenamed,
    onHidden,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    storageKey: string;
    label: string;
    options: MasterDataOption[];
    onRenamed?: (option: MasterDataOption) => void;
    onHidden?: (option: MasterDataOption) => void;
}) {
    // Drafts start from the names as they are when the dialog mounts; the
    // combobox remounts it on every open. A rename updating `options` mid-
    // session therefore never wipes what is being typed on another row.
    const [drafts, setDrafts] = useState<Record<number, string>>(() =>
        Object.fromEntries(options.map((option) => [option.id, option.name])),
    );
    const [busyId, setBusyId] = useState<number | null>(null);
    const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

    const rename = async (option: MasterDataOption) => {
        const name = (drafts[option.id] ?? '').trim();

        if (name === '' || name === option.name || busyId !== null) {
            return;
        }

        setBusyId(option.id);
        setRowErrors((prev) => ({ ...prev, [option.id]: '' }));

        try {
            const response = await fetch(
                '/settings/data/catalog-items/rename',
                {
                    method: 'POST',
                    headers: CSRF_HEADERS(),
                    body: JSON.stringify({
                        storage_key: storageKey,
                        item_id: option.id,
                        name,
                    }),
                },
            );

            if (!response.ok) {
                setRowErrors((prev) => ({
                    ...prev,
                    [option.id]: '',
                }));
                const message = await failureMessage(
                    response,
                    'แก้ไขไม่สำเร็จ กรุณาลองใหม่',
                );
                setRowErrors((prev) => ({ ...prev, [option.id]: message }));

                return;
            }

            const payload = (await response.json()) as {
                item: MasterDataOption;
            };

            onRenamed?.(payload.item);
        } catch {
            setRowErrors((prev) => ({
                ...prev,
                [option.id]: 'แก้ไขไม่สำเร็จ กรุณาลองใหม่',
            }));
        } finally {
            setBusyId(null);
        }
    };

    const hide = async (option: MasterDataOption) => {
        if (busyId !== null) {
            return;
        }

        if (
            !window.confirm(
                `ซ่อน "${option.name}" ออกจากตัวเลือก${label ? ` ${label}` : ''}?\nบิลเก่าที่ใช้อยู่ยังแสดงชื่อนี้ตามปกติ`,
            )
        ) {
            return;
        }

        setBusyId(option.id);

        try {
            const response = await fetch('/settings/data/catalog-items/hide', {
                method: 'POST',
                headers: CSRF_HEADERS(),
                body: JSON.stringify({
                    storage_key: storageKey,
                    item_id: option.id,
                }),
            });

            if (!response.ok) {
                const message = await failureMessage(
                    response,
                    'ซ่อนไม่สำเร็จ กรุณาลองใหม่',
                );
                setRowErrors((prev) => ({ ...prev, [option.id]: message }));

                return;
            }

            const payload = (await response.json()) as {
                item: MasterDataOption;
            };

            onHidden?.(payload.item);
        } catch {
            setRowErrors((prev) => ({
                ...prev,
                [option.id]: 'ซ่อนไม่สำเร็จ กรุณาลองใหม่',
            }));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>จัดการรายการ {label}</DialogTitle>
                    <DialogDescription>
                        แก้ชื่อแล้วกดบันทึก หรือซ่อนรายการที่เลิกใช้
                        บิลเก่าที่ใช้อยู่ยังแสดงชื่อเดิม
                    </DialogDescription>
                </DialogHeader>
                {options.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500">
                        ยังไม่มีรายการ
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {options.map((option) => {
                            const draft = drafts[option.id] ?? option.name;
                            const changed = draft.trim() !== option.name;
                            const busy = busyId === option.id;

                            return (
                                <li key={option.id} className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                        <Input
                                            value={draft}
                                            aria-label={`ชื่อรายการ ${option.name}`}
                                            className="h-9 text-xs md:text-xs"
                                            onChange={(event) =>
                                                setDrafts((prev) => ({
                                                    ...prev,
                                                    [option.id]:
                                                        event.target.value,
                                                }))
                                            }
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    void rename(option);
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            disabled={
                                                !changed ||
                                                draft.trim() === '' ||
                                                busy
                                            }
                                            onClick={() => void rename(option)}
                                            aria-label={`บันทึกชื่อ ${option.name}`}
                                            title="บันทึกชื่อใหม่"
                                            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-semibold text-slate-700 hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
                                        >
                                            {busy ? (
                                                <Loader2 className="size-3.5 animate-spin" />
                                            ) : (
                                                <Check className="size-3.5" />
                                            )}
                                            บันทึก
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void hide(option)}
                                            aria-label={`ซ่อน ${option.name}`}
                                            title="ซ่อนออกจากตัวเลือก"
                                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-input bg-background text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
                                        >
                                            <Trash2 className="size-4" />
                                        </button>
                                    </div>
                                    {rowErrors[option.id] ? (
                                        <p className="text-xs text-destructive">
                                            {rowErrors[option.id]}
                                        </p>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}
