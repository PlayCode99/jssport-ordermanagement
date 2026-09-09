<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\GarmentOperation;
use App\Models\GarmentType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Long sleeves and long legs carry their own labour rate. An operation that
 * costs the same either way is left blank rather than typed twice, so blank has
 * to survive the round trip as null and never as 0.00.
 */
class GarmentOperationLongPriceTest extends TestCase
{
    use RefreshDatabase;

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

    private function shirtType(): GarmentType
    {
        return GarmentType::create([
            'category' => 'SHIRT',
            'code' => 'LONG-PRICE-TEST',
            'name' => 'เสื้อทดสอบ',
            'is_active' => true,
            'display_order' => 1,
        ]);
    }

    public function test_a_long_rate_is_saved_and_read_back(): void
    {
        $type = $this->shirtType();

        $this->actingAs($this->owner())
            ->postJson('/settings/data/garments/prices', [
                'garment_type_id' => $type->id,
                'name' => 'เย็บแขน',
                'child_price' => 10,
                'adult_price' => 20,
                'child_price_long' => 14,
                'adult_price_long' => 26,
                'display_order' => 1,
                'is_active' => true,
            ])
            ->assertOk();

        $operation = GarmentOperation::query()->where('name', 'เย็บแขน')->firstOrFail();

        $this->assertSame('14.00', (string) $operation->child_price_long);
        $this->assertSame('26.00', (string) $operation->adult_price_long);
    }

    public function test_a_blank_long_rate_is_stored_as_null_not_as_zero(): void
    {
        $type = $this->shirtType();

        $this->actingAs($this->owner())
            ->postJson('/settings/data/garments/prices', [
                'garment_type_id' => $type->id,
                'name' => 'กลับปก',
                'child_price' => 5,
                'adult_price' => 8,
                'child_price_long' => null,
                'adult_price_long' => '',
                'display_order' => 1,
                'is_active' => true,
            ])
            ->assertOk();

        $operation = GarmentOperation::query()->where('name', 'กลับปก')->firstOrFail();

        // 0.00 would say the step is free on long sleeves; null says "same as
        // the short price", which is what an empty box means.
        $this->assertNull($operation->child_price_long);
        $this->assertNull($operation->adult_price_long);
    }

    public function test_a_negative_long_rate_is_rejected(): void
    {
        $type = $this->shirtType();

        $this->actingAs($this->owner())
            ->postJson('/settings/data/garments/prices', [
                'garment_type_id' => $type->id,
                'name' => 'ติดกระดุม',
                'child_price' => 5,
                'adult_price' => 8,
                'child_price_long' => -1,
                'display_order' => 1,
                'is_active' => true,
            ])
            ->assertJsonValidationErrors('child_price_long');
    }

    public function test_the_long_rate_survives_an_update_that_carries_it(): void
    {
        $type = $this->shirtType();
        $operation = $type->operations()->create([
            'name' => 'เย็บแขน',
            'child_price' => 10,
            'adult_price' => 20,
            'child_price_long' => 14,
            'adult_price_long' => 26,
            'is_active' => true,
            'display_order' => 1,
        ]);

        // The screen's active toggle replaces the whole row, so the long rates
        // travel with it. Without them this call used to blank them out.
        $this->actingAs($this->owner())
            ->putJson('/settings/data/garments/prices/'.$operation->id, [
                'garment_type_id' => $type->id,
                'name' => 'เย็บแขน',
                'child_price' => 10,
                'adult_price' => 20,
                'child_price_long' => 14,
                'adult_price_long' => 26,
                'display_order' => 1,
                'is_active' => false,
            ])
            ->assertOk();

        $operation->refresh();

        $this->assertFalse((bool) $operation->is_active);
        $this->assertSame('14.00', (string) $operation->child_price_long);
        $this->assertSame('26.00', (string) $operation->adult_price_long);
    }
}
