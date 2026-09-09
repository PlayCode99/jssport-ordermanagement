<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Domain\Production\Actions\RecordCuttingWorkerTaskAction;
use App\Enums\OrderStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\CuttingOrder;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PieceworkPrice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class OrderAndPayrollSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_order_creation_ignores_frontend_financial_tampering(): void
    {
        $context = $this->makeOrderContext();

        $order = (new CreateOrderAction)->execute([
            'customer_id' => $context['customer']->id,
            'branch_id' => $context['branch']->id,
            'job_name' => 'Security Test Order',
            'job_type' => 'uniform',
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(7)->toDateTimeString(),
            'discount_percent' => 0,
            'total_amount' => 10,
            'net_amount' => 10,
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => 'M',
                'quantity' => 10,
                'unit_price' => 100,
                'total_price' => 999999,
            ]],
        ], $context['creator']->id);

        $item = $order->items()->firstOrFail();

        $this->assertSame(1000.0, (float) $order->total_amount);
        $this->assertSame(1000.0, (float) $order->net_amount);
        $this->assertSame(1000.0, (float) $item->total_price);
    }

    public function test_order_creation_rolls_back_transaction_on_failure(): void
    {
        $context = $this->makeOrderContext();

        OrderItem::creating(function (OrderItem $item): void {
            if ($item->item_type === 'FAIL') {
                throw new RuntimeException('Forced failure for rollback assertion.');
            }
        });

        try {
            $this->expectException(RuntimeException::class);

            (new CreateOrderAction)->execute([
                'customer_id' => $context['customer']->id,
                'branch_id' => $context['branch']->id,
                'job_name' => 'Rollback Test',
                'job_type' => 'uniform',
                'order_date' => now()->toDateTimeString(),
                'due_date' => now()->addDays(7)->toDateTimeString(),
                'discount_percent' => 0,
                'items' => [
                    ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 1, 'unit_price' => 100],
                    ['item_type' => 'FAIL', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 1, 'unit_price' => 100],
                ],
            ], $context['creator']->id);
        } finally {
            OrderItem::flushEventListeners();
        }

        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
    }

    public function test_cutting_task_ignores_frontend_wage_tampering(): void
    {
        $context = $this->makeOrderContext();

        $priceMaster = PieceworkPrice::create([
            'code' => 'CUT-SHT-01',
            'name' => 'Fabric Cutting Standard Shirt',
            'price_per_unit' => 3.50,
        ]);

        $order = Order::create([
            'order_code' => 'ORD-2026-20000',
            'customer_id' => $context['customer']->id,
            'branch_id' => $context['branch']->id,
            'creator_user_id' => $context['creator']->id,
            'job_name' => 'Payroll Base',
            'job_type' => 'uniform',
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(7)->toDateTimeString(),
            'total_amount' => 0,
            'discount_percent' => 0,
            'discount_amount' => 0,
            'net_amount' => 0,
            'order_status' => OrderStatus::Draft,
        ]);

        $cuttingOrder = CuttingOrder::create([
            'cutting_code' => 'CUT-2026-00001',
            'order_id' => $order->id,
            'cutter_user_id' => $context['worker']->id,
            'inspector_user_id' => $context['qc']->id,
            'start_date' => now()->toDateTimeString(),
            'status' => 'draft',
        ]);

        $task = (new RecordCuttingWorkerTaskAction)->execute([
            'cutting_order_id' => $cuttingOrder->id,
            'price_master_id' => $priceMaster->id,
            'worker_user_id' => $context['worker']->id,
            'quantity_done' => 10,
            'total_wage' => 50000,
        ]);

        $this->assertSame(35.0, (float) $task->total_wage);
        $this->assertDatabaseHas('cutting_worker_tasks', [
            'id' => $task->id,
            'total_wage' => 35.0,
        ]);
    }

    /**
     * @return array{customer: Customer, branch: Branch, creator: User, worker: User, qc: User}
     */
    private function makeOrderContext(): array
    {
        $customer = Customer::create(['customer_code' => 'CUS-SEC-001', 'customer_name' => 'Security Customer']);
        $branch = Branch::create(['branch_code' => 'BR-SEC-001', 'branch_name' => 'Security Branch']);

        $creator = User::factory()->create(['role' => UserRole::Sales, 'station_department' => StationDepartment::None]);
        $worker = User::factory()->create(['role' => UserRole::Worker, 'station_department' => StationDepartment::Cutting]);
        $qc = User::factory()->create(['role' => UserRole::Qc, 'station_department' => StationDepartment::Qc]);

        return compact('customer', 'branch', 'creator', 'worker', 'qc');
    }
}
