import { router } from '@inertiajs/react';
import { Printer, Truck } from 'lucide-react';
import { useState } from 'react';

import { thaiDate } from '@/components/domain/counter/RescheduleDeliveryDialog';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { bahtText, deliveryNoteTotals } from '@/pages/deliveryNote';
import type { DeliveryNoteCharge, DeliveryNoteRow } from '@/pages/deliveryNote';

/** The bill a delivery note is being made for. */
export type DeliveryNoteTarget = {
    id: number;
    orderCode: string;
    customerName: string;
    jobName: string;
    dueDate: string;
    deliveryMethod: string;
    shippingAddress: string;
    rows: DeliveryNoteRow[];
    /** "คิดเงินเพิ่มเติม" on the bill, which the note has to account for too. */
    charges: DeliveryNoteCharge[];
    /** The goods and those charges together, before any discount. */
    gross: number;
    billDiscountPercent: number;
    billDiscountAmount: number;
    /** What the bill came to, after the discount on the work receipt. */
    billNet: number;
    /** The note's own discount as last saved. */
    discountPercent: number;
    canDiscount: boolean;
};

const money = (value: number): string =>
    value.toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

/**
 * "ใบจัดส่ง" on the counter: what is in the bag, and what the customer signs
 * for.
 *
 * It opens before the paper rather than printing straight away, because the
 * counter has a decision to make here. The note carries its own discount,
 * separate from the one the bill was written with: the bill, what has been
 * paid and what is owed all stay exactly as they were, and only the figure
 * on the note being handed over moves. Printing without seeing that first
 * meant reprinting to change it.
 *
 * Everything else is read-only. Sizes, quantities and prices come from the
 * bill, and a delivery note that could disagree with the bill is a delivery
 * note nobody can reconcile.
 */
export function DeliveryNoteDialog({
    target,
    onClose,
    onPrint,
}: {
    target: DeliveryNoteTarget | null;
    onClose: () => void;
    onPrint: (discountPercent: number) => void;
}) {
    /**
     * The box opens on the figure this bill last saved, and EMPTY when that
     * figure is nothing. A zero sitting in the box is not information — it is
     * a character the counter has to delete before typing, and the one time
     * they forget, "5" is typed onto it and the bill goes out at 5% off... or
     * at 50%. Empty reads as "no discount" and takes the first keystroke.
     *
     * Keyed by bill at the call site, so this initial value is right for each.
     */
    const [percent, setPercent] = useState(() =>
        target && target.discountPercent > 0
            ? String(target.discountPercent)
            : '',
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const totals = deliveryNoteTotals(
        {
            gross: target?.gross ?? 0,
            billDiscountPercent: target?.billDiscountPercent ?? 0,
            billDiscountAmount: target?.billDiscountAmount ?? 0,
            billNet: target?.billNet ?? 0,
        },
        Number(percent) || 0,
    );
    const charges = target?.charges ?? [];
    const pieces = (target?.rows ?? []).reduce(
        (sum, row) => sum + row.quantity,
        0,
    );

    const print = () => {
        if (target === null) {
            return;
        }

        const next = totals.discountPercent;

        // Nothing to save, or nothing this user may save: straight to paper.
        if (!target.canDiscount || next === target.discountPercent) {
            onPrint(next);
            onClose();

            return;
        }

        // Saved before printing, so the shop's copy and the customer's copy
        // can never say different numbers.
        setSaving(true);
        setError(null);
        router.post(
            `/orders/${target.id}/delivery-discount`,
            { delivery_discount_percent: next },
            {
                preserveScroll: true,
                onSuccess: () => {
                    onPrint(next);
                    onClose();
                },
                onError: (errors) =>
                    setError(
                        Object.values(errors)[0] ??
                            'บันทึกส่วนลดไม่สำเร็จ กรุณาลองใหม่',
                    ),
                onFinish: () => setSaving(false),
            },
        );
    };

    return (
        <Dialog
            open={target !== null}
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
        >
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Truck className="size-5 text-[#174395]" />
                        ใบส่งสินค้า {target?.orderCode}
                    </DialogTitle>
                    <DialogDescription>
                        {target?.customerName} · {target?.jobName}
                    </DialogDescription>
                </DialogHeader>

                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-4 py-3 text-[13px] sm:grid-cols-[auto_1fr_auto_1fr]">
                    <dt className="text-slate-500">ส่งถึง</dt>
                    <dd className="m-0 font-semibold text-slate-800">
                        {target?.customerName}
                    </dd>
                    <dt className="text-slate-500">วันที่ส่งมอบ</dt>
                    <dd className="m-0 font-semibold text-slate-800">
                        {thaiDate(target?.dueDate)}
                    </dd>
                    <dt className="text-slate-500">วิธีส่งมอบ</dt>
                    <dd className="m-0 text-slate-700">
                        {target?.deliveryMethod || '-'}
                    </dd>
                    <dt className="text-slate-500">ที่อยู่</dt>
                    <dd className="m-0 truncate text-slate-700">
                        {target?.shippingAddress || '-'}
                    </dd>
                </dl>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                            <tr>
                                <th className="px-3 py-2 text-left">ประเภท</th>
                                <th className="w-20 px-3 py-2 text-left">
                                    ไซส์
                                </th>
                                <th className="w-20 px-3 py-2 text-right">
                                    จำนวน
                                </th>
                                <th className="w-28 px-3 py-2 text-right">
                                    ราคา
                                </th>
                                <th className="w-32 px-3 py-2 text-right">
                                    ราคารวม
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(target?.rows ?? []).length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-3 py-6 text-center text-xs text-slate-400"
                                    >
                                        บิลนี้ไม่มีรายการสินค้า
                                    </td>
                                </tr>
                            ) : (
                                (target?.rows ?? []).map((row, index) => (
                                    <tr
                                        key={`${row.type}-${row.size}-${index}`}
                                    >
                                        <td className="px-3 py-2 text-slate-700">
                                            {row.type}
                                        </td>
                                        <td className="px-3 py-2 text-slate-700">
                                            {row.size}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {row.quantity.toLocaleString(
                                                'th-TH',
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-600 tabular-nums">
                                            {money(row.unitPrice)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                            {money(row.total)}
                                        </td>
                                    </tr>
                                ))
                            )}
                            {/* The bill's extra charges belong on the note
                                too: without them its total is larger than the
                                goods on it with nothing naming the gap. */}
                            {charges.map((charge, index) => (
                                <tr key={`${charge.label}-${index}`}>
                                    <td className="px-3 py-2 text-slate-700">
                                        {charge.label}
                                    </td>
                                    <td className="px-3 py-2 text-slate-400">
                                        -
                                    </td>
                                    <td className="px-3 py-2 text-right text-slate-400">
                                        -
                                    </td>
                                    <td className="px-3 py-2 text-right text-slate-400">
                                        -
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                        {money(charge.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t border-slate-200 bg-slate-50/70">
                            <tr>
                                <td
                                    colSpan={2}
                                    className="px-3 py-2 text-xs font-semibold text-slate-600"
                                >
                                    รวมทั้งหมด
                                </td>
                                <td className="px-3 py-2 text-right font-bold tabular-nums">
                                    {pieces.toLocaleString('th-TH')}
                                </td>
                                <td />
                                <td className="px-3 py-2 text-right font-bold tabular-nums">
                                    {money(totals.gross)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="grid gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-[13px]">
                    {totals.billDiscountPercent > 0 && (
                        <>
                            <div className="flex items-center justify-between text-slate-600">
                                <span>รวมสินค้าและค่าใช้จ่าย</span>
                                <span className="font-semibold text-slate-900 tabular-nums">
                                    ฿ {money(totals.gross)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-600">
                                <span>
                                    ส่วนลดตามบิล {totals.billDiscountPercent}%
                                </span>
                                <span className="font-semibold text-rose-600 tabular-nums">
                                    - ฿ {money(totals.billDiscountAmount)}
                                </span>
                            </div>
                        </>
                    )}

                    <div className="flex items-center justify-between text-slate-600">
                        <span>ยอดสุทธิตามบิล</span>
                        <span className="font-semibold text-slate-900 tabular-nums">
                            ฿ {money(totals.billNet)}
                        </span>
                    </div>

                    <div className="grid grid-cols-[150px_1fr] items-center gap-2">
                        <span className="text-slate-600">
                            ส่วนลดใบส่งของ (%)
                        </span>
                        <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={50}
                            step="0.01"
                            value={percent}
                            placeholder="0"
                            disabled={!target?.canDiscount}
                            onChange={(event) => setPercent(event.target.value)}
                            aria-label="ส่วนลดใบส่งของเป็นเปอร์เซ็นต์"
                            className="h-8 bg-white text-right text-xs tabular-nums md:text-xs"
                        />
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                        <span>มูลค่าส่วนลดใบส่งของ</span>
                        <span className="font-semibold text-rose-600 tabular-nums">
                            - ฿ {money(totals.discountAmount)}
                        </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-yellow-200 pt-2 text-slate-700">
                        <span className="font-semibold">
                            ยอดที่ลูกค้าเซ็นรับ
                        </span>
                        <span className="text-base font-bold text-[#E21E26] tabular-nums">
                            ฿ {money(totals.payable)}
                        </span>
                    </div>

                    <p className="border-t border-yellow-200 pt-2 text-[12px] text-slate-600">
                        <span className="text-slate-500">
                            จำนวนเงินเป็นตัวอักษร{' '}
                        </span>
                        <span className="font-semibold">
                            ({bahtText(totals.payable)})
                        </span>
                    </p>

                    <p className="text-[11px] text-slate-500">
                        ส่วนลดนี้อยู่บนใบส่งของเท่านั้น ยอดบิล ยอดที่ชำระแล้ว
                        และยอดคงเหลือ ไม่เปลี่ยนตาม
                    </p>
                </div>

                {error !== null && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-[#E21E26]">
                        {error}
                    </p>
                )}

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={saving}
                    >
                        ปิด
                    </Button>
                    <Button type="button" onClick={print} disabled={saving}>
                        <Printer className="size-4" />
                        {saving ? 'กำลังบันทึก…' : 'พิมพ์ใบส่งของ'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
