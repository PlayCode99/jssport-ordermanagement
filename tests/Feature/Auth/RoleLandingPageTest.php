<?php

namespace Tests\Feature\Auth;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Signing in should land on a page the account can actually use. Accounts that
 * cannot open the counter used to be dropped on the new-order form, which they
 * have no business on -- a QC or sewing account signed in and hit a page meant
 * for the counter.
 */
class RoleLandingPageTest extends TestCase
{
    use RefreshDatabase;

    private function managedUser(AccessRole $accessRole): User
    {
        $branch = Branch::firstOrCreate(['branch_code' => '01'], ['branch_name' => 'หนองบัวลำภู']);

        // The shape user management produces: an access role, the database's
        // default legacy role, and no team.
        $user = User::factory()->create([
            'access_role' => $accessRole,
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
            'is_active' => true,
            'password' => Hash::make('password'),
        ]);

        $user->update(['current_team_id' => null]);
        $user->teamMemberships()->delete();

        return $user->fresh();
    }

    private function signIn(User $user): TestResponse
    {
        return $this->post(route('login.store'), [
            'email' => $user->email,
            'password' => 'password',
        ]);
    }

    public static function landings(): array
    {
        return [
            'qc staff lands in the QC room' => [AccessRole::QcStaff, '/production/qc'],
            'cutting staff lands in the cutting room' => [AccessRole::CuttingStaff, '/production/cutting'],
            'printing staff lands in the print room' => [AccessRole::PrintingStaff, '/production/print-room'],
            'press staff lands at the heat press' => [AccessRole::PressStaff, '/production/heat-press'],
            'embroidery staff lands in the embroidery room' => [AccessRole::EmbroideryStaff, '/production/embroidery'],
            'sewing staff lands in the sewing room' => [AccessRole::SewingStaff, '/production/sewing'],
            'screen and flex staff land in their room' => [AccessRole::ScreenFlexStaff, '/production/screen-flex'],
            'delivery staff land in shipping' => [AccessRole::DeliveryStaff, '/production/shipping'],
            'a production admin lands in the first room they run' => [AccessRole::AdminProduction, '/production/qc'],
        ];
    }

    #[DataProvider('landings')]
    public function test_signing_in_lands_on_a_page_the_account_can_open(AccessRole $accessRole, string $path): void
    {
        $this->signIn($this->managedUser($accessRole))->assertRedirect($path);

        $this->assertAuthenticated();
    }

    #[DataProvider('landings')]
    public function test_no_role_is_sent_to_the_new_order_form(AccessRole $accessRole, string $path): void
    {
        $response = $this->signIn($this->managedUser($accessRole));

        $this->assertNotSame(route('orders.create'), $response->headers->get('Location'));
        $this->assertSame(url($path), $response->headers->get('Location'));
    }

    public function test_counter_staff_still_land_on_the_counter(): void
    {
        $this->signIn($this->managedUser(AccessRole::Counter))
            ->assertRedirect(route('counter.fallback', absolute: false));
    }

    public function test_a_system_admin_still_lands_on_the_counter(): void
    {
        $this->signIn($this->managedUser(AccessRole::AdminSystem))
            ->assertRedirect(route('counter.fallback', absolute: false));
    }

    public function test_the_owner_lands_on_their_dashboard(): void
    {
        $this->signIn($this->managedUser(AccessRole::Owner))
            ->assertRedirect(route('owner.dashboard', absolute: false));
    }

    public function test_an_already_signed_in_user_visiting_login_is_sent_to_their_own_page(): void
    {
        $this->actingAs($this->managedUser(AccessRole::QcStaff))
            ->get(route('login'))
            ->assertRedirect('/production/qc');
    }

    public function test_the_landing_page_is_actually_reachable_for_that_role(): void
    {
        // A landing page nobody can open would just move the problem.
        $qc = $this->managedUser(AccessRole::QcStaff);

        $this->actingAs($qc)->get('/production/qc')->assertOk();
    }
}
