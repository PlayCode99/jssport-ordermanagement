<?php
declare(strict_types=1);

namespace App\Http\Responses\Concerns;

use App\Models\Team;
use App\Support\UserAccessControl;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

trait RedirectsToCurrentTeam
{
    protected function redirectPathForCurrentTeam(Request $request, string $redirect): string
    {
        $team = $this->currentTeam($request);

        if ($team === null) {
            $user = $request->user();

            if ($user !== null && UserAccessControl::canAccessMenu($user, 'counter')) {
                return route('counter.fallback', absolute: false);
            }

            return route('orders.create', absolute: false);
        }

        URL::defaults(['current_team' => $team->slug]);

        return "/{$team->slug}{$redirect}";
    }

    protected function currentTeam(Request $request): ?Team
    {
        $user = $request->user();

        if (! $user) {
            return null;
        }

        return $user->currentTeam ?? $user->personalTeam() ?? $user->fallbackTeam();
    }
}
