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
import {
    addShirtMenuItem,
    deleteShirtMenuItem,
    getShirtMenuItems,
    hasDuplicateShirtMenuTitle,
    saveShirtMenuItems,
    toggleShirtMenuItem,
    updateShirtMenuItemTitle,
} from '@/lib/shirt-style-menu-store';
import type { ShirtMenuItem } from '@/lib/shirt-style-menu-store';
import type { Auth } from '@/types';

type PageProps = {
    auth: Auth;
};

function formatDate(value: string): string {
    return new Date(value).toLocaleString('th-TH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function ShirtMenuManagementPage() {
    const { auth } = usePage<PageProps>().props;
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<
        'all' | 'active' | 'inactive'
    >('all');
    const [editId, setEditId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [rows, setRows] = useState<ShirtMenuItem[]>(() =>
        getShirtMenuItems(),
    );

    const sortedRows = useMemo(
        () =>
            [...rows].sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
            ),
        [rows],
    );

    const filteredRows = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return sortedRows.filter((row) => {
            const matchesSearch =
                normalizedSearch.length === 0 ||
                row.title.toLowerCase().includes(normalizedSearch) ||
                row.createdBy.toLowerCase().includes(normalizedSearch);

            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'active' && row.active) ||
                (statusFilter === 'inactive' && !row.active);

            return matchesSearch && matchesStatus;
        });
    }, [searchTerm, sortedRows, statusFilter]);

    const saveRows = (nextRows: ShirtMenuItem[]) => {
        setRows(nextRows);
        saveShirtMenuItems(nextRows);
    };

    const addRow = () => {
        if (hasDuplicateShirtMenuTitle(rows, newName)) {
            window.alert('มีชื่อเมนูนี้อยู่แล้ว');

            return;
        }

        const created = addShirtMenuItem(newName, auth.user.name);

        if (!created) {
            window.alert('ไม่สามารถเพิ่มเมนูได้ กรุณาตรวจสอบชื่อเมนู');

            return;
        }

        const refreshed = getShirtMenuItems();
        setRows(refreshed);
        setNewName('');
        setIsCreateModalOpen(false);
    };

    const toggleActive = (id: string) => {
        saveRows(toggleShirtMenuItem(rows, id));
    };

    const startEdit = (row: ShirtMenuItem) => {
        setEditId(row.id);
        setEditValue(row.title);
    };

    const saveEdit = (id: string) => {
        const nextTitle = editValue.trim();

        if (!nextTitle) {
            return;
        }

        if (hasDuplicateShirtMenuTitle(rows, nextTitle, id)) {
            window.alert('มีชื่อเมนูนี้อยู่แล้ว');

            return;
        }

        saveRows(updateShirtMenuItemTitle(rows, id, nextTitle));
        setEditId(null);
        setEditValue('');
    };

    const deleteRow = (id: string, title: string) => {
        const ok = window.confirm(`ยืนยันการลบเมนู ${title} ใช่หรือไม่`);

        if (!ok) {
            return;
        }

        saveRows(deleteShirtMenuItem(rows, id));
    };

    return (
        <>
            <Head title="แบบเสื้อ" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                                Shirt Data
                            </p>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                                แบบเสื้อ
                            </h1>
                            <p className="mt-2 text-sm text-slate-600">
                                จัดการรายการเมนูย่อยของแบบเสื้อ
                                และกำหนดเปิด-ปิดการใช้งาน
                            </p>
                        </div>

                        <div className="flex w-full flex-wrap justify-start gap-2 xl:w-auto xl:justify-end">
                            <Button asChild variant="outline">
                                <Link href="/settings/data/shirts/types">
                                    ประเภทเสื้อ
                                </Link>
                            </Button>
                            <Button asChild variant="outline">
                                <Link href="/settings/data/shirts/sewing-operations">
                                    จุดเย็บและราคา
                                </Link>
                            </Button>
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="gap-2"
                            >
                                <Plus className="size-4" />
                                เพิ่มข้อมูลแบบเสื้อ
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">
                                รายการเมนูแบบเสื้อ
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
                                    placeholder="ค้นหาชื่อเมนูหรือผู้สร้าง"
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
                                        ชื่อเมนู
                                    </th>
                                    <th className="w-[180px] px-4 py-3 text-left font-semibold text-slate-700">
                                        ผู้สร้าง
                                    </th>
                                    <th className="w-[170px] px-4 py-3 text-left font-semibold text-slate-700">
                                        Active
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
                                            colSpan={5}
                                        >
                                            ไม่พบข้อมูลเมนูแบบเสื้อที่ตรงกับเงื่อนไข
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="hover:bg-slate-50/60"
                                        >
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                {formatDate(row.createdAt)}
                                            </td>
                                            <td className="px-4 py-3 text-slate-800">
                                                {editId === row.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            value={editValue}
                                                            onChange={(event) =>
                                                                setEditValue(
                                                                    event.target
                                                                        .value,
                                                                )
                                                            }
                                                        />
                                                        <Button
                                                            size="sm"
                                                            onClick={() =>
                                                                saveEdit(row.id)
                                                            }
                                                        >
                                                            บันทึก
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    row.title
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-700">
                                                {row.createdBy}
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <Button
                                                    variant={
                                                        row.active
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    size="sm"
                                                    onClick={() =>
                                                        toggleActive(row.id)
                                                    }
                                                    className="gap-1"
                                                >
                                                    <Power className="size-4" />
                                                    {row.active
                                                        ? 'เปิดใช้งาน'
                                                        : 'ปิดใช้งาน'}
                                                </Button>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex items-center gap-2">
                                                    {editId === row.id ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() =>
                                                                setEditId(null)
                                                            }
                                                        >
                                                            ยกเลิก
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() =>
                                                                startEdit(row)
                                                            }
                                                            className="gap-1"
                                                        >
                                                            <Pencil className="size-4" />
                                                            แก้ไข
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() =>
                                                            deleteRow(
                                                                row.id,
                                                                row.title,
                                                            )
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

            <Dialog
                open={isCreateModalOpen}
                onOpenChange={setIsCreateModalOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>เพิ่มข้อมูลแบบเสื้อ</DialogTitle>
                        <DialogDescription>
                            กรอกชื่อเมนูใหม่
                            ระบบจะบันทึกผู้สร้างจากบัญชีที่ล็อกอินอยู่โดยอัตโนมัติ
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <label
                            htmlFor="shirt-menu-name"
                            className="text-sm font-medium text-slate-700"
                        >
                            ชื่อเมนู
                        </label>
                        <Input
                            id="shirt-menu-name"
                            placeholder="เช่น ลายคอจีน"
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    addRow();
                                }
                            }}
                            className="bg-white"
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsCreateModalOpen(false)}
                        >
                            ยกเลิก
                        </Button>
                        <Button onClick={addRow}>บันทึก</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

ShirtMenuManagementPage.layout = (props: {
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
    ],
});
