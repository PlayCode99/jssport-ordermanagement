import { Head, router, useForm } from '@inertiajs/react';
import { Building2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
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

type BranchRow = {
    id: number;
    branch_code: string;
    branch_name: string;
    phone: string;
    address: string;
};

type BranchFormData = {
    branch_code: string;
    branch_name: string;
    phone: string;
    address: string;
};

type Props = {
    branches: BranchRow[];
};

const EMPTY_FORM: BranchFormData = {
    branch_code: '',
    branch_name: '',
    phone: '',
    address: '',
};

export default function BranchesPage({ branches }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingBranchId, setEditingBranchId] = useState<number | null>(null);

    const createForm = useForm<BranchFormData>(EMPTY_FORM);
    const editForm = useForm<BranchFormData>(EMPTY_FORM);

    const filteredRows = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();

        if (q === '') {
            return branches;
        }

        return branches.filter((branch) => {
            return (
                branch.branch_code.toLowerCase().includes(q) ||
                branch.branch_name.toLowerCase().includes(q) ||
                branch.phone.toLowerCase().includes(q) ||
                branch.address.toLowerCase().includes(q)
            );
        });
    }, [branches, searchTerm]);

    const openCreate = () => {
        createForm.reset();
        createForm.clearErrors();
        setIsCreateOpen(true);
    };

    const openEdit = (branch: BranchRow) => {
        setEditingBranchId(branch.id);
        editForm.setData({
            branch_code: branch.branch_code,
            branch_name: branch.branch_name,
            phone: branch.phone,
            address: branch.address,
        });
        editForm.clearErrors();
        setIsEditOpen(true);
    };

    const submitCreate = () => {
        createForm.post('/settings/data/branches', {
            preserveScroll: true,
            onSuccess: () => {
                setIsCreateOpen(false);
                createForm.reset();
            },
        });
    };

    const submitEdit = () => {
        if (editingBranchId === null) {
            return;
        }

        editForm.put(`/settings/data/branches/${editingBranchId}`, {
            preserveScroll: true,
            onSuccess: () => {
                setIsEditOpen(false);
                setEditingBranchId(null);
                editForm.reset();
            },
        });
    };

    const deleteBranch = (branch: BranchRow) => {
        const ok = window.confirm(
            `ยืนยันการลบสาขา ${branch.branch_code} - ${branch.branch_name} ใช่หรือไม่`,
        );

        if (!ok) {
            return;
        }

        router.delete(`/settings/data/branches/${branch.id}`, {
            preserveScroll: true,
        });
    };

    return (
        <>
            <Head title="ข้อมูลสาขา" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                                <Building2 className="size-3.5" />
                                Branch Management
                            </div>
                            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                                ข้อมูลสาขา
                            </h1>
                            <p className="mt-2 text-sm text-slate-600">
                                ข้อมูลสาขาที่บันทึกในหน้านี้จะถูกใช้จริงในระบบ
                                เช่น ดรอปดาวน์หน้าเพิ่มผู้ใช้งาน
                            </p>
                        </div>

                        <Button onClick={openCreate} className="gap-2">
                            <Plus className="size-4" />
                            เพิ่มสาขา
                        </Button>
                    </div>
                </section>

                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-800">
                                รายการสาขา
                            </p>
                            <Badge
                                variant="outline"
                                className="bg-white text-slate-700"
                            >
                                {filteredRows.length} รายการ
                            </Badge>
                        </div>

                        <div className="relative w-full md:w-96">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={searchTerm}
                                onChange={(event) =>
                                    setSearchTerm(event.target.value)
                                }
                                placeholder="ค้นหารหัสสาขา ชื่อสาขา เบอร์โทร หรือที่อยู่"
                                className="pl-9"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                        รหัสสาขา
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                        ชื่อสาขา
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                        เบอร์โทร
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                        ที่อยู่
                                    </th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                                        การจัดการ
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {filteredRows.map((branch) => (
                                    <tr
                                        key={branch.id}
                                        className="hover:bg-slate-50/70"
                                    >
                                        <td className="px-4 py-3">
                                            <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                                                {branch.branch_code}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-slate-900">
                                            {branch.branch_name}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            {branch.phone || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            {branch.address || '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="gap-1"
                                                    onClick={() =>
                                                        openEdit(branch)
                                                    }
                                                >
                                                    <Pencil className="size-4" />
                                                    แก้ไข
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="destructive"
                                                    className="gap-1"
                                                    onClick={() =>
                                                        deleteBranch(branch)
                                                    }
                                                >
                                                    <Trash2 className="size-4" />
                                                    ลบ
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>เพิ่มสาขา</DialogTitle>
                        <DialogDescription>
                            เพิ่มข้อมูลสาขาใหม่เข้าสู่ฐานข้อมูลจริงของระบบ
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        className="grid gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            submitCreate();
                        }}
                    >
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                    รหัสสาขา
                                </label>
                                <Input
                                    value={createForm.data.branch_code}
                                    onChange={(event) =>
                                        createForm.setData(
                                            'branch_code',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="เช่น 01, BR-002"
                                />
                                <InputError
                                    message={createForm.errors.branch_code}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                    ชื่อสาขา
                                </label>
                                <Input
                                    value={createForm.data.branch_name}
                                    onChange={(event) =>
                                        createForm.setData(
                                            'branch_name',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="เช่น หนองบัวลำภู"
                                />
                                <InputError
                                    message={createForm.errors.branch_name}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">
                                เบอร์โทร
                            </label>
                            <Input
                                value={createForm.data.phone}
                                onChange={(event) =>
                                    createForm.setData(
                                        'phone',
                                        event.target.value,
                                    )
                                }
                                placeholder="เช่น 081-234-5678"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">
                                ที่อยู่
                            </label>
                            <Input
                                value={createForm.data.address}
                                onChange={(event) =>
                                    createForm.setData(
                                        'address',
                                        event.target.value,
                                    )
                                }
                                placeholder="ที่อยู่สาขา"
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="submit"
                                disabled={createForm.processing}
                            >
                                บันทึกสาขา
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>แก้ไขข้อมูลสาขา</DialogTitle>
                        <DialogDescription>
                            อัปเดตข้อมูลสาขาในฐานข้อมูลจริงของระบบ
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        className="grid gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            submitEdit();
                        }}
                    >
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                    รหัสสาขา
                                </label>
                                <Input
                                    value={editForm.data.branch_code}
                                    onChange={(event) =>
                                        editForm.setData(
                                            'branch_code',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="เช่น 01, BR-002"
                                />
                                <InputError
                                    message={editForm.errors.branch_code}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                    ชื่อสาขา
                                </label>
                                <Input
                                    value={editForm.data.branch_name}
                                    onChange={(event) =>
                                        editForm.setData(
                                            'branch_name',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="เช่น หนองบัวลำภู"
                                />
                                <InputError
                                    message={editForm.errors.branch_name}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">
                                เบอร์โทร
                            </label>
                            <Input
                                value={editForm.data.phone}
                                onChange={(event) =>
                                    editForm.setData(
                                        'phone',
                                        event.target.value,
                                    )
                                }
                                placeholder="เช่น 081-234-5678"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">
                                ที่อยู่
                            </label>
                            <Input
                                value={editForm.data.address}
                                onChange={(event) =>
                                    editForm.setData(
                                        'address',
                                        event.target.value,
                                    )
                                }
                                placeholder="ที่อยู่สาขา"
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="submit"
                                disabled={editForm.processing}
                            >
                                บันทึกการแก้ไข
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
