<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\CatalogItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CatalogItemQuickAddTest extends TestCase
{
    use RefreshDatabase;

    private function actingSalesUser(): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);
    }

    public function test_quick_add_creates_a_new_master_data_row_for_an_allowed_key(): void
    {
        $user = $this->actingSalesUser();

        $response = $this->actingAs($user)->postJson('/settings/data/catalog-items/quick-add', [
            'storage_key' => 'jssport.shirt-fabric-colors',
            'name' => 'ฟ้าใส',
        ]);

        $response->assertOk();
        $response->assertJson(['created' => true]);
        $response->assertJsonStructure(['item' => ['id', 'name'], 'created']);

        $this->assertDatabaseHas('catalog_items', [
            'storage_key' => 'jssport.shirt-fabric-colors',
            'name' => 'ฟ้าใส',
            'active' => true,
        ]);

        // The create_catalog_items_table migration seeds four base colors under
        // 'jssport.shirt-colors', which the split migration copies into every
        // per-field color key — so look the new row up by name rather than
        // assuming this key started empty.
        $item = CatalogItem::query()
            ->where('storage_key', 'jssport.shirt-fabric-colors')
            ->where('name', 'ฟ้าใส')
            ->firstOrFail();
        $this->assertSame((int) $item->item_id, $response->json('item.id'));
        $this->assertSame('ฟ้าใส', $response->json('item.name'));
    }

    public function test_quick_add_assigns_incrementing_item_ids_scoped_per_storage_key(): void
    {
        $user = $this->actingSalesUser();

        // Seed a far-higher item_id under a completely different key: if the
        // numbering ever leaked across keys, the ids below would jump to 100/101
        // instead of continuing this key's own sequence.
        CatalogItem::query()->create([
            'storage_key' => 'jssport.shirt-neck-colors',
            'item_id' => 99,
            'name' => 'มีอยู่แล้ว',
            'created_by' => 'system',
            'active' => true,
        ]);

        // Migration-seeded baseline for this key (currently the four base colors).
        $maxBefore = (int) CatalogItem::query()
            ->where('storage_key', 'jssport.shirt-fabric-colors')
            ->max('item_id');

        $first = $this->actingAs($user)->postJson('/settings/data/catalog-items/quick-add', [
            'storage_key' => 'jssport.shirt-fabric-colors',
            'name' => 'สีที่ 1',
        ])->json('item.id');

        $second = $this->actingAs($user)->postJson('/settings/data/catalog-items/quick-add', [
            'storage_key' => 'jssport.shirt-fabric-colors',
            'name' => 'สีที่ 2',
        ])->json('item.id');

        $this->assertSame($maxBefore + 1, $first);
        $this->assertSame($maxBefore + 2, $second);
    }

    public function test_quick_add_returns_the_existing_row_instead_of_creating_a_duplicate(): void
    {
        $user = $this->actingSalesUser();

        // item_id 1 is already taken by the migration-seeded colors, so pick a
        // free id above the seeded range rather than colliding with the
        // (storage_key, item_id) unique constraint.
        $existing = CatalogItem::query()->create([
            'storage_key' => 'jssport.shirt-screen-colors',
            'item_id' => 50,
            'name' => 'แดงสด',
            'created_by' => 'system',
            'active' => true,
        ]);

        $countBefore = CatalogItem::query()->where('storage_key', 'jssport.shirt-screen-colors')->count();

        // Same casing, extra surrounding whitespace — should be treated as a duplicate.
        $response = $this->actingAs($user)->postJson('/settings/data/catalog-items/quick-add', [
            'storage_key' => 'jssport.shirt-screen-colors',
            'name' => '  แดงสด  ',
        ]);

        $response->assertOk();
        $response->assertJson([
            'created' => false,
            'item' => ['id' => $existing->item_id, 'name' => 'แดงสด'],
        ]);

        // No new row was added.
        $this->assertSame(
            $countBefore,
            CatalogItem::query()->where('storage_key', 'jssport.shirt-screen-colors')->count(),
        );
    }

    public function test_quick_add_rejects_a_storage_key_outside_the_allowed_whitelist(): void
    {
        $user = $this->actingSalesUser();

        // A real, pre-existing catalog key that this endpoint must never be
        // allowed to write to: the size lists are edited on their settings
        // page through the full sync endpoint, never from the order form.
        $response = $this->actingAs($user)->postJson('/settings/data/catalog-items/quick-add', [
            'storage_key' => 'jssport.size-kids',
            'name' => 'พยายามแทรกข้อมูล',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['storage_key']);

        $this->assertDatabaseMissing('catalog_items', [
            'storage_key' => 'jssport.size-kids',
            'name' => 'พยายามแทรกข้อมูล',
        ]);
    }

    public function test_quick_add_rejects_an_empty_or_missing_name(): void
    {
        $user = $this->actingSalesUser();

        $countBefore = CatalogItem::query()->count();

        $response = $this->actingAs($user)->postJson('/settings/data/catalog-items/quick-add', [
            'storage_key' => 'jssport.shirt-embroidery-colors',
            'name' => '   ',
        ]);

        $response->assertStatus(422);

        // The table is never empty (migrations seed it), so assert that this
        // request specifically wrote nothing.
        $this->assertSame($countBefore, CatalogItem::query()->count());
    }

    public function test_quick_add_requires_authentication(): void
    {
        $countBefore = CatalogItem::query()->count();

        $response = $this->postJson('/settings/data/catalog-items/quick-add', [
            'storage_key' => 'jssport.shirt-fabric-colors',
            'name' => 'ไม่ล็อกอิน',
        ]);

        $response->assertStatus(401);
        $this->assertSame($countBefore, CatalogItem::query()->count());
        $this->assertDatabaseMissing('catalog_items', ['name' => 'ไม่ล็อกอิน']);
    }
}
