<?php

namespace Tests\Feature\Production;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Http\Controllers\Production\ProductionKanbanController;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\GarmentStyle;
use App\Models\GarmentType;
use App\Models\Order;
use App\Models\User;
use App\Support\Orders\GarmentStyles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionClass;
use Tests\TestCase;

/**
 * The lengths are the shop's own list, so a bill can be sold at a length this
 * code has never heard of. Production then has to name that sheet.
 *
 * It did not: the sheet's heading was built out of a table with แขนสั้น, แขนยาว
 * and แขนกุด written into it, so the first bill sold at a three-quarter sleeve
 * took ห้องตรวจสอบ down with an undefined key. Every suite was green at the
 * time, because none of them sold a bill at a length the shop had added.
 */
class AddedGarmentLengthSheetTest extends TestCase
{
    use RefreshDatabase;

    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();

        GarmentStyles::flushCache();

        // The shop starts selling a three-quarter sleeve this morning.
        GarmentStyle::create([
            'category' => 'SHIRT',
            'code' => 'three_quarter',
            'name' => 'แขนสามส่วน',
            'display_order' => 4,
            'is_active' => true,
        ]);

        GarmentStyles::flushCache();
    }

    private function billSoldAtThreeQuarterSleeves(): Order
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-34-'.(++$this->sequence),
            'customer_name' => 'ลูกค้าทดสอบ',
        ]);
        $branch = Branch::create([
            'branch_code' => 'BR-34-'.(++$this->sequence),
            'branch_name' => 'สาขาทดสอบ',
        ]);
        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        return (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'เสื้อแขนสามส่วน',
            'job_type' => 'งานสกรีน',
            'order_date' => '2026-11-25 09:00:00',
            'due_date' => '2026-12-05 18:00:00',
            'discount_percent' => 0,
            'items' => [
                [
                    'item_type' => 'separate_shirt',
                    'size_group' => 'kids',
                    'size_tier' => 'kids',
                    'size_label' => 'JM',
                    'shirt_style' => 'three_quarter',
                    'quantity' => 6,
                    'unit_price' => 120,
                ],
            ],
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

    public function test_the_length_the_bill_was_sold_at_reaches_the_order_line(): void
    {
        // If it never reaches the line there is no sheet to name, and the rest
        // of this file would pass for the wrong reason.
        $this->assertSame(
            'three_quarter',
            $this->billSoldAtThreeQuarterSleeves()->items->first()->shirt_style,
        );
    }

    public function test_the_sheet_is_named_after_the_length_the_shop_added(): void
    {
        $summary = $this->summary($this->billSoldAtThreeQuarterSleeves());

        $labels = collect($summary['groups'] ?? [])->pluck('label')->all();

        // The heading the floor reads off the sheet. 'ไม่ระบุแขน' here would
        // mean the costing lost the length the bill was sold at.
        $this->assertContains('เสื้อไซต์เด็ก แขนสามส่วน', $labels);
    }

    public function test_the_sheet_keeps_its_own_key_rather_than_folding_into_another(): void
    {
        $summary = $this->summary($this->billSoldAtThreeQuarterSleeves());

        $keys = collect($summary['groups'] ?? [])->pluck('key')->all();

        $this->assertContains('shirt_kids_three_quarter', $keys);
        $this->assertNotContains('shirt_kids_short', $keys);
    }

    public function test_a_sheet_whose_bill_recorded_no_length_still_says_so(): void
    {
        // Bills written before the columns existed carry none, and the sheet
        // has to say that rather than name a cut nobody chose.
        $this->assertSame('ไม่ระบุแขน', GarmentStyles::label('shirt', null));
        $this->assertSame('ไม่ระบุขา', GarmentStyles::label('pants', ''));
        $this->assertSame('แขนสามส่วน', GarmentStyles::label('shirt', 'three_quarter'));
    }
}
