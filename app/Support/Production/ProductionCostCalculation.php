<?php

declare(strict_types=1);

namespace App\Support\Production;

use App\Enums\GarmentCategory;
use App\Models\GarmentOperation;
use App\Models\GarmentType;
use App\Models\Order;
use Illuminate\Support\Collection;

/**
 * The piecework costing shown on the production sheets: a garment type's
 * operations give a per-piece price for kids and adults, multiplied by the
 * order's quantities in each group.
 *
 * Extracted verbatim from ProductionKanbanController so the owner dashboard
 * reports the very same numbers instead of re-deriving them — one formula,
 * one place to change it.
 */
trait ProductionCostCalculation
{
    /**
     * @param  Collection<int, GarmentType>  $garmentTypesById
     */
    private function resolveGarmentTypeByCategory(Order $order, Collection $garmentTypesById, GarmentCategory $category): ?GarmentType
    {
        $payload = $this->decodeSpecPayload($order->specification?->toArray() ?? []);
        $sectionKey = $category === GarmentCategory::Shirt ? 'shirt_specs' : 'pants_specs';
        $typeIdKey = $category === GarmentCategory::Shirt ? 'shirt_type_id' : 'pants_type_id';
        $specs = is_array($payload[$sectionKey] ?? null)
            ? $payload[$sectionKey]
            : (is_array($payload[lcfirst($category->name).'Specs'] ?? null) ? $payload[lcfirst($category->name).'Specs'] : []);

        $typeId = isset($specs[$typeIdKey]) ? (int) $specs[$typeIdKey] : 0;

        if ($typeId > 0) {
            $matchedById = $garmentTypesById->keyBy('id')->get($typeId);

            if ($matchedById instanceof GarmentType) {
                return $matchedById;
            }
        }

        $jobType = trim((string) ($order->job_type ?? ''));

        if ($jobType !== '') {
            $matchedByName = $garmentTypesById
                ->first(fn (GarmentType $type): bool => str_contains(mb_strtolower($type->name), mb_strtolower($jobType))
                    || str_contains(mb_strtolower($jobType), mb_strtolower($type->name)));

            if ($matchedByName instanceof GarmentType) {
                return $matchedByName;
            }
        }

        return $garmentTypesById->first();
    }

    /**
     * @param  Collection<int, GarmentType>  $shirtTypesById
     */
    private function resolveShirtType(Order $order, Collection $shirtTypesById): ?GarmentType
    {
        return $this->resolveGarmentTypeByCategory($order, $shirtTypesById, GarmentCategory::Shirt);
    }

    /**
     * @param  Collection<int, GarmentType>  $pantsTypesById
     */
    private function resolvePantsType(Order $order, Collection $pantsTypesById): ?GarmentType
    {
        return $this->resolveGarmentTypeByCategory($order, $pantsTypesById, GarmentCategory::Pants);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function specSectionHasValues(array $payload): bool
    {
        foreach ($payload as $value) {
            if ($value === null) {
                continue;
            }

            if (is_string($value) && trim($value) === '') {
                continue;
            }

            return true;
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $specification
     * @return array{shirt: bool, pants: bool}
     */
    private function resolveSpecificationGarmentAvailability(array $specification): array
    {
        $decoded = $this->decodeSpecPayload($specification);
        $shirtSpecs = is_array($decoded['shirt_specs'] ?? null)
            ? $decoded['shirt_specs']
            : (is_array($decoded['shirtSpecs'] ?? null) ? $decoded['shirtSpecs'] : []);
        $pantsSpecs = is_array($decoded['pants_specs'] ?? null)
            ? $decoded['pants_specs']
            : (is_array($decoded['pantsSpecs'] ?? null) ? $decoded['pantsSpecs'] : []);

        $legacyShirt = [
            'pattern_id' => $specification['pattern_id'] ?? null,
            'fabric_id' => $specification['fabric_id'] ?? null,
            'neck_style_id' => $specification['neck_style_id'] ?? null,
            'sleeve_style' => $specification['sleeve_style'] ?? null,
            'sleeve_hem' => $specification['sleeve_hem'] ?? null,
            'placket_style' => $specification['placket_style'] ?? null,
            'placket_color' => $specification['placket_color'] ?? null,
            'sublimation_detail' => $specification['sublimation_detail'] ?? null,
            'embroidery_code' => $specification['embroidery_code'] ?? null,
        ];

        $legacyPants = [
            'leg_style' => $specification['leg_style'] ?? null,
            'leg_hem' => $specification['leg_hem'] ?? null,
        ];

        return [
            'shirt' => $this->specSectionHasValues($shirtSpecs) || $this->specSectionHasValues($legacyShirt),
            'pants' => $this->specSectionHasValues($pantsSpecs) || $this->specSectionHasValues($legacyPants),
        ];
    }

    /**
     * @return array<int, string>
     */
    private function resolvePricingGarmentGroups(string $itemType, bool $hasShirtSpecData, bool $hasPantsSpecData): array
    {
        $normalized = mb_strtolower(trim($itemType));

        if (str_contains($normalized, 'pant') || str_contains($normalized, 'กางเกง')) {
            return ['pants'];
        }

        if (str_contains($normalized, 'shirt') || str_contains($normalized, 'เสื้อ')) {
            return ['shirt'];
        }

        if (in_array($normalized, ['', 'garment', 'set', 'combo'], true)) {
            if ($hasShirtSpecData && $hasPantsSpecData) {
                return ['shirt', 'pants'];
            }

            if ($hasPantsSpecData && ! $hasShirtSpecData) {
                return ['pants'];
            }
        }

        return ['shirt'];
    }

    /**
     * The labour rates recorded on the order, or null when it predates them.
     *
     * @return array<string, mixed>|null
     */
    private function productionRateSnapshot(Order $order): ?array
    {
        $raw = $order->production_rate_snapshot;

        if (is_string($raw)) {
            $raw = json_decode($raw, true);
        }

        if (! is_array($raw)) {
            return null;
        }

        $hasComponents = is_array($raw['components'] ?? null) || is_array($raw['pants_components'] ?? null);

        return $hasComponents ? $raw : null;
    }

    /**
     * Builds the snapshot to store on an order: the operation prices in force
     * right now, plus the garment type names they belong to.
     *
     * @param  \Illuminate\Support\Collection<string, \Illuminate\Support\Collection<int, GarmentType>>  $garmentTypesByCategory
     * @return array<string, mixed>
     */
    public function buildProductionRateSnapshot(Order $order, Collection $garmentTypesByCategory): array
    {
        $shirtType = $this->resolveShirtType($order, $garmentTypesByCategory->get(GarmentCategory::Shirt->value, collect()));
        $pantsType = $this->resolvePantsType($order, $garmentTypesByCategory->get(GarmentCategory::Pants->value, collect()));

        $components = static fn (?GarmentType $type): array => $type instanceof GarmentType
            ? $type->operations
                ->map(fn (GarmentOperation $operation): array => [
                    'name' => $operation->name,
                    'child_price' => (float) ($operation->child_price ?? 0),
                    'adult_price' => (float) ($operation->adult_price ?? 0),
                ])
                ->values()
                ->all()
            : [];

        return [
            'captured_at' => now()->toIso8601String(),
            'shirt_type_id' => $shirtType?->id,
            'pants_type_id' => $pantsType?->id,
            'shirt_type_name' => $shirtType?->name,
            'pants_type_name' => $pantsType?->name,
            'components' => $components($shirtType),
            'pants_components' => $components($pantsType),
        ];
    }

    private function normalizePricingSizeGroup(string $sizeGroup): ?string
    {
        $normalized = mb_strtolower(trim($sizeGroup));

        if ($normalized === 'kids') {
            return 'kids';
        }

        if (in_array($normalized, ['adults', 'oversize'], true)) {
            return 'adults';
        }

        return null;
    }

    /**
     * @return array{shirt_kids: int, shirt_adults: int, pants_kids: int, pants_adults: int}
     */
    private function summarizeOrderQuantitiesByPricingGroup(Order $order): array
    {
        $totals = [
            'shirt_kids' => 0,
            'shirt_adults' => 0,
            'pants_kids' => 0,
            'pants_adults' => 0,
        ];
        $garmentAvailability = $this->resolveSpecificationGarmentAvailability($order->specification?->toArray() ?? []);

        foreach ($order->items ?? collect() as $item) {
            $sizeGroup = $this->normalizePricingSizeGroup((string) ($item->size_group ?? ''));

            if ($sizeGroup === null) {
                continue;
            }

            $garmentGroups = $this->resolvePricingGarmentGroups(
                (string) ($item->item_type ?? ''),
                $garmentAvailability['shirt'],
                $garmentAvailability['pants'],
            );

            foreach ($garmentGroups as $garmentGroup) {
                $key = $garmentGroup.'_'.$sizeGroup;
                $totals[$key] += (int) ($item->quantity ?? 0);
            }
        }

        return $totals;
    }

    /**
     * @param  Collection<string, Collection<int, GarmentType>>  $garmentTypesByCategory
     * @return array<string, mixed>|null
     */
    private function buildProductionPricingSummary(Order $order, Collection $garmentTypesByCategory): ?array
    {
        $shirtTypes = $garmentTypesByCategory->get(GarmentCategory::Shirt->value, collect());
        $pantsTypes = $garmentTypesByCategory->get(GarmentCategory::Pants->value, collect());

        $shirtType = $this->resolveShirtType($order, $shirtTypes);
        $pantsType = $this->resolvePantsType($order, $pantsTypes);

        $quantities = $this->summarizeOrderQuantitiesByPricingGroup($order);
        $shirtChildQuantity = (int) $quantities['shirt_kids'];
        $shirtAdultQuantity = (int) $quantities['shirt_adults'];
        $pantsChildQuantity = (int) $quantities['pants_kids'];
        $pantsAdultQuantity = (int) $quantities['pants_adults'];

        $buildComponents = static fn (GarmentType $garmentType): Collection => $garmentType->operations
            ->map(fn (GarmentOperation $operation): array => [
                'name' => $operation->name,
                'child_price' => (float) ($operation->child_price ?? 0),
                'adult_price' => (float) ($operation->adult_price ?? 0),
            ])
            ->values();

        // The rate the order was taken at wins. Master data only prices orders
        // that have no snapshot yet, so changing a rate never re-prices work
        // that has already been booked.
        $snapshot = $this->productionRateSnapshot($order);

        $shirtComponents = $snapshot !== null
            ? collect($snapshot['components'] ?? [])
            : ($shirtType instanceof GarmentType ? $buildComponents($shirtType) : collect());
        $pantsComponents = $snapshot !== null
            ? collect($snapshot['pants_components'] ?? [])
            : ($pantsType instanceof GarmentType ? $buildComponents($pantsType) : collect());

        $shirtTypeName = $snapshot['shirt_type_name'] ?? $shirtType?->name ?? null;
        $pantsTypeName = $snapshot['pants_type_name'] ?? $pantsType?->name ?? null;

        $shirtChildUnitTotal = (float) $shirtComponents->sum('child_price');
        $shirtAdultUnitTotal = (float) $shirtComponents->sum('adult_price');
        $pantsChildUnitTotal = (float) $pantsComponents->sum('child_price');
        $pantsAdultUnitTotal = (float) $pantsComponents->sum('adult_price');

        $shirtChildTotal = $shirtChildUnitTotal * $shirtChildQuantity;
        $shirtAdultTotal = $shirtAdultUnitTotal * $shirtAdultQuantity;
        $pantsChildTotal = $pantsChildUnitTotal * $pantsChildQuantity;
        $pantsAdultTotal = $pantsAdultUnitTotal * $pantsAdultQuantity;

        $groups = collect([
            [
                'key' => 'shirt_kids',
                'label' => 'เสื้อไซต์เด็ก',
                'garment' => 'shirt',
                'size_group' => 'kids',
                'quantity' => $shirtChildQuantity,
                'unit_total' => $shirtChildUnitTotal,
                'subtotal' => $shirtChildTotal,
            ],
            [
                'key' => 'shirt_adults',
                'label' => 'เสื้อไซต์ผู้ใหญ่',
                'garment' => 'shirt',
                'size_group' => 'adults',
                'quantity' => $shirtAdultQuantity,
                'unit_total' => $shirtAdultUnitTotal,
                'subtotal' => $shirtAdultTotal,
            ],
            [
                'key' => 'pants_kids',
                'label' => 'กางเกงเด็ก',
                'garment' => 'pants',
                'size_group' => 'kids',
                'quantity' => $pantsChildQuantity,
                'unit_total' => $pantsChildUnitTotal,
                'subtotal' => $pantsChildTotal,
            ],
            [
                'key' => 'pants_adults',
                'label' => 'กางเกงผู้ใหญ่',
                'garment' => 'pants',
                'size_group' => 'adults',
                'quantity' => $pantsAdultQuantity,
                'unit_total' => $pantsAdultUnitTotal,
                'subtotal' => $pantsAdultTotal,
            ],
        ])->filter(fn (array $group): bool => (int) $group['quantity'] > 0)->values()->all();

        $grandTotal = $shirtChildTotal + $shirtAdultTotal + $pantsChildTotal + $pantsAdultTotal;

        return [
            'shirt_type_id' => $shirtType?->id ?? null,
            'pants_type_id' => $pantsType?->id ?? null,
            'shirt_type_name' => $shirtTypeName,
            'pants_type_name' => $pantsTypeName,
            'child_quantity' => $shirtChildQuantity + $pantsChildQuantity,
            'adult_quantity' => $shirtAdultQuantity + $pantsAdultQuantity,
            'shirt_child_quantity' => $shirtChildQuantity,
            'shirt_adult_quantity' => $shirtAdultQuantity,
            'pants_child_quantity' => $pantsChildQuantity,
            'pants_adult_quantity' => $pantsAdultQuantity,
            'components' => $shirtComponents->all(),
            'pants_components' => $pantsComponents->all(),
            'child_unit_total' => $shirtChildUnitTotal,
            'adult_unit_total' => $shirtAdultUnitTotal,
            'pants_child_unit_total' => $pantsChildUnitTotal,
            'pants_adult_unit_total' => $pantsAdultUnitTotal,
            'child_total' => $shirtChildTotal,
            'adult_total' => $shirtAdultTotal,
            'pants_child_total' => $pantsChildTotal,
            'pants_adult_total' => $pantsAdultTotal,
            'shirt_grand_total' => $shirtChildTotal + $shirtAdultTotal,
            'pants_grand_total' => $pantsChildTotal + $pantsAdultTotal,
            'grand_total' => $grandTotal,
            'groups' => $groups,
            'group_count' => count($groups),
        ];
    }

    /**
     * @param  array<string, mixed>  $specification
     * @return array<string, mixed>
     */
    private function decodeSpecPayload(array $specification): array
    {
        $raw = $specification['screen_print_detail'] ?? null;

        if (! is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);

        if (is_string($decoded)) {
            $decoded = json_decode($decoded, true);
        }

        return is_array($decoded) ? $decoded : [];
    }
}
