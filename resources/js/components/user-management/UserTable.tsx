import { KeyRound, Pencil, Power, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UserListItem } from '@/types/user-management';

type UserTableProps = {
    users: UserListItem[];
    canMutate: (user: UserListItem) => boolean;
    /** Resetting a password is the owner's alone, so it is gated separately. */
    canResetPassword: (user: UserListItem) => boolean;
    onEdit: (user: UserListItem) => void;
    onToggle: (user: UserListItem) => void;
    onResetPassword: (user: UserListItem) => void;
    onDelete: (user: UserListItem) => void;
};

export default function UserTable({
    users,
    canMutate,
    canResetPassword,
    onEdit,
    onToggle,
    onResetPassword,
    onDelete,
}: UserTableProps) {
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                <div className="flex items-center gap-2">
                    <Users className="size-4 text-slate-500" />
                    <p className="text-sm font-semibold text-slate-800">
                        รายการผู้ใช้งาน
                    </p>
                </div>
                <Badge
                    variant="outline"
                    className="border-slate-300 bg-white text-slate-700"
                >
                    {users.length} รายการ
                </Badge>
            </div>

            {users.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
                    <div className="rounded-full bg-slate-100 p-3">
                        <Users className="size-5 text-slate-500" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                        ไม่พบผู้ใช้งานตามเงื่อนไขที่ค้นหา
                    </p>
                    <p className="text-xs text-slate-500">
                        ลองปรับคำค้นหา ตำแหน่งงาน หรือสาขา แล้วค้นหาอีกครั้ง
                    </p>
                </div>
            )}

            <div className="overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                ผู้ใช้งาน
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                รหัสพนักงาน
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                บทบาท
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                สาขา
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">
                                สถานะ
                            </th>
                            <th className="px-4 py-3 text-right font-semibold text-slate-700">
                                การจัดการ
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {users.map((user) => {
                            const editable = canMutate(user);
                            const resettable = canResetPassword(user);
                            const initials = user.full_name
                                .split(' ')
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0]?.toUpperCase() ?? '')
                                .join('');

                            return (
                                <tr
                                    key={user.id}
                                    className="hover:bg-slate-50/70"
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                                                {initials || 'U'}
                                            </div>
                                            <p className="font-medium text-slate-900">
                                                {user.full_name}
                                            </p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                                            {user.employee_code}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        <Badge
                                            variant="outline"
                                            className="border-slate-300 bg-white text-slate-700"
                                        >
                                            {user.role_label}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        <p className="font-medium">
                                            {user.branch_name}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {user.branch_code}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge
                                            className={
                                                user.is_active
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-rose-100 text-rose-700'
                                            }
                                        >
                                            {user.is_active
                                                ? 'Active'
                                                : 'Inactive'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={!editable}
                                                onClick={() => onEdit(user)}
                                                className="gap-1"
                                            >
                                                <Pencil className="size-4" />
                                                แก้ไข
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={!editable}
                                                onClick={() => onToggle(user)}
                                                className="gap-1"
                                            >
                                                <Power className="size-4" />
                                                {user.is_active
                                                    ? 'ปิดใช้งาน'
                                                    : 'เปิดใช้งาน'}
                                            </Button>
                                            {resettable ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() =>
                                                        onResetPassword(user)
                                                    }
                                                    className="gap-1"
                                                >
                                                    <KeyRound className="size-4" />
                                                    รีเซ็ตรหัสผ่าน
                                                </Button>
                                            ) : null}
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="destructive"
                                                disabled={!editable}
                                                onClick={() => onDelete(user)}
                                                className="gap-1"
                                            >
                                                <Trash2 className="size-4" />
                                                ลบ
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
