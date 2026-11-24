<?php

namespace Tests\Feature\Domain\OrderManagement;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Domain\OrderManagement\Actions\UpdateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use App\Support\Orders\OrderCharges;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "คิดเงินเพิ่มเติม": money a bill charges for something that is not a
 * garment — delivery, a rush fee, a courier.
 *
 * The rule that matters is where it lands in the arithmetic: it is added to
 * the garments BEFORE the discount, so the shop discounts the bill as one
 * figure. Get that the wrong way round and every discounted bill with a
 * delivery charge is wrong by the discount on that charge.
 */
class OrderExtraChargesTest extends TestCase
{
    use RefreshDatabase;

    private function creator(): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);
    }

    private function orderData(array $over = []): array
    {
        $customer = Customer::firstOrCreate(
            ['customer_code' => 'CUS-FEE-1'],
            ['customer_name' => 'ลูกค้าค่าส่ง'],
        );
        $branch = Branch::firstOrCreate(
            ['branch_code' => 'BR-FEE-1'],
            ['branch_name' => 'สาขาค่าส่ง'],
        );

        return array_merge([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'งานทดสอบค่าใช้จ่าย',
            'job_type' => 'งานปัก',
            'order_date' => '2026-11-01 09:00:00',
            'due_date' => '2026-11-20 18:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'separate_shirt',
                'size_group' => 'adults',
                'size_label' => 'L',
                'quantity' => 100,
                'unit_price' => 100,
            ]],
        ], $over);
    }

    private function make(array $over = []): Order
    {
        $order = (new CreateOrderAction)->execute($this->orderData($over), $this->creator()->id);

        return Order::query()->findOrFail($order->id);
    }

    // ---------------- where it lands in the arithmetic ----------------

    public function test_a_charge_is_added_to_the_goods_before_the_discount(): void
    {
        $order = $this->make([
            'discount_percent' => 10,
            'charges' => [['label' => 'ค่าจัดส่ง', 'amount' => 500]],
        ]);

        // 10,000 goods + 500 delivery = 10,500, less 10% = 9,450.
        $this->assertSame(10500.0, (float) $order->total_amount);
        $this->assertSame(1050.0, (float) $order->discount_amount);
        $this->assertSame(9450.0, (float) $order->net_amount);
    }

    public function test_a_bill_with_no_charges_is_priced_exactly_as_before(): void
    {
        $order = $this->make(['discount_percent' => 10]);

        $this->assertSame(10000.0, (float) $order->total_amount);
        $this->assertSame(1000.0, (float) $order->discount_amount);
        $this->assertSame(9000.0, (float) $order->net_amount);
        $this->assertCount(0, $order->charges);
    }

    public function test_several_charges_are_kept_in_the_order_they_were_typed(): void
    {
        $order = $this->make([
            'charges' => [
                ['label' => 'ค่าจัดส่ง', 'amount' => 500],
                ['label' => 'ค่าทำด่วน', 'amount' => 1200],
                ['label' => 'ค่าออกแบบ', 'amount' => 300],
            ],
        ]);

        $this->assertSame(
            ['ค่าจัดส่ง', 'ค่าทำด่วน', 'ค่าออกแบบ'],
            $order->charges->pluck('label')->all(),
        );
        $this->assertSame([0, 1, 2], $order->charges->pluck('position')->all());
        $this->assertSame(12000.0, (float) $order->total_amount);
    }

    // ---------------- what is refused ----------------

    public function test_a_negative_amount_never_becomes_a_second_discount(): void
    {
        $order = $this->make([
            'charges' => [
                ['label' => 'หักส่วนลดเพิ่ม', 'amount' => -5000],
                ['label' => 'ค่าจัดส่ง', 'amount' => 500],
            ],
        ]);

        $this->assertSame(['ค่าจัดส่ง'], $order->charges->pluck('label')->all());
        $this->assertSame(10500.0, (float) $order->total_amount);
    }

    public function test_a_half_typed_line_is_dropped_rather_than_billed(): void
    {
        $order = $this->make([
            'charges' => [
                ['label' => '', 'amount' => 500],
                ['label' => 'ยังไม่ได้ใส่เงิน', 'amount' => 0],
                ['label' => 'ค่าจัดส่ง', 'amount' => 500],
            ],
        ]);

        $this->assertSame(['ค่าจัดส่ง'], $order->charges->pluck('label')->all());
    }

    public function test_more_lines_than_a_bill_can_sensibly_carry_are_cut_off(): void
    {
        $order = $this->make([
            'charges' => array_map(
                static fn (int $index): array => ['label' => 'ค่า '.$index, 'amount' => 1],
                range(1, OrderCharges::MAX_LINES + 10),
            ),
        ]);

        $this->assertCount(OrderCharges::MAX_LINES, $order->charges);
    }

    // ---------------- editing a bill ----------------

    public function test_editing_replaces_the_charges_and_reprices_the_bill(): void
    {
        $actor = $this->creator();
        $order = $this->make([
            'charges' => [['label' => 'ค่าจัดส่ง', 'amount' => 500]],
        ]);

        $updated = (new UpdateOrderAction)->execute(
            $order,
            $this->orderData([
                'discount_percent' => 10,
                'charges' => [['label' => 'ค่าทำด่วน', 'amount' => 1000]],
            ]),
            $actor->id,
        );

        $updated->refresh();

        $this->assertSame(['ค่าทำด่วน'], $updated->charges->pluck('label')->all());
        $this->assertSame(11000.0, (float) $updated->total_amount);
        $this->assertSame(9900.0, (float) $updated->net_amount);
    }

    public function test_editing_a_bill_can_take_every_charge_off_again(): void
    {
        $actor = $this->creator();
        $order = $this->make([
            'charges' => [['label' => 'ค่าจัดส่ง', 'amount' => 500]],
        ]);

        $updated = (new UpdateOrderAction)->execute(
            $order,
            $this->orderData(['charges' => []]),
            $actor->id,
        );

        $updated->refresh();

        $this->assertCount(0, $updated->charges);
        $this->assertSame(10000.0, (float) $updated->total_amount);
        $this->assertDatabaseCount('order_charges', 0);
    }

    public function test_charges_go_when_the_bill_row_goes(): void
    {
        // Built by hand rather than through the action: a bill that has been
        // opened at the counter also has a receipt, and receipts hold the
        // order row back from a hard delete. What is under test here is only
        // that charges do not outlive their bill in the database.
        $customer = Customer::firstOrCreate(
            ['customer_code' => 'CUS-FEE-2'],
            ['customer_name' => 'ลูกค้าทดสอบ'],
        );
        $branch = Branch::firstOrCreate(
            ['branch_code' => 'BR-FEE-2'],
            ['branch_name' => 'สาขาทดสอบ'],
        );
        $order = Order::create([
            'order_code' => 'FEE-CASCADE-1',
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $this->creator()->id,
            'job_name' => 'ทดสอบลบ',
            'job_type' => 'งานปัก',
            'order_date' => '2026-11-01 09:00:00',
            'due_date' => '2026-11-20 18:00:00',
        ]);
        $order->charges()->create(['label' => 'ค่าจัดส่ง', 'amount' => 500, 'position' => 0]);

        $this->assertDatabaseCount('order_charges', 1);

        $order->forceDelete();

        $this->assertDatabaseCount('order_charges', 0);
    }
}
