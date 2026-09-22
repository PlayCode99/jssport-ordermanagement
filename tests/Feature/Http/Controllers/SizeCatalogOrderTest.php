<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\CatalogItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * The size lists are arranged by hand on the settings page and the order form
 * lists them exactly as arranged. The arrangement is the order the settings
 * page sends the list back in; a size added from anywhere joins the end.
 */
class SizeCatalogOrderTest extends TestCase
{
    use RefreshDatabase;

    private const KIDS = 'jssport.size-kids';

    private const ADULTS = 'jssport.size-adults';

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

    /** Seeds the sizes the way they were typed in: each later one newer than the last. */
    private function seedSizes(string $storageKey, string ...$names): void
    {
        foreach ($names as $index => $name) {
            CatalogItem::query()->create([
                'storage_key' => $storageKey,
                'item_id' => $index + 1,
                'name' => $name,
                'sort_order' => $index + 1,
                'created_by' => 'system',
                'active' => true,
                'created_at' => now()->addMinutes($index),
            ]);
        }
    }

    /** @return list<string> */
    private function formSizes(string $prop): array
    {
        $sizes = null;

        $this->actingAs($this->owner())->get('/orders/create')
            ->assertInertia(function (Assert $page) use ($prop, &$sizes): void {
                $sizes = $page->toArray()['props'][$prop];
                $page->etc();
            });

        return $sizes;
    }

    public function test_the_size_pages_are_sortable_and_list_the_saved_order(): void
    {
        $this->seedSizes(self::KIDS, 'JS', 'JM', 'JSS');

        $this->actingAs($this->owner())->get('/settings/data/size-kids')
            ->assertInertia(fn (Assert $page) => $page
                ->where('catalog.sortable', true)
                ->where('rows.0.name', 'JS')
                ->where('rows.1.name', 'JM')
                ->where('rows.2.name', 'JSS')
                ->etc());

        $this->actingAs($this->owner())->get('/settings/data/size-adults')
            ->assertInertia(fn (Assert $page) => $page->where('catalog.sortable', true)->etc());
    }

    public function test_the_job_names_page_is_not_sortable(): void
    {
        $this->actingAs($this->owner())->get('/settings/data/job-names')
            ->assertInertia(fn (Assert $page) => $page->where('catalog.sortable', false)->etc());
    }

    public function test_saving_the_list_in_a_new_order_is_what_moves_a_size(): void
    {
        $this->seedSizes(self::KIDS, 'JS', 'JM', 'JSS');

        $row = fn (int $id, string $name): array => [
            'id' => $id,
            'createdAt' => '2026-08-21T04:17:04Z',
            'name' => $name,
            'createdBy' => 'Owner01',
            'active' => true,
        ];

        $response = $this->actingAs($this->owner())->postJson('/settings/data/catalog-items/sync', [
            'storage_key' => self::KIDS,
            'rows' => [$row(3, 'JSS'), $row(1, 'JS'), $row(2, 'JM')],
        ]);

        $response->assertOk();
        // The screen gets the list back in the order it just arranged.
        $this->assertSame(['JSS', 'JS', 'JM'], array_column($response->json('rows'), 'name'));

        $this->assertDatabaseHas('catalog_items', ['storage_key' => self::KIDS, 'name' => 'JSS', 'sort_order' => 1]);
        $this->assertDatabaseHas('catalog_items', ['storage_key' => self::KIDS, 'name' => 'JS', 'sort_order' => 2]);
        $this->assertDatabaseHas('catalog_items', ['storage_key' => self::KIDS, 'name' => 'JM', 'sort_order' => 3]);
    }

    public function test_the_order_form_lists_sizes_in_the_arranged_order(): void
    {
        $this->seedSizes(self::KIDS, 'JS', 'JM', 'JSS', 'JL', 'JXL');
        $this->seedSizes(self::ADULTS, 'SS', 'M', 'L', 'S');

        // Arrange them the way they read on a rack, not the way they were typed.
        CatalogItem::query()->where('storage_key', self::KIDS)->where('name', 'JSS')->update(['sort_order' => 0]);
        CatalogItem::query()->where('storage_key', self::ADULTS)->where('name', 'S')->update(['sort_order' => 1]);
        CatalogItem::query()->where('storage_key', self::ADULTS)->where('name', 'SS')->update(['sort_order' => 0]);

        $this->assertSame(['JSS', 'JS', 'JM', 'JL', 'JXL'], $this->formSizes('kidsSizes'));
        $this->assertSame(['SS', 'S', 'M', 'L'], $this->formSizes('adultSizes'));
    }

    public function test_a_hidden_size_stays_off_the_form_without_disturbing_the_order(): void
    {
        $this->seedSizes(self::ADULTS, 'SS', 'S', 'M', 'L');
        CatalogItem::query()->where('storage_key', self::ADULTS)->where('name', 'S')->update(['active' => false]);

        $this->assertSame(['SS', 'M', 'L'], $this->formSizes('adultSizes'));
    }

    public function test_a_quick_added_entry_joins_the_end_of_its_list(): void
    {
        // Migrations seed the base colours under every colour key, so build
        // on whatever is there rather than assuming an empty list.
        $lastPosition = (int) CatalogItem::query()
            ->where('storage_key', 'jssport.shirt-neck-colors')
            ->max('sort_order');

        $this->actingAs($this->owner())->postJson('/settings/data/catalog-items/quick-add', [
            'storage_key' => 'jssport.shirt-neck-colors',
            'name' => 'ฟ้าใส',
        ])->assertOk();

        $this->assertDatabaseHas('catalog_items', [
            'storage_key' => 'jssport.shirt-neck-colors',
            'name' => 'ฟ้าใส',
            'sort_order' => $lastPosition + 1,
        ]);
    }
}
