import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { ProductionDepartmentFilter } from '@/components/domain/production/ProductionBoardPage';
import type { CuttingTeam, Order } from '@/types/models';

type ProductionKanbanPageProps = {
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

export default function ProductionKanbanPage({
    orders,
    pagination,
    branches = [],
    cuttingTeams = [],
    fabricLookup = {},
    specSectionsMap = {},
    initialDepartmentFilter = 'all',
    showDepartmentFilter = true,
    pageTitle = 'Production Kanban',
}: ProductionKanbanPageProps) {
    return (
        <ProductionBoardPage
            orders={orders}
            pagination={pagination}
            branches={branches}
            cuttingTeams={cuttingTeams}
            fabricLookup={fabricLookup}
            specSectionsMap={specSectionsMap}
            initialDepartmentFilter={initialDepartmentFilter}
            showDepartmentFilter={showDepartmentFilter}
            pageTitle={pageTitle}
        />
    );
}

ProductionKanbanPage.layout = (props: {
    pageTitle?: string;
    pageHref?: string;
}) => ({
    breadcrumbs: [
        {
            title: props.pageTitle ?? 'Production Kanban',
            href: props.pageHref ?? '/production/kanban',
        },
    ],
});
