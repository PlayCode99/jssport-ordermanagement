<?php

declare(strict_types=1);

namespace App\Domain\UserManagement\Actions;

use App\Enums\AccessRole;
use App\Models\User;
use App\Support\UserAccessControl;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class UpdateManagedUserAction
{
    /**
     * @param  array<string, mixed>  $validated
     */
    public function execute(User $actor, User $target, array $validated): User
    {
        $accessRole = AccessRole::from((string) $validated['role']);

        if (! UserAccessControl::canAssignRole($actor, $accessRole)) {
            throw ValidationException::withMessages([
                'role' => 'You are not allowed to assign this role.',
            ]);
        }

        $target->update([
            'name' => trim((string) $validated['full_name']),
            'full_name' => trim((string) $validated['full_name']),
            'employee_code' => trim((string) $validated['employee_code']),
            'access_role' => $accessRole,
            'branch_id' => (int) $validated['branch_id'],
            'is_active' => (bool) $validated['is_active'],
        ]);

        Log::info('user_management.updated', [
            'actor_id' => $actor->id,
            'target_id' => $target->id,
            'target_role' => $target->access_role?->value,
            'target_branch_id' => $target->branch_id,
            'target_active' => $target->is_active,
        ]);

        return $target->refresh();
    }
}
