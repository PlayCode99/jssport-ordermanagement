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

type GarmentTypeRow = {
    id: number;
    category: GarmentCategory;
    code: string;
    name: string;
    is_active: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
};

type PageProps = {
    rows: GarmentTypeRow[];
    selectedCategory?: GarmentCategory | null;
};

type FormState = {
    category: GarmentCategory;
    code: string;
    name: string;
    display_order: string;
    is_active: boolean;
};

const INITIAL_FORM: FormState = {
    category: 'SHIRT',
    code: '',
    name: '',
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

function generateCode(category: GarmentCategory, name: string): string {
    const normalized = name
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '')
        .slice(0, 20);

    const prefix = category === 'SHIRT' ? 'SH' : 'PT';
    const fallback = String(Date.now()).slice(-6);

    return `${prefix}-${normalized || fallback}`;
}

export default function GarmentTypesPage() {
    const { rows: initialRows, selectedCategory } = usePage<PageProps>().props;
    const [rows, setRows] = useState<GarmentTypeRow[]>(initialRows);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<
        'all' | GarmentCategory
    >(selectedCategory ?? 'all');
    const [statusFilter, setStatusFilter] = useState<
        'all' | 'active' | 'inactive'
    >('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [error, setError] = useState<string | null>(null);

    const filteredRows = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();

        return rows
            .filter((row) => {
                const matchesSearch =
                    keyword.length === 0 ||
                    row.name.toLowerCase().includes(keyword);
                const matchesCategory =
                    categoryFilter === 'all' || row.category === categoryFilter;
                const matchesStatus =
                    statusFilter === 'all' ||
                    (statusFilter === 'active' && row.is_active) ||
                    (statusFilter === 'inactive' && !row.is_active);

                return matchesSearch && matchesCategory && matchesStatus;
            })
            .sort(
                (a, b) =>
                    a.category.localeCompare(b.category) ||
                    a.display_order - b.display_order ||
                    a.id - b.id,
            );
    }, [rows, searchTerm, categoryFilter, statusFilter]);

    const openCreateModal = () => {
        setEditId(null);
        setForm(INITIAL_FORM);
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (row: GarmentTypeRow) => {
        setEditId(row.id);
        setForm({
            category: row.category,
            code: row.code,
            name: row.name,
            display_order: String(row.display_order),
            is_active: row.is_active,
        });
        setError(null);
        setIsModalOpen(true);
    };

    const saveForm = async () => {
        const resolvedCode =
            form.code.trim().length > 0
                ? form.code.trim().toUpperCase()
                : generateCode(form.category, form.name);

        const payload = {
            category: form.category,
            code: resolvedCode,
            name: form.name.trim(),
            display_order: Number.parseInt(form.display_order || '0', 10) || 0,
            is_active: form.is_active,
        };

        if (!payload.name) {
            setError('กรุณากรอกประเภท และชื่อ');

            return;
        }

        const endpoint =
            editId === null
                ? '/settings/data/garments/types'
                : `/settings/data/garments/types/${editId}`;
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
            rows?: GarmentTypeRow[];
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

    const toggleActive = async (row: GarmentTypeRow) => {
        const response = await fetch(
            `/settings/data/garments/types/${row.id}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    category: row.category,
                    code: row.code,
                    name: row.name,
                    display_order: row.display_order,
                    is_active: !row.is_active,
                }),
            },
        );

        const body = (await response.json().catch(() => null)) as {
            rows?: GarmentTypeRow[];
        } | null;

        if (response.ok && Array.isArray(body?.rows)) {
            setRows(body.rows);
        }
    };

    const deleteRow = async (row: GarmentTypeRow) => {
        const ok = window.confirm(`ยืนยันการลบ ${row.name} ใช่หรือไม่`);

        if (!ok) {
            return;
        }

        const response = await fetch(
            `/settings/data/garments/types/${row.id}`,
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
            rows?: GarmentTypeRow[];
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
            <Head title="ประเภทเสื้อและกางเกง" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                                Garment Pricing
                            </p>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                                แยกประเภทเสื้อและกางเกง
                            </h1>
                            <p className="mt-2 text-sm text-slate-600">
                                สร้างประเภทงาน เช่น เสื้อโปโล หรือกางเกงขาสั้น
                                แล้วเข้าไปตั้งราคาเด็ก/ผู้ใหญ่
                            </p>
                        </div>

                        <div className="flex w-full flex-wrap justify-start gap-2 xl:w-auto xl:justify-end">
                            <Button asChild variant="outline">
                                <Link href="/settings/data/garments/prices">
                                    ไปหน้าเซ็ทราคา
                                </Link>
                            </Button>
                            <Button onClick={openCreateModal} className="gap-2">
                                <Plus className="size-4" />
                                เพิ่มประเภท
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:px-5">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">
                                รายการประเภท
                            </h2>
                            <p className="text-sm text-slate-500">
                                ทั้งหมด {filteredRows.length} รายการ
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="relative min-w-0">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={(event) =>
                                        setSearchTerm(event.target.value)
                                    }
                                    placeholder="ค้นหาชื่อประเภท"
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
                                    <th className="w-[120px] px-4 py-3 text-left font-semibold text-slate-700">
                                        กลุ่ม
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                        ชื่อประเภท
                                    </th>
                                    <th className="w-[150px] px-4 py-3 text-left font-semibold text-slate-700">
                                        สถานะ
                                    </th>
                                    <th className="w-[380px] px-4 py-3 text-left font-semibold text-slate-700">
                                        จัดการ
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRows.length === 0 ? (
                                    <tr>
                                        <td
                                            className="px-4 py-5 text-center text-slate-500"
                                            colSpan={5}
                                        >
                                            ไม่พบข้อมูลที่ตรงกับเงื่อนไข
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="hover:bg-slate-50/60"
                                        >
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                {row.category === 'SHIRT'
                                                    ? 'เสื้อ'
                                                    : 'กางเกง'}
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-800">
                                                {row.name}
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
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                        asChild
                                                        variant="secondary"
                                                        size="sm"
                                                    >
                                                        <Link
                                                            href={`/settings/data/garments/prices?garment_type_id=${row.id}&category=${row.category}`}
                                                        >
                                                            เซ็ทราคา
                                                        </Link>
                                                    </Button>
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
                            {editId === null ? 'เพิ่มประเภท' : 'แก้ไขประเภท'}
                        </DialogTitle>
                        <DialogDescription>
                            กำหนดว่าเป็นเสื้อหรือกางเกง
                            จากนั้นค่อยเพิ่มรายการราคา
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                ประเภทสินค้า
                            </label>
                            <Select
                                value={form.category}
                                onValueChange={(value: GarmentCategory) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        category: value,
                                    }))
                                }
                            >
                                <SelectTrigger className="bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="SHIRT">เสื้อ</SelectItem>
                                    <SelectItem value="PANTS">
                                        กางเกง
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                ชื่อประเภท
                            </label>
                            <Input
                                value={form.name}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        name: event.target.value,
                                    }))
                                }
                                placeholder="เช่น เสื้อโปโล"
                                className="bg-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs text-slate-500">
                                ระบบจะจัดลำดับให้อัตโนมัติ
                                คุณแก้ได้ภายหลังถ้าจำเป็น
                            </p>
                        </div>

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

GarmentTypesPage.layout = (props: {
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
            title: 'ประเภทเสื้อและกางเกง',
            href: '/settings/data/garments/types',
        },
    ],
});
