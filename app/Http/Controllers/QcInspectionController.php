<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\Production\Actions\ProcessQcInspectionAction;
use App\Http\Requests\StoreQcInspectionRequest;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;

class QcInspectionController extends Controller
{
    public function submit(StoreQcInspectionRequest $request, Order $order, ProcessQcInspectionAction $action): JsonResponse|RedirectResponse
    {
        $validated = $request->validated();
        $updatedOrder = $action->execute($order, (string) $validated['decision'], (int) $request->user()->id, $validated['target_station'] ?? null, $validated['remark'] ?? null);

        if ((string) $request->header('X-Inertia') !== '') {
            return back(status: 303);
        }

        return response()->json(['data' => $updatedOrder]);
    }
}
