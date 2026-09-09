import { Printer, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

type WorkReceiptTopBarProps = {
    orderCode: string;
    onPrint: () => void;
    onClose: () => void;
    currentStatusLabel?: string;
    currentStatusClassName?: string;
    actions?: ReactNode;
};

type WorkReceiptBillHeaderProps = {
    branchName: string | null | undefined;
    phone: string | null | undefined;
};

export function WorkReceiptTopBar({
    orderCode,
    onPrint,
    onClose,
    currentStatusLabel,
    currentStatusClassName,
    actions,
}: WorkReceiptTopBarProps) {
    return (
        <div className="no-print flex items-center justify-between bg-blue-800 px-4 py-2 text-white md:px-5">
            <h2 className="text-base font-bold md:text-lg">
                ใบรับงาน {orderCode}
            </h2>
            <div className="flex items-center gap-2">
                {currentStatusLabel ? (
                    <span
                        className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${currentStatusClassName ?? 'border-blue-200 bg-blue-50 text-blue-700'}`}
                    >
                        สถานะปัจจุบัน: {currentStatusLabel}
                    </span>
                ) : null}
                <Button
                    type="button"
                    variant="secondary"
                    className="h-8 bg-white/95 px-3 text-xs font-semibold text-blue-800 hover:bg-white"
                    onClick={onPrint}
                >
                    <Printer className="size-3.5" />
                    Print เอกสาร
                </Button>
                {actions}
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-white hover:bg-blue-700"
                    onClick={onClose}
                >
                    <X className="size-4" />
                </Button>
            </div>
        </div>
    );
}

export function WorkReceiptBillHeader({
    branchName,
    phone,
}: WorkReceiptBillHeaderProps) {
    return (
        <div className="grid gap-2 rounded-lg border border-slate-300 bg-slate-50 p-2 md:grid-cols-[150px_1fr_220px]">
            <div className="flex items-center justify-center rounded-md border border-slate-300 bg-white py-2">
                <img
                    src="/images/logo/logo.png"
                    alt="JS Sport"
                    className="h-14 w-auto object-contain"
                />
            </div>
            <div className="rounded-md border border-slate-300 bg-white px-3 py-2">
                <p className="text-center text-xl font-extrabold text-red-600">
                    เจ.เอส.สปอร์ต
                </p>
                <p className="text-center text-xs text-slate-600">
                    ก่อนเข้ารับสินค้ากรุณาโทรสอบถามก่อนเพื่อความสะดวก
                </p>
            </div>
            <div className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
                <p className="font-semibold">
                    สาขา:{' '}
                    <span className="text-sm text-red-600">
                        {branchName || '-'}
                    </span>
                </p>
                <p className="mt-1 font-semibold">
                    โทร:{' '}
                    <span className="text-sm text-blue-700">
                        {phone || '-'}
                    </span>
                </p>
            </div>
        </div>
    );
}
