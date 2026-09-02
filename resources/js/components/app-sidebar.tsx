import { Link, usePage } from '@inertiajs/react';
import {
    ChartColumn,
    ClipboardCheck,
    Database,
    DraftingCompass,
    LayoutGrid,
    Printer,
    Scissors,
    Shirt,
    Sparkles,
    Stamp,
    Truck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { getActivePantsMenuLinks, pantsMenuUpdatedEventName, type PantsMenuLink } from '@/lib/pants-menu-store';
import { canAccessMenu, USER_MENUS } from '@/lib/permissionHelpers';
import { getActiveShirtMenuLinks, shirtMenuUpdatedEventName, type ShirtMenuLink } from '@/lib/shirt-style-menu-store';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { NavItem } from '@/types';
import { USER_ACCESS_ROLES, type UserAccessRole } from '@/types/user-management';

function uniqueNavItemsByHref(items: NavItem[]): NavItem[] {
    const seen = new Set<string>();

    return items.filter((item) => {
        const key = `${item.title}::${item.href}`;

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

export function AppSidebar() {
    const page = usePage();
    const authUser = (page.props.auth as { user?: { access_role?: string; role?: string; station_department?: string } })?.user;

    const resolvedRole = useMemo<UserAccessRole>(() => {
        const accessRole = String(authUser?.access_role ?? '').trim();

        if (Object.values(USER_ACCESS_ROLES).includes(accessRole as UserAccessRole)) {
            return accessRole as UserAccessRole;
        }

        if (authUser?.role === 'admin') {
            return USER_ACCESS_ROLES.ADMIN_SYSTEM;
        }

        if (authUser?.role === 'production_manager') {
            return USER_ACCESS_ROLES.ADMIN_PRODUCTION;
        }

        if (authUser?.role === 'qc' || authUser?.station_department === 'qc') {
            return USER_ACCESS_ROLES.QC_STAFF;
        }

        if (authUser?.role === 'worker') {
            return authUser?.station_department === 'cutting'
                ? USER_ACCESS_ROLES.CUTTING_STAFF
                : authUser?.station_department === 'print'
                    ? USER_ACCESS_ROLES.PRINTING_STAFF
                    : authUser?.station_department === 'embroidery'
                        ? USER_ACCESS_ROLES.EMBROIDERY_STAFF
                        : authUser?.station_department === 'sewing'
                            ? USER_ACCESS_ROLES.SEWING_STAFF
                            : authUser?.station_department === 'screen' || authUser?.station_department === 'flex'
                                ? USER_ACCESS_ROLES.SCREEN_FLEX_STAFF
                                : USER_ACCESS_ROLES.DELIVERY_STAFF;
        }

        return USER_ACCESS_ROLES.COUNTER;
    }, [authUser?.access_role, authUser?.role, authUser?.station_department]);
    const shirtTypeMenus = (page.props.garmentSidebarShirtTypes ?? []) as Array<{ id: number; code: string; name: string }>;
    const [dynamicShirtMenus, setDynamicShirtMenus] = useState<ShirtMenuLink[]>([]);
    const [dynamicPantsMenus, setDynamicPantsMenus] = useState<PantsMenuLink[]>([]);

    useEffect(() => {
        const syncMenus = () => {
            setDynamicShirtMenus(getActiveShirtMenuLinks());
            setDynamicPantsMenus(getActivePantsMenuLinks());
        };

        syncMenus();
        window.addEventListener('storage', syncMenus);
        window.addEventListener(shirtMenuUpdatedEventName(), syncMenus);
        window.addEventListener(pantsMenuUpdatedEventName(), syncMenus);

        return () => {
            window.removeEventListener('storage', syncMenus);
            window.removeEventListener(shirtMenuUpdatedEventName(), syncMenus);
            window.removeEventListener(pantsMenuUpdatedEventName(), syncMenus);
        };
    }, []);

    const mainUrl = page.props.currentTeam
        ? `/${page.props.currentTeam.slug}/counter`
        : '/counter';

    const dynamicShirtChildren = useMemo<NavItem[]>(
        () => dynamicShirtMenus.map((item) => ({ title: item.title, href: item.href })),
        [dynamicShirtMenus],
    );

    const dynamicPantsChildren = useMemo<NavItem[]>(
        () => dynamicPantsMenus.map((item) => ({ title: item.title, href: item.href })),
        [dynamicPantsMenus],
    );

    const shirtTypeChildren = useMemo<NavItem[]>(
        () => shirtTypeMenus.map((item) => ({
            title: item.name,
            href: `/settings/data/garments/prices?category=SHIRT&garment_type_id=${item.id}`,
        })),
        [shirtTypeMenus],
    );

    const editRoomChildren = useMemo<NavItem[]>(() => {
        const rooms: NavItem[] = [];

        if (canAccessMenu(resolvedRole, USER_MENUS.PRINTING)) {
            rooms.push({
                title: 'ห้องพิมพ์',
                href: '/production/print-room',
                icon: Printer,
            });
        }

        if (canAccessMenu(resolvedRole, USER_MENUS.PRESSING)) {
            rooms.push({
                title: 'ห้องอัด',
                href: '/production/heat-press',
                icon: Stamp,
            });
        }

        if (canAccessMenu(resolvedRole, USER_MENUS.EMBROIDERY)) {
            rooms.push({
                title: 'ห้องปัก',
                href: '/production/embroidery',
                icon: Sparkles,
            });
        }

        if (canAccessMenu(resolvedRole, USER_MENUS.CUTTING)) {
            rooms.push({
                title: 'ห้องตัด',
                href: '/production/cutting',
                icon: Scissors,
            });
        }

        if (canAccessMenu(resolvedRole, USER_MENUS.SEWING)) {
            rooms.push({
                title: 'ห้องเย็บ',
                href: '/production/sewing',
                icon: Shirt,
            });
        }

        if (canAccessMenu(resolvedRole, USER_MENUS.SCREEN_FLEX)) {
            rooms.push({
                title: 'สกรีน , เฟล็กซ์',
                href: '/production/screen-flex',
                icon: Stamp,
            });
        }

        return uniqueNavItemsByHref(rooms);
    }, [resolvedRole]);

    const mainNavItems: NavItem[] = [];

    // Owner-only, matching the server-side guard on the route itself.
    if (resolvedRole === USER_ACCESS_ROLES.OWNER) {
        mainNavItems.push({
            title: 'แดชบอร์ด',
            href: '/owner-dashboard',
            icon: ChartColumn,
        });
    }

    if (canAccessMenu(resolvedRole, USER_MENUS.COUNTER)) {
        mainNavItems.push({
            title: 'เคาว์เตอร์',
            href: mainUrl,
            icon: LayoutGrid,
        });
    }

    if (editRoomChildren.length > 0) {
        mainNavItems.push({
            title: 'ห้อง Edit',
            href: '/production/kanban',
            icon: DraftingCompass,
            children: editRoomChildren,
        });
    }

    if (canAccessMenu(resolvedRole, USER_MENUS.QC)) {
        mainNavItems.push({
            title: 'ห้องตรวจสอบ',
            href: '/production/qc',
            icon: ClipboardCheck,
        });
    }

    if (canAccessMenu(resolvedRole, USER_MENUS.DELIVERY)) {
        mainNavItems.push({
            title: 'จัดส่ง',
            href: '/production/shipping',
            icon: Truck,
        });
    }

    if (resolvedRole === USER_ACCESS_ROLES.OWNER || resolvedRole === USER_ACCESS_ROLES.ADMIN_SYSTEM) {
        mainNavItems.push({
            title: 'จัดการข้อมูล',
            href: '/settings/data',
            icon: Database,
            children: [
                {
                    title: 'ข้อมูลสาขา',
                    href: '/settings/data/branches',
                },
                {
                    title: 'กำลังผลิตต่อวัน',
                    href: '/settings/data/production-capacity',
                },
                {
                    title: 'ประเภทงาน',
                    href: '/settings/data/job-types',
                },
                {
                    title: 'รายละเอียด / ราคาชิ้นงาน',
                    href: '/settings/data/garments/types',
                },
                {
                    title: 'แบบเสื้อ',
                    href: '/settings/data/shirts',
                    children: [
                        {
                            title: 'แบบเสื้อ',
                            href: '/settings/data/shirts',
                        },
                        ...dynamicShirtChildren,
                    ],
                },
                {
                    title: 'ประเภทเสื้อ',
                    href: '/settings/data/garments/prices?category=SHIRT',
                    children: shirtTypeChildren.length > 0
                        ? shirtTypeChildren
                        : [
                            {
                                title: 'เสื้อโปโล',
                                href: '/settings/data/garments/prices?category=SHIRT',
                            },
                        ],
                },
                {
                    title: 'แบบกางเกง',
                    href: '/settings/data/pants',
                    children: [
                        {
                            title: 'แบบกางเกง',
                            href: '/settings/data/pants',
                        },
                        ...dynamicPantsChildren,
                    ],
                },
                {
                    title: 'ไซซ์เด็ก',
                    href: '/settings/data/size-kids',
                },
                {
                    title: 'ไซซ์ผู้ใหญ่',
                    href: '/settings/data/size-adults',
                },
                {
                    title: 'ข้อมูลลูกค้า',
                    href: '/settings/data/customers',
                    children: [
                        {
                            title: 'ข้อมูลติดต่อ',
                            href: '/settings/data/customers/contacts',
                        },
                    ],
                },
                {
                    title: 'จัดการผู้ใช้งาน',
                    href: '/settings/users',
                },
            ],
        });
    }

    return (
        <Sidebar collapsible="icon" variant="inset" className="!bg-[#111318]">
            <SidebarHeader className="px-1.5 pt-1.5">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            asChild
                            className="h-auto w-full justify-start p-0 hover:bg-transparent data-[active=true]:bg-transparent group-data-[collapsible=icon]:!size-12 group-data-[collapsible=icon]:!p-0"
                        >
                            <Link href={mainUrl} prefetch className="block w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
                                <img
                                    src="/images/logo/logo.png"
                                    alt="JS Sport Order"
                                    className="h-[90px] w-full rounded-lg object-contain group-data-[collapsible=icon]:h-[110px] group-data-[collapsible=icon]:w-[110px]"
                                />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
