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

        // Last resort. Prefer a type that actually has rates: picking the very
        // first one meant that deactivating the priced type silently costed
        // every new bill at zero instead of failing loudly.
        $priced = $garmentTypesById->first(
            fn (GarmentType $type): bool => $type->operations->isNotEmpty()
        );

        return $priced ?? $garmentTypesById->first();
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
     * @param  Collection<string, Collection<int, GarmentType>>  $garmentTypesByCategory
     * @return array<string, mixed>
     */
    public function buildProductionRateSnapshot(Order $order, Collection $garmentTypesByCategory): array
    {
        $shirtType = $this->resolveShirtType($order, $garmentTypesByCategory->get(GarmentCategory::Shirt->value, collect()));
        $pantsType = $this->resolvePantsType($order, $garmentTypesByCategory->get(GarmentCategory::Pants->value, collect()));

        $components = fn (?GarmentType $type): array => $type instanceof GarmentType
            ? $this->rateComponents($type)
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

    /**
     * Production splits the work by sleeve and leg length as well as by garment
     * and size group, so each batch gets its own sheet on the floor. Rows saved
     * before order_items carried a style land in 'unspecified' rather than being
     * guessed into one of the real batches.
     *
     * @var list<string>
     */
    private const PRODUCTION_GROUP_STYLES = ['short', 'long', 'unspecified'];

    /** @var array<string, string> */
    private const PRODUCTION_GROUP_BASE_LABELS = [
        'shirt_kids' => 'เสื้อไซต์เด็ก',
        'shirt_adults' => 'เสื้อไซต์ผู้ใหญ่',
        'pants_kids' => 'กางเกงเด็ก',
        'pants_adults' => 'กางเกงผู้ใหญ่',
    ];

    /** @var array<string, array<string, string>> */
    private const PRODUCTION_STYLE_LABELS = [
        'shirt' => ['short' => 'แขนสั้น', 'long' => 'แขนยาว', 'unspecified' => 'ไม่ระบุแขน'],
        'pants' => ['short' => 'ขาสั้น', 'long' => 'ขายาว', 'unspecified' => 'ไม่ระบุขา'],
    ];

    /**
     * One operation per entry, with the rates that price it. Long prices stay
     * null when the shop has not set them, so unitTotalForBatch() can tell
     * "not priced separately" apart from "free".
     *
     * @return list<array<string, mixed>>
     */
    private function rateComponents(GarmentType $garmentType): array
    {
        return $garmentType->operations
            ->map(fn (GarmentOperation $operation): array => [
                'name' => $operation->name,
                'child_price' => (float) ($operation->child_price ?? 0),
                'adult_price' => (float) ($operation->adult_price ?? 0),
                'child_price_long' => $operation->child_price_long === null ? null : (float) $operation->child_price_long,
                'adult_price_long' => $operation->adult_price_long === null ? null : (float) $operation->adult_price_long,
            ])
            ->values()
            ->all();
    }

    /**
     * The labour cost of one garment in a batch.
     *
     * Long sleeves and long legs are priced per operation, and an operation the
     * shop has not priced separately simply costs the same either way. Snapshots
     * taken before those columns existed carry no long price at all, so they fall
     * back the same way and already-booked work keeps the cost it was booked at.
     *
     * @param  Collection<int, mixed>  $components
     */
    private function unitTotalForBatch(Collection $components, string $sizeGroup, string $style): float
    {
        $baseKey = $sizeGroup === 'kids' ? 'child_price' : 'adult_price';
        $longKey = $sizeGroup === 'kids' ? 'child_price_long' : 'adult_price_long';

        return (float) $components->sum(function ($component) use ($baseKey, $longKey, $style): float {
            if (! is_array($component)) {
                return 0.0;
            }

            $base = (float) ($component[$baseKey] ?? 0);

            if ($style !== 'long') {
                return $base;
            }

            $long = $component[$longKey] ?? null;

            return is_numeric($long) ? (float) $long : $base;
        });
    }

    private function normalizeProductionStyle(?string $style): string
    {
        $normalized = mb_strtolower(trim((string) $style));

        return in_array($normalized, ['short', 'long'], true) ? $normalized : 'unspecified';
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
     * Quantities per production batch: garment x size group x garment style.
     *
     * A "set" row is one shirt and one pair of pants, so it feeds two batches,
     * and each takes its own style from the row — a set can be short sleeved
     * and long legged at the same time.
     *
     * @return array<string, int>
     */
    private function summarizeOrderQuantitiesByProductionGroup(Order $order): array
    {
        $totals = [];

        foreach (['shirt', 'pants'] as $garment) {
            foreach (['kids', 'adults'] as $sizeGroup) {
                foreach (self::PRODUCTION_GROUP_STYLES as $style) {
                    $totals[$garment.'_'.$sizeGroup.'_'.$style] = 0;
                }
            }
        }

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
                $style = $this->normalizeProductionStyle(
                    $garmentGroup === 'pants' ? $item->pants_style : $item->shirt_style,
                );

                $totals[$garmentGroup.'_'.$sizeGroup.'_'.$style] += (int) ($item->quantity ?? 0);
            }
        }

        return $totals;
    }

    /**
     * The same quantities folded back to garment x size group, for callers that
     * only need "how many shirts" and not which batch they belong to.
     *
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

        foreach ($this->summarizeOrderQuantitiesByProductionGroup($order) as $key => $quantity) {
            [$garment, $sizeGroup] = explode('_', $key);
            $totals[$garment.'_'.$sizeGroup] += $quantity;
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

        $batchQuantities = $this->summarizeOrderQuantitiesByProductionGroup($order);
        $quantities = $this->summarizeOrderQuantitiesByPricingGroup($order);
        $shirtChildQuantity = (int) $quantities['shirt_kids'];
        $shirtAdultQuantity = (int) $quantities['shirt_adults'];
        $pantsChildQuantity = (int) $quantities['pants_kids'];
        $pantsAdultQuantity = (int) $quantities['pants_adults'];

        // The rate the order was taken at wins. Master data only prices orders
        // that have no snapshot yet, so changing a rate never re-prices work
        // that has already been booked.
        $snapshot = $this->productionRateSnapshot($order);

        $shirtComponents = $snapshot !== null
            ? collect($snapshot['components'] ?? [])
            : collect($shirtType instanceof GarmentType ? $this->rateComponents($shirtType) : []);
        $pantsComponents = $snapshot !== null
            ? collect($snapshot['pants_components'] ?? [])
            : collect($pantsType instanceof GarmentType ? $this->rateComponents($pantsType) : []);

        $shirtTypeName = $snapshot['shirt_type_name'] ?? $shirtType->name ?? null;
        $pantsTypeName = $snapshot['pants_type_name'] ?? $pantsType->name ?? null;

        $shirtChildUnitTotal = (float) $shirtComponents->sum('child_price');
        $shirtAdultUnitTotal = (float) $shirtComponents->sum('adult_price');
        $pantsChildUnitTotal = (float) $pantsComponents->sum('child_price');
        $pantsAdultUnitTotal = (float) $pantsComponents->sum('adult_price');

        // One batch per garment x size group x style, which is one printed sheet
        // on the production floor. Batches with nothing in them are dropped so a
        // bill never prints an empty page.
        $groups = [];

        foreach (['shirt', 'pants'] as $garment) {
            $components = $garment === 'shirt' ? $shirtComponents : $pantsComponents;

            foreach (['kids', 'adults'] as $sizeGroup) {
                foreach (self::PRODUCTION_GROUP_STYLES as $style) {
                    $key = $garment.'_'.$sizeGroup.'_'.$style;
                    $quantity = (int) ($batchQuantities[$key] ?? 0);

                    if ($quantity <= 0) {
                        continue;
                    }

                    $unitTotal = $this->unitTotalForBatch($components, $sizeGroup, $style);

                    $groups[] = [
                        'key' => $key,
                        'label' => self::PRODUCTION_GROUP_BASE_LABELS[$garment.'_'.$sizeGroup]
                            .' '.self::PRODUCTION_STYLE_LABELS[$garment][$style],
                        'garment' => $garment,
                        'size_group' => $sizeGroup,
                        'style' => $style,
                        'quantity' => $quantity,
                        'unit_total' => $unitTotal,
                        'subtotal' => $unitTotal * $quantity,
                    ];
                }
            }
        }

        // The bill total follows the batches, so splitting a garment into a short
        // and a long batch cannot change what the order costs in total.
        $grandTotal = (float) array_sum(array_column($groups, 'subtotal'));

        $subtotalFor = static function (array $groups, string $garment, string $sizeGroup): float {
            $matching = array_filter(
                $groups,
                static fn (array $group): bool => $group['garment'] === $garment && $group['size_group'] === $sizeGroup,
            );

            return (float) array_sum(array_column($matching, 'subtotal'));
        };

        $shirtChildTotal = $subtotalFor($groups, 'shirt', 'kids');
        $shirtAdultTotal = $subtotalFor($groups, 'shirt', 'adults');
        $pantsChildTotal = $subtotalFor($groups, 'pants', 'kids');
        $pantsAdultTotal = $subtotalFor($groups, 'pants', 'adults');

        return [
            'shirt_type_id' => $shirtType->id ?? null,
            'pants_type_id' => $pantsType->id ?? null,
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
