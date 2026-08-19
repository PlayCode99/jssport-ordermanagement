<?php

declare(strict_types=1);

namespace App\Domain\UserManagement\Actions;

use App\Models\User;
use Illuminate\Support\Facades\Log;

class DeleteManagedUserAction
{
    public function execute(User $actor, User $target): void
    {
        $target->delete();

        Log::info('user_management.deleted', [
            'actor_id' => $actor->id,
            'target_id' => $target->id,
        ]);
    }
}
