<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Enums\AccessRole;
use App\Enums\OrderStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleAuthorizationSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthorized_worker_cannot_create_order(): void
    {
        $worker = User::factory()->create([
            'role' => UserRole::Worker,
            'station_department' => StationDepartment::Sewing,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-AUTH-001',
            'customer_name' => 'Auth Customer 1',
        ]);

        $branch = Branch::create([
            'branch_code' => 'AUTH-001',
            'branch_name' => 'Auth Branch 1',
        ]);

        $response = $this->actingAs($worker)->postJson(route('orders.store'), [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Blocked Order',
            'job_type' => 'uniform',
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(5)->toDateTimeString(),
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => 'M',
                'quantity' => 5,
                'unit_price' => 100,
            ]],
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_unauthorized_designer_cannot_submit_qc_inspection(): void
    {
        $designer = User::factory()->create([
            'role' => UserRole::Designer,
            'station_department' => StationDepartment::Design,
        ]);

        $order = $this->createQcReadyOrder();

        $response = $this->actingAs($designer)->postJson(route('qc.submit', $order), [
            'decision' => 'pass',
        ]);

        $response->assertStatus(403);

        $order->refresh();
        $this->assertSame(OrderStatus::QcChecking, $order->order_status);
    }

    public function test_authorized_sales_and_qc_can_perform_their_duties(): void
    {
        $sales = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        $qc = User::factory()->create([
            'role' => UserRole::Qc,
            'access_role' => AccessRole::QcStaff,
            'station_department' => StationDepartment::Qc,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-AUTH-002',
            'customer_name' => 'Auth Customer 2',
        ]);

        $branch = Branch::create([
            'branch_code' => 'AUTH-002',
            'branch_name' => 'Auth Branch 2',
        ]);

        $createResponse = $this->actingAs($sales)->postJson(route('orders.store'), [
            'customer_id' => $customer->id,
            'customer_name' => $customer->customer_name,
            'branch_id' => $branch->id,
            'job_name' => 'Authorized Order',
            'job_type' => 'uniform',
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(5)->toDateTimeString(),
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => 'M',
                'quantity' => 1,
                'unit_price' => 100,
            ]],
            'specification' => [
                'pattern_id' => 1,
                'fabric_id' => 1,
                'neck_style_id' => 1,
                'screen_print_detail' => 'SECURITY TEST',
            ],
        ]);

        $this->assertContains($createResponse->status(), [201, 302]);

        $order = $this->createQcReadyOrder();

        $qcResponse = $this->actingAs($qc)->postJson(route('qc.submit', $order), [
            'decision' => 'pass',
        ]);

        $this->assertContains($qcResponse->status(), [200, 302]);
    }

    private function createQcReadyOrder(): Order
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-QC-AUTH-'.str_pad((string) random_int(1, 999), 3, '0', STR_PAD_LEFT),
            'customer_name' => 'QC Auth Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'QC-AUTH-'.str_pad((string) random_int(1, 999), 3, '0', STR_PAD_LEFT),
            'branch_name' => 'QC Auth Branch',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        return Order::create([
            'order_code' => 'ORD-AUTH-'.str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $creator->id,
            'job_name' => 'QC Auth Flow',
            'job_type' => 'uniform',
            'order_date' => now()->subDay()->toDateTimeString(),
            'due_date' => now()->addDays(4)->toDateTimeString(),
            'total_amount' => 100,
            'discount_percent' => 0,
            'discount_amount' => 0,
            'net_amount' => 100,
            'order_status' => OrderStatus::QcChecking,
        ]);
    }
}
