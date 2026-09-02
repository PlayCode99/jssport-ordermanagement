<?php

namespace Tests\Feature\Http\Controllers;

use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Tests\TestCase;
use Illuminate\Support\Facades\Storage;

/**
 * Form 3 (กีฬาสี): artwork is attached per colour house, so what comes back out
 * has to be exactly what went in for that house — no more, no fewer, and never
 * another house's files.
 */
class SportsDayArtworkTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Artwork uploads would otherwise land in the real storage directory and
        // pile up as orphaned files every time the suite runs.
        Storage::fake('public');

        Carbon::setTestNow(Carbon::parse('2026-08-31 09:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function admin(): User
    {
        return User::factory()->create([
            'role' => UserRole::Admin,
            'station_department' => StationDepartment::None,
        ]);
    }

    /**
     * @param  array<int|string, array<int, UploadedFile>>  $artwork
     * @return array<string, mixed>
     */
    private function payload(array $artwork): array
    {
        $customer = Customer::firstOrCreate(['customer_code' => 'CUS-SD-1'], ['customer_name' => 'โรงเรียนทดสอบ']);
        $branch = Branch::firstOrCreate(['branch_code' => 'BR-SD-1'], ['branch_name' => 'สาขากีฬาสี']);

        return [
            'customer_id' => $customer->id,
            'customer_name' => $customer->customer_name,
            'branch_id' => $branch->id,
            'job_name' => 'เสื้อกีฬาสี',
            'job_type' => 'งานปัก',
            'order_date' => '2026-08-31 09:30:00',
            'due_date' => '2026-09-10 00:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'garment', 'size_group' => 'adults', 'size_label' => 'M',
                'quantity' => 30, 'unit_price' => 200,
            ]],
            'specification' => [
                'pattern_id' => '1',
                'fabric_id' => '1',
                'screen_print_detail' => json_encode([
                    'schema' => 'spec-v2',
                    'mode' => 'sports_day',
                    'sports_day_groups' => [
                        ['team_name' => 'คณะสีแดง', 'rows' => []],
                        ['team_name' => 'คณะสีน้ำเงิน', 'rows' => []],
                    ],
                ]),
            ],
            'sports_day_artwork' => $artwork,
        ];
    }

    public function test_each_colour_house_keeps_exactly_the_files_it_was_given(): void
    {
        $this->actingAs($this->admin())->post('/orders', $this->payload([
            0 => [UploadedFile::fake()->image('red-1.jpg'), UploadedFile::fake()->image('red-2.jpg'), UploadedFile::fake()->image('red-3.jpg')],
            1 => [UploadedFile::fake()->image('blue-1.jpg')],
        ]))->assertSessionHasNoErrors();

        $order = Order::query()->firstOrFail();
        $grouped = $order->sports_day_artwork_urls;

        // 3 in -> 3 out, 1 in -> 1 out.
        $this->assertCount(3, $grouped['0']);
        $this->assertCount(1, $grouped['1']);
        $this->assertCount(4, $order->getMedia('sports_day_artwork'));
    }

    public function test_a_house_with_no_artwork_simply_has_none(): void
    {
        $this->actingAs($this->admin())->post('/orders', $this->payload([
            0 => [UploadedFile::fake()->image('red-1.jpg')],
        ]))->assertSessionHasNoErrors();

        $grouped = Order::query()->firstOrFail()->sports_day_artwork_urls;

        $this->assertCount(1, $grouped['0']);
        $this->assertArrayNotHasKey('1', $grouped);
    }

    public function test_editing_adds_to_a_house_without_touching_the_other(): void
    {
        $this->actingAs($this->admin())->post('/orders', $this->payload([
            0 => [UploadedFile::fake()->image('red-1.jpg')],
            1 => [UploadedFile::fake()->image('blue-1.jpg')],
        ]))->assertSessionHasNoErrors();

        $order = Order::query()->firstOrFail();

        $this->actingAs($this->admin())->put("/orders/{$order->id}", $this->payload([
            0 => [UploadedFile::fake()->image('red-2.jpg')],
        ]))->assertSessionHasNoErrors();

        $grouped = $order->fresh()->sports_day_artwork_urls;

        $this->assertCount(2, $grouped['0']);
        $this->assertCount(1, $grouped['1']);
    }

    public function test_the_endpoint_rejects_a_non_image_file(): void
    {
        $this->actingAs($this->admin())->post('/orders', $this->payload([
            0 => [UploadedFile::fake()->create('not-an-image.pdf', 10, 'application/pdf')],
        ]))->assertSessionHasErrors('sports_day_artwork.0.0');

        $this->assertSame(0, Order::query()->count());
    }

    public function test_duplicating_carries_every_house_artwork_over(): void
    {
        $this->actingAs($this->admin())->post('/orders', $this->payload([
            0 => [UploadedFile::fake()->image('red-1.jpg'), UploadedFile::fake()->image('red-2.jpg')],
            1 => [UploadedFile::fake()->image('blue-1.jpg')],
        ]))->assertSessionHasNoErrors();

        $source = Order::query()->firstOrFail();

        $duplicatePayload = $this->payload([]);
        $duplicatePayload['duplicate_from_id'] = $source->id;

        $this->actingAs($this->admin())->post('/orders', $duplicatePayload)->assertSessionHasNoErrors();

        $copy = Order::query()->whereKeyNot($source->id)->firstOrFail();
        $grouped = $copy->sports_day_artwork_urls;

        // The house tagging has to survive the copy, not just the file count.
        $this->assertCount(2, $grouped['0']);
        $this->assertCount(1, $grouped['1']);
        $this->assertCount(2, $source->fresh()->sports_day_artwork_urls['0']);
    }
}
