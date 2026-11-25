import { describe, expect, it } from 'vitest';

import { rosterGroupLine, rosterSummary, sortRoster } from '../screenRoster';

/**
 * The name list is read at the press. It has to come off the printer in the
 * order the work is done — kids before adults, small sizes before large,
 * numbers running up — and it has to say how many of each size to pull.
 */
const person = (
    size_group: string,
    size: string,
    number: string,
    quantity = 1,
) => ({ size_group, size, number, quantity });

describe('the order the list is read in', () => {
    it('puts the kids ahead of the adults', () => {
        const sorted = sortRoster([
            person('adults', 'M', '1'),
            person('kids', 'JM', '1'),
        ]);

        expect(sorted.map((row) => row.size_group)).toEqual(['kids', 'adults']);
    });

    it('runs the sizes small to large inside a group', () => {
        const sorted = sortRoster([
            person('kids', 'JXL', '1'),
            person('kids', 'JS', '1'),
            person('kids', 'JL', '1'),
            person('kids', 'JM', '1'),
        ]);

        expect(sorted.map((row) => row.size)).toEqual([
            'JS',
            'JM',
            'JL',
            'JXL',
        ]);
    });

    it('reads a shirt number as a number, so 2 comes before 10', () => {
        const sorted = sortRoster([
            person('kids', 'JM', '10'),
            person('kids', 'JM', '2'),
            person('kids', 'JM', '1'),
        ]);

        expect(sorted.map((row) => row.number)).toEqual(['1', '2', '10']);
    });

    it('finishes the short sleeves before starting the long ones', () => {
        const sorted = sortRoster([
            {
                size_group: 'kids',
                size: 'JS',
                number: '1',
                shirt_style: 'long',
            },
            {
                size_group: 'kids',
                size: 'JXL',
                number: '9',
                shirt_style: 'short',
            },
        ]);

        // The press sets up for one length at a time, so the big short-sleeve
        // shirt still comes before the small long-sleeve one.
        expect(sorted.map((row) => row.shirt_style)).toEqual(['short', 'long']);
    });

    it('keeps the lengths inside their own group', () => {
        const sorted = sortRoster([
            {
                size_group: 'adults',
                size: 'M',
                number: '1',
                shirt_style: 'short',
            },
            {
                size_group: 'kids',
                size: 'JM',
                number: '1',
                shirt_style: 'long',
            },
        ]);

        // Group outranks length: the kids' long sleeves are still cut before
        // the adults' short ones.
        expect(sorted[0].size_group).toBe('kids');
    });

    it('sorts a shirt with no length recorded with the short ones', () => {
        const sorted = sortRoster([
            {
                size_group: 'kids',
                size: 'JM',
                number: '1',
                shirt_style: 'long',
            },
            { size_group: 'kids', size: 'JM', number: '2' },
        ]);

        expect(sorted[0].number).toBe('2');
    });

    it('applies the four rules in order: group, length, size, number', () => {
        const sorted = sortRoster([
            person('adults', 'M', '2'),
            person('kids', 'JM', '9'),
            person('adults', 'S', '7'),
            person('kids', 'JS', '4'),
            person('adults', 'M', '1'),
        ]);

        expect(
            sorted.map((row) => `${row.size_group}/${row.size}/${row.number}`),
        ).toEqual([
            'kids/JS/4',
            'kids/JM/9',
            'adults/S/7',
            'adults/M/1',
            'adults/M/2',
        ]);
    });

    it('leaves a list written before groups existed with the adults', () => {
        const sorted = sortRoster<{
            size_group?: string;
            size: string;
            number: string;
        }>([{ size: 'M', number: '1' }, person('kids', 'JM', '1')]);

        expect(sorted[0].size_group).toBe('kids');
    });

    it('does not reorder the list it was handed', () => {
        const people = [person('adults', 'M', '2'), person('kids', 'JS', '1')];
        const before = [...people];

        sortRoster(people);

        expect(people).toEqual(before);
    });
});

describe('what the sheet adds up to', () => {
    it('counts the pieces of each size, group by group', () => {
        const summary = rosterSummary([
            person('kids', 'JS', '1'),
            person('kids', 'JS', '2'),
            person('kids', 'JM', '3'),
            person('adults', 'L', '4'),
        ]);

        expect(summary.groups).toEqual([
            {
                group: 'kids',
                label: 'เด็ก',
                sizes: [
                    { size: 'JS', count: 2 },
                    { size: 'JM', count: 1 },
                ],
                total: 3,
            },
            {
                group: 'adults',
                label: 'ผู้ใหญ่',
                sizes: [{ size: 'L', count: 1 }],
                total: 1,
            },
        ]);
        expect(summary.total).toBe(4);
    });

    it('counts a person who takes more than one shirt', () => {
        const summary = rosterSummary([person('kids', 'JM', '7', 3)]);

        expect(summary.total).toBe(3);
    });

    it('still counts a person whose row carries no quantity', () => {
        // Leaving them out would send the press one shirt short.
        const summary = rosterSummary([
            { size_group: 'kids', size: 'JM', number: '7' },
        ]);

        expect(summary.total).toBe(1);
    });

    it('writes a group as the line the sheet prints', () => {
        const summary = rosterSummary([
            person('kids', 'JS', '1'),
            person('kids', 'JS', '2'),
            person('kids', 'JM', '3'),
        ]);

        expect(rosterGroupLine(summary.groups[0])).toBe(
            'เด็ก JS 2 · JM 1 (รวม 3 ตัว)',
        );
    });

    it('comes to nothing on an empty list', () => {
        expect(rosterSummary([])).toEqual({ groups: [], total: 0 });
    });
});
