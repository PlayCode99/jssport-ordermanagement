<?php

declare(strict_types=1);

namespace App\Http\Responses\Concerns;

use App\Models\Team;
use App\Support\UserLandingPage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

trait RedirectsToCurrentTeam
{
    protected function redirectPathForCurrentTeam(Request $request, string $redirect): string
    {
        $team = $this->currentTeam($request);
        $user = $request->user();

        if ($team !== null) {
            URL::defaults(['current_team' => $team->slug]);
        }

        if ($user === null) {
            return route('counter.fallback', absolute: false);
        }

        // Land on the first menu this account may actually open. The old
        // fallback here was the new-order form, which a QC or sewing account may
        // not use -- they signed in and hit a page they were locked out of.
        $landing = UserLandingPage::routeFor($user);

        // Counter staff keep their team-scoped dashboard exactly as before.
        if ($team !== null && $landing === route('counter.fallback', absolute: false)) {
            return "/{$team->slug}{$redirect}";
        }

        return $landing;
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
