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
