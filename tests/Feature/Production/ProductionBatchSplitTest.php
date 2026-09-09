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
 * Production prints one sheet per batch, and a batch is garment x size group x
 * garment style. These cases walk the counter's flow one bill at a time and
 * check the sheet count the floor actually receives.
 */
class ProductionBatchSplitTest extends TestCase
{
    use RefreshDatabase;

    private int $sequence = 0;

    private function nextSequence(): int
    {
        return ++$this->sequence;
    }

    private function garmentType(string $category, float $childPrice, float $adultPrice, ?float $childLong = null, ?float $adultLong = null): GarmentType
    {
        $type = GarmentType::create([
            'category' => $category,
            'code' => $category.'-BATCH-'.$this->nextSequence(),
            'name' => $category.' batch type',
            'is_active' => true,
            'display_order' => 1,
        ]);

        $type->operations()->create([
            'name' => 'ตัด',
            'child_price' => $childPrice,
            'adult_price' => $adultPrice,
            'child_price_long' => $childLong,
            'adult_price_long' => $adultLong,
            'is_active' => true,
            'display_order' => 1,
        ]);

        return $type;
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function order(array $items, int $shirtTypeId, int $pantsTypeId): Order
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-BATCH-'.$this->nextSequence(),
            'customer_name' => 'Batch Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-BATCH-'.$this->nextSequence(),
            'branch_name' => 'Batch Branch',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        return (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Batch Probe',
            'job_type' => 'งานสกรีน',
            'order_date' => '2026-09-09 09:00:00',
            'due_date' => '2026-09-20 18:00:00',
            'discount_percent' => 0,
            'items' => $items,
            'specification' => [
                'screen_print_detail' => json_encode([
                    'shirt_specs' => ['shirt_type_id' => (string) $shirtTypeId],
                    'pants_specs' => ['pants_type_id' => (string) $pantsTypeId],
                ], JSON_THROW_ON_ERROR),
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
        $method->setAccessible(true);

        $garmentTypesByCategory = GarmentType::query()
            ->with(['operations' => fn ($query) => $query->where('is_active', true)->orderBy('display_order')->orderBy('id')])
            ->where('is_active', true)
            ->get()
            ->groupBy('category');

        return $method->invoke($controller, $order, $garmentTypesByCategory);
    }

    /**
     * @return list<string>
     */
    private function batchKeys(Order $order): array
    {
        return array_map(
            static fn (array $group): string => (string) $group['key'],
            $this->summary($order)['groups'] ?? [],
        );
    }

    public function test_kids_short_sleeve_shirts_alone_print_one_sheet(): void
    {
        $shirt = $this->garmentType('SHIRT', 10, 20);
        $pants = $this->garmentType('PANTS', 5, 15);

        $order = $this->order([
            ['item_type' => 'shirt', 'size_group' => 'kids', 'size_label' => 'JM', 'shirt_style' => 'short', 'quantity' => 6, 'unit_price' => 90],
            ['item_type' => 'shirt', 'size_group' => 'kids', 'size_label' => 'JL', 'shirt_style' => 'short', 'quantity' => 4, 'unit_price' => 90],
        ], $shirt->id, $pants->id);

        // Two size rows of the same batch stay one sheet — the sheet splits by
        // style, not by size.
        $this->assertSame(['shirt_kids_short'], $this->batchKeys($order));
        $this->assertSame(10, (int) $this->summary($order)['groups'][0]['quantity']);
    }

    public function test_kids_shirts_in_both_sleeve_lengths_print_two_sheets(): void
    {
        $shirt = $this->garmentType('SHIRT', 10, 20);
        $pants = $this->garmentType('PANTS', 5, 15);

        $order = $this->order([
            ['item_type' => 'shirt', 'size_group' => 'kids', 'size_label' => 'JM', 'shirt_style' => 'short', 'quantity' => 6, 'unit_price' => 90],
            ['item_type' => 'shirt', 'size_group' => 'kids', 'size_label' => 'JM', 'shirt_style' => 'long', 'quantity' => 2, 'unit_price' => 110],
        ], $shirt->id, $pants->id);

        $this->assertSame(['shirt_kids_short', 'shirt_kids_long'], $this->batchKeys($order));
    }

    public function test_the_full_form_one_bill_prints_eight_sheets(): void
    {
        $shirt = $this->garmentType('SHIRT', 10, 20);
        $pants = $this->garmentType('PANTS', 5, 15);

        // Kids and adults, both sleeve lengths and both leg lengths — the bill
        // the shop asked about.
        $items = [];

        foreach (['kids' => 'JM', 'adults' => 'L'] as $sizeGroup => $sizeLabel) {
            foreach (['short', 'long'] as $style) {
                $items[] = ['item_type' => 'shirt', 'size_group' => $sizeGroup, 'size_label' => $sizeLabel, 'shirt_style' => $style, 'quantity' => 3, 'unit_price' => 100];
                $items[] = ['item_type' => 'pants', 'size_group' => $sizeGroup, 'size_label' => $sizeLabel, 'pants_style' => $style, 'quantity' => 2, 'unit_price' => 80];
            }
        }

        $keys = $this->batchKeys($this->order($items, $shirt->id, $pants->id));

        $this->assertCount(8, $keys);
        $this->assertSame([
            'shirt_kids_short',
            'shirt_kids_long',
            'shirt_adults_short',
            'shirt_adults_long',
            'pants_kids_short',
            'pants_kids_long',
            'pants_adults_short',
            'pants_adults_long',
        ], $keys);
    }

    public function test_a_set_row_splits_into_a_shirt_batch_and_a_pants_batch_by_its_own_styles(): void
    {
        $shirt = $this->garmentType('SHIRT', 10, 20);
        $pants = $this->garmentType('PANTS', 5, 15);

        // One set row: short sleeves with long legs. The shirt half and the
        // pants half must land in different batches.
        $order = $this->order([
            ['item_type' => 'set', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'short', 'pants_style' => 'long', 'quantity' => 5, 'unit_price' => 200],
        ], $shirt->id, $pants->id);

        $this->assertSame(['shirt_adults_short', 'pants_adults_long'], $this->batchKeys($order));

        $groups = $this->summary($order)['groups'];
        $this->assertSame(5, (int) $groups[0]['quantity']);
        $this->assertSame(5, (int) $groups[1]['quantity']);
    }

    public function test_rows_saved_before_styles_existed_print_their_own_unspecified_sheet(): void
    {
        $shirt = $this->garmentType('SHIRT', 10, 20);
        $pants = $this->garmentType('PANTS', 5, 15);

        $order = $this->order([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'short', 'quantity' => 3, 'unit_price' => 100],
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 2, 'unit_price' => 100],
        ], $shirt->id, $pants->id);

        // The unrecorded row is never guessed into the short batch: the floor is
        // told to check the bill instead of cutting the wrong sleeve.
        $this->assertSame(['shirt_adults_short', 'shirt_adults_unspecified'], $this->batchKeys($order));
    }

    public function test_an_empty_batch_never_prints_a_sheet(): void
    {
        $shirt = $this->garmentType('SHIRT', 10, 20);
        $pants = $this->garmentType('PANTS', 5, 15);

        $order = $this->order([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'long', 'quantity' => 4, 'unit_price' => 100],
        ], $shirt->id, $pants->id);

        $this->assertSame(['shirt_adults_long'], $this->batchKeys($order));
        $this->assertSame(1, (int) $this->summary($order)['group_count']);
    }

    public function test_long_sleeves_are_costed_at_their_own_rate(): void
    {
        $shirt = $this->garmentType('SHIRT', 10, 20, childLong: 14, adultLong: 26);
        $pants = $this->garmentType('PANTS', 5, 15);

        $order = $this->order([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'short', 'quantity' => 10, 'unit_price' => 100],
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'long', 'quantity' => 5, 'unit_price' => 120],
        ], $shirt->id, $pants->id);

        $groups = collect($this->summary($order)['groups'])->keyBy('key');

        $this->assertSame(20.0, (float) $groups['shirt_adults_short']['unit_total']);
        $this->assertSame(26.0, (float) $groups['shirt_adults_long']['unit_total']);
        $this->assertSame(200.0, (float) $groups['shirt_adults_short']['subtotal']);
        $this->assertSame(130.0, (float) $groups['shirt_adults_long']['subtotal']);
        $this->assertSame(330.0, (float) $this->summary($order)['grand_total']);
    }

    public function test_an_operation_without_a_long_rate_costs_the_same_either_way(): void
    {
        // Most operations do not change with sleeve length, so the shop leaves
        // the long price empty rather than typing the same number twice.
        $shirt = $this->garmentType('SHIRT', 10, 20);
        $pants = $this->garmentType('PANTS', 5, 15);

        $order = $this->order([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'long', 'quantity' => 5, 'unit_price' => 120],
        ], $shirt->id, $pants->id);

        $groups = collect($this->summary($order)['groups'])->keyBy('key');

        $this->assertSame(20.0, (float) $groups['shirt_adults_long']['unit_total']);
    }

    public function test_splitting_a_batch_never_changes_what_the_bill_costs(): void
    {
        $shirt = $this->garmentType('SHIRT', 10, 20);
        $pants = $this->garmentType('PANTS', 5, 15);

        $single = $this->summary($this->order([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'short', 'quantity' => 10, 'unit_price' => 100],
        ], $shirt->id, $pants->id));

        // The same ten shirts, half of them long sleeved, with no long rate set.
        $split = $this->summary($this->order([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'short', 'quantity' => 5, 'unit_price' => 100],
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'long', 'quantity' => 5, 'unit_price' => 100],
        ], $shirt->id, $pants->id));

        $this->assertSame(1, (int) $single['group_count']);
        $this->assertSame(2, (int) $split['group_count']);
        $this->assertSame((float) $single['grand_total'], (float) $split['grand_total']);
        $this->assertSame((float) $single['adult_total'], (float) $split['adult_total']);
    }

    public function test_a_booked_order_keeps_the_rate_it_was_taken_at(): void
    {
        $shirt = $this->garmentType('SHIRT', 10, 20);
        $pants = $this->garmentType('PANTS', 5, 15);

        $order = $this->order([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'long', 'quantity' => 5, 'unit_price' => 120],
        ], $shirt->id, $pants->id);

        // A snapshot from before long rates existed carries no long price at all.
        $order->forceFill([
            'production_rate_snapshot' => [
                'captured_at' => '2026-08-01T09:00:00+07:00',
                'shirt_type_id' => $shirt->id,
                'pants_type_id' => $pants->id,
                'shirt_type_name' => $shirt->name,
                'pants_type_name' => $pants->name,
                'components' => [['name' => 'ตัด', 'child_price' => 9.0, 'adult_price' => 18.0]],
                'pants_components' => [],
            ],
        ])->save();

        $shirt->operations()->update(['adult_price' => 99, 'adult_price_long' => 150]);

        $groups = collect($this->summary($order->fresh())['groups'])->keyBy('key');

        $this->assertSame(18.0, (float) $groups['shirt_adults_long']['unit_total']);
        $this->assertSame(90.0, (float) $groups['shirt_adults_long']['subtotal']);
    }
}
