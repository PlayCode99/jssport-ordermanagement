<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\GarmentOperation;
use App\Models\GarmentType;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The rate card: the sewing steps a garment type is made of, and what each one
 * pays for a child's garment and an adult's.
 *
 * An operation used to carry a second rate per size group, for when the garment
 * was a long one, and the only test over these endpoints was about that. It was
 * dropped once a garment type began carrying its own length — the rate on the
 * operation is already the rate for the length being cut — and dropping it left
 * writing, changing and deleting a rate with nothing testing them at all.
 */
class GarmentOperationCrudTest extends TestCase
{
    use RefreshDatabase;

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

    private function shirtType(): GarmentType
    {
        return GarmentType::create([
            'category' => 'SHIRT',
            'code' => 'S-RATE',
            'name' => 'เสื้อโปโล',
            'style' => 'short',
            'is_active' => true,
            'display_order' => 1,
        ]);
    }

    /**
     * The rate card of one garment type. The table is not empty to begin with:
     * the schema ships a step on เสื้อโปโล, so counting the whole table would
     * count that too.
     *
     * @return Collection<int, GarmentOperation>
     */
    private function ratesOf(GarmentType $type)
    {
        return GarmentOperation::query()
            ->where('garment_type_id', $type->id)
            ->get();
    }

    /** One row of a response's list, by the step it names. */
    private function listed(array $rows, string $name): ?array
    {
        foreach ($rows as $row) {
            if (($row['name'] ?? null) === $name) {
                return $row;
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(GarmentType $type, array $over = []): array
    {
        return array_merge([
            'garment_type_id' => $type->id,
            'name' => 'เย็บคอ',
            'child_price' => 10,
            'adult_price' => 20,
            'is_active' => true,
            'display_order' => 1,
        ], $over);
    }

    public function test_a_rate_is_written_and_comes_back_on_the_list(): void
    {
        $type = $this->shirtType();

        $response = $this->actingAs($this->owner())
            ->postJson('/settings/data/garments/prices', $this->payload($type));

        $response->assertOk();

        $rates = $this->ratesOf($type);

        $this->assertCount(1, $rates);
        $this->assertSame('เย็บคอ', $rates[0]->name);
        $this->assertSame('10.00', (string) $rates[0]->child_price);
        $this->assertSame('20.00', (string) $rates[0]->adult_price);

        $this->assertNotNull(
            $this->listed($response->json('rows'), 'เย็บคอ'),
            'A rate just written must come back on the list.',
        );
    }

    /**
     * One rate per size group is the whole of it. A second one for a long
     * garment was two columns describing one thing, and a zero typed into the
     * live one costed a whole production sheet at nothing.
     */
    public function test_a_rate_carries_nothing_about_length(): void
    {
        $type = $this->shirtType();

        $response = $this->actingAs($this->owner())
            ->postJson('/settings/data/garments/prices', $this->payload($type, [
                // Sent the way the old form sent them. They are not columns any
                // more and must not come back as though they were.
                'child_price_long' => 14,
                'adult_price_long' => 26,
            ]));

        $response->assertOk();

        $row = $this->listed($response->json('rows'), 'เย็บคอ');

        $this->assertNotNull($row);
        $this->assertArrayNotHasKey('child_price_long', $row);
        $this->assertArrayNotHasKey('adult_price_long', $row);

        $stored = array_keys($this->ratesOf($type)[0]->getAttributes());

        $this->assertNotContains('child_price_long', $stored);
        $this->assertNotContains('adult_price_long', $stored);
    }

    public function test_a_rate_is_changed_in_place(): void
    {
        $type = $this->shirtType();
        $operation = GarmentOperation::create($this->payload($type));

        $this->actingAs($this->owner())
            ->putJson("/settings/data/garments/prices/{$operation->id}", $this->payload($type, [
                'name' => 'เย็บคอ (แก้)',
                'child_price' => 12,
                'adult_price' => 24,
            ]))
            ->assertOk();

        $operation->refresh();

        $this->assertSame('เย็บคอ (แก้)', $operation->name);
        $this->assertSame('12.00', (string) $operation->child_price);
        $this->assertSame('24.00', (string) $operation->adult_price);
        $this->assertCount(1, $this->ratesOf($type));
    }

    public function test_a_rate_is_removed(): void
    {
        $type = $this->shirtType();
        $operation = GarmentOperation::create($this->payload($type));

        $this->actingAs($this->owner())
            ->deleteJson("/settings/data/garments/prices/{$operation->id}")
            ->assertOk();

        $this->assertCount(0, $this->ratesOf($type));
    }

    public function test_both_rates_are_required_and_may_not_be_negative(): void
    {
        $type = $this->shirtType();

        $this->actingAs($this->owner())
            ->postJson('/settings/data/garments/prices', $this->payload($type, [
                'child_price' => null,
                'adult_price' => -1,
            ]))
            ->assertJsonValidationErrors(['child_price', 'adult_price']);

        $this->assertCount(0, $this->ratesOf($type));
    }

    /**
     * Two steps of one garment type cannot share a name, or the rate card has
     * two lines nobody can tell apart.
     */
    public function test_a_step_is_not_listed_twice_for_one_garment_type(): void
    {
        $type = $this->shirtType();
        GarmentOperation::create($this->payload($type));

        $this->actingAs($this->owner())
            ->postJson('/settings/data/garments/prices', $this->payload($type))
            ->assertJsonValidationErrors(['name']);

        $this->assertCount(1, $this->ratesOf($type));
    }

    public function test_a_stranger_cannot_write_a_rate(): void
    {
        $type = $this->shirtType();

        $this->postJson('/settings/data/garments/prices', $this->payload($type))
            ->assertUnauthorized();

        $this->assertCount(0, $this->ratesOf($type));
    }
}
