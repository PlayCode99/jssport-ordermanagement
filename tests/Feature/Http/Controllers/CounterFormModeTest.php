<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderSpecification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * The counter lays a bill's sizes out the way the form that wrote it takes
 * them, and order_items alone cannot say which form that was: Form 1 and
 * Form 2 both record plain shirts and trousers. So the bill carries the form
 * it was written on.
 */
class CounterFormModeTest extends TestCase
{
    use RefreshDatabase;

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

    private function orderWithMode(?string $mode): Order
    {
        $customer = Customer::firstOrCreate(
            ['customer_code' => 'CUS-MODE-1'],
            ['customer_name' => 'ลูกค้าทดสอบ'],
        );
        $branch = Branch::firstOrCreate(
            ['branch_code' => 'BR-MODE-1'],
            ['branch_name' => 'สาขาทดสอบ'],
        );

        $order = Order::query()->create([
            'order_code' => 'TEST-'.($mode ?? 'none'),
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $this->owner()->id,
            'job_name' => 'งานทดสอบ',
            'job_type' => 'งานปัก',
            'order_date' => now(),
            'due_date' => now()->addDays(7),
            'total_amount' => 0,
            'discount_percent' => 0,
            'discount_amount' => 0,
            'net_amount' => 0,
        ]);

        OrderSpecification::query()->create([
            'order_id' => $order->id,
            'screen_print_detail' => json_encode(
                $mode === null
                    ? ['schema' => 'spec-v2']
                    : ['schema' => 'spec-v2', 'mode' => $mode],
                JSON_THROW_ON_ERROR,
            ),
        ]);

        return $order;
    }

    private function formModeFor(Order $order): ?string
    {
        $mode = null;

        $this->actingAs($this->owner())
            ->get('/counter?search='.$order->order_code)
            ->assertOk()
            ->assertInertia(function (Assert $page) use ($order, &$mode): void {
                foreach ($page->toArray()['props']['orders'] as $row) {
                    if (($row['order_code'] ?? null) === $order->order_code) {
                        $mode = $row['details']['form_mode'] ?? null;
                    }
                }

                $page->etc();
            });

        return $mode;
    }

    public function test_the_counter_says_which_form_wrote_the_bill(): void
    {
        foreach (['matrix', 'individual', 'sports_day', 'pe_uniform'] as $mode) {
            $this->assertSame($mode, $this->formModeFor($this->orderWithMode($mode)));
        }
    }

    public function test_a_bill_saved_before_the_form_was_recorded_says_nothing(): void
    {
        // Empty, not missing: the receipt reads it as "not one of the garment
        // table forms" and leaves such a bill on the layout it was sold on.
        $this->assertSame('', $this->formModeFor($this->orderWithMode(null)));
    }
}
