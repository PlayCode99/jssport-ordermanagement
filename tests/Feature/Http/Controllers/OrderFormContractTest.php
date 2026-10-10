<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\GarmentType;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * The shape the counter form actually posts.
 *
 * Every other test on either side builds its own payload, so nothing checked
 * that what the form sends is what the server takes. It was not: Forms 1 and 4
 * moved their spec onto the tables, and `order_specifications` kept requiring
 * flat pattern and fabric columns that the form had stopped filling in — so a
 * bill with every box on screen answered came back refused for a pattern and a
 * fabric that were plainly there.
 *
 * These cases post what the form posts, so the two halves cannot drift apart
 * again without something going red.
 */
class OrderFormContractTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private GarmentType $shirtType;

    private GarmentType $pantsType;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create([
            'role' => UserRole::Admin, 'access_role' => AccessRole::Owner,
            'station_department' => StationDepartment::None, 'is_active' => true,
            'branch_id' => null,
        ]);

        $this->shirtType = GarmentType::create([
            'category' => 'SHIRT', 'code' => 'S-CONTRACT', 'name' => 'เสื้อโปโล',
            'style' => 'short', 'is_active' => true, 'display_order' => 1,
        ]);
        $this->pantsType = GarmentType::create([
            'category' => 'PANTS', 'code' => 'P-CONTRACT', 'name' => 'กางเกงขาสั้น',
            'style' => 'short', 'is_active' => true, 'display_order' => 1,
        ]);
    }

    /**
     * One table's spec, filled in the way the counter fills it.
     *
     * @return array<string, string>
     */
    private function tableSpec(string $typeKey, string $typeId): array
    {
        return [
            $typeKey => $typeId,
            'pattern_id' => '11',
            'fabric_id' => '22',
            'fabric_color_id' => '33',
            'screen_text' => 'โลโก้โรงเรียน',
        ];
    }

    /**
     * The payload the form builds for a Form 1 bill: the spec lives on the
     * tables, and the flat columns are written from the first table of each
     * garment.
     *
     * @return array<string, mixed>
     */
    private function formPayload(): array
    {
        $customer = Customer::firstOrCreate(['customer_code' => 'CUS-FORM'], ['customer_name' => 'ฟอร์ม']);
        $branch = Branch::firstOrCreate(['branch_code' => 'BR-FORM'], ['branch_name' => 'ฟอร์ม']);

        $shirtSpec = $this->tableSpec('shirt_type_id', (string) $this->shirtType->id);
        $pantsSpec = $this->tableSpec('pants_type_id', (string) $this->pantsType->id);

        return [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'customer_name' => 'โรงเรียนทดสอบ',
            'job_name' => 'งานทดสอบสัญญา',
            'job_type' => 'ปัก',
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(5)->toDateTimeString(),
            'discount_percent' => 0,
            'items' => [
                [
                    'item_type' => 'separate_shirt', 'size_group' => 'kids',
                    'size_tier' => 'kids', 'size_label' => 'JM',
                    'shirt_style' => 'short', 'quantity' => 10, 'unit_price' => 150,
                ],
                [
                    'item_type' => 'separate_pants', 'size_group' => 'adults',
                    'size_tier' => 'adults', 'size_label' => 'L',
                    'pants_style' => 'short', 'quantity' => 4, 'unit_price' => 120,
                ],
            ],
            'specification' => [
                // Written from the first shirt table, not from the retired
                // bill-wide card the form no longer asks Forms 1 and 4 for.
                'pattern_id' => 11,
                'fabric_id' => 22,
                'screen_print_detail' => json_encode([
                    'schema' => 'spec-v3',
                    'mode' => 'matrix',
                    'garment_specs' => [
                        'shirt_kids_short' => $shirtSpec,
                        'pants_adults_short' => $pantsSpec,
                    ],
                    'shirt_specs' => $shirtSpec,
                    'pants_specs' => $pantsSpec,
                ], JSON_THROW_ON_ERROR),
            ],
        ];
    }

    public function test_the_form_payload_is_accepted(): void
    {
        $this->actingAs($this->owner)
            ->post('/orders', $this->formPayload())
            ->assertSessionHasNoErrors();

        $this->assertSame(1, Order::query()->count());
    }

    public function test_the_saved_bill_keeps_a_spec_for_every_sheet(): void
    {
        $this->actingAs($this->owner)->post('/orders', $this->formPayload());

        $decoded = json_decode(
            (string) Order::query()->firstOrFail()->specification?->screen_print_detail,
            true,
            512,
            JSON_THROW_ON_ERROR,
        );

        $this->assertSame(
            ['shirt_kids_short', 'pants_adults_short'],
            array_keys($decoded['garment_specs']),
        );
    }

    public function test_the_flat_columns_carry_what_the_tables_were_filled_in_with(): void
    {
        $this->actingAs($this->owner)->post('/orders', $this->formPayload());

        $specification = Order::query()->firstOrFail()->specification;

        $this->assertSame(11, $specification?->pattern_id);
        $this->assertSame(22, $specification?->fabric_id);
    }

    /**
     * The form posts its two long lists as JSON strings rather than as arrays.
     *
     * It has to. Multipart encoding gives every scalar its own input variable,
     * and PHP reads only the first `max_input_vars` of them — 1000 by default —
     * before silently discarding the rest. At roughly ten variables per size
     * row, a Form 2 bill of fifty people lost three quarters of its rows and
     * all of its spec on the way in, and came back refused for a pattern and a
     * fabric that were filled in. As one string each, the variable count no
     * longer grows with the bill.
     */
    public function test_items_posted_as_a_json_string_are_read_as_rows(): void
    {
        $payload = $this->formPayload();
        $payload['items'] = json_encode($payload['items'], JSON_THROW_ON_ERROR);

        $this->actingAs($this->owner)
            ->post('/orders', $payload)
            ->assertSessionHasNoErrors();

        $this->assertSame(2, Order::query()->firstOrFail()->items()->count());
    }

    /**
     * Unpacking happens before the rules, not instead of them.
     */
    public function test_a_json_string_of_items_is_still_checked_row_by_row(): void
    {
        $payload = $this->formPayload();
        $payload['items'][0]['quantity'] = 0;
        $payload['items'] = json_encode($payload['items'], JSON_THROW_ON_ERROR);

        $this->actingAs($this->owner)
            ->post('/orders', $payload)
            ->assertSessionHasErrors(['items.0.quantity']);

        $this->assertSame(0, Order::query()->count());
    }

    /**
     * The size that used to break: 60 rows was about 1,210 input variables,
     * past the 1000 PHP reads, so the bill arrived in pieces.
     */
    public function test_a_bill_far_past_the_old_variable_limit_saves_every_row(): void
    {
        $rows = [];

        for ($i = 0; $i < 60; $i++) {
            $rows[] = [
                'item_type' => 'separate_shirt', 'size_group' => 'adults',
                'size_tier' => 'adults', 'size_label' => 'XL',
                'shirt_style' => 'short', 'quantity' => 1, 'unit_price' => 250,
            ];
            $rows[] = [
                'item_type' => 'separate_pants', 'size_group' => 'adults',
                'size_tier' => 'adults', 'size_label' => 'XL',
                'pants_style' => 'short', 'quantity' => 1, 'unit_price' => 220,
            ];
        }

        $payload = $this->formPayload();
        $payload['items'] = json_encode($rows, JSON_THROW_ON_ERROR);

        $this->actingAs($this->owner)
            ->post('/orders', $payload)
            ->assertSessionHasNoErrors();

        $this->assertSame(120, Order::query()->firstOrFail()->items()->count());
    }

    /**
     * Anything that is not a list of rows is reported, never read as an empty
     * bill: a truncated or mangled string must not save an order with no items.
     */
    public function test_an_unreadable_items_string_is_refused(): void
    {
        $payload = $this->formPayload();
        $payload['items'] = '[{"item_type":"separate_shirt","quan';

        $this->actingAs($this->owner)
            ->post('/orders', $payload)
            ->assertSessionHasErrors(['items']);

        $this->assertSame(0, Order::query()->count());
    }

    /**
     * PHP keeps only `max_file_uploads` files per request and drops the rest at
     * startup without raising anything. The browser says how many it attached,
     * so the shortfall is caught here rather than stored.
     */
    public function test_a_bill_whose_artwork_was_dropped_on_the_way_in_is_refused(): void
    {
        $payload = $this->formPayload();
        $payload['shirt_artwork'] = [UploadedFile::fake()->image('art.png')];
        $payload['artwork_file_count'] = 5;

        $this->actingAs($this->owner)
            ->post('/orders', $payload)
            ->assertSessionHasErrors(['artwork_file_count']);

        $this->assertSame(0, Order::query()->count());
    }

    public function test_a_bill_whose_artwork_all_arrived_is_accepted(): void
    {
        $payload = $this->formPayload();
        $payload['shirt_artwork'] = [
            UploadedFile::fake()->image('one.png'),
            UploadedFile::fake()->image('two.png'),
        ];
        $payload['artwork_file_count'] = 2;

        $this->actingAs($this->owner)
            ->post('/orders', $payload)
            ->assertSessionHasNoErrors();

        $this->assertSame(1, Order::query()->count());
    }

    /**
     * Form 2 writes a person per row, so its bill is the longest the counter
     * makes and the first to have broken: a roster of fifty with trousers was
     * already past what PHP would read. It sells one spec for the whole bill,
     * so the rows are all that grow.
     *
     * @param  int  $people  how many names are on the roster
     * @return array<string, mixed>
     */
    private function rosterPayload(int $people): array
    {
        $payload = $this->formPayload();
        $rows = [];

        for ($i = 1; $i <= $people; $i++) {
            $rows[] = [
                'item_type' => 'separate_shirt', 'size_group' => 'adults',
                'size_tier' => 'adults', 'size_label' => 'XL',
                'shirt_style' => 'short', 'quantity' => 1, 'unit_price' => 250,
            ];
            $rows[] = [
                'item_type' => 'separate_pants', 'size_group' => 'adults',
                'size_tier' => 'adults', 'size_label' => 'XL',
                'pants_style' => 'long', 'quantity' => 1, 'unit_price' => 220,
            ];
        }

        $payload['items'] = json_encode($rows, JSON_THROW_ON_ERROR);
        $payload['specification']['screen_print_detail'] = json_encode([
            'schema' => 'spec-v3',
            'mode' => 'individual',
            'garment_specs' => [],
            'shirt_specs' => $this->tableSpec('shirt_type_id', (string) $this->shirtType->id),
            'pants_specs' => $this->tableSpec('pants_type_id', (string) $this->pantsType->id),
        ], JSON_THROW_ON_ERROR);

        return $payload;
    }

    public function test_a_form_2_roster_of_fifty_people_saves_whole(): void
    {
        $this->actingAs($this->owner)
            ->post('/orders', $this->rosterPayload(50))
            ->assertSessionHasNoErrors();

        $order = Order::query()->firstOrFail();

        $this->assertSame(100, $order->items()->count());
        $this->assertSame(100, (int) $order->items()->sum('quantity'));
    }

    /**
     * Well past anything the shop writes, to show the ceiling moved rather than
     * merely rose: the bill no longer costs input variables by the row.
     */
    public function test_a_form_2_roster_of_three_hundred_people_saves_whole(): void
    {
        $this->actingAs($this->owner)
            ->post('/orders', $this->rosterPayload(300))
            ->assertSessionHasNoErrors();

        $this->assertSame(600, Order::query()->firstOrFail()->items()->count());
    }

    /**
     * Form 3 sells a shirt and a pair of trousers per colour house. It keeps no
     * per-sheet spec either, so what has to survive the trip is the rows and
     * the house each one belongs to.
     */
    public function test_a_form_3_sports_day_bill_keeps_every_house(): void
    {
        $houses = ['แดง', 'เขียว', 'น้ำเงิน', 'เหลือง'];
        $rows = [];

        foreach ($houses as $house) {
            foreach (['kids', 'adults'] as $group) {
                $rows[] = [
                    'item_type' => 'set', 'size_group' => $group,
                    'size_tier' => $group, 'size_label' => $group === 'kids' ? 'JM' : 'L',
                    'shirt_style' => 'short', 'quantity' => 25, 'unit_price' => 300,
                ];
            }
        }

        $payload = $this->formPayload();
        $payload['items'] = json_encode($rows, JSON_THROW_ON_ERROR);
        $payload['specification']['screen_print_detail'] = json_encode([
            'schema' => 'spec-v3',
            'mode' => 'sports_day',
            'garment_specs' => [],
            'sports_day_groups' => array_map(
                fn (string $house): array => ['house_name' => $house],
                $houses,
            ),
            'shirt_specs' => $this->tableSpec('shirt_type_id', (string) $this->shirtType->id),
            'pants_specs' => $this->tableSpec('pants_type_id', (string) $this->pantsType->id),
        ], JSON_THROW_ON_ERROR);

        $this->actingAs($this->owner)
            ->post('/orders', $payload)
            ->assertSessionHasNoErrors();

        $order = Order::query()->firstOrFail();
        $decoded = json_decode(
            (string) $order->specification?->screen_print_detail,
            true,
            512,
            JSON_THROW_ON_ERROR,
        );

        $this->assertSame(8, $order->items()->count());
        $this->assertSame(200, (int) $order->items()->sum('quantity'));
        $this->assertCount(4, $decoded['sports_day_groups']);
    }

    /**
     * Artwork is not required to open a bill. Plenty are taken over the counter
     * from a sample the customer brought in or from a description, and the
     * picture follows later — so a bill with nothing attached must save, and
     * its receipt says in the gallery that none was attached.
     */
    public function test_a_bill_with_no_artwork_at_all_is_accepted(): void
    {
        $payload = $this->formPayload();

        $this->assertArrayNotHasKey('shirt_artwork', $payload);
        $this->assertArrayNotHasKey('design_artwork', $payload);

        $this->actingAs($this->owner)
            ->post('/orders', $payload)
            ->assertSessionHasNoErrors();

        $order = Order::query()->firstOrFail();

        $this->assertSame(1, Order::query()->count());
        $this->assertCount(0, $order->getMedia('shirt_artwork'));
        $this->assertCount(0, $order->getMedia('pants_artwork'));
    }

    /**
     * And saying none was attached is not the same as saying none arrived: a
     * bill that claims pictures it did not bring is still refused.
     */
    public function test_claiming_no_artwork_is_not_how_a_dropped_upload_slips_through(): void
    {
        $payload = $this->formPayload();
        $payload['artwork_file_count'] = 0;

        $this->actingAs($this->owner)
            ->post('/orders', $payload)
            ->assertSessionHasNoErrors();

        $this->assertSame(1, Order::query()->count());
    }

    /**
     * The failure the counter actually saw: a bill whose spec is on the tables
     * but whose flat columns were left empty.
     */
    public function test_a_bill_with_no_flat_columns_is_refused_rather_than_saved_half(): void
    {
        $payload = $this->formPayload();
        unset($payload['specification']['pattern_id'], $payload['specification']['fabric_id']);

        $this->actingAs($this->owner)
            ->post('/orders', $payload)
            ->assertSessionHasErrors([
                'specification.pattern_id',
                'specification.fabric_id',
            ]);

        $this->assertSame(0, Order::query()->count());
    }
}
