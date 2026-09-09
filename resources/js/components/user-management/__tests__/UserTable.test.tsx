import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import UserTable from '@/components/user-management/UserTable';
import { USER_ACCESS_ROLES } from '@/types/user-management';
import type { UserListItem } from '@/types/user-management';

const user = (over: Partial<UserListItem> = {}): UserListItem =>
    ({
        id: 2,
        full_name: 'สมชาย ใจดี',
        employee_code: 'EMP-002',
        role: USER_ACCESS_ROLES.COUNTER,
        branch_id: 1,
        branch_code: '01',
        branch_name: 'หนองบัวลำภู',
        is_active: true,
        ...over,
    }) as UserListItem;

const renderTable = (over: Record<string, unknown> = {}) => {
    const props = {
        users: [user()],
        canMutate: () => true,
        canResetPassword: () => true,
        onEdit: vi.fn(),
        onToggle: vi.fn(),
        onResetPassword: vi.fn(),
        onDelete: vi.fn(),
        ...over,
    };

    render(
        <UserTable
            {...(props as unknown as Parameters<typeof UserTable>[0])}
        />,
    );

    return props;
};

describe('UserTable password reset', () => {
    it('offers the reset only when the viewer may do it', () => {
        renderTable();

        expect(
            screen.getByRole('button', { name: /รีเซ็ตรหัสผ่าน/ }),
        ).toBeInTheDocument();
    });

    it('hides the reset entirely from anyone else', () => {
        renderTable({ canResetPassword: () => false });

        // Hidden, not merely disabled: a greyed-out button invites a support
        // call about a permission that will never be granted.
        expect(
            screen.queryByRole('button', { name: /รีเซ็ตรหัสผ่าน/ }),
        ).not.toBeInTheDocument();
    });

    it('passes the row it was pressed on', () => {
        const props = renderTable();

        fireEvent.click(screen.getByRole('button', { name: /รีเซ็ตรหัสผ่าน/ }));

        expect(props.onResetPassword).toHaveBeenCalledWith(
            expect.objectContaining({ id: 2 }),
        );
    });

    it('keeps the other row actions working', () => {
        const props = renderTable();

        fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
        fireEvent.click(screen.getByRole('button', { name: /ปิดใช้งาน/ }));
        fireEvent.click(screen.getByRole('button', { name: /^ลบ/ }));

        expect(props.onEdit).toHaveBeenCalledTimes(1);
        expect(props.onToggle).toHaveBeenCalledTimes(1);
        expect(props.onDelete).toHaveBeenCalledTimes(1);
    });

    it('still disables edit and delete for rows the viewer may not change', () => {
        renderTable({ canMutate: () => false });

        expect(screen.getByRole('button', { name: /แก้ไข/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /^ลบ/ })).toBeDisabled();
    });
});
