import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { ProductionDepartmentFilter } from '@/components/domain/production/ProductionBoardPage';
import type { CuttingTeam, HeatPressMachine, Order } from '@/types/models';

type HeatPressPageProps = {
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
    heatPressMachines?: HeatPressMachine[];
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

export default function HeatPressPage({
    orders,
    pagination,
    branches = [],
    cuttingTeams = [],
    heatPressMachines = [],
    fabricLookup = {},
    specSectionsMap = {},
    initialDepartmentFilter = 'heat_press',
    showDepartmentFilter = false,
    pageTitle = 'ห้องอัด',
}: HeatPressPageProps) {
    return (
        <ProductionBoardPage
            orders={orders}
            pagination={pagination}
            branches={branches}
            cuttingTeams={cuttingTeams}
            heatPressMachines={heatPressMachines}
            fabricLookup={fabricLookup}
            specSectionsMap={specSectionsMap}
            initialDepartmentFilter={initialDepartmentFilter}
            showDepartmentFilter={showDepartmentFilter}
            pageTitle={pageTitle}
            hideBillingColumns={true}
        />
    );
}

HeatPressPage.layout = (props: { pageTitle?: string; pageHref?: string }) => ({
    breadcrumbs: [
        {
            title: props.pageTitle ?? 'ห้องอัด',
            href: props.pageHref ?? '/production/heat-press',
        },
    ],
});
