import { buildGarmentSheets } from './counterGarmentSheets';
import type { CounterSheetItem } from './counterGarmentSheets';

/**
 * The delivery note read as a list of goods.
 *
 * The note used to carry one line — the job's name, the total pieces and the
 * bill's net — which told a customer signing for forty shirts nothing about
 * what was in the bag. These are the rows that replace it: one per size, said
 * the way the floor and the counter both name it.
 */
export type DeliveryNoteRow = {
    /** The sheet this size belongs to, e.g. "เสื้อเด็ก · แขนสั้น". */
    type: string;
    size: string;
    quantity: number;
    unitPrice: number;
    total: number;
};

/**
 * Built with the same function the counter's own screens and the printed
 * work sheet use, so the goods on the delivery note cannot drift from the
 * goods everywhere else on the bill.
 */
export function deliveryNoteRows(
    items: readonly CounterSheetItem[],
): DeliveryNoteRow[] {
    return buildGarmentSheets([...items], undefined, [], []).flatMap((sheet) =>
        sheet.lines.map((line) => ({
            type: sheet.title,
            size: line.sizeLabel,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.total,
        })),
    );
}

/** A "คิดเงินเพิ่มเติม" line as the delivery note shows it. */
export type DeliveryNoteCharge = { label: string; amount: number };

const THAI_DIGITS = [
    'ศูนย์',
    'หนึ่ง',
    'สอง',
    'สาม',
    'สี่',
    'ห้า',
    'หก',
    'เจ็ด',
    'แปด',
    'เก้า',
];

const THAI_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function readThaiInteger(value: number): string {
    if (value === 0) {
        return 'ศูนย์';
    }

    if (value >= 1_000_000) {
        const millions = Math.floor(value / 1_000_000);
        const rest = value % 1_000_000;

        return (
            readThaiInteger(millions) +
            'ล้าน' +
            (rest > 0 ? readThaiInteger(rest) : '')
        );
    }

    const digits = String(value);
    let text = '';

    for (let index = 0; index < digits.length; index += 1) {
        const digit = Number(digits[index]);
        const place = digits.length - index - 1;

        if (digit === 0) {
            continue;
        }

        if (place === 1 && digit === 1) {
            text += 'สิบ';
        } else if (place === 1 && digit === 2) {
            text += 'ยี่สิบ';
        } else if (place === 0 && digit === 1 && digits.length > 1) {
            text += 'เอ็ด';
        } else {
            text += THAI_DIGITS[digit] + THAI_PLACES[place];
        }
    }

    return text;
}

/**
 * The amount written out in Thai, the way every delivery note and receipt in
 * the country writes it. It is the line that stops a figure being altered
 * after it is signed, which is the whole reason a note carries one.
 */
export function bahtText(amount: number): string {
    const inSatang = Math.round(Math.max(amount, 0) * 100);
    const baht = Math.floor(inSatang / 100);
    const satang = inSatang % 100;

    return satang === 0
        ? `${readThaiInteger(baht)}บาทถ้วน`
        : `${readThaiInteger(baht)}บาท${readThaiInteger(satang)}สตางค์`;
}

/**
 * The money the note has to account for, top to bottom.
 *
 * Every step is shown because the note is signed: goods, the charges that
 * are not goods, the discount the bill was written with, and then the note's
 * own. A delivery note whose total is 850 more than the goods on it, with
 * nothing naming the 850, is one the counter has to explain from memory at
 * the customer's door.
 */
export type DeliveryNoteTotals = {
    /** The goods and the extra charges together: what the bill is worth before any discount. */
    gross: number;
    billDiscountPercent: number;
    billDiscountAmount: number;
    /** What the bill came to, after the discount the work receipt was written with. */
    billNet: number;
    discountPercent: number;
    discountAmount: number;
    /** What the customer signs for. */
    payable: number;
};

/**
 * The delivery note's own arithmetic.
 *
 * The percent comes off the bill's net — what the bill already came to — and
 * stops there. Nothing here is written back to the bill: its total, its own
 * discount, what has been paid and what is owed stay as the work receipt
 * wrote them. That separation is the whole point of the figure.
 */
export function deliveryNoteTotals(
    bill: {
        /** order.pricing.total_amount — goods and extra charges together. */
        gross: number;
        billDiscountPercent: number;
        billDiscountAmount: number;
        billNet: number;
    },
    discountPercent: number,
): DeliveryNoteTotals {
    const percent = Math.min(Math.max(discountPercent, 0), 50);
    const net = Math.max(bill.billNet, 0);
    const discountAmount = (net * percent) / 100;

    return {
        gross: Math.max(bill.gross, 0),
        billDiscountPercent: bill.billDiscountPercent,
        billDiscountAmount: bill.billDiscountAmount,
        billNet: net,
        discountPercent: percent,
        discountAmount,
        payable: Math.max(net - discountAmount, 0),
    };
}
