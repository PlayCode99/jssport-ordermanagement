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

type CatalogRow = {
    id: number;
    createdAt: string;
    name: string;
    createdBy: string;
    active: boolean;
};

type CatalogConfig = {
    title: string;
    routePath: string;
    storageKey: string;
    dataLabel?: string;
    parentTitle?: string;
    parentPath?: string;
    pagePrefix?: string;
};

type PageProps = {
    auth: Auth;
    catalog: CatalogConfig;
    rows: CatalogRow[];
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

export default function ShirtCatalogPage() {
    const { auth, catalog, rows: initialRows } = usePage<PageProps>().props;
    const dataLabel = catalog.dataLabel ?? 'Shirt Data';
    const parentTitle = catalog.parentTitle ?? 'แบบเสื้อ';
    const pagePrefix = catalog.pagePrefix ?? parentTitle;
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [editId, setEditId] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');
    const [rows, setRows] = useState<CatalogRow[]>(initialRows);

    const sortedRows = useMemo(
        () => [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [rows],
    );

    const filteredRows = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return sortedRows.filter((row) => {
            const matchesSearch =
                normalizedSearch.length === 0 ||
                row.name.toLowerCase().includes(normalizedSearch) ||
                row.createdBy.toLowerCase().includes(normalizedSearch);

            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'active' && row.active) ||
                (statusFilter === 'inactive' && !row.active);

            return matchesSearch && matchesStatus;
        });
    }, [searchTerm, sortedRows, statusFilter]);

    const saveRows = async (nextRows: CatalogRow[]) => {
        setRows(nextRows);

        const response = await fetch('/settings/data/catalog-items/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                storage_key: catalog.storageKey,
                rows: nextRows,
            }),
        });

        if (!response.ok) {
            return;
        }

        const payload = (await response.json()) as { rows?: CatalogRow[] };

        if (Array.isArray(payload.rows)) {
            setRows(payload.rows);
        }
    };

    const addRow = async () => {
        const name = newName.trim();

        if (name.length === 0) {
            return;
        }

        const nextRowId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

        const nextRow: CatalogRow = {
            id: nextRowId,
            createdAt: new Date().toISOString(),
            name,
            createdBy: auth.user.name,
            active: true,
        };

        await saveRows([nextRow, ...rows]);
        setNewName('');
        setIsCreateModalOpen(false);
    };

    const toggleActive = async (id: number) => {
        await saveRows(rows.map((row) => (row.id === id ? { ...row, active: !row.active } : row)));
    };

    const startEdit = (row: CatalogRow) => {
        setEditId(row.id);
        setEditValue(row.name);
    };

    const saveEdit = async (id: number) => {
        const name = editValue.trim();

        if (name.length === 0) {
            return;
        }

        await saveRows(rows.map((row) => (row.id === id ? { ...row, name } : row)));
        setEditId(null);
        setEditValue('');
    };

    const deleteRow = async (id: number) => {
        const ok = window.confirm(`ยืนยันการลบ${catalog.title}นี้ใช่หรือไม่`);

        if (!ok) {
            return;
        }

        await saveRows(rows.filter((row) => row.id !== id));
    };

    return (
        <>
            <Head title={`${pagePrefix} - ${catalog.title}`} />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">{dataLabel}</p>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">{pagePrefix}: {catalog.title}</h1>
                            <p className="mt-2 text-sm text-slate-600">เพิ่มและจัดการ{catalog.title} พร้อมบันทึกผู้สร้างจากบัญชีที่กำลังใช้งาน</p>
                        </div>

                        <div className="flex w-full justify-start xl:w-auto xl:justify-end">
                            <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
                                <Plus className="size-4" />
                                เพิ่ม{catalog.title}
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">รายการ{catalog.title}</h2>
                            <p className="text-sm text-slate-500">ทั้งหมด {filteredRows.length} รายการ</p>
                        </div>

                        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
                            <div className="relative min-w-0 md:w-80">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder={`ค้นหาชื่อ${catalog.title}หรือผู้สร้าง`}
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
                                    <th className="w-[220px] px-4 py-3 text-left font-semibold text-slate-700">วันที่สร้าง</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">ชื่อ{catalog.title}</th>
                                    <th className="w-[180px] px-4 py-3 text-left font-semibold text-slate-700">ผู้สร้าง</th>
                                    <th className="w-[170px] px-4 py-3 text-left font-semibold text-slate-700">Active</th>
                                    <th className="w-[220px] px-4 py-3 text-left font-semibold text-slate-700">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRows.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-5 text-center text-slate-500" colSpan={5}>
                                            ไม่พบข้อมูล{catalog.title}ที่ตรงกับเงื่อนไข
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-3 align-top text-slate-700">{formatDate(row.createdAt)}</td>
                                            <td className="px-4 py-3 text-slate-800">
                                                {editId === row.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            value={editValue}
                                                            onChange={(event) => setEditValue(event.target.value)}
                                                        />
                                                        <Button size="sm" onClick={() => saveEdit(row.id)}>
                                                            บันทึก
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    row.name
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top text-slate-700">{row.createdBy}</td>
                                            <td className="px-4 py-3 align-top">
                                                <Button
                                                    variant={row.active ? 'default' : 'outline'}
                                                    size="sm"
                                                    onClick={() => toggleActive(row.id)}
                                                    className="gap-1"
                                                >
                                                    <Power className="size-4" />
                                                    {row.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                                                </Button>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex items-center gap-2">
                                                    {editId === row.id ? (
                                                        <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>
                                                            ยกเลิก
                                                        </Button>
                                                    ) : (
                                                        <Button variant="outline" size="sm" onClick={() => startEdit(row)} className="gap-1">
                                                            <Pencil className="size-4" />
                                                            แก้ไข
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => deleteRow(row.id)}
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

            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>เพิ่มข้อมูล{catalog.title}</DialogTitle>
                        <DialogDescription>กรอกชื่อ{catalog.title}ใหม่ ระบบจะบันทึกผู้สร้างจากบัญชีที่ล็อกอินอยู่โดยอัตโนมัติ</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <label htmlFor="catalog-name" className="text-sm font-medium text-slate-700">
                            ชื่อ{catalog.title}
                        </label>
                        <Input
                            id="catalog-name"
                            placeholder={`เช่น ${catalog.title}ใหม่`}
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
                        <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                            ยกเลิก
                        </Button>
                        <Button onClick={addRow}>บันทึก</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

ShirtCatalogPage.layout = (props: { currentTeam?: { slug: string } | null; catalog: CatalogConfig }) => ({
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
            title: props.catalog.parentTitle ?? 'แบบเสื้อ',
            href: props.catalog.parentPath ?? '/settings/data/shirts',
        },
        {
            title: props.catalog.title,
            href: props.catalog.routePath,
        },
    ],
});