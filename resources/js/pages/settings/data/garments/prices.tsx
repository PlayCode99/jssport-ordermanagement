import { Head, Link, usePage } from '@inertiajs/react';
import { Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type GarmentCategory = 'SHIRT' | 'PANTS';

type GarmentTypeOption = {
    id: number;
    category: GarmentCategory;
    code: string;
    name: string;
    is_active: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
};

type PriceRow = {
    id: number;
    garment_type_id: number;
    category: GarmentCategory;
    garment_type_code: string;
    garment_type_name: string;
    name: string;
    child_price: string;
    adult_price: string;
    /** Empty when this step costs the same for long sleeves or long legs. */
    child_price_long: string | null;
    adult_price_long: string | null;
    is_active: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
};

type PageProps = {
    garmentTypes: GarmentTypeOption[];
    rows: PriceRow[];
    selectedCategory?: GarmentCategory | null;
    selectedGarmentTypeId?: number | null;
    selectedGarmentTypeName?: string | null;
};

type FormState = {
    garment_type_id: string;
    name: string;
    child_price: string;
    adult_price: string;
    child_price_long: string;
    adult_price_long: string;
    display_order: string;
    is_active: boolean;
};

const INITIAL_FORM: FormState = {
    garment_type_id: '',
    name: '',
    child_price: '0.00',
    adult_price: '0.00',
    child_price_long: '',
    adult_price_long: '',
    display_order: '0',
    is_active: true,
};

function csrfToken(): string {
    return (
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ?? ''
    );
}

function fmtPrice(value: string): string {
    const n = Number.parseFloat(value);

    if (Number.isNaN(n)) {
        return value;
    }

    return n.toFixed(2);
}

export default function GarmentPricesPage() {
    const {
        garmentTypes,
        rows: initialRows,
        selectedCategory,
        selectedGarmentTypeId,
        selectedGarmentTypeName,
    } = usePage<PageProps>().props;
    const [rows, setRows] = useState<PriceRow[]>(initialRows);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<
        'all' | GarmentCategory
    >(selectedCategory ?? 'all');
    const [garmentTypeFilter, setGarmentTypeFilter] = useState<'all' | string>(
        selectedGarmentTypeId && selectedGarmentTypeId > 0
            ? String(selectedGarmentTypeId)
            : 'all',
    );
    const [statusFilter, setStatusFilter] = useState<
        'all' | 'active' | 'inactive'
    >('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [error, setError] = useState<string | null>(null);

    const typeOptions = useMemo(() => {
        return [...garmentTypes]
            .filter(
                (type) =>
                    categoryFilter === 'all' ||
                    type.category === categoryFilter,
            )
            .sort(
                (a, b) =>
                    a.category.localeCompare(b.category) ||
                    a.display_order - b.display_order ||
                    a.id - b.id,
            );
    }, [garmentTypes, categoryFilter]);

    const filteredRows = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();

        return rows
            .filter((row) => {
                const matchesSearch =
                    keyword.length === 0 ||
                    row.name.toLowerCase().includes(keyword) ||
                    row.garment_type_name.toLowerCase().includes(keyword) ||
                    row.garment_type_code.toLowerCase().includes(keyword);
                const matchesCategory =
                    categoryFilter === 'all' || row.category === categoryFilter;
                const matchesType =
                    garmentTypeFilter === 'all' ||
                    String(row.garment_type_id) === garmentTypeFilter;
                const matchesStatus =
                    statusFilter === 'all' ||
                    (statusFilter === 'active' && row.is_active) ||
                    (statusFilter === 'inactive' && !row.is_active);

                return (
                    matchesSearch &&
                    matchesCategory &&
                    matchesType &&
                    matchesStatus
                );
            })
            .sort(
                (a, b) =>
                    a.category.localeCompare(b.category) ||
                    a.display_order - b.display_order ||
                    a.id - b.id,
            );
    }, [rows, searchTerm, categoryFilter, garmentTypeFilter, statusFilter]);

    const openCreateModal = () => {
        setEditId(null);
        setForm({
            ...INITIAL_FORM,
            garment_type_id:
                selectedGarmentTypeId && selectedGarmentTypeId > 0
                    ? String(selectedGarmentTypeId)
                    : typeOptions[0]
                      ? String(typeOptions[0].id)
                      : '',
        });
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (row: PriceRow) => {
        setEditId(row.id);
        setForm({
            garment_type_id: String(row.garment_type_id),
            name: row.name,
            child_price: fmtPrice(row.child_price),
            adult_price: fmtPrice(row.adult_price),
            child_price_long:
                row.child_price_long === null
                    ? ''
                    : fmtPrice(row.child_price_long),
            adult_price_long:
                row.adult_price_long === null
                    ? ''
                    : fmtPrice(row.adult_price_long),
            display_order: String(row.display_order),
            is_active: row.is_active,
        });
        setError(null);
        setIsModalOpen(true);
    };

    const saveForm = async () => {
        const garmentTypeId = Number.parseInt(form.garment_type_id, 10);
        const childPrice = Number.parseFloat(form.child_price);
        const adultPrice = Number.parseFloat(form.adult_price);
        // A blank long price means "same as the short one". It must travel as
        // null, not as 0, which would make the garment free to make.
        const optionalPrice = (value: string): number | null => {
            const parsed = Number.parseFloat(value);

            return value.trim() === '' || Number.isNaN(parsed)
                ? null
                : Number(parsed.toFixed(2));
        };

        const payload = {
            garment_type_id: garmentTypeId,
            name: form.name.trim(),
            child_price: Number.isNaN(childPrice)
                ? null
                : Number(childPrice.toFixed(2)),
            adult_price: Number.isNaN(adultPrice)
                ? null
                : Number(adultPrice.toFixed(2)),
            child_price_long: optionalPrice(form.child_price_long),
            adult_price_long: optionalPrice(form.adult_price_long),
            display_order: Number.parseInt(form.display_order || '0', 10) || 0,
            is_active: form.is_active,
        };

        if (!Number.isInteger(garmentTypeId) || garmentTypeId <= 0) {
            setError('กรุณาเลือกประเภทเสื้อหรือกางเกง');

            return;
        }

        if (!payload.name) {
            setError('กรุณากรอกรายการงานเย็บ');

            return;
        }

        if (
            payload.child_price === null ||
            payload.child_price < 0 ||
            payload.adult_price === null ||
            payload.adult_price < 0
        ) {
            setError('กรุณากรอกราคาเด็กและผู้ใหญ่ให้ถูกต้อง');

            return;
        }

        if (
            (payload.child_price_long !== null &&
                payload.child_price_long < 0) ||
            (payload.adult_price_long !== null && payload.adult_price_long < 0)
        ) {
            setError('ราคาแขนยาว/ขายาวต้องไม่ติดลบ');

            return;
        }

        const endpoint =
            editId === null
                ? '/settings/data/garments/prices'
                : `/settings/data/garments/prices/${editId}`;
        const method = editId === null ? 'POST' : 'PUT';

        const response = await fetch(endpoint, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => null)) as {
            message?: string;
            rows?: PriceRow[];
        } | null;

        if (!response.ok) {
            setError(body?.message ?? 'บันทึกข้อมูลไม่สำเร็จ');

            return;
        }

        if (Array.isArray(body?.rows)) {
            setRows(body.rows);
        }

        setIsModalOpen(false);
    };

    const toggleActive = async (row: PriceRow) => {
        const response = await fetch(
            `/settings/data/garments/prices/${row.id}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    garment_type_id: row.garment_type_id,
                    name: row.name,
                    child_price: Number.parseFloat(row.child_price),
                    adult_price: Number.parseFloat(row.adult_price),
                    // This endpoint replaces the whole row, so the long prices
                    // have to ride along or toggling a row would erase them.
                    child_price_long:
                        row.child_price_long === null
                            ? null
                            : Number.parseFloat(row.child_price_long),
                    adult_price_long:
                        row.adult_price_long === null
                            ? null
                            : Number.parseFloat(row.adult_price_long),
                    display_order: row.display_order,
                    is_active: !row.is_active,
                }),
            },
        );

        const body = (await response.json().catch(() => null)) as {
            rows?: PriceRow[];
        } | null;

        if (response.ok && Array.isArray(body?.rows)) {
            setRows(body.rows);
        }
    };

    const deleteRow = async (row: PriceRow) => {
        const ok = window.confirm(`ยืนยันการลบรายการ ${row.name} ใช่หรือไม่`);

        if (!ok) {
            return;
        }

        const response = await fetch(
            `/settings/data/garments/prices/${row.id}`,
            {
                method: 'DELETE',
                headers: {
                    'X-CSRF-TOKEN': csrfToken(),
                    Accept: 'application/json',
                },
            },
        );

        const body = (await response.json().catch(() => null)) as {
            message?: string;
            rows?: PriceRow[];
        } | null;

        if (!response.ok) {
            setError(body?.message ?? 'ลบข้อมูลไม่สำเร็จ');
            setIsModalOpen(true);

            return;
        }

        if (Array.isArray(body?.rows)) {
            setRows(body.rows);
        }
    };

    return (
        <>
            <Head title="เซ็ทราคาเด็กและผู้ใหญ่" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                                Garment Pricing
                            </p>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                                เซ็ทราคาเด็กและผู้ใหญ่
                            </h1>
                            <p className="mt-2 text-sm text-slate-600">
                                ตัวอย่าง: กลับปก+ทับปกบน เด็ก 5.00 ผู้ใหญ่ 8.00
                            </p>
                            {selectedGarmentTypeName ? (
                                <p className="mt-2 text-sm font-medium text-emerald-700">
                                    กำลังตั้งราคาจากประเภทงาน:{' '}
                                    {selectedGarmentTypeName}
                                </p>
                            ) : null}
                        </div>

                        <div className="flex w-full flex-wrap justify-start gap-2 xl:w-auto xl:justify-end">
                            <Button asChild variant="outline">
                                <Link href="/settings/data/garments/types">
                                    ไปหน้าแยกประเภท
                                </Link>
                            </Button>
                            <Button
                                onClick={openCreateModal}
                                className="gap-2"
                                disabled={typeOptions.length === 0}
                            >
                                <Plus className="size-4" />
                                เพิ่มรายการราคา
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:px-5">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">
                                รายการจุดเย็บและราคา
                            </h2>
                            <p className="text-sm text-slate-500">
                                ทั้งหมด {filteredRows.length} รายการ
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                            <div className="relative min-w-0">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={(event) =>
                                        setSearchTerm(event.target.value)
                                    }
                                    placeholder="ค้นหารายการหรือประเภท"
                                    className="bg-white pl-9"
                                />
                            </div>

                            <Select
                                value={categoryFilter}
                                onValueChange={(
                                    value: 'all' | GarmentCategory,
                                ) => setCategoryFilter(value)}
                            >
                                <SelectTrigger className="bg-white">
                                    <SelectValue placeholder="ประเภทสินค้า" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        ทุกประเภท
                                    </SelectItem>
                                    <SelectItem value="SHIRT">เสื้อ</SelectItem>
                                    <SelectItem value="PANTS">
                                        กางเกง
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            <Select
                                value={garmentTypeFilter}
                                onValueChange={(value: 'all' | string) =>
                                    setGarmentTypeFilter(value)
                                }
                            >
                                <SelectTrigger className="bg-white">
                                    <SelectValue placeholder="เลือกประเภท" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        ทุกประเภท
                                    </SelectItem>
                                    {typeOptions.map((type) => (
                                        <SelectItem
                                            key={type.id}
                                            value={String(type.id)}
                                        >
                                            {type.category === 'SHIRT'
                                                ? 'เสื้อ'
                                                : 'กางเกง'}{' '}
                                            | {type.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select
                                value={statusFilter}
                                onValueChange={(
                                    value: 'all' | 'active' | 'inactive',
                                ) => setStatusFilter(value)}
                            >
                                <SelectTrigger className="bg-white">
                                    <SelectValue placeholder="สถานะ" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        ทุกสถานะ
                                    </SelectItem>
                                    <SelectItem value="active">
                                        เปิดใช้งาน
                                    </SelectItem>
                                    <SelectItem value="inactive">
                                        ปิดใช้งาน
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="w-[90px] px-4 py-3 text-left font-semibold text-slate-700">
                                        ลำดับ
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                        ประเภทเสื้อ
                                    </th>
                                    <th className="w-[120px] px-4 py-3 text-left font-semibold text-slate-700">
                                        เด็ก ราคา
                                    </th>
                                    <th className="w-[120px] px-4 py-3 text-left font-semibold text-slate-700">
                                        เด็ก แขนยาว/ขายาว
                                    </th>
                                    <th className="w-[120px] px-4 py-3 text-left font-semibold text-slate-700">
                                        ผู้ใหญ่ ราคา
                                    </th>
                                    <th className="w-[120px] px-4 py-3 text-left font-semibold text-slate-700">
                                        ผู้ใหญ่ แขนยาว/ขายาว
                                    </th>
                                    <th className="w-[160px] px-4 py-3 text-left font-semibold text-slate-700">
                                        สถานะ
                                    </th>
                                    <th className="w-[230px] px-4 py-3 text-left font-semibold text-slate-700">
                                        จัดการ
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRows.length === 0 ? (
                                    <tr>
                                        <td
                                            className="px-4 py-5 text-center text-slate-500"
                                            colSpan={6}
                                        >
                                            ไม่พบข้อมูลที่ตรงกับเงื่อนไข
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((row, index) => (
                                        <tr
                                            key={row.id}
                                            className="hover:bg-slate-50/60"
                                        >
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                {index + 1}
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                <div className="font-medium text-slate-900">
                                                    {row.garment_type_name}
                                                </div>
                                                <div className="text-slate-600">
                                                    {row.name}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                {fmtPrice(row.child_price)}
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-500">
                                                {row.child_price_long === null
                                                    ? 'เท่าราคาสั้น'
                                                    : fmtPrice(
                                                          row.child_price_long,
                                                      )}
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                {fmtPrice(row.adult_price)}
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-500">
                                                {row.adult_price_long === null
                                                    ? 'เท่าราคาสั้น'
                                                    : fmtPrice(
                                                          row.adult_price_long,
                                                      )}
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <Button
                                                    variant={
                                                        row.is_active
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    size="sm"
                                                    onClick={() =>
                                                        toggleActive(row)
                                                    }
                                                    className="gap-1"
                                                >
                                                    <Power className="size-4" />
                                                    {row.is_active
                                                        ? 'เปิดใช้งาน'
                                                        : 'ปิดใช้งาน'}
                                                </Button>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                            openEditModal(row)
                                                        }
                                                        className="gap-1"
                                                    >
                                                        <Pencil className="size-4" />
                                                        แก้ไข
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() =>
                                                            deleteRow(row)
                                                        }
                                                        className="gap-1"
                                                    >
                                                        <Trash2 className="size-4" />
                                                        ลบ
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editId === null
                                ? 'เพิ่มรายการราคา'
                                : 'แก้ไขรายการราคา'}
                        </DialogTitle>
                        <DialogDescription>
                            กำหนดรายการงานเย็บพร้อมราคาเด็กและผู้ใหญ่ในแถวเดียว
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        {selectedGarmentTypeId ? (
                            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                                <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">
                                    ประเภทงานที่เลือก
                                </p>
                                <p className="text-sm font-medium text-emerald-900">
                                    {selectedGarmentTypeName}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">
                                    ประเภทเสื้อหรือกางเกง
                                </label>
                                <Select
                                    value={form.garment_type_id}
                                    onValueChange={(value: string) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            garment_type_id: value,
                                        }))
                                    }
                                >
                                    <SelectTrigger className="bg-white">
                                        <SelectValue placeholder="เลือกประเภท" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {typeOptions.map((type) => (
                                            <SelectItem
                                                key={type.id}
                                                value={String(type.id)}
                                            >
                                                {type.category === 'SHIRT'
                                                    ? 'เสื้อ'
                                                    : 'กางเกง'}{' '}
                                                | {type.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                รายการ
                            </label>
                            <Input
                                value={form.name}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        name: event.target.value,
                                    }))
                                }
                                placeholder="เช่น กลับปก+ทับปกบน"
                                className="bg-white"
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">
                                    ราคาเด็ก
                                </label>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={form.child_price}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            child_price: event.target.value,
                                        }))
                                    }
                                    className="bg-white"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">
                                    ราคาผู้ใหญ่
                                </label>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={form.adult_price}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            adult_price: event.target.value,
                                        }))
                                    }
                                    className="bg-white"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">
                                    ราคาเด็ก แขนยาว/ขายาว
                                </label>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder="เว้นว่าง = เท่าราคาสั้น"
                                    value={form.child_price_long}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            child_price_long:
                                                event.target.value,
                                        }))
                                    }
                                    className="bg-white"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">
                                    ราคาผู้ใหญ่ แขนยาว/ขายาว
                                </label>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder="เว้นว่าง = เท่าราคาสั้น"
                                    value={form.adult_price_long}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            adult_price_long:
                                                event.target.value,
                                        }))
                                    }
                                    className="bg-white"
                                />
                            </div>
                        </div>

                        <p className="text-xs text-slate-500">
                            ช่องแขนยาว/ขายาวกรอกเฉพาะขั้นตอนที่ค่าแรงต่างจากแบบสั้น
                            เว้นว่างไว้ระบบจะคิดเท่าราคาสั้นให้เอง
                        </p>

                        <p className="text-xs text-slate-500">
                            ระบบจัดเรียงให้อัตโนมัติ
                        </p>

                        {error ? (
                            <p className="text-sm font-medium text-red-600">
                                {error}
                            </p>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsModalOpen(false)}
                        >
                            ยกเลิก
                        </Button>
                        <Button onClick={saveForm}>บันทึก</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

GarmentPricesPage.layout = (props: {
    currentTeam?: { slug: string } | null;
}) => ({
    breadcrumbs: [
        {
            title: 'เคาว์เตอร์',
            href: props.currentTeam ? `/${props.currentTeam.slug}/index` : '/',
        },
        {
            title: 'ข้อมูลพื้นฐาน',
            href: '/settings/data',
        },
        {
            title: 'เซ็ทราคาเด็กและผู้ใหญ่',
            href: '/settings/data/garments/prices',
        },
    ],
});
