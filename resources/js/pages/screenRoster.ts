import { sizeRank } from './counterGarmentSheets';

/**
 * The order a name list is read in, and what it adds up to.
 *
 * One module for both sheets. The counter prints the customer's copy and the
 * floor prints its own, and a screen printer holding one while the counter
 * reads the other has to see the same people in the same order — so the rule
 * lives here rather than once on each side.
 *
 * The order is the order the work is done in: the kids' shirts before the
 * adults', short sleeves before long, smallest size first, and within a size
 * the numbers run up. A list shuffled into the order people happened to be
 * typed in is one the printer has to re-sort by hand at the press.
 */

/** Only the fields the order and the summary need; each sheet carries more. */
export type RosterPerson = {
    size_group?: string | null;
    /** 'short' | 'long' | 'sleeveless'; a bill saved before lengths has none. */
    shirt_style?: string | null;
    size?: string | null;
    number?: string | null;
    quantity?: number | null;
};

const GROUP_RANK: Record<string, number> = { kids: 0, adults: 1 };

export const GROUP_LABELS: Record<string, string> = {
    kids: 'เด็ก',
    adults: 'ผู้ใหญ่',
};

function groupKey(person: RosterPerson): string {
    const group = (person.size_group ?? '').trim().toLowerCase();

    // A list written before sizes were split by group reads as adults', which
    // is what those bills were sold as.
    return group === 'kids' ? 'kids' : 'adults';
}

function groupRank(person: RosterPerson): number {
    return GROUP_RANK[groupKey(person)] ?? 1;
}

/**
 * Short sleeves before long, inside each group.
 *
 * The press sets up for one sleeve length at a time, so a list that alternates
 * between them makes the floor change setup person by person. A shirt with no
 * length recorded sorts with the short ones, which is what those bills were
 * cut as.
 */
const LENGTH_RANK: Record<string, number> = {
    short: 0,
    sleeveless: 1,
    long: 2,
};

function lengthRank(person: RosterPerson): number {
    const style = (person.shirt_style ?? '').trim().toLowerCase();

    return LENGTH_RANK[style] ?? 0;
}

function sizeKey(person: RosterPerson): string {
    const size = (person.size ?? '').trim();

    return size === '' || size === '-' ? '-' : size.toUpperCase();
}

/**
 * Shirt numbers are worn as numbers, so 2 comes before 10. A number with
 * anything else in it keeps its place by text, after the plain numbers.
 */
function numberRank(person: RosterPerson): [number, string] {
    const text = (person.number ?? '').trim();
    const asNumber = Number(text);

    return Number.isFinite(asNumber) && text !== ''
        ? [asNumber, '']
        : [Number.MAX_SAFE_INTEGER, text];
}

/** Kids first, then short sleeves, then size small to large, then number. */
export function sortRoster<T extends RosterPerson>(people: readonly T[]): T[] {
    return [...people].sort((left, right) => {
        const byGroup = groupRank(left) - groupRank(right);

        if (byGroup !== 0) {
            return byGroup;
        }

        const byLength = lengthRank(left) - lengthRank(right);

        if (byLength !== 0) {
            return byLength;
        }

        const bySize = sizeRank(sizeKey(left)) - sizeRank(sizeKey(right));

        if (bySize !== 0) {
            return bySize;
        }

        const [leftNumber, leftText] = numberRank(left);
        const [rightNumber, rightText] = numberRank(right);

        return leftNumber - rightNumber || leftText.localeCompare(rightText);
    });
}

export type RosterSizeCount = { size: string; count: number };

export type RosterGroupCount = {
    group: string;
    /** 'เด็ก' / 'ผู้ใหญ่'. */
    label: string;
    sizes: RosterSizeCount[];
    total: number;
};

export type RosterSummary = {
    groups: RosterGroupCount[];
    total: number;
};

/**
 * The pieces behind the names: how many of each size each group takes, and
 * what the sheet comes to.
 *
 * Counted in shirts rather than rows, because that is what is cut and
 * printed. A row that names a person but carries no quantity is still one
 * shirt — the bill has a person on it, and leaving them out of the count
 * would send the press one short.
 */
export function rosterSummary(people: readonly RosterPerson[]): RosterSummary {
    const groups = new Map<string, Map<string, number>>();
    let total = 0;

    for (const person of sortRoster(people)) {
        const quantity = Math.max(Number(person.quantity ?? 0) || 0, 1);
        const key = groupKey(person);
        const sizes = groups.get(key) ?? new Map<string, number>();
        const size = sizeKey(person);

        sizes.set(size, (sizes.get(size) ?? 0) + quantity);
        groups.set(key, sizes);
        total += quantity;
    }

    return {
        groups: [...groups.entries()].map(([group, sizes]) => ({
            group,
            label: GROUP_LABELS[group] ?? group,
            sizes: [...sizes.entries()]
                .map(([size, count]) => ({ size, count }))
                .sort(
                    (left, right) => sizeRank(left.size) - sizeRank(right.size),
                ),
            total: [...sizes.values()].reduce((sum, count) => sum + count, 0),
        })),
        total,
    };
}

/** "เด็ก JS 3 · JM 5 (รวม 8 ตัว)", the way the summary line reads on paper. */
export function rosterGroupLine(group: RosterGroupCount): string {
    const sizes = group.sizes
        .map((size) => `${size.size} ${size.count.toLocaleString('th-TH')}`)
        .join(' · ');

    return `${group.label} ${sizes} (รวม ${group.total.toLocaleString('th-TH')} ตัว)`;
}
