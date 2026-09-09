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
import type { Auth } from '@/types';

type ShirtTypeOption = {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
};

type SewingOperationRow = {
    id: number;
    shirt_type_id: number;
    shirt_type_code: string;
    shirt_type_name: string;
    target_group: 'ADULT' | 'CHILD';
    name: string;
    price: string;
    is_active: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
};

type PageProps = {
    auth: Auth;
    shirtTypes: ShirtTypeOption[];
    rows: SewingOperationRow[];
    selectedShirtTypeId?: number | null;
    selectedShirtTypeName?: string | null;
    selectedTargetGroup?: 'ADULT' | 'CHILD' | null;
};

type FormState = {
    shirt_type_id: string;
    target_group: 'ADULT' | 'CHILD';
    name: string;
    price: string;
    display_order: string;
    is_active: boolean;
};

const INITIAL_FORM: FormState = {
    shirt_type_id: '',
    target_group: 'ADULT',
    name: '',
    price: '0.00',
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

function formatMoney(value: string): string {
    const numberValue = Number.parseFloat(value);

    if (Number.isNaN(numberValue)) {
        return value;
    }

    return numberValue.toFixed(2);
}

export default function SewingOperationsPage() {
    const {
        rows: initialRows,
        shirtTypes,
        selectedShirtTypeId,
        selectedShirtTypeName,
        selectedTargetGroup,
    } = usePage<PageProps>().props;
    const [rows, setRows] = useState<SewingOperationRow[]>(initialRows);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<
        'all' | 'active' | 'inactive'
    >('all');
    const [targetFilter, setTargetFilter] = useState<'all' | 'ADULT' | 'CHILD'>(
        () => {
            if (
                selectedTargetGroup === 'ADULT' ||
                selectedTargetGroup === 'CHILD'
            ) {
                return selectedTargetGroup;
            }

            return 'all';
        },
    );
    const [shirtTypeFilter, setShirtTypeFilter] = useState<'all' | string>(
        () =>
            selectedShirtTypeId && selectedShirtTypeId > 0
                ? String(selectedShirtTypeId)
                : 'all',
    );
    const [error, setError] = useState<string | null>(null);

    const availableShirtTypes = useMemo(
        () =>
            [...shirtTypes].sort(
                (a, b) => a.display_order - b.display_order || a.id - b.id,
            ),
        [shirtTypes],
    );

    const filteredRows = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return rows
            .filter((row) => {
                const matchesSearch =
                    normalizedSearch.length === 0 ||
                    row.name.toLowerCase().includes(normalizedSearch) ||
                    row.shirt_type_code
                        .toLowerCase()
                        .includes(normalizedSearch) ||
                    row.shirt_type_name
                        .toLowerCase()
                        .includes(normalizedSearch);

                const matchesStatus =
                    statusFilter === 'all' ||
                    (statusFilter === 'active' && row.is_active) ||
                    (statusFilter === 'inactive' && !row.is_active);

                const matchesTarget =
                    targetFilter === 'all' || row.target_group === targetFilter;
                const matchesShirtType =
                    shirtTypeFilter === 'all' ||
                    String(row.shirt_type_id) === shirtTypeFilter;

                return (
                    matchesSearch &&
                    matchesStatus &&
                    matchesTarget &&
                    matchesShirtType
                );
            })
            .sort((a, b) => a.display_order - b.display_order || a.id - b.id);
    }, [rows, searchTerm, statusFilter, targetFilter, shirtTypeFilter]);

    const openCreateModal = () => {
        setEditId(null);
        setForm({
            ...INITIAL_FORM,
            shirt_type_id: availableShirtTypes[0]
                ? String(availableShirtTypes[0].id)
                : '',
        });
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (row: SewingOperationRow) => {
        setEditId(row.id);
        setForm({
            shirt_type_id: String(row.shirt_type_id),
            target_group: row.target_group,
            name: row.name,
            price: formatMoney(row.price),
            display_order: String(row.display_order),
            is_active: row.is_active,
        });
        setError(null);
        setIsModalOpen(true);
    };

    const saveForm = async () => {
        setError(null);

        const shirtTypeId = Number.parseInt(form.shirt_type_id, 10);
        const priceNumber = Number.parseFloat(form.price);

        const payload = {
            shirt_type_id: shirtTypeId,
            target_group: form.target_group,
            name: form.name.trim(),
            price: Number.isNaN(priceNumber)
                ? null
                : Number(priceNumber.toFixed(2)),
            display_order: Number.parseInt(form.display_order || '0', 10) || 0,
            is_active: form.is_active,
        };

        if (!Number.isInteger(shirtTypeId) || shirtTypeId <= 0) {
            setError('กรุณาเลือกประเภทเสื้อ');

            return;
        }

        if (!payload.name) {
            setError('กรุณากรอกชื่อจุดเย็บ');

            return;
        }

        if (payload.price === null || payload.price < 0) {
            setError('กรุณากรอกราคาให้ถูกต้อง');

            return;
        }

        const isEdit = editId !== null;
        const endpoint = isEdit
            ? `/settings/data/shirts/sewing-operations/${editId}`
            : '/settings/data/shirts/sewing-operations';
        const method = isEdit ? 'PUT' : 'POST';

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
            rows?: SewingOperationRow[];
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

    const toggleActive = async (row: SewingOperationRow) => {
        const response = await fetch(
            `/settings/data/shirts/sewing-operations/${row.id}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    shirt_type_id: row.shirt_type_id,
                    target_group: row.target_group,
                    name: row.name,
                    price: Number.parseFloat(row.price),
                    display_order: row.display_order,
                    is_active: !row.is_active,
                }),
            },
        );

        const body = (await response.json().catch(() => null)) as {
            rows?: SewingOperationRow[];
        } | null;

        if (response.ok && Array.isArray(body?.rows)) {
            setRows(body.rows);
        }
    };

    const deleteRow = async (row: SewingOperationRow) => {
        const ok = window.confirm(`ยืนยันการลบจุดเย็บ ${row.name} ใช่หรือไม่`);

        if (!ok) {
            return;
        }

        const response = await fetch(
            `/settings/data/shirts/sewing-operations/${row.id}`,
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
            rows?: SewingOperationRow[];
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
            <Head title="จุดเย็บและราคา" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                                Shirt Data
                            </p>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                                จุดเย็บและราคา
                            </h1>
                            <p className="mt-2 text-sm text-slate-600">
                                แยกราคาค่าแรงตามประเภทเสื้อและกลุ่มเป้าหมาย
                                ADULT/CHILD
                            </p>
                            {selectedShirtTypeName ? (
                                <p className="mt-2 text-sm font-medium text-emerald-700">
                                    กำลังแสดงข้อมูลของ: {selectedShirtTypeName}
                                </p>
                            ) : null}
                            {selectedTargetGroup ? (
                                <p className="mt-1 text-sm font-medium text-blue-700">
                                    กลุ่มที่เลือก: {selectedTargetGroup}
                                </p>
                            ) : null}
                        </div>

                        <div className="flex w-full flex-wrap justify-start gap-2 xl:w-auto xl:justify-end">
                            <Button asChild variant="outline">
                                <Link href="/settings/data/shirts/types">
                                    ไปที่ประเภทเสื้อ
                                </Link>
                            </Button>
                            <Button
                                onClick={openCreateModal}
                                className="gap-2"
                                disabled={availableShirtTypes.length === 0}
                            >
                                <Plus className="size-4" />
                                เพิ่มจุดเย็บ
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

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="relative min-w-0">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={(event) =>
                                        setSearchTerm(event.target.value)
                                    }
                                    placeholder="ค้นหาจุดเย็บ/ประเภทเสื้อ"
                                    className="bg-white pl-9"
                                />
                            </div>

                            <Select
                                value={statusFilter}
                                onValueChange={(
                                    value: 'all' | 'active' | 'inactive',
                                ) => setStatusFilter(value)}
                            >
                                <SelectTrigger className="w-full bg-white">
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

                            <Select
                                value={targetFilter}
                                onValueChange={(
                                    value: 'all' | 'ADULT' | 'CHILD',
                                ) => setTargetFilter(value)}
                            >
                                <SelectTrigger className="w-full bg-white">
                                    <SelectValue placeholder="กลุ่มเป้าหมาย" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        ทุกกลุ่ม
                                    </SelectItem>
                                    <SelectItem value="ADULT">ADULT</SelectItem>
                                    <SelectItem value="CHILD">CHILD</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select
                                value={shirtTypeFilter}
                                onValueChange={(value: 'all' | string) =>
                                    setShirtTypeFilter(value)
                                }
                            >
                                <SelectTrigger className="w-full bg-white">
                                    <SelectValue placeholder="ประเภทเสื้อ" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        ทุกประเภทเสื้อ
                                    </SelectItem>
                                    {availableShirtTypes.map((type) => (
                                        <SelectItem
                                            key={type.id}
                                            value={String(type.id)}
                                        >
                                            {type.code} - {type.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="w-[210px] px-4 py-3 text-left font-semibold text-slate-700">
                                        ประเภทเสื้อ
                                    </th>
                                    <th className="w-[120px] px-4 py-3 text-left font-semibold text-slate-700">
                                        กลุ่ม
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                        จุดเย็บ
                                    </th>
                                    <th className="w-[120px] px-4 py-3 text-left font-semibold text-slate-700">
                                        ราคา
                                    </th>
                                    <th className="w-[90px] px-4 py-3 text-left font-semibold text-slate-700">
                                        ลำดับ
                                    </th>
                                    <th className="w-[170px] px-4 py-3 text-left font-semibold text-slate-700">
                                        สถานะ
                                    </th>
                                    <th className="w-[220px] px-4 py-3 text-left font-semibold text-slate-700">
                                        จัดการ
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRows.length === 0 ? (
                                    <tr>
                                        <td
                                            className="px-4 py-5 text-center text-slate-500"
                                            colSpan={7}
                                        >
                                            ไม่พบข้อมูลจุดเย็บที่ตรงกับเงื่อนไข
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="hover:bg-slate-50/60"
                                        >
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                <div className="font-medium text-slate-900">
                                                    {row.shirt_type_code}
                                                </div>
                                                <div className="text-slate-600">
                                                    {row.shirt_type_name}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                {row.target_group}
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-800">
                                                {row.name}
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                {formatMoney(row.price)}
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                {row.display_order}
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
                            {editId === null ? 'เพิ่มจุดเย็บ' : 'แก้ไขจุดเย็บ'}
                        </DialogTitle>
                        <DialogDescription>
                            ตารางนี้แยกข้อมูลและราคาเป็น ADULT/CHILD
                            โดยไม่ใช้การอัปโหลดรูป
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                ประเภทเสื้อ
                            </label>
                            <Select
                                value={form.shirt_type_id}
                                onValueChange={(value: string) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        shirt_type_id: value,
                                    }))
                                }
                            >
                                <SelectTrigger className="bg-white">
                                    <SelectValue placeholder="เลือกประเภทเสื้อ" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableShirtTypes.map((type) => (
                                        <SelectItem
                                            key={type.id}
                                            value={String(type.id)}
                                        >
                                            {type.code} - {type.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                กลุ่มเป้าหมาย
                            </label>
                            <Select
                                value={form.target_group}
                                onValueChange={(value: 'ADULT' | 'CHILD') =>
                                    setForm((prev) => ({
                                        ...prev,
                                        target_group: value,
                                    }))
                                }
                            >
                                <SelectTrigger className="bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ADULT">ADULT</SelectItem>
                                    <SelectItem value="CHILD">CHILD</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label
                                htmlFor="operation-name"
                                className="text-sm font-medium text-slate-700"
                            >
                                ชื่อจุดเย็บ
                            </label>
                            <Input
                                id="operation-name"
                                value={form.name}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        name: event.target.value,
                                    }))
                                }
                                placeholder="เช่น เจาะโปโล"
                                className="bg-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <label
                                htmlFor="operation-price"
                                className="text-sm font-medium text-slate-700"
                            >
                                ราคา
                            </label>
                            <Input
                                id="operation-price"
                                type="number"
                                min={0}
                                step="0.01"
                                value={form.price}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        price: event.target.value,
                                    }))
                                }
                                className="bg-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <label
                                htmlFor="operation-order"
                                className="text-sm font-medium text-slate-700"
                            >
                                ลำดับการแสดงผล
                            </label>
                            <Input
                                id="operation-order"
                                type="number"
                                min={0}
                                value={form.display_order}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        display_order: event.target.value,
                                    }))
                                }
                                className="bg-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                สถานะ
                            </label>
                            <Select
                                value={form.is_active ? 'active' : 'inactive'}
                                onValueChange={(value: 'active' | 'inactive') =>
                                    setForm((prev) => ({
                                        ...prev,
                                        is_active: value === 'active',
                                    }))
                                }
                            >
                                <SelectTrigger className="bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">
                                        เปิดใช้งาน
                                    </SelectItem>
                                    <SelectItem value="inactive">
                                        ปิดใช้งาน
                                    </SelectItem>
                                </SelectContent>
                            </Select>
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

SewingOperationsPage.layout = (props: {
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
            title: 'แบบเสื้อ',
            href: '/settings/data/shirts',
        },
        {
            title: 'จุดเย็บและราคา',
            href: '/settings/data/shirts/sewing-operations',
        },
    ],
});
