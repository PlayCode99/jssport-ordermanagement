vi.mock('@/layouts/app-layout', () => ({
    default: function MockAppLayout() {
        return null;
    },
}));

vi.mock('@/layouts/auth-layout', () => ({
    default: function MockAuthLayout() {
        return null;
    },
}));

vi.mock('@/layouts/settings/layout', () => ({
    default: function MockSettingsLayout() {
        return null;
    },
}));

import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';
import { resolvePageLayout } from '@/layouts/layout-resolver';
import SettingsLayout from '@/layouts/settings/layout';

describe('resolvePageLayout', () => {
    it('uses auth layout for auth pages', () => {
        expect(resolvePageLayout('auth/login')).toBe(AuthLayout);
    });

    it('keeps settings profile under settings layout chain', () => {
        const layout = resolvePageLayout('settings/profile');

        expect(Array.isArray(layout)).toBe(true);
        expect(layout).toEqual([AppLayout, SettingsLayout]);
    });

    it('uses app layout only for settings users page', () => {
        const layout = resolvePageLayout('settings/users/index');

        expect(layout).toBe(AppLayout);
    });
});
