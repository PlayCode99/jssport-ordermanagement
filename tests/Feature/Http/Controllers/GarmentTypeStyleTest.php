<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\GarmentType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A garment is made to a length, and the length decides the work: a sleeveless
 * shirt has no sleeve to attach and no cuff to hem, and it has an armhole to
 * bind that the others do not. The steps already hang off the garment; what
 * was missing was the length that says which set of steps you are looking at.
 */
class GarmentTypeStyleTest extends TestCase
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

    public function test_it_records_the_length_a_shirt_is_made_to(): void
    {
        $this->actingAs($this->owner())->post('/settings/data/garments/types', [
            'category' => 'SHIRT',
            'style' => 'sleeveless',
            'code' => 'SH-VEST',
            'name' => 'เสื้อโปโล แขนกุด',
        ])->assertSuccessful();

        $this->assertSame('sleeveless', GarmentType::query()->where('code', 'SH-VEST')->value('style'));
    }

    public function test_a_pair_of_trousers_is_never_sleeveless(): void
    {
        $this->actingAs($this->owner())->post('/settings/data/garments/types', [
            'category' => 'PANTS',
            'style' => 'sleeveless',
            'code' => 'PT-ODD',
            'name' => 'กางเกงแปลก',
        ]);

        // Never stored as a cut nobody can sew: the answer falls back to the
        // base length rather than being kept.
        $this->assertSame(
            'short',
            GarmentType::query()->where('code', 'PT-ODD')->value('style'),
        );
    }

    public function test_a_garment_cannot_be_priced_without_a_length(): void
    {
        // A length decides the work, so a garment that names none says nothing
        // about what it costs to make.
        $this->actingAs($this->owner())->post('/settings/data/garments/types', [
            'category' => 'SHIRT',
            'code' => 'SH-ANY',
            'name' => 'เสื้อโปโล',
        ])->assertSessionHasErrors('style');

        $this->assertDatabaseMissing('garment_types', ['code' => 'SH-ANY']);
    }

    public function test_every_garment_entered_before_lengths_existed_now_names_one(): void
    {
        // Nothing was guessed: a name that says ขายาว is long, and the rest
        // carry the base rate the costing already charges every batch that is
        // not long.
        $this->assertSame(
            0,
            GarmentType::query()->whereNull('style')->count(),
        );
    }

    public function test_the_page_hands_the_length_to_the_list(): void
    {
        // The install seeds a shirt of its own, so this one is put first by
        // its order rather than by clearing the table out from under it.
        GarmentType::query()->update(['display_order' => 99]);

        GarmentType::create([
            'category' => 'SHIRT',
            'style' => 'long',
            'code' => 'SH-LONG',
            'name' => 'เสื้อโปโล แขนยาว',
            'is_active' => true,
            'display_order' => 0,
        ]);

        $this->actingAs($this->owner())
            ->get('/settings/data/garments/types?category=SHIRT')
            ->assertInertia(fn ($page) => $page
                ->component('settings/data/garments/types')
                ->where('rows.0.style', 'long'));
    }

    public function test_the_page_opens_on_the_lengths_before_it_shows_any_garment(): void
    {
        $this->actingAs($this->owner())
            ->get('/settings/data/garments/types?category=SHIRT')
            ->assertInertia(fn ($page) => $page->where('selectedStyle', null));
    }

    public function test_picking_a_length_carries_it_through_to_the_page(): void
    {
        $this->actingAs($this->owner())
            ->get('/settings/data/garments/types?category=SHIRT&style=sleeveless')
            ->assertInertia(fn ($page) => $page
                ->where('selectedCategory', 'SHIRT')
                ->where('selectedStyle', 'sleeveless'));
    }

    public function test_a_length_the_floor_cannot_cut_is_ignored_rather_than_filtering_everything_away(): void
    {
        $this->actingAs($this->owner())
            ->get('/settings/data/garments/types?category=SHIRT&style=three-quarter')
            ->assertInertia(fn ($page) => $page->where('selectedStyle', null));
    }

    public function test_the_pricing_page_says_which_garment_it_is_pricing(): void
    {
        $type = GarmentType::create([
            'category' => 'SHIRT',
            'style' => 'sleeveless',
            'code' => 'SH-VEST-2',
            'name' => 'เสื้อโปโล แขนกุด',
            'is_active' => true,
            'display_order' => 1,
        ]);

        // Opened from the list, the page carries what was already chosen on
        // the way here rather than asking for it a second time.
        $this->actingAs($this->owner())
            ->get("/settings/data/garments/prices?garment_type_id={$type->id}&category=SHIRT")
            ->assertInertia(fn ($page) => $page
                ->component('settings/data/garments/prices')
                ->where('selectedGarmentTypeName', 'เสื้อโปโล แขนกุด')
                ->where('selectedGarmentTypeStyle', 'sleeveless')
                ->where('selectedGarmentTypeCategory', 'SHIRT'));
    }
}
