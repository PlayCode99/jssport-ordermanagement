<?php

namespace Tests\Feature\Uat;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\GarmentType;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * How many work sheets the floor is handed, for every form the counter can
 * write a bill on.
 *
 * A sheet is one production batch: garment x size group x length. The bills are
 * opened through the real POST /orders the counter posts to, and the counts are
 * read back off the real /production/kanban page, so validation, the create
 * action, the costing snapshot and the controller all take part.
 *
 * The reference case the shop states it this way: one bill with kids and adult
 * sizes, short and long sleeves, short and long legs, written on Form 1, must
 * reach the floor as eight sheets.
 */
class ProductionSheetMatrixUatTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Customer $customer;

    private Branch $branch;

    private GarmentType $shirtType;

    private GarmentType $pantsType;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Carbon::setTestNow(Carbon::parse('2026-09-09 09:00:00'));

        $this->owner = User::factory()->create([
            'role' => UserRole::Admin,
            'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None,
            'is_active' => true,
            'branch_id' => null,
        ]);

        $this->customer = Customer::create([
            'customer_code' => 'CUS-SHEET',
            'customer_name' => 'โรงเรียนทดสอบใบงาน',
        ]);
        $this->branch = Branch::create([
            'branch_code' => 'BR-SHEET',
            'branch_name' => 'สาขาทดสอบใบงาน',
        ]);

        // Long sleeves and long legs cost more, so a sheet's labour also proves
        // the batch it was priced as.
        $this->shirtType = GarmentType::create([
            'category' => 'SHIRT', 'code' => 'S-SHEET', 'name' => 'เสื้อโปโลทดสอบ',
            'is_active' => true, 'display_order' => 1,
        ]);
        $this->shirtType->operations()->create([
            'name' => 'ตัดเย็บเสื้อ',
            'child_price' => 10, 'adult_price' => 20,
            'child_price_long' => 14, 'adult_price_long' => 26,
            'is_active' => true, 'display_order' => 1,
        ]);

        $this->pantsType = GarmentType::create([
            'category' => 'PANTS', 'code' => 'P-SHEET', 'name' => 'กางเกงทดสอบ',
            'is_active' => true, 'display_order' => 1,
        ]);
        $this->pantsType->operations()->create([
            'name' => 'ตัดเย็บกางเกง',
            'child_price' => 8, 'adult_price' => 15,
            'child_price_long' => 11, 'adult_price_long' => 19,
            'is_active' => true, 'display_order' => 1,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /**
     * The spec a bill carries when the counter filled both garments in. A bill
     * with pants on it cannot be saved without this, so every case that has
     * pants sends it.
     *
     * @return array<string, mixed>
     */
    private function bothGarmentSpecs(): array
    {
        return [
            'shirt_specs' => [
                'shirt_type_id' => (string) $this->shirtType->id,
                'fabric_id' => '1',
                'fabric_color_id' => '1',
            ],
            'pants_specs' => [
                'pants_type_id' => (string) $this->pantsType->id,
                'fabric_id' => '1',
                'fabric_color_id' => '1',
            ],
        ];
    }

    /**
     * Open a bill the way the counter does: one POST to /orders.
     *
     * @param  array<int, array<string, mixed>>  $items
     * @param  array<string, mixed>  $specExtra
     */
    private function openBill(string $mode, array $items, array $specExtra = []): Order
    {
        $this->actingAs($this->owner)
            ->post('/orders', [
                'customer_id' => $this->customer->id,
                'customer_name' => $this->customer->customer_name,
                'branch_id' => $this->branch->id,
                'job_name' => 'UAT ใบงาน '.$mode,
                'job_type' => 'งานสกรีน',
                'delivery_method' => 'pickup',
                'order_date' => now()->toDateTimeString(),
                'due_date' => now()->addDays(7)->toDateTimeString(),
                'discount_percent' => 0,
                'items' => $items,
                'specification' => [
                    'pattern_id' => '1',
                    'fabric_id' => '1',
                    'screen_print_detail' => json_encode(array_merge([
                        'schema' => 'spec-v2',
                        'mode' => $mode,
                    ], $this->bothGarmentSpecs(), $specExtra), JSON_THROW_ON_ERROR),
                ],
            ])
            ->assertSessionHasNoErrors();

        return Order::query()->latest('id')->firstOrFail();
    }

    /**
     * The costing summary the production page hands the floor, read off the
     * real page rather than rebuilt here.
     *
     * @return array<string, mixed>
     */
    private function summary(Order $order): array
    {
        return $this->actingAs($this->owner)
            ->get('/production/kanban')
            ->assertOk()
            ->viewData('page')['props']['productionPricingMap'][(string) $order->id];
    }

    /** @return list<string> */
    private function sheetKeys(Order $order): array
    {
        return array_column($this->summary($order)['groups'], 'key');
    }

    /** @return array<string, int> */
    private function sheetQuantities(Order $order): array
    {
        $sheets = [];

        foreach ($this->summary($order)['groups'] as $group) {
            $sheets[(string) $group['key']] = (int) $group['quantity'];
        }

        return $sheets;
    }

    /** @return array<string, float> */
    private function sheetSubtotals(Order $order): array
    {
        $sheets = [];

        foreach ($this->summary($order)['groups'] as $group) {
            $sheets[(string) $group['key']] = round((float) $group['subtotal'], 2);
        }

        return $sheets;
    }

    /**
     * Kids and adults, short and long sleeves, short and long legs, as four
     * sets. Used by Form 1 and Form 4, which record lengths the same way.
     *
     * @return array<int, array<string, mixed>>
     */
    private function fullLengthMatrixItems(): array
    {
        return [
            ['item_type' => 'set', 'size_group' => 'kids', 'size_label' => 'JM', 'shirt_style' => 'short', 'pants_style' => 'short', 'quantity' => 12, 'unit_price' => 300],
            ['item_type' => 'set', 'size_group' => 'kids', 'size_label' => 'JL', 'shirt_style' => 'long', 'pants_style' => 'long', 'quantity' => 8, 'unit_price' => 320],
            ['item_type' => 'set', 'size_group' => 'adults', 'size_label' => 'M', 'shirt_style' => 'short', 'pants_style' => 'short', 'quantity' => 20, 'unit_price' => 350],
            ['item_type' => 'set', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'long', 'pants_style' => 'long', 'quantity' => 10, 'unit_price' => 380],
        ];
    }

    /** @return list<string> */
    private function eightSheets(): array
    {
        return [
            'shirt_kids_short', 'shirt_kids_long',
            'shirt_adults_short', 'shirt_adults_long',
            'pants_kids_short', 'pants_kids_long',
            'pants_adults_short', 'pants_adults_long',
        ];
    }

    public function test_form_one_full_length_matrix_prints_eight_sheets(): void
    {
        $order = $this->openBill('matrix', $this->fullLengthMatrixItems());

        $this->assertSame($this->eightSheets(), $this->sheetKeys($order));

        // A set is one shirt and one pair of pants, so each row feeds two
        // sheets with the same count.
        $this->assertSame([
            'shirt_kids_short' => 12,
            'shirt_kids_long' => 8,
            'shirt_adults_short' => 20,
            'shirt_adults_long' => 10,
            'pants_kids_short' => 12,
            'pants_kids_long' => 8,
            'pants_adults_short' => 20,
            'pants_adults_long' => 10,
        ], $this->sheetQuantities($order));

        // 50 sets: 50 shirts and 50 pairs of pants across the eight sheets.
        $this->assertSame(100, array_sum($this->sheetQuantities($order)));
    }

    public function test_each_sheet_is_priced_at_its_own_length(): void
    {
        $order = $this->openBill('matrix', $this->fullLengthMatrixItems());

        // Long sleeves 14/26 against 10/20, long legs 11/19 against 8/15.
        $this->assertSame([
            'shirt_kids_short' => 120.0,   // 12 x 10
            'shirt_kids_long' => 112.0,    // 8 x 14
            'shirt_adults_short' => 400.0, // 20 x 20
            'shirt_adults_long' => 260.0,  // 10 x 26
            'pants_kids_short' => 96.0,    // 12 x 8
            'pants_kids_long' => 88.0,     // 8 x 11
            'pants_adults_short' => 300.0, // 20 x 15
            'pants_adults_long' => 190.0,  // 10 x 19
        ], $this->sheetSubtotals($order));

        $this->assertSame(1566.0, round((float) $this->summary($order)['grand_total'], 2));
    }

    public function test_form_one_in_one_length_only_prints_four_sheets(): void
    {
        $order = $this->openBill('matrix', [
            ['item_type' => 'set', 'size_group' => 'kids', 'size_label' => 'JM', 'shirt_style' => 'short', 'pants_style' => 'short', 'quantity' => 10, 'unit_price' => 300],
            ['item_type' => 'set', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'short', 'pants_style' => 'short', 'quantity' => 20, 'unit_price' => 350],
        ]);

        $this->assertSame([
            'shirt_kids_short',
            'shirt_adults_short',
            'pants_kids_short',
            'pants_adults_short',
        ], $this->sheetKeys($order));
    }

    public function test_a_shirts_only_bill_never_prints_a_pants_sheet(): void
    {
        $order = $this->openBill('matrix', [
            ['item_type' => 'separate_shirt', 'size_group' => 'adults', 'size_label' => 'M', 'shirt_style' => 'short', 'quantity' => 15, 'unit_price' => 250],
            ['item_type' => 'separate_shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'long', 'quantity' => 5, 'unit_price' => 280],
        ]);

        $this->assertSame(
            ['shirt_adults_short', 'shirt_adults_long'],
            $this->sheetKeys($order),
        );
    }

    public function test_separates_land_on_the_same_sheets_as_the_sets(): void
    {
        $order = $this->openBill('matrix', [
            ['item_type' => 'set', 'size_group' => 'adults', 'size_label' => 'M', 'shirt_style' => 'short', 'pants_style' => 'short', 'quantity' => 10, 'unit_price' => 350],
            ['item_type' => 'separate_shirt', 'size_group' => 'adults', 'size_label' => 'M', 'shirt_style' => 'short', 'quantity' => 4, 'unit_price' => 250],
            ['item_type' => 'separate_pants', 'size_group' => 'adults', 'size_label' => 'M', 'pants_style' => 'short', 'quantity' => 3, 'unit_price' => 180],
        ]);

        // Two sheets, not four: a separate shirt of the same size group and
        // length is the same batch as the set's shirt.
        $this->assertSame(
            ['shirt_adults_short', 'pants_adults_short'],
            $this->sheetKeys($order),
        );
        $this->assertSame(
            ['shirt_adults_short' => 14, 'pants_adults_short' => 13],
            $this->sheetQuantities($order),
        );
    }

    public function test_form_four_matches_form_one_sheet_for_sheet(): void
    {
        $formOne = $this->openBill('matrix', $this->fullLengthMatrixItems());
        $formFour = $this->openBill('pe_uniform', $this->fullLengthMatrixItems());

        $this->assertSame(
            $this->sheetQuantities($formOne),
            $this->sheetQuantities($formFour),
        );
        $this->assertSame(
            $this->sheetSubtotals($formOne),
            $this->sheetSubtotals($formFour),
        );
    }

    public function test_form_two_now_records_a_length_per_person(): void
    {
        $order = $this->openBill('individual', [
            ['item_type' => 'shirt', 'size_group' => 'kids', 'size_label' => 'JM', 'shirt_style' => 'short', 'quantity' => 12, 'unit_price' => 250],
            ['item_type' => 'shirt', 'size_group' => 'kids', 'size_label' => 'JL', 'shirt_style' => 'long', 'quantity' => 8, 'unit_price' => 270],
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'shirt_style' => 'short', 'quantity' => 20, 'unit_price' => 250],
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'long', 'quantity' => 10, 'unit_price' => 270],
            ['item_type' => 'pants', 'size_group' => 'kids', 'size_label' => 'JM', 'pants_style' => 'short', 'quantity' => 12, 'unit_price' => 180],
            ['item_type' => 'pants', 'size_group' => 'kids', 'size_label' => 'JL', 'pants_style' => 'long', 'quantity' => 8, 'unit_price' => 200],
            ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'M', 'pants_style' => 'short', 'quantity' => 20, 'unit_price' => 180],
            ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'L', 'pants_style' => 'long', 'quantity' => 10, 'unit_price' => 200],
        ], ['personalization_rows' => [
            ['name' => 'สมชาย', 'size' => 'M', 'number' => '9', 'shirt_style' => 'short', 'pants_style' => 'short', 'quantity' => 1, 'unit_price' => 250],
            ['name' => 'อนุชา', 'size' => 'L', 'number' => '1', 'shirt_style' => 'long', 'pants_style' => 'long', 'quantity' => 1, 'unit_price' => 270],
        ]]);

        $this->assertSame($this->eightSheets(), $this->sheetKeys($order));
        $this->assertSame(100, array_sum($this->sheetQuantities($order)));
    }

    public function test_a_form_two_bill_written_before_lengths_existed_still_prints(): void
    {
        $order = $this->openBill('individual', [
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 10, 'unit_price' => 250],
            ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 10, 'unit_price' => 180],
        ], ['personalization_rows' => [
            ['name' => 'สมชาย', 'size' => 'L', 'number' => '9', 'quantity' => 1, 'unit_price' => 250],
        ]]);

        // Never guessed into a length: an old bill lands in its own batch and
        // the floor can see it was never told.
        $this->assertSame(
            ['shirt_adults_unspecified', 'pants_adults_unspecified'],
            $this->sheetKeys($order),
        );
    }

    public function test_form_three_batches_by_garment_and_size_group(): void
    {
        $order = $this->openBill('sports_day', [
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 30, 'unit_price' => 250],
            ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 30, 'unit_price' => 180],
            ['item_type' => 'shirt', 'size_group' => 'kids', 'size_label' => 'JM', 'quantity' => 20, 'unit_price' => 230],
            ['item_type' => 'pants', 'size_group' => 'kids', 'size_label' => 'JM', 'quantity' => 20, 'unit_price' => 160],
        ], ['sports_day_groups' => [
            [
                'team_name' => 'คณะสีแดง',
                'fabric_color_id' => '1',
                'rows' => [['size_group' => 'adults', 'size_label' => 'L', 'shirt_qty' => 30, 'shirt_price' => 250, 'pants_qty' => 30, 'pants_price' => 180]],
            ],
            [
                'team_name' => 'คณะสีน้ำเงิน',
                'fabric_color_id' => '2',
                'rows' => [['size_group' => 'kids', 'size_label' => 'JM', 'shirt_qty' => 20, 'shirt_price' => 230, 'pants_qty' => 20, 'pants_price' => 160]],
            ],
        ]]);

        // The colour house is a print-time split, so costing still batches by
        // garment and size group. Lengths are not asked for on this form.
        $this->assertSame([
            'shirt_kids_unspecified',
            'shirt_adults_unspecified',
            'pants_kids_unspecified',
            'pants_adults_unspecified',
        ], $this->sheetKeys($order));
        $this->assertSame(100, array_sum($this->sheetQuantities($order)));
    }

    public function test_no_sheet_is_ever_printed_empty(): void
    {
        foreach ([
            $this->openBill('matrix', $this->fullLengthMatrixItems()),
            $this->openBill('pe_uniform', $this->fullLengthMatrixItems()),
        ] as $order) {
            foreach ($this->summary($order)['groups'] as $group) {
                $this->assertGreaterThan(
                    0,
                    (int) $group['quantity'],
                    'A sheet with nothing on it reached the floor: '.$group['key'],
                );
            }
        }
    }

    public function test_the_sheets_account_for_every_piece_on_the_bill(): void
    {
        $order = $this->openBill('matrix', $this->fullLengthMatrixItems());

        // Sets count twice — one shirt, one pair of pants — so the sheets hold
        // twice the pieces the bill lists as lines.
        $billPieces = (int) $order->items->sum('quantity');

        $this->assertSame(50, $billPieces);
        $this->assertSame($billPieces * 2, array_sum($this->sheetQuantities($order)));
    }
}
