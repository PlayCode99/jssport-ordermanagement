<?php

namespace Tests\Feature\Production;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\AccessRole;
use App\Enums\SizeTier;
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
 * A bill keeps two size axes that used to be one.
 *
 * The TIER is how the floor cuts and sews, and ประถม - มัธยมต้น is a tier of its
 * own: it has its own pattern, so it gets its own sheet, its own spec and its
 * own artwork. The PRICING GROUP is how labour is costed, and the shop keeps
 * two rates, so ประถม - มัธยมต้น is charged as a child.
 *
 * Every test here holds one of those two apart from the other. If they ever
 * collapse back together, a ประถม batch either loses its sheet or asks for a
 * price nobody has set.
 */
class SizeTierBatchingTest extends TestCase
{
    use RefreshDatabase;

    private GarmentType $shirtType;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->shirtType = GarmentType::create([
            'category' => 'SHIRT', 'code' => 'S-TIER', 'name' => 'เสื้อโปโล',
            'is_active' => true, 'display_order' => 1,
        ]);
        $this->shirtType->operations()->create([
            'name' => 'ตัดเย็บ', 'child_price' => 10, 'adult_price' => 25,
            'is_active' => true, 'display_order' => 1,
        ]);

        $this->owner = User::factory()->create([
            'role' => UserRole::Admin, 'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None, 'is_active' => true,
            'branch_id' => null,
        ]);
    }

    /**
     * @param  list<array<string, mixed>>  $items
     */
    private function makeOrder(array $items): Order
    {
        $customer = Customer::firstOrCreate(['customer_code' => 'CUS-TIER'], ['customer_name' => 'Tier']);
        $branch = Branch::firstOrCreate(['branch_code' => 'BR-TIER'], ['branch_name' => 'Tier']);

        $order = (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'tier probe',
            'job_type' => 'ปัก',
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(3)->toDateTimeString(),
            'discount_percent' => 0,
            'items' => $items,
            'specification' => [
                'screen_print_detail' => json_encode([
                    'shirt_specs' => ['shirt_type_id' => (string) $this->shirtType->id],
                ], JSON_THROW_ON_ERROR),
            ],
        ], $this->owner->id);

        return Order::query()->findOrFail($order->id);
    }

    /**
     * @return array<string, mixed>
     */
    private function line(string $sizeGroup, ?string $sizeTier, string $sizeLabel, int $quantity = 1): array
    {
        return array_filter([
            'item_type' => 'separate_shirt',
            'size_group' => $sizeGroup,
            'size_tier' => $sizeTier,
            'size_label' => $sizeLabel,
            'shirt_style' => 'short',
            'quantity' => $quantity,
            'unit_price' => 100,
        ], static fn (mixed $value): bool => $value !== null);
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

    public function test_a_junior_line_is_cut_on_a_sheet_of_its_own(): void
    {
        $order = $this->makeOrder([
            $this->line('kids', 'kids', 'JS', 4),
            $this->line('kids', 'junior', 'S', 6),
        ]);

        $groups = $this->groupsByKey($order);

        // Same garment, same sleeve, same rate — and still two sheets, because
        // the two are cut to different patterns.
        $this->assertArrayHasKey('shirt_kids_short', $groups);
        $this->assertArrayHasKey('shirt_junior_short', $groups);
        $this->assertSame(4, $groups['shirt_kids_short']['quantity']);
        $this->assertSame(6, $groups['shirt_junior_short']['quantity']);
    }

    public function test_a_junior_sheet_is_named_so_the_floor_can_read_it(): void
    {
        $order = $this->makeOrder([$this->line('kids', 'junior', 'S', 3)]);

        $this->assertSame(
            'เสื้อไซต์ประถม - มัธยมต้น แขนสั้น',
            $this->groupsByKey($order)['shirt_junior_short']['label'],
        );
    }

    public function test_a_junior_garment_is_costed_at_the_childs_rate(): void
    {
        $order = $this->makeOrder([
            $this->line('kids', 'kids', 'JS', 1),
            $this->line('kids', 'junior', 'S', 1),
            $this->line('adults', 'adults', 'M', 1),
        ]);

        $groups = $this->groupsByKey($order);

        // 10 is the child's rate and 25 the adult's. ประถม takes the child's.
        $this->assertSame(10.0, $groups['shirt_kids_short']['unit_total']);
        $this->assertSame(10.0, $groups['shirt_junior_short']['unit_total']);
        $this->assertSame(25.0, $groups['shirt_adults_short']['unit_total']);
    }

    public function test_a_junior_batch_reports_both_its_sheet_and_its_rate(): void
    {
        $order = $this->makeOrder([$this->line('kids', 'junior', 'S', 1)]);

        $group = $this->groupsByKey($order)['shirt_junior_short'];

        $this->assertSame('junior', $group['size_tier'], 'the sheet it prints on');
        $this->assertSame('kids', $group['size_group'], 'the rate it is billed at');
    }

    public function test_the_childs_money_counts_junior_and_the_adults_does_not(): void
    {
        $order = $this->makeOrder([
            $this->line('kids', 'kids', 'JS', 2),
            $this->line('kids', 'junior', 'S', 3),
            $this->line('adults', 'adults', 'M', 4),
        ]);

        $summary = $this->summary($order);

        // 5 children's shirts at 10 and 4 adults' at 25.
        $this->assertSame(50.0, $summary['child_total']);
        $this->assertSame(100.0, $summary['adult_total']);
        $this->assertSame(5, $summary['shirt_child_quantity']);
        $this->assertSame(4, $summary['shirt_adult_quantity']);
    }

    public function test_splitting_a_tier_off_does_not_change_what_the_order_costs(): void
    {
        $together = $this->makeOrder([$this->line('kids', 'kids', 'JS', 10)]);
        $apart = $this->makeOrder([
            $this->line('kids', 'kids', 'JS', 4),
            $this->line('kids', 'junior', 'S', 6),
        ]);

        $this->assertSame(
            $this->summary($together)['grand_total'],
            $this->summary($apart)['grand_total'],
        );
    }

    public function test_a_line_saved_before_tiers_existed_keeps_the_sheet_it_was_cut_on(): void
    {
        $order = $this->makeOrder([$this->line('kids', null, 'JS', 5)]);

        // Nothing named a tier, so the rate it was billed under is the tier it
        // was cut at, and the bill batches exactly as it always did.
        DB::table('order_items')->where('order_id', $order->id)->update(['size_tier' => null]);

        $groups = $this->groupsByKey($order->fresh());

        $this->assertArrayHasKey('shirt_kids_short', $groups);
        $this->assertArrayNotHasKey('shirt_junior_short', $groups);
        $this->assertSame(5, $groups['shirt_kids_short']['quantity']);
    }

    public function test_an_oversize_line_is_still_an_adult(): void
    {
        $order = $this->makeOrder([$this->line('oversize', null, '5XL', 2)]);

        $this->assertArrayHasKey('shirt_adults_short', $this->groupsByKey($order));
    }

    public function test_artwork_can_be_pinned_to_a_junior_sheet(): void
    {
        $this->assertSame(
            'shirt_junior_sleeveless',
            Order::normalizeArtworkBatch('shirt_junior_sleeveless', 'shirt_artwork'),
        );
        $this->assertSame(
            'pants_junior_long',
            Order::normalizeArtworkBatch('pants_junior_long', 'pants_artwork'),
        );

        // Trousers are never sleeveless, tier or no tier.
        $this->assertNull(Order::normalizeArtworkBatch('pants_junior_sleeveless', 'pants_artwork'));
    }

    public function test_a_bill_may_not_invent_a_tier(): void
    {
        $customer = Customer::firstOrCreate(['customer_code' => 'CUS-TIER'], ['customer_name' => 'Tier']);
        $branch = Branch::firstOrCreate(['branch_code' => 'BR-TIER'], ['branch_name' => 'Tier']);

        $this->actingAs($this->owner)
            ->post('/orders', [
                'customer_id' => $customer->id,
                'branch_id' => $branch->id,
                'job_name' => 'tier probe',
                'job_type' => 'ปัก',
                'order_date' => now()->toDateTimeString(),
                'due_date' => now()->addDays(3)->toDateTimeString(),
                'discount_percent' => 0,
                'items' => [$this->line('kids', 'teenagers', 'S', 1)],
            ])
            ->assertSessionHasErrors('items.0.size_tier');
    }

    public function test_the_tiers_the_floor_knows_are_the_tiers_a_bill_can_name(): void
    {
        $this->assertSame(['kids', 'junior', 'adults'], SizeTier::values());
        $this->assertSame(SizeTier::Kids, SizeTier::Junior->pricingGroup());
        $this->assertSame(SizeTier::Adults, SizeTier::Adults->pricingGroup());
    }
}
