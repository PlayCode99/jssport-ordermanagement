import type { Auth } from './auth';

export const USER_ACCESS_ROLES = {
    COUNTER: 'COUNTER',
    CUTTING_STAFF: 'CUTTING_STAFF',
    PRINTING_STAFF: 'PRINTING_STAFF',
    PRESS_STAFF: 'PRESS_STAFF',
    EMBROIDERY_STAFF: 'EMBROIDERY_STAFF',
    SEWING_STAFF: 'SEWING_STAFF',
    SCREEN_FLEX_STAFF: 'SCREEN_FLEX_STAFF',
    QC_STAFF: 'QC_STAFF',
    DELIVERY_STAFF: 'DELIVERY_STAFF',
    ADMIN_PRODUCTION: 'ADMIN_PRODUCTION',
    ADMIN_SYSTEM: 'ADMIN_SYSTEM',
    OWNER: 'OWNER',
} as const;

export type UserAccessRole =
    (typeof USER_ACCESS_ROLES)[keyof typeof USER_ACCESS_ROLES];

export type BranchOption = {
    id: number;
    branch_code: string;
    branch_name: string;
};

export type UserListItem = {
    id: number;
    full_name: string;
    employee_code: string;
    role: UserAccessRole;
    role_label: string;
    branch_id: number;
    branch_code: string;
    branch_name: string;
    is_active: boolean;
};

export type UserFilters = {
    search: string;
    role: string;
    branch_id: string;
    status: string;
};

export type PaginatedUsers = {
    data: UserListItem[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: Array<{ url: string | null; label: string; active: boolean }>;
};

export type RoleOption = {
    value: UserAccessRole;
    label: string;
};

export type AuthUserContext = Auth['user'] & {
    access_role: UserAccessRole;
    branch_id: number | null;
    branch_code: string | null;
    is_active?: boolean;
};

export type UserManagementPageProps = {
    auth: {
        user: AuthUserContext;
    };
    users: PaginatedUsers;
    branches: BranchOption[];
    roles: RoleOption[];
    filters: UserFilters;
};
