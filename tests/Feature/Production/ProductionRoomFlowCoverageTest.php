<?php

declare(strict_types=1);

namespace Tests\Feature\Production;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Http\Controllers\Production\ProductionKanbanController;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\CuttingTeam;
use App\Models\EmbroideryTeam;
use App\Models\GarmentType;
use App\Models\HeatPressMachine;
use App\Models\Order;
use App\Models\OrderRouting;
use App\Models\ScreenTeam;
use App\Models\SewingTeam;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductionRoomFlowCoverageTest extends TestCase
{
    use RefreshDatabase;

    public function test_cutting_embroidery_sewing_flow_handles_assign_rework_complete_and_forward(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $cuttingTeam = CuttingTeam::create([
            'team_name' => 'ทีมตัด A',
            'is_active' => true,
        ]);

        $embroideryTeam = EmbroideryTeam::create([
            'team_name' => 'ทีมปัก A',
            'is_active' => true,
        ]);

        $sewingTeam = SewingTeam::create([
            'team_name' => 'ทีมเย็บ A',
            'is_active' => true,
        ]);

        $order = $this->createOrderWithJobType('งานปัก');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'cutting',
                'new_status' => 'in_progress',
                'cutting_team_id' => $cuttingTeam->id,
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'cutting', 'in_progress', [
            'cutting_team_id' => $cuttingTeam->id,
        ]);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'cutting',
                'new_status' => 'rejected',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['rework_note']);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'cutting',
                'new_status' => 'rejected',
                'rework_note' => 'เจองานคลาดเคลื่อนที่แพทเทิร์น',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'cutting', 'rejected', [
            'rework_note' => 'เจองานคลาดเคลื่อนที่แพทเทิร์น',
        ]);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'cutting',
                'new_status' => 'in_progress',
                'cutting_team_id' => $cuttingTeam->id,
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'cutting',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'cutting', 'completed');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'embroidery',
                'new_status' => 'in_progress',
                'embroidery_team_id' => $embroideryTeam->id,
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'embroidery', 'in_progress', [
            'embroidery_team_id' => $embroideryTeam->id,
        ]);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'embroidery',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'embroidery', 'completed');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'sewing',
                'new_status' => 'in_progress',
                'sewing_team_id' => $sewingTeam->id,
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'sewing', 'in_progress', [
            'sewing_team_id' => $sewingTeam->id,
        ]);
    }

    public function test_screen_flex_flow_handles_machine_team_rework_and_complete_safely(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $screenTeam = ScreenTeam::create([
            'team_name' => 'ทีมสกรีน A',
            'station_name' => 'screen',
            'is_active' => true,
        ]);

        $flexTeam = ScreenTeam::create([
            'team_name' => 'ทีมเฟล็ก A',
            'station_name' => 'flex',
            'is_active' => true,
        ]);

        $machine = HeatPressMachine::create([
            'machine_name' => 'HEAT-A',
            'is_active' => true,
        ]);

        $order = $this->createOrderWithJobType('งานซับลิเมชั่น+สกรีน');
        $this->markStationCompleted($order, 'cutting');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'flex',
                'new_status' => 'completed',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['station']);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'print',
                'new_status' => 'in_progress',
                'print_machine' => 'printer_1',
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'print',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'screen',
                'new_status' => 'in_progress',
                'screen_team_id' => $screenTeam->id,
                'heat_press_machine_id' => $machine->id,
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'screen', 'in_progress', [
            'screen_team_id' => $screenTeam->id,
            'heat_press_machine_id' => $machine->id,
        ]);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'screen',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'screen', 'completed');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'flex',
                'new_status' => 'in_progress',
                'screen_team_id' => $flexTeam->id,
                'heat_press_machine_id' => $machine->id,
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'flex', 'in_progress', [
            'screen_team_id' => $flexTeam->id,
            'heat_press_machine_id' => $machine->id,
        ]);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'flex',
                'new_status' => 'rejected',
                'rework_note' => 'งานเฟล็กสีไม่ตรงแบบ',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'flex', 'rejected', [
            'rework_note' => 'งานเฟล็กสีไม่ตรงแบบ',
        ]);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'flex',
                'new_status' => 'in_progress',
                'screen_team_id' => $flexTeam->id,
                'heat_press_machine_id' => $machine->id,
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'flex',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'flex', 'completed');
    }

    public function test_pants_pricing_summary_uses_the_pants_type_from_the_order_specification(): void
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-PANTS-'.$this->nextSequence(),
            'customer_name' => 'Pants Pricing Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-PANTS-'.$this->nextSequence(),
            'branch_name' => 'Pants Pricing Branch',
        ]);

        $pantsType = GarmentType::create([
            'category' => 'PANTS',
            'code' => 'PANTS-TEST-'.$this->nextSequence(),
            'name' => 'ทดสอบกางเกง',
            'is_active' => true,
            'display_order' => 1,
        ]);

        $pantsType->operations()->createMany([
            ['name' => 'ตัด', 'child_price' => 10, 'adult_price' => 30, 'is_active' => true, 'display_order' => 1],
            ['name' => 'เย็บ', 'child_price' => 10, 'adult_price' => 30, 'is_active' => true, 'display_order' => 2],
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        $order = (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'ทดสอบกางเกง',
            'job_type' => 'งานสกรีน',
            'order_date' => '2026-07-11 09:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'items' => [
                ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 10, 'unit_price' => 30],
                ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 10, 'unit_price' => 30],
                ['item_type' => 'pants', 'size_group' => 'adults', 'size_label' => 'XL', 'quantity' => 10, 'unit_price' => 30],
            ],
            'specification' => [
                'screen_print_detail' => json_encode([
                    'shirt_specs' => ['shirt_type_id' => '9'],
                    'pants_specs' => ['pants_type_id' => (string) $pantsType->id],
                ], JSON_THROW_ON_ERROR),
            ],
        ], $creator->id);

        $controller = app(ProductionKanbanController::class);
        $reflection = new \ReflectionClass($controller);
        $method = $reflection->getMethod('buildProductionPricingSummary');
        $method->setAccessible(true);

        $garmentTypesByCategory = GarmentType::query()
            ->with(['operations' => fn ($query) => $query->where('is_active', true)->orderBy('display_order')->orderBy('id')])
            ->where('is_active', true)
            ->get()
            ->groupBy('category');

        $summary = $method->invoke($controller, $order, $garmentTypesByCategory);

        $this->assertSame((int) $pantsType->id, (int) ($summary['pants_type_id'] ?? 0));
        $this->assertSame(60.0, (float) $summary['pants_adult_unit_total']);
        $this->assertSame(1800.0, (float) $summary['pants_adult_total']);
    }

    public function test_pricing_summary_returns_only_shirt_adult_group_when_order_contains_only_shirt_adult_sizes(): void
    {
        $shirtType = $this->createPricingType('SHIRT', 'SHIRT-ADULT-ONLY', 12, 20);
        $pantsType = $this->createPricingType('PANTS', 'PANTS-ADULT-ONLY', 8, 15);

        $order = $this->createPricingProbeOrder([
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 5, 'unit_price' => 100],
        ], $shirtType->id, $pantsType->id);

        $summary = $this->invokeProductionPricingSummary($order);
        $groups = collect($summary['groups'] ?? []);

        $this->assertCount(1, $groups);
        $this->assertSame('shirt_adults_unspecified', (string) ($groups->first()['key'] ?? ''));
        $this->assertSame(5, (int) ($summary['shirt_adult_quantity'] ?? 0));
        $this->assertSame(0, (int) ($summary['pants_adult_quantity'] ?? -1));
        $this->assertSame(100.0, (float) ($summary['grand_total'] ?? 0));
    }

    public function test_pricing_summary_returns_two_groups_for_shirt_kids_and_shirt_adults_without_fake_groups(): void
    {
        $shirtType = $this->createPricingType('SHIRT', 'SHIRT-KIDS-ADULTS', 10, 30);
        $pantsType = $this->createPricingType('PANTS', 'PANTS-KIDS-ADULTS', 7, 17);

        $order = $this->createPricingProbeOrder([
            ['item_type' => 'shirt', 'size_group' => 'kids', 'size_label' => 'JM', 'quantity' => 2, 'unit_price' => 90],
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 3, 'unit_price' => 120],
        ], $shirtType->id, $pantsType->id);

        $summary = $this->invokeProductionPricingSummary($order);
        $groups = collect($summary['groups'] ?? []);
        $keys = $groups->pluck('key')->all();

        $this->assertSame(['shirt_kids_unspecified', 'shirt_adults_unspecified'], $keys);
        $this->assertSame(2, (int) ($summary['group_count'] ?? 0));
        $this->assertSame(20.0, (float) ($summary['child_total'] ?? 0));
        $this->assertSame(90.0, (float) ($summary['adult_total'] ?? 0));
        $this->assertSame(110.0, (float) ($summary['grand_total'] ?? 0));
    }

    public function test_pricing_summary_separates_all_four_groups_and_keeps_grand_total_consistent(): void
    {
        $shirtType = $this->createPricingType('SHIRT', 'SHIRT-ALL-GROUPS', 10, 20);
        $pantsType = $this->createPricingType('PANTS', 'PANTS-ALL-GROUPS', 5, 15);

        $order = $this->createPricingProbeOrder([
            ['item_type' => 'shirt', 'size_group' => 'kids', 'size_label' => 'JM', 'quantity' => 2, 'unit_price' => 80],
            ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 3, 'unit_price' => 120],
            ['item_type' => 'pants', 'size_group' => 'kids', 'size_label' => 'JM', 'quantity' => 4, 'unit_price' => 60],
            ['item_type' => 'pants', 'size_group' => 'oversize', 'size_label' => '2XL', 'quantity' => 1, 'unit_price' => 110],
        ], $shirtType->id, $pantsType->id);

        $summary = $this->invokeProductionPricingSummary($order);
        $groups = collect($summary['groups'] ?? []);
        $groupKeys = $groups->pluck('key')->all();
        $groupSubtotals = (float) $groups->sum(fn (array $group): float => (float) ($group['subtotal'] ?? 0));

        $this->assertSame(
            ['shirt_kids_unspecified', 'shirt_adults_unspecified', 'pants_kids_unspecified', 'pants_adults_unspecified'],
            $groupKeys,
        );
        $this->assertSame(2, (int) ($summary['shirt_child_quantity'] ?? 0));
        $this->assertSame(3, (int) ($summary['shirt_adult_quantity'] ?? 0));
        $this->assertSame(4, (int) ($summary['pants_child_quantity'] ?? 0));
        $this->assertSame(1, (int) ($summary['pants_adult_quantity'] ?? 0));
        $this->assertSame(20.0, (float) ($summary['child_total'] ?? 0));
        $this->assertSame(60.0, (float) ($summary['adult_total'] ?? 0));
        $this->assertSame(20.0, (float) ($summary['pants_child_total'] ?? 0));
        $this->assertSame(15.0, (float) ($summary['pants_adult_total'] ?? 0));
        $this->assertSame(115.0, (float) ($summary['grand_total'] ?? 0));
        $this->assertSame((float) ($summary['grand_total'] ?? 0), $groupSubtotals);
    }

    public function test_pricing_summary_treats_generic_garment_items_as_both_shirt_and_pants_when_both_specs_exist(): void
    {
        $shirtType = $this->createPricingType('SHIRT', 'SHIRT-GARMENT-GENERIC', 5, 8);
        $pantsType = $this->createPricingType('PANTS', 'PANTS-GARMENT-GENERIC', 20, 45);

        $order = $this->createPricingProbeOrder([
            ['item_type' => 'garment', 'size_group' => 'kids', 'size_label' => 'JM', 'quantity' => 20, 'unit_price' => 80],
            ['item_type' => 'garment', 'size_group' => 'adults', 'size_label' => 'M', 'quantity' => 60, 'unit_price' => 120],
        ], $shirtType->id, $pantsType->id);

        $summary = $this->invokeProductionPricingSummary($order);
        $groups = collect($summary['groups'] ?? []);

        $this->assertSame(['shirt_kids_unspecified', 'shirt_adults_unspecified', 'pants_kids_unspecified', 'pants_adults_unspecified'], $groups->pluck('key')->all());
        $this->assertSame(20, (int) ($summary['shirt_child_quantity'] ?? 0));
        $this->assertSame(60, (int) ($summary['shirt_adult_quantity'] ?? 0));
        $this->assertSame(20, (int) ($summary['pants_child_quantity'] ?? 0));
        $this->assertSame(60, (int) ($summary['pants_adult_quantity'] ?? 0));
        $this->assertSame(3680.0, (float) ($summary['grand_total'] ?? 0));
    }

    public function test_skipping_a_room_is_allowed_when_the_order_is_still_in_sequence(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $order = $this->createOrderWithJobType('งานปัก');
        $this->markStationCompleted($order, 'cutting');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'embroidery',
                'new_status' => 'skipped',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'embroidery', 'skipped');
    }

    /**
     * @return array<string, mixed>
     */
    private function invokeProductionPricingSummary(Order $order): array
    {
        $controller = app(ProductionKanbanController::class);
        $reflection = new \ReflectionClass($controller);
        $method = $reflection->getMethod('buildProductionPricingSummary');
        $method->setAccessible(true);

        $garmentTypesByCategory = GarmentType::query()
            ->with(['operations' => fn ($query) => $query->where('is_active', true)->orderBy('display_order')->orderBy('id')])
            ->where('is_active', true)
            ->get()
            ->groupBy('category');

        return $method->invoke($controller, $order, $garmentTypesByCategory);
    }

    private function createPricingType(string $category, string $codePrefix, float $childPrice, float $adultPrice): GarmentType
    {
        $type = GarmentType::create([
            'category' => $category,
            'code' => $codePrefix.'-'.$this->nextSequence(),
            'name' => $codePrefix,
            'is_active' => true,
            'display_order' => 1,
        ]);

        $type->operations()->createMany([
            ['name' => 'ตัด', 'child_price' => $childPrice, 'adult_price' => $adultPrice, 'is_active' => true, 'display_order' => 1],
        ]);

        return $type;
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function createPricingProbeOrder(array $items, int $shirtTypeId, int $pantsTypeId): Order
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-PRICE-'.$this->nextSequence(),
            'customer_name' => 'Pricing Probe Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-PRICE-'.$this->nextSequence(),
            'branch_name' => 'Pricing Probe Branch',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        return (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Pricing Probe',
            'job_type' => 'งานสกรีน',
            'order_date' => '2026-07-11 09:00:00',
            'due_date' => '2026-07-20 18:00:00',
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

    public function test_skip_to_destination_marks_intermediate_rooms_as_skipped_and_sets_target_room_active(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $cuttingTeam = CuttingTeam::create([
            'team_name' => 'ทีมตัด C',
            'is_active' => true,
        ]);

        $embroideryTeam = EmbroideryTeam::create([
            'team_name' => 'ทีมปัก C',
            'is_active' => true,
        ]);

        $order = $this->createOrderWithJobType('งานซับลิเมชั่น+ปัก+สกรีน');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'cutting',
                'new_status' => 'in_progress',
                'cutting_team_id' => $cuttingTeam->id,
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'cutting',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'print',
                'new_status' => 'skipped',
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'screen',
                'new_status' => 'skipped',
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'flex',
                'new_status' => 'skipped',
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'embroidery',
                'new_status' => 'in_progress',
                'embroidery_team_id' => $embroideryTeam->id,
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'cutting', 'completed');
        $this->assertRoutingState($order->id, 'print', 'skipped');
        $this->assertRoutingState($order->id, 'screen', 'skipped');
        $this->assertRoutingState($order->id, 'flex', 'skipped');
        $this->assertRoutingState($order->id, 'embroidery', 'in_progress', [
            'embroidery_team_id' => $embroideryTeam->id,
        ]);
    }

    public function test_transitioning_to_embroidery_without_a_team_keeps_the_room_pending(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $order = $this->createOrderWithJobType('งานปัก');
        $this->markStationCompleted($order, 'cutting');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'embroidery',
                'new_status' => 'pending',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'embroidery', 'pending');
    }

    public function test_embroidery_and_screen_flex_completion_allows_progression_to_sewing(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $cuttingTeam = CuttingTeam::create(['team_name' => 'ทีมตัด G', 'is_active' => true]);
        $embroideryTeam = EmbroideryTeam::create(['team_name' => 'ทีมปัก F', 'is_active' => true]);
        $sewingTeam = SewingTeam::create(['team_name' => 'ทีมเย็บ F', 'is_active' => true]);
        $flexTeam = ScreenTeam::create(['team_name' => 'ทีมเฟล็ก D', 'station_name' => 'flex', 'is_active' => true]);
        $machine = HeatPressMachine::create(['machine_name' => 'HEAT-D', 'is_active' => true]);

        $order = $this->createOrderWithJobType('งานปัก+สกรีน');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'cutting',
                'new_status' => 'in_progress',
                'cutting_team_id' => $cuttingTeam->id,
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'cutting',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'flex',
                'new_status' => 'in_progress',
                'screen_team_id' => $flexTeam->id,
                'heat_press_machine_id' => $machine->id,
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'flex',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'embroidery',
                'new_status' => 'in_progress',
                'embroidery_team_id' => $embroideryTeam->id,
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'embroidery',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'sewing',
                'new_status' => 'in_progress',
                'sewing_team_id' => $sewingTeam->id,
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'sewing', 'in_progress');
    }

    public function test_advancing_to_one_room_does_not_reset_unrelated_downstream_rooms_to_pending(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $embroideryTeam = EmbroideryTeam::create([
            'team_name' => 'ทีมปัก B',
            'is_active' => true,
        ]);

        $order = $this->createOrderWithJobType('งานปัก');
        $this->markStationCompleted($order, 'cutting');
        $this->setRoutingStatus($order, 'sewing', RoutingStatus::InProgress);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'embroidery',
                'new_status' => 'in_progress',
                'embroidery_team_id' => $embroideryTeam->id,
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'embroidery',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'embroidery', 'completed');
        $this->assertRoutingState($order->id, 'sewing', 'in_progress');
    }

    public function test_sewing_room_cannot_complete_before_in_progress(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $sewingTeam = SewingTeam::create([
            'team_name' => 'ทีมเย็บ B',
            'is_active' => true,
        ]);

        $order = $this->createOrderWithJobType('งานปัก');
        $this->markStationCompleted($order, 'cutting');
        $this->markStationCompleted($order, 'embroidery');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'sewing',
                'new_status' => 'completed',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status']);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'sewing',
                'new_status' => 'in_progress',
                'sewing_team_id' => $sewingTeam->id,
            ])
            ->assertOk();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'sewing',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'sewing', 'completed');
    }

    public function test_supported_job_type_variants_create_expected_required_routing_sequences(): void
    {
        $cases = [
            ['งานปัก', ['cutting', 'embroidery', 'sewing', 'qc', 'shipping']],
            ['งานสกรีน', ['cutting', 'flex', 'sewing', 'qc', 'shipping']],
            ['งานเฟล็ก', ['cutting', 'flex', 'sewing', 'qc', 'shipping']],
            ['งานซับลิเมชั่น', ['cutting', 'print', 'screen', 'sewing', 'qc', 'shipping']],
            ['งานปัก+สกรีน', ['cutting', 'flex', 'embroidery', 'sewing', 'qc', 'shipping']],
            ['งานซับลิเมชั่น+สกรีน', ['cutting', 'print', 'screen', 'flex', 'sewing', 'qc', 'shipping']],
            ['งานซับลิเมชั่น+ปัก+สกรีน', ['cutting', 'print', 'screen', 'flex', 'embroidery', 'sewing', 'qc', 'shipping']],
            ['งานตัด', ['design']],
        ];

        foreach ($cases as [$jobType, $expectedSequence]) {
            $order = $this->createOrderWithJobType($jobType);
            $routings = OrderRouting::query()
                ->where('order_id', $order->id)
                ->where('is_required', true)
                ->orderBy('id')
                ->get();

            $actualSequence = $routings->map(fn (OrderRouting $routing): string => $routing->station_name instanceof RoutingStationName
                ? $routing->station_name->value
                : (string) $routing->station_name)->all();

            $this->assertSame(
                $expectedSequence,
                $actualSequence,
                sprintf('Job type [%s] should generate the expected routing sequence.', $jobType),
            );
        }
    }

    public function test_forward_progression_respects_the_required_sequence_for_major_job_type_variants(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $cuttingTeam = CuttingTeam::create(['team_name' => 'ทีมตัด E', 'is_active' => true]);
        $embroideryTeam = EmbroideryTeam::create(['team_name' => 'ทีมปัก D', 'is_active' => true]);
        $sewingTeam = SewingTeam::create(['team_name' => 'ทีมเย็บ D', 'is_active' => true]);
        $screenTeam = ScreenTeam::create(['team_name' => 'ทีมสกรีน B', 'station_name' => 'screen', 'is_active' => true]);
        $flexTeam = ScreenTeam::create(['team_name' => 'ทีมเฟล็ก B', 'station_name' => 'flex', 'is_active' => true]);
        $machine = HeatPressMachine::create(['machine_name' => 'HEAT-B', 'is_active' => true]);

        $cases = [
            ['งานปัก', 'embroidery', ['embroidery_team_id' => $embroideryTeam->id]],
            ['งานปัก+สกรีน', 'flex', ['screen_team_id' => $flexTeam->id, 'heat_press_machine_id' => $machine->id]],
            ['งานซับลิเมชั่น+ปัก+สกรีน', 'print', ['print_machine' => 'printer_1']],
        ];

        foreach ($cases as [$jobType, $nextStation, $payload]) {
            $order = $this->createOrderWithJobType($jobType);

            $this->actingAs($manager)
                ->postJson(route('production.routing.advance', $order), [
                    'station_name' => 'cutting',
                    'new_status' => 'in_progress',
                    'cutting_team_id' => $cuttingTeam->id,
                ])
                ->assertOk();

            $this->actingAs($manager)
                ->postJson(route('production.routing.advance', $order), [
                    'station_name' => 'cutting',
                    'new_status' => 'completed',
                ])
                ->assertOk();

            $this->actingAs($manager)
                ->postJson(route('production.routing.advance', $order), [
                    'station_name' => $nextStation,
                    'new_status' => 'in_progress',
                    ...$payload,
                ])
                ->assertOk();

            $this->assertRoutingState($order->id, 'cutting', 'completed');
            $this->assertRoutingState($order->id, $nextStation, 'in_progress');
        }
    }

    public function test_skip_to_destination_marks_intermediate_rooms_as_skipped_for_major_job_type_variants(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $cuttingTeam = CuttingTeam::create(['team_name' => 'ทีมตัด F', 'is_active' => true]);
        $sewingTeam = SewingTeam::create(['team_name' => 'ทีมเย็บ E', 'is_active' => true]);
        $embroideryTeam = EmbroideryTeam::create(['team_name' => 'ทีมปัก E', 'is_active' => true]);
        $screenTeam = ScreenTeam::create(['team_name' => 'ทีมสกรีน C', 'station_name' => 'screen', 'is_active' => true]);
        $flexTeam = ScreenTeam::create(['team_name' => 'ทีมเฟล็ก C', 'station_name' => 'flex', 'is_active' => true]);
        $machine = HeatPressMachine::create(['machine_name' => 'HEAT-C', 'is_active' => true]);

        $cases = [
            ['งานปัก', ['embroidery'], ['sewing_team_id' => $sewingTeam->id]],
            ['งานปัก+สกรีน', ['flex', 'embroidery'], ['sewing_team_id' => $sewingTeam->id]],
            ['งานซับลิเมชั่น+ปัก+สกรีน', ['print', 'screen', 'flex', 'embroidery'], ['sewing_team_id' => $sewingTeam->id]],
        ];

        foreach ($cases as [$jobType, $stationsToSkip, $payload]) {
            $order = $this->createOrderWithJobType($jobType);

            $this->actingAs($manager)
                ->postJson(route('production.routing.advance', $order), [
                    'station_name' => 'cutting',
                    'new_status' => 'in_progress',
                    'cutting_team_id' => $cuttingTeam->id,
                ])
                ->assertOk();

            $this->actingAs($manager)
                ->postJson(route('production.routing.advance', $order), [
                    'station_name' => 'cutting',
                    'new_status' => 'completed',
                ])
                ->assertOk();

            foreach ($stationsToSkip as $stationToSkip) {
                $this->actingAs($manager)
                    ->postJson(route('production.routing.advance', $order), [
                        'station_name' => $stationToSkip,
                        'new_status' => 'skipped',
                    ])
                    ->assertOk();
            }

            $this->actingAs($manager)
                ->postJson(route('production.routing.advance', $order), [
                    'station_name' => 'sewing',
                    'new_status' => 'in_progress',
                    ...$payload,
                ])
                ->assertOk();

            foreach ($stationsToSkip as $stationToSkip) {
                $this->assertRoutingState($order->id, $stationToSkip, 'skipped');
            }

            $this->assertRoutingState($order->id, 'sewing', 'in_progress');
        }
    }

    public function test_reopening_a_completed_routing_clears_its_completion_timestamp(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $cuttingTeam = CuttingTeam::create([
            'team_name' => 'ทีมตัด D',
            'is_active' => true,
        ]);

        $order = $this->createOrderWithJobType('งานปัก');
        $this->markStationCompleted($order, 'cutting');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'cutting',
                'new_status' => 'in_progress',
                'cutting_team_id' => $cuttingTeam->id,
            ])
            ->assertOk();

        $routing = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('station_name', 'cutting')
            ->firstOrFail();

        $this->assertSame('in_progress', $routing->status->value);
        $this->assertNull($routing->completed_at);
    }

    public function test_sewing_room_can_reopen_when_the_routing_already_has_a_saved_team(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $sewingTeam = SewingTeam::create([
            'team_name' => 'ทีมเย็บ C',
            'is_active' => true,
        ]);

        $order = $this->createOrderWithJobType('งานปัก');
        $this->markStationCompleted($order, 'cutting');
        $this->markStationCompleted($order, 'embroidery');

        $routing = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('station_name', 'sewing')
            ->firstOrFail();
        $routing->sewing_team_id = $sewingTeam->id;
        $routing->save();

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'sewing',
                'new_status' => 'in_progress',
            ])
            ->assertOk();

        $routing->refresh();

        $this->assertSame('in_progress', $routing->status->value);
        $this->assertSame($sewingTeam->id, $routing->sewing_team_id);
    }

    public function test_legacy_in_progress_station_can_complete_even_if_upstream_status_is_stale(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $order = $this->createOrderWithJobType('งานปัก');

        $sewingRouting = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('station_name', 'sewing')
            ->firstOrFail();

        $sewingRouting->update([
            'status' => RoutingStatus::InProgress,
            'started_at' => now()->subMinutes(30),
        ]);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'sewing',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'sewing', 'completed');
    }

    public function test_legacy_pending_started_station_can_complete_even_if_upstream_status_is_stale(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $order = $this->createOrderWithJobType('งานสกรีน');

        $flexRouting = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('station_name', 'flex')
            ->firstOrFail();

        $flexRouting->update([
            'status' => RoutingStatus::Pending,
            'assigned_user_id' => $manager->id,
            'started_at' => now()->subMinutes(20),
        ]);

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'flex',
                'new_status' => 'completed',
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'flex', 'completed');
    }

    public function test_direct_complete_flag_allows_completing_room_without_forwarding_or_prerequisites(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $order = $this->createOrderWithJobType('งานสกรีน');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'flex',
                'new_status' => 'completed',
                'direct_complete' => true,
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'flex', 'completed');
        $this->assertRoutingState($order->id, 'sewing', 'pending');
    }

    public function test_direct_complete_in_screen_flex_room_completes_both_screen_and_flex(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $order = $this->createOrderWithJobType('งานซับลิเมชั่น+สกรีน');

        $this->actingAs($manager)
            ->postJson(route('production.routing.advance', $order), [
                'station_name' => 'screen',
                'new_status' => 'completed',
                'direct_complete' => true,
            ])
            ->assertOk();

        $this->assertRoutingState($order->id, 'screen', 'completed');
        $this->assertRoutingState($order->id, 'flex', 'completed');
    }

    public function test_direct_complete_persists_after_reload_for_all_major_job_types(): void
    {
        $manager = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $cases = [
            ['งานปัก', 'embroidery', []],
            ['งานสกรีน', 'flex', []],
            ['งานเฟล็ก', 'flex', []],
            ['งานซับลิเมชั่น', 'screen', []],
            ['งานปัก+สกรีน', 'flex', []],
            ['งานซับลิเมชั่น+สกรีน', 'screen', ['flex']],
            ['งานซับลิเมชั่น+ปัก+สกรีน', 'screen', ['flex']],
        ];

        foreach ($cases as [$jobType, $stationToComplete, $expectedSiblingCompleted]) {
            $order = $this->createOrderWithJobType($jobType);

            $this->actingAs($manager)
                ->postJson(route('production.routing.advance', $order), [
                    'station_name' => $stationToComplete,
                    'new_status' => 'completed',
                    'direct_complete' => true,
                ])
                ->assertOk();

            $reloadedOrder = Order::query()->findOrFail($order->id);

            $this->assertRoutingState($reloadedOrder->id, $stationToComplete, 'completed');

            foreach ($expectedSiblingCompleted as $siblingStation) {
                $this->assertRoutingState($reloadedOrder->id, $siblingStation, 'completed');
            }
        }
    }

    /**
     * Counts the fixtures this test has made. customer_code and branch_code are
     * unique columns, so drawing them at random meant a run could collide with
     * itself and fail for no reason; a counter cannot.
     */
    private int $fixtureSequence = 0;

    private function nextSequence(): string
    {
        $this->fixtureSequence += 1;

        return str_pad((string) $this->fixtureSequence, 5, '0', STR_PAD_LEFT);
    }

    private function createOrderWithJobType(string $jobType): Order
    {
        $sequence = $this->nextSequence();

        $customer = Customer::create([
            'customer_code' => 'CUS-FLOW-'.$sequence,
            'customer_name' => 'Flow Coverage Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-FLOW-'.$sequence,
            'branch_name' => 'Flow Coverage Branch',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        return (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Flow Coverage Order',
            'job_type' => $jobType,
            'order_date' => '2026-07-11 09:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'items' => [
                [
                    'item_type' => 'shirt',
                    'size_group' => 'adults',
                    'size_label' => 'M',
                    'quantity' => 5,
                    'unit_price' => 100,
                ],
            ],
        ], $creator->id);
    }

    private function markStationCompleted(Order $order, string $stationName): void
    {
        $routing = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('station_name', $stationName)
            ->firstOrFail();

        $routing->status = RoutingStatus::Completed;
        $routing->started_at = now()->subHour();
        $routing->completed_at = now();
        $routing->save();
    }

    /**
     * @param  array<string, mixed>  $expect
     */
    private function setRoutingStatus(Order $order, string $stationName, RoutingStatus $status): void
    {
        $routing = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('station_name', $stationName)
            ->firstOrFail();

        $routing->status = $status;
        $routing->save();
    }

    private function assertRoutingState(int $orderId, string $station, string $status, array $expect = []): void
    {
        $routing = OrderRouting::query()
            ->where('order_id', $orderId)
            ->where('station_name', $station)
            ->firstOrFail();

        $this->assertSame($status, $routing->status->value);

        foreach ($expect as $key => $value) {
            $this->assertSame($value, $routing->{$key});
        }
    }
}
