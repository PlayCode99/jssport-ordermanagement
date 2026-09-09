<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Resetting another person's password hands over their account, so it is the
 * owner's alone. These tests hold that line and check the reset actually takes.
 */
class UserPasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::create(['branch_code' => '01', 'branch_name' => 'หนองบัวลำภู']);
    }

    private function user(AccessRole $accessRole, ?Branch $branch = null, bool $isActive = true): User
    {
        return User::factory()->create([
            'access_role' => $accessRole,
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => ($branch ?? $this->branch)->id,
            'is_active' => $isActive,
            'password' => Hash::make('original-password'),
        ]);
    }

    private function reset(User $actor, User $target, string $password = 'brand-new-password'): TestResponse
    {
        return $this->actingAs($actor)->post("/settings/users/{$target->id}/reset-password", [
            'password' => $password,
            'password_confirmation' => $password,
        ]);
    }

    public function test_the_owner_can_reset_another_users_password(): void
    {
        $owner = $this->user(AccessRole::Owner);
        $staff = $this->user(AccessRole::Counter);

        $this->reset($owner, $staff)->assertRedirect();

        $staff->refresh();

        $this->assertTrue(Hash::check('brand-new-password', $staff->password));
        $this->assertFalse(Hash::check('original-password', $staff->password));
    }

    public function test_the_reset_cuts_loose_any_remembered_session(): void
    {
        $owner = $this->user(AccessRole::Owner);
        $staff = $this->user(AccessRole::Counter);
        $staff->forceFill(['remember_token' => 'still-signed-in'])->save();

        $this->reset($owner, $staff);

        $this->assertNull($staff->refresh()->remember_token);
    }

    public function test_a_system_admin_cannot_reset_a_password(): void
    {
        // System admins may create and edit users, but not take over an account.
        $this->reset($this->user(AccessRole::AdminSystem), $this->user(AccessRole::Counter))
            ->assertForbidden();
    }

    public function test_ordinary_staff_cannot_reset_a_password(): void
    {
        foreach ([AccessRole::Counter, AccessRole::QcStaff, AccessRole::AdminProduction, AccessRole::SewingStaff] as $role) {
            $this->reset($this->user($role), $this->user(AccessRole::Counter))
                ->assertForbidden();
        }
    }

    public function test_a_deactivated_owner_cannot_reset_a_password(): void
    {
        $this->reset($this->user(AccessRole::Owner, isActive: false), $this->user(AccessRole::Counter))
            ->assertForbidden();
    }

    public function test_a_guest_cannot_reset_a_password(): void
    {
        $staff = $this->user(AccessRole::Counter);

        $this->post("/settings/users/{$staff->id}/reset-password", [
            'password' => 'brand-new-password',
            'password_confirmation' => 'brand-new-password',
        ])->assertRedirect('/login');

        $this->assertTrue(Hash::check('original-password', $staff->refresh()->password));
    }

    public function test_a_short_password_is_rejected(): void
    {
        $owner = $this->user(AccessRole::Owner);
        $staff = $this->user(AccessRole::Counter);

        $this->reset($owner, $staff, 'short')->assertSessionHasErrors('password');

        $this->assertTrue(Hash::check('original-password', $staff->refresh()->password));
    }

    public function test_a_mismatched_confirmation_is_rejected(): void
    {
        $owner = $this->user(AccessRole::Owner);
        $staff = $this->user(AccessRole::Counter);

        $this->actingAs($owner)->post("/settings/users/{$staff->id}/reset-password", [
            'password' => 'brand-new-password',
            'password_confirmation' => 'something-else',
        ])->assertSessionHasErrors('password');

        $this->assertTrue(Hash::check('original-password', $staff->refresh()->password));
    }

    public function test_an_owner_cannot_reach_a_branch_they_may_not_see(): void
    {
        $otherBranch = Branch::create(['branch_code' => '02', 'branch_name' => 'ศรีบุญเรือง']);

        // An owner sitting at branch 02 may not reach branch 03.
        $branchOwner = $this->user(AccessRole::Owner, $otherBranch);
        $elsewhere = $this->user(AccessRole::Counter, Branch::create(['branch_code' => '03', 'branch_name' => 'เมืองเลย']));

        $this->reset($branchOwner, $elsewhere)->assertForbidden();

        $this->assertTrue(Hash::check('original-password', $elsewhere->refresh()->password));
    }

    public function test_the_head_office_owner_reaches_every_branch(): void
    {
        $headOwner = $this->user(AccessRole::Owner);
        $elsewhere = $this->user(AccessRole::Counter, Branch::create(['branch_code' => '03', 'branch_name' => 'เมืองเลย']));

        $this->reset($headOwner, $elsewhere)->assertRedirect();

        $this->assertTrue(Hash::check('brand-new-password', $elsewhere->refresh()->password));
    }
}
