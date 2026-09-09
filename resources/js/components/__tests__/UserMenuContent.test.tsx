import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@inertiajs/react', () => ({
    Link: ({
        href,
        children,
        ...rest
    }: {
        href: unknown;
        children: React.ReactNode;
    }) => (
        <a href={typeof href === 'string' ? href : '#'} {...rest}>
            {children}
        </a>
    ),
    router: { flushAll: vi.fn() },
}));

vi.mock('@/components/ui/dropdown-menu', () => {
    const passthrough = ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    );

    return {
        DropdownMenuGroup: passthrough,
        DropdownMenuItem: passthrough,
        DropdownMenuLabel: passthrough,
        DropdownMenuSeparator: () => <hr />,
    };
});

vi.mock('@/hooks/use-mobile-navigation', () => ({
    useMobileNavigation: () => () => {},
}));
vi.mock('@/routes', () => ({ logout: () => '/logout' }));

import { UserMenuContent } from '@/components/user-menu-content';

const user = (over: Record<string, unknown> = {}) =>
    ({
        id: 1,
        name: 'Owner01',
        full_name: 'Owner01',
        email: 'owner01@garment-erp.local',
        employee_code: 'EMP-001',
        avatar: '',
        ...over,
    }) as never;

describe('account menu', () => {
    it('shows the employee code instead of the login address', () => {
        render(<UserMenuContent user={user()} />);

        expect(screen.getByText('EMP-001')).toBeInTheDocument();
        // The generated address means nothing to staff and should not be shown.
        expect(
            screen.queryByText('owner01@garment-erp.local'),
        ).not.toBeInTheDocument();
    });

    it('no longer offers Settings', () => {
        render(<UserMenuContent user={user()} />);

        expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    });

    it('keeps the name and the way out', () => {
        render(<UserMenuContent user={user()} />);

        expect(screen.getByText('Owner01')).toBeInTheDocument();
        expect(screen.getByText('Log out')).toBeInTheDocument();
    });

    it('shows no second line at all when the account has no code', () => {
        render(<UserMenuContent user={user({ employee_code: null })} />);

        expect(screen.getByText('Owner01')).toBeInTheDocument();
        expect(
            screen.queryByText('owner01@garment-erp.local'),
        ).not.toBeInTheDocument();
    });
});
