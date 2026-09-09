<?php

namespace Tests\Feature\Http\Controllers;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * The counter's delivery-due calendar must follow the same branch rule the
 * order list uses: a branch sees its own jobs, and the head-office branch
 * (branch_cross_view_code, "01") sees every branch. Leaking another branch's
 * orders here would leak them everywhere the calendar is shown.
 */
class CounterDeliveryCalendarTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // The calendar is built around "today", so freeze it.
        Carbon::setTestNow(Carbon::parse('2026-09-10 09:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function branch(string $code, string $name): Branch
    {
        return Branch::create(['branch_code' => $code, 'branch_name' => $name]);
    }

    private function userFor(Branch $branch): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
        ]);
    }

    private function makeOrder(Branch $branch, User $creator, string $jobName, string $dueDate): void
    {
        $customer = Customer::firstOrCreate(
            ['customer_code' => 'CUS-CAL-0001'],
            ['customer_name' => 'Calendar Customer'],
        );

        (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => $jobName,
            'job_type' => 'งานปัก',
            'order_date' => '2026-09-01 09:00:00',
            'due_date' => $dueDate,
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => 'L',
                'quantity' => 4,
                'unit_price' => 50,
            ]],
        ], $creator->id);
    }

    public function test_a_branch_sees_only_its_own_jobs_on_the_calendar(): void
    {
        $own = $this->branch('02', 'ศรีบุญเรือง');
        $other = $this->branch('03', 'เมืองเลย');

        $ownUser = $this->userFor($own);
        $otherUser = $this->userFor($other);

        $this->makeOrder($own, $ownUser, 'Own Branch Job', '2026-09-15 18:00:00');
        $this->makeOrder($other, $otherUser, 'Other Branch Job', '2026-09-15 18:00:00');

        $this->actingAs($ownUser)
            ->get('/counter')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Counter')
                ->where('deliveryCalendar.days.2026-09-15.count', 1)
                ->where('deliveryCalendar.days.2026-09-15.orders.0.job_name', 'Own Branch Job'));
    }

    public function test_head_office_sees_every_branch_on_the_calendar(): void
    {
        $head = $this->branch('01', 'หนองบัวลำภู');
        $other = $this->branch('03', 'เมืองเลย');

        $headUser = $this->userFor($head);
        $otherUser = $this->userFor($other);

        $this->makeOrder($head, $headUser, 'Head Office Job', '2026-09-15 18:00:00');
        $this->makeOrder($other, $otherUser, 'Other Branch Job', '2026-09-15 18:00:00');

        $this->actingAs($headUser)
            ->get('/counter')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Counter')
                ->where('deliveryCalendar.days.2026-09-15.count', 2));
    }

    public function test_the_button_badge_counts_jobs_due_today_within_the_same_scope(): void
    {
        $own = $this->branch('02', 'ศรีบุญเรือง');
        $other = $this->branch('03', 'เมืองเลย');

        $ownUser = $this->userFor($own);
        $otherUser = $this->userFor($other);

        $this->makeOrder($own, $ownUser, 'Due Today A', '2026-09-10 18:00:00');
        $this->makeOrder($own, $ownUser, 'Due Today B', '2026-09-10 09:30:00');
        $this->makeOrder($own, $ownUser, 'Due Tomorrow', '2026-09-11 18:00:00');
        $this->makeOrder($other, $otherUser, 'Other Branch Due Today', '2026-09-10 18:00:00');

        $this->actingAs($ownUser)
            ->get('/counter')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('deliveryDueToday', 2));

        $this->actingAs($otherUser)
            ->get('/counter')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('deliveryDueToday', 1));
    }

    public function test_the_calendar_serves_the_requested_month(): void
    {
        $branch = $this->branch('02', 'ศรีบุญเรือง');
        $user = $this->userFor($branch);

        $this->makeOrder($branch, $user, 'October Job', '2026-10-05 18:00:00');

        $this->actingAs($user)
            ->get('/counter?calendar_month=2026-10')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('deliveryCalendar.month', '2026-10')
                ->where('deliveryCalendar.days.2026-10-05.count', 1));
    }

    public function test_a_malformed_month_falls_back_to_the_current_one(): void
    {
        $branch = $this->branch('02', 'ศรีบุญเรือง');
        $user = $this->userFor($branch);

        $this->actingAs($user)
            ->get('/counter?calendar_month=not-a-month')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('deliveryCalendar.month', '2026-09'));
    }
}
