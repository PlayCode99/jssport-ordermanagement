import { useForm } from '@inertiajs/react';
import type { ChangeEvent, FormEvent } from 'react';
import { useMemo } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { useWebpCompress } from '@/hooks/useWebpCompress';
import type { Branch, Customer, SizeGroup } from '@/types/models';

type OrderItemInput = {
    item_type: string;
    size_group: SizeGroup;
    size_label: string;
    quantity: number;
    unit_price: number;
};

type CreateOrderFormData = {
    customer_id: number;
    branch_id: number;
    job_name: string;
    job_type: string;
    order_date: string;
    due_date: string;
    discount_percent: number;
    items: OrderItemInput[];
    design_artwork: File | null;
};

type CreateOrderFormProps = {
    customers: Customer[];
    branches: Branch[];
    onSuccess?: () => void;
};

function defaultItem(): OrderItemInput {
    return {
        item_type: 'shirt',
        size_group: 'adults',
        size_label: 'M',
        quantity: 1,
        unit_price: 0,
    };
}

export function CreateOrderForm({
    customers,
    branches,
    onSuccess,
}: CreateOrderFormProps) {
    const {
        compressImage,
        isCompressing,
        error: compressError,
    } = useWebpCompress();

    const { data, setData, post, processing, errors, reset } =
        useForm<CreateOrderFormData>({
            customer_id: customers[0]?.id ?? 0,
            branch_id: branches[0]?.id ?? 0,
            job_name: '',
            job_type: 'uniform',
            order_date: '',
            due_date: '',
            discount_percent: 0,
            items: [defaultItem()],
            design_artwork: null,
        });

    const submitUrl = useMemo(() => {
        const routeFn = (globalThis as { route?: (name: string) => string })
            .route;

        return routeFn ? routeFn('orders.store') : '/orders';
    }, []);

    const updateItem = <K extends keyof OrderItemInput>(
        index: number,
        field: K,
        value: OrderItemInput[K],
    ) => {
        setData(
            'items',
            data.items.map((item, itemIndex) =>
                itemIndex === index ? { ...item, [field]: value } : item,
            ),
        );
    };

    const addItem = () => {
        setData('items', [...data.items, defaultItem()]);
    };

    const removeItem = (index: number) => {
        if (data.items.length <= 1) {
            return;
        }

        setData(
            'items',
            data.items.filter((_, itemIndex) => itemIndex !== index),
        );
    };

    const handleArtworkChange = async (
        event: ChangeEvent<HTMLInputElement>,
    ) => {
        const selectedFile = event.target.files?.[0] ?? null;

        if (!selectedFile) {
            setData('design_artwork', null);

            return;
        }

        const compressedFile = await compressImage(selectedFile);
        setData('design_artwork', compressedFile);
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        post(submitUrl, {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                reset(
                    'job_name',
                    'discount_percent',
                    'items',
                    'design_artwork',
                );
                setData('items', [defaultItem()]);
                onSuccess?.();
            },
        });
    };

    const actionLabel = isCompressing
        ? 'Compressing artwork to WebP...'
        : processing
          ? 'Saving order...'
          : 'Save order';

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
            <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Customer</span>
                    <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2"
                        value={data.customer_id}
                        onChange={(event) =>
                            setData('customer_id', Number(event.target.value))
                        }
                    >
                        {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                                {customer.customer_code} -{' '}
                                {customer.customer_name}
                            </option>
                        ))}
                    </select>
                    {errors.customer_id && (
                        <p className="text-xs text-rose-600">
                            {errors.customer_id}
                        </p>
                    )}
                </label>

                <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Branch</span>
                    <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2"
                        value={data.branch_id}
                        onChange={(event) =>
                            setData('branch_id', Number(event.target.value))
                        }
                    >
                        {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                                {branch.branch_code} - {branch.branch_name}
                            </option>
                        ))}
                    </select>
                    {errors.branch_id && (
                        <p className="text-xs text-rose-600">
                            {errors.branch_id}
                        </p>
                    )}
                </label>

                <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Job Name</span>
                    <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2"
                        value={data.job_name}
                        onChange={(event) =>
                            setData('job_name', event.target.value)
                        }
                    />
                    {errors.job_name && (
                        <p className="text-xs text-rose-600">
                            {errors.job_name}
                        </p>
                    )}
                </label>

                <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Job Type</span>
                    <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2"
                        value={data.job_type}
                        onChange={(event) =>
                            setData('job_type', event.target.value)
                        }
                    />
                    {errors.job_type && (
                        <p className="text-xs text-rose-600">
                            {errors.job_type}
                        </p>
                    )}
                </label>

                <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">
                        Order Date
                    </span>
                    <input
                        type="datetime-local"
                        className="w-full rounded-md border border-slate-300 px-3 py-2"
                        value={data.order_date}
                        onChange={(event) =>
                            setData('order_date', event.target.value)
                        }
                    />
                    {errors.order_date && (
                        <p className="text-xs text-rose-600">
                            {errors.order_date}
                        </p>
                    )}
                </label>

                <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Due Date</span>
                    <input
                        type="datetime-local"
                        className="w-full rounded-md border border-slate-300 px-3 py-2"
                        value={data.due_date}
                        onChange={(event) =>
                            setData('due_date', event.target.value)
                        }
                    />
                    {errors.due_date && (
                        <p className="text-xs text-rose-600">
                            {errors.due_date}
                        </p>
                    )}
                </label>

                <label className="space-y-1 text-sm md:col-span-2">
                    <span className="font-medium text-slate-700">
                        Discount Percent
                    </span>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        className="w-full rounded-md border border-slate-300 px-3 py-2"
                        value={data.discount_percent}
                        onChange={(event) =>
                            setData(
                                'discount_percent',
                                Number(event.target.value),
                            )
                        }
                    />
                    {errors.discount_percent && (
                        <p className="text-xs text-rose-600">
                            {errors.discount_percent}
                        </p>
                    )}
                </label>
            </div>

            <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">
                        Order Items
                    </h3>
                    <button
                        type="button"
                        onClick={addItem}
                        className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                    >
                        Add Item
                    </button>
                </div>

                <div className="space-y-3">
                    {data.items.map((item, index) => (
                        <div
                            key={`${index}-${item.size_label}`}
                            className="grid gap-2 rounded-md border border-slate-100 p-3 md:grid-cols-6"
                        >
                            <input
                                className="rounded-md border border-slate-300 px-2 py-1"
                                value={item.item_type}
                                onChange={(event) =>
                                    updateItem(
                                        index,
                                        'item_type',
                                        event.target.value,
                                    )
                                }
                                placeholder="Item Type"
                            />
                            <select
                                className="rounded-md border border-slate-300 px-2 py-1"
                                value={item.size_group}
                                onChange={(event) =>
                                    updateItem(
                                        index,
                                        'size_group',
                                        event.target.value as SizeGroup,
                                    )
                                }
                            >
                                <option value="kids">kids</option>
                                <option value="adults">adults</option>
                                <option value="oversize">oversize</option>
                            </select>
                            <input
                                className="rounded-md border border-slate-300 px-2 py-1"
                                value={item.size_label}
                                onChange={(event) =>
                                    updateItem(
                                        index,
                                        'size_label',
                                        event.target.value,
                                    )
                                }
                                placeholder="Size"
                            />
                            <input
                                type="number"
                                min={1}
                                className="rounded-md border border-slate-300 px-2 py-1"
                                value={item.quantity}
                                onChange={(event) =>
                                    updateItem(
                                        index,
                                        'quantity',
                                        Number(event.target.value),
                                    )
                                }
                                placeholder="Qty"
                            />
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                className="rounded-md border border-slate-300 px-2 py-1"
                                value={item.unit_price}
                                onChange={(event) =>
                                    updateItem(
                                        index,
                                        'unit_price',
                                        Number(event.target.value),
                                    )
                                }
                                placeholder="Unit Price"
                            />
                            <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className="rounded-md border border-rose-300 px-2 py-1 text-rose-600 hover:bg-rose-50"
                            >
                                Remove
                            </button>
                            {errors[`items.${index}.item_type`] && (
                                <p className="text-xs text-rose-600">
                                    {errors[`items.${index}.item_type`]}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                    Design Artwork
                </label>
                <input
                    type="file"
                    accept="image/*,.pdf"
                    className="block w-full text-sm"
                    onChange={handleArtworkChange}
                />
                {data.design_artwork && (
                    <p className="text-xs text-slate-500">
                        Ready: {data.design_artwork.name} (
                        {Math.round(data.design_artwork.size / 1024)} KB)
                    </p>
                )}
                {compressError && (
                    <p className="text-xs text-[#E21E26]">{compressError}</p>
                )}
            </div>

            <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={processing || isCompressing}
            >
                {(processing || isCompressing) && (
                    <Spinner className="size-4" />
                )}
                {actionLabel}
            </button>
        </form>
    );
}
