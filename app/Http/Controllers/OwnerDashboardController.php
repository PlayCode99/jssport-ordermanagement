<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\GarmentCategory;
use App\Enums\OrderStatus;
use App\Enums\RoutingStatus;
use App\Models\GarmentType;
use App\Models\Order;
use App\Support\Orders\OrderCompletion;
use App\Support\Production\ProductionCostCalculation;
use App\Support\UserAccessControl;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Owner-only overview. Every figure here is derived from the same sources the
 * rest of the app already uses — production costing comes from the shared
 * ProductionCostCalculation trait rather than a second formula.
 */
class OwnerDashboardController extends Controller
{
    use ProductionCostCalculation;

    /**
     * Statuses that count as "still being worked on". Everything except the two
     * terminal ones, matching how the counter treats an order as open.
     *
     * @var array<int, string>
     */
    private const IN_PROGRESS_STATUSES = [
        'draft',
        'designing',
        'waiting_customer_confirm',
        'confirmed',
        'in_production',
        'qc_checking',
        'qc_rejected',
        'shipping',
    ];

    public function __invoke(Request $request): Response
    {
        $actor = $request->user();

        abort_unless($actor !== null && $actor->is_active && $actor->access_role === AccessRole::Owner, 403);

        $filters = [
            'date_from' => $this->validDate($request->query('date_from')),
            'date_to' => $this->validDate($request->query('date_to')),
            'branch_id' => $request->query('branch_id') !== null && $request->query('branch_id') !== ''
                ? (int) $request->query('branch_id')
                : null,
            'job_type' => $request->query('job_type') !== '' ? $request->query('job_type') : null,
        ];

        if ($filters['branch_id'] !== null && ! UserAccessControl::canAccessBranch($actor, $filters['branch_id'])) {
            abort(403);
        }

        $orders = $this->filteredOrders($filters, $actor)
            ->with(['items', 'specification', 'routings'])
            ->get();

        $garmentTypesByCategory = GarmentType::query()
            ->with(['operations' => fn ($query) => $query->orderBy('display_order')->orderBy('id')])
            ->where('is_active', true)
            ->get()
            ->groupBy(fn (GarmentType $type): string => $type->category->value);

        return Inertia::render('Dashboard/Owner', [
            'filters' => $filters,
            'filterOptions' => $this->filterOptions($actor),
            'expense' => $this->buildExpenseSummary($orders, $garmentTypesByCategory),
            'revenue' => $this->buildRevenueSummary($orders),
            'orderCounts' => $this->buildOrderCounts($orders),
            'jobTypeBreakdown' => $this->buildJobTypeBreakdown($orders),
            'garmentTypeUsage' => $this->buildGarmentTypeUsage($orders, $garmentTypesByCategory),
            'calendar' => $this->buildCalendar($request, $actor),
        ]);
    }

    private function validDate(mixed $value): ?string
    {
        return is_string($value) && $value !== '' && Carbon::canBeCreatedFromFormat($value, 'Y-m-d')
            ? $value
            : null;
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Builder<Order>
     */
    private function filteredOrders(array $filters, $actor): Builder
    {
        // Cancelled orders never count: they were not made and never will be.
        $query = Order::query()->where('order_status', '!=', OrderStatus::Cancelled->value);

        if ($actor->branch_id !== null) {
            UserAccessControl::applyBranchScope($query, $actor);
        }

        if ($filters['date_from'] !== null) {
            $query->where('order_date', '>=', Carbon::createFromFormat('Y-m-d', $filters['date_from'])->startOfDay());
        }

        if ($filters['date_to'] !== null) {
            $query->where('order_date', '<', Carbon::createFromFormat('Y-m-d', $filters['date_to'])->addDay()->startOfDay());
        }

        if ($filters['branch_id'] !== null) {
            $query->where('branch_id', $filters['branch_id']);
        }

        if ($filters['job_type'] !== null) {
            $query->where('job_type', $filters['job_type']);
        }

        return $query;
    }

    /**
     * @return array<string, mixed>
     */
    private function filterOptions($actor): array
    {
        $branchesQuery = \App\Models\Branch::query()->select(['id', 'branch_name'])->orderBy('branch_name');

        if ($actor->branch_id !== null) {
            UserAccessControl::applyBranchScope($branchesQuery, $actor, 'id');
        }

        return [
            'branches' => $branchesQuery->get()
                ->map(fn ($branch): array => ['value' => (string) $branch->id, 'label' => $branch->branch_name])
                ->values()
                ->all(),
            'jobTypes' => $this->masterJobTypes()
                ->map(fn (string $type): array => ['value' => $type, 'label' => $type])
                ->values()
                ->all(),
        ];
    }

    /**
     * Production cost split by garment, using the shared costing trait so these
     * totals always agree with the production sheets.
     *
     * @param  Collection<int, Order>  $orders
     * @return array<string, mixed>
     */
    private function buildExpenseSummary(Collection $orders, Collection $garmentTypesByCategory): array
    {
        $shirt = 0.0;
        $pants = 0.0;
        $monthly = [];

        foreach ($orders as $order) {
            // Only work that is actually finished counts as spend — an order
            // still on the floor has not been paid out yet.
            if (! OrderCompletion::isClosed($order)) {
                continue;
            }

            $summary = $this->buildProductionPricingSummary($order, $garmentTypesByCategory);

            if ($summary === null) {
                continue;
            }

            $orderShirt = (float) ($summary['child_total'] ?? 0) + (float) ($summary['adult_total'] ?? 0);
            $orderPants = (float) ($summary['pants_child_total'] ?? 0) + (float) ($summary['pants_adult_total'] ?? 0);

            $shirt += $orderShirt;
            $pants += $orderPants;

            $monthKey = $order->order_date?->format('Y-m') ?? 'unknown';
            $monthly[$monthKey] ??= ['month' => $monthKey, 'shirt' => 0.0, 'pants' => 0.0];
            $monthly[$monthKey]['shirt'] += $orderShirt;
            $monthly[$monthKey]['pants'] += $orderPants;
        }

        ksort($monthly);

        return [
            'shirt' => round($shirt, 2),
            'pants' => round($pants, 2),
            'total' => round($shirt + $pants, 2),
            'monthly' => array_values(array_map(static fn (array $row): array => [
                'month' => $row['month'],
                'shirt' => round($row['shirt'], 2),
                'pants' => round($row['pants'], 2),
                'total' => round($row['shirt'] + $row['pants'], 2),
            ], $monthly)),
        ];
    }

    /**
     * Sales income from finished orders, split by what was actually sold.
     *
     * The split comes from order_items, which is the only place that records
     * what each line was. Those lines add up to the bill before discount, so
     * each bucket's share of that gross is applied to the order's net amount —
     * the buckets then add back up to the money actually billed.
     *
     * Lines recorded before the garment was named land in "unspecified" rather
     * than being guessed at.
     *
     * @param  Collection<int, Order>  $orders
     * @return array<string, mixed>
     */
    private function buildRevenueSummary(Collection $orders): array
    {
        $buckets = ['shirt' => 0.0, 'pants' => 0.0, 'set' => 0.0, 'unspecified' => 0.0];
        $pieces = ['shirt' => 0, 'pants' => 0, 'set' => 0, 'unspecified' => 0];
        $net = 0.0;
        $discount = 0.0;
        $gross = 0.0;
        $orderCount = 0;
        $monthly = [];

        foreach ($orders as $order) {
            if (! OrderCompletion::isClosed($order)) {
                continue;
            }

            $orderCount++;
            $orderNet = (float) $order->net_amount;
            $orderGross = (float) $order->items->sum(fn ($item): float => (float) $item->total_price);

            $net += $orderNet;
            $gross += $orderGross;
            $discount += (float) $order->discount_amount;

            $monthKey = $order->order_date?->format('Y-m') ?? 'unknown';
            $monthly[$monthKey] ??= ['month' => $monthKey, 'net' => 0.0];
            $monthly[$monthKey]['net'] += $orderNet;

            if ($orderGross <= 0.0) {
                // Nothing to apportion against; keep the money visible instead
                // of dropping it.
                $buckets['unspecified'] += $orderNet;

                continue;
            }

            foreach ($order->items as $item) {
                $bucket = $this->revenueBucket((string) $item->item_type);
                $lineGross = (float) $item->total_price;

                $buckets[$bucket] += $orderNet * ($lineGross / $orderGross);
                $pieces[$bucket] += (int) $item->quantity;
            }
        }

        ksort($monthly);

        return [
            'net' => round($net, 2),
            'gross' => round($gross, 2),
            'discount' => round($discount, 2),
            'order_count' => $orderCount,
            'by_garment' => [
                'shirt' => round($buckets['shirt'], 2),
                'pants' => round($buckets['pants'], 2),
                'set' => round($buckets['set'], 2),
                'unspecified' => round($buckets['unspecified'], 2),
            ],
            'pieces' => $pieces,
            'monthly' => array_values(array_map(static fn (array $row): array => [
                'month' => $row['month'],
                'net' => round($row['net'], 2),
            ], $monthly)),
        ];
    }

    /**
     * order_items records the garment on each line. 'garment' is the pre-split
     * value and stays unspecified rather than being attributed to a guess.
     */
    private function revenueBucket(string $itemType): string
    {
        return match (mb_strtolower(trim($itemType))) {
            'shirt', 'separate_shirt' => 'shirt',
            'pants', 'separate_pants' => 'pants',
            'set' => 'set',
            default => 'unspecified',
        };
    }

    /**
     * @param  Collection<int, Order>  $orders
     * @return array<string, int>
     */
    private function buildOrderCounts(Collection $orders): array
    {
        $completed = $orders->filter(fn (Order $order): bool => OrderCompletion::isClosed($order))->count();

        return [
            'completed' => $completed,
            'in_progress' => $orders->count() - $completed,
            'total' => $orders->count(),
        ];
    }

    /**
     * The configured job types, from catalog_items. Types that exist only on
     * older orders are folded in too, so nothing already recorded disappears
     * from the report just because it was never added to the catalog.
     *
     * @return Collection<int, string>
     */
    private function masterJobTypes(): Collection
    {
        $catalog = \App\Models\CatalogItem::query()
            ->where('storage_key', ShirtCatalogController::JOB_TYPES_STORAGE_KEY)
            ->where('active', true)
            ->orderBy('item_id')
            ->pluck('name');

        $used = Order::query()
            ->whereNotNull('job_type')
            ->where('job_type', '!=', '')
            ->distinct()
            ->orderBy('job_type')
            ->pluck('job_type');

        return $catalog->concat($used)->unique()->values();
    }

    /**
     * @param  Collection<int, Order>  $orders
     * @return array<int, array<string, mixed>>
     */
    private function buildJobTypeBreakdown(Collection $orders): array
    {
        $rows = $orders
            ->groupBy(fn (Order $order): string => (string) ($order->job_type ?: 'ไม่ระบุ'))
            ->map(function (Collection $group, string $jobType): array {
                $completed = $group->filter(fn (Order $order): bool => OrderCompletion::isClosed($order))->count();

                return [
                    'job_type' => $jobType,
                    'completed' => $completed,
                    'in_progress' => $group->count() - $completed,
                    'total' => $group->count(),
                    'quantity' => (int) $group->sum(fn (Order $order): int => (int) $order->items->sum('quantity')),
                ];
            })
            ->sortByDesc('total');

        // A configured type with no orders in range still belongs in the table,
        // sitting at zero — otherwise the report silently looks incomplete.
        foreach ($this->masterJobTypes() as $jobType) {
            if (! $rows->has($jobType)) {
                $rows->put($jobType, [
                    'job_type' => $jobType,
                    'completed' => 0,
                    'in_progress' => 0,
                    'total' => 0,
                    'quantity' => 0,
                ]);
            }
        }

        return $rows->sortByDesc('total')->values()->all();
    }

    /**
     * Top 5 shirt and pants types by how many orders used them, with the piece
     * count those orders carried.
     *
     * @param  Collection<int, Order>  $orders
     * @return array<string, array<int, array<string, mixed>>>
     */
    private function buildGarmentTypeUsage(Collection $orders, Collection $garmentTypesByCategory): array
    {
        $tally = ['shirt' => [], 'pants' => []];

        foreach ($orders as $order) {
            $resolved = [
                'shirt' => $this->resolveShirtType($order, $garmentTypesByCategory->get(GarmentCategory::Shirt->value, collect())),
                'pants' => $this->resolvePantsType($order, $garmentTypesByCategory->get(GarmentCategory::Pants->value, collect())),
            ];

            $quantities = $this->summarizeOrderQuantitiesByPricingGroup($order);

            foreach ($resolved as $garment => $type) {
                if (! $type instanceof GarmentType) {
                    continue;
                }

                $pieces = $garment === 'shirt'
                    ? (int) $quantities['shirt_kids'] + (int) $quantities['shirt_adults']
                    : (int) $quantities['pants_kids'] + (int) $quantities['pants_adults'];

                if ($pieces <= 0) {
                    continue;
                }

                $tally[$garment][$type->name] ??= ['name' => $type->name, 'orders' => 0, 'pieces' => 0];
                $tally[$garment][$type->name]['orders'] += 1;
                $tally[$garment][$type->name]['pieces'] += $pieces;
            }
        }

        $topFive = static fn (array $rows): array => collect($rows)
            ->sortByDesc('pieces')
            ->take(5)
            ->values()
            ->all();

        return [
            'shirt' => $topFive($tally['shirt']),
            'pants' => $topFive($tally['pants']),
        ];
    }

    /**
     * Where the job stands right now, for the delivery calendar: the room that
     * still has it, or that it is finished. Read from the routings themselves so
     * it says the same thing the production boards do.
     */
    private function deliveryStatusLabel(Order $order): string
    {
        if (OrderCompletion::isClosed($order)) {
            return 'ปิดงาน';
        }

        $active = $order->routings
            ->filter(fn ($routing): bool => (bool) $routing->is_required)
            ->sortBy('id')
            ->first(fn ($routing): bool => in_array(
                $routing->status?->value,
                [RoutingStatus::Pending->value, RoutingStatus::InProgress->value, RoutingStatus::Rejected->value],
                true,
            ));

        if ($active === null) {
            return 'รอดำเนินการ';
        }

        $room = match ($active->station_name?->value) {
            'design' => 'ออกแบบ',
            'print' => 'ห้องพิมพ์',
            'screen' => 'ห้องอัด',
            'flex' => 'ห้องสกรีน เฟล็กซ์',
            'embroidery' => 'ห้องปัก',
            'cutting' => 'ห้องตัด',
            'sewing' => 'ห้องเย็บ',
            'qc' => 'ตรวจสอบ',
            'shipping' => 'จัดส่ง',
            default => 'ผลิต',
        };

        return match ($active->status?->value) {
            RoutingStatus::InProgress->value => $room.' (กำลังทำ)',
            RoutingStatus::Rejected->value => $room.' (แก้ไข)',
            default => $room.' (รอคิว)',
        };
    }

    /**
     * Delivery calendar. Independent of the dashboard filters: "what ships
     * today" must not silently change because a date filter was applied above.
     *
     * @return array<string, mixed>
     */
    private function buildCalendar(Request $request, $actor): array
    {
        $month = $this->validDate($request->query('calendar_month').'-01')
            ? (string) $request->query('calendar_month')
            : now()->format('Y-m');

        $start = Carbon::createFromFormat('Y-m-d', $month.'-01')->startOfDay();
        $end = $start->copy()->addMonth();

        $query = Order::query()
            ->where('order_status', '!=', OrderStatus::Cancelled->value)
            ->whereNotNull('due_date')
            ->where('due_date', '>=', $start)
            ->where('due_date', '<', $end)
            ->with(['customer:id,customer_name', 'items', 'routings']);

        if ($actor->branch_id !== null) {
            UserAccessControl::applyBranchScope($query, $actor);
        }

        $days = $query->orderBy('due_date')->get()
            ->groupBy(fn (Order $order): string => $order->due_date->format('Y-m-d'))
            ->map(fn (Collection $group): array => [
                'count' => $group->count(),
                'quantity' => (int) $group->sum(fn (Order $order): int => (int) $order->items->sum('quantity')),
                'orders' => $group->map(fn (Order $order): array => [
                    'id' => $order->id,
                    'order_code' => $order->order_code,
                    'customer_name' => $order->customer?->customer_name ?? '-',
                    'job_name' => $order->job_name,
                    'job_type' => $order->job_type,
                    'delivery_method' => $order->delivery_method,
                    'delivery_label' => match ($order->delivery_method) {
                        'shipping' => 'ขนส่ง',
                        'onsite' => 'ส่งหน้างาน',
                        default => 'รับที่ร้าน',
                    },
                    'order_status' => $order->order_status?->value,
                    'status_label' => $this->deliveryStatusLabel($order),
                    'is_closed' => OrderCompletion::isClosed($order),
                    'quantity' => (int) $order->items->sum('quantity'),
                ])->values()->all(),
            ])
            ->all();

        return [
            'month' => $month,
            'today' => now()->format('Y-m-d'),
            'days' => $days,
        ];
    }
}
