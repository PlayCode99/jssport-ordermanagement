<?php

namespace Tests\Feature\Http\Middleware;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use App\Support\UserLandingPage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * The logo links to whatever landingPath says, so it has to be shared with every
 * page and has to match where signing in sends the same account. Two separate
 * lists would drift and put the logo back on a page the user cannot open.
 */
class SharedLandingPathTest extends TestCase
{
    use RefreshDatabase;

    private function managedUser(AccessRole $accessRole): User
    {
        $branch = Branch::firstOrCreate(['branch_code' => '01'], ['branch_name' => 'หนองบัวลำภู']);

        $user = User::factory()->create([
            'access_role' => $accessRole,
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);

        $user->update(['current_team_id' => null]);
        $user->teamMemberships()->delete();

        return $user->fresh();
    }

    public function test_qc_staff_are_given_their_own_landing_path(): void
    {
        $this->actingAs($this->managedUser(AccessRole::QcStaff))
            ->get('/production/qc')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('landingPath', '/production/qc'));
    }

    public function test_counter_staff_are_given_the_counter(): void
    {
        $this->actingAs($this->managedUser(AccessRole::Counter))
            ->get('/counter')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('landingPath', '/counter'));
    }

    public function test_the_owner_is_given_the_dashboard(): void
    {
        $this->actingAs($this->managedUser(AccessRole::Owner))
            ->get('/counter')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('landingPath', '/owner-dashboard'));
    }

    public function test_the_shared_path_matches_where_signing_in_sends_the_same_account(): void
    {
        foreach ([AccessRole::QcStaff, AccessRole::SewingStaff, AccessRole::DeliveryStaff, AccessRole::Counter] as $role) {
            $user = $this->managedUser($role);
            $landing = UserLandingPage::routeFor($user);

            $this->actingAs($user)
                ->get('/counter')
                ->assertInertia(fn (Assert $page) => $page->where('landingPath', $landing));

            $this->post(route('logout'));

            $redirect = $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password'])
                ->headers->get('Location');

            $this->assertSame(url($landing), $redirect, $role->value.' logo and sign-in disagree');
            $this->post(route('logout'));
        }
    }

    public function test_the_header_is_given_the_name_branch_and_role_it_shows(): void
    {
        $user = $this->managedUser(AccessRole::QcStaff);
        $user->forceFill(['full_name' => 'สมชาย ใจดี'])->save();

        $this->actingAs($user->fresh())
            ->get('/production/qc')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('auth.user.full_name', 'สมชาย ใจดี')
                ->where('auth.user.branch_name', 'หนองบัวลำภู')
                ->where('auth.user.branch_code', '01')
                ->where('auth.user.access_role_label', 'QC Staff'));
    }

    public function test_the_role_label_follows_the_account_role(): void
    {
        foreach ([
            [AccessRole::Owner, 'Owner'],
            [AccessRole::AdminSystem, 'Admin System'],
            [AccessRole::SewingStaff, 'Sewing Staff'],
            [AccessRole::Counter, 'Counter'],
        ] as [$role, $label]) {
            $this->actingAs($this->managedUser($role))
                ->get('/counter')
                ->assertInertia(fn (Assert $page) => $page->where('auth.user.access_role_label', $label));
        }
    }

    public function test_a_guest_page_carries_no_landing_path(): void
    {
        $this->get(route('login'))
            ->assertInertia(fn (Assert $page) => $page->where('landingPath', null));
    }
}
