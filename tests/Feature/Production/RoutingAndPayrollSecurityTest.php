<?php

declare(strict_types=1);

namespace Tests\Feature\Production;

use App\Enums\OrderStatus;
use App\Enums\RoutingStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\CuttingOrder;
use App\Models\CuttingWorkerTask;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PieceworkPrice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoutingAndPayrollSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_routing_endpoint_blocks_bypassing_required_prerequisite_stations(): void
    {
        $worker = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::Print,
        ]);

        $order = $this->createBaseOrder();

        $order->routings()->create([
            'station_name' => 'design',
            'is_required' => true,
            'status' => RoutingStatus::Pending,
        ]);

        $printRouting = $order->routings()->create([
            'station_name' => 'print',
            'is_required' => true,
            'status' => RoutingStatus::Pending,
        ]);

        $response = $this->actingAs($worker)->postJson(route('production.routing.advance', $order), [
            'station_name' => 'print',
            'new_status' => 'in_progress',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['station']);

        $printRouting->refresh();
        $this->assertSame(RoutingStatus::Pending, $printRouting->status);
    }

    public function test_cutting_task_endpoint_blocks_claiming_more_than_order_total(): void
    {
        $worker = User::factory()->create([
            'role' => UserRole::Worker,
            'station_department' => StationDepartment::Cutting,
        ]);

        $order = $this->createBaseOrder();

        OrderItem::create([
            'order_id' => $order->id,
            'item_type' => 'shirt',
            'size_group' => 'adults',
            'size_label' => 'M',
            'quantity' => 10,
            'unit_price' => 100,
            'total_price' => 1000,
        ]);

        $cuttingOrder = CuttingOrder::create([
            'cutting_code' => 'CUT-SEC-0001',
            'order_id' => $order->id,
            'cutter_user_id' => $worker->id,
            'inspector_user_id' => null,
            'start_date' => now(),
            'status' => 'draft',
        ]);

        $priceMaster = PieceworkPrice::create([
            'code' => 'CUT-SHT-01',
            'name' => 'Fabric Cutting Standard Shirt',
            'price_per_unit' => 3.5,
        ]);

        $response = $this->actingAs($worker)->postJson(route('production.cutting-tasks.store'), [
            'cutting_order_id' => $cuttingOrder->id,
            'price_master_id' => $priceMaster->id,
            'worker_user_id' => $worker->id,
            'quantity_done' => 15,
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['quantity_done']);
        $this->assertDatabaseCount('cutting_worker_tasks', 0);
        $this->assertSame(0, CuttingWorkerTask::count());
    }

    private function createBaseOrder(): Order
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-PROD-001',
            'customer_name' => 'Production Security Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-PROD-001',
            'branch_name' => 'Production Security Branch',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        return Order::create([
            'order_code' => 'ORD-PROD-'.str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $creator->id,
            'job_name' => 'Production Security Order',
            'job_type' => 'uniform',
            'order_date' => now()->subDay(),
            'due_date' => now()->addDays(5),
            'total_amount' => 0,
            'discount_percent' => 0,
            'discount_amount' => 0,
            'net_amount' => 0,
            'order_status' => OrderStatus::InProduction,
        ]);
    }
}
