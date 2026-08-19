<?php

declare(strict_types=1);

namespace App\Domain\UserManagement\Actions;

use App\Enums\AccessRole;
use App\Models\User;
use App\Support\UserAccessControl;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class CreateManagedUserAction
{
    /**
     * @param  array<string, mixed>  $validated
     */
    public function execute(User $actor, array $validated): User
    {
        $accessRole = AccessRole::from((string) $validated['role']);

        if (! UserAccessControl::canAssignRole($actor, $accessRole)) {
            throw ValidationException::withMessages([
                'role' => 'You are not allowed to assign this role.',
            ]);
        }

        $employeeCode = trim((string) $validated['employee_code']);

        $user = User::query()->create([
            'name' => trim((string) $validated['full_name']),
            'full_name' => trim((string) $validated['full_name']),
            'employee_code' => $employeeCode,
            'access_role' => $accessRole,
            'branch_id' => (int) $validated['branch_id'],
            'is_active' => (bool) $validated['is_active'],
            'email' => $this->generateLoginEmail($employeeCode),
            'password' => Hash::make((string) $validated['password']),
        ]);

        Log::info('user_management.created', [
            'actor_id' => $actor->id,
            'target_id' => $user->id,
            'target_role' => $user->access_role?->value,
            'target_branch_id' => $user->branch_id,
            'target_active' => $user->is_active,
        ]);

        return $user;
    }

    private function generateLoginEmail(string $employeeCode): string
    {
        $base = mb_strtolower(preg_replace('/\s+/', '', $employeeCode) ?? 'user');

        $candidate = $base.'@garment-erp.local';
        $counter = 1;

        while (User::query()->where('email', $candidate)->exists()) {
            $counter++;
            $candidate = sprintf('%s+%d@garment-erp.local', $base, $counter);
        }

        return $candidate;
    }
}
