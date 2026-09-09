import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { ProductionDepartmentFilter } from '@/components/domain/production/ProductionBoardPage';
import type { CuttingTeam, Order } from '@/types/models';

type QcPageProps = {
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

export default function QcPage({
    orders,
    pagination,
    branches = [],
    cuttingTeams = [],
    fabricLookup = {},
    specSectionsMap = {},
    initialDepartmentFilter = 'qc',
    showDepartmentFilter = false,
    pageTitle = 'ห้องตรวจสอบ',
}: QcPageProps) {
    const resolvedDepartmentFilter: ProductionDepartmentFilter =
        initialDepartmentFilter ?? 'qc';

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
            hideBillingColumns={false}
        />
    );
}

QcPage.layout = (props: { pageTitle?: string; pageHref?: string }) => ({
    breadcrumbs: [
        {
            title: props.pageTitle ?? 'ห้องตรวจสอบ',
            href: props.pageHref ?? '/production/qc',
        },
    ],
});
