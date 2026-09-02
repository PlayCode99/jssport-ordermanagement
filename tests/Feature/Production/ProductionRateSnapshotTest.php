<?php

namespace Tests\Feature\Production;

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
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * An order is costed at the labour rates in force when it was taken. Changing a
 * rate afterwards prices new work only — it must never re-price work already
 * booked, or the owner's historical spend moves under them.
 */
class ProductionRateSnapshotTest extends TestCase
{
    use RefreshDatabase;

    private GarmentType $shirtType;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->shirtType = GarmentType::create([
            'category' => 'SHIRT', 'code' => 'S-RATE', 'name' => 'เสื้อโปโล', 'is_active' => true, 'display_order' => 1,
        ]);
        $this->shirtType->operations()->create([
            'name' => 'ตัดเย็บ', 'child_price' => 10, 'adult_price' => 10, 'is_active' => true, 'display_order' => 1,
        ]);

        GarmentType::create([
            'category' => 'PANTS', 'code' => 'P-RATE', 'name' => 'กางเกง', 'is_active' => true, 'display_order' => 1,
        ]);

        $this->owner = User::factory()->create([
            'role' => UserRole::Admin, 'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None, 'is_active' => true, 'branch_id' => null,
        ]);
    }

    private function makeOrder(int $quantity = 1): Order
    {
        $customer = Customer::firstOrCreate(['customer_code' => 'CUS-RATE'], ['customer_name' => 'Rate']);
        $branch = Branch::firstOrCreate(['branch_code' => 'BR-RATE'], ['branch_name' => 'Rate']);

        $order = (new CreateOrderAction())->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'rate probe',
            'job_type' => 'ปัก',
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(3)->toDateTimeString(),
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M',
                'quantity' => $quantity, 'unit_price' => 100,
            ]],
            'specification' => [
                'screen_print_detail' => json_encode([
                    'shirt_specs' => ['shirt_type_id' => (string) $this->shirtType->id],
                ], JSON_THROW_ON_ERROR),
            ],
        ], $this->owner->id);

        DB::table('order_routings')
            ->where('order_id', $order->id)
            ->where('station_name', 'shipping')
            ->update(['status' => 'completed']);

        return Order::query()->findOrFail($order->id);
    }

    private function sheetTotal(Order $order): float
    {
        $controller = app(\App\Http\Controllers\Production\ProductionKanbanController::class);
        $method = (new \ReflectionClass($controller))->getMethod('buildProductionPricingSummary');
        $method->setAccessible(true);

        $types = app(\App\Support\Production\ProductionRateSnapshotBuilder::class)->activeGarmentTypes();

        return (float) $method->invoke($controller, $order->fresh(['items', 'specification']), $types)['grand_total'];
    }

    private function dashboardTotal(): float
    {
        $response = $this->actingAs($this->owner)->get('/owner-dashboard');

        return (float) $response->viewData('page')['props']['expense']['total'];
    }

    private function changeRateTo(float $price): void
    {
        DB::table('garment_operations')
            ->where('garment_type_id', $this->shirtType->id)
            ->update(['adult_price' => $price, 'child_price' => $price]);
    }

    public function test_the_work_sheet_keeps_the_rate_the_order_was_taken_at(): void
    {
        $order = $this->makeOrder();

        $this->assertSame(10.0, $this->sheetTotal($order));

        $this->changeRateTo(15);

        $this->assertSame(10.0, $this->sheetTotal($order));
    }

    public function test_the_dashboard_total_does_not_move_when_a_rate_changes(): void
    {
        $this->makeOrder();

        $this->assertSame(10.0, $this->dashboardTotal());

        $this->changeRateTo(15);

        $this->assertSame(10.0, $this->dashboardTotal());
    }

    public function test_a_new_order_uses_the_new_rate(): void
    {
        $old = $this->makeOrder();
        $this->changeRateTo(15);
        $new = $this->makeOrder();

        $this->assertSame(10.0, $this->sheetTotal($old));
        $this->assertSame(15.0, $this->sheetTotal($new));
        // 10 for the old order plus 15 for the new one.
        $this->assertSame(25.0, $this->dashboardTotal());
    }

    public function test_adding_quantity_later_is_charged_at_the_orders_own_rate(): void
    {
        $order = $this->makeOrder(1);
        $this->changeRateTo(15);

        // The shop adds two more shirts to the same order.
        DB::table('order_items')->where('order_id', $order->id)->update(['quantity' => 3]);

        // 3 shirts at the rate this order was opened with, not the new one.
        $this->assertSame(30.0, $this->sheetTotal($order));
    }

    public function test_renaming_the_garment_type_does_not_change_an_existing_order(): void
    {
        $order = $this->makeOrder();

        GarmentType::query()->whereKey($this->shirtType->id)->update(['name' => 'เสื้อโปโล (แก้ชื่อ)']);

        $controller = app(\App\Http\Controllers\Production\ProductionKanbanController::class);
        $method = (new \ReflectionClass($controller))->getMethod('buildProductionPricingSummary');
        $method->setAccessible(true);
        $types = app(\App\Support\Production\ProductionRateSnapshotBuilder::class)->activeGarmentTypes();

        $summary = $method->invoke($controller, $order->fresh(['items', 'specification']), $types);

        $this->assertSame('เสื้อโปโล', $summary['shirt_type_name']);
    }

    public function test_an_order_without_a_snapshot_still_prices_from_master_data(): void
    {
        $order = $this->makeOrder();
        DB::table('orders')->where('id', $order->id)->update(['production_rate_snapshot' => null]);

        $this->changeRateTo(15);

        // No recorded rate to honour, so master data is the only source left.
        $this->assertSame(15.0, $this->sheetTotal($order->fresh()));
    }
}
