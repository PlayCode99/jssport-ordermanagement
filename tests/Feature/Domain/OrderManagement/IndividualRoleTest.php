<?php

namespace Tests\Feature\Domain\OrderManagement;

use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Http\Controllers\DashboardController;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Form 2 tells players apart from keepers. The keeper wears the team's shirt in
 * a different colour, so the roster the customer signs off has to carry the
 * role, both numbers, and the colour the keepers are getting.
 */
class IndividualRoleTest extends TestCase
{
    use RefreshDatabase;

    private function actor(): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $people
     */
    private function storeOrder(array $people, string $keeperColor = ''): Order
    {
        $customer = Customer::create(['customer_code' => 'CUS-ROLE-1', 'customer_name' => 'ทีมทดสอบ']);
        $branch = Branch::create(['branch_code' => 'BR-ROLE-1', 'branch_name' => 'สาขาทดสอบ']);

        $this->actingAs($this->actor())->post('/orders', [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'customer_name' => 'ทีมทดสอบ',
            'job_name' => 'เสื้อทีม',
            'job_type' => 'งานสกรีน',
            'order_date' => '2026-09-09 09:00:00',
            'due_date' => '2026-09-20 18:00:00',
            'discount_percent' => 0,
            'items' => [
                ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'quantity' => 2, 'unit_price' => 250],
            ],
            'specification' => [
                'pattern_id' => 1,
                'fabric_id' => 1,
                'screen_print_detail' => json_encode([
                    'schema' => 'spec-v2',
                    'mode' => 'individual',
                    'individual_include_pants' => true,
                    'individual_keeper_color' => $keeperColor,
                    'personalization_rows' => $people,
                ], JSON_THROW_ON_ERROR),
            ],
        ])->assertSessionHasNoErrors();

        return Order::query()->latest('id')->firstOrFail();
    }

    public function test_the_role_and_both_numbers_survive_the_round_trip(): void
    {
        $order = $this->storeOrder([
            ['role' => 'player', 'name' => 'สมชาย', 'size_group' => 'adults', 'size' => 'L', 'number' => '9', 'pants_size' => 'L', 'pants_number' => '9', 'quantity' => 1, 'unit_price' => 250],
            ['role' => 'keeper', 'name' => 'อนุชา', 'size_group' => 'adults', 'size' => 'XL', 'number' => '1', 'pants_size' => 'XL', 'pants_number' => '18', 'quantity' => 1, 'unit_price' => 250],
        ], 'เขียวสะท้อนแสง');

        $decoded = json_decode((string) $order->specification->screen_print_detail, true);

        $this->assertSame('player', $decoded['personalization_rows'][0]['role']);
        $this->assertSame('keeper', $decoded['personalization_rows'][1]['role']);
        // The pants number is not always the shirt number.
        $this->assertSame('1', $decoded['personalization_rows'][1]['number']);
        $this->assertSame('18', $decoded['personalization_rows'][1]['pants_number']);
        $this->assertSame('เขียวสะท้อนแสง', $decoded['individual_keeper_color']);
    }

    public function test_the_counter_receives_the_roles_and_the_keeper_colour(): void
    {
        $order = $this->storeOrder([
            ['role' => 'keeper', 'name' => 'อนุชา', 'size_group' => 'kids', 'size' => 'JM', 'number' => '1', 'pants_size' => 'JM', 'pants_number' => '1', 'quantity' => 1, 'unit_price' => 250],
        ], 'เขียวสะท้อนแสง');

        $this->actingAs($this->actor())
            ->getJson('/counter')
            ->assertOk();

        $controller = app(DashboardController::class);
        $method = (new \ReflectionClass($controller))->getMethod('mapPersonalizationRows');
        $rows = $method->invoke($controller, $order->specification->toArray());

        $this->assertSame('keeper', $rows[0]['role']);
        $this->assertSame('kids', $rows[0]['size_group']);
        $this->assertSame('1', $rows[0]['pants_number']);
    }

    public function test_the_counter_receives_the_sleeve_and_leg_each_person_takes(): void
    {
        $order = $this->storeOrder([
            ['role' => 'player', 'name' => 'สมชาย', 'size_group' => 'adults', 'size' => 'L', 'number' => '9', 'shirt_style' => 'short', 'pants_size' => 'L', 'pants_number' => '9', 'pants_style' => 'long', 'quantity' => 1, 'unit_price' => 250],
            ['role' => 'keeper', 'name' => 'อนุชา', 'size_group' => 'adults', 'size' => 'XL', 'number' => '1', 'shirt_style' => 'long', 'pants_size' => 'XL', 'pants_number' => '18', 'pants_style' => 'long', 'quantity' => 1, 'unit_price' => 250],
        ]);

        $controller = app(DashboardController::class);
        $method = (new \ReflectionClass($controller))->getMethod('mapPersonalizationRows');
        $rows = $method->invoke($controller, $order->specification->toArray());

        // The roster and the work sheet both read these, so a length that stops
        // here would print a sheet the floor cannot match to its work.
        $this->assertSame('short', $rows[0]['shirt_style']);
        $this->assertSame('long', $rows[0]['pants_style']);
        $this->assertSame('long', $rows[1]['shirt_style']);
    }

    public function test_a_bill_written_before_lengths_existed_claims_neither(): void
    {
        $order = $this->storeOrder([
            ['role' => 'player', 'name' => 'สมชาย', 'size' => 'L', 'number' => '9', 'quantity' => 1, 'unit_price' => 250],
        ]);

        $controller = app(DashboardController::class);
        $method = (new \ReflectionClass($controller))->getMethod('mapPersonalizationRows');
        $rows = $method->invoke($controller, $order->specification->toArray());

        // Blank, never guessed into 'short': the sheets read blank as "this bill
        // never said" and print the way they always did.
        $this->assertSame('', $rows[0]['shirt_style']);
        $this->assertSame('', $rows[0]['pants_style']);
    }

    public function test_a_bill_written_before_roles_existed_reads_as_players(): void
    {
        $order = $this->storeOrder([
            ['name' => 'สมชาย', 'size' => 'L', 'number' => '9', 'quantity' => 1, 'unit_price' => 250],
        ]);

        $controller = app(DashboardController::class);
        $method = (new \ReflectionClass($controller))->getMethod('mapPersonalizationRows');
        $rows = $method->invoke($controller, $order->specification->toArray());

        // Never guessed into the keeper shirt, which is the one that would be
        // cut in the wrong colour.
        $this->assertSame('player', $rows[0]['role']);
        $this->assertSame('', $rows[0]['pants_number']);
    }
}
