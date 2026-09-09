<?php

namespace Tests\Feature;

use App\Enums\AccessRole;
use App\Enums\OrderStatus;
use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use App\Enums\StationDepartment;
use App\Enums\TeamRole;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderRouting;
use App\Models\Team;
use App\Models\TeamInvitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_are_redirected_to_the_login_page()
    {
        $user = User::factory()->create();
        $team = $user->currentTeam;

        $response = $this->get(route('index', ['current_team' => $team->slug]));
        $response->assertRedirect(route('login'));
    }

    public function test_authenticated_users_can_visit_the_dashboard()
    {
        $user = User::factory()->create();
        $team = $user->currentTeam;

        $response = $this
            ->actingAs($user)
            ->get(route('index', ['current_team' => $team->slug]));

        $response->assertOk();
    }

    public function test_dashboard_includes_pending_invitations_for_the_authenticated_user()
    {
        $owner = User::factory()->create(['name' => 'Taylor Otwell']);
        $invitedUser = User::factory()->create(['email' => 'invited@example.com']);
        $team = Team::factory()->create(['name' => 'Laravel Team']);

        $team->members()->attach($owner, ['role' => TeamRole::Owner->value]);

        $invitation = TeamInvitation::factory()->create([
            'team_id' => $team->id,
            'email' => 'invited@example.com',
            'invited_by' => $owner->id,
        ]);

        $response = $this
            ->actingAs($invitedUser)
            ->get(route('index', ['current_team' => $invitedUser->currentTeam->slug]));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Counter')
            ->has('pendingInvitations', 1)
            ->where('pendingInvitations.0.code', $invitation->code)
            ->where('pendingInvitations.0.inviterName', 'Taylor Otwell')
            ->where('pendingInvitations.0.team.name', 'Laravel Team')
            ->where('pendingInvitations.0.team.slug', $team->slug)
            ->missing('pendingInvitations.0.teamName'),
        );
    }

    public function test_dashboard_does_not_include_accepted_invitations()
    {
        $owner = User::factory()->create();
        $invitedUser = User::factory()->create(['email' => 'invited@example.com']);
        $team = Team::factory()->create();

        $team->members()->attach($owner, ['role' => TeamRole::Owner->value]);

        TeamInvitation::factory()->accepted()->create([
            'team_id' => $team->id,
            'email' => 'invited@example.com',
            'invited_by' => $owner->id,
        ]);

        $response = $this
            ->actingAs($invitedUser)
            ->get(route('index', ['current_team' => $invitedUser->currentTeam->slug]));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Counter')
            ->has('pendingInvitations', 0),
        );
    }

    public function test_dashboard_excludes_expired_invitations_without_deleting_them()
    {
        $owner = User::factory()->create();
        $invitedUser = User::factory()->create(['email' => 'invited@example.com']);
        $team = Team::factory()->create();

        $team->members()->attach($owner, ['role' => TeamRole::Owner->value]);

        $invitation = TeamInvitation::factory()->expired()->create([
            'team_id' => $team->id,
            'email' => 'invited@example.com',
            'invited_by' => $owner->id,
        ]);

        $response = $this
            ->actingAs($invitedUser)
            ->get(route('index', ['current_team' => $invitedUser->currentTeam->slug]));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Counter')
            ->has('pendingInvitations', 0),
        );

        $this->assertDatabaseHas('team_invitations', [
            'id' => $invitation->id,
        ]);
    }

    public function test_dashboard_does_not_include_or_delete_other_users_invitations()
    {
        $owner = User::factory()->create();
        $invitedUser = User::factory()->create(['email' => 'invited@example.com']);
        $team = Team::factory()->create();

        $team->members()->attach($owner, ['role' => TeamRole::Owner->value]);

        $invitation = TeamInvitation::factory()->expired()->create([
            'team_id' => $team->id,
            'email' => 'someone@example.com',
            'invited_by' => $owner->id,
        ]);

        $response = $this
            ->actingAs($invitedUser)
            ->get(route('index', ['current_team' => $invitedUser->currentTeam->slug]));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Counter')
            ->has('pendingInvitations', 0),
        );

        $this->assertDatabaseHas('team_invitations', [
            'id' => $invitation->id,
        ]);
    }

    public function test_dashboard_counter_counts_embroidery_as_new_job_when_prerequisite_routings_are_still_pending()
    {
        $user = User::factory()->create();
        $branch = Branch::create(['branch_code' => 'BR-001', 'branch_name' => 'สาขา 1']);
        $customer = Customer::create(['customer_code' => 'CUST-001', 'customer_name' => 'ลูกค้า 1']);
        $order = Order::create([
            'order_code' => 'ORD-EMB-001',
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $user->id,
            'job_name' => 'งานปักทดสอบ',
            'job_type' => 'เสื้อ',
            'order_date' => now(),
            'due_date' => now()->addDays(3),
            'order_status' => OrderStatus::Confirmed,
        ]);

        OrderRouting::create([
            'order_id' => $order->id,
            'station_name' => RoutingStationName::Print->value,
            'is_required' => true,
            'status' => RoutingStatus::Pending,
        ]);

        OrderRouting::create([
            'order_id' => $order->id,
            'station_name' => RoutingStationName::Embroidery->value,
            'is_required' => true,
            'status' => RoutingStatus::Pending,
        ]);

        $response = $this
            ->actingAs($user)
            ->get(route('index', ['current_team' => $user->currentTeam->slug]));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->where('floorStats.embroidery.new_job', 1)
        );
    }

    public function test_non_branch_01_user_sees_only_own_branch_orders_on_counter_page(): void
    {
        $branch01 = Branch::create(['branch_code' => '01', 'branch_name' => 'หนองบัวลำภู']);
        $branch02 = Branch::create(['branch_code' => '02', 'branch_name' => 'ขอนแก่น']);
        $customer = Customer::create(['customer_code' => 'CUST-001', 'customer_name' => 'ลูกค้า 1']);

        $user = User::factory()->create([
            'role' => UserRole::Admin,
            'station_department' => StationDepartment::None,
            'access_role' => AccessRole::AdminSystem,
            'branch_id' => $branch02->id,
        ]);

        Order::create([
            'order_code' => 'ORD-B1-001',
            'customer_id' => $customer->id,
            'branch_id' => $branch01->id,
            'creator_user_id' => $user->id,
            'job_name' => 'งานสาขา 01',
            'job_type' => 'เสื้อ',
            'order_date' => now(),
            'due_date' => now()->addDays(2),
            'order_status' => OrderStatus::Confirmed,
        ]);

        Order::create([
            'order_code' => 'ORD-B2-001',
            'customer_id' => $customer->id,
            'branch_id' => $branch02->id,
            'creator_user_id' => $user->id,
            'job_name' => 'งานสาขา 02',
            'job_type' => 'เสื้อ',
            'order_date' => now(),
            'due_date' => now()->addDays(2),
            'order_status' => OrderStatus::Confirmed,
        ]);

        $response = $this->actingAs($user)->get(route('index', ['current_team' => $user->currentTeam->slug]));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->has('orders', 1)
            ->where('orders.0.order_code', 'ORD-B2-001')
            ->has('branches', 1)
            ->where('branches.0.value', (string) $branch02->id)
        );
    }

    public function test_branch_01_user_sees_orders_from_all_branches_on_counter_page(): void
    {
        $branch01 = Branch::create(['branch_code' => '01', 'branch_name' => 'หนองบัวลำภู']);
        $branch02 = Branch::create(['branch_code' => '02', 'branch_name' => 'ขอนแก่น']);
        $customer = Customer::create(['customer_code' => 'CUST-001', 'customer_name' => 'ลูกค้า 1']);

        $user = User::factory()->create([
            'role' => UserRole::Admin,
            'station_department' => StationDepartment::None,
            'access_role' => AccessRole::Owner,
            'branch_id' => $branch01->id,
        ]);

        Order::create([
            'order_code' => 'ORD-B1-001',
            'customer_id' => $customer->id,
            'branch_id' => $branch01->id,
            'creator_user_id' => $user->id,
            'job_name' => 'งานสาขา 01',
            'job_type' => 'เสื้อ',
            'order_date' => now(),
            'due_date' => now()->addDays(2),
            'order_status' => OrderStatus::Confirmed,
        ]);

        Order::create([
            'order_code' => 'ORD-B2-001',
            'customer_id' => $customer->id,
            'branch_id' => $branch02->id,
            'creator_user_id' => $user->id,
            'job_name' => 'งานสาขา 02',
            'job_type' => 'เสื้อ',
            'order_date' => now(),
            'due_date' => now()->addDays(2),
            'order_status' => OrderStatus::Confirmed,
        ]);

        $response = $this->actingAs($user)->get(route('index', ['current_team' => $user->currentTeam->slug]));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->has('orders', 2)
            ->has('branches', 2)
        );

        $orderCodes = collect($response->viewData('page')['props']['orders'] ?? [])->pluck('order_code')->all();

        $this->assertContains('ORD-B1-001', $orderCodes);
        $this->assertContains('ORD-B2-001', $orderCodes);
    }

    public function test_branch_01_user_can_filter_dashboard_orders_by_another_branch(): void
    {
        $branch01 = Branch::create(['branch_code' => '01', 'branch_name' => 'หนองบัวลำภู']);
        $branch02 = Branch::create(['branch_code' => '02', 'branch_name' => 'ขอนแก่น']);
        $customer = Customer::create(['customer_code' => 'CUST-001', 'customer_name' => 'ลูกค้า 1']);

        $user = User::factory()->create([
            'role' => UserRole::Admin,
            'station_department' => StationDepartment::None,
            'access_role' => AccessRole::Owner,
            'branch_id' => $branch01->id,
        ]);

        Order::create([
            'order_code' => 'ORD-B2-001',
            'customer_id' => $customer->id,
            'branch_id' => $branch02->id,
            'creator_user_id' => $user->id,
            'job_name' => 'งานสาขา 02',
            'job_type' => 'เสื้อ',
            'order_date' => now(),
            'due_date' => now()->addDays(2),
            'order_status' => OrderStatus::Confirmed,
        ]);

        $response = $this->actingAs($user)->get(route('index', [
            'current_team' => $user->currentTeam->slug,
            'branch_id' => $branch02->id,
        ]));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->has('orders', 1)
            ->where('orders.0.order_code', 'ORD-B2-001')
        );
    }
}
