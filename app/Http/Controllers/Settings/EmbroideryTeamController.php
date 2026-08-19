<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\EmbroideryTeam;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class EmbroideryTeamController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('settings/data/embroidery-teams/index', [
            'rows' => $this->rows(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'team_name' => ['required', 'string', 'max:100', Rule::unique('embroidery_teams', 'team_name')],
            'is_active' => ['required', 'boolean'],
        ]);

        EmbroideryTeam::query()->create([
            'team_name' => trim((string) $validated['team_name']),
            'is_active' => (bool) $validated['is_active'],
        ]);

        return response()->json(['rows' => $this->rows()]);
    }

    public function update(Request $request, EmbroideryTeam $embroideryTeam): JsonResponse
    {
        $validated = $request->validate([
            'team_name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('embroidery_teams', 'team_name')->ignore($embroideryTeam->id),
            ],
            'is_active' => ['required', 'boolean'],
        ]);

        $embroideryTeam->update([
            'team_name' => trim((string) $validated['team_name']),
            'is_active' => (bool) $validated['is_active'],
        ]);

        return response()->json(['rows' => $this->rows()]);
    }

    public function destroy(EmbroideryTeam $embroideryTeam): JsonResponse
    {
        $embroideryTeam->delete();

        return response()->json(['rows' => $this->rows()]);
    }

    /**
     * @return array<int, array{id: int, team_name: string, is_active: bool, created_at: string, updated_at: string}>
     */
    private function rows(): array
    {
        return EmbroideryTeam::query()
            ->orderBy('team_name')
            ->orderBy('id')
            ->get()
            ->map(fn (EmbroideryTeam $team): array => [
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
