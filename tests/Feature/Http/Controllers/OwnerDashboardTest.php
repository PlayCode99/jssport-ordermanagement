<?php

namespace Tests\Feature\Http\Controllers;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\GarmentType;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class OwnerDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-07-15 09:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function owner(): User
    {
        return User::factory()->create([
            'role' => UserRole::Admin,
            'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None,
            'is_active' => true,
            'branch_id' => null,
        ]);
    }

    private function garmentType(string $category, string $name, float $child, float $adult): GarmentType
    {
        $type = GarmentType::create([
            'category' => $category,
            'code' => $category.'-'.str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'name' => $name,
            'is_active' => true,
            'display_order' => 1,
        ]);

        $type->operations()->createMany([
            ['name' => 'ตัด', 'child_price' => $child, 'adult_price' => $adult, 'is_active' => true, 'display_order' => 1],
        ]);

        return $type;
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function makeOrder(array $items, int $shirtTypeId, int $pantsTypeId, array $overrides = []): Order
    {
        $customer = Customer::firstOrCreate(['customer_code' => 'CUS-OD-1'], ['customer_name' => 'Dashboard Customer']);
        $branch = Branch::firstOrCreate(['branch_code' => 'BR-OD-1'], ['branch_name' => 'Dashboard Branch']);
        $creator = User::factory()->create(['role' => UserRole::Sales, 'station_department' => StationDepartment::None]);

        $order = (new CreateOrderAction())->execute(array_merge([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Dashboard Order',
            'job_type' => 'งานปัก',
            'order_date' => '2026-07-11 09:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'items' => $items,
            'specification' => [
                'screen_print_detail' => json_encode([
                    'shirt_specs' => ['shirt_type_id' => (string) $shirtTypeId],
                    'pants_specs' => ['pants_type_id' => (string) $pantsTypeId],
                ], JSON_THROW_ON_ERROR),
            ],
        ], $overrides), $creator->id);

        // CreateOrderAction always stamps order_date with the real opening time
        // and ignores whatever was submitted, so a fixed billing date for these
        // filter cases has to be written directly.
        if (isset($overrides['order_date'])) {
            DB::table('orders')->where('id', $order->id)->update(['order_date' => $overrides['order_date']]);
        }

        return Order::query()->findOrFail($order->id);
    }

    /** Marks an order finished the way the floor does: the shipping step is done. */
    private function closeOrder(Order $order): Order
    {
        DB::table('order_routings')
            ->where('order_id', $order->id)
            ->where('station_name', 'shipping')
            ->update(['status' => 'completed']);

        return $order->fresh();
    }

    // ---------------- access ----------------

    public function test_only_an_owner_can_open_the_dashboard(): void
    {
        $this->actingAs($this->owner())->get('/owner-dashboard')->assertOk();
    }

    public function test_a_non_owner_is_refused(): void
    {
        foreach ([AccessRole::AdminSystem, AccessRole::AdminProduction, AccessRole::Counter, AccessRole::QcStaff] as $role) {
            $user = User::factory()->create([
                'role' => UserRole::Admin,
                'access_role' => $role,
                'station_department' => StationDepartment::None,
                'is_active' => true,
            ]);

            $this->actingAs($user)->get('/owner-dashboard')->assertForbidden();
        }
    }

    public function test_a_deactivated_owner_is_refused(): void
    {
        $owner = $this->owner();
        $owner->forceFill(['is_active' => false])->save();

        $this->actingAs($owner)->get('/owner-dashboard')->assertForbidden();
    }

    public function test_it_requires_authentication(): void
    {
        $this->get('/owner-dashboard')->assertRedirect('/login');
    }

    // ---------------- expense ----------------

    public function test_expense_splits_shirt_and_pants_using_the_production_costing(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        // 3 adult shirts @20 = 60, 2 kid shirts @10 = 20  -> shirt 80
        // 4 adult pants @15 = 60                          -> pants 60
        $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 3, 'unit_price' => 100],
            ['item_type' => 'shirt', 'size_group' => 'kids', 'size_label' => 'JM', 'quantity' => 2, 'unit_price' => 100],
            ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 4, 'unit_price' => 100],
        ], $shirt->id, $pants->id));

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('expense.shirt', 80)
                ->where('expense.pants', 60)
                ->where('expense.total', 140)
                ->etc());
    }

    public function test_expense_matches_the_production_sheet_for_the_same_orders(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อคอกลม', 7, 13);
        $pants = $this->garmentType('PANTS', 'กางเกงขายาว', 3, 11);

        $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 6, 'unit_price' => 100],
            ['item_type' => 'pants', 'size_group' => 'kids', 'size_label' => 'JM', 'quantity' => 9, 'unit_price' => 100],
        ], $shirt->id, $pants->id));

        // Ground truth: the production controller's own summary.
        $controller = app(\App\Http\Controllers\Production\ProductionKanbanController::class);
        $method = (new \ReflectionClass($controller))->getMethod('buildProductionPricingSummary');
        $method->setAccessible(true);
        $types = GarmentType::query()
            ->with(['operations' => fn ($q) => $q->orderBy('display_order')->orderBy('id')])
            ->where('is_active', true)->get()->groupBy(fn (GarmentType $t): string => $t->category->value);
        $expected = $method->invoke($controller, Order::query()->firstOrFail(), $types);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('expense.total', (float) $expected['grand_total'] == (int) $expected['grand_total'] ? (int) $expected['grand_total'] : round((float) $expected['grand_total'], 2))
                ->etc());
    }

    public function test_cancelled_orders_are_excluded_everywhere(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $keep = $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 1, 'unit_price' => 100],
        ], $shirt->id, $pants->id));

        $drop = $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 50, 'unit_price' => 100],
        ], $shirt->id, $pants->id));
        DB::table('orders')->where('id', $drop->id)->update(['order_status' => 'cancelled']);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('expense.shirt', 20)
                ->where('orderCounts.total', 1)
                ->etc());

        $this->assertNotNull($keep);
    }

    public function test_work_still_on_the_floor_is_not_counted_as_spend(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        // Created but never shipped — the labour has not been paid out yet.
        $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 10, 'unit_price' => 100],
        ], $shirt->id, $pants->id);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('expense.total', 0)
                ->where('orderCounts.in_progress', 1)
                ->etc());
    }

    public function test_a_shirt_only_order_is_never_charged_pants_labour(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        // order_items now says which garment each line is, so costing no longer
        // has to guess from the spec and bill pants that were never ordered.
        $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 4, 'unit_price' => 100],
        ], $shirt->id, $pants->id));

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('expense.shirt', 80)
                ->where('expense.pants', 0)
                ->etc());
    }

    // ---------------- revenue ----------------

    public function test_revenue_splits_by_what_was_actually_sold(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        // 10 shirts @100 = 1,000 | 5 pants @80 = 400 | 2 sets @300 = 600  => 2,000
        $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 10, 'unit_price' => 100],
            ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 5, 'unit_price' => 80],
            ['item_type' => 'set', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 2, 'unit_price' => 300],
        ], $shirt->id, $pants->id));

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('revenue.net', 2000)
                ->where('revenue.gross', 2000)
                ->where('revenue.by_garment.shirt', 1000)
                ->where('revenue.by_garment.pants', 400)
                ->where('revenue.by_garment.set', 600)
                ->where('revenue.by_garment.unspecified', 0)
                ->where('revenue.pieces.shirt', 10)
                ->where('revenue.pieces.pants', 5)
                ->where('revenue.pieces.set', 2)
                ->etc());
    }

    public function test_form_one_separate_lines_land_in_the_right_bucket(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $this->closeOrder($this->makeOrder([
            ['item_type' => 'separate_shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 3, 'unit_price' => 100],
            ['item_type' => 'separate_pants', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 2, 'unit_price' => 50],
        ], $shirt->id, $pants->id));

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('revenue.by_garment.shirt', 300)
                ->where('revenue.by_garment.pants', 100)
                ->etc());
    }

    public function test_the_split_adds_back_up_to_the_net_after_a_discount(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        // 1,000 of shirts + 1,000 of pants, less a 10% discount => net 1,800.
        $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 10, 'unit_price' => 100],
            ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 10, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['discount_percent' => 10]));

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(function (Assert $page) {
                $props = $page->toArray()['props']['revenue'];

                $this->assertSame(2000.0, (float) $props['gross']);
                $this->assertSame(200.0, (float) $props['discount']);
                $this->assertSame(1800.0, (float) $props['net']);

                // Each half carries its share of the discount.
                $this->assertSame(900.0, (float) $props['by_garment']['shirt']);
                $this->assertSame(900.0, (float) $props['by_garment']['pants']);

                $sum = array_sum(array_map('floatval', $props['by_garment']));
                $this->assertEqualsWithDelta((float) $props['net'], $sum, 0.01, 'buckets must add up to net');
            });
    }

    public function test_lines_recorded_before_the_split_are_shown_as_unspecified(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $this->closeOrder($this->makeOrder([
            ['item_type' => 'garment', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 4, 'unit_price' => 250],
        ], $shirt->id, $pants->id));

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('revenue.by_garment.unspecified', 1000)
                ->where('revenue.by_garment.shirt', 0)
                ->where('revenue.by_garment.set', 0)
                ->etc());
    }

    public function test_revenue_counts_only_finished_orders(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        // Closed.
        $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 2, 'unit_price' => 100],
        ], $shirt->id, $pants->id));

        // Still on the floor — its money is not income yet.
        $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 50, 'unit_price' => 100],
        ], $shirt->id, $pants->id);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('revenue.net', 200)
                ->where('revenue.order_count', 1)
                ->etc());
    }

    public function test_a_cancelled_order_never_counts_as_revenue(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $order = $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 9, 'unit_price' => 100],
        ], $shirt->id, $pants->id));
        DB::table('orders')->where('id', $order->id)->update(['order_status' => 'cancelled']);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page->where('revenue.net', 0)->etc());
    }

    // ---------------- counts ----------------

    public function test_order_counts_split_completed_from_everything_still_open(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $statuses = ['draft', 'designing', 'confirmed', 'in_production', 'qc_checking', 'shipping', 'completed', 'completed'];

        foreach ($statuses as $status) {
            $order = $this->makeOrder([
                ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 1, 'unit_price' => 100],
            ], $shirt->id, $pants->id);
            DB::table('orders')->where('id', $order->id)->update(['order_status' => $status]);
        }

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('orderCounts.completed', 2)
                ->where('orderCounts.in_progress', 6)
                ->where('orderCounts.total', 8)
                ->etc());
    }

    public function test_an_order_whose_shipping_step_is_done_counts_as_finished_like_the_counter_does(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        // The goods have shipped, so the counter shows this as closed even though
        // order_status still reads `shipping`. The dashboard must agree.
        $order = $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 400, 'unit_price' => 100],
        ], $shirt->id, $pants->id);

        DB::table('orders')->where('id', $order->id)->update(['order_status' => 'shipping']);
        DB::table('order_routings')
            ->where('order_id', $order->id)
            ->where('station_name', 'shipping')
            ->update(['status' => 'completed']);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('orderCounts.completed', 1)
                ->where('orderCounts.in_progress', 0)
                ->where('jobTypeBreakdown.0.completed', 1)
                ->etc());
    }

    public function test_a_skipped_shipping_step_also_counts_as_finished(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $order = $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 5, 'unit_price' => 100],
        ], $shirt->id, $pants->id);

        DB::table('order_routings')
            ->where('order_id', $order->id)
            ->where('station_name', 'shipping')
            ->update(['status' => 'skipped']);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page->where('orderCounts.completed', 1)->etc());
    }

    public function test_an_order_still_waiting_to_ship_is_not_counted_as_finished(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $order = $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 5, 'unit_price' => 100],
        ], $shirt->id, $pants->id);

        DB::table('orders')->where('id', $order->id)->update(['order_status' => 'shipping']);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('orderCounts.completed', 0)
                ->where('orderCounts.in_progress', 1)
                ->etc());
    }

    public function test_one_kind_of_work_is_not_split_into_two_rows(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        // The catalog ships 'ปัก'. An order saved with the old free-text spelling
        // must not appear as a second, near-identical row.
        $order = $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 2, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['job_type' => 'ปัก']);

        $this->assertNotNull($order);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(function (Assert $page) {
                $rows = collect($page->toArray()['props']['jobTypeBreakdown'] ?? []);
                $names = $rows->pluck('job_type');

                $this->assertSame($names->unique()->count(), $names->count(), 'job type rows must be unique');
                $this->assertContains('ปัก', $names->all());
                $this->assertNotContains('งานปัก', $names->all());
            });
    }

    // ---------------- filters ----------------

    public function test_the_date_filter_uses_the_billing_date_and_includes_the_whole_end_day(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 1, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['order_date' => '2026-07-11 23:59:00']);

        $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 1, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['order_date' => '2026-07-12 00:30:00']);

        $this->actingAs($this->owner())->get('/owner-dashboard?date_from=2026-07-11&date_to=2026-07-11')
            ->assertInertia(fn (Assert $page) => $page->where('orderCounts.total', 1)->etc());

        $this->actingAs($this->owner())->get('/owner-dashboard?date_from=2026-07-11&date_to=2026-07-12')
            ->assertInertia(fn (Assert $page) => $page->where('orderCounts.total', 2)->etc());
    }

    public function test_the_job_type_filter_narrows_every_figure(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 1, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['job_type' => 'งานปัก']));

        $this->closeOrder($this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 5, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['job_type' => 'งานสกรีน']));

        $this->actingAs($this->owner())->get('/owner-dashboard?job_type='.urlencode('งานปัก'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('orderCounts.total', 1)
                ->where('expense.shirt', 20)
                ->etc());
    }

    public function test_an_invalid_date_filter_is_ignored_rather_than_erroring(): void
    {
        $this->actingAs($this->owner())->get('/owner-dashboard?date_from=not-a-date&date_to=13/45/2026')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('filters.date_from', null)
                ->where('filters.date_to', null)
                ->etc());
    }

    // ---------------- tables ----------------

    public function test_job_type_table_counts_done_and_in_progress_per_type(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $done = $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 2, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['job_type' => 'งานปัก']);
        DB::table('orders')->where('id', $done->id)->update(['order_status' => 'completed']);

        $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 3, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['job_type' => 'งานปัก']);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('jobTypeBreakdown.0.job_type', 'งานปัก')
                ->where('jobTypeBreakdown.0.completed', 1)
                ->where('jobTypeBreakdown.0.in_progress', 1)
                ->where('jobTypeBreakdown.0.quantity', 5)
                ->etc());
    }

    public function test_garment_usage_ranks_types_by_pieces_and_keeps_only_five(): void
    {
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        foreach ([['A', 1], ['B', 9], ['C', 4], ['D', 7], ['E', 2], ['F', 8]] as [$name, $qty]) {
            $shirt = $this->garmentType('SHIRT', 'เสื้อ'.$name, 10, 20);
            $this->makeOrder([
                ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => $qty, 'unit_price' => 100],
            ], $shirt->id, $pants->id);
        }

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->count('garmentTypeUsage.shirt', 5)
                ->where('garmentTypeUsage.shirt.0.name', 'เสื้อB')
                ->where('garmentTypeUsage.shirt.0.pieces', 9)
                ->where('garmentTypeUsage.shirt.1.name', 'เสื้อF')
                ->etc());
    }

    // ---------------- calendar ----------------

    public function test_the_calendar_groups_deliveries_by_due_date(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 4, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['due_date' => '2026-07-20 18:00:00']);

        $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 6, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['due_date' => '2026-07-20 09:00:00']);

        $this->actingAs($this->owner())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('calendar.month', '2026-07')
                ->where('calendar.today', '2026-07-15')
                ->where('calendar.days.2026-07-20.count', 2)
                ->where('calendar.days.2026-07-20.quantity', 10)
                ->etc());
    }

    public function test_the_calendar_ignores_the_dashboard_date_filter(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 4, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['due_date' => '2026-07-20 18:00:00']);

        // Filter excludes the order from the summary, but "what ships this month"
        // must still show it.
        $this->actingAs($this->owner())->get('/owner-dashboard?date_from=2026-01-01&date_to=2026-01-02')
            ->assertInertia(fn (Assert $page) => $page
                ->where('orderCounts.total', 0)
                ->where('calendar.days.2026-07-20.count', 1)
                ->etc());
    }

    public function test_the_calendar_can_be_moved_to_another_month(): void
    {
        $shirt = $this->garmentType('SHIRT', 'เสื้อโปโล', 10, 20);
        $pants = $this->garmentType('PANTS', 'กางเกงขาสั้น', 5, 15);

        $this->makeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 4, 'unit_price' => 100],
        ], $shirt->id, $pants->id, ['due_date' => '2026-09-03 18:00:00']);

        $this->actingAs($this->owner())->get('/owner-dashboard?calendar_month=2026-09')
            ->assertInertia(fn (Assert $page) => $page
                ->where('calendar.month', '2026-09')
                ->where('calendar.days.2026-09-03.count', 1)
                ->etc());
    }
}
