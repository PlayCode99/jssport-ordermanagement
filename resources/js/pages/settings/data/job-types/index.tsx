import { Head } from '@inertiajs/react';
import { Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

type JobTypeRow = {
    id: string;
    createdAt: string;
    name: string;
    createdBy?: string;
    active: boolean;
};

const STORAGE_KEY = 'jssport.job-types';

function formatDate(value: string): string {
    return new Date(value).toLocaleString('th-TH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Job types live in catalog_items now, the same as every other master data
 * list, so they are identical on every machine and survive a deploy.
 *
 * This reader exists only to rescue lists left behind in a browser from before
 * that move; the page offers to push them up, then never reads it again.
 */
function loadLegacyLocalRows(): JobTypeRow[] {
    if (typeof window === 'undefined' || !window.localStorage) {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as JobTypeRow[];
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter(
            (item) =>
                item !== null &&
                typeof item === 'object' &&
                typeof item.name === 'string' &&
                item.name.trim() !== '',
        );
    } catch {
        return [];
    }
}

/** Next free catalog item_id — ids must be unique per storage key. */
function nextItemId(rows: JobTypeRow[]): number {
    return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

async function persistRows(rows: JobTypeRow[]): Promise<JobTypeRow[] | null> {
    // Any row still carrying a legacy non-numeric id gets a fresh one rather
    // than a positional fallback, which could collide with an existing row.
    let nextId = nextItemId(rows);
    const numbered = rows.map((row) => {
        const id = Number(row.id);

        return { ...row, id: Number.isInteger(id) && id > 0 ? id : nextId++ };
    });

    const response = await fetch('/settings/data/catalog-items/sync', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            storage_key: STORAGE_KEY,
            rows: numbered.map((row) => ({
                id: row.id,
                createdAt: row.createdAt,
                name: row.name,
                createdBy: row.createdBy ?? 'system',
                active: row.active,
            })),
        }),
    });

    if (!response.ok) {
        return null;
    }

    const payload = (await response.json()) as { rows?: Array<Record<string, unknown>> };

    if (!Array.isArray(payload.rows)) {
        return null;
    }

    return payload.rows.map((row) => ({
        id: String(row.id),
        createdAt: String(row.createdAt),
        name: String(row.name),
        createdBy: typeof row.createdBy === 'string' ? row.createdBy : 'system',
        active: row.active !== false,
    }));
}

export default function JobTypesPage({ rows: serverRows = [] }: { rows?: JobTypeRow[]; storageKey?: string }) {
    const [rows, setRows] = useState<JobTypeRow[]>(() =>
        serverRows.map((row) => ({ ...row, id: String(row.id), active: row.active !== false })),
    );
    // Anything still sitting in this browser from before job types moved server-side.
    const [legacyRows, setLegacyRows] = useState<JobTypeRow[]>([]);
    const [isImporting, setIsImporting] = useState(false);

    useEffect(() => {
        setLegacyRows(loadLegacyLocalRows());
    }, []);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [editId, setEditId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

    const sortedRows = useMemo(
        () => [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [rows],
    );

    const filteredRows = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return sortedRows.filter((row) => {
            const matchesSearch = normalizedSearch.length === 0 || row.name.toLowerCase().includes(normalizedSearch);
            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'active' && row.active) ||
                (statusFilter === 'inactive' && !row.active);

            return matchesSearch && matchesStatus;
        });
    }, [searchTerm, sortedRows, statusFilter]);

    const saveAll = (nextRows: JobTypeRow[]) => {
        setRows(nextRows);

        void persistRows(nextRows).then((saved) => {
            if (saved) {
                setRows(saved);
            }
        });
    };

    const pendingImport = useMemo(() => {
        const known = new Set(rows.map((row) => row.name.trim().toLowerCase()));

        return legacyRows.filter((row) => !known.has(row.name.trim().toLowerCase()));
    }, [legacyRows, rows]);

    const importLegacyRows = async () => {
        if (pendingImport.length === 0) {
            return;
        }

        setIsImporting(true);

        const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
        const merged = [
            ...rows,
            ...pendingImport.map((row, index) => ({
                id: String(nextId + index + 1),
                createdAt: row.createdAt ?? new Date().toISOString(),
                name: row.name.trim(),
                createdBy: 'import',
                active: row.active !== false,
            })),
        ];

        const saved = await persistRows(merged);

        if (saved) {
            setRows(saved);
            setLegacyRows([]);
        }

        setIsImporting(false);
    };

    const hasDuplicateName = (name: string, ignoreId?: string) => {
        const normalized = name.trim().toLowerCase();
        if (!normalized) {
            return false;
        }

        return rows.some((row) => row.id !== ignoreId && row.name.trim().toLowerCase() === normalized);
    };

    const createRow = () => {
        const normalizedName = newName.trim();
        if (!normalizedName) {
            return;
        }

        if (hasDuplicateName(normalizedName)) {
            window.alert('มีประเภทงานนี้อยู่แล้ว');
            return;
        }

        // The id is the catalog's item_id, so it has to be a number the server
        // can key on — a timestamp string used to be fine when this list only
        // ever lived in localStorage.
        const nextRow: JobTypeRow = {
            id: String(nextItemId(rows)),
            createdAt: new Date().toISOString(),
            name: normalizedName,
            createdBy: 'user',
            active: true,
        };

        saveAll([nextRow, ...rows]);
        setNewName('');
        setIsCreateOpen(false);
    };

    const toggleActive = (id: string) => {
        saveAll(rows.map((row) => (row.id === id ? { ...row, active: !row.active } : row)));
    };

    const startEdit = (row: JobTypeRow) => {
        setEditId(row.id);
        setEditValue(row.name);
    };

    const saveEdit = (id: string) => {
        const normalized = editValue.trim();
        if (!normalized) {
            return;
        }

        if (hasDuplicateName(normalized, id)) {
            window.alert('มีประเภทงานนี้อยู่แล้ว');
            return;
        }

        saveAll(rows.map((row) => (row.id === id ? { ...row, name: normalized } : row)));
        setEditId(null);
        setEditValue('');
    };

    const deleteRow = (id: string, name: string) => {
        const ok = window.confirm(`ยืนยันการลบประเภทงาน ${name} ใช่หรือไม่`);
        if (!ok) {
            return;
        }

        saveAll(rows.filter((row) => row.id !== id));
    };

    return (
        <>
            <Head title="ประเภทงาน" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                {pendingImport.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-amber-900">
                                พบประเภทงาน {pendingImport.length} รายการที่บันทึกไว้ในเบราว์เซอร์นี้เท่านั้น
                            </p>
                            <p className="mt-0.5 text-xs text-amber-800">
                                ตอนนี้ประเภทงานถูกเก็บบนเซิร์ฟเวอร์แล้ว เพื่อให้ทุกเครื่องเห็นตรงกัน — กดนำเข้าเพื่อย้ายรายการเหล่านี้ขึ้นไป
                                ({pendingImport.map((row) => row.name).join(', ')})
                            </p>
                        </div>
                        <Button type="button" onClick={() => void importLegacyRows()} disabled={isImporting}>
                            {isImporting ? 'กำลังนำเข้า...' : 'นำเข้าขึ้นเซิร์ฟเวอร์'}
                        </Button>
                    </div>
                ) : null}

                <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Job Type Data</p>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">ประเภทงาน</h1>
                            <p className="mt-2 text-sm text-slate-600">จัดการประเภทงานด้วยรูปแบบเดียวกับฟอร์มข้อมูลหลักในระบบ</p>
                        </div>

                        <div className="flex w-full justify-start xl:w-auto xl:justify-end">
                            <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                                <Plus className="size-4" />
                                เพิ่มประเภทงาน
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">รายการประเภทงาน</h2>
                            <p className="text-sm text-slate-500">ทั้งหมด {filteredRows.length} รายการ</p>
                        </div>

                        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
                            <div className="relative min-w-0 md:w-80">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="ค้นหาประเภทงาน"
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
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">ประเภทงาน</th>
                                    <th className="w-[170px] px-4 py-3 text-left font-semibold text-slate-700">สถานะ</th>
                                    <th className="w-[220px] px-4 py-3 text-left font-semibold text-slate-700">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRows.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-5 text-center text-slate-500" colSpan={4}>
                                            ไม่พบข้อมูลประเภทงานที่ตรงกับเงื่อนไข
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
                                                        onClick={() => deleteRow(row.id, row.name)}
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

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>เพิ่มประเภทงาน</DialogTitle>
                        <DialogDescription>กรอกชื่อประเภทงานที่ต้องการเพิ่ม</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <label htmlFor="job-type-name" className="text-sm font-medium text-slate-700">
                            ชื่อประเภทงาน
                        </label>
                        <Input
                            id="job-type-name"
                            placeholder="เช่น งานปัก"
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    createRow();
                                }
                            }}
                            className="bg-white"
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                            ยกเลิก
                        </Button>
                        <Button onClick={createRow}>บันทึก</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

JobTypesPage.layout = (props: { currentTeam?: { slug: string } | null }) => ({
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
            title: 'ประเภทงาน',
            href: '/settings/data/job-types',
        },
    ],
});
