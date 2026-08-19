<?php

declare(strict_types=1);

namespace App\Domain\UserManagement\Actions;

use App\Models\User;
use Illuminate\Support\Facades\Log;

class ToggleManagedUserActiveAction
{
    public function execute(User $actor, User $target, bool $isActive): User
    {
        $target->update(['is_active' => $isActive]);

        Log::info('user_management.status_toggled', [
            'actor_id' => $actor->id,
            'target_id' => $target->id,
            'target_active' => $target->is_active,
        ]);

        return $target->refresh();
    }
}
