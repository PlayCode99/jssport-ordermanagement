<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\ScreenTeam;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ScreenTeamController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('settings/data/screen-teams/index', [
            'rows' => $this->rows(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'team_name' => ['required', 'string', 'max:100', Rule::unique('screen_teams', 'team_name')],
            'station_name' => ['required', 'string', Rule::in(['screen', 'flex'])],
            'is_active' => ['required', 'boolean'],
        ]);

        ScreenTeam::query()->create([
            'team_name' => trim((string) $validated['team_name']),
            'station_name' => (string) $validated['station_name'],
            'is_active' => (bool) $validated['is_active'],
        ]);

        return response()->json(['rows' => $this->rows()]);
    }

    public function update(Request $request, ScreenTeam $screenTeam): JsonResponse
    {
        $validated = $request->validate([
            'team_name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('screen_teams', 'team_name')->ignore($screenTeam->id),
            ],
            'station_name' => ['required', 'string', Rule::in(['screen', 'flex'])],
            'is_active' => ['required', 'boolean'],
        ]);

        $screenTeam->update([
            'team_name' => trim((string) $validated['team_name']),
            'station_name' => (string) $validated['station_name'],
            'is_active' => (bool) $validated['is_active'],
        ]);

        return response()->json(['rows' => $this->rows()]);
    }

    public function destroy(ScreenTeam $screenTeam): JsonResponse
    {
        $screenTeam->delete();

        return response()->json(['rows' => $this->rows()]);
    }

    /**
     * @return array<int, array{id: int, team_name: string, station_name: string, is_active: bool, created_at: string, updated_at: string}>
     */
    private function rows(): array
    {
        return ScreenTeam::query()
            ->orderBy('station_name')
            ->orderBy('team_name')
            ->orderBy('id')
            ->get()
            ->map(fn (ScreenTeam $team): array => [
                'id' => (int) $team->id,
                'team_name' => (string) $team->team_name,
                'station_name' => (string) $team->station_name,
                'is_active' => (bool) $team->is_active,
                'created_at' => $team->created_at?->toIso8601String() ?? now()->toIso8601String(),
                'updated_at' => $team->updated_at?->toIso8601String() ?? now()->toIso8601String(),
            ])
            ->values()
            ->all();
    }
}
