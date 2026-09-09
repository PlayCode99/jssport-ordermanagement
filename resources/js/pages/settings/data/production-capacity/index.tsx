import { Head } from '@inertiajs/react';
import { Save } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
    dailyCapacity: number;
};

function csrfToken(): string {
    return (
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ?? ''
    );
}

export default function ProductionCapacityPage({ dailyCapacity }: Props) {
    const [capacity, setCapacity] = useState(String(dailyCapacity));
    const [message, setMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const save = async () => {
        const value = Number.parseInt(capacity, 10);

        if (!Number.isInteger(value) || value < 1) {
            setMessage('กรุณากรอกจำนวนชิ้นที่ผลิตได้ต่อวันให้ถูกต้อง');

            return;
        }

        setIsSaving(true);
        setMessage(null);

        const response = await fetch('/settings/data/production-capacity', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
            },
            body: JSON.stringify({ daily_capacity: value }),
        });

        const payload = (await response.json().catch(() => null)) as {
            daily_capacity?: number;
            message?: string;
        } | null;
        setIsSaving(false);

        if (!response.ok) {
            setMessage(payload?.message ?? 'บันทึกกำลังผลิตต่อวันไม่สำเร็จ');

            return;
        }

        setCapacity(String(payload?.daily_capacity ?? value));
        setMessage('บันทึกกำลังผลิตต่อวันเรียบร้อยแล้ว');
    };

    return (
        <>
            <Head title="กำลังผลิตต่อวัน" />
            <main className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-6">
                <h1 className="text-xl font-bold text-slate-900">
                    กำลังผลิตต่อวัน
                </h1>
                <section className="mt-4 border border-slate-200 bg-white p-5 shadow-sm">
                    <label className="grid max-w-sm gap-2 text-sm font-semibold text-slate-700">
                        จำนวนชิ้นที่ผลิตได้ต่อวัน
                        <Input
                            type="number"
                            min="1"
                            max="100000"
                            value={capacity}
                            onChange={(event) =>
                                setCapacity(event.target.value)
                            }
                        />
                    </label>
                    <p className="mt-2 text-xs text-slate-500">
                        วันที่มียอดจำนวนชิ้นงานถึงหรือเกินค่านี้
                        จะปรากฏเป็นสีแดงในช่องเลือกวันที่รับสินค้า
                    </p>
                    {message ? (
                        <p className="mt-3 text-sm text-slate-700">{message}</p>
                    ) : null}
                    <Button
                        type="button"
                        className="mt-5"
                        disabled={isSaving}
                        onClick={() => void save()}
                    >
                        <Save className="size-4" />
                        บันทึก
                    </Button>
                </section>
            </main>
        </>
    );
}
