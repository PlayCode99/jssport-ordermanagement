<?php

namespace Tests\Feature\Http\Controllers;

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\Production\ProductionKanbanController;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionClass;
use Tests\TestCase;

/**
 * The shirt spec table reads the placket colours inside-out: แบบสาบ, then
 * สีสาบ (ใน), then สีสาบ (นอก). The counter receipt and the production sheet
 * each build their rows from their own definition list, so both are held to
 * the same order here.
 */
class ShirtSpecRowOrderTest extends TestCase
{
    use RefreshDatabase;

    private const SPECIFICATION = [
        'screen_print_detail' => '{"schema":"spec-v2","mode":"matrix","shirt_specs":{"placket_style_id":"1","placket_outer_color_id":"1","placket_inner_color_id":"2","sleeve_cuff_id":"1","panel_style_id":"1"},"pants_specs":{}}',
    ];

    public function test_the_counter_lists_the_inner_placket_colour_before_the_outer_one(): void
    {
        $labels = $this->shirtLabels(app(DashboardController::class));

        $this->assertSame(
            ['แบบสาบ', 'สีสาบ (ใน)', 'สีสาบ (นอก)', 'ปลายแขน'],
            array_slice($labels, array_search('แบบสาบ', $labels, true), 4),
        );
    }

    public function test_the_production_sheet_lists_the_inner_placket_colour_before_the_outer_one(): void
    {
        $labels = $this->shirtLabels(app(ProductionKanbanController::class));

        $this->assertSame(
            ['แบบสาบ', 'สีสาบ (ใน)', 'สีสาบ (นอก)', 'ปลายแขน'],
            array_slice($labels, array_search('แบบสาบ', $labels, true), 4),
        );
    }

    public function test_the_panel_field_is_called_outer_placket_on_both_sides(): void
    {
        foreach ([DashboardController::class, ProductionKanbanController::class] as $controller) {
            $labels = $this->shirtLabels(app($controller));

            $this->assertContains('สาบนอก', $labels, $controller);
            $this->assertNotContains('แบบต่อ', $labels, $controller);
        }
    }

    /** @return list<string> */
    private function shirtLabels(object $controller): array
    {
        $method = (new ReflectionClass($controller))->getMethod('mapSpecificationSections');

        return array_column($method->invoke($controller, self::SPECIFICATION)['shirt'], 'label');
    }
}
