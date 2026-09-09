<?php

namespace Tests\Feature\Domain\OrderManagement;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Domain\OrderManagement\Actions\UpdateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Editing an order may remove artwork that was already saved. Deleting the
 * wrong image is unrecoverable, so these tests pin down exactly which media a
 * removal request may and may not touch.
 */
class OrderArtworkRemovalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
    }

    private function creator(): User
    {
        return User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);
    }

    private function orderData(array $over = []): array
    {
        $customer = Customer::firstOrCreate(
            ['customer_code' => 'CUS-ART-0001'],
            ['customer_name' => 'Artwork Customer'],
        );
        $branch = Branch::firstOrCreate(
            ['branch_code' => 'BR-ART-01'],
            ['branch_name' => 'Artwork Branch'],
        );

        return array_merge([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Artwork Order',
            'job_type' => 'งานปัก',
            'order_date' => '2026-09-01 09:00:00',
            'due_date' => '2026-09-20 18:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt',
                'size_group' => 'adults',
                'size_label' => 'L',
                'quantity' => 5,
                'unit_price' => 100,
            ]],
        ], $over);
    }

    private function image(string $name): UploadedFile
    {
        return UploadedFile::fake()->image($name, 40, 40);
    }

    private function orderWithArtwork(User $creator): Order
    {
        return (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork' => [$this->image('shirt-a.jpg'), $this->image('shirt-b.jpg')],
            'pants_artwork' => [$this->image('pants-a.jpg')],
        ]), $creator->id);
    }

    public function test_it_deletes_only_the_artwork_the_user_removed(): void
    {
        $creator = $this->creator();
        $order = $this->orderWithArtwork($creator);

        $shirtMedia = $order->getMedia('shirt_artwork');
        $this->assertCount(2, $shirtMedia);

        $removedId = (int) $shirtMedia->first()->id;
        $keptId = (int) $shirtMedia->last()->id;

        (new UpdateOrderAction)->execute($order, $this->orderData([
            'removed_media_ids' => [$removedId],
        ]), $creator->id);

        $remaining = $order->refresh()->getMedia('shirt_artwork')->pluck('id')->map(fn ($id): int => (int) $id)->all();

        $this->assertSame([$keptId], $remaining);
        $this->assertCount(1, $order->getMedia('pants_artwork'));
    }

    public function test_it_can_remove_every_image_in_a_collection(): void
    {
        $creator = $this->creator();
        $order = $this->orderWithArtwork($creator);

        $ids = $order->getMedia('shirt_artwork')->pluck('id')->map(fn ($id): int => (int) $id)->all();

        (new UpdateOrderAction)->execute($order, $this->orderData([
            'removed_media_ids' => $ids,
        ]), $creator->id);

        $this->assertCount(0, $order->refresh()->getMedia('shirt_artwork'));
    }

    public function test_it_refuses_to_delete_another_orders_artwork(): void
    {
        $creator = $this->creator();
        $mine = $this->orderWithArtwork($creator);
        $someoneElses = $this->orderWithArtwork($creator);

        $victimId = (int) $someoneElses->getMedia('shirt_artwork')->first()->id;

        (new UpdateOrderAction)->execute($mine, $this->orderData([
            'removed_media_ids' => [$victimId],
        ]), $creator->id);

        // The other order keeps every image; ids are scoped to the order being saved.
        $this->assertCount(2, $someoneElses->refresh()->getMedia('shirt_artwork'));
        $this->assertCount(2, $mine->refresh()->getMedia('shirt_artwork'));
    }

    public function test_removing_nothing_leaves_every_image_alone(): void
    {
        $creator = $this->creator();
        $order = $this->orderWithArtwork($creator);

        (new UpdateOrderAction)->execute($order, $this->orderData(), $creator->id);

        $this->assertCount(2, $order->refresh()->getMedia('shirt_artwork'));
        $this->assertCount(1, $order->getMedia('pants_artwork'));
    }

    public function test_a_junk_id_is_ignored_rather_than_deleting_anything(): void
    {
        $creator = $this->creator();
        $order = $this->orderWithArtwork($creator);

        (new UpdateOrderAction)->execute($order, $this->orderData([
            'removed_media_ids' => [0, -5, 999999, 'abc', null],
        ]), $creator->id);

        $this->assertCount(2, $order->refresh()->getMedia('shirt_artwork'));
    }

    public function test_removing_and_adding_in_the_same_save_both_take_effect(): void
    {
        $creator = $this->creator();
        $order = $this->orderWithArtwork($creator);

        $removedId = (int) $order->getMedia('shirt_artwork')->first()->id;

        (new UpdateOrderAction)->execute($order, $this->orderData([
            'removed_media_ids' => [$removedId],
            'shirt_artwork' => [$this->image('shirt-c.jpg')],
        ]), $creator->id);

        $remaining = $order->refresh()->getMedia('shirt_artwork');

        $this->assertCount(2, $remaining);
        $this->assertNotContains($removedId, $remaining->pluck('id')->map(fn ($id): int => (int) $id)->all());
    }

    public function test_duplicating_skips_removed_artwork_without_touching_the_source(): void
    {
        $creator = $this->creator();
        $source = $this->orderWithArtwork($creator);

        $skippedId = (int) $source->getMedia('shirt_artwork')->first()->id;

        $copy = (new CreateOrderAction)->execute($this->orderData([
            'duplicate_from_id' => $source->id,
            'removed_media_ids' => [$skippedId],
        ]), $creator->id);

        // The copy carries one shirt image, the source still has both.
        $this->assertCount(1, $copy->getMedia('shirt_artwork'));
        $this->assertCount(2, $source->refresh()->getMedia('shirt_artwork'));
    }
}
