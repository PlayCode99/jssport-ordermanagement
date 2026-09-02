<?php

namespace Tests\Feature\Production;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Both the counter and the production rooms list the newest bill first and show
 * ten at a time. Orders opened in the same second must keep a stable order, or a
 * row can hide on one page and repeat on the next.
 */
class ProductionListOrderingTest extends TestCase
{
    use RefreshDatabase;

    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-09-02 09:00:00'));

        $this->actor = User::factory()->create([
            'role' => UserRole::Admin,
            'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None,
            'is_active' => true,
            'branch_id' => null,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function makeOrders(int $count): void
    {
        $customer = Customer::create(['customer_code' => 'CUS-ORD', 'customer_name' => 'Ordering']);
        $branch = Branch::create(['branch_code' => 'BR-ORD', 'branch_name' => 'Ordering']);
        $action = new CreateOrderAction();

        for ($index = 1; $index <= $count; $index++) {
            $action->execute([
                'customer_id' => $customer->id,
                'branch_id' => $branch->id,
                'job_name' => "งานที่ {$index}",
                'job_type' => 'ปัก',
                'order_date' => now()->toDateTimeString(),
                // Deliberately shuffled so due date cannot be what sorts the list.
                'due_date' => now()->addDays(30 - $index)->toDateTimeString(),
                'discount_percent' => 0,
                'items' => [[
                    'item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M',
                    'quantity' => 1, 'unit_price' => 100,
                ]],
            ], $this->actor->id);
        }
    }

    public function test_the_production_list_shows_the_newest_order_first(): void
    {
        $this->makeOrders(3);
        $newest = Order::query()->latest('id')->firstOrFail();

        $this->actingAs($this->actor)->get('/production/cutting')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('orders.0.order_code', $newest->order_code)->etc());
    }

    public function test_the_production_list_shows_ten_orders_per_page(): void
    {
        $this->makeOrders(23);

        $this->actingAs($this->actor)->get('/production/cutting')
            ->assertInertia(fn (Assert $page) => $page
                ->count('orders', 10)
                ->where('pagination.per_page', 10)
                ->where('pagination.total', 23)
                ->where('pagination.last_page', 3)
                ->etc());
    }

    public function test_paging_through_production_never_repeats_or_drops_an_order(): void
    {
        $this->makeOrders(23);

        $seen = [];

        foreach ([1, 2, 3] as $pageNumber) {
            $this->actingAs($this->actor)->get("/production/cutting?page={$pageNumber}")
                ->assertInertia(function (Assert $page) use (&$seen) {
                    foreach ($page->toArray()['props']['orders'] as $order) {
                        $seen[] = $order['order_code'];
                    }
                });
        }

        $this->assertCount(23, $seen);
        $this->assertCount(23, array_unique($seen), 'no order may appear on two pages');
    }

    public function test_the_counter_also_leads_with_the_newest_order(): void
    {
        $this->makeOrders(12);
        $newest = Order::query()->latest('id')->firstOrFail();

        $this->actingAs($this->actor)->get('/counter')
            ->assertInertia(fn (Assert $page) => $page
                ->where('orders.0.order_code', $newest->order_code)
                ->count('orders', 10)
                ->etc());
    }

    public function test_orders_opened_in_the_same_second_keep_a_stable_order(): void
    {
        // CreateOrderAction stamps order_date with the frozen clock, so all of
        // these share a timestamp and only the id can separate them.
        $this->makeOrders(12);

        $firstPass = [];
        $secondPass = [];

        $this->actingAs($this->actor)->get('/counter')
            ->assertInertia(function (Assert $page) use (&$firstPass) {
                $firstPass = array_column($page->toArray()['props']['orders'], 'order_code');
            });

        $this->actingAs($this->actor)->get('/counter')
            ->assertInertia(function (Assert $page) use (&$secondPass) {
                $secondPass = array_column($page->toArray()['props']['orders'], 'order_code');
            });

        $this->assertSame($firstPass, $secondPass);
        $this->assertSame($firstPass, array_values(array_unique($firstPass)));
    }
}
