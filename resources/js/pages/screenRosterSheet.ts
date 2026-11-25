import { rosterSummary, sortRoster } from './screenRoster';
import type { RosterPerson } from './screenRoster';

/**
 * The screen-name sheet, built once for both the counter and the floor.
 *
 * The customer checks their copy against the floor's at handover, so the two
 * have to be the same piece of paper: the same order, the same columns, the
 * same totals. Built in two places they drift — one gains a column, the other
 * keeps an old order — and the check stops being a check.
 *
 * Everything that differs between the two callers (how a date is written,
 * where the barcode comes from) is passed in already made, so this module
 * depends on neither page.
 */

/** One person on the list, as both pages hold them. */
export type RosterSheetPerson = RosterPerson & {
    role?: string | null;
    name?: string | null;
    pants_size?: string | null;
    pants_number?: string | null;
    pants_quantity?: number;
    pants_style?: string | null;
};

export type RosterSheetInput = {
    orderCode: string;
    jobName: string;
    customerName: string;
    customerPhone?: string | null;
    branchName: string;
    branchPhone?: string | null;
    /** Already resolved by the caller, which knows its own branch colours. */
    branchHeaderColor: string;
    /** Already formatted, e.g. '20/09/2569'. */
    dueDateLabel: string;
    postponedFromLabel?: string | null;
    keeperColor?: string | null;
    /** Already rendered SVG, or '' to fall back to the plain code. */
    barcodeMarkup: string;
    people: RosterSheetPerson[];
};

const SHIRT_STYLE_PERSON_LABELS: Record<string, string> = {
    short: 'แขนสั้น',
    long: 'แขนยาว',
    sleeveless: 'แขนกุด',
};

const PANTS_STYLE_PERSON_LABELS: Record<string, string> = {
    short: 'ขาสั้น',
    long: 'ขายาว',
};

function escapeHtml(value: string | null | undefined): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

type PersonLengthSummary = {
    mixed: boolean;
    caption: string;
    labelOf: (style: string | undefined | null) => string;
};

/**
 * How a person list wears one garment's length. A bill where everyone matches
 * needs no column of its own; a mixed one does.
 */
function summarizePersonLengths(
    styles: Array<string | undefined | null>,
    labels: Record<string, string>,
): PersonLengthSummary {
    const counts = new Map<string, number>();

    for (const style of styles) {
        if (!style || labels[style] === undefined) {
            continue;
        }

        counts.set(style, (counts.get(style) ?? 0) + 1);
    }

    const used = Object.keys(labels).filter((style) => counts.has(style));

    return {
        mixed: used.length > 1,
        caption: used
            .map(
                (style) =>
                    `${labels[style]} ${(counts.get(style) ?? 0).toLocaleString('th-TH')} คน`,
            )
            .join(' · '),
        labelOf: (style) =>
            style && labels[style] !== undefined ? labels[style] : '-',
    };
}

/**
 * Waits for the artwork to load before calling print, and gives up after a
 * few seconds so a stalled image never leaves a sheet unprintable.
 */
function buildRosterPrintScript(): string {
    return `
    (function () {
        var images = Array.prototype.slice.call(document.images);
        var pending = images.length;
        var printed = false;

        function go() {
            if (printed) { return; }
            printed = true;
            window.focus();
            window.print();
        }

        if (pending === 0) { go(); return; }

        var finish = function () { pending -= 1; if (pending <= 0) { go(); } };

        images.forEach(function (image) {
            if (image.complete) { finish(); return; }
            image.addEventListener('load', finish, { once: true });
            image.addEventListener('error', finish, { once: true });
        });

        // A stalled image must not hold the sheet hostage.
        setTimeout(go, 3000);
    })();
`;
}

/** The whole printable document, ready to write into a print window. */
export function buildScreenRosterHtml(input: RosterSheetInput): string {
    const sheet = input;
    const people = sortRoster(input.people);

    const keeperColor = (sheet.keeperColor ?? '').trim();
    const hasPants = people.some(
        (person) =>
            (person.pants_size ?? '').trim() !== '' ||
            (person.pants_number ?? '').trim() !== '',
    );
    const sleeves = summarizePersonLengths(
        people.map((person) => person.shirt_style),
        SHIRT_STYLE_PERSON_LABELS,
    );
    // Only people who ordered trousers have a leg length to count: a
    // keeper in a shirt alone is not one more pair of shorts.
    const wearsPants = (person: (typeof people)[number]): boolean =>
        person.pants_quantity !== undefined
            ? person.pants_quantity > 0
            : (person.pants_size ?? '').trim() !== '' ||
              (person.pants_number ?? '').trim() !== '';
    const legs = summarizePersonLengths(
        hasPants
            ? people.filter(wearsPants).map((person) => person.pants_style)
            : [],
        PANTS_STYLE_PERSON_LABELS,
    );
    // Only a mixed list earns a column; a whole team in one length is said
    // once in the header instead of repeated down every row.
    const showSleeveColumn = sleeves.mixed;
    const showLegColumn = legs.mixed;
    const rosterColumnCount =
        7 +
        (hasPants ? 2 : 0) +
        (showSleeveColumn ? 1 : 0) +
        (showLegColumn ? 1 : 0);
    const cell = (value: string | null | undefined): string => {
        const text = (value ?? '').trim();

        return text === '' || text === '-'
            ? '<span class="r-blank">·</span>'
            : escapeHtml(text);
    };

    const bodyRows = people
        .map((person, index) => {
            const isKeeper = person.role === 'keeper';

            return `<tr class="${isKeeper ? 'is-keeper' : ''}">
                    <td class="r-index">${index + 1}</td>
                    <td class="r-role">${isKeeper ? 'ผู้รักษาประตู' : 'ผู้เล่น'}</td>
                    <td class="r-group">${person.size_group === 'kids' ? 'เด็ก' : 'ผู้ใหญ่'}</td>
                    <td class="r-size">${cell(person.size)}</td>
                    <td class="r-name">${cell(person.name)}</td>
                    <td class="r-num">${cell(person.number)}</td>
                    ${showSleeveColumn ? `<td class="r-len${person.shirt_style === 'long' ? ' is-long' : ''}">${escapeHtml(sleeves.labelOf(person.shirt_style))}</td>` : ''}
                    ${hasPants ? `<td class="r-size">${cell(person.pants_size)}</td><td class="r-num">${cell(person.pants_number)}</td>` : ''}
                    ${showLegColumn ? `<td class="r-len${wearsPants(person) && person.pants_style === 'long' ? ' is-long' : ''}">${escapeHtml(wearsPants(person) ? legs.labelOf(person.pants_style) : '-')}</td>` : ''}
                    <td class="r-check"></td>
                </tr>`;
        })
        .join('');

    const rosterCounts = rosterSummary(people);
    /**
     * What to pull before a shirt is printed, laid out as a table rather than
     * a run of chips: one row per group, the sizes in their own column so the
     * eye runs down them, and the totals aligned on the right where a total
     * belongs. A row of pills reads as decoration; this reads as a count.
     */
    const rosterSummaryMarkup =
        rosterCounts.groups.length === 0
            ? ''
            : `<table class="r-summary">
                <tbody>
                    ${rosterCounts.groups
                        .map(
                            (group) => `<tr>
                                <th>${escapeHtml(group.label)}</th>
                                <td>${group.sizes
                                    .map(
                                        (size) =>
                                            `<span class="r-chip"><b>${escapeHtml(size.size)}</b>${size.count.toLocaleString('th-TH')}</span>`,
                                    )
                                    .join('')}</td>
                                <td class="r-sum">${group.total.toLocaleString('th-TH')} ตัว</td>
                            </tr>`,
                        )
                        .join('')}
                    <tr class="r-grand">
                        <th colspan="2">รวมทั้งสิ้น</th>
                        <td class="r-sum">${rosterCounts.total.toLocaleString('th-TH')} ตัว</td>
                    </tr>
                </tbody>
            </table>`;

    const keeperCount = people.filter(
        (person) => person.role === 'keeper',
    ).length;
    // The same masthead the work receipt prints, so the two sheets read as
    // one document family instead of two systems.
    const branchHeaderColor = sheet.branchHeaderColor;
    const barcodeMarkup = sheet.barcodeMarkup;
    const mastheadMarkup = `
            <div class="masthead">
                <div class="masthead-bar">
                    <span class="masthead-title">ใบรายชื่อสกรีน</span>
                    <span class="masthead-code">${escapeHtml(sheet.orderCode)}</span>
                </div>
                <div class="masthead-body">
                    <div class="masthead-logo"><img src="/images/logo/logo.png" alt="logo" /></div>
                    <div class="masthead-company">
                        <div class="company-title">เจ.เอส.สปอร์ต</div>
                        <div class="subtitle">กรุณาตรวจสอบรายชื่อ ไซซ์ และเบอร์ ให้ถูกต้องก่อนเซ็นรับ</div>
                    </div>
                    <div class="masthead-branch">
                        <div><span class="branch-label">สาขา</span> ${escapeHtml(sheet.branchName || '-')}</div>
                        <div class="small">โทร: ${escapeHtml(sheet.branchPhone || '-')}</div>
                        <div class="barcode-wrap">
                            ${barcodeMarkup || `<div class="barcode-fallback">${escapeHtml(sheet.orderCode)}</div>`}
                        </div>
                    </div>
                </div>
                <div class="masthead-job">
                    <div><span class="job-label">ชื่อหน่วยงาน, ชื่องาน</span> <span class="job-value">${escapeHtml(sheet.jobName || '-')}</span></div>
                    <div><span class="job-label">ลูกค้า</span> <span class="job-value">${escapeHtml(sheet.customerName || '-')}${sheet.customerPhone ? ` · โทร ${escapeHtml(sheet.customerPhone)}` : ''}</span></div>
                    <div><span class="job-label">วันที่ต้องส่ง</span> <span class="job-value is-date">${escapeHtml(sheet.dueDateLabel)}${sheet.postponedFromLabel ? ` (เลื่อนจาก ${escapeHtml(sheet.postponedFromLabel)})` : ''}</span></div>
                </div>
                <div class="masthead-roster">
                    <span>รวม <strong>${people.length.toLocaleString('th-TH')}</strong> รายชื่อ</span>
                    <span>รวม <strong>${rosterCounts.total.toLocaleString('th-TH')}</strong> ตัว</span>
                    ${keeperCount > 0 ? `<span>ผู้รักษาประตู <strong>${keeperCount.toLocaleString('th-TH')}</strong> คน</span>` : ''}
                    ${sleeves.caption !== '' ? `<span class="r-length-note">${escapeHtml(sleeves.caption)}</span>` : ''}
                    ${legs.caption !== '' ? `<span class="r-length-note">${escapeHtml(legs.caption)}</span>` : ''}
                    ${keeperColor !== '' ? `<span class="r-keeper-note">เสื้อผู้รักษาประตู: ${escapeHtml(keeperColor)}</span>` : ''}
                </div>
                ${rosterSummaryMarkup !== '' ? `<div class="masthead-counts"><span class="r-summary-title">สรุปจำนวนตามไซซ์</span>${rosterSummaryMarkup}</div>` : ''}
            </div>`;

    return `
            <html>
                <head>
                    <meta charset="utf-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <title>ใบรายชื่อ ${escapeHtml(sheet.orderCode)}</title>
                    <style>
                        @page { size: A4 portrait; margin: 10mm; }
                        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        /* Paint the ground explicitly: a print window that inherits
                           a dark scheme would otherwise render white cells dark and
                           swallow the names. */
                        body { margin: 0; background: #ffffff; font-family: "Noto Sans Thai", Arial, sans-serif; color: #0f172a; font-size: 12px; }
                        td { background: #ffffff; }
                        table { width: 100%; border-collapse: collapse; }
                        /* thead repeats on every printed page, so the bill it
                           belongs to travels with each loose sheet. */
                        thead { display: table-header-group; }
                        tr { page-break-inside: avoid; }
                        .r-caption td { border: none; padding: 0 0 5px; background: #ffffff; }
                        /* The work receipt's masthead, used as-is so the two sheets
                           read as one document instead of two systems. */
                        .masthead { border: 1px solid ${branchHeaderColor}; }
                        .masthead-bar { background: ${branchHeaderColor}; color: #ffffff; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 3px 7px; }
                        .masthead-title { font-size: 14px; font-weight: 700; letter-spacing: 0.03em; }
                        .masthead-code { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; opacity: 0.92; }
                        .masthead-body { display: grid; grid-template-columns: 38mm minmax(0, 1fr) 46mm; align-items: center; gap: 6px; padding: 3px 7px; }
                        .masthead-logo { height: 15mm; overflow: hidden; }
                        .masthead-logo img { display: block; width: 100%; height: 100%; object-fit: cover; }
                        .masthead-company { text-align: center; min-width: 0; }
                        .company-title { font-size: 15px; font-weight: 800; color: #E21E26; line-height: 1.05; }
                        .subtitle { font-size: 9px; color: #374151; margin-top: 1px; line-height: 1.15; }
                        .masthead-branch { font-size: 10px; line-height: 1.2; }
                        .masthead-branch .branch-label { color: #E21E26; font-weight: 700; }
                        /* Sized the same way as the work sheet's masthead: the
                           customer and the due date get the width their text needs
                           and the job name takes what is left, rather than fixed
                           fractions that starve one cell while another keeps half a
                           column of white. Each track can still give way when every
                           field is long, the job name first. */
                        .masthead-job { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, max-content) max-content; gap: 6px; align-items: baseline; border-top: 1px solid ${branchHeaderColor}; padding: 2px 7px 3px; }
                        .masthead-job > div { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                        .job-label { font-size: 9px; color: ${branchHeaderColor}; font-weight: 700; }
                        .job-value { font-size: 13px; color: #111827; font-weight: 800; }
                        .job-value.is-date { color: #E21E26; }
                        .barcode-wrap { margin-top: 2px; border: 1px solid #000000; padding: 1px; text-align: center; }
                        .barcode-wrap svg { display: block; width: 100%; height: 8mm; }
                        .barcode-fallback { margin-top: 2px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; }
                        .masthead-roster { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-top: 1px solid ${branchHeaderColor}; padding: 3px 7px; font-size: 11px; color: #334155; }
                        .masthead-roster strong { color: #0f172a; font-size: 13px; }
                        .r-keeper-note { border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; border-radius: 4px; padding: 0 6px; font-weight: 700; }
                        .masthead-counts { border-top: 1px solid ${branchHeaderColor}; padding: 4px 7px 5px; }
                        .masthead-counts .r-summary-title { display: block; margin-bottom: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.6px; color: ${branchHeaderColor}; text-transform: uppercase; }
                        .r-summary { width: 100%; border-collapse: collapse; font-size: 11px; color: #334155; }
                        /* The sheet styles bare th as a dark table header; the
                           summary is not that table and must say so. */
                        .r-summary th, .r-summary td { border: 0; padding: 1.5px 0; background: transparent; vertical-align: middle; }
                        .r-summary th { width: 58px; text-align: left; font-weight: 700; color: #0f172a; }
                        .r-summary td { text-align: left; }
                        .r-summary .r-sum { width: 76px; text-align: right; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
                        .r-chip { display: inline-block; margin-right: 4px; border: 1px solid #cbd5e1; border-radius: 3px; padding: 0 5px; background: #ffffff; font-variant-numeric: tabular-nums; }
                        .r-chip b { margin-right: 4px; color: #0f172a; }
                        .r-grand th, .r-grand td { border-top: 1px solid #cbd5e1; padding-top: 3px; }
                        .r-grand th { color: ${branchHeaderColor}; text-align: right; padding-right: 6px; }
                        .r-grand .r-sum { font-size: 13px; }
                        th, td { border: 0.3mm solid #94a3b8; padding: 4px 6px; }
                        th { background: #1e3a8a; color: #ffffff; font-weight: 700; }
                        tbody tr:nth-child(even) td { background: #f8fafc; }
                        tbody tr.is-keeper td { background: #fffbeb; }
                        tbody tr.is-keeper .r-role { font-weight: 700; color: #92400e; }
                        .r-index { width: 8%; text-align: center; color: #64748b; }
                        .r-role { width: 14%; }
                        .r-group { width: 10%; text-align: center; }
                        .r-size { width: 10%; text-align: center; font-weight: 700; }
                        .r-name { width: 26%; }
                        .r-num { width: 10%; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
                        .r-check { width: 9%; }
                        /* nowrap so a length never breaks across two lines: the
                           table lays out automatically, so the column takes the
                           width it needs and the name column gives it up. */
                        .r-len { width: 11%; text-align: center; white-space: nowrap; }
                        /* Long is the exception on most bills, so it is the one
                           that gets picked out of the column. */
                        .r-len.is-long { font-weight: 700; color: #3730a3; }
                        .r-length-note { border: 1px solid #c7d2fe; background: #eef2ff; color: #3730a3; border-radius: 4px; padding: 0 6px; font-weight: 700; }
                        .r-blank { color: #cbd5e1; }
                        .r-foot { margin-top: 8mm; display: flex; justify-content: space-between; gap: 10mm; }
                        .r-sign { flex: 1; }
                        .r-line { margin-top: 14mm; border-bottom: 0.3mm dotted #334155; }
                        .r-sign-label { margin-top: 2px; text-align: center; color: #475569; }
                    </style>
                </head>
                <body>
                    <table>
                        <thead>
                            <tr class="r-caption">
                                <td colspan="${rosterColumnCount}">${mastheadMarkup}</td>
                            </tr>
                            <tr>
                                <th>ลำดับ</th>
                                <th>ประเภท</th>
                                <th>เด็ก/ผู้ใหญ่</th>
                                <th>ไซซ์เสื้อ</th>
                                <th>ชื่อสกรีน</th>
                                <th>เบอร์เสื้อ</th>
                                ${showSleeveColumn ? '<th>แขน</th>' : ''}
                                ${hasPants ? '<th>ไซซ์กางเกง</th><th>เบอร์กางเกง</th>' : ''}
                                ${showLegColumn ? '<th>ขา</th>' : ''}
                                <th>ตรวจ</th>
                            </tr>
                        </thead>
                        <tbody>${bodyRows}</tbody>
                    </table>

                    <div class="r-foot">
                        <div class="r-sign">
                            <div class="r-line"></div>
                            <div class="r-sign-label">ผู้ตรวจสอบรายชื่อ (ลูกค้า)</div>
                        </div>
                        <div class="r-sign">
                            <div class="r-line"></div>
                            <div class="r-sign-label">วันที่</div>
                        </div>
                    </div>
                    <script>${buildRosterPrintScript()}<\u002Fscript>
                </body>
            </html>
        `;
}
