import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pageProps } = vi.hoisted(() => ({
    pageProps: { value: {} as Record<string, unknown> },
}));

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: pageProps.value, url: '/' }),
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

vi.mock('@/components/ui/sidebar', () => ({
    SidebarTrigger: () => <button type="button">menu</button>,
}));

import { AppSidebarHeader } from '@/components/app-sidebar-header';

const setUser = (user: Record<string, unknown> | null) => {
    pageProps.value = { auth: { user } };
};

describe('page header identity', () => {
    beforeEach(() => {
        pageProps.value = {};
    });

    it('shows who is signed in, their branch and their role', () => {
        setUser({
            full_name: 'สมชาย ใจดี',
            branch_name: 'หนองบัวลำภู',
            access_role_label: 'QC Staff',
        });

        render(
            <AppSidebarHeader
                breadcrumbs={[{ title: 'ห้องตรวจสอบ', href: '/production/qc' }]}
            />,
        );

        expect(screen.getByText('สมชาย ใจดี')).toBeInTheDocument();
        expect(screen.getByText('หนองบัวลำภู')).toBeInTheDocument();
        expect(screen.getByText('QC Staff')).toBeInTheDocument();
    });

    it('keeps the page name it sits beside', () => {
        setUser({
            full_name: 'สมชาย ใจดี',
            branch_name: 'หนองบัวลำภู',
            access_role_label: 'QC Staff',
        });

        render(
            <AppSidebarHeader
                breadcrumbs={[{ title: 'ห้องตรวจสอบ', href: '/production/qc' }]}
            />,
        );

        expect(screen.getByText('ห้องตรวจสอบ')).toBeInTheDocument();
    });

    it('falls back to the account name when no full name is stored', () => {
        setUser({
            name: 'Owner 01',
            branch_name: 'หนองบัวลำภู',
            access_role_label: 'Owner',
        });

        render(<AppSidebarHeader />);

        expect(screen.getByText('Owner 01')).toBeInTheDocument();
    });

    it('falls back to the branch code when the name is missing', () => {
        setUser({
            full_name: 'สมชาย',
            branch_code: '01',
            access_role_label: 'Counter',
        });

        render(<AppSidebarHeader />);

        expect(screen.getByText('01')).toBeInTheDocument();
    });

    it('renders without a branch or a role rather than showing blanks', () => {
        setUser({ full_name: 'สมชาย' });

        render(<AppSidebarHeader />);

        expect(screen.getByText('สมชาย')).toBeInTheDocument();
        expect(screen.queryByText('undefined')).not.toBeInTheDocument();
        expect(screen.queryByText('null')).not.toBeInTheDocument();
    });

    it('shows nothing at all when nobody is signed in', () => {
        setUser(null);

        expect(() => render(<AppSidebarHeader />)).not.toThrow();
        expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    });
});
