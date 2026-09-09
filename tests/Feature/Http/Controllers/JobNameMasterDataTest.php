<?php

namespace Tests\Feature\Http\Controllers;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Http\Controllers\ShirtCatalogController;
use App\Models\Branch;
use App\Models\CatalogItem;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * The order form's "ชื่อหน่วยงาน, ชื่องาน" field is master data the counter
 * can extend while writing a bill, like the fabric colours.
 *
 * It differs from the colour catalogs in one way that matters: orders.job_name
 * stores the text itself and the counter and dashboard searches match it with
 * LIKE, so the field must keep sending the name. Storing the catalog's id here
 * would silently break search on every order written afterwards.
 */
class JobNameMasterDataTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = ShirtCatalogController::JOB_NAMES_STORAGE_KEY;

    private function actingSalesUser(): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);
    }

    public function test_quick_add_saves_a_job_name_as_master_data(): void
    {
        $response = $this->actingAs($this->actingSalesUser())
            ->postJson('/settings/data/catalog-items/quick-add', [
                'storage_key' => self::KEY,
                'name' => 'โรงเรียนบ้านหนองบัว',
            ]);

        $response->assertOk();
        $response->assertJson(['created' => true]);

        $this->assertDatabaseHas('catalog_items', [
            'storage_key' => self::KEY,
            'name' => 'โรงเรียนบ้านหนองบัว',
            'active' => true,
        ]);
    }

    public function test_quick_add_does_not_duplicate_an_existing_job_name(): void
    {
        $user = $this->actingSalesUser();

        $first = $this->actingAs($user)->postJson('/settings/data/catalog-items/quick-add', [
            'storage_key' => self::KEY,
            'name' => 'เทศบาลเมือง',
        ]);

        // Same name, different spacing and case handling: the endpoint matches
        // on a trimmed, lower-cased comparison, so this must return the row
        // that already exists rather than adding a second one.
        $second = $this->actingAs($user)->postJson('/settings/data/catalog-items/quick-add', [
            'storage_key' => self::KEY,
            'name' => '  เทศบาลเมือง  ',
        ]);

        $second->assertOk();
        $second->assertJson(['created' => false]);
        $this->assertSame($first->json('item.id'), $second->json('item.id'));
        $this->assertSame(1, CatalogItem::query()
            ->where('storage_key', self::KEY)
            ->where('name', 'เทศบาลเมือง')
            ->count());
    }

    public function test_the_order_form_receives_the_saved_job_names(): void
    {
        CatalogItem::query()->create([
            'storage_key' => self::KEY,
            'item_id' => 1,
            'name' => 'โรงเรียนอนุบาลหนองบัวลำภู',
            'created_by' => 'system',
            'active' => true,
        ]);

        // Inactive rows are retired master data and must stay out of the form.
        CatalogItem::query()->create([
            'storage_key' => self::KEY,
            'item_id' => 2,
            'name' => 'หน่วยงานที่เลิกใช้',
            'created_by' => 'system',
            'active' => false,
        ]);

        $this->actingAs($this->actingSalesUser())
            ->get('/orders/create')
            ->assertInertia(fn (Assert $page) => $page
                ->component('Orders/Create')
                ->where('jobNames', [
                    ['id' => 1, 'name' => 'โรงเรียนอนุบาลหนองบัวลำภู'],
                ])
            );
    }

    public function test_the_order_form_starts_with_no_job_names_when_none_are_saved(): void
    {
        // Unlike the colour catalogs this key has no seeded fallback list, so
        // an empty catalog must reach the form as an empty array, not as
        // placeholder rows the shop never entered.
        $this->actingAs($this->actingSalesUser())
            ->get('/orders/create')
            ->assertInertia(fn (Assert $page) => $page
                ->component('Orders/Create')
                ->where('jobNames', [])
            );
    }

    /**
     * @return array{0: User, 1: Order}
     */
    private function orderNamed(string $jobName): array
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-JOBNAME-01',
            'customer_name' => 'ลูกค้าทดสอบ',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-JOBNAME-01',
            'branch_name' => 'สาขาทดสอบ',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
        ]);

        (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => $jobName,
            'job_type' => 'งานปัก',
            'order_date' => '2026-09-01 09:00:00',
            'due_date' => '2026-09-10 18:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => 'L',
                'quantity' => 4,
                'unit_price' => 50,
            ]],
        ], $creator->id);

        return [$creator, Order::query()->firstOrFail()];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function syncRows(User $user, array $rows): TestResponse
    {
        return $this->actingAs($user)->postJson('/settings/data/catalog-items/sync', [
            'storage_key' => self::KEY,
            'rows' => $rows,
        ]);
    }

    public function test_the_settings_page_lists_saved_job_names_including_retired_ones(): void
    {
        foreach ([[1, 'โรงเรียนบ้านโนนสูง', true], [2, 'หน่วยงานที่เลิกใช้', false]] as [$id, $name, $active]) {
            CatalogItem::query()->create([
                'storage_key' => self::KEY,
                'item_id' => $id,
                'name' => $name,
                'created_by' => 'system',
                'active' => $active,
            ]);
        }

        $this->actingAs($this->actingSalesUser())
            ->get('/settings/data/job-names')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('settings/data/shirts/catalog')
                ->where('catalog.storageKey', self::KEY)
                ->where('catalog.routePath', '/settings/data/job-names')
                ->where('catalog.title', 'ชื่อหน่วยงาน, ชื่องาน')
                // Retired names must still be listed, otherwise there is no way
                // to switch one back on from this screen.
                ->has('rows', 2)
            );
    }

    public function test_renaming_a_job_name_leaves_orders_already_written_untouched(): void
    {
        [$user, $order] = $this->orderNamed('โรงเรียนเก่า');

        CatalogItem::query()->create([
            'storage_key' => self::KEY,
            'item_id' => 1,
            'name' => 'โรงเรียนเก่า',
            'created_by' => 'system',
            'active' => true,
        ]);

        $this->syncRows($user, [[
            'id' => 1,
            'createdAt' => '2026-09-01T09:00:00+07:00',
            'name' => 'โรงเรียนใหม่',
            'createdBy' => 'system',
            'active' => true,
        ]])->assertOk();

        $this->assertDatabaseHas('catalog_items', [
            'storage_key' => self::KEY,
            'item_id' => 1,
            'name' => 'โรงเรียนใหม่',
        ]);

        // The order keeps its own copy of the text; renaming master data must
        // never rewrite bills that were already issued.
        $this->assertSame('โรงเรียนเก่า', $order->fresh()?->job_name);
    }

    public function test_deleting_the_last_job_name_empties_the_catalog_without_touching_orders(): void
    {
        [$user, $order] = $this->orderNamed('โรงเรียนเก่า');

        CatalogItem::query()->create([
            'storage_key' => self::KEY,
            'item_id' => 1,
            'name' => 'โรงเรียนเก่า',
            'created_by' => 'system',
            'active' => true,
        ]);

        // Deleting the only remaining row sends an empty list. This has to be
        // accepted: a shop that mistypes its first job name would otherwise be
        // stuck with it forever, and the screen hides the row either way.
        $this->syncRows($user, [])->assertOk();

        $this->assertSame(0, CatalogItem::query()->where('storage_key', self::KEY)->count());
        $this->assertSame('โรงเรียนเก่า', $order->fresh()?->job_name);
    }
}
