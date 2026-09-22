<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Domain\OrderManagement\Actions\UpdateOrderAction;
use App\Enums\OrderStatus;
use App\Http\Requests\StoreOrderRequest;
use App\Models\Branch;
use App\Models\CatalogItem;
use App\Models\Customer;
use App\Models\GarmentType;
use App\Models\Order;
use App\Models\ProductionDailySetting;
use App\Support\UserAccessControl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

class OrderController extends Controller
{
    /**
     * The active rows of a catalog, or the built-in list when there are none.
     *
     * @param  array<int, array{id: int, name: string}>  $fallback
     * @return array<int, array{id: int, name: string}>
     */
    private function optionsFromStorageKey(string $storageKey, array $fallback): array
    {
        $rows = CatalogItem::query()
            ->where('storage_key', $storageKey)
            ->where('active', true)
            ->orderBy('name')
            ->get(['item_id', 'name'])
            ->map(fn (CatalogItem $item): array => [
                'id' => (int) $item->item_id,
                'name' => $item->name,
            ])
            ->values()
            ->all();

        return count($rows) > 0 ? $rows : $fallback;
    }

    /**
     * A sewing-spec catalog for the form: every row, hidden ones flagged.
     *
     * The form offers only the active rows as choices, but a bill being edited
     * may still point at one that was hidden since, and it has to show that
     * row's name rather than a bare number until the counter picks another.
     *
     * @param  array<int, array{id: int, name: string}>  $fallback
     * @return array<int, array{id: int, name: string, active: bool}>
     */
    private function specOptionsFromStorageKey(string $storageKey, array $fallback): array
    {
        $rows = CatalogItem::query()
            ->where('storage_key', $storageKey)
            ->orderBy('name')
            ->get(['item_id', 'name', 'active'])
            ->map(fn (CatalogItem $item): array => [
                'id' => (int) $item->item_id,
                'name' => $item->name,
                'active' => (bool) $item->active,
            ])
            ->values()
            ->all();

        if (collect($rows)->contains(fn (array $row): bool => $row['active'])) {
            return $rows;
        }

        // Nothing usable on file: the built-in list stands in, as it always has.
        return array_map(
            static fn (array $row): array => [...$row, 'active' => true],
            $fallback,
        );
    }

    /**
     * @return array<int, string>
     */
    private function sizeOptionsFromStorageKey(string $storageKey): array
    {
        // In the order the shop arranged them on the settings page.
        return CatalogItem::query()
            ->where('storage_key', $storageKey)
            ->where('active', true)
            ->orderBy('sort_order')
            ->orderBy('item_id')
            ->pluck('name')
            ->map(fn (string $name): string => trim($name))
            ->filter(fn (string $name): bool => $name !== '')
            ->values()
            ->all();
    }

    /**
     * @return array<int, array{id: int, name: string, mode: string, value: float|int}>
     */
    private function discountOptions(): array
    {
        return [
            ['id' => 1, 'name' => 'ไม่มีส่วนลด', 'mode' => 'fixed', 'value' => 0],
            ['id' => 2, 'name' => 'ส่วนลดสมาชิก 5%', 'mode' => 'percent', 'value' => 5],
            ['id' => 3, 'name' => 'ส่วนลดเงินสด 500', 'mode' => 'fixed', 'value' => 500],
        ];
    }

    /**
     * @return array<int, array{id: int, name: string}>
     */
    private function contactChannelOptions(): array
    {
        return [
            ['id' => 1, 'name' => 'โทรศัพท์'],
            ['id' => 2, 'name' => 'LINE'],
            ['id' => 3, 'name' => 'Facebook'],
        ];
    }

    /**
     * Which catalog each shirt spec dropdown reads and, from the form, writes.
     * Shared with the form as shirtCatalogKeys so both sides agree on it.
     *
     * แบบคอ and ปก deliberately share one catalog: bills on file reference
     * neck styles by ids from the collar list, and splitting them would need a
     * migration of those bills.
     *
     * @var array<string, string>
     */
    public const SHIRT_CATALOG_KEYS = [
        'patterns' => 'jssport.shirt-patterns',
        'fabrics' => 'jssport.shirt-fabrics',
        'fabric_colors' => 'jssport.shirt-fabric-colors',
        'neck_styles' => 'jssport.shirt-collars',
        'neck_colors' => 'jssport.shirt-neck-colors',
        'collars' => 'jssport.shirt-collars',
        'placket_styles' => 'jssport.shirt-plackets',
        'placket_outer_colors' => 'jssport.shirt-placket-outer-colors',
        'placket_inner_colors' => 'jssport.shirt-placket-inner-colors',
        'sleeve_cuffs' => 'jssport.shirt-cuffs',
        'panel_styles' => 'jssport.shirt-panels',
        'screen_colors' => 'jssport.shirt-screen-colors',
        'embroidery_colors' => 'jssport.shirt-embroidery-colors',
        'sublimations' => 'jssport.shirt-sublimation',
    ];

    /**
     * The pants dropdowns; fabrics, colours and sublimation are the shirt
     * catalogs, so a colour added on either tab is offered on both.
     *
     * @var array<string, string>
     */
    public const PANTS_CATALOG_KEYS = [
        'patterns' => 'jssport.pants-patterns',
        'fabrics' => 'jssport.shirt-fabrics',
        'fabric_colors' => 'jssport.shirt-fabric-colors',
        'leg_styles' => 'jssport.pants-leg-style',
        'leg_cuffs' => 'jssport.pants-leg-hem',
        'screen_colors' => 'jssport.shirt-screen-colors',
        'embroidery_colors' => 'jssport.shirt-embroidery-colors',
        'sublimations' => 'jssport.shirt-sublimation',
    ];

    /**
     * @return array<string, array<int, array{id: int, name: string, active: bool}>>
     */
    private function shirtCatalogOptions(): array
    {
        $fallback = [
            'patterns' => [['id' => 1, 'name' => 'แพทเทิร์นมาตรฐาน'], ['id' => 2, 'name' => 'แพทเทิร์นเข้ารูป']],
            'fabrics' => [['id' => 1, 'name' => 'TK'], ['id' => 2, 'name' => 'Micro']],
            'fabric_colors' => [['id' => 1, 'name' => 'ขาว'], ['id' => 2, 'name' => 'กรมท่า'], ['id' => 3, 'name' => 'ดำ']],
            'neck_styles' => [['id' => 1, 'name' => 'คอกลม'], ['id' => 2, 'name' => 'คอวี']],
            'neck_colors' => [['id' => 1, 'name' => 'ขาว'], ['id' => 2, 'name' => 'แดง']],
            'collars' => [['id' => 1, 'name' => 'ปกเชิ้ต'], ['id' => 2, 'name' => 'ปกโปโล']],
            'placket_styles' => [['id' => 1, 'name' => 'สาบซ่อน'], ['id' => 2, 'name' => 'สาบโชว์']],
            'placket_outer_colors' => [['id' => 1, 'name' => 'ดำ'], ['id' => 2, 'name' => 'น้ำเงิน']],
            'placket_inner_colors' => [['id' => 1, 'name' => 'ขาว'], ['id' => 2, 'name' => 'เทา']],
            'sleeve_cuffs' => [['id' => 1, 'name' => 'ปลายแขนจั๊ม'], ['id' => 2, 'name' => 'ปลายแขนตรง']],
            'panel_styles' => [['id' => 1, 'name' => 'ต่อข้าง'], ['id' => 2, 'name' => 'ต่อหน้าอก']],
            'screen_colors' => [['id' => 1, 'name' => '1 สี'], ['id' => 2, 'name' => '2 สี']],
            'embroidery_colors' => [['id' => 1, 'name' => '1 สี'], ['id' => 2, 'name' => '3 สี']],
            'sublimations' => [['id' => 1, 'name' => 'เต็มตัว'], ['id' => 2, 'name' => 'เฉพาะจุด']],
        ];

        return collect(self::SHIRT_CATALOG_KEYS)
            ->map(fn (string $storageKey, string $source): array => $this->specOptionsFromStorageKey($storageKey, $fallback[$source] ?? []))
            ->all();
    }

    /**
     * @return array<string, array<int, array{id: int, name: string}>>
     */
    private function pantsCatalogOptions(): array
    {
        $shirtCatalogs = $this->shirtCatalogOptions();
        $fallback = [
            'patterns' => [['id' => 1, 'name' => 'ขาสั้นมาตรฐาน'], ['id' => 2, 'name' => 'ขายาว']],
            'leg_styles' => [['id' => 1, 'name' => 'ขาตรง'], ['id' => 2, 'name' => 'ขาจั๊ม']],
            'leg_cuffs' => [['id' => 1, 'name' => 'ปลายตรง'], ['id' => 2, 'name' => 'ปลายยาง']],
            'sublimations' => [['id' => 1, 'name' => 'เต็มตัว'], ['id' => 2, 'name' => 'เฉพาะแถบ']],
        ];

        // A source whose catalog is one of the shirt's reuses the rows already
        // loaded for it; the pants-only catalogs load on their own.
        return collect(self::PANTS_CATALOG_KEYS)
            ->map(function (string $storageKey, string $source) use ($shirtCatalogs, $fallback): array {
                $shirtSource = array_search($storageKey, self::SHIRT_CATALOG_KEYS, true);

                if ($shirtSource !== false && $source !== 'sublimations' && isset($shirtCatalogs[$shirtSource])) {
                    return $shirtCatalogs[$shirtSource];
                }

                return $this->specOptionsFromStorageKey($storageKey, $fallback[$source] ?? []);
            })
            ->all();
    }

    /**
     * @return array<int, array{id: int, name: string}>
     */
    private function garmentTypeOptions(string $category): array
    {
        return GarmentType::query()
            ->where('category', $category)
            ->where('is_active', true)
            ->orderBy('display_order')
            ->orderBy('id')
            ->get(['id', 'name'])
            ->map(fn (GarmentType $type): array => [
                'id' => (int) $type->id,
                'name' => (string) $type->name,
            ])
            ->values()
            ->all();
    }

    /**
     * Job types are master data in catalog_items. Until that catalog has been
     * filled in, fall back to the types already used on orders so the form is
     * never left with an empty dropdown.
     *
     * @return Collection<int, array{id: int, name: string}>
     */
    private function jobTypeOptions(): Collection
    {
        $catalogNames = CatalogItem::query()
            ->where('storage_key', ShirtCatalogController::JOB_TYPES_STORAGE_KEY)
            ->where('active', true)
            ->orderBy('item_id')
            ->pluck('name');

        $names = $catalogNames->isNotEmpty()
            ? $catalogNames
            : Order::query()
                ->select('job_type')
                ->whereNotNull('job_type')
                ->where('job_type', '!=', '')
                ->distinct()
                ->orderBy('job_type')
                ->pluck('job_type');

        return $names
            ->values()
            ->map(fn (string $jobType, int $index): array => [
                'id' => $index + 1,
                'name' => $jobType,
            ]);
    }

    public function create(Request $request): Response
    {
        $this->authorize('viewAny', Order::class);

        return $this->renderOrderForm($request, null);
    }

    public function edit(Request $request, Order $order): Response
    {
        $this->authorize('edit', $order);

        return $this->renderOrderForm($request, $order);
    }

    /**
     * "เปิดบิลอีกครั้ง" — open the create form pre-filled from an existing order.
     *
     * This renders the very same form as create(), so every field stays
     * editable; the payload simply carries no id, which is what makes the
     * form POST to store() and run a fresh order_code. The source id rides
     * along as duplicate_from_id so store() can copy the artwork media over.
     */
    public function duplicate(Request $request, Order $order): Response
    {
        $this->authorize('create', Order::class);

        return $this->renderOrderForm($request, $order, duplicateFrom: $order);
    }

    public function destroy(Request $request, Order $order): RedirectResponse
    {
        $this->authorize('delete', $order);

        $order->delete();

        return back()->with('success', "ลบออเดอร์ {$order->order_code} เรียบร้อยแล้ว");
    }

    private function renderOrderForm(Request $request, ?Order $order, ?Order $duplicateFrom = null): Response
    {
        $actor = $request->user();
        $isDuplicate = $duplicateFrom !== null;

        $customers = Customer::query()
            ->select(['id', 'customer_code', 'customer_name', 'phone', 'line_fb'])
            ->orderBy('customer_name')
            ->get()
            ->map(fn (Customer $customer): array => [
                'id' => $customer->id,
                'name' => $customer->customer_name,
                'code' => $customer->customer_code,
                'phone' => $customer->phone,
                'line_fb' => $customer->line_fb,
            ])
            ->values();

        $branchesQuery = Branch::query()
            ->select(['id', 'branch_code', 'branch_name', 'phone'])
            ->orderBy('branch_name');

        if (! UserAccessControl::hasCrossBranchAccess($actor) && $actor->branch_id !== null) {
            // Orders page keeps the head-office exception: branch 01 (Nong
            // Bua Lamphu) sees every branch's order data here, same as
            // User/Branch Management. Kanban and Dashboard/Counter stay on
            // the strict per-branch scope (see UserAccessControl::applyStrictBranchScope()).
            $branchesQuery->where('id', (int) $actor->branch_id);
        }

        $branches = $branchesQuery
            ->get()
            ->map(fn (Branch $branch): array => [
                'id' => $branch->id,
                'name' => $branch->branch_name,
                'code' => $branch->branch_code,
                'phone' => $branch->phone,
            ])
            ->values();

        $jobTypes = $this->jobTypeOptions();

        $orderPayload = null;
        if ($order !== null) {
            $order->loadMissing(['customer', 'branch', 'items', 'specification', 'receipts']);

            $specification = $order->specification;
            $screenPrintDetail = $specification?->screen_print_detail;
            $decodedSpec = is_string($screenPrintDetail) && trim($screenPrintDetail) !== ''
                ? json_decode($screenPrintDetail, true)
                : null;

            $orderPayload = [
                // A duplicate carries no identity: a null id is what tells the
                // form it is creating rather than editing, so it POSTs to
                // store() and receives a freshly generated order_code.
                'id' => $isDuplicate ? null : $order->id,
                'order_code' => $isDuplicate ? null : $order->order_code,
                'duplicate_from_id' => $isDuplicate ? $order->id : null,
                'customer_id' => $order->customer_id,
                'branch_id' => $order->branch_id,
                'customer_name' => $order->customer->customer_name ?? '',
                'customer_phone' => $order->customer->phone ?? '',
                'contact_detail' => $isDuplicate ? '' : ($order->receipts->sortByDesc('payment_date')->first()->note ?? ''),
                'job_name' => $order->job_name,
                'job_type' => $order->job_type,
                'billing_date' => $isDuplicate
                    ? Carbon::now()->format('Y-m-d')
                    : ($order->order_date?->format('Y-m-d') ?? ''),
                'billing_time' => $isDuplicate
                    ? Carbon::now()->format('H:i')
                    : ($order->order_date?->format('H:i') ?? ''),
                // The original's delivery date is almost always in the past by the
                // time a job is re-ordered, and silently reusing it would schedule
                // the new bill for a date that has already gone. Left empty so the
                // form makes the user pick one (it is required there).
                'due_date' => $isDuplicate ? '' : ($order->due_date?->format('Y-m-d') ?? ''),
                'delivery_method' => $order->delivery_method ?? 'pickup',
                'shipping_address' => $order->shipping_address ?? '',
                'discount_percent' => (string) ($order->discount_percent ?? 0),
                // Payments belong to the original bill only - carrying them over
                // would fabricate a receipt for money nobody has paid yet.
                'deposit_amount' => $isDuplicate ? 0.0 : (float) $order->receipts->sum('amount_paid'),
                'payment_method' => $isDuplicate ? 'cash' : ($order->receipts->sortByDesc('payment_date')->first()->payment_method ?? 'cash'),
                'order_status' => $isDuplicate ? null : ($order->order_status->value ?? null),
                'artwork_url' => $order->artwork_url,
                'shirt_artwork_urls' => $order->shirt_artwork_urls,
                'pants_artwork_urls' => $order->pants_artwork_urls,
                // Keyed by colour house index. Without this the form rebuilt every
                // house with an empty gallery, so reopening or duplicating a
                // sports day bill looked like the artwork had been thrown away.
                'sports_day_artwork_urls' => $order->sports_day_artwork_urls,
                'pe_uniform_artwork_urls' => $order->pe_uniform_artwork_urls,
                'reference_designs' => $order->reference_designs,
                // Same images as the URL lists above, but carrying their media id
                // so the edit form can ask for one to be removed by identity.
                'artwork_media' => $order->artworkMedia('artwork'),
                'shirt_artwork_media' => $order->artworkMedia('shirt_artwork'),
                'pants_artwork_media' => $order->artworkMedia('pants_artwork'),
                'reference_design_media' => $order->artworkMedia('reference_designs'),
                'sports_day_artwork_media' => $order->sportsDayArtworkMedia(),
                'pe_uniform_artwork_media' => $order->peUniformArtworkMedia(),
                'items' => $order->items
                    ->map(fn ($item): array => [
                        'item_type' => $item->item_type,
                        'size_group' => $item->size_group,
                        'size_label' => $item->size_label,
                        'shirt_style' => $item->shirt_style,
                        'pants_style' => $item->pants_style,
                        'quantity' => (int) $item->quantity,
                        'unit_price' => (float) $item->unit_price,
                        'total_price' => (float) $item->total_price,
                    ])
                    ->values()
                    ->all(),
                'specification' => [
                    'pattern_id' => $specification->pattern_id ?? null,
                    'fabric_id' => $specification->fabric_id ?? null,
                    'neck_style_id' => $specification->neck_style_id ?? null,
                    'screen_print_detail' => $screenPrintDetail,
                    'decoded' => is_array($decodedSpec) ? $decodedSpec : null,
                ],
            ];
        }

        $deliveryDateLoads = Order::query()
            ->whereNotIn('order_status', [OrderStatus::Cancelled, OrderStatus::Completed])
            // An order being edited is excluded so it does not count its own load
            // twice. A duplicate is a brand-new order, so the source order's load
            // still stands and must stay in the totals.
            ->when($order !== null && ! $isDuplicate, fn ($query) => $query->whereKeyNot($order->id))
            ->whereDate('due_date', '>=', today())
            ->join('order_items', 'orders.id', '=', 'order_items.order_id')
            ->selectRaw('DATE(orders.due_date) as due_date, SUM(order_items.quantity) as total_quantity')
            ->groupByRaw('DATE(orders.due_date)')
            ->orderBy('due_date')
            // Aggregate rows, not orders: drop to the query builder so the
            // computed columns are read from a plain row object.
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'date' => Carbon::parse((string) $row->due_date)->toDateString(),
                'total_quantity' => (int) $row->total_quantity,
            ])
            ->values();

        return Inertia::render('Orders/Create', [
            'customers' => $customers,
            'branches' => $branches,
            'jobTypes' => $jobTypes,
            'jobNames' => $this->optionsFromStorageKey(ShirtCatalogController::JOB_NAMES_STORAGE_KEY, []),
            'contactChannels' => $this->contactChannelOptions(),
            'discounts' => $this->discountOptions(),
            'shirtCatalogs' => $this->shirtCatalogOptions(),
            'shirtCatalogKeys' => self::SHIRT_CATALOG_KEYS,
            'pantsCatalogKeys' => self::PANTS_CATALOG_KEYS,
            'pantsCatalogs' => $this->pantsCatalogOptions(),
            'shirtTypes' => $this->garmentTypeOptions('SHIRT'),
            'pantsTypes' => $this->garmentTypeOptions('PANTS'),
            'kidsSizes' => $this->sizeOptionsFromStorageKey(ShirtCatalogController::SIZE_KIDS_STORAGE_KEY),
            'adultSizes' => $this->sizeOptionsFromStorageKey(ShirtCatalogController::SIZE_ADULTS_STORAGE_KEY),
            'defaultBranchId' => ($order === null || $isDuplicate) ? $actor->branch_id : null,
            'dailyProductionCapacity' => ProductionDailySetting::query()->first()->daily_capacity ?? 200,
            'deliveryDateLoads' => $deliveryDateLoads,
            'order' => $orderPayload,
        ]);
    }

    public function update(StoreOrderRequest $request, Order $order, UpdateOrderAction $action): JsonResponse|RedirectResponse
    {
        $this->authorize('update', $order);

        $updatedOrder = $action->execute($order, $request->validated(), (int) $request->user()->id);

        if (! $request->header('X-Inertia')) {
            return response()->json(['data' => $updatedOrder], 200);
        }

        $receiptCode = $updatedOrder->receipts->sortByDesc('payment_date')->first()?->receipt_code;
        $currentTeamSlug = $request->user()?->currentTeam?->slug;

        if (is_string($currentTeamSlug) && $currentTeamSlug !== '') {
            return redirect()
                ->route('counter.index', ['current_team' => $currentTeamSlug])
                ->with('success', 'อัปเดตใบสั่งผลิตสำเร็จ')
                ->with('order_code', $updatedOrder->order_code)
                ->with('receipt_code', $receiptCode);
        }

        return redirect()
            ->route('counter.fallback')
            ->with('success', 'อัปเดตใบสั่งผลิตสำเร็จ')
            ->with('order_code', $updatedOrder->order_code)
            ->with('receipt_code', $receiptCode);
    }

    public function index(Request $request): Response
    {
        $this->authorize('viewAny', Order::class);
        $actor = $request->user();

        $query = Order::query()->with(['customer', 'branch', 'media']);

        if (! UserAccessControl::hasCrossBranchAccess($actor) && $actor->branch_id !== null) {
            // Orders page keeps the head-office exception: branch 01 (Nong
            // Bua Lamphu) sees every branch's order data here, same as
            // User/Branch Management. Kanban and Dashboard/Counter stay on
            // the strict per-branch scope (see UserAccessControl::applyStrictBranchScope()).
            $query->where('branch_id', (int) $actor->branch_id);
        }

        if ($request->filled('search')) {
            $search = (string) $request->string('search');

            $query->where(function ($builder) use ($search): void {
                $builder->where('order_code', 'like', "%{$search}%")
                    ->orWhere('job_name', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($customerQuery) use ($search): void {
                        $customerQuery->where('customer_name', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->filled('status')) {
            $query->where('order_status', (string) $request->string('status'));
        }

        $orders = $query
            ->latest('order_date')
            ->cursorPaginate(50)
            ->withQueryString()
            ->through(function (Order $order): array {
                $payload = $order->toArray();
                $payload['artwork_url'] = $order->artwork_url;
                $payload['shirt_artwork_url'] = $order->shirt_artwork_url;
                $payload['pants_artwork_url'] = $order->pants_artwork_url;
                $payload['reference_designs'] = $order->reference_designs;

                return $payload;
            });

        return Inertia::render('Orders/Index', [
            'orders' => $orders,
            'filters' => [
                'search' => (string) $request->string('search'),
                'status' => (string) $request->string('status'),
            ],
            'stats' => Inertia::defer(function () use ($actor): array {
                $inProduction = Order::query()->where('order_status', OrderStatus::InProduction);
                $pendingQc = Order::query()->where('order_status', OrderStatus::QcChecking);
                $monthlyRevenue = Order::query()
                    ->where('order_status', OrderStatus::Completed)
                    ->whereMonth('order_date', now()->month);

                // Orders page keeps the head-office exception: branch 01 (Nong
                // Bua Lamphu) sees every branch's order data here, same as
                // User/Branch Management. Kanban and Dashboard/Counter stay on
                // the strict per-branch scope (see UserAccessControl::applyStrictBranchScope()).
                if (! UserAccessControl::hasCrossBranchAccess($actor) && $actor->branch_id !== null) {
                    $branchId = (int) $actor->branch_id;
                    $inProduction->where('branch_id', $branchId);
                    $pendingQc->where('branch_id', $branchId);
                    $monthlyRevenue->where('branch_id', $branchId);
                }

                return [
                    'total_in_production' => $inProduction->count(),
                    'pending_qc' => $pendingQc->count(),
                    'monthly_revenue' => $monthlyRevenue->sum('net_amount'),
                ];
            }),
        ]);
    }

    public function store(StoreOrderRequest $request, CreateOrderAction $action): JsonResponse|RedirectResponse
    {
        $order = $action->execute($request->validated(), (int) $request->user()->id);

        if (! $request->header('X-Inertia')) {
            return response()->json(['data' => $order], 201);
        }

        $receiptCode = $order->receipts->sortByDesc('payment_date')->first()?->receipt_code;

        $currentTeamSlug = $request->user()?->currentTeam?->slug;
        if (is_string($currentTeamSlug) && $currentTeamSlug !== '') {
            return redirect()
                ->route('counter.index', ['current_team' => $currentTeamSlug])
                ->with('success', 'บันทึกใบสั่งผลิตสำเร็จ')
                ->with('order_code', $order->order_code)
                ->with('receipt_code', $receiptCode);
        }

        return redirect()
            ->route('counter.fallback')
            ->with('success', 'บันทึกใบสั่งผลิตสำเร็จ')
            ->with('order_code', $order->order_code)
            ->with('receipt_code', $receiptCode);

    }
}
