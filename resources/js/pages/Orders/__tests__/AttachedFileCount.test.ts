import { describe, expect, it } from 'vitest';

import { countAttachedFiles } from '../Create';

/**
 * PHP keeps only `max_file_uploads` files per request — twenty by default —
 * and throws the rest away at startup without raising anything the application
 * can catch. A bill with more artwork than that would have been saved looking
 * complete while some of its images had quietly gone missing.
 *
 * So the form counts what it attached and sends the number along, and the
 * server refuses a bill that arrived with fewer. The count has to find every
 * file the payload carries, wherever it sits: loose, in a list, or under a
 * production sheet's key.
 */
describe('countAttachedFiles', () => {
    const file = (name: string) =>
        new File([new Uint8Array(4)], name, { type: 'image/png' });

    it('counts nothing in a payload that carries no artwork', () => {
        expect(
            countAttachedFiles({
                customer_name: 'โรงเรียนทดสอบ',
                items: '[{"quantity":2}]',
                specification: { pattern_id: 11, fabric_id: 22 },
            }),
        ).toBe(0);
    });

    it('counts a file sitting on its own', () => {
        expect(countAttachedFiles({ design_artwork: file('art.png') })).toBe(1);
    });

    it('counts every file of a list', () => {
        expect(
            countAttachedFiles({
                shirt_artwork: [file('a.png'), file('b.png'), file('c.png')],
            }),
        ).toBe(3);
    });

    /**
     * Forms 1 and 4 pin artwork to one production sheet, so the files sit two
     * levels down, under the sheet's own key.
     */
    it('counts files pinned to a production sheet', () => {
        expect(
            countAttachedFiles({
                shirt_artwork_scoped: {
                    shirt_kids_short: [file('a.png')],
                    shirt_adults_long: [file('b.png'), file('c.png')],
                },
                pants_artwork_scoped: {
                    pants_adults_long: [file('d.png')],
                },
            }),
        ).toBe(4);
    });

    it('counts a whole bill, loose files and pinned ones together', () => {
        expect(
            countAttachedFiles({
                job_name: 'งานทดสอบ',
                design_artwork: file('design.png'),
                shirt_artwork: [file('a.png'), file('b.png')],
                shirt_artwork_scoped: {
                    shirt_kids_short: [file('c.png')],
                },
                sports_day_artwork: {
                    0: [file('d.png'), file('e.png')],
                },
                removed_media_ids: [12, 13],
                artwork_scopes: { 7: 'shirt_kids_short' },
            }),
        ).toBe(6);
    });

    /**
     * A bill whose artwork is already on file carries display URLs, not files.
     * Counting those would raise a false alarm on a bill that attached nothing.
     */
    it('does not count artwork that is already saved', () => {
        expect(
            countAttachedFiles({
                shirt_artwork: [],
                existing_shirt_artwork: [
                    { id: 4, url: '/storage/a.png' },
                    { id: 5, url: '/storage/b.png' },
                ],
            }),
        ).toBe(0);
    });
});
