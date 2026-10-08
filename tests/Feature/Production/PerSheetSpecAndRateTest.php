<?php

namespace Tests\Feature\Production;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Http\Controllers\Production\ProductionKanbanController;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\GarmentType;
use App\Models\Order;
use App\Models\User;
use App\Support\Production\ProductionRateSnapshotBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A sheet is one garment, cut at one size tier in one length — and a bill now
 * names a garment type per sheet. The same polo cut long and cut short is two
 * things to make: two sets of sewing instructions, and two rate cards. So each
 * sheet prints its own spec and is costed from its own card.
 *
 * A bill written before specs were split names one pair for the whole order.
 * Every sheet of such a bill falls back to that pair, because that single spec
 * is what the shop actually sewed it from.
 */
class PerSheetSpecAndRateTest extends TestCase
{
    use RefreshDatabase;

    private GarmentType $shortType;

    private GarmentType $longType;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->shortType = GarmentType::create([
            'category' => 'SHIRT', 'code' => 'S-SHORT', 'name' => 'โปโลแขนสั้น',
            'style' => 'short', 'is_active' => true, 'display_order' => 1,
        ]);
        $this->shortType->operations()->create([
            'name' => 'ตัดเย็บแขนสั้น', 'child_price' => 10, 'adult_price' => 20,
            'is_active' => true, 'display_order' => 1,
        ]);

        $this->longType = GarmentType::create([
            'category' => 'SHIRT', 'code' => 'S-LONG', 'name' => 'โปโลแขนยาว',
            'style' => 'long', 'is_active' => true, 'display_order' => 2,
        ]);
        $this->longType->operations()->create([
            'name' => 'ตัดเย็บแขนยาว', 'child_price' => 30, 'adult_price' => 45,
            'is_active' => true, 'display_order' => 1,
        ]);

        $this->owner = User::factory()->create([
            'role' => UserRole::Admin, 'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None, 'is_active' => true,
            'branch_id' => null,
        ]);
    }

    /**
     * A bill selling the same shirt short and long, each sheet naming its own
     * type and its own screen text.
     */
    private function makeSplitBill(): Order
    {
        $customer = Customer::firstOrCreate(['customer_code' => 'CUS-SHEET'], ['customer_name' => 'Sheet']);
        $branch = Branch::firstOrCreate(['branch_code' => 'BR-SHEET'], ['branch_name' => 'Sheet']);

        $order = (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'per sheet',
            'job_type' => 'ปัก',
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(3)->toDateTimeString(),
            'discount_percent' => 0,
            'items' => [
                [
                    'item_type' => 'separate_shirt', 'size_group' => 'adults',
                    'size_tier' => 'adults', 'size_label' => 'M',
                    'shirt_style' => 'short', 'quantity' => 2, 'unit_price' => 100,
                ],
                [
                    'item_type' => 'separate_shirt', 'size_group' => 'adults',
                    'size_tier' => 'adults', 'size_label' => 'L',
                    'shirt_style' => 'long', 'quantity' => 3, 'unit_price' => 150,
                ],
            ],
            'specification' => [
                'screen_print_detail' => json_encode([
                    'schema' => 'spec-v3',
                    'mode' => 'matrix',
                    'garment_specs' => [
                        'shirt_adults_short' => [
                            'shirt_type_id' => (string) $this->shortType->id,
                            'screen_text' => 'ลายแขนสั้น',
                        ],
                        'shirt_adults_long' => [
                            'shirt_type_id' => (string) $this->longType->id,
                            'screen_text' => 'ลายแขนยาว',
                        ],
                    ],
                    'shirt_specs' => ['shirt_type_id' => (string) $this->shortType->id],
                ], JSON_THROW_ON_ERROR),
            ],
        ], $this->owner->id);

        return Order::query()->findOrFail($order->id);
    }

    /**
     * @return array<string, mixed>
     */
    private function summary(Order $order): array
    {
        $controller = app(ProductionKanbanController::class);
        $method = (new \ReflectionClass($controller))->getMethod('buildProductionPricingSummary');
        $method->setAccessible(true);

        $types = app(ProductionRateSnapshotBuilder::class)->activeGarmentTypes();

        return (array) $method->invoke($controller, $order->fresh(['items', 'specification']), $types);
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function groupsByKey(Order $order): array
    {
        $groups = [];

        foreach ($this->summary($order)['groups'] ?? [] as $group) {
            $groups[$group['key']] = $group;
        }

        return $groups;
    }

    /**
     * @return array<string, mixed>
     */
    private function specSections(Order $order): array
    {
        $controller = app(ProductionKanbanController::class);
        $method = (new \ReflectionClass($controller))->getMethod('mapSpecificationSections');
        $method->setAccessible(true);

        return (array) $method->invoke($controller, $order->fresh('specification')->specification?->toArray() ?? []);
    }

    public function test_each_sheet_is_costed_from_its_own_rate_card(): void
    {
        $groups = $this->groupsByKey($this->makeSplitBill());

        // 20 an adult short-sleeve shirt, 45 a long one — two cards, two rates.
        $this->assertSame(20.0, $groups['shirt_adults_short']['unit_total']);
        $this->assertSame(45.0, $groups['shirt_adults_long']['unit_total']);
    }

    public function test_each_sheet_names_what_it_is_making(): void
    {
        $groups = $this->groupsByKey($this->makeSplitBill());

        $this->assertSame('โปโลแขนสั้น', $groups['shirt_adults_short']['garment_type_name']);
        $this->assertSame('โปโลแขนยาว', $groups['shirt_adults_long']['garment_type_name']);
    }

    public function test_each_sheet_lists_only_the_steps_it_is_sewn_from(): void
    {
        $groups = $this->groupsByKey($this->makeSplitBill());

        $this->assertSame(
            ['ตัดเย็บแขนสั้น'],
            array_column($groups['shirt_adults_short']['components'], 'name'),
        );
        $this->assertSame(
            ['ตัดเย็บแขนยาว'],
            array_column($groups['shirt_adults_long']['components'], 'name'),
        );
    }

    public function test_the_bill_total_is_the_sheets_added_up(): void
    {
        // 2 short at 20 plus 3 long at 45.
        $this->assertSame(175.0, $this->summary($this->makeSplitBill())['grand_total']);
    }

    public function test_changing_a_rate_afterwards_leaves_each_sheet_where_it_was(): void
    {
        $order = $this->makeSplitBill();

        DB::table('garment_operations')
            ->where('garment_type_id', $this->longType->id)
            ->update(['adult_price' => 999]);

        $groups = $this->groupsByKey($order->fresh());

        $this->assertSame(45.0, $groups['shirt_adults_long']['unit_total']);
    }

    public function test_each_sheet_prints_its_own_spec(): void
    {
        $sections = $this->specSections($this->makeSplitBill());

        $textOf = function (string $key) use ($sections): ?string {
            foreach ($sections['batches'][$key] ?? [] as $row) {
                if ($row['label'] === 'ข้อความสกรีน') {
                    return $row['value'];
                }
            }

            return null;
        };

        $this->assertSame('ลายแขนสั้น', $textOf('shirt_adults_short'));
        $this->assertSame('ลายแขนยาว', $textOf('shirt_adults_long'));
    }

    /**
     * The guard on every bill on file: one spec for the whole order, printed
     * on every sheet, exactly as the floor has always read it.
     */
    public function test_an_older_bill_gives_every_sheet_the_one_spec_it_was_sewn_from(): void
    {
        $order = $this->makeSplitBill();

        DB::table('order_specifications')
            ->where('order_id', $order->id)
            ->update(['screen_print_detail' => json_encode([
                'schema' => 'spec-v2',
                'mode' => 'matrix',
                'shirt_specs' => [
                    'shirt_type_id' => (string) $this->shortType->id,
                    'screen_text' => 'ลายเดียวทั้งบิล',
                ],
            ], JSON_THROW_ON_ERROR)]);
        DB::table('orders')->where('id', $order->id)->update(['production_rate_snapshot' => null]);

        $sections = $this->specSections($order->fresh());

        // No sheet carries a spec of its own...
        $this->assertSame([], $sections['batches']);
        // ...and the single one is there for every sheet to fall back to.
        $this->assertContains(
            ['label' => 'ข้อความสกรีน', 'value' => 'ลายเดียวทั้งบิล'],
            $sections['shirt'],
        );

        // Both sheets are then costed from that one garment's card.
        $groups = $this->groupsByKey($order->fresh());
        $this->assertSame(20.0, $groups['shirt_adults_short']['unit_total']);
        $this->assertSame(20.0, $groups['shirt_adults_long']['unit_total']);
    }
}
