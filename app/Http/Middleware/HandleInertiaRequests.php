<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\GarmentType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();
        $user?->loadMissing('branch:id,branch_code');

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $user ? [
                    ...$user->toArray(),
                    'branch_code' => $user->branch?->branch_code,
                    'access_role' => $user->access_role?->value,
                ] : null,
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
            'currentTeam' => fn () => $user?->currentTeam ? $user->toUserTeam($user->currentTeam) : null,
            'teams' => fn () => $user?->toUserTeams(includeCurrent: true) ?? [],
            'garmentSidebarShirtTypes' => function (): array {
                if (! Schema::hasTable('garment_types')) {
                    return [];
                }

                return GarmentType::query()
                    ->where('category', 'SHIRT')
                    ->where('is_active', true)
                    ->orderBy('display_order')
                    ->orderBy('id')
                    ->get(['id', 'code', 'name'])
                    ->map(static fn (GarmentType $type): array => [
                        'id' => (int) $type->id,
                        'code' => (string) $type->code,
                        'name' => (string) $type->name,
                    ])
                    ->values()
                    ->all();
            },
        ];
    }
}
