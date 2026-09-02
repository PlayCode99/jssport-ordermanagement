<?php

namespace Tests\Feature\Production;

use App\Models\CatalogItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A work sheet must keep saying what it said when it was printed. Master data
 * is editable, so an order records the names it was saved with and the catalog
 * is only consulted for orders recorded before that snapshot existed.
 */
class SpecLabelSnapshotTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @param  array<string, mixed>  $decoded
     * @return array{shirt: array<int, array{label: string, value: string}>, pants: array<int, array{label: string, value: string}>}
     */
    private function sectionsFor(array $decoded): array
    {
        $controller = app(\App\Http\Controllers\Production\ProductionKanbanController::class);
        $method = (new \ReflectionClass($controller))->getMethod('mapSpecificationSections');
        $method->setAccessible(true);

        return $method->invoke($controller, ['screen_print_detail' => json_encode($decoded, JSON_UNESCAPED_UNICODE)]);
    }

    private function fabricColourRow(array $sections): ?string
    {
        foreach ($sections['shirt'] as $row) {
            if ($row['label'] === 'สีผ้า') {
                return $row['value'];
            }
        }

        return null;
    }

    public function test_a_renamed_colour_does_not_change_an_order_saved_earlier(): void
    {
        CatalogItem::query()->updateOrCreate(
            ['storage_key' => 'jssport.shirt-fabric-colors', 'item_id' => 1],
            ['name' => 'ขาว', 'created_by' => 'system', 'active' => true],
        );

        $decoded = [
            'schema' => 'spec-v2',
            'shirt_specs' => ['fabric_color_id' => '1'],
            'spec_labels' => ['shirt' => ['fabric_color_id' => 'ขาว'], 'pants' => []],
        ];

        $this->assertSame('ขาว', $this->fabricColourRow($this->sectionsFor($decoded)));

        // The owner renames the colour in master data afterwards.
        CatalogItem::query()
            ->where('storage_key', 'jssport.shirt-fabric-colors')
            ->where('item_id', 1)
            ->update(['name' => 'ขาวนวล']);

        $this->assertSame('ขาว', $this->fabricColourRow($this->sectionsFor($decoded)));
    }

    public function test_a_deleted_colour_does_not_blank_an_order_saved_earlier(): void
    {
        $decoded = [
            'schema' => 'spec-v2',
            'shirt_specs' => ['fabric_color_id' => '9'],
            'spec_labels' => ['shirt' => ['fabric_color_id' => 'ม่วง-ขาว'], 'pants' => []],
        ];

        CatalogItem::query()->where('storage_key', 'jssport.shirt-fabric-colors')->where('item_id', 9)->delete();

        // Nothing with item_id 9 exists in the catalog at all.
        $this->assertSame('ม่วง-ขาว', $this->fabricColourRow($this->sectionsFor($decoded)));
    }

    public function test_an_order_saved_before_snapshots_still_resolves_from_the_catalog(): void
    {
        CatalogItem::query()->updateOrCreate(
            ['storage_key' => 'jssport.shirt-fabric-colors', 'item_id' => 2],
            ['name' => 'กรมท่า', 'created_by' => 'system', 'active' => true],
        );

        $decoded = [
            'schema' => 'spec-v2',
            'shirt_specs' => ['fabric_color_id' => '2'],
        ];

        $this->assertSame('กรมท่า', $this->fabricColourRow($this->sectionsFor($decoded)));
    }

    public function test_an_empty_saved_label_falls_back_rather_than_printing_blank(): void
    {
        CatalogItem::query()->updateOrCreate(
            ['storage_key' => 'jssport.shirt-fabric-colors', 'item_id' => 3],
            ['name' => 'ดำ', 'created_by' => 'system', 'active' => true],
        );

        $decoded = [
            'schema' => 'spec-v2',
            'shirt_specs' => ['fabric_color_id' => '3'],
            'spec_labels' => ['shirt' => ['fabric_color_id' => '   '], 'pants' => []],
        ];

        $this->assertSame('ดำ', $this->fabricColourRow($this->sectionsFor($decoded)));
    }
}
