<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\OrderManagement\Actions\GarmentPricing\DeleteGarmentOperationAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\DeleteGarmentTypeAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\ListGarmentOperationsAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\ListGarmentTypesAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\UpsertGarmentOperationAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\UpsertGarmentTypeAction;
use App\Http\Requests\StoreGarmentOperationRequest;
use App\Http\Requests\StoreGarmentTypeRequest;
use App\Http\Requests\UpdateGarmentOperationRequest;
use App\Http\Requests\UpdateGarmentTypeRequest;
use App\Models\GarmentOperation;
use App\Models\GarmentType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class GarmentPricingController extends Controller
{
    public function types(Request $request, ListGarmentTypesAction $listGarmentTypes): Response
    {
        $category = $request->filled('category') ? (string) $request->string('category') : null;

        return Inertia::render('settings/data/garments/types', [
            'rows' => $listGarmentTypes->execute($category),
            'selectedCategory' => $category,
        ]);
    }

    public function prices(
        Request $request,
        ListGarmentTypesAction $listGarmentTypes,
        ListGarmentOperationsAction $listGarmentOperations,
    ): Response {
        $category = $request->filled('category') ? (string) $request->string('category') : null;
        $garmentTypeId = $request->filled('garment_type_id') ? (int) $request->integer('garment_type_id') : null;
        $types = $listGarmentTypes->execute($category);

        $selectedTypeName = null;
        if ($garmentTypeId !== null) {
            foreach ($types as $type) {
                if ((int) $type['id'] === $garmentTypeId) {
                    $selectedTypeName = (string) $type['name'];
                    break;
                }
            }
        }

        return Inertia::render('settings/data/garments/prices', [
            'garmentTypes' => $types,
            'rows' => $listGarmentOperations->execute($garmentTypeId, $category),
            'selectedCategory' => $category,
            'selectedGarmentTypeId' => $garmentTypeId,
            'selectedGarmentTypeName' => $selectedTypeName,
        ]);
    }

    public function storeType(
        StoreGarmentTypeRequest $request,
        UpsertGarmentTypeAction $upsertGarmentType,
        ListGarmentTypesAction $listGarmentTypes,
    ): JsonResponse {
        $upsertGarmentType->execute($request->validated());

        return response()->json([
            'rows' => $listGarmentTypes->execute(),
        ]);
    }

    public function updateType(
        UpdateGarmentTypeRequest $request,
        GarmentType $garmentType,
        UpsertGarmentTypeAction $upsertGarmentType,
        ListGarmentTypesAction $listGarmentTypes,
    ): JsonResponse {
        $upsertGarmentType->execute($request->validated(), $garmentType);

        return response()->json([
            'rows' => $listGarmentTypes->execute(),
        ]);
    }

    public function destroyType(
        GarmentType $garmentType,
        DeleteGarmentTypeAction $deleteGarmentType,
        ListGarmentTypesAction $listGarmentTypes,
    ): JsonResponse {
        $deleteGarmentType->execute($garmentType);

        return response()->json([
            'rows' => $listGarmentTypes->execute(),
        ]);
    }

    public function storePrice(
        StoreGarmentOperationRequest $request,
        UpsertGarmentOperationAction $upsertGarmentOperation,
        ListGarmentOperationsAction $listGarmentOperations,
    ): JsonResponse {
        $upsertGarmentOperation->execute($request->validated());

        return response()->json([
            'rows' => $listGarmentOperations->execute(),
        ]);
    }

    public function updatePrice(
        UpdateGarmentOperationRequest $request,
        GarmentOperation $garmentOperation,
        UpsertGarmentOperationAction $upsertGarmentOperation,
        ListGarmentOperationsAction $listGarmentOperations,
    ): JsonResponse {
        $upsertGarmentOperation->execute($request->validated(), $garmentOperation);

        return response()->json([
            'rows' => $listGarmentOperations->execute(),
        ]);
    }

    public function destroyPrice(
        GarmentOperation $garmentOperation,
        DeleteGarmentOperationAction $deleteGarmentOperation,
        ListGarmentOperationsAction $listGarmentOperations,
    ): JsonResponse {
        $deleteGarmentOperation->execute($garmentOperation);

        return response()->json([
            'rows' => $listGarmentOperations->execute(),
        ]);
    }
}
