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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "กุ้นกางเกง" is a free-text pants spec (stored under seat_style_text). It travels inside the spec-v2 JSON in
 * order_specifications.screen_print_detail, so these tests read the stored row
 * back rather than trusting the request payload.
 */
class PantsSeatStyleTest extends TestCase
{
    use RefreshDatabase;

    private function orderData(string $seatStyle): array
    {
        $customer = Customer::create(['customer_code' => 'CUS-SEAT-0001', 'customer_name' => 'Seat Style Customer']);
        $branch = Branch::create(['branch_code' => 'BR-SEAT-01', 'branch_name' => 'Seat Style Branch']);

        return [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Seat Style Order',
            'job_type' => 'งานปัก',
            'order_date' => '2026-09-01 09:00:00',
            'due_date' => '2026-09-20 18:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'separate_pants',
                'size_group' => 'adults',
                'size_label' => 'L',
                'quantity' => 10,
                'unit_price' => 150,
            ]],
            'specification' => [
                'pattern_id' => 1,
                'fabric_id' => 2,
                'screen_print_detail' => json_encode([
                    'schema' => 'spec-v2',
                    'mode' => 'matrix',
                    'shirt_specs' => [],
                    'pants_specs' => [
                        'pants_type_id' => '31',
                        'leg_style_id' => '15',
                        'seat_style_text' => $seatStyle,
                    ],
                ], JSON_UNESCAPED_UNICODE),
            ],
        ];
    }

    private function creator(): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);
    }

    private function storedSeatStyle(int $orderId): mixed
    {
        $raw = Order::findOrFail($orderId)->specification?->screen_print_detail;
        $decoded = json_decode((string) $raw, true);

        return $decoded['pants_specs']['seat_style_text'] ?? null;
    }

    public function test_the_seat_style_reaches_the_database(): void
    {
        $order = (new CreateOrderAction)->execute($this->orderData('กุ้นผ้า 2 ชั้น'), $this->creator()->id);

        $this->assertSame('กุ้นผ้า 2 ชั้น', $this->storedSeatStyle($order->id));
    }

    public function test_editing_the_order_keeps_the_seat_style(): void
    {
        $creator = $this->creator();
        $data = $this->orderData('กุ้นธรรมดา');
        $order = (new CreateOrderAction)->execute($data, $creator->id);

        $edited = $data;
        $edited['specification']['screen_print_detail'] = json_encode([
            'schema' => 'spec-v2',
            'mode' => 'matrix',
            'shirt_specs' => [],
            'pants_specs' => ['seat_style_text' => 'กุ้นผ้า 3 ชั้น'],
        ], JSON_UNESCAPED_UNICODE);

        (new UpdateOrderAction)->execute($order, $edited, $creator->id);

        $this->assertSame('กุ้นผ้า 3 ชั้น', $this->storedSeatStyle($order->id));
    }

    public function test_an_empty_seat_style_is_stored_as_an_empty_string_not_lost(): void
    {
        $order = (new CreateOrderAction)->execute($this->orderData(''), $this->creator()->id);

        $this->assertSame('', $this->storedSeatStyle($order->id));
    }
}
