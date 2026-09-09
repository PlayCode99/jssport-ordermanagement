<?php

use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetTeamUrlDefaults;
use App\Support\UserLandingPage;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->redirectUsersTo(function (Request $request): string {
            $user = $request->user();

            if ($user === null) {
                return route('home');
            }

            $team = $user->currentTeam ?? $user->personalTeam() ?? $user->fallbackTeam();
            $landing = UserLandingPage::routeFor($user);

            // Same rule as the sign-in redirect: the first menu this account may
            // open. Counter staff keep their team-scoped dashboard.
            if ($team !== null && $landing === route('counter.fallback', absolute: false)) {
                return route('index', ['current_team' => $team->slug]);
            }

            return $landing;
        });

        $middleware->web(append: [
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
            SetTeamUrlDefaults::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
