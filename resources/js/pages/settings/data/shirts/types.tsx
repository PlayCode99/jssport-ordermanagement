import { Head, usePage } from '@inertiajs/react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Auth } from '@/types';

type ShirtTypeRow = {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
};

type PageProps = {
    auth: Auth;
    rows: ShirtTypeRow[];
};

type FormState = {
    code: string;
    name: string;
    display_order: string;
    is_active: boolean;
};

const INITIAL_FORM: FormState = {
    code: '',
    name: '',
    display_order: '0',
    is_active: true,
};

function csrfToken(): string {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
}

export default function ShirtTypesPage() {
    const { rows: initialRows } = usePage<PageProps>().props;
    const [rows, setRows] = useState<ShirtTypeRow[]>(initialRows);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [error, setError] = useState<string | null>(null);

    const filteredRows = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return rows
            .filter((row) => {
                const matchesSearch =
                    normalizedSearch.length === 0 ||
                    row.code.toLowerCase().includes(normalizedSearch) ||
                    row.name.toLowerCase().includes(normalizedSearch);

                const matchesStatus =
                    statusFilter === 'all' ||
                    (statusFilter === 'active' && row.is_active) ||
                    (statusFilter === 'inactive' && !row.is_active);

                return matchesSearch && matchesStatus;
            })
            .sort((a, b) => a.display_order - b.display_order || a.id - b.id);
    }, [rows, searchTerm, statusFilter]);

    const openCreateModal = () => {
        setEditId(null);
        setForm(INITIAL_FORM);
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (row: ShirtTypeRow) => {
        setEditId(row.id);
        setForm({
            code: row.code,
            name: row.name,
            display_order: String(row.display_order),
            is_active: row.is_active,
        });
        setError(null);
        setIsModalOpen(true);
    };

    const saveForm = async () => {
        setError(null);

        const payload = {
            code: form.code.trim().toUpperCase(),
            name: form.name.trim(),
            display_order: Number.parseInt(form.display_order || '0', 10) || 0,
            is_active: form.is_active,
        };

        if (!payload.code || !payload.name) {
            setError('กรุณากรอกรหัสและชื่อประเภทเสื้อ');

            return;
        }

        const isEdit = editId !== null;
        const endpoint = isEdit ? `/settings/data/shirts/types/${editId}` : '/settings/data/shirts/types';
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

        const body = (await response.json().catch(() => null)) as { message?: string; rows?: ShirtTypeRow[] } | null;

        if (!response.ok) {
            setError(body?.message ?? 'บันทึกข้อมูลไม่สำเร็จ');

            return;
        }

        if (Array.isArray(body?.rows)) {
            setRows(body.rows);
        }

        setIsModalOpen(false);
    };

    const toggleActive = async (row: ShirtTypeRow) => {
        const response = await fetch(`/settings/data/shirts/types/${row.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
            },
            body: JSON.stringify({
                code: row.code,
                name: row.name,
                display_order: row.display_order,
                is_active: !row.is_active,
            }),
        });

        const body = (await response.json().catch(() => null)) as { rows?: ShirtTypeRow[] } | null;

        if (response.ok && Array.isArray(body?.rows)) {
            setRows(body.rows);
        }
    };

    const deleteRow = async (row: ShirtTypeRow) => {
        const ok = window.confirm(`ยืนยันการลบประเภทเสื้อ ${row.name} ใช่หรือไม่`);

        if (!ok) {
            return;
        }

        const response = await fetch(`/settings/data/shirts/types/${row.id}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
            },
        });

        const body = (await response.json().catch(() => null)) as { message?: string; rows?: ShirtTypeRow[] } | null;

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
            <Head title="ประเภทเสื้อ" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Shirt Data</p>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">ประเภทเสื้อ</h1>
                            <p className="mt-2 text-sm text-slate-600">ข้อมูลกลางประเภทเสื้อ ใช้ร่วมกันทั้งเด็กและผู้ใหญ่</p>
                        </div>

                        <div className="flex w-full flex-wrap justify-start gap-2 xl:w-auto xl:justify-end">
                            <Button onClick={openCreateModal} className="gap-2">
                                <Plus className="size-4" />
                                เพิ่มประเภทเสื้อ
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">รายการประเภทเสื้อ</h2>
                            <p className="text-sm text-slate-500">ทั้งหมด {filteredRows.length} รายการ</p>
                        </div>

                        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
                            <div className="relative min-w-0 md:w-80">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="ค้นหารหัสหรือชื่อประเภทเสื้อ"
                                    className="bg-white pl-9"
                                />
                            </div>

                            <Select value={statusFilter} onValueChange={(value: 'all' | 'active' | 'inactive') => setStatusFilter(value)}>
                                <SelectTrigger className="w-full bg-white md:w-[180px]">
                                    <SelectValue placeholder="สถานะ" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">ทุกสถานะ</SelectItem>
                                    <SelectItem value="active">เปิดใช้งาน</SelectItem>
                                    <SelectItem value="inactive">ปิดใช้งาน</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="w-[140px] px-4 py-3 text-left font-semibold text-slate-700">รหัส</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">ชื่อประเภทเสื้อ</th>
                                    <th className="w-[120px] px-4 py-3 text-left font-semibold text-slate-700">ลำดับ</th>
                                    <th className="w-[170px] px-4 py-3 text-left font-semibold text-slate-700">สถานะ</th>
                                    <th className="w-[220px] px-4 py-3 text-left font-semibold text-slate-700">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRows.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-5 text-center text-slate-500" colSpan={5}>
                                            ไม่พบข้อมูลประเภทเสื้อที่ตรงกับเงื่อนไข
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-3 align-top text-slate-700">{row.code}</td>
                                            <td className="px-4 py-3 align-top text-slate-800">{row.name}</td>
                                            <td className="px-4 py-3 align-top text-slate-700">{row.display_order}</td>
                                            <td className="px-4 py-3 align-top">
                                                <Button
                                                    variant={row.is_active ? 'default' : 'outline'}
                                                    size="sm"
                                                    onClick={() => toggleActive(row)}
                                                    className="gap-1"
                                                >
                                                    <Power className="size-4" />
                                                    {row.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                                                </Button>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex items-center gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => openEditModal(row)} className="gap-1">
                                                        <Pencil className="size-4" />
                                                        แก้ไข
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => deleteRow(row)}
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
                        <DialogTitle>{editId === null ? 'เพิ่มประเภทเสื้อ' : 'แก้ไขประเภทเสื้อ'}</DialogTitle>
                        <DialogDescription>จัดการข้อมูลประเภทเสื้อ โดยไม่แยกเด็กและผู้ใหญ่ในตารางนี้</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-2">
                            <label htmlFor="shirt-type-code" className="text-sm font-medium text-slate-700">
                                รหัสประเภทเสื้อ
                            </label>
                            <Input
                                id="shirt-type-code"
                                value={form.code}
                                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                                placeholder="เช่น POLO"
                                className="bg-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="shirt-type-name" className="text-sm font-medium text-slate-700">
                                ชื่อประเภทเสื้อ
                            </label>
                            <Input
                                id="shirt-type-name"
                                value={form.name}
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                placeholder="เช่น เสื้อคอโปโล"
                                className="bg-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="shirt-type-order" className="text-sm font-medium text-slate-700">
                                ลำดับการแสดงผล
                            </label>
                            <Input
                                id="shirt-type-order"
                                type="number"
                                min={0}
                                value={form.display_order}
                                onChange={(event) => setForm((prev) => ({ ...prev, display_order: event.target.value }))}
                                className="bg-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">สถานะ</label>
                            <Select
                                value={form.is_active ? 'active' : 'inactive'}
                                onValueChange={(value: 'active' | 'inactive') =>
                                    setForm((prev) => ({ ...prev, is_active: value === 'active' }))
                                }
                            >
                                <SelectTrigger className="bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">เปิดใช้งาน</SelectItem>
                                    <SelectItem value="inactive">ปิดใช้งาน</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                            ยกเลิก
                        </Button>
                        <Button onClick={saveForm}>บันทึก</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

ShirtTypesPage.layout = (props: { currentTeam?: { slug: string } | null }) => ({
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
            title: 'ประเภทเสื้อ',
            href: '/settings/data/shirts/types',
        },
    ],
});
