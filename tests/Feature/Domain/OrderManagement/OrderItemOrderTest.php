<?php

namespace Tests\Feature\Domain\OrderManagement;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A bill's lines come back in the order the counter typed them.
 *
 * order_items carries an (order_id, size_label) index, and a relation with no
 * ORDER BY lets the database answer from it — which hands the rows back sorted
 * by size name. Reopening a bill to edit or to copy then showed its size rows
 * shuffled: type JM, JSS, JL and the form came back JL, JM, JSS.
 */
class OrderItemOrderTest extends TestCase
{
    use RefreshDatabase;

    private function creator(): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);
    }

    /** Sizes deliberately out of alphabetical order, as a counter would type them. */
    private const TYPED = [
        ['separate_shirt', 'kids', 'JM'],
        ['separate_shirt', 'kids', 'JSS'],
        ['separate_shirt', 'kids', 'JL'],
        ['separate_pants', 'kids', 'JL'],
        ['separate_pants', 'kids', 'JM'],
    ];

    private function orderWithTypedRows(): Order
    {
        $customer = Customer::firstOrCreate(
            ['customer_code' => 'CUS-ORDER-1'],
            ['customer_name' => 'ลูกค้าทดสอบ'],
        );
        $branch = Branch::firstOrCreate(
            ['branch_code' => 'BR-ORDER-1'],
            ['branch_name' => 'สาขาทดสอบ'],
        );

        return (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'งานทดสอบลำดับ',
            'job_type' => 'งานปัก',
            'order_date' => '2026-09-01 09:00:00',
            'due_date' => '2026-09-20 18:00:00',
            'discount_percent' => 0,
            'items' => array_map(static fn (array $row): array => [
                'item_type' => $row[0],
                'size_group' => $row[1],
                'size_label' => $row[2],
                'shirt_style' => 'short',
                'pants_style' => 'short',
                'quantity' => 5,
                'unit_price' => 100,
            ], self::TYPED),
        ], $this->creator()->id);
    }

    /** @return list<string> */
    private function rowsOf(Order $order): array
    {
        return $order->items
            ->map(fn ($item): string => $item->item_type.':'.$item->size_label)
            ->all();
    }

    public function test_the_lines_come_back_in_the_order_they_were_typed(): void
    {
        $expected = array_map(
            static fn (array $row): string => $row[0].':'.$row[2],
            self::TYPED,
        );

        $this->assertSame($expected, $this->rowsOf($this->orderWithTypedRows()->refresh()));
    }

    public function test_the_order_survives_being_loaded_fresh_from_the_database(): void
    {
        $order = $this->orderWithTypedRows();

        // Not the copy held in memory from the write — a clean read, which is
        // what the edit page does.
        $reloaded = Order::query()->with('items')->findOrFail($order->id);

        $this->assertSame(
            ['separate_shirt:JM', 'separate_shirt:JSS', 'separate_shirt:JL', 'separate_pants:JL', 'separate_pants:JM'],
            $this->rowsOf($reloaded),
        );
    }

    public function test_it_is_not_merely_alphabetical_by_size(): void
    {
        // The failure this guards against returned JL, JL, JM, JM, JSS.
        $sizes = array_map(
            static fn (string $row): string => explode(':', $row)[1],
            $this->rowsOf($this->orderWithTypedRows()->refresh()),
        );
        $sorted = $sizes;
        sort($sorted);

        $this->assertNotSame($sorted, $sizes);
    }
}
