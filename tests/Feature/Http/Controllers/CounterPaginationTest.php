<?php

namespace Tests\Feature\Http\Controllers;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * The counter page paginates the order table server-side, but the floor cards
 * must keep summarising EVERY order matching the current filters. These tests
 * guard exactly that split — a regression here silently shows wrong production
 * numbers to the counter staff.
 */
class CounterPaginationTest extends TestCase
{
    use RefreshDatabase;

    private const PER_PAGE = 10;

    private function makeOrders(int $count, string $jobType = 'งานปัก', int $quantityPerOrder = 4): array
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-COUNTER-0001',
            'customer_name' => 'Counter Pagination Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-COUNTER-01',
            'branch_name' => 'Counter Pagination Branch',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
        ]);

        $action = new CreateOrderAction;

        for ($index = 0; $index < $count; $index += 1) {
            $action->execute([
                'customer_id' => $customer->id,
                'branch_id' => $branch->id,
                'job_name' => "Counter Order {$index}",
                'job_type' => $jobType,
                'order_date' => '2026-07-11 09:00:00',
                'due_date' => '2026-07-20 18:00:00',
                'discount_percent' => 0,
                'items' => [
                    [
                        'item_type' => 'shirt',
                        'size_group' => 'adults',
                        'size_label' => 'L',
                        'quantity' => $quantityPerOrder,
                        'unit_price' => 50,
                    ],
                ],
            ], $creator->id);
        }

        return [$creator, $branch, $customer];
    }

    public function test_counter_returns_only_one_page_of_orders_with_pagination_meta(): void
    {
        [$creator] = $this->makeOrders(23);

        $this->assertSame(23, Order::query()->count());

        $this->actingAs($creator)
            ->get('/counter')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Counter')
                ->has('orders', self::PER_PAGE)
                ->where('pagination.current_page', 1)
                ->where('pagination.last_page', 3)
                ->where('pagination.per_page', self::PER_PAGE)
                ->where('pagination.total', 23)
                ->where('pagination.from', 1)
                ->where('pagination.to', 10));
    }

    public function test_counter_serves_the_requested_page_without_overlapping_the_first_one(): void
    {
        [$creator] = $this->makeOrders(23);

        $firstPageCodes = [];

        $this->actingAs($creator)
            ->get('/counter')
            ->assertInertia(function (Assert $page) use (&$firstPageCodes): void {
                $firstPageCodes = collect($page->toArray()['props']['orders'])
                    ->pluck('order_code')
                    ->all();
            });

        $this->actingAs($creator)
            ->get('/counter?page=3')
            ->assertOk()
            ->assertInertia(function (Assert $page) use ($firstPageCodes): void {
                $page->where('pagination.current_page', 3)
                    ->where('pagination.total', 23)
                    ->has('orders', 3);

                $thirdPageCodes = collect($page->toArray()['props']['orders'])
                    ->pluck('order_code')
                    ->all();

                $this->assertEmpty(
                    array_intersect($firstPageCodes, $thirdPageCodes),
                    'Page 3 must not repeat orders already shown on page 1.',
                );
            });
    }

    public function test_floor_stats_summarise_every_matching_order_not_just_the_visible_page(): void
    {
        // 23 freshly created orders, 4 shirts each. Every order starts with all of
        // its required routings pending, so each production room that the job type
        // routes through must count all 23 orders — never only the 10 on page 1.
        [$creator] = $this->makeOrders(23, 'งานปัก', 4);

        $this->actingAs($creator)
            ->get('/counter')
            ->assertOk()
            ->assertInertia(function (Assert $page): void {
                $props = $page->toArray()['props'];

                $this->assertCount(self::PER_PAGE, $props['orders'], 'Table payload stays capped at one page.');

                $floorStats = $props['floorStats'];
                $countedRooms = 0;

                foreach (['cutting', 'sewing', 'embroidery', 'qc', 'print_room'] as $room) {
                    $newJob = (int) ($floorStats[$room]['new_job'] ?? 0);

                    if ($newJob === 0) {
                        continue;
                    }

                    $countedRooms += 1;

                    $this->assertSame(
                        23,
                        $newJob,
                        "Room {$room} must count all 23 matching orders, not just the current page.",
                    );
                    $this->assertSame(
                        23 * 4,
                        (int) $floorStats[$room]['new_job_qty'],
                        "Room {$room} must sum quantities across all matching orders.",
                    );
                }

                $this->assertGreaterThan(0, $countedRooms, 'Expected at least one production room to receive the new orders.');
            });
    }

    public function test_floor_stats_follow_the_active_filters(): void
    {
        [$creator] = $this->makeOrders(12);

        // A search that matches nothing must zero out the cards as well as the table.
        $this->actingAs($creator)
            ->get('/counter?search='.urlencode('ไม่มีออเดอร์นี้แน่นอน'))
            ->assertOk()
            ->assertInertia(function (Assert $page): void {
                $props = $page->toArray()['props'];

                $this->assertCount(0, $props['orders']);
                $this->assertSame(0, (int) $props['pagination']['total']);

                foreach ($props['floorStats'] as $room => $buckets) {
                    foreach ($buckets as $bucket => $value) {
                        $this->assertSame(0, (int) $value, "floorStats.{$room}.{$bucket} must be 0 when nothing matches.");
                    }
                }
            });
    }
}
