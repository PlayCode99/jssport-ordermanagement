<?php
declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\OrderStatus;
use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use App\Models\Branch;
use App\Models\CatalogItem;
use App\Models\Order;
use App\Models\OrderRouting;
use App\Models\TeamInvitation;
use App\Support\Orders\OrderCompletion;
use App\Support\UserAccessControl;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    private const COUNTER_ORDERS_PER_PAGE = 10;

    /**
     * @var array<string, array<string, string>>|null
     */
    private ?array $catalogLookupCache = null;

    /**
     * @return array<string, string>
     */
    private function specificationLabelMap(): array
    {
        return [
            'pattern_id' => 'แพทเทิร์น',
            'fabric_id' => 'เนื้อผ้า',
            'neck_style_id' => 'แบบคอ',
            'collar_color' => 'สีคอ/ปก',
            'leg_style' => 'แบบขา',
            'leg_hem' => 'ปลายขา',
            'placket_style' => 'แบบสาบ',
            'placket_color' => 'สีสาบ',
            'sleeve_style' => 'แบบแขน',
            'sleeve_hem' => 'ปลายแขน',
            'sublimation_detail' => 'ซับลิเมชั่น',
            'screen_print_detail' => 'ข้อความสกรีน',
            'embroidery_code' => 'รหัสงานปัก',
        ];
    }

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

    /**
     * @return array<int, string>
     */
    private function storageKeysBySpecification(string $key, ?string $jobType): array
    {
        $isPants = is_string($jobType) && str_contains(mb_strtolower($jobType), 'กางเกง');

        return match ($key) {
            'pattern_id' => $isPants
                ? ['jssport.pants-patterns', 'jssport.shirt-patterns']
                : ['jssport.shirt-patterns', 'jssport.pants-patterns'],
            'fabric_id' => ['jssport.shirt-fabrics'],
            'neck_style_id' => ['jssport.shirt-collars'],
            'collar_color' => ['jssport.shirt-neck-colors', 'jssport.shirt-colors'],
            'leg_style' => ['jssport.pants-leg-style'],
            'leg_hem' => ['jssport.pants-leg-hem'],
            'placket_style' => ['jssport.shirt-plackets'],
            'placket_color' => ['jssport.shirt-placket-outer-colors', 'jssport.shirt-colors'],
            'sleeve_hem' => ['jssport.shirt-cuffs'],
            'sublimation_detail' => ['jssport.shirt-sublimation'],
            default => [],
        };
    }

    private function normalizeSpecificationValue(string $key, string $value, ?string $jobType): string
    {
        $lookups = $this->catalogLookups();

        foreach ($this->storageKeysBySpecification($key, $jobType) as $storageKey) {
            $mapped = $lookups[$storageKey][$value] ?? null;

            if ($mapped !== null && trim($mapped) !== '') {
                return $mapped;
            }
        }

        return $value;
    }

    /**
     * @param  array<string, mixed>  $specification
     * @return array<string, mixed>|null
     */
    private function decodeSpecificationPayload(array $specification): ?array
    {
        $raw = $specification['screen_print_detail'] ?? null;

        if (! is_string($raw) || trim($raw) === '') {
            return null;
        }

        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : null;
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
    private function buildSpecificationRows(array $values, array $definitions): array
    {
        $rows = [];

        foreach ($definitions as $definition) {
            $raw = $values[$definition['key']] ?? null;

            $value = '';
            if ($definition['type'] === 'catalog') {
                $value = $this->mapCatalogValue($definition['storage_keys'] ?? [], $raw);
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
        $payload = $this->decodeSpecificationPayload($specification);

        $shirtSpecs = is_array($payload['shirt_specs'] ?? null) ? $payload['shirt_specs'] : [];
        $pantsSpecs = is_array($payload['pants_specs'] ?? null) ? $payload['pants_specs'] : [];

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
        ]);

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
        ]);

        return [
            'shirt' => $shirtRows,
            'pants' => $pantsRows,
        ];
    }

    /**
     * @param  array<string, mixed>  $specification
     * @return array<int, array{name: string, size: string, number: string, quantity: int, unit_price: float, total_price: float}>
     */
    private function mapPersonalizationRows(array $specification): array
    {
        $decoded = $this->decodeSpecificationPayload($specification);
        if (! is_array($decoded)) {
            return [];
        }

        $rows = $decoded['personalization_rows'] ?? $decoded['rows'] ?? [];
        if (! is_array($rows)) {
            return [];
        }

        return collect($rows)
            ->map(function ($row): ?array {
                if (! is_array($row)) {
                    return null;
                }

                $name = trim((string) ($row['name'] ?? ''));
                $size = trim((string) ($row['size'] ?? ''));
                $number = trim((string) ($row['number'] ?? ''));
                $quantity = max(1, (int) ($row['quantity'] ?? 0));
                $unitPrice = max(0, (float) ($row['unit_price'] ?? 0));
                $totalPrice = isset($row['total_price']) ? max(0, (float) $row['total_price']) : $quantity * $unitPrice;

                if ($name === '' && $size === '' && $number === '') {
                    return null;
                }

                return [
                    'name' => $name !== '' ? $name : '-',
                    'size' => $size !== '' ? $size : '-',
                    'number' => $number !== '' ? $number : '-',
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'total_price' => $totalPrice,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $specification
     * @return array<int, array{label: string, value: string}>
     */
    private function mapSpecificationDisplay(array $specification, ?string $jobType = null): array
    {
        $labelMap = $this->specificationLabelMap();
        $personalizationRows = $this->mapPersonalizationRows($specification);
        $decoded = $this->decodeSpecificationPayload($specification);

        $rows = [];

        foreach ($labelMap as $key => $label) {
            $raw = $specification[$key] ?? null;
            $value = is_scalar($raw) ? trim((string) $raw) : '';

            if ($value === '') {
                continue;
            }

            if ($key === 'screen_print_detail' && is_array($decoded)) {
                $shirtText = trim((string) (($decoded['shirt_specs']['screen_text'] ?? '')));
                $pantsText = trim((string) (($decoded['pants_specs']['screen_text'] ?? '')));
                $text = trim(implode(' / ', array_values(array_filter([$shirtText, $pantsText], fn ($item) => $item !== ''))));
                $suffix = $personalizationRows !== [] ? ' ('.count($personalizationRows).' รายการ)' : '';

                if ($text !== '' || $suffix !== '') {
                    $rows[] = [
                        'label' => $label,
                        'value' => ($text !== '' ? $text : 'มีข้อมูล').$suffix,
                    ];
                }

                continue;
            }

            $normalized = $this->normalizeSpecificationValue($key, $value, $jobType);

            $rows[] = [
                'label' => $label,
                'value' => $normalized,
            ];
        }

        return $rows;
    }

    /**
     * @return Collection<int, OrderRouting>
     */
    /**
     * Counter date filters arrive as raw query strings (Y-m-d from the UI).
     */
    private function isValidFilterDate(mixed $value): bool
    {
        return is_string($value)
            && $value !== ''
            && CarbonImmutable::canBeCreatedFromFormat($value, 'Y-m-d');
    }

    /**
     * Date filters compare against the raw column instead of using whereDate(),
     * because wrapping the column in DATE() stops MySQL from using the
     * order_date / due_date indexes on a large orders table.
     */
    private function startOfFilterDay(string $value): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('Y-m-d', $value)->startOfDay();
    }

    private function startOfDayAfterFilterDay(string $value): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('Y-m-d', $value)->addDay()->startOfDay();
    }

    private function requiredRoutings(Order $order): Collection
    {
        return $order->routings
            ->filter(fn (OrderRouting $routing): bool => (bool) $routing->is_required)
            ->sortBy('id')
            ->values();
    }

    private function isRoutingReady(Collection $requiredRoutings, int $routingId): bool
    {
        $targetIndex = $requiredRoutings->search(fn (OrderRouting $routing): bool => $routing->id === $routingId);

        if ($targetIndex === false || ! is_int($targetIndex)) {
            return false;
        }

        if ($targetIndex === 0) {
            return true;
        }

        return $requiredRoutings
            ->take($targetIndex)
            ->every(fn (OrderRouting $routing): bool => in_array($routing->status->value, [
                RoutingStatus::Completed->value,
                RoutingStatus::Skipped->value,
            ], true));
    }

    private function incrementStageStats(array &$stats, string $key, ?OrderRouting $routing, Collection $requiredRoutings, bool $includeRevising = false): void
    {
        if ($routing === null) {
            return;
        }

        $isStageReady = $this->isRoutingReady($requiredRoutings, $routing->id);

        if ($routing->status === RoutingStatus::Pending && $isStageReady) {
            $stats[$key]['new_job'] += 1;

            return;
        }

        if ($routing->status === RoutingStatus::Pending && $key === 'embroidery') {
            $stats[$key]['new_job'] += 1;

            return;
        }

        if ($routing->status === RoutingStatus::InProgress) {
            if (array_key_exists('pending_inspect', $stats[$key])) {
                $stats[$key]['pending_inspect'] += 1;
            } else {
                $stats[$key]['assigned'] += 1;
            }

            return;
        }

        if ($includeRevising && $routing->status === RoutingStatus::Rejected) {
            $stats[$key]['revising'] += 1;

            return;
        }

        if (in_array($routing->status->value, [RoutingStatus::Completed->value, RoutingStatus::Skipped->value], true)) {
            $stats[$key]['completed'] += 1;
        }
    }

    private function isSublimationJobType(?string $jobType): bool
    {
        if (! is_string($jobType) || trim($jobType) === '') {
            return false;
        }

        $normalizedJobType = mb_strtolower($jobType);

        return str_contains($normalizedJobType, 'ซับ') || str_contains($normalizedJobType, 'sublimation');
    }

    private function resolveFirstMatchingRouting(Collection $requiredRoutings, array $stations): ?OrderRouting
    {
        $routing = $requiredRoutings
            ->first(fn (OrderRouting $item): bool => in_array($item->station_name->value, $stations, true));

        return $routing instanceof OrderRouting ? $routing : null;
    }

    private function resolveHeatPressLikeRouting(Collection $requiredRoutings): ?OrderRouting
    {
        $stations = [RoutingStationName::Screen->value, RoutingStationName::Flex->value];

        foreach ([RoutingStatus::Rejected, RoutingStatus::Pending, RoutingStatus::InProgress, RoutingStatus::Completed, RoutingStatus::Skipped] as $status) {
            $routing = $requiredRoutings
                ->first(fn (OrderRouting $item): bool => in_array($item->station_name->value, $stations, true)
                    && $item->status === $status);

            if ($routing instanceof OrderRouting) {
                return $routing;
            }
        }

        return null;
    }

    /**
     * Counter floor cards.
     *
     * IMPORTANT: this is a 1:1 port of `deriveFloorStats` in
     * resources/js/pages/counterStats.ts. The two must stay in sync — the
     * counter page renders these numbers straight from this output. Covered by
     * tests/Feature/Http/Controllers/CounterFloorStatsTest.php.
     *
     * @param  Collection<int, Order>  $orders
     * @return array<string, array<string, int>>
     */
    private function buildCounterFloorStats(Collection $orders): array
    {
        $stats = [
            'print_room' => ['new_job' => 0, 'new_job_qty' => 0, 'printer_1' => 0, 'printer_2' => 0, 'printer_3' => 0, 'completed' => 0, 'completed_qty' => 0],
            'cutting' => ['new_job' => 0, 'new_job_qty' => 0, 'assigned' => 0, 'completed' => 0, 'completed_qty' => 0],
            'heat_press' => ['new_job' => 0, 'new_job_qty' => 0, 'assigned' => 0, 'revising' => 0, 'completed' => 0, 'completed_qty' => 0],
            'sewing' => ['new_job' => 0, 'new_job_qty' => 0, 'assigned' => 0, 'completed' => 0, 'completed_qty' => 0],
            'embroidery' => ['new_job' => 0, 'new_job_qty' => 0, 'assigned' => 0, 'completed' => 0, 'completed_qty' => 0],
            'screen_flex' => ['new_job' => 0, 'new_job_qty' => 0, 'assigned' => 0, 'revising' => 0, 'completed' => 0, 'completed_qty' => 0],
            'qc' => ['new_job' => 0, 'new_job_qty' => 0, 'pending_inspect' => 0, 'completed' => 0, 'completed_qty' => 0],
            'shipping' => ['pending_ship' => 0, 'pending_ship_qty' => 0, 'store_pickup' => 0, 'courier' => 0, 'onsite_delivery' => 0, 'completed_qty' => 0],
        ];

        foreach ($orders as $order) {
            if (! $order instanceof Order) {
                continue;
            }

            $quantity = (int) ($order->items_quantity_total ?? 0);
            $requiredRoutings = $this->requiredRoutings($order);
            $counterStatus = $this->mapOrderToCounterStatus($order);

            $findStation = fn (array $stationNames): ?OrderRouting => $requiredRoutings
                ->first(fn (OrderRouting $routing): bool => in_array($routing->station_name?->value, $stationNames, true));

            $printRouting = $findStation([RoutingStationName::Print->value]);

            if ($printRouting !== null) {
                if ($printRouting->status === RoutingStatus::Pending) {
                    $stats['print_room']['new_job'] += 1;
                    $stats['print_room']['new_job_qty'] += $quantity;
                } elseif ($printRouting->status === RoutingStatus::InProgress) {
                    $machine = match ($printRouting->print_machine) {
                        'printer_2' => 'printer_2',
                        'printer_3' => 'printer_3',
                        default => 'printer_1',
                    };

                    $stats['print_room'][$machine] += 1;
                } elseif (in_array($printRouting->status, [RoutingStatus::Completed, RoutingStatus::Skipped], true)) {
                    $stats['print_room']['completed'] += 1;
                    $stats['print_room']['completed_qty'] += $quantity;
                }
            }

            $this->incrementCounterStageStats($stats, 'cutting', $findStation([RoutingStationName::Cutting->value]), $quantity);
            $this->incrementCounterStageStats($stats, 'sewing', $findStation([RoutingStationName::Sewing->value]), $quantity);
            $this->incrementCounterStageStats($stats, 'embroidery', $findStation([RoutingStationName::Embroidery->value]), $quantity);
            $this->incrementCounterStageStats($stats, 'qc', $findStation([RoutingStationName::Qc->value]), $quantity);

            $heatPressLikeRouting = $findStation([RoutingStationName::Screen->value, RoutingStationName::Flex->value]);

            if ($heatPressLikeRouting !== null) {
                $targetRoom = $this->isSublimationJobType($order->job_type) ? 'heat_press' : 'screen_flex';
                $this->incrementCounterStageStats($stats, $targetRoom, $heatPressLikeRouting, $quantity, true);
            }

            if ($counterStatus === 'shipping') {
                $stats['shipping']['pending_ship'] += 1;
                $stats['shipping']['pending_ship_qty'] += $quantity;
            }

            if ($counterStatus === 'completed') {
                $bucket = match ($order->delivery_method) {
                    'shipping' => 'courier',
                    'onsite' => 'onsite_delivery',
                    // 'pickup' plus any unset/unknown value falls back to the
                    // store bucket, exactly like the frontend helper does.
                    default => 'store_pickup',
                };

                $stats['shipping'][$bucket] += 1;
                $stats['shipping']['completed_qty'] += $quantity;
            }
        }

        return $stats;
    }

    /**
     * Port of `incrementStageStats` in resources/js/pages/counterStats.ts.
     *
     * @param  array<string, array<string, int>>  $stats
     */
    private function incrementCounterStageStats(array &$stats, string $key, ?OrderRouting $routing, int $quantity, bool $includeRevising = false): void
    {
        if ($routing === null) {
            return;
        }

        if ($routing->status === RoutingStatus::Pending) {
            $stats[$key]['new_job'] += 1;
            $stats[$key]['new_job_qty'] += $quantity;

            return;
        }

        if ($routing->status === RoutingStatus::InProgress) {
            if (array_key_exists('pending_inspect', $stats[$key])) {
                $stats[$key]['pending_inspect'] += 1;
            } else {
                $stats[$key]['assigned'] += 1;
            }

            return;
        }

        if ($includeRevising && $routing->status === RoutingStatus::Rejected) {
            $stats[$key]['revising'] += 1;

            return;
        }

        if (in_array($routing->status, [RoutingStatus::Completed, RoutingStatus::Skipped], true)) {
            $stats[$key]['completed'] += 1;
            $stats[$key]['completed_qty'] += $quantity;
        }
    }

    private function mapStationToCounterStatus(?string $stationName, ?string $jobType = null): string
    {
        return match ($stationName) {
            RoutingStationName::Print->value => 'print_room',
            RoutingStationName::Screen->value, RoutingStationName::Flex->value => 'screen_flex',
            RoutingStationName::Cutting->value => 'cutting',
            RoutingStationName::Embroidery->value => 'embroidery',
            RoutingStationName::Sewing->value => 'sewing',
            RoutingStationName::Qc->value => 'qc',
            RoutingStationName::Shipping->value => 'shipping',
            default => 'design',
        };
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>|null
     */
    private function resolveRoutingForDepartmentRow(array $row, string $department): ?array
    {
        $routings = collect($row['details']['routings'] ?? [])
            ->filter(fn ($routing): bool => is_array($routing) && isset($routing['station_name']))
            ->values();

        if ($routings->isEmpty()) {
            return null;
        }

        if (in_array($department, ['cutting', 'embroidery', 'sewing'], true)) {
            $found = $routings->first(fn (array $routing): bool => ($routing['station_name'] ?? null) === $department);

            return is_array($found) ? $found : null;
        }

        if ($department !== 'heat_press' && $department !== 'screen_flex') {
            return null;
        }

        $screenFlexRoutings = $routings
            ->filter(fn (array $routing): bool => in_array(($routing['station_name'] ?? null), ['screen', 'flex'], true))
            ->values();

        if ($screenFlexRoutings->isEmpty()) {
            return null;
        }

        foreach (['rejected', 'in_progress', 'pending', 'completed', 'skipped'] as $status) {
            $found = $screenFlexRoutings->first(fn (array $routing): bool => ($routing['status'] ?? null) === $status);

            if (is_array($found)) {
                return $found;
            }
        }

        $fallback = $screenFlexRoutings->first();

        return is_array($fallback) ? $fallback : null;
    }

    private function mapOrderToCounterStatus(Order $order): string
    {
        $requiredRoutings = $this->requiredRoutings($order);

        $shippingRouting = $requiredRoutings
            ->first(fn (OrderRouting $routing): bool => $routing->station_name === RoutingStationName::Shipping);

        if (OrderCompletion::isClosed($order)) {
            return 'completed';
        }

        if ($order->order_status === OrderStatus::Shipping) {
            return 'shipping';
        }

        if (
            $requiredRoutings->isNotEmpty()
            && $requiredRoutings->every(fn (OrderRouting $routing): bool => $routing->status === RoutingStatus::Pending)
        ) {
            return 'design';
        }

        $rejectedRouting = $requiredRoutings
            ->first(fn (OrderRouting $routing): bool => $routing->status === RoutingStatus::Rejected);

        if ($rejectedRouting instanceof OrderRouting) {
            return $this->mapStationToCounterStatus($rejectedRouting->station_name->value, $order->job_type);
        }

        $activeRouting = $requiredRoutings
            ->first(function (OrderRouting $routing) use ($requiredRoutings): bool {
                if ($routing->status === RoutingStatus::InProgress) {
                    return true;
                }

                if ($routing->status !== RoutingStatus::Pending) {
                    return false;
                }

                return $this->isRoutingReady($requiredRoutings, $routing->id);
            });

        if ($activeRouting instanceof OrderRouting) {
            return $this->mapStationToCounterStatus($activeRouting->station_name->value, $order->job_type);
        }

        return 'design';
    }

    public function __invoke(Request $request): Response
    {
        $actor = $request->user();
        $email = strtolower($actor->email);
        $filters = [
            'branch_id' => $request->query('branch_id'),
            'billing_date_from' => $request->query('billing_date_from'),
            'billing_date_to' => $request->query('billing_date_to'),
            'shipping_date_from' => $request->query('shipping_date_from'),
            'shipping_date_to' => $request->query('shipping_date_to'),
            'search' => $request->query('search'),
            'department' => $request->query('department'),
        ];

        $pendingInvitations = TeamInvitation::query()
            ->with(['inviter', 'team'])
            ->whereRaw('LOWER(email) = ?', [$email])
            ->whereNull('accepted_at')
            ->where(fn ($query) => $query
                ->whereNull('expires_at')
                ->orWhere('expires_at', '>=', now()))
            ->latest()
            ->get()
            ->map(fn (TeamInvitation $invitation) => [
                'code' => $invitation->code,
                'inviterName' => $invitation->inviter->name,
                'team' => [
                    'name' => $invitation->team->name,
                    'slug' => $invitation->team->slug,
                ],
            ]);

        $branchesQuery = Branch::query()->select(['id', 'branch_name'])->orderBy('branch_name');

        if ($actor->branch_id !== null) {
            UserAccessControl::applyBranchScope($branchesQuery, $actor, 'id');
        }

        $branches = $branchesQuery
            ->get()
            ->map(fn (Branch $branch): array => [
                'value' => (string) $branch->id,
                'label' => $branch->branch_name,
            ])
            ->values();

        // Filters below are applied to this base query only. It is then used twice:
        // once with lean columns to aggregate the floor cards over every matching
        // order, and once paginated with the heavy relations for the visible page.
        // Newest bill first. The id breaks ties so two orders opened in the same
        // second cannot swap places between pages and hide or repeat a row.
        $ordersQuery = Order::query()->latest('order_date')->latest('id');

        if ($actor->branch_id !== null) {
            UserAccessControl::applyBranchScope($ordersQuery, $actor);
        }

        if (($filters['search'] ?? null) !== null && $filters['search'] !== '') {
            $search = (string) $filters['search'];

            $ordersQuery->where(function (Builder $builder) use ($search): void {
                $builder
                    ->where('order_code', 'like', "%{$search}%")
                    ->orWhere('job_name', 'like', "%{$search}%")
                    ->orWhere('job_type', 'like', "%{$search}%")
                    ->orWhereHas('customer', function (Builder $customerQuery) use ($search): void {
                        $customerQuery->where('customer_name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('receipts', function (Builder $receiptQuery) use ($search): void {
                        $receiptQuery->where('receipt_code', 'like', "%{$search}%");
                    });
            });
        }

        if (($filters['branch_id'] ?? null) !== null && $filters['branch_id'] !== '') {
            $targetBranchId = (int) $filters['branch_id'];

            if (! UserAccessControl::canAccessBranch($actor, $targetBranchId)) {
                abort(403);
            }

            $ordersQuery->where('branch_id', $targetBranchId);
        }

        if ($this->isValidFilterDate($filters['billing_date_from'] ?? null)) {
            $ordersQuery->where('order_date', '>=', $this->startOfFilterDay((string) $filters['billing_date_from']));
        }

        if ($this->isValidFilterDate($filters['billing_date_to'] ?? null)) {
            $ordersQuery->where('order_date', '<', $this->startOfDayAfterFilterDay((string) $filters['billing_date_to']));
        }

        if ($this->isValidFilterDate($filters['shipping_date_from'] ?? null)) {
            $ordersQuery->where('due_date', '>=', $this->startOfFilterDay((string) $filters['shipping_date_from']));
        }

        if ($this->isValidFilterDate($filters['shipping_date_to'] ?? null)) {
            $ordersQuery->where('due_date', '<', $this->startOfDayAfterFilterDay((string) $filters['shipping_date_to']));
        }

        if (($filters['department'] ?? null) !== null && $filters['department'] !== '') {
            $department = (string) $filters['department'];

            if (in_array($department, ['heat_press', 'embroidery', 'cutting', 'sewing', 'screen_flex'], true)) {
                $stationNames = match ($department) {
                    'heat_press', 'screen_flex' => [RoutingStationName::Screen->value, RoutingStationName::Flex->value],
                    'cutting' => [RoutingStationName::Cutting->value],
                    'embroidery' => [RoutingStationName::Embroidery->value],
                    'sewing' => [RoutingStationName::Sewing->value],
                    default => [],
                };

                if ($stationNames !== []) {
                    $ordersQuery->whereHas('routings', function (Builder $routingQuery) use ($stationNames): void {
                        $routingQuery
                            ->where('is_required', true)
                            ->whereIn('station_name', $stationNames)
                            ->whereIn('status', [
                                RoutingStatus::Pending->value,
                                RoutingStatus::InProgress->value,
                                RoutingStatus::Rejected->value,
                                RoutingStatus::Completed->value,
                                RoutingStatus::Skipped->value,
                            ]);
                    });
                }
            }
        }

        // Floor cards summarise EVERY matching order, so they must not be limited to
        // the current page — but they only need a handful of columns, so this query
        // stays cheap even with tens of thousands of orders.
        $statsOrders = (clone $ordersQuery)
            ->reorder()
            ->select(['id', 'job_type', 'order_status', 'delivery_method'])
            ->with(['routings:id,order_id,station_name,status,is_required,print_machine'])
            ->withSum('items as items_quantity_total', 'quantity')
            ->get();

        $floorStats = $this->buildCounterFloorStats($statsOrders);

        // Only the visible page pays for the heavy relations and the detail payload.
        $ordersPaginator = (clone $ordersQuery)
            ->with([
                'customer:id,customer_name,phone,line_fb',
                'branch:id,branch_name',
                'creatorUser:id,name',
                'receipts',
                'routings.assignedUser:id,name',
                'routings.cuttingTeam:id,team_name',
                'routings.sewingTeam:id,team_name',
                'routings.embroideryTeam:id,team_name',
                'routings.screenTeam:id,team_name',
                'routings.heatPressMachine:id,machine_name',
                'items',
                'specification',
            ])
            ->paginate(self::COUNTER_ORDERS_PER_PAGE)
            ->withQueryString();

        $orders = collect($ordersPaginator->items())->map(function (Order $order): array {
            $totalPaid = (float) $order->receipts->sum('amount_paid');
            $paymentStatus = $totalPaid >= (float) $order->net_amount
                ? 'paid'
                : ($totalPaid > 0 ? 'deposit' : 'pending');

            $latestReceipt = $order->receipts->sortByDesc('payment_date')->first();
            $specification = $order->specification?->only([
                'pattern_id',
                'fabric_id',
                'neck_style_id',
                'collar_color',
                'leg_style',
                'leg_hem',
                'placket_style',
                'placket_color',
                'sleeve_style',
                'sleeve_hem',
                'sublimation_detail',
                'screen_print_detail',
                'embroidery_code',
            ]);

            return [
                'id' => $order->id,
                'billing_date' => $order->order_date?->format('Y-m-d') ?? '',
                'billing_time' => $order->order_date?->format('H:i') ?? '',
                'due_date' => $order->due_date?->format('Y-m-d') ?? '',
                'order_code' => $order->order_code,
                'order_item_count' => (int) $order->items->sum(fn ($item): int => (int) $item->quantity),
                'has_order_pdf' => false,
                'branch_name' => $order->branch?->branch_name ?? '-',
                'customer_name' => $order->customer?->customer_name ?? '-',
                'job_type' => $order->job_type,
                'order_status' => $order->order_status->value,
                'status' => $this->mapOrderToCounterStatus($order),
                'receipt_code' => $latestReceipt?->receipt_code,
                'payment_status' => $paymentStatus,
                'has_payment_pdf' => $latestReceipt ? $latestReceipt->getFirstMediaUrl('payment_slips') !== '' : false,
                'receiver_name' => $order->creatorUser?->name ?? '-',
                'details' => [
                    'order_code' => $order->order_code,
                    'job_name' => $order->job_name,
                    'job_type' => $order->job_type,
                    'order_status' => $order->order_status->value,
                    'billing_date' => $order->order_date?->format('Y-m-d H:i:s'),
                    'due_date' => $order->due_date?->format('Y-m-d H:i:s'),
                    'branch_name' => $order->branch?->branch_name,
                    'delivery_method' => $order->delivery_method,
                    'shipping_address' => $order->shipping_address,
                    'shipping_delivery_info' => $order->shipping_delivery_info,
                    'customer' => [
                        'name' => $order->customer?->customer_name,
                        'phone' => $order->customer?->phone,
                        'line_fb' => $order->customer?->line_fb,
                    ],
                    'pricing' => [
                        'total_amount' => (float) $order->total_amount,
                        'discount_percent' => (float) $order->discount_percent,
                        'discount_amount' => (float) $order->discount_amount,
                        'net_amount' => (float) $order->net_amount,
                        'paid_amount' => $totalPaid,
                    ],
                    'specification' => $specification,
                    'specification_display' => $this->mapSpecificationDisplay($specification ?? [], $order->job_type),
                    'spec_sections' => $this->mapSpecificationSections($specification ?? []),
                    'personalization_rows' => $this->mapPersonalizationRows($specification ?? []),
                    'items' => $order->items
                        ->map(fn ($item): array => [
                            'item_type' => $item->item_type,
                            'size_group' => $item->size_group,
                            'size_label' => $item->size_label,
                            'quantity' => (int) $item->quantity,
                            'unit_price' => (float) $item->unit_price,
                            'total_price' => (float) $item->total_price,
                        ])
                        ->values(),
                    'routings' => $order->routings
                        ->map(fn ($routing): array => [
                            'id' => $routing->id,
                            'is_required' => (bool) $routing->is_required,
                            'station_name' => $routing->station_name->value,
                            'status' => $routing->status->value,
                            'print_machine' => $routing->print_machine,
                            'assigned_user' => $routing->assignedUser?->name,
                            'cutting_team_name' => $routing->cuttingTeam?->team_name,
                            'sewing_team_name' => $routing->sewingTeam?->team_name,
                            'embroidery_team_name' => $routing->embroideryTeam?->team_name,
                            'screen_team_name' => $routing->screenTeam?->team_name,
                            'heat_press_machine_name' => $routing->heatPressMachine?->machine_name,
                            'rework_note' => $routing->rework_note,
                            'created_at' => $routing->created_at?->format('Y-m-d H:i:s'),
                            'started_at' => $routing->started_at?->format('Y-m-d H:i:s'),
                            'completed_at' => $routing->completed_at?->format('Y-m-d H:i:s'),
                        ])
                        ->values(),
                    'receipts' => $order->receipts
                        ->map(fn ($receipt): array => [
                            'receipt_code' => $receipt->receipt_code,
                            'payment_date' => $receipt->payment_date?->format('Y-m-d H:i:s'),
                            'payment_type' => $receipt->payment_type->value,
                            'payment_method' => $receipt->payment_method->value,
                            'amount_paid' => (float) $receipt->amount_paid,
                            'note' => $receipt->note,
                        ])
                        ->values(),
                    'artwork_url' => $order->artwork_url,
                    'shirt_artwork_urls' => $order->shirt_artwork_urls,
                    'pants_artwork_urls' => $order->pants_artwork_urls,
                    'reference_designs' => $order->reference_designs,
                ],
            ];
        });

        if (($filters['department'] ?? null) !== null && $filters['department'] !== '') {
            $department = (string) $filters['department'];

            if (in_array($department, ['heat_press', 'embroidery', 'cutting', 'sewing', 'screen_flex'], true)) {
                $orders = $orders
                    ->map(function (array $row) use ($department): ?array {
                        $routing = $this->resolveRoutingForDepartmentRow($row, $department);

                        if (! is_array($routing)) {
                            return null;
                        }

                        $routingStatus = (string) ($routing['status'] ?? '');

                        if (! in_array($routingStatus, ['pending', 'in_progress', 'rejected', 'completed', 'skipped'], true)) {
                            return null;
                        }

                        $row['status'] = in_array($routingStatus, ['completed', 'skipped'], true)
                            ? 'completed'
                            : $department;

                        return $row;
                    })
                    ->filter()
                    ->values();
            } else {
                $orders = $orders->filter(fn (array $row): bool => $row['status'] === $department)->values();
            }
        }

        return Inertia::render('Counter', [
            'pendingInvitations' => $pendingInvitations,
            'filters' => $filters,
            'branches' => $branches,
            'floorStats' => $floorStats,
            'orders' => $orders->values(),
            'pagination' => [
                'current_page' => $ordersPaginator->currentPage(),
                'last_page' => $ordersPaginator->lastPage(),
                'per_page' => $ordersPaginator->perPage(),
                'total' => $ordersPaginator->total(),
                'from' => $ordersPaginator->firstItem(),
                'to' => $ordersPaginator->lastItem(),
            ],
        ]);
    }
}
