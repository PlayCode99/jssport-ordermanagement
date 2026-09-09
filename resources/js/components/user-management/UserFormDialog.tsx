import type { InertiaFormProps } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import InputError from '@/components/input-error';
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
import type { UserFormData } from '@/hooks/useUserManagement';
import type {
    BranchOption,
    RoleOption,
    UserAccessRole,
} from '@/types/user-management';

type UserFormDialogProps = {
    open: boolean;
    mode: 'create' | 'edit';
    form: InertiaFormProps<UserFormData>;
    roles: RoleOption[];
    branches: BranchOption[];
    onSubmit: () => void;
    onOpenChange: (open: boolean) => void;
};

export default function UserFormDialog({
    open,
    mode,
    form,
    roles,
    branches,
    onSubmit,
    onOpenChange,
}: UserFormDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'create'
                            ? 'เพิ่มผู้ใช้งาน'
                            : 'แก้ไขผู้ใช้งาน'}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'create'
                            ? 'กรอกข้อมูลผู้ใช้ใหม่ พร้อมสิทธิ์และสาขาที่ต้องการใช้งาน'
                            : 'ปรับปรุงข้อมูลผู้ใช้และสิทธิ์การใช้งานอย่างปลอดภัย'}
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="grid gap-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit();
                    }}
                >
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                        <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                            ข้อมูลพื้นฐาน
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                    ชื่อ-สกุล
                                </label>
                                <Input
                                    value={form.data.full_name}
                                    onChange={(event) =>
                                        form.setData(
                                            'full_name',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="เช่น สมชาย ใจดี"
                                />
                                <InputError message={form.errors.full_name} />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                    รหัสผู้ใช้งาน (Employee Code)
                                </label>
                                <Input
                                    value={form.data.employee_code}
                                    onChange={(event) =>
                                        form.setData(
                                            'employee_code',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="เช่น UAT-OWNER-01 หรือ EMP-0001"
                                />
                                <p className="text-xs text-slate-500">
                                    ใช้รหัสนี้สำหรับอ้างอิงผู้ใช้
                                    และป้องกันข้อมูลซ้ำในระบบ
                                </p>
                                <InputError
                                    message={form.errors.employee_code}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                            สิทธิ์และขอบเขต
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                    ตำแหน่งงาน
                                </label>
                                <Select
                                    value={form.data.role}
                                    onValueChange={(value) =>
                                        form.setData(
                                            'role',
                                            value as UserAccessRole,
                                        )
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="เลือกตำแหน่ง" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roles.map((role) => (
                                            <SelectItem
                                                key={role.value}
                                                value={role.value}
                                            >
                                                {role.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <InputError message={form.errors.role} />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                    สาขา
                                </label>
                                <Select
                                    value={form.data.branch_id}
                                    onValueChange={(value) =>
                                        form.setData('branch_id', value)
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="เลือกสาขา" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {branches.map((branch) => (
                                            <SelectItem
                                                key={branch.id}
                                                value={String(branch.id)}
                                            >
                                                {branch.branch_code} -{' '}
                                                {branch.branch_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <InputError message={form.errors.branch_id} />
                            </div>
                        </div>
                    </div>

                    {mode === 'create' && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                                ความปลอดภัยบัญชี
                            </p>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">
                                        รหัสผ่าน
                                    </label>
                                    <Input
                                        type="password"
                                        value={form.data.password}
                                        onChange={(event) =>
                                            form.setData(
                                                'password',
                                                event.target.value,
                                            )
                                        }
                                        placeholder="อย่างน้อย 8 ตัวอักษร"
                                    />
                                    <InputError
                                        message={form.errors.password}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">
                                        ยืนยันรหัสผ่าน
                                    </label>
                                    <Input
                                        type="password"
                                        value={form.data.password_confirmation}
                                        onChange={(event) =>
                                            form.setData(
                                                'password_confirmation',
                                                event.target.value,
                                            )
                                        }
                                        placeholder="กรอกรหัสผ่านอีกครั้ง"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                                type="checkbox"
                                className="size-4 rounded border-slate-300"
                                checked={form.data.is_active}
                                onChange={(event) =>
                                    form.setData(
                                        'is_active',
                                        event.target.checked,
                                    )
                                }
                            />
                            เปิดใช้งานบัญชีทันทีหลังบันทึก
                        </label>
                        <InputError message={form.errors.is_active} />
                    </div>

                    <DialogFooter className="border-t border-slate-100 pt-2">
                        <Button type="submit" disabled={form.processing}>
                            {form.processing ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="size-4 animate-spin" />
                                    กำลังบันทึก...
                                </span>
                            ) : mode === 'create' ? (
                                'บันทึกผู้ใช้งานใหม่'
                            ) : (
                                'บันทึกการแก้ไข'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
