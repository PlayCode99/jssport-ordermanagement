import { Head } from '@inertiajs/react';
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

type CuttingTeamRow = {
    id: number;
    team_name: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
};

type PageProps = {
    rows: CuttingTeamRow[];
};

type FormState = {
    team_name: string;
    is_active: boolean;
};

const INITIAL_FORM: FormState = {
    team_name: '',
    is_active: true,
};

function csrfToken(): string {
    return (
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ?? ''
    );
}

function formatDate(value: string): string {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return '-';
    }

    return parsed.toLocaleString('th-TH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function CuttingTeamsPage({ rows: initialRows }: PageProps) {
    const [rows, setRows] = useState<CuttingTeamRow[]>(initialRows);
    const [searchTerm, setSearchTerm] = useState('');
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
                    row.team_name.toLowerCase().includes(keyword);

                const matchesStatus =
                    statusFilter === 'all' ||
                    (statusFilter === 'active' && row.is_active) ||
                    (statusFilter === 'inactive' && !row.is_active);

                return matchesSearch && matchesStatus;
            })
            .sort((a, b) => a.id - b.id);
    }, [rows, searchTerm, statusFilter]);

    const openCreateModal = () => {
        setEditId(null);
        setForm(INITIAL_FORM);
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (row: CuttingTeamRow) => {
        setEditId(row.id);
        setForm({
            team_name: row.team_name,
            is_active: row.is_active,
        });
        setError(null);
        setIsModalOpen(true);
    };

    const saveForm = async () => {
        const payload = {
            team_name: form.team_name.trim(),
            is_active: form.is_active,
        };

        if (!payload.team_name) {
            setError('กรุณากรอกชื่อทีม');

            return;
        }

        const endpoint =
            editId === null
                ? '/settings/data/cutting-teams'
                : `/settings/data/cutting-teams/${editId}`;
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
            rows?: CuttingTeamRow[];
        } | null;

        if (!response.ok) {
            setError(body?.message ?? 'บันทึกข้อมูลไม่สำเร็จ');

            return;
        }

        if (Array.isArray(body?.rows)) {
            setRows(body.rows);
        }

        setIsModalOpen(false);
        setForm(INITIAL_FORM);
        setEditId(null);
    };

    const toggleActive = async (row: CuttingTeamRow) => {
        const response = await fetch(`/settings/data/cutting-teams/${row.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
            },
            body: JSON.stringify({
                team_name: row.team_name,
                is_active: !row.is_active,
            }),
        });

        const body = (await response.json().catch(() => null)) as {
            rows?: CuttingTeamRow[];
        } | null;

        if (response.ok && Array.isArray(body?.rows)) {
            setRows(body.rows);
        }
    };

    const deleteRow = async (row: CuttingTeamRow) => {
        const ok = window.confirm(`ยืนยันการลบทีม ${row.team_name} ใช่หรือไม่`);

        if (!ok) {
            return;
        }

        const response = await fetch(`/settings/data/cutting-teams/${row.id}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-TOKEN': csrfToken(),
                Accept: 'application/json',
            },
        });

        const body = (await response.json().catch(() => null)) as {
            message?: string;
            rows?: CuttingTeamRow[];
        } | null;

        if (!response.ok) {
            window.alert(body?.message ?? 'ลบข้อมูลไม่สำเร็จ');

            return;
        }

        if (Array.isArray(body?.rows)) {
            setRows(body.rows);
        }
    };

    return (
        <>
            <Head title="จัดการทีมห้องตัด" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                                Cutting Team Master
                            </p>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                                จัดการทีมห้องตัด
                            </h1>
                            <p className="mt-2 text-sm text-slate-600">
                                กำหนดทีมที่ใช้งานจริงในหน้าแจกงานห้องตัด
                            </p>
                        </div>

                        <Button onClick={openCreateModal} className="gap-2">
                            <Plus className="size-4" />
                            เพิ่มทีมห้องตัด
                        </Button>
                    </div>
                </section>

                <section className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">
                                รายการทีม
                            </h2>
                            <p className="text-sm text-slate-500">
                                ทั้งหมด {filteredRows.length} รายการ
                            </p>
                        </div>

                        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
                            <div className="relative min-w-0 md:w-80">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={(event) =>
                                        setSearchTerm(event.target.value)
                                    }
                                    placeholder="ค้นหาชื่อทีม"
                                    className="bg-white pl-9"
                                />
                            </div>

                            <Select
                                value={statusFilter}
                                onValueChange={(
                                    value: 'all' | 'active' | 'inactive',
                                ) => setStatusFilter(value)}
                            >
                                <SelectTrigger className="w-full bg-white md:w-[180px]">
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
                                    <th className="w-[220px] px-4 py-3 text-left font-semibold text-slate-700">
                                        วันที่สร้าง
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                        ชื่อทีม
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
                                            colSpan={4}
                                        >
                                            ไม่พบข้อมูลทีมตามเงื่อนไข
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="hover:bg-slate-50/60"
                                        >
                                            <td className="px-4 py-3 text-slate-700">
                                                {formatDate(row.created_at)}
                                            </td>
                                            <td className="px-4 py-3 text-slate-800">
                                                {row.team_name}
                                            </td>
                                            <td className="px-4 py-3">
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
                                            <td className="px-4 py-3">
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
                                ? 'เพิ่มทีมห้องตัด'
                                : 'แก้ไขทีมห้องตัด'}
                        </DialogTitle>
                        <DialogDescription>
                            กำหนดชื่อทีมและสถานะการใช้งาน
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3">
                        <div className="space-y-1">
                            <label
                                htmlFor="team_name"
                                className="text-sm font-medium text-slate-700"
                            >
                                ชื่อทีม
                            </label>
                            <Input
                                id="team_name"
                                value={form.team_name}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        team_name: event.target.value,
                                    }))
                                }
                                placeholder="เช่น ทีมเอ"
                            />
                        </div>

                        <div className="space-y-1">
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
                                <SelectTrigger>
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
                            <p className="text-sm text-red-600">{error}</p>
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

CuttingTeamsPage.layout = () => ({
    breadcrumbs: [
        {
            title: 'จัดการทีมห้องตัด',
            href: '/settings/data/cutting-teams',
        },
    ],
});
