import { Check, Loader2, Plus } from 'lucide-react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type MasterDataOption = {
    id: number;
    name: string;
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
}: MasterDataComboBoxProps) {
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
            return options;
        }

        return options.filter((option) =>
            option.name.toLowerCase().includes(needle),
        );
    }, [options, query]);

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
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN':
                            document
                                .querySelector('meta[name="csrf-token"]')
                                ?.getAttribute('content') ?? '',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({ storage_key: storageKey, name }),
                },
            );

            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as {
                    message?: string;
                } | null;
                setError(payload?.message ?? 'บันทึกไม่สำเร็จ กรุณาลองใหม่');

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
            </div>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
    );
}
