<?php

namespace Tests\Feature\Domain\Production;

use App\Domain\Production\Actions\RecordCuttingWorkerTaskAction;
use App\Enums\OrderStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\CuttingOrder;
use App\Models\CuttingWorkerTask;
use App\Models\Order;
use App\Models\PieceworkPrice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class RecordCuttingWorkerTaskActionTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_calculates_wage_from_master_price_and_ignores_payload_amount(): void
    {
        $context = $this->makeCuttingContext();

        $price = PieceworkPrice::create([
            'code' => 'SEW-COL-01',
            'name' => 'Sewing Standard T-Shirt Collar',
            'price_per_unit' => 15.00,
        ]);

        $task = (new RecordCuttingWorkerTaskAction)->execute([
            'cutting_order_id' => $context['cutting_order']->id,
            'price_master_id' => $price->id,
            'worker_user_id' => $context['worker']->id,
            'quantity_done' => 8,
            'total_wage' => 1,
        ]);

        $this->assertSame(120.0, (float) $task->total_wage);
        $this->assertDatabaseHas('cutting_worker_tasks', [
            'id' => $task->id,
            'quantity_done' => 8,
            'total_wage' => 120.0,
        ]);
    }

    public function test_it_does_not_persist_any_task_when_master_price_is_invalid(): void
    {
        $context = $this->makeCuttingContext();

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Failed to record cutting worker task.');

        (new RecordCuttingWorkerTaskAction)->execute([
            'cutting_order_id' => $context['cutting_order']->id,
            'price_master_id' => 999999,
            'worker_user_id' => $context['worker']->id,
            'quantity_done' => 5,
            'total_wage' => 99999,
        ]);

        $this->assertSame(0, CuttingWorkerTask::count());
    }

    /**
     * @return array{cutting_order: CuttingOrder, worker: User}
     */
    private function makeCuttingContext(): array
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-0100',
            'customer_name' => 'Payroll Test Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'HQ-001',
            'branch_name' => 'Main Factory & HQ',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $worker = User::factory()->create([
            'role' => UserRole::Worker,
            'station_department' => StationDepartment::Cutting,
        ]);

        $inspector = User::factory()->create([
            'role' => UserRole::Qc,
            'station_department' => StationDepartment::Qc,
        ]);

        $order = Order::create([
            'order_code' => 'ORD-2026-99999',
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $creator->id,
            'job_name' => 'Payroll Test Order',
            'job_type' => 'uniform',
            'order_date' => '2026-07-11 09:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'total_amount' => 0,
            'discount_percent' => 0,
            'discount_amount' => 0,
            'net_amount' => 0,
            'order_status' => OrderStatus::Draft,
        ]);

        $cuttingOrder = CuttingOrder::create([
            'cutting_code' => 'CUT-TEST-0001',
            'order_id' => $order->id,
            'cutter_user_id' => $worker->id,
            'inspector_user_id' => $inspector->id,
            'start_date' => '2026-07-11 10:00:00',
            'completed_date' => null,
            'status' => 'draft',
        ]);

        return [
            'cutting_order' => $cuttingOrder,
            'worker' => $worker,
        ];
    }
}
