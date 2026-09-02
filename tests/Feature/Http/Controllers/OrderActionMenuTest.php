<?php

namespace Tests\Feature\Http\Controllers;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\RoutingStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderRouting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;
use Illuminate\Support\Facades\Storage;

/**
 * Covers the counter row "Action" menu: ลบ (delete) and เปิดบิลอีกครั้ง
 * (duplicate). Deleting is admin-only and blocked once production has started,
 * so the authorisation rules here are the security-relevant part.
 */
class OrderActionMenuTest extends TestCase
{
    use RefreshDatabase;

    /**
     * store() requires a specification block; the values themselves are not
     * what these tests are about.
     *
     * @var array<string, string>
     */
    private const SPECIFICATION = [
        'pattern_id' => '1',
        'fabric_id' => '1',
        'screen_print_detail' => '{"schema":"spec-v2"}',
    ];

    private Customer $customer;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();

        // Artwork uploads would otherwise land in the real storage directory and
        // pile up as orphaned files every time the suite runs.
        Storage::fake('public');

        Carbon::setTestNow(Carbon::parse('2026-08-01 08:00:00', 'Asia/Bangkok'));

        $this->customer = Customer::create([
            'customer_code' => 'CUS-ACT-1',
            'customer_name' => 'Action Menu Customer',
        ]);

        $this->branch = Branch::create([
            'branch_code' => 'BR-ACT-1',
            'branch_name' => 'Action Menu Branch',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function user(UserRole $role): User
    {
        return User::factory()->create([
            'role' => $role,
            'station_department' => StationDepartment::None,
            'branch_id' => $this->branch->id,
        ]);
    }

    private function makeOrder(User $creator, array $overrides = []): Order
    {
        $order = (new CreateOrderAction())->execute(array_merge([
            'customer_id' => $this->customer->id,
            'branch_id' => $this->branch->id,
            'job_name' => 'Action Menu Order',
            'job_type' => 'งานปัก',
            'order_date' => '2026-07-11 09:30:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L',
                'quantity' => 12, 'unit_price' => 50,
            ]],
        ], $overrides), $creator->id);

        return Order::query()->findOrFail($order->id);
    }

    private function startProduction(Order $order): void
    {
        $routing = OrderRouting::query()->where('order_id', $order->id)->where('is_required', true)->firstOrFail();
        DB::table('order_routings')->where('id', $routing->id)->update(['status' => RoutingStatus::InProgress->value]);
    }

    // ---------------- ลบ ----------------

    public function test_admin_can_soft_delete_an_order_that_has_not_entered_production(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $this->actingAs($admin)->delete("/orders/{$order->id}")->assertRedirect();

        $this->assertSoftDeleted('orders', ['id' => $order->id]);
    }

    public function test_sales_cannot_delete_an_order(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);

        $this->actingAs($sales)->delete("/orders/{$order->id}")->assertForbidden();

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'deleted_at' => null]);
    }

    public function test_admin_cannot_delete_an_order_already_in_production(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);
        $this->startProduction($order);

        $this->actingAs($admin)->delete("/orders/{$order->id}")->assertForbidden();

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'deleted_at' => null]);
    }

    public function test_deleting_requires_authentication(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $this->delete("/orders/{$order->id}")->assertRedirect('/login');

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'deleted_at' => null]);
    }

    public function test_a_deleted_order_disappears_from_the_counter(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $this->actingAs($admin)->get('/counter')
            ->assertInertia(fn (Assert $page) => $page->where('pagination.total', 1));

        $this->actingAs($admin)->delete("/orders/{$order->id}");

        $this->actingAs($admin)->get('/counter')
            ->assertInertia(fn (Assert $page) => $page->where('pagination.total', 0));
    }

    // ---------------- เปิดบิลอีกครั้ง ----------------

    public function test_duplicate_form_carries_the_details_but_drops_the_identity(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin, ['job_name' => 'งานต้นฉบับ']);

        $this->actingAs($admin)->get("/orders/{$order->id}/duplicate")
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Orders/Create')
                // No id / order_code -> the form submits as a brand-new bill.
                ->where('order.id', null)
                ->where('order.order_code', null)
                ->where('order.duplicate_from_id', $order->id)
                // ...but every detail is still there and editable.
                ->where('order.job_name', 'งานต้นฉบับ')
                ->where('order.customer_id', $this->customer->id)
                ->where('order.items.0.quantity', 12)
                // Money never carries over to a new bill.
                ->where('order.deposit_amount', 0)
                ->where('order.order_status', null)
                // The original delivery date has usually passed by now, so the
                // user has to choose a fresh one.
                ->where('order.due_date', '')
                ->etc());
    }

    public function test_duplicate_is_blocked_for_roles_that_cannot_create_orders(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);
        $worker = $this->user(UserRole::Worker);

        $this->actingAs($worker)->get("/orders/{$order->id}/duplicate")->assertForbidden();
    }

    public function test_duplicate_stays_available_after_production_has_started(): void
    {
        // Re-ordering a job that already ran is the main reason this exists,
        // so unlike edit/delete it must not be gated on production progress.
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);
        $this->startProduction($order);

        $this->actingAs($admin)->get("/orders/{$order->id}/duplicate")->assertOk();
    }

    public function test_saving_a_duplicate_creates_a_second_order_with_a_new_code(): void
    {
        $admin = $this->user(UserRole::Admin);
        $source = $this->makeOrder($admin);

        $response = $this->actingAs($admin)->post('/orders', [
            'duplicate_from_id' => $source->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->customer_name,
            'branch_id' => $this->branch->id,
            'job_name' => 'Action Menu Order',
            'job_type' => 'งานปัก',
            'order_date' => '2026-08-01 10:15:00',
            'due_date' => '2026-08-10 00:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L',
                'quantity' => 12, 'unit_price' => 50,
            ]],
            'specification' => self::SPECIFICATION,
        ]);

        $response->assertSessionHasNoErrors();
        $response->assertRedirect();

        $this->assertSame(2, Order::query()->count());

        $copy = Order::query()->whereKeyNot($source->id)->firstOrFail();
        $this->assertNotSame($source->order_code, $copy->order_code);
        $this->assertSame('Action Menu Order', $copy->job_name);
    }

    public function test_saving_a_duplicate_copies_the_artwork_without_touching_the_original(): void
    {
        $admin = $this->user(UserRole::Admin);

        $source = $this->makeOrder($admin, [
            'shirt_artwork' => [UploadedFile::fake()->image('shirt-a.jpg'), UploadedFile::fake()->image('shirt-b.jpg')],
        ]);

        $this->assertCount(2, $source->getMedia('shirt_artwork'));

        $this->actingAs($admin)->post('/orders', [
            'duplicate_from_id' => $source->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->customer_name,
            'branch_id' => $this->branch->id,
            'job_name' => 'Action Menu Order',
            'job_type' => 'งานปัก',
            'order_date' => '2026-08-01 10:15:00',
            'due_date' => '2026-08-10 00:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'L',
                'quantity' => 12, 'unit_price' => 50,
            ]],
            'specification' => self::SPECIFICATION,
        ])->assertSessionHasNoErrors()->assertRedirect();

        $copy = Order::query()->whereKeyNot($source->id)->firstOrFail();

        $this->assertCount(2, $copy->getMedia('shirt_artwork'));
        // Copied, not moved: the original bill keeps its own images.
        $this->assertCount(2, $source->fresh()->getMedia('shirt_artwork'));
    }
}
