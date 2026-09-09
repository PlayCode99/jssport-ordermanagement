<?php

namespace App\Domain\UserManagement\Actions;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class ResetManagedUserPasswordAction
{
    public function execute(User $actor, User $target, string $password): User
    {
        $target->forceFill([
            'password' => Hash::make($password),
            // Any session or "remember me" cookie still holding the old password
            // is cut loose, so a reset actually locks the old holder out.
            'remember_token' => null,
        ])->save();

        Log::info('user_management.password_reset', [
            'actor_id' => $actor->id,
            'target_id' => $target->id,
            'target_branch_id' => $target->branch_id,
        ]);

        return $target;
    }
}
