import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { ProductionDepartmentFilter } from '@/components/domain/production/ProductionBoardPage';
import type { CuttingTeam, Order } from '@/types/models';

type PrintRoomPageProps = {
    orders: Order[];
    pagination?: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
        from: number | null;
        to: number | null;
    };
    branches?: Array<{ value: string; label: string }>;
    cuttingTeams?: CuttingTeam[];
    fabricLookup?: Record<string, string>;
    specSectionsMap?: Record<
        string,
        {
            shirt: Array<{ label: string; value: string }>;
            pants: Array<{ label: string; value: string }>;
        }
    >;
    initialDepartmentFilter?: ProductionDepartmentFilter;
    showDepartmentFilter?: boolean;
    pageTitle?: string;
    pageHref?: string;
};

export default function PrintRoomPage({
    orders,
    pagination,
    branches = [],
    cuttingTeams = [],
    fabricLookup = {},
    specSectionsMap = {},
    initialDepartmentFilter = 'print_room',
    showDepartmentFilter = false,
    pageTitle = 'ห้องพิมพ์',
}: PrintRoomPageProps) {
    const resolvedDepartmentFilter: ProductionDepartmentFilter =
        initialDepartmentFilter ?? 'print_room';

    return (
        <ProductionBoardPage
            orders={orders}
            pagination={pagination}
            branches={branches}
            cuttingTeams={cuttingTeams}
            fabricLookup={fabricLookup}
            specSectionsMap={specSectionsMap}
            initialDepartmentFilter={resolvedDepartmentFilter}
            showDepartmentFilter={showDepartmentFilter}
            pageTitle={pageTitle}
            hideBillingColumns={true}
        />
    );
}

PrintRoomPage.layout = (props: { pageTitle?: string; pageHref?: string }) => ({
    breadcrumbs: [
        {
            title: props.pageTitle ?? 'ห้องพิมพ์',
            href: props.pageHref ?? '/production/print-room',
        },
    ],
});
