<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\OrderManagement\Actions\ShirtData\DeleteSewingOperationAction;
use App\Domain\OrderManagement\Actions\ShirtData\DeleteShirtTypeAction;
use App\Domain\OrderManagement\Actions\ShirtData\ListSewingOperationsAction;
use App\Domain\OrderManagement\Actions\ShirtData\ListShirtTypesAction;
use App\Domain\OrderManagement\Actions\ShirtData\UpsertSewingOperationAction;
use App\Domain\OrderManagement\Actions\ShirtData\UpsertShirtTypeAction;
use App\Http\Requests\StoreSewingOperationRequest;
use App\Http\Requests\StoreShirtTypeRequest;
use App\Http\Requests\UpdateSewingOperationRequest;
use App\Http\Requests\UpdateShirtTypeRequest;
use App\Models\SewingOperation;
use App\Models\ShirtType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ShirtDataManagementController extends Controller
{
    public function types(ListShirtTypesAction $listShirtTypes): Response
    {
        return Inertia::render('settings/data/shirts/types', [
            'rows' => $listShirtTypes->execute(),
        ]);
    }

    public function sewingOperations(
        Request $request,
        ListShirtTypesAction $listShirtTypes,
        ListSewingOperationsAction $listSewingOperations,
    ): Response {
        $shirtTypeId = $request->filled('shirt_type_id') ? (int) $request->integer('shirt_type_id') : null;
        $targetGroup = $request->filled('target_group') ? (string) $request->string('target_group') : null;
        $shirtTypes = $listShirtTypes->execute();

        $selectedShirtType = null;
        if ($shirtTypeId !== null) {
            foreach ($shirtTypes as $shirtType) {
                if ((int) $shirtType['id'] === $shirtTypeId) {
                    $selectedShirtType = $shirtType;
                    break;
                }
            }
        }

        return Inertia::render('settings/data/shirts/sewing-operations', [
            'shirtTypes' => $shirtTypes,
            'rows' => $listSewingOperations->execute($shirtTypeId, $targetGroup),
            'selectedShirtTypeId' => $shirtTypeId,
            'selectedShirtTypeName' => is_array($selectedShirtType)
                ? trim(((string) ($selectedShirtType['code'] ?? '')).' '.((string) ($selectedShirtType['name'] ?? '')))
                : null,
            'selectedTargetGroup' => $targetGroup,
        ]);
    }

    public function storeType(
        StoreShirtTypeRequest $request,
        UpsertShirtTypeAction $upsertShirtType,
        ListShirtTypesAction $listShirtTypes,
    ): JsonResponse {
        $upsertShirtType->execute($request->validated());

        return response()->json([
            'rows' => $listShirtTypes->execute(),
        ]);
    }

    public function updateType(
        UpdateShirtTypeRequest $request,
        ShirtType $shirtType,
        UpsertShirtTypeAction $upsertShirtType,
        ListShirtTypesAction $listShirtTypes,
    ): JsonResponse {
        $upsertShirtType->execute($request->validated(), $shirtType);

        return response()->json([
            'rows' => $listShirtTypes->execute(),
        ]);
    }

    public function destroyType(
        ShirtType $shirtType,
        DeleteShirtTypeAction $deleteShirtType,
        ListShirtTypesAction $listShirtTypes,
    ): JsonResponse {
        $deleteShirtType->execute($shirtType);

        return response()->json([
            'rows' => $listShirtTypes->execute(),
        ]);
    }

    public function storeSewingOperation(
        StoreSewingOperationRequest $request,
        UpsertSewingOperationAction $upsertSewingOperation,
        ListSewingOperationsAction $listSewingOperations,
    ): JsonResponse {
        $upsertSewingOperation->execute($request->validated());

        return response()->json([
            'rows' => $listSewingOperations->execute(),
        ]);
    }

    public function updateSewingOperation(
        UpdateSewingOperationRequest $request,
        SewingOperation $sewingOperation,
        UpsertSewingOperationAction $upsertSewingOperation,
        ListSewingOperationsAction $listSewingOperations,
    ): JsonResponse {
        $upsertSewingOperation->execute($request->validated(), $sewingOperation);

        return response()->json([
            'rows' => $listSewingOperations->execute(),
        ]);
    }

    public function destroySewingOperation(
        SewingOperation $sewingOperation,
        DeleteSewingOperationAction $deleteSewingOperation,
        ListSewingOperationsAction $listSewingOperations,
    ): JsonResponse {
        $deleteSewingOperation->execute($sewingOperation);

        return response()->json([
            'rows' => $listSewingOperations->execute(),
        ]);
    }
}
