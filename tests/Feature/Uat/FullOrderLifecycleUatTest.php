<?php

namespace Tests\Feature\Uat;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\CatalogItem;
use App\Models\Customer;
use App\Models\GarmentType;
use App\Models\Order;
use App\Models\OrderRouting;
use App\Models\User;
use App\Support\Orders\OrderCompletion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * End-to-end acceptance: every job type the shop runs, opened through the real
 * HTTP endpoints, walked room by room to delivery, with the money checked at
 * the end. This is the run that has to be green before a deploy.
 */
class FullOrderLifecycleUatTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Customer $customer;

    private Branch $branch;

    private GarmentType $shirtType;

    private GarmentType $pantsType;

    /** @var array<string, int> */
    private array $teams = [];

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Carbon::setTestNow(Carbon::parse('2026-09-02 09:00:00'));

        $this->owner = User::factory()->create([
            'role' => UserRole::Admin,
            'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None,
            'is_active' => true,
            'branch_id' => null,
        ]);

        $this->customer = Customer::create(['customer_code' => 'CUS-UAT', 'customer_name' => 'โรงเรียน UAT']);
        $this->branch = Branch::create(['branch_code' => 'BR-UAT', 'branch_name' => 'สาขา UAT']);

        // Labour rates: shirt 20฿/adult, pants 15฿/adult.
        $this->shirtType = GarmentType::create(['category' => 'SHIRT', 'code' => 'S-UAT', 'name' => 'เสื้อโปโล UAT', 'is_active' => true, 'display_order' => 1]);
        $this->shirtType->operations()->create(['name' => 'ตัดเย็บเสื้อ', 'child_price' => 12, 'adult_price' => 20, 'is_active' => true, 'display_order' => 1]);

        $this->pantsType = GarmentType::create(['category' => 'PANTS', 'code' => 'P-UAT', 'name' => 'กางเกง UAT', 'is_active' => true, 'display_order' => 1]);
        $this->pantsType->operations()->create(['name' => 'ตัดเย็บกางเกง', 'child_price' => 9, 'adult_price' => 15, 'is_active' => true, 'display_order' => 1]);

        $this->teams = [
            'cutting' => DB::table('cutting_teams')->insertGetId(['team_name' => 'ทีมตัด 1', 'created_at' => now(), 'updated_at' => now()]),
            'sewing' => DB::table('sewing_teams')->insertGetId(['team_name' => 'ทีมเย็บ 1', 'created_at' => now(), 'updated_at' => now()]),
            'embroidery' => DB::table('embroidery_teams')->insertGetId(['team_name' => 'ทีมปัก 1', 'created_at' => now(), 'updated_at' => now()]),
            'screen' => DB::table('screen_teams')->insertGetId(['team_name' => 'ทีมสกรีน 1', 'station_name' => 'screen', 'created_at' => now(), 'updated_at' => now()]),
            'flex' => DB::table('screen_teams')->insertGetId(['team_name' => 'ทีมเฟล็กซ์ 1', 'station_name' => 'flex', 'created_at' => now(), 'updated_at' => now()]),
            'heat_press' => DB::table('heat_press_machines')->insertGetId(['machine_name' => 'เครื่องอัด 1', 'created_at' => now(), 'updated_at' => now()]),
        ];
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function openBill(string $jobType, array $items, float $discountPercent = 0): Order
    {
        $response = $this->actingAs($this->owner)->post('/orders', [
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->customer_name,
            'branch_id' => $this->branch->id,
            'job_name' => 'UAT '.$jobType,
            'job_type' => $jobType,
            'delivery_method' => 'pickup',
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(7)->toDateTimeString(),
            'discount_percent' => $discountPercent,
            'items' => $items,
            'specification' => [
                'pattern_id' => '1',
                'fabric_id' => '1',
                'screen_print_detail' => json_encode([
                    'schema' => 'spec-v2',
                    'mode' => 'matrix',
                    'shirt_specs' => ['shirt_type_id' => (string) $this->shirtType->id, 'fabric_color_id' => '1'],
                    'pants_specs' => ['pants_type_id' => (string) $this->pantsType->id],
                    'spec_labels' => ['shirt' => ['fabric_color_id' => 'ขาว'], 'pants' => []],
                ], JSON_THROW_ON_ERROR),
            ],
        ]);

        $response->assertSessionHasNoErrors();

        return Order::query()->latest('id')->firstOrFail();
    }

    /** Walks one station from pending through to completed, as the room staff would. */
    private function runStation(Order $order, string $station): void
    {
        $extra = match ($station) {
            'cutting' => ['cutting_team_id' => $this->teams['cutting']],
            'embroidery' => ['embroidery_team_id' => $this->teams['embroidery']],
            'sewing' => ['sewing_team_id' => $this->teams['sewing']],
            'screen' => ['screen_team_id' => $this->teams['screen'], 'heat_press_machine_id' => $this->teams['heat_press']],
            'flex' => ['screen_team_id' => $this->teams['flex'], 'heat_press_machine_id' => $this->teams['heat_press']],
            'print' => ['print_machine' => 'printer_1'],
            default => [],
        };

        $this->actingAs($this->owner)
            ->post("/orders/{$order->id}/routing/advance", array_merge([
                'station_name' => $station,
                'new_status' => 'in_progress',
            ], $extra))
            ->assertSessionHasNoErrors();

        $this->actingAs($this->owner)
            ->post("/orders/{$order->id}/routing/advance", [
                'station_name' => $station,
                'new_status' => 'completed',
            ])
            ->assertSessionHasNoErrors();
    }

    /** @return array<int, string> */
    private function requiredStations(Order $order): array
    {
        return OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('is_required', true)
            ->orderBy('id')
            ->pluck('station_name')
            ->map(fn ($station): string => $station->value)
            ->all();
    }

    private function runWholeOrder(Order $order): Order
    {
        foreach ($this->requiredStations($order) as $station) {
            $this->runStation($order, $station);
        }

        return $order->fresh(['routings', 'items']);
    }

    /**
     * @return array<string, array{0: string, 1: array<int, string>}>
     */
    public static function jobTypes(): array
    {
        return [
            'ปัก' => ['ปัก', ['cutting', 'embroidery', 'sewing', 'qc', 'shipping']],
            'ซับลิเมชั่น' => ['ซับลิเมชั่น', ['cutting', 'print', 'screen', 'sewing', 'qc', 'shipping']],
            'สกรีน เฟล๊กซ์' => ['สกรีน เฟล๊กซ์', ['cutting', 'flex', 'sewing', 'qc', 'shipping']],
            'ซับลิเมชั่น + ปัก' => ['ซับลิเมชั่น + ปัก', ['cutting', 'print', 'screen', 'embroidery', 'sewing', 'qc', 'shipping']],
            'ซับลิเมชั่น + ปัก + สกรีน' => ['ซับลิเมชั่น + ปัก + สกรีน', ['cutting', 'print', 'screen', 'flex', 'embroidery', 'sewing', 'qc', 'shipping']],
            'ซับลิเมชั่น + สกรีน' => ['ซับลิเมชั่น + สกรีน', ['cutting', 'print', 'screen', 'flex', 'sewing', 'qc', 'shipping']],
            'ปัก + สกรีน เฟล๊กซ์' => ['ปัก + สกรีน เฟล๊กซ์', ['cutting', 'flex', 'embroidery', 'sewing', 'qc', 'shipping']],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('jobTypes')]
    public function test_a_job_type_runs_from_opening_the_bill_to_delivery(string $jobType, array $expectedStations): void
    {
        $order = $this->openBill($jobType, [
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 10, 'unit_price' => 200],
        ]);

        // 1. Routing matches the agreed flow for this job type.
        $this->assertSame($expectedStations, $this->requiredStations($order), "routing for {$jobType}");

        // 2. It starts open, with a timeline that has not begun.
        $this->assertFalse(OrderCompletion::isClosed($order));

        // 3. Every room does its work, in order.
        $order = $this->runWholeOrder($order);

        // 4. Every station is finished and stamped.
        foreach ($order->routings->where('is_required', true) as $routing) {
            $this->assertSame('completed', $routing->status->value, "station {$routing->station_name->value} of {$jobType}");
            $this->assertNotNull($routing->started_at, 'timeline start');
            $this->assertNotNull($routing->completed_at, 'timeline finish');
        }

        // 5. The order now counts as closed everywhere.
        $this->assertTrue(OrderCompletion::isClosed($order->fresh(['routings'])));
    }

    public function test_the_money_on_a_finished_order_is_right_end_to_end(): void
    {
        // 10 shirts @200 and 4 pants @150, less 10% => gross 2,600, net 2,340.
        $order = $this->openBill('ปัก', [
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 10, 'unit_price' => 200],
            ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 4, 'unit_price' => 150],
        ], 10);

        $this->assertSame(2600.0, (float) $order->total_amount);
        $this->assertSame(260.0, (float) $order->discount_amount);
        $this->assertSame(2340.0, (float) $order->net_amount);

        $this->runWholeOrder($order);

        $this->actingAs($this->owner)->get('/owner-dashboard')
            ->assertInertia(function (Assert $page) {
                $props = $page->toArray()['props'];

                // Revenue: net, split by what was sold, adding back up to net.
                $this->assertSame(2340.0, (float) $props['revenue']['net']);
                $this->assertSame(2600.0, (float) $props['revenue']['gross']);
                $this->assertSame(260.0, (float) $props['revenue']['discount']);
                $this->assertSame(1800.0, (float) $props['revenue']['by_garment']['shirt']);
                $this->assertSame(540.0, (float) $props['revenue']['by_garment']['pants']);
                $this->assertSame(0.0, (float) $props['revenue']['by_garment']['unspecified']);
                $this->assertEqualsWithDelta(
                    (float) $props['revenue']['net'],
                    array_sum(array_map('floatval', $props['revenue']['by_garment'])),
                    0.01,
                );

                // Expense: 10 shirts x20 = 200, 4 pants x15 = 60.
                $this->assertSame(200.0, (float) $props['expense']['shirt']);
                $this->assertSame(60.0, (float) $props['expense']['pants']);
                $this->assertSame(260.0, (float) $props['expense']['total']);

                $this->assertSame(1, (int) $props['orderCounts']['completed']);
                $this->assertSame(0, (int) $props['orderCounts']['in_progress']);
            });
    }

    public function test_all_seven_job_types_together_add_up_on_the_dashboard(): void
    {
        $closed = 0;

        foreach (array_keys(self::jobTypes()) as $index => $label) {
            [$jobType] = self::jobTypes()[$label];

            $order = $this->openBill($jobType, [
                ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 5, 'unit_price' => 100],
            ]);

            // Finish all but the last one, so both sides of the split are exercised.
            if ($index < 6) {
                $this->runWholeOrder($order);
                $closed++;
            }
        }

        $this->assertSame(7, Order::query()->count());

        $this->actingAs($this->owner)->get('/owner-dashboard')
            ->assertInertia(function (Assert $page) use ($closed) {
                $props = $page->toArray()['props'];

                $this->assertSame(7, (int) $props['orderCounts']['total']);
                $this->assertSame($closed, (int) $props['orderCounts']['completed']);
                $this->assertSame(7 - $closed, (int) $props['orderCounts']['in_progress']);

                // 6 closed orders x 5 shirts x 100 = 3,000 income.
                $this->assertSame(3000.0, (float) $props['revenue']['net']);
                $this->assertSame(3000.0, (float) $props['revenue']['by_garment']['shirt']);
                // 6 x 5 shirts x 20 labour = 600.
                $this->assertSame(600.0, (float) $props['expense']['total']);

                // Every job type appears in the breakdown, none duplicated.
                $names = array_column($props['jobTypeBreakdown'], 'job_type');
                $this->assertSame(count($names), count(array_unique($names)));
                $this->assertContains('ปัก', $names);
                $this->assertContains('ซับลิเมชั่น + สกรีน', $names);
            });
    }

    public function test_a_rejected_qc_sends_the_job_back_and_still_closes_afterwards(): void
    {
        $order = $this->openBill('ปัก', [
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 5, 'unit_price' => 100],
        ]);

        foreach (['cutting', 'embroidery', 'sewing'] as $station) {
            $this->runStation($order, $station);
        }

        // QC starts, then rejects the work.
        $this->actingAs($this->owner)->post("/orders/{$order->id}/routing/advance", [
            'station_name' => 'qc', 'new_status' => 'in_progress',
        ])->assertSessionHasNoErrors();

        $this->actingAs($this->owner)->post("/orders/{$order->id}/routing/advance", [
            'station_name' => 'qc', 'new_status' => 'rejected', 'rework_note' => 'ปักเบี้ยว ต้องแก้',
        ])->assertSessionHasNoErrors();

        $this->assertFalse(OrderCompletion::isClosed($order->fresh(['routings'])));

        // Re-inspected and passed, then shipped.
        $this->actingAs($this->owner)->post("/orders/{$order->id}/routing/advance", [
            'station_name' => 'qc', 'new_status' => 'in_progress',
        ])->assertSessionHasNoErrors();
        $this->actingAs($this->owner)->post("/orders/{$order->id}/routing/advance", [
            'station_name' => 'qc', 'new_status' => 'completed',
        ])->assertSessionHasNoErrors();
        $this->runStation($order, 'shipping');

        $this->assertTrue(OrderCompletion::isClosed($order->fresh(['routings'])));
    }

    public function test_a_finished_order_keeps_its_numbers_when_master_data_changes_afterwards(): void
    {
        $order = $this->openBill('ปัก', [
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 10, 'unit_price' => 100],
        ]);
        $this->runWholeOrder($order);

        // Labour rate doubles and the colour is renamed after the job shipped.
        DB::table('garment_operations')->where('garment_type_id', $this->shirtType->id)->update(['adult_price' => 40]);
        CatalogItem::query()->updateOrCreate(
            ['storage_key' => 'jssport.shirt-fabric-colors', 'item_id' => 1],
            ['name' => 'ขาวนวล (เปลี่ยนภายหลัง)', 'created_by' => 'system', 'active' => true],
        );

        $this->actingAs($this->owner)->get('/owner-dashboard')
            ->assertInertia(function (Assert $page) {
                // Still costed at the rate the order was taken at.
                $this->assertSame(200.0, (float) $page->toArray()['props']['expense']['total']);
                $this->assertSame(1000.0, (float) $page->toArray()['props']['revenue']['net']);
            });

        $controller = app(\App\Http\Controllers\Production\ProductionKanbanController::class);
        $method = (new \ReflectionClass($controller))->getMethod('mapSpecificationSections');
        $method->setAccessible(true);
        $sections = $method->invoke($controller, $order->fresh('specification')->specification->toArray());

        $colour = collect($sections['shirt'])->firstWhere('label', 'สีผ้า');
        $this->assertSame('ขาว', $colour['value'] ?? null, 'the work sheet keeps the colour it was printed with');
    }

    public function test_a_form_two_order_with_pants_runs_end_to_end_and_bills_both_garments(): void
    {
        // Two people, each taking a shirt and a pair of pants.
        $order = $this->openBill('ปัก', [
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 1, 'unit_price' => 250],
            ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 1, 'unit_price' => 180],
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 1, 'unit_price' => 250],
            ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'XL', 'quantity' => 1, 'unit_price' => 180],
        ]);

        $this->assertSame(860.0, (float) $order->total_amount);
        $this->assertSame(860.0, (float) $order->net_amount);

        $this->runWholeOrder($order);

        $this->actingAs($this->owner)->get('/owner-dashboard')
            ->assertInertia(function (Assert $page) {
                $props = $page->toArray()['props'];

                // Income split follows the lines that were actually sold.
                $this->assertSame(500.0, (float) $props['revenue']['by_garment']['shirt']);
                $this->assertSame(360.0, (float) $props['revenue']['by_garment']['pants']);
                $this->assertSame(0.0, (float) $props['revenue']['by_garment']['unspecified']);

                // Labour: 2 shirts x20 and 2 pants x15.
                $this->assertSame(40.0, (float) $props['expense']['shirt']);
                $this->assertSame(30.0, (float) $props['expense']['pants']);
            });
    }

    public function test_a_shirt_only_order_is_never_billed_for_pants_labour(): void
    {
        $order = $this->openBill('ปัก', [
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 6, 'unit_price' => 200],
        ]);

        $this->runWholeOrder($order);

        $this->actingAs($this->owner)->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('expense.shirt', 120)
                ->where('expense.pants', 0)
                ->where('revenue.by_garment.pants', 0)
                ->etc());
    }

    public function test_the_counter_and_the_dashboard_agree_on_what_is_finished(): void
    {
        $done = $this->openBill('ปัก', [
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 2, 'unit_price' => 100],
        ]);
        $this->runWholeOrder($done);

        $open = $this->openBill('ซับลิเมชั่น', [
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 3, 'unit_price' => 100],
        ]);

        // The counter marks the shipped one closed and leaves the other open.
        $this->actingAs($this->owner)->get('/counter')
            ->assertInertia(fn (Assert $page) => $page->where('pagination.total', 2)->etc());

        $this->assertTrue(OrderCompletion::isClosed($done->fresh(['routings'])));
        $this->assertFalse(OrderCompletion::isClosed($open->fresh(['routings'])));

        $this->actingAs($this->owner)->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page
                ->where('orderCounts.completed', 1)
                ->where('orderCounts.in_progress', 1)
                ->where('revenue.order_count', 1)
                ->etc());
    }
}
