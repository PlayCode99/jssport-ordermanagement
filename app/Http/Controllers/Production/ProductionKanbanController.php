<?php

declare(strict_types=1);

namespace App\Http\Controllers\Production;

use App\Support\Production\ProductionCostCalculation;
use App\Enums\GarmentCategory;
use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\CatalogItem;
use App\Models\CuttingTeam;
use App\Models\EmbroideryTeam;
use App\Models\GarmentOperation;
use App\Models\GarmentType;
use App\Models\HeatPressMachine;
use App\Models\Order;
use App\Models\PieceworkPrice;
use App\Models\ScreenTeam;
use App\Models\SewingTeam;
use App\Support\UserAccessControl;
use Illuminate\Support\Collection;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ProductionKanbanController extends Controller
{
    use ProductionCostCalculation;

    /** Same page size as the counter, so both lists behave the same way. */
    private const ORDERS_PER_PAGE = 10;

    /**
     * @var array<string, array<string, string>>|null
     */
    private ?array $catalogLookupCache = null;

    /**
     * @return array<string, array<string, string>>
     */
    private function catalogLookups(): array
    {
        if ($this->catalogLookupCache !== null) {
            return $this->catalogLookupCache;
        }

        $keys = [
            'jssport.shirt-patterns',
            'jssport.shirt-fabrics',
            'jssport.shirt-collars',
            'jssport.shirt-colors',
            'jssport.shirt-fabric-colors',
            'jssport.shirt-neck-colors',
            'jssport.shirt-placket-outer-colors',
            'jssport.shirt-placket-inner-colors',
            'jssport.shirt-screen-colors',
            'jssport.shirt-embroidery-colors',
            'jssport.shirt-plackets',
            'jssport.shirt-cuffs',
            'jssport.shirt-panels',
            'jssport.shirt-sublimation',
            'jssport.pants-patterns',
            'jssport.pants-leg-style',
            'jssport.pants-leg-hem',
        ];

        $grouped = CatalogItem::query()
            ->whereIn('storage_key', $keys)
            ->where('active', true)
            ->get(['storage_key', 'item_id', 'name'])
            ->groupBy('storage_key');

        $lookup = [];

        foreach ($keys as $key) {
            $lookup[$key] = ($grouped[$key] ?? collect())
                ->mapWithKeys(fn (CatalogItem $item): array => [(string) $item->item_id => $item->name])
                ->all();
        }

        $this->catalogLookupCache = $lookup;

        return $lookup;
    }

    private function mapCatalogValue(array $storageKeys, mixed $rawValue): string
    {
        $value = trim((string) $rawValue);

        if ($value === '') {
            return '';
        }

        $lookups = $this->catalogLookups();

        foreach ($storageKeys as $storageKey) {
            $mapped = $lookups[$storageKey][$value] ?? null;

            if (is_string($mapped) && trim($mapped) !== '') {
                return $mapped;
            }
        }

        return $value;
    }

    /**
     * @param  array<string, mixed>  $values
     * @param  array<int, array{key: string, label: string, type: string, storage_keys?: array<int, string>}>  $definitions
     * @return array<int, array{label: string, value: string}>
     */
    private function buildSpecificationRows(array $values, array $definitions, array $savedLabels = []): array
    {
        $rows = [];

        foreach ($definitions as $definition) {
            $raw = $values[$definition['key']] ?? null;

            $value = '';

            if ($definition['type'] === 'catalog') {
                // An order records the master-data name it was saved with. Renaming
                // a colour later must not rewrite what an old work sheet says, so
                // the saved text wins and the catalog is only a fallback for orders
                // recorded before those names were being kept.
                $saved = $savedLabels[$definition['key']] ?? null;

                $value = is_string($saved) && trim($saved) !== ''
                    ? trim($saved)
                    : $this->mapCatalogValue($definition['storage_keys'] ?? [], $raw);
            } else {
                $value = trim((string) $raw);
            }

            if ($value === '') {
                continue;
            }

            $rows[] = [
                'label' => $definition['label'],
                'value' => $value,
            ];
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $specification
     * @return array{shirt: array<int, array{label: string, value: string}>, pants: array<int, array{label: string, value: string}>}
     */
    private function mapSpecificationSections(array $specification): array
    {
        $raw = $specification['screen_print_detail'] ?? null;
        $decoded = is_string($raw) && trim($raw) !== '' ? json_decode($raw, true) : null;

        if (is_string($decoded)) {
            $decoded = json_decode($decoded, true);
        }

        $shirtSpecs = is_array($decoded['shirt_specs'] ?? null)
            ? $decoded['shirt_specs']
            : (is_array($decoded['shirtSpecs'] ?? null) ? $decoded['shirtSpecs'] : []);

        $pantsSpecs = is_array($decoded['pants_specs'] ?? null)
            ? $decoded['pants_specs']
            : (is_array($decoded['pantsSpecs'] ?? null) ? $decoded['pantsSpecs'] : []);

        if ($shirtSpecs === [] && $pantsSpecs === []) {
            $shirtSpecs = [
                'pattern_id' => $specification['pattern_id'] ?? null,
                'fabric_id' => $specification['fabric_id'] ?? null,
                'neck_style_id' => $specification['neck_style_id'] ?? null,
                'sleeve_style_text' => $specification['sleeve_style'] ?? null,
                'sleeve_cuff_id' => $specification['sleeve_hem'] ?? null,
                'placket_style_id' => $specification['placket_style'] ?? null,
                'placket_outer_color_id' => $specification['placket_color'] ?? null,
                'sublimation_id' => $specification['sublimation_detail'] ?? null,
                'embroidery_code_text' => $specification['embroidery_code'] ?? null,
            ];

            $pantsSpecs = [
                'pattern_id' => $specification['pattern_id'] ?? null,
                'fabric_id' => $specification['fabric_id'] ?? null,
                'leg_style_id' => $specification['leg_style'] ?? null,
                'leg_cuff_id' => $specification['leg_hem'] ?? null,
                'sublimation_id' => $specification['sublimation_detail'] ?? null,
                'embroidery_code_text' => $specification['embroidery_code'] ?? null,
            ];
        }

        $savedLabels = is_array($decoded['spec_labels'] ?? null) ? $decoded['spec_labels'] : [];
        $shirtLabels = is_array($savedLabels['shirt'] ?? null) ? $savedLabels['shirt'] : [];
        $pantsLabels = is_array($savedLabels['pants'] ?? null) ? $savedLabels['pants'] : [];

        $shirtRows = $this->buildSpecificationRows($shirtSpecs, [
            ['key' => 'pattern_id', 'label' => 'แพทเทิร์น', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-patterns']],
            ['key' => 'fabric_id', 'label' => 'เนื้อผ้า', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-fabrics']],
            ['key' => 'fabric_color_id', 'label' => 'สีผ้า', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-fabric-colors', 'jssport.shirt-colors']],
            ['key' => 'neck_style_id', 'label' => 'แบบคอ', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-collars']],
            ['key' => 'neck_color_id', 'label' => 'สีแบบคอ', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-neck-colors', 'jssport.shirt-colors']],
            ['key' => 'collar_id', 'label' => 'ปก', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-collars']],
            ['key' => 'placket_style_id', 'label' => 'แบบสาบ', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-plackets']],
            ['key' => 'placket_outer_color_id', 'label' => 'สีสาบ (นอก)', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-placket-outer-colors', 'jssport.shirt-colors']],
            ['key' => 'placket_inner_color_id', 'label' => 'สีสาบ (ใน)', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-placket-inner-colors', 'jssport.shirt-colors']],
            ['key' => 'sleeve_cuff_id', 'label' => 'ปลายแขน', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-cuffs']],
            ['key' => 'panel_style_id', 'label' => 'แบบต่อ', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-panels']],
            ['key' => 'screen_color_id', 'label' => 'สีสกรีน', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-screen-colors', 'jssport.shirt-colors']],
            ['key' => 'embroidery_color_id', 'label' => 'สีงานปัก', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-embroidery-colors', 'jssport.shirt-colors']],
            ['key' => 'sublimation_id', 'label' => 'ซับลิเมชั่น', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-sublimation']],
            ['key' => 'sleeve_style_text', 'label' => 'แบบแขน', 'type' => 'text'],
            ['key' => 'piping_style_text', 'label' => 'แบบกุ้น', 'type' => 'text'],
            ['key' => 'stripe_style_text', 'label' => 'แบบลา', 'type' => 'text'],
            ['key' => 'screen_text', 'label' => 'ข้อความสกรีน', 'type' => 'text'],
            ['key' => 'embroidery_code_text', 'label' => 'รหัสงานปัก', 'type' => 'text'],
            ['key' => 'embroidery_note_text', 'label' => 'รายละเอียดปัก', 'type' => 'text'],
        ], $shirtLabels);

        $pantsRows = $this->buildSpecificationRows($pantsSpecs, [
            ['key' => 'pattern_id', 'label' => 'แพทเทิร์น', 'type' => 'catalog', 'storage_keys' => ['jssport.pants-patterns']],
            ['key' => 'fabric_id', 'label' => 'เนื้อผ้า', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-fabrics']],
            ['key' => 'fabric_color_id', 'label' => 'สีผ้า', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-fabric-colors', 'jssport.shirt-colors']],
            ['key' => 'leg_style_id', 'label' => 'แบบขา', 'type' => 'catalog', 'storage_keys' => ['jssport.pants-leg-style']],
            ['key' => 'leg_cuff_id', 'label' => 'ปลายขา', 'type' => 'catalog', 'storage_keys' => ['jssport.pants-leg-hem']],
            ['key' => 'screen_color_id', 'label' => 'สีสกรีน', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-screen-colors', 'jssport.shirt-colors']],
            ['key' => 'embroidery_color_id', 'label' => 'สีงานปัก', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-embroidery-colors', 'jssport.shirt-colors']],
            ['key' => 'sublimation_id', 'label' => 'ซับลิเมชั่น', 'type' => 'catalog', 'storage_keys' => ['jssport.shirt-sublimation']],
            ['key' => 'panel_style_text', 'label' => 'แบบต่อ', 'type' => 'text'],
            ['key' => 'stripe_style_text', 'label' => 'แบบลา', 'type' => 'text'],
            ['key' => 'screen_text', 'label' => 'ข้อความสกรีน', 'type' => 'text'],
            ['key' => 'embroidery_code_text', 'label' => 'รหัสงานปัก', 'type' => 'text'],
            ['key' => 'embroidery_note_text', 'label' => 'รายละเอียดปัก', 'type' => 'text'],
        ], $pantsLabels);

        return [
            'shirt' => $shirtRows,
            'pants' => $pantsRows,
        ];
    }

    public function index(Request $request): Response
    {
        $department = (string) $request->query('department', 'all');

        return $this->renderKanban('Production/Kanban', $department, true, 'Production Kanban', '/production/kanban');
    }

    public function printRoom(): Response
    {
        return $this->renderKanban('Production/PrintRoom', 'print_room', false, 'ห้องพิมพ์', '/production/print-room');
    }

    public function heatPress(): Response
    {
        return $this->renderKanban('Production/HeatPress', 'heat_press', false, 'ห้องอัด', '/production/heat-press');
    }

    public function embroidery(): Response
    {
        return $this->renderKanban('Production/Embroidery', 'embroidery', false, 'ห้องปัก', '/production/embroidery');
    }

    public function cutting(): Response
    {
        return $this->renderKanban('Production/Cutting', 'cutting', false, 'ห้องตัด', '/production/cutting');
    }

    public function sewing(): Response
    {
        return $this->renderKanban('Production/Sewing', 'sewing', false, 'ห้องเย็บ', '/production/sewing');
    }

    public function screenFlex(): Response
    {
        return $this->renderKanban('Production/ScreenFlex', 'screen_flex', false, 'สกรีน , เฟล็กซ์', '/production/screen-flex');
    }

    public function qc(): Response
    {
        return $this->renderKanban('Production/Qc', 'qc', false, 'ห้องตรวจสอบ', '/production/qc');
    }

    public function shipping(): Response
    {
        return $this->renderKanban('Production/Shipping', 'shipping', false, 'ห้องจัดส่ง', '/production/shipping');
    }

    private function renderKanban(
        string $pageComponent,
        string $department,
        bool $showDepartmentFilter,
        string $pageTitle,
        string $pageHref,
    ): Response
    {
        $allowedDepartments = ['all', 'design', 'print_room', 'heat_press', 'embroidery', 'cutting', 'sewing', 'screen_flex', 'qc', 'shipping'];
        $initialDepartmentFilter = in_array($department, $allowedDepartments, true) ? $department : 'all';
        $actor = request()->user();

        $ordersQuery = Order::with([
            'customer',
            'branch',
            'items',
            'routings.cuttingTeam',
            'routings.sewingTeam',
            'routings.embroideryTeam',
            'routings.screenTeam',
            'routings.heatPressMachine',
            'routings.assignedUser',
            'receipts.cashierUser',
            'statusHistories.user',
            'creatorUser',
            'media',
            'specification',
        ])
            ->whereNotIn('order_status', [OrderStatus::Completed, OrderStatus::Cancelled])
            // Newest bill first, matching the counter. The id breaks ties so two
            // orders opened in the same second keep a stable order across pages.
            ->latest('order_date')
            ->latest('id');

        if ($initialDepartmentFilter === 'shipping' && $actor !== null) {
            UserAccessControl::applyBranchScope($ordersQuery, $actor);
        }

        $ordersPaginator = $ordersQuery
            ->paginate(self::ORDERS_PER_PAGE)
            ->withQueryString();

        $orders = collect($ordersPaginator->items());

        $cuttingTeams = CuttingTeam::query()
            ->where('is_active', true)
            ->orderBy('team_name')
            ->orderBy('id')
            ->get(['id', 'team_name', 'is_active', 'created_at', 'updated_at']);

        $embroideryTeams = EmbroideryTeam::query()
            ->where('is_active', true)
            ->orderBy('team_name')
            ->orderBy('id')
            ->get(['id', 'team_name', 'is_active', 'created_at', 'updated_at']);

        $sewingTeams = SewingTeam::query()
            ->where('is_active', true)
            ->orderBy('team_name')
            ->orderBy('id')
            ->get(['id', 'team_name', 'is_active', 'created_at', 'updated_at']);

        $screenTeams = ScreenTeam::query()
            ->where('is_active', true)
            ->orderBy('station_name')
            ->orderBy('team_name')
            ->orderBy('id')
            ->get(['id', 'team_name', 'station_name', 'is_active', 'created_at', 'updated_at']);

        $heatPressMachines = HeatPressMachine::query()
            ->where('is_active', true)
            ->orderBy('machine_name')
            ->orderBy('id')
            ->get(['id', 'machine_name', 'is_active', 'created_at', 'updated_at']);

        $priceMasters = PieceworkPrice::select('id', 'code', 'name', 'price_per_unit')->get();

        $fabricLookup = CatalogItem::query()
            ->where('storage_key', 'jssport.shirt-fabrics')
            ->where('active', true)
            ->get(['item_id', 'name'])
            ->mapWithKeys(fn (CatalogItem $item): array => [
                (string) $item->item_id => $item->name,
            ])
            ->all();

        if ($initialDepartmentFilter === 'shipping' && $actor !== null) {
            $branches = collect(UserAccessControl::branchOptionsVisibleTo($actor))
                ->map(fn (array $branch): array => [
                    'value' => $branch['branch_name'],
                    'label' => $branch['branch_name'],
                ])
                ->values();
        } else {
            $branches = Branch::select('id', 'branch_name')
                ->orderBy('branch_name')
                ->get()
                ->map(fn ($branch) => [
                    'value' => $branch->branch_name,
                    'label' => $branch->branch_name,
                ]);
        }

        $specSectionsMap = $orders
            ->mapWithKeys(fn (Order $order): array => [
                (string) $order->id => $this->mapSpecificationSections($order->specification?->toArray() ?? []),
            ])
            ->all();

        $garmentTypesByCategory = GarmentType::query()
            ->with(['operations' => fn ($query) => $query
                ->where('is_active', true)
                ->orderBy('display_order')
                ->orderBy('id')])
            ->where('is_active', true)
            ->orderBy('category')
            ->orderBy('display_order')
            ->orderBy('id')
            ->get()
            ->groupBy('category');

        $productionPricingMap = $orders
            ->mapWithKeys(fn (Order $order): array => [
                (string) $order->id => $this->buildProductionPricingSummary($order, $garmentTypesByCategory),
            ])
            ->all();

        return Inertia::render($pageComponent, [
            'orders' => $orders->values(),
            'pagination' => [
                'current_page' => $ordersPaginator->currentPage(),
                'last_page' => $ordersPaginator->lastPage(),
                'per_page' => $ordersPaginator->perPage(),
                'total' => $ordersPaginator->total(),
                'from' => $ordersPaginator->firstItem(),
                'to' => $ordersPaginator->lastItem(),
            ],
            'branches' => $branches,
            'priceMasters' => $priceMasters,
            'fabricLookup' => $fabricLookup,
            'specCatalogLookups' => $this->catalogLookups(),
            'specSectionsMap' => $specSectionsMap,
            'useBackendSpecMapOnly' => (bool) config('production.specs.use_backend_map_only', false),
            'productionPricingMap' => $productionPricingMap,
            'cuttingTeams' => $cuttingTeams,
            'sewingTeams' => $sewingTeams,
            'embroideryTeams' => $embroideryTeams,
            'screenTeams' => $screenTeams,
            'heatPressMachines' => $heatPressMachines,
            'initialDepartmentFilter' => $initialDepartmentFilter,
            'showDepartmentFilter' => $showDepartmentFilter,
            'pageTitle' => $pageTitle,
            'pageHref' => $pageHref,
        ]);
    }
}
