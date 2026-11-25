<?php

namespace App\Http\Controllers;

use App\Domain\OrderManagement\Actions\GarmentPricing\DeleteGarmentOperationAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\DeleteGarmentStyleAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\DeleteGarmentTypeAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\ListGarmentOperationsAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\ListGarmentStylesAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\ListGarmentTypesAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\UpsertGarmentOperationAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\UpsertGarmentStyleAction;
use App\Domain\OrderManagement\Actions\GarmentPricing\UpsertGarmentTypeAction;
use App\Http\Requests\StoreGarmentOperationRequest;
use App\Http\Requests\StoreGarmentStyleRequest;
use App\Http\Requests\StoreGarmentTypeRequest;
use App\Http\Requests\UpdateGarmentOperationRequest;
use App\Http\Requests\UpdateGarmentStyleRequest;
use App\Http\Requests\UpdateGarmentTypeRequest;
use App\Models\GarmentOperation;
use App\Models\GarmentStyle;
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

        // A length is picked before a garment is, so the page knows which of
        // the three screens it is on: the lengths, the garments cut to one, or
        // neither when no category has been chosen yet.
        $style = $request->filled('style') ? (string) $request->string('style') : null;

        $styles = app(ListGarmentStylesAction::class)->execute($category);
        $styleCodes = array_column($styles, 'code');

        return Inertia::render('settings/data/garments/types', [
            'rows' => $listGarmentTypes->execute($category),
            // The lengths are the shop's own list now, so the page is told
            // what they are rather than knowing three of them by heart.
            'styles' => $styles,
            'selectedCategory' => $category,
            'selectedStyle' => in_array($style, [...$styleCodes, 'all'], true) ? $style : null,
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
        $selectedTypeStyle = null;
        $selectedTypeCategory = null;

        if ($garmentTypeId !== null) {
            foreach ($types as $type) {
                if ((int) $type['id'] === $garmentTypeId) {
                    $selectedTypeName = (string) $type['name'];
                    // Carried so the page can say which garment it is pricing
                    // and get back to the list it was opened from, instead of
                    // asking the reader to pick it all over again.
                    $selectedTypeStyle = $type['style'] ?? null;
                    $selectedTypeCategory = (string) $type['category'];
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
            'selectedGarmentTypeStyle' => $selectedTypeStyle,
            'selectedGarmentTypeCategory' => $selectedTypeCategory,
        ]);
    }

    /**
     * The lengths themselves — "เซทใบงานเสื้อ" is the list of them, and the
     * shop owns it now rather than the code.
     */
    public function storeStyle(
        StoreGarmentStyleRequest $request,
        UpsertGarmentStyleAction $upsertGarmentStyle,
        ListGarmentStylesAction $listGarmentStyles,
    ): JsonResponse {
        $upsertGarmentStyle->execute($request->validated());

        return response()->json(['styles' => $listGarmentStyles->execute()]);
    }

    public function updateStyle(
        UpdateGarmentStyleRequest $request,
        GarmentStyle $garmentStyle,
        UpsertGarmentStyleAction $upsertGarmentStyle,
        ListGarmentStylesAction $listGarmentStyles,
    ): JsonResponse {
        $upsertGarmentStyle->execute($request->validated(), $garmentStyle);

        return response()->json(['styles' => $listGarmentStyles->execute()]);
    }

    public function destroyStyle(
        GarmentStyle $garmentStyle,
        DeleteGarmentStyleAction $deleteGarmentStyle,
        ListGarmentStylesAction $listGarmentStyles,
    ): JsonResponse {
        $deleteGarmentStyle->execute($garmentStyle);

        return response()->json(['styles' => $listGarmentStyles->execute()]);
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
