<?php

namespace Tests\Feature\Domain\Production;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Domain\Production\Actions\AdvanceRoutingStationAction;
use App\Enums\OrderStatus;
use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderRouting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class AdvanceRoutingStationActionTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_uses_order_specific_sequence_for_prerequisite_validation(): void
    {
        $order = $this->createOrderWithJobType('งานซับลิเมชั่น+ปัก');
        $worker = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $this->markStationCompleted($order, 'cutting');

        $action = new AdvanceRoutingStationAction;

        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('prerequisite station [print] is completed or skipped');

        $action->execute(
            $order,
            RoutingStationName::Embroidery,
            RoutingStatus::InProgress,
            $worker->id,
        );
    }

    public function test_it_allows_advancing_after_previous_required_stations_are_completed(): void
    {
        $order = $this->createOrderWithJobType('งานซับลิเมชั่น+ปัก+สกรีน');
        $worker = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $this->markStationCompleted($order, 'cutting');
        $this->markStationCompleted($order, 'print');
        $this->markStationCompleted($order, 'screen');
        $this->markStationCompleted($order, 'flex');

        $routing = (new AdvanceRoutingStationAction)->execute(
            $order,
            RoutingStationName::Embroidery,
            RoutingStatus::InProgress,
            $worker->id,
        );

        $this->assertSame(RoutingStatus::InProgress, $routing->status);
        $this->assertNotNull($routing->started_at);
    }

    public function test_it_allows_marking_a_pending_room_as_completed_without_first_assigning_it(): void
    {
        $order = $this->createOrderWithJobType('งานปัก');
        $worker = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $this->markStationCompleted($order, 'cutting');
        $this->markStationStarted($order, 'embroidery');

        $routing = (new AdvanceRoutingStationAction)->execute(
            $order,
            RoutingStationName::Embroidery,
            RoutingStatus::Completed,
            $worker->id,
        );

        $this->assertSame(RoutingStatus::Completed, $routing->status);
        $this->assertNotNull($routing->completed_at);
    }

    public function test_it_requires_prerequisites_before_skipping_a_room(): void
    {
        $order = $this->createOrderWithJobType('งานซับลิเมชั่น+ปัก');
        $worker = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $this->markStationCompleted($order, 'cutting');

        $action = new AdvanceRoutingStationAction;

        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('prerequisite station [print] is completed or skipped');

        $action->execute(
            $order,
            RoutingStationName::Embroidery,
            RoutingStatus::Skipped,
            $worker->id,
        );
    }

    public function test_it_allows_reopening_a_previous_skipped_room_after_advancing_forward(): void
    {
        $order = $this->createOrderWithJobType('งานซับลิเมชั่น+ปัก+สกรีน');
        $worker = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $this->markStationCompleted($order, 'cutting');
        $this->markStationCompleted($order, 'print');
        $this->markStationCompleted($order, 'screen');

        $action = new AdvanceRoutingStationAction;

        $skippedRouting = $action->execute(
            $order,
            RoutingStationName::Flex,
            RoutingStatus::Skipped,
            $worker->id,
        );

        $this->assertSame(RoutingStatus::Skipped, $skippedRouting->status);

        $reopenedRouting = $action->execute(
            $order,
            RoutingStationName::Flex,
            RoutingStatus::InProgress,
            $worker->id,
        );

        $this->assertSame(RoutingStatus::InProgress, $reopenedRouting->status);
        $this->assertNotNull($reopenedRouting->started_at);
    }

    public function test_it_allows_marking_a_skipped_station_as_completed_when_progressing_forward(): void
    {
        $order = $this->createOrderWithJobType('งานซับลิเมชั่น+ปัก+สกรีน');
        $worker = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $this->markStationCompleted($order, 'cutting');
        $this->markStationCompleted($order, 'print');
        $this->markStationSkipped($order, 'screen');

        (new AdvanceRoutingStationAction)->execute(
            $order,
            RoutingStationName::Screen,
            RoutingStatus::InProgress,
            $worker->id,
        );

        $routing = (new AdvanceRoutingStationAction)->execute(
            $order,
            RoutingStationName::Screen,
            RoutingStatus::Completed,
            $worker->id,
        );

        $this->assertSame(RoutingStatus::Completed, $routing->status);
    }

    public function test_it_allows_advancing_from_a_skipped_room_to_a_later_required_room(): void
    {
        $order = $this->createOrderWithJobType('งานซับลิเมชั่น+ปัก+สกรีน');
        $worker = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $this->markStationCompleted($order, 'cutting');
        $this->markStationSkipped($order, 'print');
        $this->markStationSkipped($order, 'screen');
        $this->markStationSkipped($order, 'flex');

        $routing = (new AdvanceRoutingStationAction)->execute(
            $order,
            RoutingStationName::Embroidery,
            RoutingStatus::InProgress,
            $worker->id,
        );

        $this->assertSame(RoutingStatus::InProgress, $routing->status);
    }

    /**
     * Regression test: order_status previously never left "draft" during
     * production (only CreateOrderAction and the QC action ever wrote to it),
     * so App\Enums\OrderStatus::canBeEdited() looked correct in isolation but
     * never actually blocked editing a real in-production order. The first
     * station to genuinely start must promote the order out of the editable
     * pre-production statuses, and later station changes must not regress it.
     */
    public function test_it_promotes_order_status_to_in_production_when_the_first_station_starts(): void
    {
        $order = $this->createOrderWithJobType('งานปัก');
        $worker = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $this->assertSame(OrderStatus::Confirmed, $order->order_status);
        $this->assertTrue($order->order_status->canBeEdited());
        $this->assertTrue($order->order_status->canEnterProduction());

        (new AdvanceRoutingStationAction)->execute(
            $order,
            RoutingStationName::Cutting,
            RoutingStatus::InProgress,
            $worker->id,
        );

        $order->refresh();

        $this->assertSame(OrderStatus::InProduction, $order->order_status);
        $this->assertFalse($order->order_status->canBeEdited());

        // Completing that same station (or advancing later ones) must not
        // regress order_status or flip canBeEdited() back to true.
        (new AdvanceRoutingStationAction)->execute(
            $order,
            RoutingStationName::Cutting,
            RoutingStatus::Completed,
            $worker->id,
        );

        $order->refresh();

        $this->assertSame(OrderStatus::InProduction, $order->order_status);
        $this->assertFalse($order->order_status->canBeEdited());
    }

    public function test_it_promotes_order_status_to_in_production_when_a_station_is_directly_completed(): void
    {
        $order = $this->createOrderWithJobType('งานปัก');
        $worker = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        (new AdvanceRoutingStationAction)->execute(
            $order,
            RoutingStationName::Cutting,
            RoutingStatus::Completed,
            $worker->id,
            allowDirectCompletion: true,
        );

        $order->refresh();

        $this->assertSame(OrderStatus::InProduction, $order->order_status);
        $this->assertFalse($order->order_status->canBeEdited());
    }

    private function createOrderWithJobType(string $jobType): Order
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-PROD-1',
            'customer_name' => 'Production Routing Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-PROD-1',
            'branch_name' => 'Production Routing Branch',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        return (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Production Flow Test',
            'job_type' => $jobType,
            'order_date' => '2026-07-11 09:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'items' => [
                [
                    'item_type' => 'shirt',
                    'size_group' => 'adults',
                    'size_label' => 'M',
                    'quantity' => 5,
                    'unit_price' => 100,
                ],
            ],
        ], $creator->id);
    }

    private function markStationCompleted(Order $order, string $stationName): void
    {
        $routing = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('station_name', $stationName)
            ->firstOrFail();

        $routing->status = RoutingStatus::Completed;
        $routing->started_at = now()->subHour();
        $routing->completed_at = now();
        $routing->save();
    }

    private function markStationSkipped(Order $order, string $stationName): void
    {
        $routing = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('station_name', $stationName)
            ->firstOrFail();

        $routing->status = RoutingStatus::Skipped;
        $routing->started_at = now()->subHour();
        $routing->completed_at = now();
        $routing->save();
    }

    private function markStationStarted(Order $order, string $stationName): void
    {
        $routing = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('station_name', $stationName)
            ->firstOrFail();

        $routing->status = RoutingStatus::Pending;
        $routing->started_at = now()->subMinutes(30);
        $routing->assigned_user_id = null;
        $routing->completed_at = null;
        $routing->save();
    }
}
