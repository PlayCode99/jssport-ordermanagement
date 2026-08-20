import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { ProductionDepartmentFilter } from '@/components/domain/production/ProductionBoardPage';
import type { CuttingTeam, Order, ScreenTeam } from '@/types/models';

type ScreenFlexPageProps = {
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
    screenTeams?: ScreenTeam[];
    fabricLookup?: Record<string, string>;
    specSectionsMap?: Record<string, { shirt: Array<{ label: string; value: string }>; pants: Array<{ label: string; value: string }> }>;
    initialDepartmentFilter?: ProductionDepartmentFilter;
    showDepartmentFilter?: boolean;
    pageTitle?: string;
    pageHref?: string;
};

export default function ScreenFlexPage({
    orders,
    branches = [],
    cuttingTeams = [],
    screenTeams = [],
    fabricLookup = {},
    specSectionsMap = {},
    initialDepartmentFilter = 'screen_flex',
    showDepartmentFilter = false,
    pageTitle = 'สกรีน , เฟล็กซ์',
    pagination,
}: ScreenFlexPageProps) {
    return (
        <ProductionBoardPage
            orders={orders}
            pagination={pagination}
            branches={branches}
            cuttingTeams={cuttingTeams}
            screenTeams={screenTeams}
            fabricLookup={fabricLookup}
            specSectionsMap={specSectionsMap}
            initialDepartmentFilter={initialDepartmentFilter}
            showDepartmentFilter={showDepartmentFilter}
            pageTitle={pageTitle}
            hideBillingColumns={true}
        />
    );
}

ScreenFlexPage.layout = (props: { pageTitle?: string; pageHref?: string }) => ({
    breadcrumbs: [
        {
            title: props.pageTitle ?? 'สกรีน , เฟล็กซ์',
            href: props.pageHref ?? '/production/screen-flex',
        },
    ],
});
