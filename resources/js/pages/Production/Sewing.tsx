import { ProductionBoardPage } from '@/components/domain/production/ProductionBoardPage';
import type { ProductionDepartmentFilter } from '@/components/domain/production/ProductionBoardPage';
import type { Order, SewingTeam } from '@/types/models';

type SewingPageProps = {
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
    sewingTeams?: SewingTeam[];
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

export default function SewingPage({
    orders,
    pagination,
    branches = [],
    sewingTeams = [],
    fabricLookup = {},
    specSectionsMap = {},
    initialDepartmentFilter = 'sewing',
    showDepartmentFilter = false,
    pageTitle = 'ห้องเย็บ',
}: SewingPageProps) {
    return (
        <ProductionBoardPage
            orders={orders}
            pagination={pagination}
            branches={branches}
            sewingTeams={sewingTeams}
            fabricLookup={fabricLookup}
            specSectionsMap={specSectionsMap}
            initialDepartmentFilter={initialDepartmentFilter}
            showDepartmentFilter={showDepartmentFilter}
            pageTitle={pageTitle}
            hideBillingColumns={true}
        />
    );
}

SewingPage.layout = (props: { pageTitle?: string; pageHref?: string }) => ({
    breadcrumbs: [
        {
            title: props.pageTitle ?? 'ห้องเย็บ',
            href: props.pageHref ?? '/production/sewing',
        },
    ],
});
