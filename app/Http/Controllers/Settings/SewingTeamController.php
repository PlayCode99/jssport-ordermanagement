<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\SewingTeam;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class SewingTeamController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('settings/data/sewing-teams/index', [
            'rows' => $this->rows(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'team_name' => ['required', 'string', 'max:100', Rule::unique('sewing_teams', 'team_name')],
            'is_active' => ['required', 'boolean'],
        ]);

        SewingTeam::query()->create([
            'team_name' => trim((string) $validated['team_name']),
            'is_active' => (bool) $validated['is_active'],
        ]);

        return response()->json(['rows' => $this->rows()]);
    }

    public function update(Request $request, SewingTeam $sewingTeam): JsonResponse
    {
        $validated = $request->validate([
            'team_name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('sewing_teams', 'team_name')->ignore($sewingTeam->id),
            ],
            'is_active' => ['required', 'boolean'],
        ]);

        $sewingTeam->update([
            'team_name' => trim((string) $validated['team_name']),
            'is_active' => (bool) $validated['is_active'],
        ]);

        return response()->json(['rows' => $this->rows()]);
    }

    public function destroy(SewingTeam $sewingTeam): JsonResponse
    {
        $sewingTeam->delete();

        return response()->json(['rows' => $this->rows()]);
    }

    /**
     * @return array<int, array{id: int, team_name: string, is_active: bool, created_at: string, updated_at: string}>
     */
    private function rows(): array
    {
        return SewingTeam::query()
            ->orderBy('team_name')
            ->orderBy('id')
            ->get()
            ->map(fn (SewingTeam $team): array => [
                'id' => (int) $team->id,
                'team_name' => (string) $team->team_name,
                'is_active' => (bool) $team->is_active,
                'created_at' => $team->created_at?->toIso8601String() ?? now()->toIso8601String(),
                'updated_at' => $team->updated_at?->toIso8601String() ?? now()->toIso8601String(),
            ])
            ->values()
            ->all();
    }
}