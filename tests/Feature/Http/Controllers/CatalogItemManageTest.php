<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\Production\ProductionKanbanController;
use App\Models\Branch;
use App\Models\CatalogItem;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use ReflectionClass;
use Tests\TestCase;

/**
 * The sewing-spec master data is managed from the order form and nowhere else:
 * anyone who can open a bill may add to it, an owner or system admin may rename
 * or hide an entry, and hiding never takes a name away from a bill that used it.
 */
class CatalogItemManageTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'jssport.shirt-collars';

    protected function setUp(): void
    {
        parent::setUp();

        // Bills below are dated 2026-09-09 and may not be opened in the past.
        Carbon::setTestNow(Carbon::parse('2026-09-09 08:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function counterStaff(): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'access_role' => AccessRole::Counter,
            'station_department' => StationDepartment::None,
        ]);
    }

    private function owner(): User
    {
        return User::factory()->create([
            'role' => UserRole::Admin,
            'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None,
        ]);
    }

    private function collar(int $itemId, string $name, bool $active = true): CatalogItem
    {
        return CatalogItem::query()->create([
            'storage_key' => self::KEY,
            'item_id' => $itemId,
            'name' => $name,
            'created_by' => 'system',
            'active' => $active,
        ]);
    }

    public function test_an_owner_can_rename_an_entry(): void
    {
        $this->collar(7, 'ปกโปโล');

        $this->actingAs($this->owner())
            ->postJson('/settings/data/catalog-items/rename', [
                'storage_key' => self::KEY,
                'item_id' => 7,
                'name' => 'ปกโปโลมาตรฐาน',
            ])
            ->assertOk()
            ->assertJson(['item' => ['id' => 7, 'name' => 'ปกโปโลมาตรฐาน', 'active' => true]]);

        $this->assertDatabaseHas('catalog_items', ['storage_key' => self::KEY, 'item_id' => 7, 'name' => 'ปกโปโลมาตรฐาน']);
    }

    public function test_counter_staff_may_add_but_not_rename_or_hide(): void
    {
        $this->collar(7, 'ปกโปโล');
        $staff = $this->counterStaff();

        // Adding stays open to everyone who opens bills.
        $this->actingAs($staff)
            ->postJson('/settings/data/catalog-items/quick-add', ['storage_key' => self::KEY, 'name' => 'ปกจีน'])
            ->assertOk();

        $this->actingAs($staff)
            ->postJson('/settings/data/catalog-items/rename', ['storage_key' => self::KEY, 'item_id' => 7, 'name' => 'x'])
            ->assertForbidden();

        $this->actingAs($staff)
            ->postJson('/settings/data/catalog-items/hide', ['storage_key' => self::KEY, 'item_id' => 7])
            ->assertForbidden();

        $this->assertDatabaseHas('catalog_items', ['storage_key' => self::KEY, 'item_id' => 7, 'name' => 'ปกโปโล', 'active' => true]);
    }

    public function test_renaming_and_hiding_are_limited_to_the_spec_catalogs(): void
    {
        CatalogItem::query()->create([
            'storage_key' => 'jssport.size-kids', 'item_id' => 1, 'name' => 'JM', 'created_by' => 'system', 'active' => true,
        ]);

        $this->actingAs($this->owner())
            ->postJson('/settings/data/catalog-items/rename', ['storage_key' => 'jssport.size-kids', 'item_id' => 1, 'name' => 'JL'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['storage_key']);

        $this->actingAs($this->owner())
            ->postJson('/settings/data/catalog-items/hide', ['storage_key' => 'jssport.size-kids', 'item_id' => 1])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['storage_key']);
    }

    public function test_a_rename_cannot_collide_with_another_entry(): void
    {
        $this->collar(21, 'ปกเชิ้ต');
        $this->collar(22, 'ปกโปโล');

        $this->actingAs($this->owner())
            ->postJson('/settings/data/catalog-items/rename', ['storage_key' => self::KEY, 'item_id' => 22, 'name' => ' ปกเชิ้ต '])
            ->assertStatus(422)
            ->assertJson(['message' => 'มีชื่อนี้อยู่แล้ว']);

        $this->assertDatabaseHas('catalog_items', ['storage_key' => self::KEY, 'item_id' => 22, 'name' => 'ปกโปโล']);
    }

    public function test_hiding_keeps_the_row_and_only_retires_it(): void
    {
        $this->collar(7, 'ปกโปโล');

        $this->actingAs($this->owner())
            ->postJson('/settings/data/catalog-items/hide', ['storage_key' => self::KEY, 'item_id' => 7])
            ->assertOk()
            ->assertJson(['item' => ['id' => 7, 'name' => 'ปกโปโล', 'active' => false]]);

        // Retired, not deleted: the name is still on file for the bills that used it.
        $this->assertDatabaseHas('catalog_items', ['storage_key' => self::KEY, 'item_id' => 7, 'name' => 'ปกโปโล', 'active' => false]);
    }

    public function test_adding_a_hidden_name_again_brings_it_back(): void
    {
        $this->collar(7, 'ปกโปโล', active: false);

        $this->actingAs($this->counterStaff())
            ->postJson('/settings/data/catalog-items/quick-add', ['storage_key' => self::KEY, 'name' => 'ปกโปโล'])
            ->assertOk()
            ->assertJson(['item' => ['id' => 7, 'name' => 'ปกโปโล'], 'created' => false]);

        $this->assertDatabaseHas('catalog_items', ['storage_key' => self::KEY, 'item_id' => 7, 'active' => true]);
    }

    /**
     * A bill that picked collar 7, opened through the same endpoint the counter
     * posts to, with the name snapshot the form writes.
     */
    private function billUsingCollar(int $collarId, ?string $savedLabel): Order
    {
        $customer = Customer::create(['customer_code' => 'CUS-MNG', 'customer_name' => 'ลูกค้าทดสอบ']);
        $branch = Branch::create(['branch_code' => 'BR-MNG', 'branch_name' => 'สาขาทดสอบ']);

        $detail = [
            'schema' => 'spec-v2',
            'mode' => 'matrix',
            'shirt_specs' => ['shirt_type_id' => '1', 'collar_id' => (string) $collarId, 'fabric_color_id' => '1'],
        ];

        if ($savedLabel !== null) {
            $detail['spec_labels'] = ['shirt' => ['collar_id' => $savedLabel]];
        }

        $this->actingAs($this->owner())->post('/orders', [
            'customer_id' => $customer->id,
            'customer_name' => $customer->customer_name,
            'branch_id' => $branch->id,
            'job_name' => 'บิลทดสอบปก',
            'job_type' => 'งานสกรีน',
            'delivery_method' => 'pickup',
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(7)->toDateTimeString(),
            'discount_percent' => 0,
            'items' => [
                ['item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'short', 'quantity' => 3, 'unit_price' => 250],
            ],
            'specification' => [
                'pattern_id' => '1',
                'fabric_id' => '1',
                'screen_print_detail' => json_encode($detail, JSON_THROW_ON_ERROR),
            ],
        ])->assertSessionHasNoErrors();

        return Order::query()->latest('id')->firstOrFail();
    }

    /** @return array<int, array{label: string, value: string}> */
    private function counterShirtRows(Order $order): array
    {
        $controller = app(DashboardController::class);
        $method = (new ReflectionClass($controller))->getMethod('mapSpecificationSections');
        $method->setAccessible(true);

        return $method->invoke($controller, $order->specification?->toArray() ?? [])['shirt'];
    }

    /** @return array<int, array{label: string, value: string}> */
    private function productionShirtRows(Order $order): array
    {
        $controller = app(ProductionKanbanController::class);
        $method = (new ReflectionClass($controller))->getMethod('mapSpecificationSections');
        $method->setAccessible(true);

        return $method->invoke($controller, $order->specification?->toArray() ?? [])['shirt'];
    }

    private function collarValue(array $rows): ?string
    {
        foreach ($rows as $row) {
            if ($row['label'] === 'ปก') {
                return $row['value'];
            }
        }

        return null;
    }

    public function test_a_bill_keeps_its_collar_name_after_the_entry_is_hidden(): void
    {
        $this->collar(7, 'ปกโปโล');
        $order = $this->billUsingCollar(7, 'ปกโปโล');

        $this->actingAs($this->owner())
            ->postJson('/settings/data/catalog-items/hide', ['storage_key' => self::KEY, 'item_id' => 7])
            ->assertOk();

        // Neither the counter nor the floor may show the bill a bare "7".
        $this->assertSame('ปกโปโล', $this->collarValue($this->counterShirtRows($order)));
        $this->assertSame('ปกโปโล', $this->collarValue($this->productionShirtRows($order)));
    }

    public function test_a_bill_keeps_the_name_it_was_saved_with_after_a_rename(): void
    {
        $this->collar(7, 'ปกโปโล');
        $order = $this->billUsingCollar(7, 'ปกโปโล');

        $this->actingAs($this->owner())
            ->postJson('/settings/data/catalog-items/rename', ['storage_key' => self::KEY, 'item_id' => 7, 'name' => 'ปกโปโลใหม่'])
            ->assertOk();

        // What was printed stays what was printed.
        $this->assertSame('ปกโปโล', $this->collarValue($this->counterShirtRows($order)));
        $this->assertSame('ปกโปโล', $this->collarValue($this->productionShirtRows($order)));
    }

    public function test_an_old_bill_without_a_saved_name_still_resolves_a_hidden_entry(): void
    {
        $this->collar(7, 'ปกโปโล');
        // Written before the form kept names: only the id is on the bill.
        $order = $this->billUsingCollar(7, null);

        $this->actingAs($this->owner())
            ->postJson('/settings/data/catalog-items/hide', ['storage_key' => self::KEY, 'item_id' => 7])
            ->assertOk();

        $this->assertSame('ปกโปโล', $this->collarValue($this->counterShirtRows($order)));
        $this->assertSame('ปกโปโล', $this->collarValue($this->productionShirtRows($order)));
    }

    public function test_the_form_receives_hidden_entries_flagged_so_an_old_bill_can_still_show_them(): void
    {
        $this->collar(7, 'ปกโปโล');
        $this->collar(8, 'ปกจีน', active: false);

        $collars = $this->actingAs($this->owner())
            ->get('/orders/create')
            ->assertOk()
            ->viewData('page')['props']['shirtCatalogs']['collars'];

        // The seeded collars are in there too; what matters is that both of
        // these travel, each with its flag.
        $this->assertContains(['id' => 7, 'name' => 'ปกโปโล', 'active' => true], $collars);
        $this->assertContains(['id' => 8, 'name' => 'ปกจีน', 'active' => false], $collars);
    }

    public function test_the_retired_settings_pages_are_gone(): void
    {
        $owner = $this->owner();

        foreach ([
            '/settings/data/shirts',
            '/settings/data/shirts/patterns',
            '/settings/data/shirts/catalog/collars',
            '/settings/data/shirts/types',
            '/settings/data/pants',
            '/settings/data/pants/catalog/patterns',
        ] as $path) {
            $this->actingAs($owner)->get($path)->assertNotFound();
        }

        // The lists that still have a settings page keep it.
        $this->actingAs($owner)->get('/settings/data/size-kids')->assertOk();
        $this->actingAs($owner)->get('/settings/data/job-names')->assertOk();
    }
}
