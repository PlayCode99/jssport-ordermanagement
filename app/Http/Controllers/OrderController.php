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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;
use App\Models\Order;
use App\Models\ProductionDailySetting;
use App\Support\UserAccessControl;

class OrderController extends Controller
{
    /**
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
     * @return array<int, string>
     */
    private function sizeOptionsFromStorageKey(string $storageKey): array
    {
        return CatalogItem::query()
            ->where('storage_key', $storageKey)
            ->where('active', true)
            ->orderByDesc('created_at')
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
     * @return array<string, array<int, array{id: int, name: string}>>
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

        return [
            'patterns' => $this->optionsFromStorageKey('jssport.shirt-patterns', $fallback['patterns']),
            'fabrics' => $this->optionsFromStorageKey('jssport.shirt-fabrics', $fallback['fabrics']),
            'fabric_colors' => $this->optionsFromStorageKey('jssport.shirt-fabric-colors', $fallback['fabric_colors']),
            'neck_styles' => $this->optionsFromStorageKey('jssport.shirt-collars', $fallback['neck_styles']),
            'neck_colors' => $this->optionsFromStorageKey('jssport.shirt-neck-colors', $fallback['neck_colors']),
            'collars' => $this->optionsFromStorageKey('jssport.shirt-collars', $fallback['collars']),
            'placket_styles' => $this->optionsFromStorageKey('jssport.shirt-plackets', $fallback['placket_styles']),
            'placket_outer_colors' => $this->optionsFromStorageKey('jssport.shirt-placket-outer-colors', $fallback['placket_outer_colors']),
            'placket_inner_colors' => $this->optionsFromStorageKey('jssport.shirt-placket-inner-colors', $fallback['placket_inner_colors']),
            'sleeve_cuffs' => $this->optionsFromStorageKey('jssport.shirt-cuffs', $fallback['sleeve_cuffs']),
            'panel_styles' => $this->optionsFromStorageKey('jssport.shirt-panels', $fallback['panel_styles']),
            'screen_colors' => $this->optionsFromStorageKey('jssport.shirt-screen-colors', $fallback['screen_colors']),
            'embroidery_colors' => $this->optionsFromStorageKey('jssport.shirt-embroidery-colors', $fallback['embroidery_colors']),
            'sublimations' => $this->optionsFromStorageKey('jssport.shirt-sublimation', $fallback['sublimations']),
        ];
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

        return [
            'patterns' => $this->optionsFromStorageKey('jssport.pants-patterns', $fallback['patterns']),
            'fabrics' => $shirtCatalogs['fabrics'],
            'fabric_colors' => $shirtCatalogs['fabric_colors'],
            'leg_styles' => $this->optionsFromStorageKey('jssport.pants-leg-style', $fallback['leg_styles']),
            'leg_cuffs' => $this->optionsFromStorageKey('jssport.pants-leg-hem', $fallback['leg_cuffs']),
            'screen_colors' => $shirtCatalogs['screen_colors'],
            'embroidery_colors' => $shirtCatalogs['embroidery_colors'],
            'sublimations' => $this->optionsFromStorageKey('jssport.shirt-sublimation', $fallback['sublimations']),
        ];
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
     * @return \Illuminate\Support\Collection<int, array{id: int, name: string}>
     */
    private function jobTypeOptions(): \Illuminate\Support\Collection
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

    /**
     * @return Response
     */
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
                'customer_name' => $order->customer?->customer_name ?? '',
                'customer_phone' => $order->customer?->phone ?? '',
                'contact_detail' => $isDuplicate ? '' : ($order->receipts->sortByDesc('payment_date')->first()?->note ?? ''),
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
                'payment_method' => $isDuplicate ? 'cash' : ($order->receipts->sortByDesc('payment_date')->first()?->payment_method ?? 'cash'),
                'order_status' => $isDuplicate ? null : ($order->order_status?->value ?? null),
                'artwork_url' => $order->artwork_url,
                'shirt_artwork_urls' => $order->shirt_artwork_urls,
                'pants_artwork_urls' => $order->pants_artwork_urls,
                'reference_designs' => $order->reference_designs,
                'items' => $order->items
                    ->map(fn ($item): array => [
                        'item_type' => $item->item_type,
                        'size_group' => $item->size_group,
                        'size_label' => $item->size_label,
                        'quantity' => (int) $item->quantity,
                        'unit_price' => (float) $item->unit_price,
                        'total_price' => (float) $item->total_price,
                    ])
                    ->values()
                    ->all(),
                'specification' => [
                    'pattern_id' => $specification?->pattern_id ?? null,
                    'fabric_id' => $specification?->fabric_id ?? null,
                    'neck_style_id' => $specification?->neck_style_id ?? null,
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
            ->get()
            ->map(fn ($row): array => [
                'date' => Carbon::parse((string) $row->due_date)->toDateString(),
                'total_quantity' => (int) $row->total_quantity,
            ])
            ->values();

        return Inertia::render('Orders/Create', [
            'customers' => $customers,
            'branches' => $branches,
            'jobTypes' => $jobTypes,
            'contactChannels' => $this->contactChannelOptions(),
            'discounts' => $this->discountOptions(),
            'shirtCatalogs' => $this->shirtCatalogOptions(),
            'pantsCatalogs' => $this->pantsCatalogOptions(),
            'shirtTypes' => $this->garmentTypeOptions('SHIRT'),
            'pantsTypes' => $this->garmentTypeOptions('PANTS'),
            'kidsSizes' => $this->sizeOptionsFromStorageKey('jssport.size-kids'),
            'adultSizes' => $this->sizeOptionsFromStorageKey('jssport.size-adults'),
            'defaultBranchId' => ($order === null || $isDuplicate) ? $actor->branch_id : null,
            'dailyProductionCapacity' => ProductionDailySetting::query()->first()?->daily_capacity ?? 200,
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
