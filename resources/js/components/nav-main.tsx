import { Link } from '@inertiajs/react';
import { ChevronDown } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useState } from 'react';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';

function hasActiveDescendant(
    item: NavItem,
    isCurrentUrl: (href: string) => boolean,
): boolean {
    if (isCurrentUrl(item.href as string)) {
        return true;
    }

    if (!item.children || item.children.length === 0) {
        return false;
    }

    return item.children.some((child) =>
        hasActiveDescendant(child, isCurrentUrl),
    );
}

function NavMainItem({ item, depth }: { item: NavItem; depth: number }) {
    const { isCurrentUrl } = useCurrentUrl();
    const hasChildren = (item.children?.length ?? 0) > 0;
    const [open, setOpen] = useState<boolean>(
        hasActiveDescendant(item, isCurrentUrl),
    );

    const handleItemSelect = (event: ReactMouseEvent) => {
        if (!item.onSelect) {
            return;
        }

        event.preventDefault();
        item.onSelect();
    };

    if (!hasChildren) {
        if (depth === 0) {
            return (
                <SidebarMenuItem key={`${item.title}-${item.href}`}>
                    <SidebarMenuButton
                        asChild
                        isActive={isCurrentUrl(item.href)}
                        tooltip={{ children: item.title }}
                    >
                        <Link
                            href={item.href}
                            prefetch
                            onClick={handleItemSelect}
                        >
                            {item.icon && <item.icon />}
                            <span>{item.title}</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            );
        }

        return (
            <SidebarMenuSubItem key={`${item.title}-${item.href}`}>
                <SidebarMenuSubButton
                    asChild
                    isActive={isCurrentUrl(item.href)}
                >
                    <Link href={item.href} prefetch onClick={handleItemSelect}>
                        {item.icon && <item.icon />}
                        <span>{item.title}</span>
                    </Link>
                </SidebarMenuSubButton>
            </SidebarMenuSubItem>
        );
    }

    if (depth === 0) {
        return (
            <SidebarMenuItem key={`${item.title}-${item.href}`}>
                <Collapsible
                    open={open}
                    onOpenChange={setOpen}
                    className="w-full"
                >
                    <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={{ children: item.title }}>
                            {item.icon && <item.icon />}
                            <span>{item.title}</span>
                            <ChevronDown
                                className={`ml-auto size-4 transition-transform ${open ? 'rotate-180' : ''}`}
                            />
                        </SidebarMenuButton>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                        <SidebarMenuSub>
                            {item.children?.map((child) => (
                                <NavMainItem
                                    key={`${child.title}-${child.href}`}
                                    item={child}
                                    depth={depth + 1}
                                />
                            ))}
                        </SidebarMenuSub>
                    </CollapsibleContent>
                </Collapsible>
            </SidebarMenuItem>
        );
    }

    return (
        <SidebarMenuSubItem key={`${item.title}-${item.href}`}>
            <Collapsible open={open} onOpenChange={setOpen} className="w-full">
                <CollapsibleTrigger asChild>
                    <SidebarMenuSubButton>
                        {item.icon && <item.icon />}
                        <span>{item.title}</span>
                        <ChevronDown
                            className={`ml-auto size-4 transition-transform ${open ? 'rotate-180' : ''}`}
                        />
                    </SidebarMenuSubButton>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <SidebarMenuSub>
                        {item.children?.map((child) => (
                            <NavMainItem
                                key={`${child.title}-${child.href}`}
                                item={child}
                                depth={depth + 1}
                            />
                        ))}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuSubItem>
    );
}

export function NavMain({ items = [] }: { items: NavItem[] }) {
    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarMenu>
                {items.map((item) => (
                    <NavMainItem
                        key={`${item.title}-${item.href}`}
                        item={item}
                        depth={0}
                    />
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
}
