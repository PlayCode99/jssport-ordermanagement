import { Head, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Coins, Package, Scissors, Shirt, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Option = { value: string; label: string };

type CalendarOrder = {
    id: number;
    order_code: string;
    customer_name: string;
    job_name: string | null;
    job_type: string | null;
    delivery_method: string | null;
    delivery_label: string;
    order_status: string | null;
    status_label: string;
    is_closed: boolean;
    quantity: number;
};

export type OwnerDashboardProps = {
    filters: { date_from: string | null; date_to: string | null; branch_id: number | null; job_type: string | null };
    filterOptions: { branches: Option[]; jobTypes: Option[] };
    revenue: {
        net: number;
        gross: number;
        discount: number;
        order_count: number;
        by_garment: { shirt: number; pants: number; set: number; unspecified: number };
        pieces: { shirt: number; pants: number; set: number; unspecified: number };
        monthly: Array<{ month: string; net: number }>;
    };
    expense: {
        shirt: number;
        pants: number;
        total: number;
        monthly: Array<{ month: string; shirt: number; pants: number; total: number }>;
    };
    orderCounts: { completed: number; in_progress: number; total: number };
    jobTypeBreakdown: Array<{ job_type: string; completed: number; in_progress: number; total: number; quantity: number }>;
    garmentTypeUsage: {
        shirt: Array<{ name: string; orders: number; pieces: number }>;
        pants: Array<{ name: string; orders: number; pieces: number }>;
    };
    calendar: { month: string; today: string; days: Record<string, { count: number; quantity: number; orders: CalendarOrder[] }> };
};

const money = (value: number): string => value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (value: number): string => value.toLocaleString('th-TH');

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const monthLabel = (month: string): string => {
    const [year, monthPart] = month.split('-');
    const index = Number(monthPart) - 1;

    return `${THAI_MONTHS[index] ?? monthPart} ${Number(year) + 543}`;
};

const shiftMonth = (month: string, delta: number): string => {
    const [year, monthPart] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, monthPart - 1 + delta, 1));

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Percentage of a whole, guarding the empty case so the bars never show NaN. */
const share = (value: number, total: number): number => (total > 0 ? Math.round((value / total) * 1000) / 10 : 0);

function StatCard({
    label,
    value,
    hint,
    icon,
    tone,
}: {
    label: string;
    value: string;
    hint?: string;
    icon: React.ReactNode;
    tone: 'slate' | 'blue' | 'green' | 'amber';
}) {
    const tones = {
        slate: 'bg-slate-100 text-slate-700',
        blue: 'bg-[#174395]/10 text-[#174395]',
        green: 'bg-emerald-100 text-emerald-700',
        amber: 'bg-amber-100 text-amber-700',
    } as const;

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-slate-900">{value}</p>
                    {hint ? <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p> : null}
                </div>
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span>
            </div>
        </div>
    );
}

export default function OwnerDashboard({
    filters,
    filterOptions,
    revenue,
    expense,
    orderCounts,
    jobTypeBreakdown,
    garmentTypeUsage,
    calendar,
}: OwnerDashboardProps) {
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo, setDateTo] = useState(filters.date_to ?? '');
    const [branchId, setBranchId] = useState(filters.branch_id !== null ? String(filters.branch_id) : 'all');
    const [jobType, setJobType] = useState(filters.job_type ?? 'all');

    const applyFilters = (overrides: Record<string, string | null> = {}) => {
        const query: Record<string, string> = {};
        const merged = {
            date_from: dateFrom,
            date_to: dateTo,
            branch_id: branchId === 'all' ? '' : branchId,
            job_type: jobType === 'all' ? '' : jobType,
            calendar_month: calendar.month,
            ...overrides,
        };

        Object.entries(merged).forEach(([key, value]) => {
            if (value !== null && value !== '') {
                query[key] = value;
            }
        });

        router.get('/owner-dashboard', query, { preserveState: true, preserveScroll: true });
    };

    const resetFilters = () => {
        setDateFrom('');
        setDateTo('');
        setBranchId('all');
        setJobType('all');
        router.get('/owner-dashboard', {}, { preserveScroll: true });
    };

    const maxMonthly = useMemo(
        () => Math.max(1, ...expense.monthly.map((row) => row.total)),
        [expense.monthly],
    );

    const calendarCells = useMemo(() => {
        const [year, month] = calendar.month.split('-').map(Number);
        const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const cells: Array<{ date: string; day: number } | null> = Array.from({ length: firstWeekday }, () => null);

        for (let day = 1; day <= daysInMonth; day += 1) {
            cells.push({ date: `${calendar.month}-${String(day).padStart(2, '0')}`, day });
        }

        return cells;
    }, [calendar.month]);

    const [selectedDate, setSelectedDate] = useState<string | null>(
        calendar.days[calendar.today] ? calendar.today : null,
    );
    const selectedDay = selectedDate ? calendar.days[selectedDate] : undefined;

    const maxJobTypeTotal = Math.max(1, ...jobTypeBreakdown.map((row) => row.total));

    return (
        <>
            <Head title="แดชบอร์ดเจ้าของกิจการ" />

            <div className="space-y-4 p-4 md:p-6">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">แดชบอร์ดเจ้าของกิจการ</h1>
                    <p className="mt-0.5 text-sm text-slate-500">สรุปรายจ่ายการผลิต ปริมาณงาน และกำหนดส่ง</p>
                </div>

                {/* ---------- filters ---------- */}
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto] md:items-end">
                        <label className="grid gap-1 text-xs">
                            <span className="font-semibold text-slate-600">วันที่เปิดบิล (จาก)</span>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(event) => setDateFrom(event.target.value)}
                                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
                                aria-label="วันที่เปิดบิลเริ่มต้น"
                            />
                        </label>
                        <label className="grid gap-1 text-xs">
                            <span className="font-semibold text-slate-600">ถึง</span>
                            <input
                                type="date"
                                value={dateTo}
                                min={dateFrom || undefined}
                                onChange={(event) => setDateTo(event.target.value)}
                                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
                                aria-label="วันที่เปิดบิลสิ้นสุด"
                            />
                        </label>
                        <label className="grid gap-1 text-xs">
                            <span className="font-semibold text-slate-600">สาขา</span>
                            <Select value={branchId} onValueChange={setBranchId}>
                                <SelectTrigger className="h-9 w-full bg-white text-xs" aria-label="สาขา">
                                    <SelectValue placeholder="ทุกสาขา" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">ทุกสาขา</SelectItem>
                                    {filterOptions.branches.map((branch) => (
                                        <SelectItem key={branch.value} value={branch.value}>
                                            {branch.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>
                        <label className="grid gap-1 text-xs">
                            <span className="font-semibold text-slate-600">ประเภทงาน</span>
                            <Select value={jobType} onValueChange={setJobType}>
                                <SelectTrigger className="h-9 w-full bg-white text-xs" aria-label="ประเภทงาน">
                                    <SelectValue placeholder="ทุกประเภท" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">ทุกประเภท</SelectItem>
                                    {filterOptions.jobTypes.map((type) => (
                                        <SelectItem key={type.value} value={type.value}>
                                            {type.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>
                        <div className="flex gap-2">
                            <Button type="button" className="h-9 bg-[#174395] text-xs text-white hover:bg-[#12367A]" onClick={() => applyFilters()}>
                                ใช้ตัวกรอง
                            </Button>
                            <Button type="button" variant="outline" className="h-9 text-xs" onClick={resetFilters}>
                                ล้างค่า
                            </Button>
                        </div>
                    </div>
                </section>

                {/* ---------- stat cards ---------- */}
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="รายรับ (งานที่ปิดแล้ว)"
                        value={`฿ ${money(revenue.net)}`}
                        hint={`${int(revenue.order_count)} ออเดอร์ · หลังส่วนลด ฿ ${money(revenue.discount)}`}
                        icon={<Coins className="size-4" />}
                        tone="green"
                    />
                    <StatCard
                        label="รายจ่ายรวม (ค่าแรงงานที่ปิดแล้ว)"
                        value={`฿ ${money(expense.total)}`}
                        hint={`${int(orderCounts.total)} ออเดอร์`}
                        icon={<TrendingUp className="size-4" />}
                        tone="blue"
                    />
                    <StatCard
                        label="ส่วนต่าง (รายรับ − รายจ่าย)"
                        value={`฿ ${money(revenue.net - expense.total)}`}
                        hint={revenue.net > 0 ? `${share(revenue.net - expense.total, revenue.net)}% ของรายรับ` : 'ยังไม่มีรายรับ'}
                        icon={<Wallet className="size-4" />}
                        tone={revenue.net - expense.total >= 0 ? 'green' : 'amber'}
                    />
                    <StatCard
                        label="งานที่เสร็จสิ้น"
                        value={int(orderCounts.completed)}
                        hint={`กำลังทำ ${int(orderCounts.in_progress)} ออเดอร์`}
                        icon={<Package className="size-4" />}
                        tone="slate"
                    />
                </section>

                {/* ---------- revenue split ---------- */}
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">รายรับจากการขาย</h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                                นับเฉพาะออเดอร์ที่ปิดงานแล้ว · แยกตามรายการที่บันทึกไว้จริงในบิล
                            </p>
                        </div>
                        <p className="font-mono text-xl font-bold text-emerald-700">฿ {money(revenue.net)}</p>
                    </div>

                    {revenue.net > 0 ? (
                        <>
                            <div
                                className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100"
                                role="img"
                                aria-label={`เสื้อ ${share(revenue.by_garment.shirt, revenue.net)}% กางเกง ${share(revenue.by_garment.pants, revenue.net)}% ชุด ${share(revenue.by_garment.set, revenue.net)}%`}
                            >
                                <div className="bg-amber-400" style={{ width: `${share(revenue.by_garment.shirt, revenue.net)}%` }} />
                                <div className="bg-[#174395]" style={{ width: `${share(revenue.by_garment.pants, revenue.net)}%` }} />
                                <div className="bg-emerald-500" style={{ width: `${share(revenue.by_garment.set, revenue.net)}%` }} />
                                <div className="bg-slate-300" style={{ width: `${share(revenue.by_garment.unspecified, revenue.net)}%` }} />
                            </div>

                            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {([
                                    { key: 'shirt', label: 'เสื้อ', dot: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-800' },
                                    { key: 'pants', label: 'กางเกง', dot: 'bg-[#174395]', bg: 'bg-[#174395]/5', text: 'text-[#174395]' },
                                    { key: 'set', label: 'ชุด (เสื้อ+กางเกง)', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-800' },
                                    { key: 'unspecified', label: 'ไม่ระบุ', dot: 'bg-slate-300', bg: 'bg-slate-50', text: 'text-slate-600' },
                                ] as const).map((row) => {
                                    const amount = revenue.by_garment[row.key];
                                    const pieces = revenue.pieces[row.key];

                                    if (row.key === 'unspecified' && amount === 0) {
                                        return null;
                                    }

                                    return (
                                        <div key={row.key} className={`rounded-lg ${row.bg} p-3`}>
                                            <p className={`flex items-center gap-1.5 text-xs font-semibold ${row.text}`}>
                                                <span className={`size-2 rounded-full ${row.dot}`} /> {row.label}
                                            </p>
                                            <p className="mt-1 font-mono text-lg font-bold text-slate-900">฿ {money(amount)}</p>
                                            <p className="mt-0.5 text-xs text-slate-500">
                                                {share(amount, revenue.net)}% · {int(pieces)} ตัว
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>

                            {revenue.by_garment.unspecified > 0 ? (
                                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                    ช่อง &quot;ไม่ระบุ&quot; คือบิลที่บันทึกก่อนระบบเริ่มแยกชนิดสินค้า จึงไม่เดาว่าเป็นเสื้อหรือชุด
                                    ออเดอร์ที่เปิดหลังจากนี้จะแยกให้อัตโนมัติ
                                </p>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                                <span>
                                    ยอดก่อนหักส่วนลด <span className="font-mono text-slate-800">฿ {money(revenue.gross)}</span>
                                </span>
                                <span>
                                    ส่วนลด <span className="font-mono text-rose-600">− ฿ {money(revenue.discount)}</span>
                                </span>
                                <span>
                                    คงเหลือสุทธิ <span className="font-mono font-semibold text-slate-900">฿ {money(revenue.net)}</span>
                                </span>
                            </div>
                        </>
                    ) : (
                        <p className="mt-6 text-center text-xs text-slate-400">ยังไม่มีออเดอร์ที่ปิดงานในช่วงที่เลือก</p>
                    )}
                </section>

                <div className="grid gap-4 xl:grid-cols-2">
                    {/* ---------- expense split ---------- */}
                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h2 className="text-sm font-bold text-slate-900">สัดส่วนรายจ่าย เสื้อ / กางเกง</h2>
                        <p className="mt-0.5 text-xs text-slate-500">นับเฉพาะออเดอร์ที่ปิดงานแล้ว</p>

                        {expense.total > 0 ? (
                            <>
                                <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`เสื้อ ${share(expense.shirt, expense.total)}% กางเกง ${share(expense.pants, expense.total)}%`}>
                                    <div className="bg-amber-400" style={{ width: `${share(expense.shirt, expense.total)}%` }} />
                                    <div className="bg-[#174395]" style={{ width: `${share(expense.pants, expense.total)}%` }} />
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                    <div className="rounded-lg bg-amber-50 p-3">
                                        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                                            <span className="size-2 rounded-full bg-amber-400" /> เสื้อ
                                        </p>
                                        <p className="mt-1 font-mono text-lg font-bold text-slate-900">฿ {money(expense.shirt)}</p>
                                    </div>
                                    <div className="rounded-lg bg-[#174395]/5 p-3">
                                        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#174395]">
                                            <span className="size-2 rounded-full bg-[#174395]" /> กางเกง
                                        </p>
                                        <p className="mt-1 font-mono text-lg font-bold text-slate-900">฿ {money(expense.pants)}</p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <p className="mt-6 text-center text-xs text-slate-400">ไม่มีรายจ่ายในช่วงที่เลือก</p>
                        )}

                        {expense.monthly.length > 0 ? (
                            <div className="mt-4 border-t border-slate-100 pt-3">
                                <p className="text-xs font-semibold text-slate-600">รายจ่ายรายเดือน</p>
                                <div className="mt-2 space-y-1.5">
                                    {expense.monthly.map((row) => (
                                        <div key={row.month} className="grid grid-cols-[70px_1fr_auto] items-center gap-2">
                                            <span className="text-xs text-slate-500">{monthLabel(row.month)}</span>
                                            <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                                                <div className="bg-amber-400" style={{ width: `${(row.shirt / maxMonthly) * 100}%` }} />
                                                <div className="bg-[#174395]" style={{ width: `${(row.pants / maxMonthly) * 100}%` }} />
                                            </div>
                                            <span className="font-mono text-xs text-slate-700">฿ {money(row.total)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </section>

                    {/* ---------- order counts ---------- */}
                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h2 className="text-sm font-bold text-slate-900">จำนวนออเดอร์</h2>

                        {orderCounts.total > 0 ? (
                            <div className="mt-3 space-y-3">
                                {[
                                    { label: 'เสร็จสิ้น', value: orderCounts.completed, className: 'bg-emerald-500' },
                                    { label: 'กำลังทำ', value: orderCounts.in_progress, className: 'bg-amber-400' },
                                ].map((row) => (
                                    <div key={row.label}>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-medium text-slate-600">{row.label}</span>
                                            <span className="font-mono font-semibold text-slate-900">
                                                {int(row.value)} <span className="text-slate-400">({share(row.value, orderCounts.total)}%)</span>
                                            </span>
                                        </div>
                                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                                            <div className={`h-full ${row.className}`} style={{ width: `${share(row.value, orderCounts.total)}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-6 text-center text-xs text-slate-400">ไม่มีออเดอร์ในช่วงที่เลือก</p>
                        )}

                        <div className="mt-4 border-t border-slate-100 pt-3">
                            <p className="text-xs font-semibold text-slate-600">แยกตามประเภทงาน</p>
                            {jobTypeBreakdown.length > 0 ? (
                                <div className="mt-2 overflow-x-auto">
                                    <table className="w-full min-w-[420px] text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-[11px] uppercase text-slate-500">
                                                <th className="py-1.5 pr-2 font-semibold">ประเภทงาน</th>
                                                <th className="py-1.5 px-2 text-right font-semibold">เสร็จสิ้น</th>
                                                <th className="py-1.5 px-2 text-right font-semibold">กำลังทำ</th>
                                                <th className="py-1.5 px-2 text-right font-semibold">รวม</th>
                                                <th className="py-1.5 pl-2 text-right font-semibold">จำนวนตัว</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {jobTypeBreakdown.map((row) => (
                                                <tr key={row.job_type} className="border-b border-slate-100 last:border-0">
                                                    <td className="py-2 pr-2">
                                                        <span className="font-medium text-slate-800">{row.job_type}</span>
                                                        <div className="mt-1 h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-slate-100">
                                                            <div className="h-full bg-[#174395]" style={{ width: `${(row.total / maxJobTypeTotal) * 100}%` }} />
                                                        </div>
                                                    </td>
                                                    <td className="px-2 text-right font-mono text-emerald-700">{int(row.completed)}</td>
                                                    <td className="px-2 text-right font-mono text-amber-700">{int(row.in_progress)}</td>
                                                    <td className="px-2 text-right font-mono font-semibold text-slate-900">{int(row.total)}</td>
                                                    <td className="pl-2 text-right font-mono text-slate-600">{int(row.quantity)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="mt-4 text-center text-xs text-slate-400">ไม่มีข้อมูล</p>
                            )}
                        </div>
                    </section>
                </div>

                {/* ---------- top 5 garment types ---------- */}
                <div className="grid gap-4 xl:grid-cols-2">
                    {([
                        { key: 'shirt', title: 'แบบเสื้อที่ใช้มากที่สุด (Top 5)', rows: garmentTypeUsage.shirt, bar: 'bg-amber-400' },
                        { key: 'pants', title: 'แบบกางเกงที่ใช้มากที่สุด (Top 5)', rows: garmentTypeUsage.pants, bar: 'bg-[#174395]' },
                    ] as const).map((block) => {
                        const maxPieces = Math.max(1, ...block.rows.map((row) => row.pieces));

                        return (
                            <section key={block.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <h2 className="text-sm font-bold text-slate-900">{block.title}</h2>
                                {block.rows.length > 0 ? (
                                    <div className="mt-3 overflow-x-auto">
                                        <table className="w-full min-w-[360px] text-left text-xs">
                                            <thead>
                                                <tr className="border-b border-slate-200 text-[11px] uppercase text-slate-500">
                                                    <th className="py-1.5 pr-2 font-semibold">อันดับ</th>
                                                    <th className="py-1.5 px-2 font-semibold">แบบ</th>
                                                    <th className="py-1.5 px-2 text-right font-semibold">ออเดอร์</th>
                                                    <th className="py-1.5 pl-2 text-right font-semibold">จำนวนตัว</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {block.rows.map((row, index) => (
                                                    <tr key={row.name} className="border-b border-slate-100 last:border-0">
                                                        <td className="py-2 pr-2 font-mono text-slate-400">{index + 1}</td>
                                                        <td className="px-2">
                                                            <span className="font-medium text-slate-800">{row.name}</span>
                                                            <div className="mt-1 h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-slate-100">
                                                                <div className={`h-full ${block.bar}`} style={{ width: `${(row.pieces / maxPieces) * 100}%` }} />
                                                            </div>
                                                        </td>
                                                        <td className="px-2 text-right font-mono text-slate-600">{int(row.orders)}</td>
                                                        <td className="pl-2 text-right font-mono font-semibold text-slate-900">{int(row.pieces)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="mt-6 text-center text-xs text-slate-400">ไม่มีข้อมูล</p>
                                )}
                            </section>
                        );
                    })}
                </div>

                {/* ---------- delivery calendar ---------- */}
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">ปฏิทินกำหนดส่ง</h2>
                            <p className="text-xs text-slate-500">ปฏิทินแสดงทุกออเดอร์ในเดือนที่เลือก ไม่ขึ้นกับตัวกรองด้านบน</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="size-8"
                                aria-label="เดือนก่อนหน้า"
                                onClick={() => applyFilters({ calendar_month: shiftMonth(calendar.month, -1) })}
                            >
                                <ChevronLeft className="size-4" />
                            </Button>
                            <span className="min-w-[90px] text-center text-sm font-semibold text-slate-800">{monthLabel(calendar.month)}</span>
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="size-8"
                                aria-label="เดือนถัดไป"
                                onClick={() => applyFilters({ calendar_month: shiftMonth(calendar.month, 1) })}
                            >
                                <ChevronRight className="size-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="mt-3 grid grid-cols-7 gap-1">
                        {DAY_NAMES.map((day) => (
                            <div key={day} className="py-1 text-center text-[11px] font-semibold text-slate-500">
                                {day}
                            </div>
                        ))}
                        {calendarCells.map((cell, index) => {
                            if (!cell) {
                                return <div key={`blank-${index}`} />;
                            }

                            const dayData = calendar.days[cell.date];
                            const isToday = cell.date === calendar.today;
                            const isSelected = cell.date === selectedDate;

                            return (
                                <button
                                    key={cell.date}
                                    type="button"
                                    onClick={() => setSelectedDate(dayData ? cell.date : null)}
                                    aria-label={`${cell.day} ${monthLabel(calendar.month)}${dayData ? ` มี ${dayData.count} ออเดอร์ต้องส่ง` : ' ไม่มีออเดอร์'}`}
                                    aria-pressed={isSelected}
                                    className={`flex min-h-[58px] flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors ${
                                        isSelected
                                            ? 'border-[#174395] bg-[#174395]/5'
                                            : isToday
                                              ? 'border-[#E21E26] bg-[#E21E26]/5'
                                              : 'border-slate-200 bg-white hover:bg-slate-50'
                                    } ${dayData ? 'cursor-pointer' : 'cursor-default'}`}
                                >
                                    <span className={`text-xs font-semibold ${isToday ? 'text-[#E21E26]' : 'text-slate-700'}`}>{cell.day}</span>
                                    {dayData ? (
                                        <span className="rounded bg-[#174395] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                            {dayData.count} งาน
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-3 border-t border-slate-100 pt-3">
                        {selectedDay && selectedDate ? (
                            <>
                                <p className="text-xs font-semibold text-slate-700">
                                    ต้องส่ง {selectedDate === calendar.today ? 'วันนี้' : `วันที่ ${Number(selectedDate.split('-')[2])}`} ·{' '}
                                    <span className="font-mono">{int(selectedDay.count)}</span> ออเดอร์ ·{' '}
                                    <span className="font-mono">{int(selectedDay.quantity)}</span> ตัว
                                </p>
                                <div className="mt-2 overflow-x-auto">
                                    <table className="w-full min-w-[720px] text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-[11px] uppercase text-slate-500">
                                                <th className="py-1.5 pr-2 font-semibold">เลขที่ออเดอร์</th>
                                                <th className="py-1.5 px-2 font-semibold">ชื่องาน</th>
                                                <th className="py-1.5 px-2 font-semibold">ลูกค้า</th>
                                                <th className="py-1.5 px-2 font-semibold">ประเภทงาน</th>
                                                <th className="py-1.5 px-2 font-semibold">สถานะ</th>
                                                <th className="py-1.5 px-2 font-semibold">การส่ง</th>
                                                <th className="py-1.5 pl-2 text-right font-semibold">จำนวนตัว</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedDay.orders.map((order) => (
                                                <tr key={order.id} className="border-b border-slate-100 last:border-0">
                                                    <td className="py-2 pr-2 font-mono font-semibold text-[#E21E26]">{order.order_code}</td>
                                                    <td className="px-2 font-medium text-slate-800">{order.job_name || '-'}</td>
                                                    <td className="px-2 text-slate-700">{order.customer_name}</td>
                                                    <td className="px-2 text-slate-600">{order.job_type ?? '-'}</td>
                                                    <td className="px-2">
                                                        <span
                                                            className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                                                order.is_closed
                                                                    ? 'bg-emerald-100 text-emerald-800'
                                                                    : 'bg-amber-100 text-amber-800'
                                                            }`}
                                                        >
                                                            {order.status_label}
                                                        </span>
                                                    </td>
                                                    <td className="px-2">
                                                        <span
                                                            className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                                                order.delivery_method === 'shipping'
                                                                    ? 'bg-[#174395]/10 text-[#174395]'
                                                                    : order.delivery_method === 'onsite'
                                                                      ? 'bg-amber-100 text-amber-800'
                                                                      : 'bg-slate-100 text-slate-700'
                                                            }`}
                                                        >
                                                            {order.delivery_label}
                                                        </span>
                                                    </td>
                                                    <td className="pl-2 text-right font-mono text-slate-900">{int(order.quantity)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <p className="py-2 text-center text-xs text-slate-400">
                                {calendar.days[calendar.today] ? 'เลือกวันที่เพื่อดูรายละเอียด' : 'วันนี้ไม่มีออเดอร์ที่ต้องส่ง — เลือกวันที่มีงานเพื่อดูรายละเอียด'}
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </>
    );
}

OwnerDashboard.layout = () => ({
    breadcrumbs: [{ title: 'แดชบอร์ดเจ้าของกิจการ', href: '/owner-dashboard' }],
});
