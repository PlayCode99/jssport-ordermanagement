import { describe, expect, it } from 'vitest';

import {
    resolveArtworkBatches,
    resolveIndividualArtworkBatches,
    resolveSportsDayArtworkBatches,
} from '@/pages/Orders/Create';

/**
 * A bill is split into production batches — garment, size group and length —
 * and one sheet is printed per batch. Artwork is pinned to those batches, so
 * the list has to be exactly what the bill will produce: no batch the bill
 * does not have, and none of them missing.
 */
const row = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    size_label: 'M',
    style: 'short' as const,
    quantity: 10,
    unit_price: 100,
    ...over,
});

const table = (over: Record<string, unknown> = {}) => ({
    id: 't-adults',
    table_type: 'adults' as const,
    title: 'ตารางไซส์ผู้ใหญ่',
    artwork_files: [],
    saved_artwork: [],
    shirt_rows: [],
    pants_rows: [],
    rows: [],
    ...over,
});

const batchesOf = (tables: ReturnType<typeof table>[]) =>
    resolveArtworkBatches(tables as never);

describe('the batches a bill will be split into', () => {
    it('lists nothing for a bill with no quantities yet', () => {
        expect(
            batchesOf([table({ shirt_rows: [row({ quantity: 0 })] })]),
        ).toEqual([]);
    });

    it('gives one batch per garment, size group and length', () => {
        const batches = batchesOf([
            table({
                id: 't-kids',
                table_type: 'kids',
                shirt_rows: [row({ quantity: 35 })],
            }),
            table({
                shirt_rows: [
                    row({ quantity: 40 }),
                    row({ id: 'r2', style: 'long', quantity: 20 }),
                ],
                pants_rows: [row({ id: 'p1', quantity: 60 })],
            }),
        ]);

        expect(batches).toEqual([
            {
                key: 'shirt_kids_short',
                garment: 'shirt',
                label: 'เสื้อไซต์เด็ก แขนสั้น',
                quantity: 35,
            },
            {
                key: 'shirt_adults_short',
                garment: 'shirt',
                label: 'เสื้อไซต์ผู้ใหญ่ แขนสั้น',
                quantity: 40,
            },
            {
                key: 'shirt_adults_long',
                garment: 'shirt',
                label: 'เสื้อไซต์ผู้ใหญ่ แขนยาว',
                quantity: 20,
            },
            {
                key: 'pants_adults_short',
                garment: 'pants',
                label: 'กางเกงผู้ใหญ่ ขาสั้น',
                quantity: 60,
            },
        ]);
    });

    it('adds up the rows that land in the same batch', () => {
        // Two sizes, same garment, same length: one sheet, sixty pieces.
        const batches = batchesOf([
            table({
                shirt_rows: [
                    row({ quantity: 25 }),
                    row({ id: 'r2', size_label: 'L', quantity: 35 }),
                ],
            }),
        ]);

        expect(batches).toHaveLength(1);
        expect(batches[0].quantity).toBe(60);
    });

    it('leaves out rows nobody filled in', () => {
        const batches = batchesOf([
            table({
                shirt_rows: [
                    row({ quantity: 10 }),
                    row({ id: 'r2', style: 'long', quantity: 0 }),
                ],
            }),
        ]);

        expect(batches.map((batch) => batch.key)).toEqual([
            'shirt_adults_short',
        ]);
    });

    it('names batches the way the production sheets do', () => {
        const batches = batchesOf([
            table({ pants_rows: [row({ style: 'long', quantity: 5 })] }),
            table({
                id: 't-kids',
                table_type: 'kids',
                pants_rows: [row({ id: 'p2', quantity: 5 })],
            }),
        ]);

        expect(batches.map((batch) => batch.label)).toEqual([
            'กางเกงเด็ก ขาสั้น',
            'กางเกงผู้ใหญ่ ขายาว',
        ]);
    });
});

/**
 * Form 2 sells to a list of people and Form 3 to a set of colour houses, but
 * both end up on the same production board as Form 1. Their batches have to
 * name the very sheets the board will print, or artwork gets pinned to a sheet
 * that never exists.
 */
const person = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    role: 'player' as const,
    name: 'สมชาย',
    size_group: 'adults' as const,
    size: 'L',
    shirt_style: 'short' as const,
    number: '9',
    quantity: 1,
    unit_price: 250,
    pants_size: 'L',
    pants_style: 'short' as const,
    pants_number: '9',
    pants_quantity: 0,
    pants_unit_price: 0,
    ...over,
});

const house = (over: Record<string, unknown> = {}) => ({
    id: 'h1',
    team_name: 'คณะสีแดง',
    fabric_color_id: '',
    saved_artwork: [],
    rows: [],
    ...over,
});

const houseRow = (over: Record<string, unknown> = {}) => ({
    id: 'hr1',
    size_group: 'adults' as const,
    size_label: 'L',
    shirt_qty: 10,
    shirt_price: 200,
    pants_qty: 0,
    pants_price: 0,
    ...over,
});

describe('the batches a รายตัว bill will be split into', () => {
    it('splits the same people by sleeve length', () => {
        const batches = resolveIndividualArtworkBatches(
            [
                person({ id: 'p1', shirt_style: 'short' }),
                person({ id: 'p2', shirt_style: 'long' }),
                person({ id: 'p3', shirt_style: 'long' }),
            ] as never,
            false,
        );

        expect(batches.map((batch) => [batch.key, batch.quantity])).toEqual([
            ['shirt_adults_short', 1],
            ['shirt_adults_long', 2],
        ]);
    });

    it('keeps a keeper on their own sheet when their shirt is cut differently', () => {
        const batches = resolveIndividualArtworkBatches(
            [
                person({ id: 'p1', size_group: 'kids', shirt_style: 'short' }),
                person({
                    id: 'p2',
                    role: 'keeper',
                    size_group: 'kids',
                    shirt_style: 'long',
                }),
            ] as never,
            false,
        );

        expect(batches.map((batch) => batch.key)).toEqual([
            'shirt_kids_short',
            'shirt_kids_long',
        ]);
    });

    it('asks for trouser artwork only when the bill sells trousers', () => {
        const people = [
            person({ pants_quantity: 1, pants_unit_price: 150 }),
        ] as never;

        expect(
            resolveIndividualArtworkBatches(people, false).map((b) => b.key),
        ).toEqual(['shirt_adults_short']);
        expect(
            resolveIndividualArtworkBatches(people, true).map((b) => b.key),
        ).toEqual(['shirt_adults_short', 'pants_adults_short']);
    });

    it('leaves out people nobody filled in', () => {
        expect(
            resolveIndividualArtworkBatches(
                [
                    person({
                        id: 'blank',
                        name: '',
                        size: '',
                        number: '',
                        pants_size: '',
                        pants_number: '',
                        quantity: 0,
                        unit_price: 0,
                    }),
                ] as never,
                false,
            ),
        ).toEqual([]);
    });
});

describe('the batches a กีฬาสี bill will be split into', () => {
    it('gives each house its own sheet per garment and size group', () => {
        const batches = resolveSportsDayArtworkBatches([
            house({
                rows: [
                    houseRow({ shirt_qty: 10, pants_qty: 4 }),
                    houseRow({
                        id: 'hr2',
                        size_group: 'kids',
                        shirt_qty: 6,
                        pants_qty: 0,
                    }),
                ],
            }),
            house({
                id: 'h2',
                team_name: 'คณะสีน้ำเงิน',
                rows: [houseRow({ id: 'hr3', shirt_qty: 8 })],
            }),
        ] as never);

        expect(batches.map((batch) => [batch.key, batch.quantity])).toEqual([
            ['sports_day_0_shirt_kids', 6],
            ['sports_day_0_shirt_adults', 10],
            ['sports_day_0_pants_adults', 4],
            ['sports_day_1_shirt_adults', 8],
        ]);
    });

    it('names a house by the name on the bill, and by its place when it has none', () => {
        const batches = resolveSportsDayArtworkBatches([
            house({ team_name: '  ', rows: [houseRow()] }),
        ] as never);

        expect(batches[0].label).toBe('คณะที่ 1 · เสื้อไซต์ผู้ใหญ่');
    });

    it('keys a house by its position, so renaming it keeps its artwork', () => {
        const before = resolveSportsDayArtworkBatches([
            house({ team_name: 'แดง', rows: [houseRow()] }),
        ] as never);
        const after = resolveSportsDayArtworkBatches([
            house({ team_name: 'สีแดงเข้ม', rows: [houseRow()] }),
        ] as never);

        expect(after[0].key).toBe(before[0].key);
    });
});
