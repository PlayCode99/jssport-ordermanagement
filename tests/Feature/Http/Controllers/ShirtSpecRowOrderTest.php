<?php

namespace Tests\Feature\Http\Controllers;

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\Production\ProductionKanbanController;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionClass;
use Tests\TestCase;

/**
 * The shirt spec table reads แบบสาบ, สีสาบ (ใน), ปลายแขน, then สีสาบ (นอก),
 * which took the place the retired สาบนอก field left behind. The counter
 * receipt and the production sheet each build their rows from their own
 * definition list, so both are held to the same order here.
 */
class ShirtSpecRowOrderTest extends TestCase
{
    use RefreshDatabase;

    private const SPECIFICATION = [
        'screen_print_detail' => '{"schema":"spec-v2","mode":"matrix","shirt_specs":{"placket_style_id":"1","placket_outer_color_id":"1","placket_inner_color_id":"2","sleeve_cuff_id":"1","panel_style_id":"1"},"pants_specs":{}}',
    ];

    public function test_the_counter_reads_the_placket_before_the_cuff_and_the_outer_colour_last(): void
    {
        $labels = $this->shirtLabels(app(DashboardController::class));

        $this->assertSame(
            ['แบบสาบ', 'สีสาบ (ใน)', 'ปลายแขน', 'สีสาบ (นอก)'],
            array_slice($labels, array_search('แบบสาบ', $labels, true), 4),
        );
    }

    public function test_the_production_sheet_reads_them_in_the_same_order(): void
    {
        $labels = $this->shirtLabels(app(ProductionKanbanController::class));

        $this->assertSame(
            ['แบบสาบ', 'สีสาบ (ใน)', 'ปลายแขน', 'สีสาบ (นอก)'],
            array_slice($labels, array_search('แบบสาบ', $labels, true), 4),
        );
    }

    public function test_the_retired_panel_field_is_shown_nowhere(): void
    {
        foreach ([DashboardController::class, ProductionKanbanController::class] as $controller) {
            $labels = $this->shirtLabels(app($controller));

            // Neither the name it was retired under nor the one before that.
            $this->assertNotContains('สาบนอก', $labels, $controller);
            $this->assertNotContains('แบบต่อ', $labels, $controller);
        }
    }

    public function test_a_bill_saved_with_the_retired_field_keeps_its_value_on_file(): void
    {
        // Hidden, never erased: the value is still in the specification, so
        // the decision can be taken back without any bill having lost it.
        $this->assertStringContainsString('"panel_style_id":"1"', self::SPECIFICATION['screen_print_detail']);
    }

    /** @return list<string> */
    private function shirtLabels(object $controller): array
    {
        $method = (new ReflectionClass($controller))->getMethod('mapSpecificationSections');

        return array_column($method->invoke($controller, self::SPECIFICATION)['shirt'], 'label');
    }
}
