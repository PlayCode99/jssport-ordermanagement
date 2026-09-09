import { usePage } from '@inertiajs/react';
import { Building2, ShieldCheck, User } from 'lucide-react';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';

type HeaderUser = {
    name?: string | null;
    full_name?: string | null;
    branch_code?: string | null;
    branch_name?: string | null;
    access_role_label?: string | null;
};

/**
 * Who is signed in, sitting beside the page name on every screen. Machines on
 * the floor are shared, so the person using one needs to see whose account it
 * is and which branch it belongs to without opening a menu.
 */
export function AppSidebarHeader({
    breadcrumbs = [],
}: {
    breadcrumbs?: BreadcrumbItemType[];
}) {
    const page = usePage<{ auth?: { user?: HeaderUser | null } }>();
    const user = page.props.auth?.user ?? null;

    const displayName = user?.full_name || user?.name || null;
    const branch = user?.branch_name || user?.branch_code || null;
    const roleLabel = user?.access_role_label || null;

    return (
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4">
            <div className="flex min-w-0 items-center gap-2">
                <SidebarTrigger className="-ml-1" />
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </div>

            {displayName ? (
                <div className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-slate-600 sm:gap-3">
                    <span
                        className="flex min-w-0 items-center gap-1 font-semibold text-slate-900"
                        title={displayName}
                    >
                        <User className="size-3.5 shrink-0 text-slate-400" />
                        <span className="max-w-[9rem] truncate sm:max-w-none">
                            {displayName}
                        </span>
                    </span>

                    {branch ? (
                        <span
                            className="hidden min-w-0 items-center gap-1 sm:flex"
                            title={branch}
                        >
                            <Building2 className="size-3.5 shrink-0 text-slate-400" />
                            <span className="max-w-[10rem] truncate">
                                {branch}
                            </span>
                        </span>
                    ) : null}

                    {roleLabel ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                            <ShieldCheck className="size-3" />
                            {roleLabel}
                        </span>
                    ) : null}
                </div>
            ) : null}
        </header>
    );
}
