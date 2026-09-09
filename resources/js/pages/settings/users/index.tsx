import { Head, router } from '@inertiajs/react';
import {
    Building2,
    Filter,
    Plus,
    Search,
    ShieldCheck,
    UserCheck,
    Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import ResetPasswordDialog from '@/components/user-management/ResetPasswordDialog';
import UserFormDialog from '@/components/user-management/UserFormDialog';
import UserTable from '@/components/user-management/UserTable';
import { useUserManagement } from '@/hooks/useUserManagement';
import {
    canAccessBranch,
    canAccessMenu,
    USER_MENUS,
} from '@/lib/permissionHelpers';
import { USER_ACCESS_ROLES } from '@/types/user-management';
import type {
    UserAccessRole,
    UserListItem,
    UserManagementPageProps,
} from '@/types/user-management';

type Props = UserManagementPageProps;

function targetMenuFromRole(role: UserAccessRole): string {
    const map: Record<UserAccessRole, string> = {
        COUNTER: USER_MENUS.COUNTER,
        CUTTING_STAFF: USER_MENUS.CUTTING,
        PRINTING_STAFF: USER_MENUS.PRINTING,
        PRESS_STAFF: USER_MENUS.PRESSING,
        EMBROIDERY_STAFF: USER_MENUS.EMBROIDERY,
        SEWING_STAFF: USER_MENUS.SEWING,
        SCREEN_FLEX_STAFF: USER_MENUS.SCREEN_FLEX,
        QC_STAFF: USER_MENUS.QC,
        DELIVERY_STAFF: USER_MENUS.DELIVERY,
        ADMIN_PRODUCTION: USER_MENUS.CUTTING,
        ADMIN_SYSTEM: USER_MENUS.COUNTER,
        OWNER: USER_MENUS.DASHBOARD,
    };

    return map[role];
}

export default function UserManagementPage({
    auth,
    users,
    branches,
    roles,
    filters,
}: Props) {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);

    const {
        createForm,
        editForm,
        openCreate,
        submitCreate,
        openEdit,
        closeEdit,
        submitEdit,
        toggleActive,
        deleteUser,
        resettingUser,
        resetPasswordForm,
        openResetPassword,
        closeResetPassword,
        submitResetPassword,
    } = useUserManagement();

    const canManageUsers =
        auth.user.access_role === USER_ACCESS_ROLES.OWNER ||
        auth.user.access_role === USER_ACCESS_ROLES.ADMIN_SYSTEM;
    const isOwner = auth.user.access_role === USER_ACCESS_ROLES.OWNER;

    const visibleUsers = useMemo(() => {
        return users.data.filter((user) =>
            canAccessBranch(auth.user.branch_code, user.branch_code),
        );
    }, [auth.user.branch_code, users.data]);

    const activeCount = useMemo(
        () => visibleUsers.filter((user) => user.is_active).length,
        [visibleUsers],
    );
    const inactiveCount = visibleUsers.length - activeCount;

    const canMutateUser = (target: UserListItem): boolean => {
        if (!canManageUsers) {
            return false;
        }

        if (target.id === Number(auth.user.id)) {
            return false;
        }

        if (!canAccessBranch(auth.user.branch_code, target.branch_code)) {
            return false;
        }

        return canAccessMenu(
            auth.user.access_role,
            targetMenuFromRole(target.role),
        );
    };

    const applyFilters = (patch: Record<string, string>) => {
        router.get(
            '/settings/users',
            {
                ...filters,
                ...patch,
            },
            {
                preserveScroll: true,
                preserveState: true,
                replace: true,
            },
        );
    };

    const openCreateDialogWithLatestBranches = () => {
        openCreate();
        setIsCreateOpen(true);

        router.reload({
            only: ['branches'],
            preserveScroll: true,
        });
    };

    const openEditDialogWithLatestBranches = (user: UserListItem) => {
        router.reload({
            only: ['branches'],
            preserveScroll: true,
            onSuccess: () => {
                openEdit(user);
                setIsEditOpen(true);
            },
        });
    };

    return (
        <>
            <Head title="User Management" />

            <div className="flex h-full flex-1 flex-col gap-5 p-4 md:gap-6 md:p-6">
                <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-amber-50 p-5 shadow-sm md:p-6">
                    <div className="pointer-events-none absolute -top-14 -right-14 size-52 rounded-full bg-amber-200/30 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-16 left-10 size-44 rounded-full bg-sky-200/30 blur-3xl" />

                    <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <Badge className="bg-slate-900 text-white">
                                Administration
                            </Badge>
                            <h1 className="mt-3 text-2xl font-semibold text-slate-900 md:text-3xl">
                                จัดการผู้ใช้งาน
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm text-slate-600">
                                จัดการสิทธิ์ผู้ใช้แบบปลอดภัย แยกตามสาขา
                                พร้อมติดตามสถานะการใช้งานในหน้าจอเดียว
                            </p>
                        </div>

                        <Button
                            type="button"
                            className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
                            onClick={openCreateDialogWithLatestBranches}
                            disabled={!canManageUsers}
                        >
                            <Plus className="size-4" />
                            เพิ่มผู้ใช้งาน
                        </Button>
                    </div>

                    <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <Card className="py-0">
                            <CardContent className="flex items-center justify-between px-4 py-4">
                                <div>
                                    <p className="text-xs font-medium text-slate-500">
                                        ผู้ใช้ในผลลัพธ์
                                    </p>
                                    <p className="mt-1 text-xl font-semibold text-slate-900">
                                        {visibleUsers.length}
                                    </p>
                                </div>
                                <Users className="size-5 text-slate-500" />
                            </CardContent>
                        </Card>
                        <Card className="py-0">
                            <CardContent className="flex items-center justify-between px-4 py-4">
                                <div>
                                    <p className="text-xs font-medium text-slate-500">
                                        Active
                                    </p>
                                    <p className="mt-1 text-xl font-semibold text-emerald-700">
                                        {activeCount}
                                    </p>
                                </div>
                                <UserCheck className="size-5 text-emerald-600" />
                            </CardContent>
                        </Card>
                        <Card className="py-0">
                            <CardContent className="flex items-center justify-between px-4 py-4">
                                <div>
                                    <p className="text-xs font-medium text-slate-500">
                                        Inactive
                                    </p>
                                    <p className="mt-1 text-xl font-semibold text-rose-700">
                                        {inactiveCount}
                                    </p>
                                </div>
                                <ShieldCheck className="size-5 text-rose-600" />
                            </CardContent>
                        </Card>
                        <Card className="py-0">
                            <CardContent className="flex items-center justify-between px-4 py-4">
                                <div>
                                    <p className="text-xs font-medium text-slate-500">
                                        จำนวนสาขาในระบบ
                                    </p>
                                    <p className="mt-1 text-xl font-semibold text-slate-900">
                                        {branches.length}
                                    </p>
                                </div>
                                <Building2 className="size-5 text-slate-500" />
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-700">
                            <Filter className="size-4" />
                            <p className="text-sm font-semibold">
                                ตัวกรองข้อมูล
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-slate-600"
                            onClick={() =>
                                applyFilters({
                                    search: '',
                                    role: '',
                                    status: '',
                                    branch_id: '',
                                    page: '1',
                                })
                            }
                        >
                            ล้างตัวกรอง
                        </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="relative xl:col-span-2">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={filters.search}
                                onChange={(event) =>
                                    applyFilters({
                                        search: event.target.value,
                                        page: '1',
                                    })
                                }
                                className="h-10 pl-9"
                                placeholder="ค้นหาชื่อ หรือรหัสผู้ใช้งาน"
                            />
                        </div>

                        <Select
                            value={filters.role || '__all__'}
                            onValueChange={(value) =>
                                applyFilters({
                                    role: value === '__all__' ? '' : value,
                                    page: '1',
                                })
                            }
                        >
                            <SelectTrigger className="h-10">
                                <SelectValue placeholder="ทุกตำแหน่ง" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">
                                    ทุกตำแหน่ง
                                </SelectItem>
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

                        <Select
                            value={filters.status || '__all__'}
                            onValueChange={(value) =>
                                applyFilters({
                                    status: value === '__all__' ? '' : value,
                                    page: '1',
                                })
                            }
                        >
                            <SelectTrigger className="h-10">
                                <SelectValue placeholder="ทุกสถานะ" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">
                                    ทุกสถานะ
                                </SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">
                                    Inactive
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Select
                            value={filters.branch_id || '__all__'}
                            onValueChange={(value) =>
                                applyFilters({
                                    branch_id: value === '__all__' ? '' : value,
                                    page: '1',
                                })
                            }
                        >
                            <SelectTrigger className="h-10">
                                <SelectValue placeholder="ทุกสาขา" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">ทุกสาขา</SelectItem>
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
                    </div>
                </section>

                <UserTable
                    users={visibleUsers}
                    canMutate={canMutateUser}
                    // Taking over an account is the owner's call alone, and never
                    // on their own row.
                    canResetPassword={(target) =>
                        isOwner && target.id !== Number(auth.user.id)
                    }
                    onEdit={openEditDialogWithLatestBranches}
                    onToggle={toggleActive}
                    onResetPassword={openResetPassword}
                    onDelete={deleteUser}
                />

                <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                    <p className="font-medium">
                        แสดงผล {visibleUsers.length} จากทั้งหมด {users.total}{' '}
                        ผู้ใช้งาน · หน้า {users.current_page} /{' '}
                        {users.last_page}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={users.current_page <= 1}
                            onClick={() =>
                                applyFilters({
                                    page: String(users.current_page - 1),
                                })
                            }
                        >
                            ก่อนหน้า
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={users.current_page >= users.last_page}
                            onClick={() =>
                                applyFilters({
                                    page: String(users.current_page + 1),
                                })
                            }
                        >
                            ถัดไป
                        </Button>
                    </div>
                </div>
            </div>

            <UserFormDialog
                open={isCreateOpen}
                mode="create"
                roles={roles}
                branches={branches}
                form={createForm}
                onSubmit={() => submitCreate(() => setIsCreateOpen(false))}
                onOpenChange={(open) => {
                    setIsCreateOpen(open);

                    if (!open) {
                        createForm.reset();
                        createForm.clearErrors();
                    }
                }}
            />

            <UserFormDialog
                open={isEditOpen}
                mode="edit"
                roles={roles}
                branches={branches}
                form={editForm}
                onSubmit={() => submitEdit(() => setIsEditOpen(false))}
                onOpenChange={(open) => {
                    setIsEditOpen(open);

                    if (!open) {
                        closeEdit();
                    }
                }}
            />

            <ResetPasswordDialog
                open={resettingUser !== null}
                targetName={resettingUser?.full_name ?? ''}
                form={resetPasswordForm}
                onSubmit={() => submitResetPassword()}
                onOpenChange={(open) => {
                    if (!open) {
                        closeResetPassword();
                    }
                }}
            />
        </>
    );
}
