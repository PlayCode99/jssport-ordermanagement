<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Http\Controllers\Production\ProductionKanbanController;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\GarmentType;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Form 4 (ชุดพละ) is Form 1's size tables with artwork attached to each table,
 * so what comes back out has to be exactly what went in for that table -- and
 * the order items have to stay the shape production already reads.
 */
class PeUniformArtworkTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        // The bills below are dated 2026-09-09, and a bill may not be opened
        // on a past date, so the clock is pinned to keep them valid.
        Carbon::setTestNow(Carbon::parse('2026-09-09 08:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function actor(): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);
    }

    /**
     * @param  array<string, array<int, UploadedFile>>  $artwork
     * @return array<string, mixed>
     */
    private function payload(array $artwork): array
    {
        $customer = Customer::create(['customer_code' => 'CUS-PE-1', 'customer_name' => 'โรงเรียนทดสอบ']);
        $branch = Branch::create(['branch_code' => 'BR-PE-1', 'branch_name' => 'สาขาทดสอบ']);

        return [
            'customer_id' => $customer->id,
            'customer_name' => 'โรงเรียนทดสอบ',
            'branch_id' => $branch->id,
            'job_name' => 'ชุดพละ ป.1-ป.6',
            'job_type' => 'งานสกรีน',
            'order_date' => '2026-09-09 09:00:00',
            'due_date' => '2026-09-20 18:00:00',
            'discount_percent' => 0,
            'items' => [
                ['item_type' => 'set', 'size_group' => 'kids', 'size_label' => 'JM', 'shirt_style' => 'short', 'pants_style' => 'short', 'quantity' => 10, 'unit_price' => 300],
                ['item_type' => 'set', 'size_group' => 'adults', 'size_label' => 'L', 'shirt_style' => 'short', 'pants_style' => 'long', 'quantity' => 5, 'unit_price' => 350],
            ],
            'pe_uniform_artwork' => $artwork,
            'specification' => [
                'pattern_id' => 1,
                'fabric_id' => 1,
                // A "set" row only counts towards the pants floor when the bill
                // actually carries a pants spec, which is the rule the order
                // form now enforces whenever the size table has pants on it.
                'screen_print_detail' => json_encode([
                    'schema' => 'spec-v2',
                    'mode' => 'pe_uniform',
                    'shirt_specs' => ['shirt_type_id' => '1', 'pattern_id' => '1', 'fabric_id' => '1'],
                    'pants_specs' => ['pattern_id' => '1', 'fabric_id' => '1', 'leg_style_id' => '1'],
                ], JSON_THROW_ON_ERROR),
            ],
        ];
    }

    public function test_each_size_table_keeps_the_artwork_it_was_given(): void
    {
        $this->actingAs($this->actor())->post('/orders', $this->payload([
            'kids' => [UploadedFile::fake()->image('kids-a.png')],
            'adults' => [UploadedFile::fake()->image('adults-a.png'), UploadedFile::fake()->image('adults-b.png')],
        ]))->assertSessionHasNoErrors();

        $order = Order::query()->latest('id')->firstOrFail();
        $grouped = $order->pe_uniform_artwork_urls;

        $this->assertCount(1, $grouped['kids']);
        $this->assertCount(2, $grouped['adults']);
    }

    public function test_reopening_the_bill_hands_each_table_its_own_gallery_back(): void
    {
        $this->actingAs($this->actor())->post('/orders', $this->payload([
            'kids' => [UploadedFile::fake()->image('kids-a.png')],
        ]))->assertSessionHasNoErrors();

        $order = Order::query()->latest('id')->firstOrFail();

        $this->actingAs($this->actor())
            ->get("/orders/{$order->id}/edit")
            ->assertInertia(fn (Assert $page) => $page
                ->component('Orders/Create')
                ->has('order.pe_uniform_artwork_urls.kids', 1)
            );
    }

    public function test_production_reads_the_same_item_shape_as_form_one(): void
    {
        $this->actingAs($this->actor())->post('/orders', $this->payload([]))
            ->assertSessionHasNoErrors();

        $order = Order::query()->with('items')->latest('id')->firstOrFail();

        // A new form must not mean a new shape on the production floor: the
        // batch split reads item_type, size_group, size_label and the styles.
        $this->assertCount(2, $order->items);

        $kids = $order->items->firstWhere('size_label', 'JM');
        $this->assertSame('set', $kids->item_type);
        $this->assertSame('kids', $kids->size_group);
        $this->assertSame('short', $kids->shirt_style);

        $adults = $order->items->firstWhere('size_label', 'L');
        $this->assertSame('adults', $adults->size_group);
        $this->assertSame('long', $adults->pants_style);
    }

    public function test_the_endpoint_rejects_a_non_image_file(): void
    {
        $this->actingAs($this->actor())->post('/orders', $this->payload([
            'kids' => [UploadedFile::fake()->create('note.pdf', 40, 'application/pdf')],
        ]))->assertSessionHasErrors();
    }

    public function test_the_floor_gets_the_right_batches_for_a_pe_uniform_bill(): void
    {
        $shirt = GarmentType::create([
            'category' => 'SHIRT', 'code' => 'PE-SHIRT', 'name' => 'เสื้อพละ',
            'is_active' => true, 'display_order' => 1,
        ]);
        $shirt->operations()->create([
            'name' => 'ตัด', 'child_price' => 10, 'adult_price' => 20,
            'is_active' => true, 'display_order' => 1,
        ]);
        $pants = GarmentType::create([
            'category' => 'PANTS', 'code' => 'PE-PANTS', 'name' => 'กางเกงพละ',
            'is_active' => true, 'display_order' => 1,
        ]);
        $pants->operations()->create([
            'name' => 'ตัด', 'child_price' => 5, 'adult_price' => 15,
            'is_active' => true, 'display_order' => 1,
        ]);

        $this->actingAs($this->actor())->post('/orders', $this->payload([]))
            ->assertSessionHasNoErrors();

        $order = Order::query()->with(['items', 'specification'])->latest('id')->firstOrFail();

        $controller = app(ProductionKanbanController::class);
        $method = (new \ReflectionClass($controller))->getMethod('buildProductionPricingSummary');
        $types = GarmentType::query()
            ->with(['operations' => fn ($query) => $query->where('is_active', true)])
            ->where('is_active', true)
            ->get()
            ->groupBy(fn (GarmentType $type): string => $type->category->value);

        $keys = array_column($method->invoke($controller, $order, $types)['groups'], 'key');

        // Both halves of each set land in their own batch, and the adults pants
        // are long while their shirts are short -- exactly what the size table
        // said.
        $this->assertSame([
            'shirt_kids_short',
            'shirt_adults_short',
            'pants_kids_short',
            'pants_adults_long',
        ], $keys);
    }
}
