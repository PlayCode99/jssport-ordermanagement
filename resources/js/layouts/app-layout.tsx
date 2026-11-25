import { usePage } from '@inertiajs/react';

import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import { setGarmentStyles } from '@/pages/Orders/garmentTables';
import type { BreadcrumbItem } from '@/types';

type SharedGarmentStyles = {
    garmentStyles?: {
        SHIRT?: Array<{ code: string; name: string; is_active: boolean }>;
        PANTS?: Array<{ code: string; name: string; is_active: boolean }>;
    };
};

export default function AppLayout({
    breadcrumbs = [],
    children,
}: {
    breadcrumbs?: BreadcrumbItem[];
    children: React.ReactNode;
}) {
    const { garmentStyles } = usePage<SharedGarmentStyles>().props;

    /**
     * The lengths the shop sells, poured in before the page under this
     * layout renders.
     *
     * They are named on the order form, on the counter and on the floor's
     * sheets, by modules that are called from everywhere and cannot each be
     * handed a list. Doing it here — in the layout every page is wrapped in,
     * on every visit — is what lets a shop add "แขนสามส่วน" once and have
     * every screen know the word for it, including after a navigation that
     * never reloads the app.
     */
    setGarmentStyles(garmentStyles);

    return (
        <AppLayoutTemplate breadcrumbs={breadcrumbs}>
            {children}
        </AppLayoutTemplate>
    );
}
