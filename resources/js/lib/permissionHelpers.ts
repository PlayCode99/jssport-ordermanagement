import { USER_ACCESS_ROLES } from '@/types/user-management';
import type { UserAccessRole } from '@/types/user-management';

export const USER_MENUS = {
    DASHBOARD: 'dashboard',
    COUNTER: 'counter',
    CUTTING: 'cutting',
    PRINTING: 'printing',
    PRESSING: 'pressing',
    EMBROIDERY: 'embroidery',
    SEWING: 'sewing',
    SCREEN_FLEX: 'screen_flex',
    QC: 'qc',
    DELIVERY: 'delivery',
} as const;

export type UserMenuName = (typeof USER_MENUS)[keyof typeof USER_MENUS];

const ROLE_MENU_MAP: Record<UserAccessRole, readonly UserMenuName[]> = {
    COUNTER: [USER_MENUS.COUNTER, USER_MENUS.DELIVERY],
    CUTTING_STAFF: [USER_MENUS.CUTTING],
    PRINTING_STAFF: [USER_MENUS.PRINTING],
    PRESS_STAFF: [USER_MENUS.PRESSING],
    EMBROIDERY_STAFF: [USER_MENUS.EMBROIDERY],
    SEWING_STAFF: [USER_MENUS.SEWING],
    SCREEN_FLEX_STAFF: [USER_MENUS.SCREEN_FLEX],
    QC_STAFF: [USER_MENUS.QC],
    DELIVERY_STAFF: [USER_MENUS.DELIVERY],
    ADMIN_PRODUCTION: [
        USER_MENUS.CUTTING,
        USER_MENUS.PRINTING,
        USER_MENUS.PRESSING,
        USER_MENUS.EMBROIDERY,
        USER_MENUS.SEWING,
        USER_MENUS.SCREEN_FLEX,
        USER_MENUS.QC,
        USER_MENUS.DELIVERY,
    ],
    ADMIN_SYSTEM: [
        USER_MENUS.COUNTER,
        USER_MENUS.CUTTING,
        USER_MENUS.PRINTING,
        USER_MENUS.PRESSING,
        USER_MENUS.EMBROIDERY,
        USER_MENUS.SEWING,
        USER_MENUS.SCREEN_FLEX,
        USER_MENUS.QC,
        USER_MENUS.DELIVERY,
    ],
    OWNER: [
        USER_MENUS.DASHBOARD,
        USER_MENUS.COUNTER,
        USER_MENUS.CUTTING,
        USER_MENUS.PRINTING,
        USER_MENUS.PRESSING,
        USER_MENUS.EMBROIDERY,
        USER_MENUS.SEWING,
        USER_MENUS.SCREEN_FLEX,
        USER_MENUS.QC,
        USER_MENUS.DELIVERY,
    ],
};

function normalizeBranchCode(raw: string | null | undefined): string | null {
    const value = String(raw ?? '').trim();

    if (value === '') {
        return null;
    }

    const digits = value.replace(/\D+/g, '');

    if (digits === '') {
        return null;
    }

    if (digits.length === 1) {
        return '0' + digits;
    }

    return digits.slice(-2);
}

/**
 * Check if a role can access a menu.
 */
export function canAccessMenu(
    userRole: UserAccessRole,
    menuName: UserMenuName,
): boolean {
    if (userRole === USER_ACCESS_ROLES.OWNER) {
        return true;
    }

    if (
        userRole === USER_ACCESS_ROLES.ADMIN_SYSTEM &&
        menuName === USER_MENUS.DASHBOARD
    ) {
        return false;
    }

    const allowedMenus = ROLE_MENU_MAP[userRole] ?? [];

    return allowedMenus.includes(menuName);
}

/**
 * Branch access rule:
 * - same branch allowed
 * - branch code "01" can access all
 */
export function canAccessBranch(
    currentUserBranch: string | null | undefined,
    targetBranch: string | null | undefined,
): boolean {
    const currentCode = normalizeBranchCode(currentUserBranch);
    const targetCode = normalizeBranchCode(targetBranch);

    if (currentCode === null || targetCode === null) {
        return false;
    }

    return currentCode === '01' || currentCode === targetCode;
}

/**
 * Where the logo should lead. Home is not the counter for everyone -- a QC or
 * sewing account cannot open it -- so anyone without the counter goes to the
 * page the server says they land on. Counter staff keep the team-scoped counter
 * URL they have always had.
 */
export function resolveLogoHref({
    canOpenCounter,
    counterUrl,
    landingPath,
}: {
    canOpenCounter: boolean;
    counterUrl: string;
    landingPath?: string | null;
}): string {
    if (canOpenCounter) {
        return counterUrl;
    }

    // A page served before this prop existed, or one that failed to carry it,
    // must still leave the logo pointing somewhere.
    return landingPath && landingPath !== '' ? landingPath : counterUrl;
}
