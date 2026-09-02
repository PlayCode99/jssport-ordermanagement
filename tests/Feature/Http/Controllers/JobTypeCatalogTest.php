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
 * Job types are server-side master data. They used to live in each browser's
 * localStorage, which meant two machines could disagree about what existed and
 * a fresh deploy started empty.
 */
class JobTypeCatalogTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'jssport.job-types';

    protected function setUp(): void
    {
        parent::setUp();

        // Migrations ship the seven agreed job types. These cases each set up
        // their own catalog, so start from a clean key rather than on top of it.
        CatalogItem::query()->where('storage_key', self::KEY)->delete();
    }

    private function admin(): User
    {
        return User::factory()->create([
            'role' => UserRole::Admin,
            'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None,
            'is_active' => true,
            'branch_id' => null,
        ]);
    }

    private function seedTypes(string ...$names): void
    {
        foreach ($names as $index => $name) {
            CatalogItem::query()->create([
                'storage_key' => self::KEY,
                'item_id' => $index + 1,
                'name' => $name,
                'created_by' => 'system',
                'active' => true,
            ]);
        }
    }

    public function test_the_settings_page_serves_the_catalog_rows(): void
    {
        $this->seedTypes('งานปัก', 'งานสกรีน');

        $this->actingAs($this->admin())->get('/settings/data/job-types')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('settings/data/job-types/index')
                ->where('storageKey', self::KEY)
                ->count('rows', 2)
                ->etc());
    }

    public function test_the_order_form_offers_the_catalog_types(): void
    {
        $this->seedTypes('งานปัก', 'งานสกรีน', 'ซับลิเมชั่น');

        $this->actingAs($this->admin())->get('/orders/create')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->count('jobTypes', 3)
                ->where('jobTypes.0.name', 'งานปัก')
                ->where('jobTypes.2.name', 'ซับลิเมชั่น')
                ->etc());
    }

    public function test_an_inactive_type_is_not_offered_on_the_order_form(): void
    {
        $this->seedTypes('งานปัก', 'เลิกใช้แล้ว');
        CatalogItem::query()->where('storage_key', self::KEY)->where('name', 'เลิกใช้แล้ว')->update(['active' => false]);

        $this->actingAs($this->admin())->get('/orders/create')
            ->assertInertia(fn (Assert $page) => $page->count('jobTypes', 1)->etc());
    }

    public function test_the_dashboard_lists_a_configured_type_that_has_no_orders(): void
    {
        $this->seedTypes('งานปัก', 'ยังไม่มีงาน');

        $this->actingAs($this->admin())->get('/owner-dashboard')
            ->assertInertia(function (Assert $page) {
                $page->count('jobTypeBreakdown', 2)->etc();
                $page->count('filterOptions.jobTypes', 2)->etc();
            });
    }

    public function test_a_type_only_present_on_old_orders_is_still_reported(): void
    {
        // Nothing in the catalog, but an order already carries a type: the
        // report must not drop work that has actually been done.
        $this->seedTypes('งานปัก');

        \Illuminate\Support\Facades\DB::table('orders')->insert([
            'order_code' => 'ORD-LEGACY-1',
            'branch_id' => \App\Models\Branch::create(['branch_code' => 'BR-JT', 'branch_name' => 'JT'])->id,
            'customer_id' => \App\Models\Customer::create(['customer_code' => 'CUS-JT', 'customer_name' => 'JT'])->id,
            'creator_user_id' => $this->admin()->id,
            'job_name' => 'legacy',
            'job_type' => 'ประเภทเก่า',
            'order_date' => '2026-08-01 09:00:00',
            'due_date' => '2026-08-10 00:00:00',
            'total_amount' => 0, 'discount_percent' => 0, 'discount_amount' => 0, 'net_amount' => 0,
            'order_status' => 'confirmed',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($this->admin())->get('/owner-dashboard')
            ->assertInertia(fn (Assert $page) => $page->count('jobTypeBreakdown', 2)->etc());
    }

    public function test_the_order_form_falls_back_to_used_types_while_the_catalog_is_empty(): void
    {
        // No catalog rows at all — a site mid-migration must still be usable.
        \Illuminate\Support\Facades\DB::table('orders')->insert([
            'order_code' => 'ORD-LEGACY-2',
            'branch_id' => \App\Models\Branch::create(['branch_code' => 'BR-JT2', 'branch_name' => 'JT2'])->id,
            'customer_id' => \App\Models\Customer::create(['customer_code' => 'CUS-JT2', 'customer_name' => 'JT2'])->id,
            'creator_user_id' => $this->admin()->id,
            'job_name' => 'legacy',
            'job_type' => 'ประเภทเก่า',
            'order_date' => '2026-08-01 09:00:00',
            'due_date' => '2026-08-10 00:00:00',
            'total_amount' => 0, 'discount_percent' => 0, 'discount_amount' => 0, 'net_amount' => 0,
            'order_status' => 'confirmed',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertSame(0, CatalogItem::query()->where('storage_key', self::KEY)->count());

        $this->actingAs($this->admin())->get('/orders/create')
            ->assertInertia(fn (Assert $page) => $page
                ->count('jobTypes', 1)
                ->where('jobTypes.0.name', 'ประเภทเก่า')
                ->etc());
    }

    public function test_the_sync_endpoint_persists_job_types(): void
    {
        $this->actingAs($this->admin())->postJson('/settings/data/catalog-items/sync', [
            'storage_key' => self::KEY,
            'rows' => [
                ['id' => 1, 'createdAt' => '2026-09-01T09:00:00Z', 'name' => 'งานปัก', 'createdBy' => 'import', 'active' => true],
                ['id' => 2, 'createdAt' => '2026-09-01T09:00:00Z', 'name' => 'งานสกรีน', 'createdBy' => 'import', 'active' => true],
            ],
        ])->assertOk();

        $this->assertDatabaseHas('catalog_items', ['storage_key' => self::KEY, 'name' => 'งานปัก']);
        $this->assertDatabaseHas('catalog_items', ['storage_key' => self::KEY, 'name' => 'งานสกรีน']);
    }
}
