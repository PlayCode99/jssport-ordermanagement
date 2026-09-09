<?php

namespace Tests\Feature\Domain\OrderManagement;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Domain\OrderManagement\Actions\UpdateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Sleeve length (แขนสั้น/แขนยาว) and leg length (ขาสั้น/ขายาว) are chosen once
 * per size row on the order form and must survive all the way to the printed
 * receipt, including on the separate-piece lines that inherit them.
 */
class OrderItemGarmentStyleTest extends TestCase
{
    use RefreshDatabase;

    private function baseOrderData(array $items): array
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-STYLE-0001',
            'customer_name' => 'Garment Style Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-STYLE-0001',
            'branch_name' => 'Garment Style Branch',
        ]);

        return [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Garment Style Order',
            'job_type' => 'งานปัก',
            'order_date' => '2026-08-01 09:00:00',
            'due_date' => '2026-08-10 18:00:00',
            'discount_percent' => 0,
            'items' => $items,
        ];
    }

    private function creator(): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);
    }

    public function test_it_stores_the_style_chosen_for_each_line(): void
    {
        $order = (new CreateOrderAction)->execute($this->baseOrderData([
            [
                'item_type' => 'set',
                'size_group' => 'adults',
                'size_label' => 'M',
                'shirt_style' => 'long',
                'pants_style' => 'short',
                'quantity' => 5,
                'unit_price' => 300,
            ],
            [
                'item_type' => 'separate_shirt',
                'size_group' => 'adults',
                'size_label' => 'M',
                'shirt_style' => 'long',
                'quantity' => 2,
                'unit_price' => 200,
            ],
        ]), $this->creator()->id);

        $items = $order->items()->orderBy('id')->get();

        $this->assertSame('long', $items[0]->shirt_style);
        $this->assertSame('short', $items[0]->pants_style);

        // The separate shirt inherits the row's sleeve length and states no leg
        // length, because it has no pants.
        $this->assertSame('long', $items[1]->shirt_style);
        $this->assertNull($items[1]->pants_style);
    }

    public function test_an_order_saved_without_a_style_records_no_style(): void
    {
        $order = (new CreateOrderAction)->execute($this->baseOrderData([
            [
                'item_type' => 'set',
                'size_group' => 'adults',
                'size_label' => 'L',
                'quantity' => 4,
                'unit_price' => 250,
            ],
        ]), $this->creator()->id);

        $this->assertNull($order->items()->first()->shirt_style);
        $this->assertNull($order->items()->first()->pants_style);
    }

    public function test_it_rejects_a_style_that_is_not_short_or_long(): void
    {
        $order = (new CreateOrderAction)->execute($this->baseOrderData([
            [
                'item_type' => 'set',
                'size_group' => 'adults',
                'size_label' => 'L',
                'shirt_style' => 'sleeveless',
                'pants_style' => '',
                'quantity' => 4,
                'unit_price' => 250,
            ],
        ]), $this->creator()->id);

        $this->assertNull($order->items()->first()->shirt_style);
        $this->assertNull($order->items()->first()->pants_style);
    }

    public function test_editing_an_order_keeps_the_style(): void
    {
        $creator = $this->creator();
        $data = $this->baseOrderData([
            [
                'item_type' => 'set',
                'size_group' => 'adults',
                'size_label' => 'M',
                'shirt_style' => 'short',
                'pants_style' => 'long',
                'quantity' => 5,
                'unit_price' => 300,
            ],
        ]);

        $order = (new CreateOrderAction)->execute($data, $creator->id);

        (new UpdateOrderAction)->execute($order, [
            'job_name' => 'Garment Style Order (edited)',
            'items' => [
                [
                    'item_type' => 'set',
                    'size_group' => 'adults',
                    'size_label' => 'M',
                    'shirt_style' => 'short',
                    'pants_style' => 'long',
                    'quantity' => 6,
                    'unit_price' => 300,
                ],
            ],
        ], $creator->id);

        $item = $order->fresh()->items()->first();

        $this->assertSame(6, $item->quantity);
        $this->assertSame('short', $item->shirt_style);
        $this->assertSame('long', $item->pants_style);
    }
}
