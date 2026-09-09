<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\ProductionDailySetting;
use App\Support\UserAccessControl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ProductionDailySettingController extends Controller
{
    public function index(Request $request): Response
    {
        $this->ensureCanManage($request);

        return Inertia::render('settings/data/production-capacity/index', [
            'dailyCapacity' => $this->setting()->daily_capacity,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->ensureCanManage($request);

        $validated = $request->validate([
            'daily_capacity' => ['required', 'integer', 'min:1', 'max:100000'],
        ]);

        $setting = $this->setting();
        $setting->update(['daily_capacity' => (int) $validated['daily_capacity']]);

        return response()->json(['daily_capacity' => $setting->daily_capacity]);
    }

    private function setting(): ProductionDailySetting
    {
        return ProductionDailySetting::query()->firstOrCreate([], ['daily_capacity' => 200]);
    }

    private function ensureCanManage(Request $request): void
    {
        if (! UserAccessControl::canManageUsers($request->user())) {
            abort(403);
        }
    }
}
