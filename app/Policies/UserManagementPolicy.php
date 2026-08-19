<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use App\Support\UserAccessControl;

class UserManagementPolicy
{
    public function viewAny(User $user): bool
    {
        return UserAccessControl::canManageUsers($user);
    }

    public function create(User $user): bool
    {
        return UserAccessControl::canManageUsers($user);
    }

    public function update(User $user, User $target): bool
    {
        return UserAccessControl::canManageUsers($user)
            && UserAccessControl::canAccessBranch($user, (int) $target->branch_id);
    }

    public function delete(User $user, User $target): bool
    {
        if ((int) $user->id === (int) $target->id) {
            return false;
        }

        return UserAccessControl::canManageUsers($user)
            && UserAccessControl::canAccessBranch($user, (int) $target->branch_id);
    }

    public function toggleActive(User $user, User $target): bool
    {
        if ((int) $user->id === (int) $target->id) {
            return false;
        }

        return UserAccessControl::canManageUsers($user)
            && UserAccessControl::canAccessBranch($user, (int) $target->branch_id);
    }
}
