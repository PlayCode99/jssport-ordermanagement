<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\OrderStatus;
use App\Enums\RoutingStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Users created through user management are given an access_role and no legacy
 * `role`. QC sign-off used to read only that legacy column, so an owner or a
 * system admin made after the system went live was refused the QC screen they
 * could plainly see. These tests pin the rule to the access-role config.
 */
class QcSignOffAccessRoleTest extends TestCase
{
    use RefreshDatabase;

    private function managedUser(AccessRole $accessRole, bool $isActive = true): User
    {
        // Exactly what CreateManagedUserAction produces: it sets an access role
        // and never touches the legacy `role` column, which the database then
        // fills with its own default of "sales".
        return User::factory()->create([
            'access_role' => $accessRole,
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'is_active' => $isActive,
        ]);
    }

    private function orderAwaitingQc(): Order
    {
        $customer = Customer::create(['customer_code' => 'CUS-QCA-001', 'customer_name' => 'QC Access Customer']);
        $branch = Branch::create(['branch_code' => 'QCA-01', 'branch_name' => 'QC Access Branch']);
        $creator = $this->managedUser(AccessRole::Owner);

        $order = Order::create([
            'order_code' => 'ORD-QCA-0001',
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $creator->id,
            'job_name' => 'QC Access Order',
            'job_type' => 'uniform',
            'order_date' => now()->subDays(2),
            'due_date' => now()->addDays(2),
            'total_amount' => 1000,
            'discount_percent' => 0,
            'discount_amount' => 0,
            'net_amount' => 1000,
            'order_status' => OrderStatus::QcChecking,
        ]);

        $order->routings()->create([
            'station_name' => 'qc',
            'status' => RoutingStatus::InProgress,
            'is_required' => true,
        ]);

        return $order;
    }

    public static function allowedRoles(): array
    {
        return [
            'owner' => [AccessRole::Owner],
            'system admin' => [AccessRole::AdminSystem],
            'production admin' => [AccessRole::AdminProduction],
            'qc staff' => [AccessRole::QcStaff],
        ];
    }

    #[DataProvider('allowedRoles')]
    public function test_a_role_that_may_open_the_qc_room_may_sign_its_inspections_off(AccessRole $accessRole): void
    {
        $order = $this->orderAwaitingQc();

        $response = $this->actingAs($this->managedUser($accessRole))
            ->postJson('/orders/'.$order->id.'/qc', ['decision' => 'pass']);

        $this->assertNotSame(403, $response->status(), $accessRole->value.' was refused QC sign-off');
        $this->assertContains($response->status(), [200, 201, 302]);
    }

    public static function refusedRoles(): array
    {
        return [
            'counter' => [AccessRole::Counter],
            'cutting staff' => [AccessRole::CuttingStaff],
            'sewing staff' => [AccessRole::SewingStaff],
            'delivery staff' => [AccessRole::DeliveryStaff],
        ];
    }

    #[DataProvider('refusedRoles')]
    public function test_a_role_without_the_qc_room_is_still_refused(AccessRole $accessRole): void
    {
        $order = $this->orderAwaitingQc();

        $this->actingAs($this->managedUser($accessRole))
            ->postJson('/orders/'.$order->id.'/qc', ['decision' => 'pass'])
            ->assertForbidden();
    }

    public function test_a_deactivated_owner_cannot_sign_off(): void
    {
        $order = $this->orderAwaitingQc();

        $this->actingAs($this->managedUser(AccessRole::Owner, isActive: false))
            ->postJson('/orders/'.$order->id.'/qc', ['decision' => 'pass'])
            ->assertForbidden();
    }

    public function test_a_guest_cannot_sign_off(): void
    {
        $order = $this->orderAwaitingQc();

        $this->postJson('/orders/'.$order->id.'/qc', ['decision' => 'pass'])
            ->assertStatus(401);
    }
}
