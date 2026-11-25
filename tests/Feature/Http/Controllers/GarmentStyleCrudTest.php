<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\GarmentStyle;
use App\Models\GarmentType;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Support\Orders\GarmentStyles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "เซทใบงานเสื้อ" is the shop's list of the lengths it sells, not three
 * words in the code. A shop that starts selling a three-quarter sleeve adds
 * one here and sells it the same day.
 *
 * The length is load-bearing: every order line stores its code, production
 * sheets are keyed by it and artwork is pinned to those sheets. So the rules
 * below are mostly about what must NOT be allowed to happen to a length that
 * bills already depend on.
 */
class GarmentStyleCrudTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        GarmentStyles::flushCache();
    }

    private function owner(): User
    {
        return User::factory()->create([
            'role' => UserRole::Admin,
            'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None,
            'is_active' => true,
            'branch_id' => null,
        ]);
    }

    // ---------------- the lengths the shop starts with ----------------

    public function test_the_shop_starts_with_the_lengths_it_always_had(): void
    {
        // Seeded by the migration under the codes every existing bill
        // carries, so nothing printed before it reads differently after.
        $this->assertSame(
            ['short', 'long', 'sleeveless'],
            GarmentStyles::codes('SHIRT'),
        );
        $this->assertSame(['short', 'long'], GarmentStyles::codes('PANTS'));
    }

    // ---------------- adding one ----------------

    public function test_a_shop_can_add_a_length_it_has_started_selling(): void
    {
        $this->actingAs($this->owner())
            ->post('/settings/data/garments/styles', [
                'category' => 'SHIRT',
                'name' => 'แขนสามส่วน',
            ])
            ->assertSuccessful();

        $style = GarmentStyle::query()
            ->where('category', 'SHIRT')
            ->where('name', 'แขนสามส่วน')
            ->first();

        $this->assertNotNull($style);
        $this->assertTrue($style->is_active);
        // A Thai name leaves nothing to transliterate, so a code is made.
        $this->assertNotSame('', $style->code);
        $this->assertMatchesRegularExpression('/^[a-z0-9_]+$/', $style->code);
    }

    public function test_a_typed_code_is_kept_as_typed(): void
    {
        $this->actingAs($this->owner())
            ->post('/settings/data/garments/styles', [
                'category' => 'SHIRT',
                'name' => 'แขนสามส่วน',
                'code' => 'three_quarter',
            ])
            ->assertSuccessful();

        $this->assertDatabaseHas('garment_styles', [
            'category' => 'SHIRT',
            'code' => 'three_quarter',
        ]);
    }

    public function test_two_lengths_of_one_category_never_share_a_code(): void
    {
        $owner = $this->owner();

        foreach (['แขนสามส่วน', 'แขนสามส่วน'] as $name) {
            $this->actingAs($owner)
                ->post('/settings/data/garments/styles', [
                    'category' => 'SHIRT',
                    'name' => $name,
                    'code' => 'three_quarter',
                ])
                ->assertSuccessful();
        }

        $codes = GarmentStyle::query()
            ->where('category', 'SHIRT')
            ->pluck('code')
            ->all();

        $this->assertSame($codes, array_unique($codes));
    }

    public function test_a_shirt_and_a_pair_of_trousers_may_use_the_same_code(): void
    {
        // They are separate lists: 'short' means a sleeve on one and a leg
        // on the other, and always has.
        $this->assertDatabaseHas('garment_styles', ['category' => 'SHIRT', 'code' => 'short']);
        $this->assertDatabaseHas('garment_styles', ['category' => 'PANTS', 'code' => 'short']);
    }

    public function test_a_new_length_can_be_used_by_a_garment_straight_away(): void
    {
        $owner = $this->owner();

        $this->actingAs($owner)->post('/settings/data/garments/styles', [
            'category' => 'SHIRT',
            'name' => 'แขนสามส่วน',
            'code' => 'three_quarter',
        ])->assertSuccessful();

        GarmentStyles::flushCache();

        $this->actingAs($owner)->post('/settings/data/garments/types', [
            'category' => 'SHIRT',
            'style' => 'three_quarter',
            'code' => 'SH-34',
            'name' => 'เสื้อโปโล แขนสามส่วน',
        ])->assertSuccessful();

        $this->assertSame(
            'three_quarter',
            GarmentType::query()->where('code', 'SH-34')->value('style'),
        );
    }

    public function test_a_bill_can_be_sold_at_a_length_the_shop_just_added(): void
    {
        $owner = $this->owner();

        $this->actingAs($owner)->post('/settings/data/garments/styles', [
            'category' => 'SHIRT',
            'name' => 'แขนสามส่วน',
            'code' => 'three_quarter',
        ])->assertSuccessful();

        GarmentStyles::flushCache();

        // The length reaches the order form's validation, the sheet keys and
        // the line that is stored — which is the whole point of the list
        // being data. Added this morning, sold this afternoon.
        $this->assertContains('three_quarter', GarmentStyles::codes('SHIRT'));
        $this->assertContains(
            'shirt_kids_three_quarter',
            Order::artworkBatchKeys('shirt_artwork'),
        );
    }

    // ---------------- editing one ----------------

    public function test_a_length_can_be_renamed(): void
    {
        $style = GarmentStyle::query()->where('category', 'SHIRT')->where('code', 'sleeveless')->firstOrFail();

        $this->actingAs($this->owner())
            ->put("/settings/data/garments/styles/{$style->id}", [
                'name' => 'แขนกุด (เสื้อกล้าม)',
            ])
            ->assertSuccessful();

        $this->assertSame('แขนกุด (เสื้อกล้าม)', $style->refresh()->name);
    }

    public function test_renaming_never_moves_the_code_bills_are_written_with(): void
    {
        $style = GarmentStyle::query()->where('category', 'SHIRT')->where('code', 'short')->firstOrFail();

        $this->actingAs($this->owner())
            ->put("/settings/data/garments/styles/{$style->id}", [
                'name' => 'แขนสั้นพิเศษ',
                'code' => 'something_else',
                'category' => 'PANTS',
            ])
            ->assertSuccessful();

        $style->refresh();

        // Both are stored on every bill sold at this length; moving either
        // would strand them.
        $this->assertSame('short', $style->code);
        $this->assertSame('SHIRT', $style->category->value);
    }

    public function test_a_length_can_be_switched_off_without_touching_old_bills(): void
    {
        $style = GarmentStyle::query()->where('category', 'SHIRT')->where('code', 'long')->firstOrFail();

        $this->actingAs($this->owner())
            ->put("/settings/data/garments/styles/{$style->id}", [
                'name' => $style->name,
                'is_active' => false,
            ])
            ->assertSuccessful();

        GarmentStyles::flushCache();

        $this->assertFalse($style->refresh()->is_active);
        // Gone from what a counter may pick, still known to everything that
        // has to read a bill already sold at it.
        $this->assertNotContains('long', GarmentStyles::activeCodes('SHIRT'));
        $this->assertContains('long', GarmentStyles::codes('SHIRT'));
    }

    // ---------------- deleting one ----------------

    public function test_an_unused_length_can_be_deleted(): void
    {
        $style = GarmentStyle::query()->where('category', 'SHIRT')->where('code', 'sleeveless')->firstOrFail();

        $this->actingAs($this->owner())
            ->delete("/settings/data/garments/styles/{$style->id}")
            ->assertSuccessful();

        $this->assertDatabaseMissing('garment_styles', ['id' => $style->id]);
    }

    public function test_a_length_with_garments_under_it_is_refused(): void
    {
        $style = GarmentStyle::query()->where('category', 'SHIRT')->where('code', 'short')->firstOrFail();

        GarmentType::create([
            'category' => 'SHIRT',
            'style' => 'short',
            'code' => 'SH-POLO',
            'name' => 'เสื้อโปโล',
            'is_active' => true,
            'display_order' => 0,
        ]);

        $this->actingAs($this->owner())
            ->delete("/settings/data/garments/styles/{$style->id}")
            ->assertSessionHasErrors('garment_style');

        $this->assertDatabaseHas('garment_styles', ['id' => $style->id]);
    }

    public function test_a_length_a_bill_was_sold_at_is_refused(): void
    {
        $style = GarmentStyle::query()->where('category', 'SHIRT')->where('code', 'short')->firstOrFail();

        // No garment type under it, but a bill out of the shop names it.
        // Deleting it would leave that bill's sheet with a heading nothing
        // explains and its artwork pinned to a sheet that no longer exists.
        OrderItem::query()->create([
            'order_id' => $this->billWithShortSleeves(),
            'item_type' => 'separate_shirt',
            'size_group' => 'adults',
            'size_label' => 'L',
            'shirt_style' => 'short',
            'quantity' => 10,
            'unit_price' => 100,
            'total_price' => 1000,
        ]);

        $this->actingAs($this->owner())
            ->delete("/settings/data/garments/styles/{$style->id}")
            ->assertSessionHasErrors('garment_style');

        $this->assertDatabaseHas('garment_styles', ['id' => $style->id]);
    }

    private function billWithShortSleeves(): int
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-STYLE-1',
            'customer_name' => 'ลูกค้าทดสอบ',
        ]);
        $branch = Branch::create([
            'branch_code' => 'BR-STYLE-1',
            'branch_name' => 'สาขาทดสอบ',
        ]);

        return (int) Order::create([
            'order_code' => 'STYLE-BILL-1',
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $this->owner()->id,
            'job_name' => 'งานทดสอบ',
            'job_type' => 'งานปัก',
            'order_date' => '2026-11-01 09:00:00',
            'due_date' => '2026-11-20 18:00:00',
        ])->id;
    }
}
