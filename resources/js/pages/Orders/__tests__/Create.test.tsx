import { describe, expect, it } from 'vitest';

import {
    buildEditInitialFormData,
    numberFieldValue,
} from '@/pages/Orders/Create';

describe('buildEditInitialFormData', () => {
    it('defaults a new order to the signed-in user branch instead of the first listed branch', () => {
        const result = buildEditInitialFormData(null, {
            resolvedBranches: [
                { id: 1, name: 'Branch 01', code: '01', phone: null },
                { id: 2, name: 'Branch 02', code: '02', phone: null },
            ],
            defaultBranchId: 2,
            resolvedJobTypes: [{ id: 1, name: 'uniform' }],
            resolvedShirtTypes: [{ id: 1, name: 'Shirt' }],
            resolvedPantsTypes: [{ id: 1, name: 'Pants' }],
            resolvedKidsSizes: ['S'],
            resolvedAdultSizes: ['M'],
        });

        expect(result.branch_id).toBe('2');
    });

    it('defaults a new order billing_time to the current wall-clock time', () => {
        const result = buildEditInitialFormData(null, {
            resolvedBranches: [
                { id: 1, name: 'Branch 01', code: '01', phone: null },
            ],
            defaultBranchId: 1,
            resolvedJobTypes: [{ id: 1, name: 'uniform' }],
            resolvedShirtTypes: [{ id: 1, name: 'Shirt' }],
            resolvedPantsTypes: [{ id: 1, name: 'Pants' }],
            resolvedKidsSizes: ['S'],
            resolvedAdultSizes: ['M'],
        });

        expect(result.billing_time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('carries over the saved billing_time when editing an existing order', () => {
        const result = buildEditInitialFormData(
            {
                customer_id: 1,
                branch_id: 2,
                customer_name: 'Customer A',
                customer_phone: '0812345678',
                contact_detail: 'Line',
                job_name: 'Order A',
                job_type: 'uniform',
                billing_date: '2026-08-01',
                billing_time: '13:45',
                due_date: '2026-08-05',
                delivery_method: 'shipping',
                shipping_address: 'Bangkok',
                discount_percent: 10,
                deposit_amount: 300,
                payment_method: 'cash',
                artwork_url: null,
                shirt_artwork_urls: [],
                pants_artwork_urls: [],
                reference_designs: [],
                items: [],
                specification: {
                    pattern_id: 1,
                    fabric_id: 2,
                    neck_style_id: 3,
                    screen_print_detail: JSON.stringify({
                        shirt_specs: {
                            pattern_id: '1',
                            fabric_id: '2',
                            neck_style_id: '3',
                            screen_text: 'Hello',
                        },
                        pants_specs: {},
                        personalization_rows: [],
                    }),
                },
            },
            {
                resolvedBranches: [
                    { id: 2, name: 'Branch 2', code: '02', phone: null },
                ],
                resolvedJobTypes: [{ id: 1, name: 'uniform' }],
                resolvedShirtTypes: [{ id: 1, name: 'Shirt' }],
                resolvedPantsTypes: [{ id: 1, name: 'Pants' }],
                resolvedKidsSizes: ['S', 'M'],
                resolvedAdultSizes: ['S', 'M', 'L'],
            },
        );

        expect(result.billing_time).toBe('13:45');
    });

    it('falls back to the current wall-clock time when an existing order has no saved billing_time', () => {
        const result = buildEditInitialFormData(
            {
                customer_id: 1,
                branch_id: 2,
                customer_name: 'Customer A',
                customer_phone: '0812345678',
                contact_detail: 'Line',
                job_name: 'Order A',
                job_type: 'uniform',
                billing_date: '2026-08-01',
                due_date: '2026-08-05',
                delivery_method: 'shipping',
                shipping_address: 'Bangkok',
                discount_percent: 10,
                deposit_amount: 300,
                payment_method: 'cash',
                artwork_url: null,
                shirt_artwork_urls: [],
                pants_artwork_urls: [],
                reference_designs: [],
                items: [],
                specification: {
                    pattern_id: 1,
                    fabric_id: 2,
                    neck_style_id: 3,
                    screen_print_detail: JSON.stringify({
                        shirt_specs: {
                            pattern_id: '1',
                            fabric_id: '2',
                            neck_style_id: '3',
                            screen_text: 'Hello',
                        },
                        pants_specs: {},
                        personalization_rows: [],
                    }),
                },
            },
            {
                resolvedBranches: [
                    { id: 2, name: 'Branch 2', code: '02', phone: null },
                ],
                resolvedJobTypes: [{ id: 1, name: 'uniform' }],
                resolvedShirtTypes: [{ id: 1, name: 'Shirt' }],
                resolvedPantsTypes: [{ id: 1, name: 'Pants' }],
                resolvedKidsSizes: ['S', 'M'],
                resolvedAdultSizes: ['S', 'M', 'L'],
            },
        );

        expect(result.billing_time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('reconstructs the saved groups to their own size tables and keeps artwork previews', () => {
        const result = buildEditInitialFormData(
            {
                customer_id: 1,
                branch_id: 2,
                customer_name: 'Customer A',
                customer_phone: '0812345678',
                contact_detail: 'Line',
                job_name: 'Order A',
                job_type: 'uniform',
                billing_date: '2026-08-01',
                due_date: '2026-08-05',
                delivery_method: 'shipping',
                shipping_address: 'Bangkok',
                discount_percent: 10,
                deposit_amount: 300,
                payment_method: 'cash',
                artwork_url: 'https://cdn.example.com/general.png',
                shirt_artwork_urls: ['https://cdn.example.com/shirt.png'],
                pants_artwork_urls: ['https://cdn.example.com/pants.png'],
                reference_designs: ['https://cdn.example.com/ref-1.png'],
                items: [
                    {
                        item_type: 'garment',
                        size_group: 'kids',
                        size_label: 'S',
                        quantity: 2,
                        unit_price: 200,
                        total_price: 400,
                    },
                    {
                        item_type: 'garment',
                        size_group: 'adults',
                        size_label: 'M',
                        quantity: 3,
                        unit_price: 250,
                        total_price: 750,
                    },
                    {
                        item_type: 'garment',
                        size_group: 'adults',
                        size_label: 'L',
                        quantity: 2,
                        unit_price: 250,
                        total_price: 500,
                    },
                ],
                specification: {
                    pattern_id: 1,
                    fabric_id: 2,
                    neck_style_id: 3,
                    screen_print_detail: JSON.stringify({
                        shirt_specs: {
                            pattern_id: '1',
                            fabric_id: '2',
                            neck_style_id: '3',
                            screen_text: 'Hello',
                        },
                        pants_specs: {},
                        personalization_rows: [],
                    }),
                },
            },
            {
                resolvedBranches: [
                    { id: 2, name: 'Branch 2', code: '02', phone: null },
                ],
                resolvedJobTypes: [{ id: 1, name: 'uniform' }],
                resolvedShirtTypes: [{ id: 1, name: 'Shirt' }],
                resolvedPantsTypes: [{ id: 1, name: 'Pants' }],
                resolvedKidsSizes: ['S', 'M'],
                resolvedAdultSizes: ['S', 'M', 'L'],
            },
        );

        expect(result.size_tables).toHaveLength(2);
        const adultsTable = result.size_tables.find(
            (table) => table.table_type === 'adults',
        );
        const kidsTable = result.size_tables.find(
            (table) => table.table_type === 'kids',
        );

        expect(
            kidsTable?.rows.map((row) => ({
                size_label: row.size_label,
                set_shirt_qty: row.set_shirt_qty,
                set_pants_qty: row.set_pants_qty,
            })),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    size_label: 'S',
                    set_shirt_qty: 2,
                    set_pants_qty: 2,
                }),
            ]),
        );
        expect(
            adultsTable?.rows.map((row) => ({
                size_label: row.size_label,
                set_shirt_qty: row.set_shirt_qty,
                set_pants_qty: row.set_pants_qty,
            })),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    size_label: 'M',
                    set_shirt_qty: 3,
                    set_pants_qty: 3,
                }),
                expect.objectContaining({
                    size_label: 'L',
                    set_shirt_qty: 2,
                    set_pants_qty: 2,
                }),
            ]),
        );
    });

    it('does not create placeholder size tables when the saved order has no size rows', () => {
        const result = buildEditInitialFormData(
            {
                customer_id: 1,
                branch_id: 2,
                customer_name: 'Customer A',
                customer_phone: '0812345678',
                contact_detail: 'Line',
                job_name: 'Order A',
                job_type: 'uniform',
                billing_date: '2026-08-01',
                due_date: '2026-08-05',
                delivery_method: 'shipping',
                shipping_address: 'Bangkok',
                discount_percent: 10,
                deposit_amount: 300,
                payment_method: 'cash',
                artwork_url: null,
                shirt_artwork_urls: [],
                pants_artwork_urls: [],
                reference_designs: [],
                items: [],
                specification: {
                    pattern_id: 1,
                    fabric_id: 2,
                    neck_style_id: 3,
                    screen_print_detail: JSON.stringify({
                        shirt_specs: {
                            pattern_id: '1',
                            fabric_id: '2',
                            neck_style_id: '3',
                            screen_text: 'Hello',
                        },
                        pants_specs: {},
                        personalization_rows: [],
                    }),
                },
            },
            {
                resolvedBranches: [
                    { id: 2, name: 'Branch 2', code: '02', phone: null },
                ],
                resolvedJobTypes: [{ id: 1, name: 'uniform' }],
                resolvedShirtTypes: [{ id: 1, name: 'Shirt' }],
                resolvedPantsTypes: [{ id: 1, name: 'Pants' }],
                resolvedKidsSizes: ['S', 'M'],
                resolvedAdultSizes: ['S', 'M', 'L'],
            },
        );

        expect(result.size_tables).toEqual([]);
    });
});

describe('numberFieldValue', () => {
    it('shows an empty box for zero so typing does not leave a leading zero', () => {
        expect(numberFieldValue(0)).toBe('');
    });

    it('shows real values unchanged', () => {
        expect(numberFieldValue(5)).toBe(5);
        expect(numberFieldValue(300.5)).toBe(300.5);
    });
});
