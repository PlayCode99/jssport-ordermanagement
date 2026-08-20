<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\CuttingTeam;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class CuttingTeamController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('settings/data/cutting-teams/index', [
            'rows' => $this->rows(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'team_name' => ['required', 'string', 'max:100', Rule::unique('cutting_teams', 'team_name')],
            'is_active' => ['required', 'boolean'],
        ]);

        CuttingTeam::query()->create([
            'team_name' => trim((string) $validated['team_name']),
            'is_active' => (bool) $validated['is_active'],
        ]);

        return response()->json(['rows' => $this->rows()]);
    }

    public function update(Request $request, CuttingTeam $cuttingTeam): JsonResponse
    {
        $validated = $request->validate([
            'team_name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('cutting_teams', 'team_name')->ignore($cuttingTeam->id),
            ],
            'is_active' => ['required', 'boolean'],
        ]);

        $cuttingTeam->update([
            'team_name' => trim((string) $validated['team_name']),
            'is_active' => (bool) $validated['is_active'],
        ]);

        return response()->json(['rows' => $this->rows()]);
    }

    public function destroy(CuttingTeam $cuttingTeam): JsonResponse
    {
        $cuttingTeam->delete();

        return response()->json(['rows' => $this->rows()]);
    }

    /**
     * @return array<int, array{id: int, team_name: string, is_active: bool, created_at: string, updated_at: string}>
     */
    private function rows(): array
    {
        return CuttingTeam::query()
            ->orderBy('team_name')
            ->orderBy('id')
            ->get()
            ->map(fn (CuttingTeam $team): array => [
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
