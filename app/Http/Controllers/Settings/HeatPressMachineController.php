<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\HeatPressMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class HeatPressMachineController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('settings/data/heat-press-machines/index', [
            'rows' => $this->rows(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'machine_name' => ['required', 'string', 'max:100', Rule::unique('heat_press_machines', 'machine_name')],
            'is_active' => ['required', 'boolean'],
        ]);

        HeatPressMachine::query()->create([
            'machine_name' => trim((string) $validated['machine_name']),
            'is_active' => (bool) $validated['is_active'],
        ]);

        return response()->json(['rows' => $this->rows()]);
    }

    public function update(Request $request, HeatPressMachine $heatPressMachine): JsonResponse
    {
        $validated = $request->validate([
            'machine_name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('heat_press_machines', 'machine_name')->ignore($heatPressMachine->id),
            ],
            'is_active' => ['required', 'boolean'],
        ]);

        $heatPressMachine->update([
            'machine_name' => trim((string) $validated['machine_name']),
            'is_active' => (bool) $validated['is_active'],
        ]);

        return response()->json(['rows' => $this->rows()]);
    }

    public function destroy(HeatPressMachine $heatPressMachine): JsonResponse
    {
        $heatPressMachine->delete();

        return response()->json(['rows' => $this->rows()]);
    }

    /**
     * @return array<int, array{id: int, machine_name: string, is_active: bool, created_at: string, updated_at: string}>
     */
    private function rows(): array
    {
        return HeatPressMachine::query()
            ->orderBy('machine_name')
            ->orderBy('id')
            ->get()
            ->map(fn (HeatPressMachine $machine): array => [
                'id' => (int) $machine->id,
                'machine_name' => (string) $machine->machine_name,
                'is_active' => (bool) $machine->is_active,
                'created_at' => $machine->created_at?->toIso8601String() ?? now()->toIso8601String(),
                'updated_at' => $machine->updated_at?->toIso8601String() ?? now()->toIso8601String(),
            ])
            ->values()
            ->all();
    }
}
