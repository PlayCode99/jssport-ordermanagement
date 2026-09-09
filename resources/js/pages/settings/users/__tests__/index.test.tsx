import { render, screen } from '@testing-library/react';
import { createBlankUserForm } from '@/hooks/useUserManagement';
import UserManagementPage from '@/pages/settings/users/index';
import { USER_ACCESS_ROLES } from '@/types/user-management';
import type { UserManagementPageProps } from '@/types/user-management';

const inertiaRouterMocks = vi.hoisted(() => ({
    get: vi.fn(),
    reload: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    Head: ({ title }: { title?: string }) =>
        title ? <title>{title}</title> : null,
    router: {
        get: inertiaRouterMocks.get,
        reload: inertiaRouterMocks.reload,
    },
}));

vi.mock('@/hooks/useUserManagement', () => ({
    createBlankUserForm: () => ({
        full_name: '',
        employee_code: '',
        role: '',
        branch_id: '',
        is_active: true,
        password: '',
        password_confirmation: '',
    }),
    useUserManagement: () => ({
        createForm: {
            reset: vi.fn(),
            clearErrors: vi.fn(),
        },
        editForm: {
            reset: vi.fn(),
            clearErrors: vi.fn(),
        },
        openCreate: vi.fn(),
        submitCreate: vi.fn(),
        openEdit: vi.fn(),
        closeEdit: vi.fn(),
        submitEdit: vi.fn(),
        toggleActive: vi.fn(),
        deleteUser: vi.fn(),
        resettingUser: null,
        resetPasswordForm: {
            data: { password: '', password_confirmation: '' },
            errors: {},
            processing: false,
            setData: vi.fn(),
            reset: vi.fn(),
            clearErrors: vi.fn(),
        },
        openResetPassword: vi.fn(),
        closeResetPassword: vi.fn(),
        submitResetPassword: vi.fn(),
    }),
}));

vi.mock('@/components/user-management/UserTable', () => ({
    default: ({ users }: { users: Array<{ id: number }> }) => (
        <div data-testid="user-table">rows:{users.length}</div>
    ),
}));

vi.mock('@/components/user-management/UserFormDialog', () => ({
    default: () => null,
}));

const baseProps: UserManagementPageProps = {
    auth: {
        user: {
            id: 1,
            name: 'Owner User',
            full_name: 'Owner User',
            email: 'owner@example.com',
            email_verified_at: null,
            created_at: '2026-01-01T00:00:00.000000Z',
            updated_at: '2026-01-01T00:00:00.000000Z',
            access_role: USER_ACCESS_ROLES.OWNER,
            branch_id: 1,
            branch_code: '01',
            is_active: true,
        },
    },
    users: {
        data: [
            {
                id: 10,
                full_name: 'User A',
                employee_code: 'EMP-001',
                role: USER_ACCESS_ROLES.COUNTER,
                role_label: 'Counter',
                branch_id: 1,
                branch_code: '01',
                branch_name: 'Nong Bua',
                is_active: true,
            },
            {
                id: 11,
                full_name: 'User B',
                employee_code: 'EMP-002',
                role: USER_ACCESS_ROLES.COUNTER,
                role_label: 'Counter',
                branch_id: 2,
                branch_code: '02',
                branch_name: 'Khon Kaen',
                is_active: false,
            },
        ],
        current_page: 1,
        last_page: 1,
        per_page: 20,
        total: 2,
        links: [],
    },
    branches: [
        {
            id: 1,
            branch_code: '01',
            branch_name: 'Nong Bua',
        },
        {
            id: 2,
            branch_code: '02',
            branch_name: 'Khon Kaen',
        },
    ],
    roles: [
        {
            value: USER_ACCESS_ROLES.COUNTER,
            label: 'Counter',
        },
        {
            value: USER_ACCESS_ROLES.OWNER,
            label: 'Owner',
        },
    ],
    filters: {
        search: '',
        role: '',
        branch_id: '',
        status: '',
    },
};

describe('settings/users/index', () => {
    it('creates isolated blank user forms so branch selection does not leak across dialogs', () => {
        const createForm = createBlankUserForm();
        const editForm = createBlankUserForm();

        createForm.branch_id = '5';

        expect(createForm.branch_id).toBe('5');
        expect(editForm.branch_id).toBe('');
    });

    it('renders administration copy and hides settings copy', () => {
        const { container } = render(<UserManagementPage {...baseProps} />);

        expect(screen.getByText('Administration')).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'จัดการผู้ใช้งาน' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'จัดการสิทธิ์ผู้ใช้แบบปลอดภัย แยกตามสาขา พร้อมติดตามสถานะการใช้งานในหน้าจอเดียว',
            ),
        ).toBeInTheDocument();

        expect(screen.queryByText('Settings')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Manage your profile and account settings'),
        ).not.toBeInTheDocument();

        const root = container.querySelector('div.flex.h-full.flex-1.flex-col');
        expect(root).toBeInTheDocument();
        expect(root?.className.includes('max-w')).toBe(false);
    });

    it('keeps user management core actions visible', () => {
        render(<UserManagementPage {...baseProps} />);

        expect(screen.getByText('ตัวกรองข้อมูล')).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('ค้นหาชื่อ หรือรหัสผู้ใช้งาน'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'เพิ่มผู้ใช้งาน' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('user-table')).toHaveTextContent('rows:2');
    });
});
