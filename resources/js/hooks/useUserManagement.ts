import { router, useForm } from '@inertiajs/react';
import { useState } from 'react';
import type { UserAccessRole, UserListItem } from '@/types/user-management';

export type UserFormData = {
    full_name: string;
    employee_code: string;
    role: UserAccessRole | '';
    branch_id: string;
    is_active: boolean;
    password: string;
    password_confirmation: string;
};

export function createBlankUserForm(): UserFormData {
    return {
        full_name: '',
        employee_code: '',
        role: '',
        branch_id: '',
        is_active: true,
        password: '',
        password_confirmation: '',
    };
}

export function useUserManagement() {
    const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
    const [resettingUser, setResettingUser] = useState<UserListItem | null>(
        null,
    );

    const createForm = useForm<UserFormData>(createBlankUserForm());
    const editForm = useForm<UserFormData>(createBlankUserForm());

    const openCreate = () => {
        const blankForm = createBlankUserForm();
        createForm.setData(blankForm);
        createForm.clearErrors();
    };

    // The dialog's open state lives in the page, so saving has to tell it to
    // close. Without this the form emptied itself and the dialog stayed up,
    // looking as though nothing had happened.
    const submitCreate = (onSaved?: () => void) => {
        createForm.post('/settings/users', {
            preserveScroll: true,
            onSuccess: () => {
                createForm.reset();
                createForm.clearErrors();
                onSaved?.();
            },
        });
    };

    const openEdit = (user: UserListItem) => {
        setEditingUser(user);
        editForm.setData({
            full_name: user.full_name,
            employee_code: user.employee_code,
            role: user.role,
            branch_id: String(user.branch_id),
            is_active: user.is_active,
            password: '',
            password_confirmation: '',
        });
        editForm.clearErrors();
    };

    const closeEdit = () => {
        setEditingUser(null);
        const blankForm = createBlankUserForm();
        editForm.setData(blankForm);
        editForm.clearErrors();
    };

    const submitEdit = (onSaved?: () => void) => {
        if (editingUser === null) {
            return;
        }

        editForm.put(`/settings/users/${editingUser.id}`, {
            preserveScroll: true,
            onSuccess: () => {
                closeEdit();
                onSaved?.();
            },
        });
    };

    const resetPasswordForm = useForm({
        password: '',
        password_confirmation: '',
    });

    const openResetPassword = (user: UserListItem) => {
        setResettingUser(user);
        resetPasswordForm.setData({ password: '', password_confirmation: '' });
        resetPasswordForm.clearErrors();
    };

    const closeResetPassword = () => {
        setResettingUser(null);
        resetPasswordForm.setData({ password: '', password_confirmation: '' });
        resetPasswordForm.clearErrors();
    };

    const submitResetPassword = (onSaved?: () => void) => {
        if (resettingUser === null) {
            return;
        }

        resetPasswordForm.post(
            `/settings/users/${resettingUser.id}/reset-password`,
            {
                preserveScroll: true,
                onSuccess: () => {
                    closeResetPassword();
                    onSaved?.();
                },
            },
        );
    };

    const toggleActive = (user: UserListItem) => {
        router.patch(
            `/settings/users/${user.id}/active`,
            {
                is_active: !user.is_active,
            },
            {
                preserveScroll: true,
            },
        );
    };

    const deleteUser = (user: UserListItem) => {
        const confirmed = window.confirm(`Delete user ${user.full_name}?`);

        if (!confirmed) {
            return;
        }

        router.delete(`/settings/users/${user.id}`, {
            preserveScroll: true,
        });
    };

    return {
        editingUser,
        resettingUser,
        resetPasswordForm,
        openResetPassword,
        closeResetPassword,
        submitResetPassword,
        createForm,
        editForm,
        openCreate,
        submitCreate,
        openEdit,
        closeEdit,
        submitEdit,
        toggleActive,
        deleteUser,
    };
}
