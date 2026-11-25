<?php

namespace Tests\Feature\Http\Controllers;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\OrderStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The delivery note's own discount.
 *
 * It comes off what the bill came to and stops there. Everything these tests
 * guard is that separation: the bill's total, its own discount, its net and
 * therefore what the customer still owes must all read the same before and
 * after. A discount that leaked into the bill would quietly mark paid bills
 * as overpaid and move the shop's revenue.
 */
class DeliveryNoteDiscountTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = Customer::create([
            'customer_code' => 'CUS-DN-1',
            'customer_name' => 'ลูกค้าใบส่งของ',
        ]);
        $this->branch = Branch::create([
            'branch_code' => 'BR-DN-1',
            'branch_name' => 'สาขาใบส่งของ',
        ]);
    }

    private function user(UserRole $role, ?Branch $branch = null): User
    {
        return User::factory()->create([
            'role' => $role,
            'station_department' => StationDepartment::None,
            'branch_id' => ($branch ?? $this->branch)->id,
        ]);
    }

    private function makeOrder(User $creator): Order
    {
        $order = (new CreateOrderAction)->execute([
            'customer_id' => $this->customer->id,
            'branch_id' => $this->branch->id,
            'job_name' => 'งานใบส่งของ',
            'job_type' => 'งานปัก',
            'order_date' => '2026-11-01 09:00:00',
            'due_date' => '2026-11-20 18:00:00',
            'discount_percent' => 10,
            'items' => [[
                'item_type' => 'separate_shirt', 'size_group' => 'adults',
                'size_label' => 'L', 'quantity' => 100, 'unit_price' => 100,
            ]],
        ], $creator->id);

        return Order::query()->findOrFail($order->id);
    }

    public function test_the_note_keeps_its_discount_so_a_reprint_says_the_same_figure(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);

        $this->actingAs($sales)
            ->post("/orders/{$order->id}/delivery-discount", [
                'delivery_discount_percent' => 5,
            ])
            ->assertRedirect();

        $this->assertSame(5.0, (float) $order->refresh()->delivery_discount_percent);
    }

    public function test_it_changes_nothing_about_what_the_bill_is_worth(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);

        $before = [
            'total' => (float) $order->total_amount,
            'discount_percent' => (float) $order->discount_percent,
            'discount_amount' => (float) $order->discount_amount,
            'net' => (float) $order->net_amount,
        ];

        $this->actingAs($sales)
            ->post("/orders/{$order->id}/delivery-discount", [
                'delivery_discount_percent' => 20,
            ])
            ->assertRedirect();

        $order->refresh();

        $this->assertSame($before, [
            'total' => (float) $order->total_amount,
            'discount_percent' => (float) $order->discount_percent,
            'discount_amount' => (float) $order->discount_amount,
            'net' => (float) $order->net_amount,
        ]);
    }

    public function test_it_cannot_give_away_more_than_the_bill_discount_may(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);

        $this->actingAs($sales)
            ->post("/orders/{$order->id}/delivery-discount", [
                'delivery_discount_percent' => 80,
            ])
            ->assertSessionHasErrors('delivery_discount_percent');

        $this->assertSame(0.0, (float) $order->refresh()->delivery_discount_percent);
    }

    public function test_a_negative_discount_is_refused(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);

        $this->actingAs($sales)
            ->post("/orders/{$order->id}/delivery-discount", [
                'delivery_discount_percent' => -5,
            ])
            ->assertSessionHasErrors('delivery_discount_percent');
    }

    public function test_the_shop_floor_may_not_move_the_figure_a_customer_signs_for(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);
        $worker = $this->user(UserRole::Worker);

        $this->actingAs($worker)
            ->post("/orders/{$order->id}/delivery-discount", [
                'delivery_discount_percent' => 10,
            ])
            ->assertForbidden();

        $this->assertSame(0.0, (float) $order->refresh()->delivery_discount_percent);
    }

    public function test_another_branchs_bill_is_out_of_reach(): void
    {
        $owner = $this->user(UserRole::Sales);
        $order = $this->makeOrder($owner);

        $elsewhere = Branch::create(['branch_code' => 'BR-DN-2', 'branch_name' => 'อีกสาขา']);

        $this->actingAs($this->user(UserRole::Sales, $elsewhere))
            ->post("/orders/{$order->id}/delivery-discount", [
                'delivery_discount_percent' => 10,
            ])
            ->assertForbidden();
    }

    public function test_a_cancelled_bill_hands_over_nothing(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);
        $order->forceFill(['order_status' => OrderStatus::Cancelled])->save();

        $this->actingAs($sales)
            ->post("/orders/{$order->id}/delivery-discount", [
                'delivery_discount_percent' => 10,
            ])
            ->assertForbidden();
    }

    public function test_the_counter_carries_the_saved_discount_and_who_may_change_it(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);

        $this->actingAs($sales)->post("/orders/{$order->id}/delivery-discount", [
            'delivery_discount_percent' => 7.5,
        ]);

        $this->actingAs($sales)->get('/counter')->assertInertia(
            fn ($page) => $page
                ->where('orders.0.details.pricing.delivery_discount_percent', 7.5)
                ->where('orders.0.details.can_discount_delivery_note', true)
                ->etc(),
        );

        $this->actingAs($this->user(UserRole::Worker))->get('/counter')->assertInertia(
            fn ($page) => $page
                ->where('orders.0.details.can_discount_delivery_note', false)
                ->etc(),
        );
    }
}
