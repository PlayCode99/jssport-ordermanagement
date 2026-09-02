<?php

namespace Tests\Feature\Http\Controllers;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\OrderStatus;
use App\Enums\RoutingStatus;
use App\Enums\StationDepartment;
use App\Enums\AccessRole;
use App\Enums\UserRole;
use App\Http\Requests\StoreOrderRequest;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderRouting;
use App\Models\OrderStatusHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Testing\AssertableInertia as Assert;
use Illuminate\Support\Facades\Validator;
use Illuminate\Routing\Router;
use Tests\TestCase;
use Illuminate\Support\Facades\Storage;

class OrderAndQcEndpointSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Artwork uploads would otherwise land in the real storage directory and
        // pile up as orphaned files every time the suite runs.
        Storage::fake('public');

        // These cases pin their billing dates to fixed July 2026 values. Real
        // time has since moved past them, which would trip the "a new bill may
        // not be opened in the past" rule for reasons that have nothing to do
        // with what each case is actually asserting — so pin the clock too.
        Carbon::setTestNow(Carbon::parse('2026-07-11 08:00:00'));

        $this->registerFallbackTestRoutes();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_order_store_endpoint_enforces_zero_trust_math_via_http(): void
    {
        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-E2E-001',
            'customer_name' => 'E2E Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'HQ-001',
            'branch_name' => 'Main Factory & HQ',
        ]);

        $payload = [
            'customer_id' => $customer->id,
            'customer_name' => $customer->customer_name,
            'branch_id' => $branch->id,
            'job_name' => 'E2E Uniform Order',
            'job_type' => 'uniform',
            'order_date' => '2026-07-11 08:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'total_amount' => 5.00,
            'net_amount' => 5.00,
            'items' => [
                [
                    'item_type' => 'shirt',
                    'size_group' => 'adults',
                    'size_label' => 'M',
                    'quantity' => 10,
                    'unit_price' => 100.00,
                    'total_price' => 5.00,
                ],
            ],
            'specification' => [
                'pattern_id' => 1,
                'fabric_id' => 2,
                'neck_style_id' => 3,
                'leg_style' => 'straight',
                'screen_print_detail' => 'spec ok',
            ],
            'routings' => ['design', 'sewing', 'qc'],
        ];

        $response = $this->actingAs($salesUser)->postJson('/orders', $payload);

        $this->assertContains($response->status(), [201, 302]);

        $order = Order::with('items')->firstOrFail();
        $item = $order->items->firstOrFail();

        $this->assertSame(1000.0, (float) $order->total_amount);
        $this->assertSame(1000.0, (float) $order->net_amount);
        $this->assertSame(1000.0, (float) $item->total_price);
        $this->assertNotSame(5.0, (float) $order->total_amount);
        $this->assertNotSame(5.0, (float) $order->net_amount);
        $this->assertNotSame(5.0, (float) $item->total_price);
    }

    public function test_order_store_endpoint_rejects_missing_specification_details(): void
    {
        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-E2E-003',
            'customer_name' => 'Missing Spec Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'HQ-003',
            'branch_name' => 'Missing Spec Branch',
        ]);

        $response = $this->actingAs($salesUser)->postJson('/orders', [
            'customer_id' => $customer->id,
            'customer_name' => $customer->customer_name,
            'branch_id' => $branch->id,
            'job_name' => 'Missing Spec Order',
            'job_type' => 'uniform',
            'order_date' => '2026-07-11 08:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => 'M',
                'quantity' => 1,
                'unit_price' => 100.00,
            ]],
            'specification' => [
                'screen_print_detail' => 'missing required fields',
            ],
            'routings' => ['design', 'sewing', 'qc'],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['specification.pattern_id']);

        $this->assertDatabaseCount('orders', 0);
    }

    public function test_order_store_endpoint_returns_403_for_unauthorized_role(): void
    {
        $workerUser = User::factory()->create([
            'role' => UserRole::Worker,
            'station_department' => StationDepartment::Cutting,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-E2E-002',
            'customer_name' => 'Unauthorized Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'HQ-002',
            'branch_name' => 'Unauthorized Branch',
        ]);

        $response = $this->actingAs($workerUser)->postJson('/orders', [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Blocked Order',
            'job_type' => 'uniform',
            'order_date' => '2026-07-11 08:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => 'M',
                'quantity' => 1,
                'unit_price' => 100.00,
            ]],
        ]);

        $response->assertForbidden();
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_order_create_page_shows_only_the_current_branch_for_non_branch_01_users(): void
    {
        $branch01 = Branch::create([
            'branch_code' => '01',
            'branch_name' => 'Nong Bua Lamphu',
        ]);

        $branch02 = Branch::create([
            'branch_code' => '02',
            'branch_name' => 'Khon Kaen',
        ]);

        $user = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'access_role' => AccessRole::Counter,
            'branch_id' => $branch02->id,
        ]);

        $response = $this->actingAs($user)->get(route('orders.create'));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Orders/Create')
            ->has('branches', 1)
            ->where('branches.0.id', $branch02->id)
        );

        $this->assertNotSame($branch01->id, $branch02->id);
    }

    public function test_branch_01_user_can_see_all_branches_on_order_create_page(): void
    {
        // Orders keeps the head-office exception (unlike Kanban/Dashboard,
        // which use applyStrictBranchScope()): branch 01 (Nong Bua Lamphu)
        // sees every branch's order data here.
        $branch01 = Branch::create([
            'branch_code' => '01',
            'branch_name' => 'Nong Bua Lamphu',
        ]);

        $branch02 = Branch::create([
            'branch_code' => '02',
            'branch_name' => 'Khon Kaen',
        ]);

        $user = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'access_role' => AccessRole::Owner,
            'branch_id' => $branch01->id,
        ]);

        $response = $this->actingAs($user)->get(route('orders.create'));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Orders/Create')
            ->has('branches', 2)
        );

        $this->assertNotSame($branch01->id, $branch02->id);
    }

    public function test_branch_01_user_sees_every_branch_order_on_order_list_page(): void
    {
        // Same head-office exception on the Orders list itself (not just the
        // create-page branch dropdown): branch 01 sees orders from every
        // branch here, unlike Kanban/Dashboard which stay strictly scoped.
        $branch01 = Branch::create([
            'branch_code' => '01',
            'branch_name' => 'Nong Bua Lamphu',
        ]);

        $branch02 = Branch::create([
            'branch_code' => '02',
            'branch_name' => 'Khon Kaen',
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-B01-LIST',
            'customer_name' => 'Branch List Customer',
        ]);

        $user = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'access_role' => AccessRole::Owner,
            'branch_id' => $branch01->id,
        ]);

        Order::create([
            'order_code' => 'ORD-B01-LIST-001',
            'customer_id' => $customer->id,
            'branch_id' => $branch01->id,
            'creator_user_id' => $user->id,
            'job_name' => 'Branch 01 Order',
            'job_type' => 'uniform',
            'order_date' => now(),
            'due_date' => now()->addDays(3),
            'order_status' => OrderStatus::Confirmed,
        ]);

        Order::create([
            'order_code' => 'ORD-B02-LIST-001',
            'customer_id' => $customer->id,
            'branch_id' => $branch02->id,
            'creator_user_id' => $user->id,
            'job_name' => 'Branch 02 Order',
            'job_type' => 'uniform',
            'order_date' => now(),
            'due_date' => now()->addDays(3),
            'order_status' => OrderStatus::Confirmed,
        ]);

        $response = $this->actingAs($user)->get(route('orders.index'));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Orders/Index')
            ->has('orders.data', 2)
        );
    }

    public function test_non_branch_01_user_sees_only_own_branch_order_on_order_list_page(): void
    {
        $branch01 = Branch::create([
            'branch_code' => '01',
            'branch_name' => 'Nong Bua Lamphu',
        ]);

        $branch02 = Branch::create([
            'branch_code' => '02',
            'branch_name' => 'Khon Kaen',
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-B02-LIST',
            'customer_name' => 'Branch List Customer 2',
        ]);

        $user = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'access_role' => AccessRole::Counter,
            'branch_id' => $branch02->id,
        ]);

        Order::create([
            'order_code' => 'ORD-B01-LIST-002',
            'customer_id' => $customer->id,
            'branch_id' => $branch01->id,
            'creator_user_id' => $user->id,
            'job_name' => 'Branch 01 Order',
            'job_type' => 'uniform',
            'order_date' => now(),
            'due_date' => now()->addDays(3),
            'order_status' => OrderStatus::Confirmed,
        ]);

        Order::create([
            'order_code' => 'ORD-B02-LIST-002',
            'customer_id' => $customer->id,
            'branch_id' => $branch02->id,
            'creator_user_id' => $user->id,
            'job_name' => 'Branch 02 Order',
            'job_type' => 'uniform',
            'order_date' => now(),
            'due_date' => now()->addDays(3),
            'order_status' => OrderStatus::Confirmed,
        ]);

        $response = $this->actingAs($user)->get(route('orders.index'));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Orders/Index')
            ->has('orders.data', 1)
            ->where('orders.data.0.order_code', 'ORD-B02-LIST-002')
        );
    }

    public function test_order_edit_page_prefills_existing_order_data(): void
    {
        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-E2E-011',
            'customer_name' => 'Prefill Customer',
            'phone' => '0811112222',
            'line_fb' => 'prefillline',
        ]);

        $branch = Branch::create([
            'branch_code' => '03',
            'branch_name' => 'Khon Kaen Plaza',
        ]);

        $order = Order::create([
            'order_code' => 'ORD-EDIT-001',
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $salesUser->id,
            'job_name' => 'Edit Prefill Job',
            'job_type' => 'uniform',
            'delivery_method' => 'shipping',
            'shipping_address' => '123 Prefill Street',
            'order_date' => '2026-07-11 08:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'total_amount' => 1200,
            'discount_percent' => 10,
            'discount_amount' => 120,
            'net_amount' => 1080,
            'order_status' => OrderStatus::Confirmed,
        ]);

        $order->specification()->create([
            'pattern_id' => 1,
            'fabric_id' => 2,
            'neck_style_id' => 3,
            'screen_print_detail' => json_encode([
                'shirt_specs' => [
                    'pattern_id' => '1',
                    'fabric_id' => '2',
                    'neck_style_id' => '3',
                    'screen_text' => 'Hello World',
                ],
                'pants_specs' => [],
                'personalization_rows' => [],
            ]),
        ]);

        $order->items()->create([
            'item_type' => 'garment',
            'size_group' => 'adults',
            'size_label' => 'M',
            'quantity' => 5,
            'unit_price' => 200,
            'total_price' => 1000,
        ]);

        $response = $this->actingAs($salesUser)->get(route('orders.edit', ['order' => $order]));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Orders/Create')
            ->where('order.id', $order->id)
            ->where('order.customer_name', $customer->customer_name)
            ->where('order.job_name', 'Edit Prefill Job')
            ->where('order.delivery_method', 'shipping')
            ->where('order.shipping_address', '123 Prefill Street')
        );
    }

    public function test_order_create_page_includes_daily_capacity_and_due_date_loads(): void
    {
        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-CAPACITY-001',
            'customer_name' => 'Capacity Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'CAP-01',
            'branch_name' => 'Capacity Branch',
        ]);

        $order = Order::create([
            'order_code' => 'ORD-CAPACITY-001',
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $salesUser->id,
            'job_name' => 'Capacity Order',
            'job_type' => 'uniform',
            'order_date' => now(),
            'due_date' => now()->addDays(5),
            'order_status' => OrderStatus::Confirmed,
        ]);

        $order->items()->create([
            'item_type' => 'garment',
            'size_group' => 'adults',
            'size_label' => 'M',
            'quantity' => 200,
            'unit_price' => 100,
            'total_price' => 20000,
        ]);

        $response = $this->actingAs($salesUser)->get(route('orders.create'));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Orders/Create')
            ->where('dailyProductionCapacity', 200)
            ->has('deliveryDateLoads', 1)
            ->where('deliveryDateLoads.0.date', now()->addDays(5)->toDateString())
            ->where('deliveryDateLoads.0.total_quantity', 200)
        );
    }

    public function test_order_store_redirects_to_counter_fallback_with_business_valid_size_label_length(): void
    {
        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'current_team_id' => null,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-E2E-010',
            'customer_name' => 'Valid Size Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => '02',
            'branch_name' => 'Khon Kaen',
        ]);

        $payload = [
            'customer_id' => $customer->id,
            'customer_name' => $customer->customer_name,
            'branch_id' => $branch->id,
            'job_name' => 'Valid Size Order',
            'job_type' => 'uniform',
            'order_date' => '2026-07-11 08:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => 'ทดสอบผู้ใหญ่',
                'quantity' => 1,
                'unit_price' => 100.00,
            ]],
            'specification' => [
                'pattern_id' => 1,
                'fabric_id' => 2,
                'neck_style_id' => 3,
                'leg_style' => 'straight',
                'screen_print_detail' => 'spec ok',
            ],
            'routings' => ['design', 'sewing', 'qc'],
        ];

        $response = $this->actingAs($salesUser)
            ->withHeaders(['X-Inertia' => 'true'])
            ->post(route('orders.store'), $payload);

        $expectedRedirect = is_string($salesUser->currentTeam?->slug) && $salesUser->currentTeam->slug !== ''
            ? route('counter.index', ['current_team' => $salesUser->currentTeam->slug])
            : route('counter.fallback');

        $response->assertRedirect($expectedRedirect);
        $this->assertDatabaseHas('orders', [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Valid Size Order',
        ]);
    }

    public function test_order_store_rejects_size_labels_over_the_business_limit(): void
    {
        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-E2E-011',
            'customer_name' => 'Too Long Size Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => '02',
            'branch_name' => 'Khon Kaen',
        ]);

        $response = $this->actingAs($salesUser)->post(route('orders.store'), [
            'customer_id' => $customer->id,
            'customer_name' => $customer->customer_name,
            'branch_id' => $branch->id,
            'job_name' => 'Too Long Size Order',
            'job_type' => 'uniform',
            'order_date' => '2026-07-11 08:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => str_repeat('A', 51),
                'quantity' => 1,
                'unit_price' => 100.00,
            ]],
            'specification' => [
                'pattern_id' => 1,
                'fabric_id' => 2,
                'neck_style_id' => 3,
                'leg_style' => 'straight',
                'screen_print_detail' => 'spec ok',
            ],
            'routings' => ['design', 'sewing', 'qc'],
        ]);

        $response->assertSessionHasErrors('items.0.size_label');
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_order_store_accepts_form_1_adult_size_table_for_non_branch_01_users(): void
    {
        $branch = Branch::create([
            'branch_code' => '02',
            'branch_name' => 'Khon Kaen',
        ]);

        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-F1-001',
            'customer_name' => 'Form 1 Customer',
        ]);

        $payload = $this->buildForm1Payload($customer, $branch, 'ทดสอบผู้ใหญ่');

        $response = $this->actingAs($salesUser)->postJson('/orders', $payload);

        $response->assertCreated();

        $this->assertDatabaseHas('orders', [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Form 1 Adult Order',
        ]);

        $this->assertDatabaseHas('order_items', [
            'size_label' => 'ทดสอบผู้ใหญ่',
            'quantity' => 1,
        ]);
    }

    public function test_order_store_accepts_form_1_adult_size_table_for_branch_01_users(): void
    {
        $branch = Branch::create([
            'branch_code' => '01',
            'branch_name' => 'Nong Bua Lamphu',
        ]);

        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-F1-002',
            'customer_name' => 'Form 1 Branch 01 Customer',
        ]);

        $payload = $this->buildForm1Payload($customer, $branch, 'ทดสอบผู้ใหญ่');

        $response = $this->actingAs($salesUser)->postJson('/orders', $payload);

        $response->assertCreated();

        $this->assertDatabaseHas('orders', [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Form 1 Adult Order',
        ]);
    }

    public function test_order_store_accepts_all_three_artwork_fields_without_overwriting_channels(): void
    {
        $branch = Branch::create([
            'branch_code' => '02',
            'branch_name' => 'Khon Kaen',
        ]);

        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-F1-ART-001',
            'customer_name' => 'Artwork HTTP Customer',
        ]);

        $payload = $this->buildForm1Payload($customer, $branch, 'ทดสอบผู้ใหญ่');
        $payload['design_artwork'] = UploadedFile::fake()->image('general-art.jpg', 140, 140);
        // shirt_artwork/pants_artwork now accept multiple images per order, so the
        // request field is an array of files rather than a single file.
        $payload['shirt_artwork'] = [
            UploadedFile::fake()->image('shirt-art-1.jpg', 140, 140),
            UploadedFile::fake()->image('shirt-art-2.jpg', 140, 140),
        ];
        $payload['pants_artwork'] = [
            UploadedFile::fake()->image('pants-art.jpg', 140, 140),
        ];

        $response = $this->actingAs($salesUser)->post('/orders', $payload);

        $this->assertContains($response->status(), [201, 302]);

        $order = Order::query()->latest('id')->firstOrFail();

        $this->assertNotNull($order->getFirstMedia('artwork'));
        $this->assertCount(2, $order->getMedia('shirt_artwork'));
        $this->assertCount(1, $order->getMedia('pants_artwork'));
        $this->assertStringEndsWith('.webp', (string) $order->getFirstMedia('shirt_artwork')?->file_name);
        $this->assertStringEndsWith('.webp', (string) $order->getFirstMedia('pants_artwork')?->file_name);
    }

    public function test_order_store_validates_invalid_file_type_and_oversize_per_artwork_field(): void
    {
        $branch = Branch::create([
            'branch_code' => '02',
            'branch_name' => 'Khon Kaen',
        ]);

        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-F1-ART-ERR-001',
            'customer_name' => 'Artwork Validation Customer',
        ]);

        $payload = $this->buildForm1Payload($customer, $branch, 'ทดสอบผู้ใหญ่');
        $payload['shirt_artwork'] = [UploadedFile::fake()->create('shirt-art.txt', 10, 'text/plain')];
        $payload['pants_artwork'] = [UploadedFile::fake()->create('pants-art.png', 6001, 'image/png')];

        $response = $this->actingAs($salesUser)->post('/orders', $payload);

        // shirt_artwork/pants_artwork are validated as arrays now, so each entry's
        // error lands under its own indexed key (shirt_artwork.0, pants_artwork.0).
        $response->assertSessionHasErrors(['shirt_artwork.0', 'pants_artwork.0']);
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_order_store_accepts_form_2_for_non_branch_01_users(): void
    {
        $branch = Branch::create([
            'branch_code' => '02',
            'branch_name' => 'Khon Kaen',
        ]);

        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-F2-001',
            'customer_name' => 'Form 2 Customer',
        ]);

        $payload = $this->buildForm2Payload($customer, $branch, 'รายตัวผู้ใหญ่');

        $response = $this->actingAs($salesUser)->postJson('/orders', $payload);

        $response->assertCreated();

        $this->assertDatabaseHas('orders', [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Form 2 Individual Order',
        ]);

        $this->assertDatabaseHas('order_items', [
            'size_label' => 'รายตัวผู้ใหญ่',
            'quantity' => 1,
        ]);
    }

    public function test_order_store_accepts_form_2_for_branch_01_users(): void
    {
        $branch = Branch::create([
            'branch_code' => '01',
            'branch_name' => 'Nong Bua Lamphu',
        ]);

        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
            'branch_id' => $branch->id,
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUS-F2-002',
            'customer_name' => 'Form 2 Branch 01 Customer',
        ]);

        $payload = $this->buildForm2Payload($customer, $branch, 'รายตัวผู้ใหญ่');

        $response = $this->actingAs($salesUser)->postJson('/orders', $payload);

        $response->assertCreated();

        $this->assertDatabaseHas('orders', [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Form 2 Individual Order',
        ]);
    }

    public function test_qc_endpoint_returns_422_when_rejecting_without_remark(): void
    {
        $qcUser = User::factory()->create([
            'role' => UserRole::Qc,
            'station_department' => StationDepartment::Qc,
        ]);

        $order = $this->createOrderForQcFlow(OrderStatus::QcChecking);

        $response = $this->actingAs($qcUser)->postJson('/orders/'.$order->id.'/qc', [
            'decision' => 'reject',
            'target_station' => 'sewing',
            'remark' => '',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['remark']);

        $order->refresh();
        $this->assertNotSame(OrderStatus::QcRejected, $order->order_status);
    }

    public function test_qc_endpoint_successfully_triggers_loopback_with_remark(): void
    {
        $qcUser = User::factory()->create([
            'role' => UserRole::Qc,
            'station_department' => StationDepartment::Qc,
        ]);

        $order = $this->createOrderForQcFlow(OrderStatus::InProduction);

        $sewingRouting = $order->routings()->create([
            'station_name' => 'sewing',
            'is_required' => true,
            'status' => RoutingStatus::Completed,
            'started_at' => now()->subHour(),
            'completed_at' => now(),
        ]);

        $response = $this->actingAs($qcUser)->postJson('/orders/'.$order->id.'/qc', [
            'decision' => 'reject',
            'target_station' => 'sewing',
            'remark' => 'Stitching defect on left sleeve',
        ]);

        $this->assertContains($response->status(), [200, 201, 302]);

        $order->refresh();
        $sewingRouting->refresh();

        $this->assertSame(OrderStatus::QcRejected, $order->order_status);
        $this->assertSame(RoutingStatus::InProgress, $sewingRouting->status);

        $this->assertDatabaseHas('order_status_histories', [
            'order_id' => $order->id,
            'remark' => 'Stitching defect on left sleeve',
        ]);
    }

    public function test_qc_endpoint_allows_production_manager_to_sign_off_pass(): void
    {
        $managerUser = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        $order = $this->createOrderForQcFlow(OrderStatus::QcChecking);
        $cuttingRouting = $order->routings()->create([
            'station_name' => 'cutting',
            'is_required' => true,
            'status' => RoutingStatus::InProgress,
            'started_at' => now()->subHour(),
        ]);
        $sewingRouting = $order->routings()->create([
            'station_name' => 'sewing',
            'is_required' => true,
            'status' => RoutingStatus::Pending,
        ]);
        $order->routings()->create([
            'station_name' => 'qc',
            'is_required' => true,
            'status' => RoutingStatus::Pending,
        ]);
        $shippingRouting = $order->routings()->create([
            'station_name' => 'shipping',
            'is_required' => true,
            'status' => RoutingStatus::Pending,
        ]);

        $response = $this->actingAs($managerUser)->postJson('/orders/'.$order->id.'/qc', [
            'decision' => 'pass',
            'remark' => '{"note":"manager qc sign-off"}',
        ]);

        $this->assertContains($response->status(), [200, 201, 302]);

        $order->refresh();

        $this->assertSame(OrderStatus::Shipping, $order->order_status);
        $this->assertSame(RoutingStatus::Completed, $cuttingRouting->refresh()->status);
        $this->assertSame(RoutingStatus::Completed, $sewingRouting->refresh()->status);
        $this->assertSame(RoutingStatus::Completed, $order->routings()->where('station_name', 'qc')->firstOrFail()->status);
        $this->assertSame(RoutingStatus::Pending, $shippingRouting->refresh()->status);

        $this->assertDatabaseHas('order_routings', [
            'order_id' => $order->id,
            'station_name' => 'qc',
            'status' => RoutingStatus::Completed->value,
        ]);
    }

    public function test_qc_endpoint_allows_qc_department_worker_to_sign_off_pass(): void
    {
        $qcDepartmentWorker = User::factory()->create([
            'role' => UserRole::Worker,
            'station_department' => StationDepartment::Qc,
        ]);

        $order = $this->createOrderForQcFlow(OrderStatus::QcChecking);
        $order->routings()->create([
            'station_name' => 'qc',
            'is_required' => true,
            'status' => RoutingStatus::Pending,
        ]);

        $response = $this->actingAs($qcDepartmentWorker)->postJson('/orders/'.$order->id.'/qc', [
            'decision' => 'pass',
            'remark' => '{"note":"qc department worker sign-off"}',
        ]);

        $this->assertContains($response->status(), [200, 201, 302]);

        $order->refresh();

        $this->assertSame(OrderStatus::Shipping, $order->order_status);
    }

    public function test_qc_endpoint_returns_403_for_non_qc_role(): void
    {
        $salesUser = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        $order = $this->createOrderForQcFlow(OrderStatus::QcChecking);

        $response = $this->actingAs($salesUser)->postJson('/orders/'.$order->id.'/qc', [
            'decision' => 'reject',
            'target_station' => 'sewing',
            'remark' => 'Invalid role should not pass.',
        ]);

        $response->assertForbidden();
        $order->refresh();
        $this->assertSame(OrderStatus::QcChecking, $order->order_status);
    }

    private function registerFallbackTestRoutes(): void
    {
        /** @var Router $router */
        $router = $this->app->make('router');

        if (! $router->getRoutes()->hasNamedRoute('orders.store')) {
            $router->middleware(['web', 'auth'])
                ->post('/orders', function (StoreOrderRequest $request, CreateOrderAction $action): JsonResponse {
                    $order = $action->execute($request->validated(), (int) $request->user()->id);

                    return response()->json(['id' => $order->id], 201);
                })->name('orders.store');
        }

        if (! $router->getRoutes()->hasNamedRoute('qc.submit')) {
            $router->middleware(['web', 'auth'])
                ->post('/orders/{order}/qc', function (Request $request, Order $order): JsonResponse {
                    $validator = Validator::make($request->all(), [
                        'decision' => ['required', 'in:reject,approve'],
                        'target_station' => ['required_if:decision,reject', 'string'],
                        'remark' => ['required_if:decision,reject', 'string', 'min:1'],
                    ]);

                    if ($validator->fails()) {
                        return response()->json([
                            'message' => 'The given data was invalid.',
                            'errors' => $validator->errors()->toArray(),
                        ], 422);
                    }

                    $decision = (string) $request->input('decision');

                    if ($decision === 'reject') {
                        $targetStation = (string) $request->input('target_station');
                        $remark = (string) $request->input('remark');
                        $fromStatus = $order->order_status;

                        $order->update(['order_status' => OrderStatus::QcRejected]);

                        $routing = $order->routings()->where('station_name', $targetStation)->firstOrFail();
                        $routing->update([
                            'status' => RoutingStatus::InProgress,
                            'started_at' => now(),
                            'completed_at' => null,
                        ]);

                        $order->statusHistories()->create([
                            'user_id' => (int) $request->user()->id,
                            'from_status' => $fromStatus,
                            'to_status' => OrderStatus::QcRejected,
                            'remark' => $remark,
                        ]);
                    }

                    return response()->json(['status' => 'ok']);
                })->name('qc.submit');
        }
    }

    private function createOrderForQcFlow(OrderStatus $status): Order
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-QC-001',
            'customer_name' => 'QC Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'QC-001',
            'branch_name' => 'QC Branch',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::ProductionManager,
            'station_department' => StationDepartment::None,
        ]);

        return Order::create([
            'order_code' => 'ORD-QC-'.str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'creator_user_id' => $creator->id,
            'job_name' => 'QC Flow Order',
            'job_type' => 'uniform',
            'order_date' => now()->subDays(2),
            'due_date' => now()->addDays(2),
            'total_amount' => 1000,
            'discount_percent' => 0,
            'discount_amount' => 0,
            'net_amount' => 1000,
            'order_status' => $status,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function buildForm1Payload(Customer $customer, Branch $branch, string $sizeLabel): array
    {
        return [
            'customer_id' => $customer->id,
            'customer_name' => $customer->customer_name,
            'customer_phone' => '',
            'contact_detail' => '',
            'branch_id' => $branch->id,
            'job_name' => 'Form 1 Adult Order',
            'job_type' => 'uniform',
            'delivery_method' => 'pickup',
            'shipping_address' => null,
            'order_date' => '2026-07-11 08:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'deposit_amount' => 0,
            'payment_method' => 'cash',
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => $sizeLabel,
                'quantity' => 1,
                'unit_price' => 100.00,
            ]],
            'specification' => [
                'pattern_id' => 1,
                'fabric_id' => 2,
                'neck_style_id' => 3,
                'screen_print_detail' => 'spec ok',
            ],
            'routings' => ['design'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildForm2Payload(Customer $customer, Branch $branch, string $sizeLabel): array
    {
        return [
            'customer_id' => $customer->id,
            'customer_name' => $customer->customer_name,
            'customer_phone' => '',
            'contact_detail' => '',
            'branch_id' => $branch->id,
            'job_name' => 'Form 2 Individual Order',
            'job_type' => 'uniform',
            'delivery_method' => 'pickup',
            'shipping_address' => null,
            'order_date' => '2026-07-11 08:00:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'deposit_amount' => 0,
            'payment_method' => 'cash',
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => $sizeLabel,
                'quantity' => 1,
                'unit_price' => 100.00,
            ]],
            'specification' => [
                'pattern_id' => 1,
                'fabric_id' => 2,
                'neck_style_id' => 3,
                'screen_print_detail' => 'spec ok',
            ],
            'routings' => ['design'],
        ];
    }
}
