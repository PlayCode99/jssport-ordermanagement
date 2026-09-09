<?php

namespace Tests\Feature\Production;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Http\Controllers\Production\ProductionKanbanController;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\GarmentType;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionClass;
use Tests\TestCase;

/**
 * The order form no longer asks for แบบกางเกง, so bills reach production with
 * no pants type recorded and the costing has to resolve one on its own. It must
 * land on a type that is actually priced: charging zero for a whole bill's
 * labour is worse than any wrong-but-visible number.
 */
class PantsTypeFallbackTest extends TestCase
{
    use RefreshDatabase;

    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();

        // These cases decide which type wins, so start from a clean catalog
        // instead of on top of the seeded one.
        GarmentType::query()->update(['is_active' => false]);
    }

    private function pantsType(string $name, ?float $price, int $displayOrder): GarmentType
    {
        $type = GarmentType::create([
            'category' => 'PANTS',
            'code' => 'PANTS-FB-'.(++$this->sequence),
            'name' => $name,
            'is_active' => true,
            'display_order' => $displayOrder,
        ]);

        if ($price !== null) {
            $type->operations()->create([
                'name' => 'ตัด',
                'child_price' => $price,
                'adult_price' => $price,
                'is_active' => true,
                'display_order' => 1,
            ]);
        }

        return $type;
    }

    private function orderWithoutPantsType(): Order
    {
        $customer = Customer::create(['customer_code' => 'CUS-FB-'.(++$this->sequence), 'customer_name' => 'x']);
        $branch = Branch::create(['branch_code' => 'BR-FB-'.(++$this->sequence), 'branch_name' => 'x']);
        $creator = User::factory()->create(['role' => UserRole::Sales, 'station_department' => StationDepartment::None]);

        return (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'no pants type',
            'job_type' => 'งานสกรีน',
            'order_date' => '2026-09-09 09:00:00',
            'due_date' => '2026-09-20 18:00:00',
            'discount_percent' => 0,
            'items' => [
                ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'L', 'pants_style' => 'long', 'quantity' => 4, 'unit_price' => 80],
            ],
            // No pants_type_id at all, which is what the form now sends.
            'specification' => ['screen_print_detail' => json_encode([
                'pants_specs' => ['leg_style_id' => '1'],
            ], JSON_THROW_ON_ERROR)],
        ], $creator->id);
    }

    /**
     * @return array<string, mixed>
     */
    private function summary(Order $order): array
    {
        $controller = app(ProductionKanbanController::class);
        $method = (new ReflectionClass($controller))->getMethod('buildProductionPricingSummary');

        return $method->invoke($controller, $order, GarmentType::query()
            ->with(['operations' => fn ($query) => $query->where('is_active', true)])
            ->where('is_active', true)
            ->orderBy('display_order')
            ->orderBy('id')
            ->get()
            ->groupBy(fn (GarmentType $type): string => $type->category->value));
    }

    public function test_a_bill_without_a_pants_type_still_costs_its_pants(): void
    {
        $this->pantsType('กางเกง', 12.0, 1);

        $summary = $this->summary($this->orderWithoutPantsType());

        $this->assertSame('กางเกง', $summary['pants_type_name']);
        $this->assertSame(48.0, (float) $summary['grand_total']);
    }

    public function test_an_unpriced_type_is_skipped_in_favour_of_a_priced_one(): void
    {
        // The unpriced one sorts first. Taking it literally used to cost the
        // whole bill nothing at all.
        $this->pantsType('กางเกงที่ยังไม่ตั้งราคา', null, 1);
        $this->pantsType('กางเกง', 12.0, 2);

        $summary = $this->summary($this->orderWithoutPantsType());

        $this->assertSame('กางเกง', $summary['pants_type_name']);
        $this->assertSame(48.0, (float) $summary['grand_total']);
    }

    public function test_costing_still_reports_a_type_when_nothing_is_priced_yet(): void
    {
        // A shop that has not entered any rates gets zero, which is the honest
        // answer, but the sheet must still name the type it used.
        $this->pantsType('กางเกง', null, 1);

        $summary = $this->summary($this->orderWithoutPantsType());

        $this->assertSame('กางเกง', $summary['pants_type_name']);
        $this->assertSame(0.0, (float) $summary['grand_total']);
    }
}
