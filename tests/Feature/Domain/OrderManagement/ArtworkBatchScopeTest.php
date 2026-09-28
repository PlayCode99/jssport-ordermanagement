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
 * A bill splits into production batches — garment, size group and length —
 * and a sheet is printed per batch. Artwork can be pinned to one batch so
 * only that sheet takes it; artwork left unpinned goes on every sheet of its
 * garment, which is how every bill worked before and how most are still drawn
 * up.
 */
class ArtworkBatchScopeTest extends TestCase
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
            ['customer_code' => 'CUS-BATCH-1'],
            ['customer_name' => 'ลูกค้าทดสอบ'],
        );
        $branch = Branch::firstOrCreate(
            ['branch_code' => 'BR-BATCH-1'],
            ['branch_name' => 'สาขาทดสอบ'],
        );

        return array_merge([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'งานทดสอบรูป',
            'job_type' => 'งานปัก',
            'order_date' => '2026-09-01 09:00:00',
            'due_date' => '2026-09-20 18:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'separate_shirt',
                'size_group' => 'adults',
                'size_label' => 'L',
                'quantity' => 10,
                'unit_price' => 100,
            ]],
        ], $over);
    }

    private function image(string $name): UploadedFile
    {
        return UploadedFile::fake()->image($name, 40, 40);
    }

    /** @return array<string, string|null> filename => batch it is pinned to */
    private function batchesByName(Order $order, string $collection = 'shirt_artwork'): array
    {
        $found = [];

        foreach ($order->refresh()->getMedia($collection) as $media) {
            $found[$media->name] = $media->getCustomProperty(Order::ARTWORK_BATCH_PROPERTY);
        }

        return $found;
    }

    public function test_artwork_uploaded_without_a_batch_is_pinned_to_none(): void
    {
        $order = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork' => [$this->image('ทุกใบ.jpg')],
        ]), $this->creator()->id);

        // No batch means every sheet of that garment takes it — the way bills
        // worked before batches could be told apart.
        $this->assertSame(['ทุกใบ' => null], $this->batchesByName($order));
    }

    public function test_artwork_uploaded_for_one_batch_carries_that_batch(): void
    {
        $order = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork' => [$this->image('ทุกใบ.jpg')],
            'shirt_artwork_scoped' => [
                'shirt_adults_long' => [$this->image('แขนยาว.jpg')],
            ],
            'pants_artwork_scoped' => [
                'pants_kids_short' => [$this->image('ขาสั้นเด็ก.jpg')],
            ],
        ]), $this->creator()->id);

        $this->assertSame(
            ['ทุกใบ' => null, 'แขนยาว' => 'shirt_adults_long'],
            $this->batchesByName($order),
        );
        $this->assertSame(
            ['ขาสั้นเด็ก' => 'pants_kids_short'],
            $this->batchesByName($order, 'pants_artwork'),
        );
    }

    public function test_the_form_is_told_which_batch_each_image_is_pinned_to(): void
    {
        $order = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork_scoped' => [
                'shirt_adults_long' => [$this->image('แขนยาว.jpg')],
            ],
        ]), $this->creator()->id);

        $media = $order->refresh()->shirt_artwork_media;

        $this->assertCount(1, $media);
        $this->assertSame('shirt_adults_long', $media[0]['batch']);
        $this->assertArrayHasKey('id', $media[0]);
        $this->assertArrayHasKey('url', $media[0]);
    }

    public function test_a_batch_that_cannot_exist_is_refused_and_the_image_is_shown_everywhere(): void
    {
        $order = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork_scoped' => [
                // A trouser batch under shirt artwork, and outright nonsense.
                'pants_adults_long' => [$this->image('ผิดชิ้นงาน.jpg')],
                'drop table' => [$this->image('ขยะ.jpg')],
            ],
        ]), $this->creator()->id);

        // Kept and shown on every shirt sheet, never pinned to a sheet that
        // cannot exist and never silently thrown away.
        $this->assertSame(
            ['ผิดชิ้นงาน' => null, 'ขยะ' => null],
            $this->batchesByName($order),
        );
    }

    public function test_editing_can_pin_an_image_already_on_file_to_one_batch(): void
    {
        $creator = $this->creator();
        $order = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork' => [$this->image('เดิม.jpg')],
        ]), $creator->id);

        $mediaId = (int) $order->getMedia('shirt_artwork')->first()->id;

        (new UpdateOrderAction)->execute($order, $this->orderData([
            'artwork_scopes' => [$mediaId => 'shirt_adults_short'],
        ]), $creator->id);

        $this->assertSame(['เดิม' => 'shirt_adults_short'], $this->batchesByName($order));
    }

    public function test_editing_can_put_a_pinned_image_back_on_every_sheet(): void
    {
        $creator = $this->creator();
        $order = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork_scoped' => [
                'shirt_adults_long' => [$this->image('แขนยาว.jpg')],
            ],
        ]), $creator->id);

        $mediaId = (int) $order->getMedia('shirt_artwork')->first()->id;

        (new UpdateOrderAction)->execute($order, $this->orderData([
            'artwork_scopes' => [$mediaId => ''],
        ]), $creator->id);

        $this->assertSame(['แขนยาว' => null], $this->batchesByName($order));
    }

    public function test_editing_never_re_pins_another_bills_artwork(): void
    {
        $creator = $this->creator();
        $victim = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork' => [$this->image('ของบิลอื่น.jpg')],
        ]), $creator->id);
        $order = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork' => [$this->image('ของบิลนี้.jpg')],
        ]), $creator->id);

        $victimMediaId = (int) $victim->getMedia('shirt_artwork')->first()->id;

        (new UpdateOrderAction)->execute($order, $this->orderData([
            'artwork_scopes' => [$victimMediaId => 'shirt_adults_long'],
        ]), $creator->id);

        $this->assertSame(['ของบิลอื่น' => null], $this->batchesByName($victim));
    }

    public function test_a_re_opened_bill_keeps_the_batch_each_image_was_pinned_to(): void
    {
        $creator = $this->creator();
        $source = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork' => [$this->image('ทุกใบ.jpg')],
            'shirt_artwork_scoped' => [
                'shirt_adults_long' => [$this->image('แขนยาว.jpg')],
            ],
        ]), $creator->id);

        $copy = (new CreateOrderAction)->execute($this->orderData([
            'duplicate_from_id' => $source->id,
        ]), $creator->id);

        $this->assertSame(
            ['ทุกใบ' => null, 'แขนยาว' => 'shirt_adults_long'],
            $this->batchesByName($copy),
        );
    }

    public function test_a_re_opened_bill_can_re_pin_a_copied_image_without_touching_the_source(): void
    {
        $creator = $this->creator();
        $source = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork' => [$this->image('เดิม.jpg')],
        ]), $creator->id);

        $sourceMediaId = (int) $source->getMedia('shirt_artwork')->first()->id;

        $copy = (new CreateOrderAction)->execute($this->orderData([
            'duplicate_from_id' => $source->id,
            // Keyed by the source image's id, which is what the form shows.
            'artwork_scopes' => [$sourceMediaId => 'shirt_kids_short'],
        ]), $creator->id);

        $this->assertSame(['เดิม' => 'shirt_kids_short'], $this->batchesByName($copy));
        $this->assertSame(['เดิม' => null], $this->batchesByName($source));
    }

    public function test_a_colour_house_keeps_the_sheet_its_artwork_was_pinned_to(): void
    {
        $order = (new CreateOrderAction)->execute($this->orderData([
            'shirt_artwork' => [$this->image('ทุกคณะ.jpg')],
            'shirt_artwork_scoped' => [
                'sports_day_0_shirt_adults' => [$this->image('แดงผู้ใหญ่.jpg')],
                'sports_day_1_shirt_kids' => [$this->image('น้ำเงินเด็ก.jpg')],
            ],
            'pants_artwork_scoped' => [
                'sports_day_0_pants_adults' => [$this->image('แดงกางเกง.jpg')],
            ],
        ]), $this->creator()->id);

        $this->assertSame([
            'ทุกคณะ' => null,
            'แดงผู้ใหญ่' => 'sports_day_0_shirt_adults',
            'น้ำเงินเด็ก' => 'sports_day_1_shirt_kids',
        ], $this->batchesByName($order));
        $this->assertSame(
            ['แดงกางเกง' => 'sports_day_0_pants_adults'],
            $this->batchesByName($order, 'pants_artwork'),
        );
    }

    /**
     * กีฬาสี bills are cut per colour house, and the board prints one sheet
     * per house, garment and size group — no sleeve length. Those sheets have
     * to be pinnable too, or Form 3 is back to one pile of pictures for the
     * whole bill.
     */
    public function test_a_colour_house_sheet_is_a_batch_an_image_can_be_pinned_to(): void
    {
        $this->assertSame(
            'sports_day_0_shirt_adults',
            Order::normalizeArtworkBatch('sports_day_0_shirt_adults', 'shirt_artwork'),
        );
        $this->assertSame(
            'sports_day_12_pants_kids',
            Order::normalizeArtworkBatch('sports_day_12_pants_kids', 'pants_artwork'),
        );
    }

    public function test_a_colour_house_sheet_of_the_other_garment_is_refused(): void
    {
        // A shirt image pinned to the trouser sheet would print on a page it
        // has nothing to do with, so the key is read as "every sheet" instead.
        $this->assertNull(
            Order::normalizeArtworkBatch('sports_day_0_pants_adults', 'shirt_artwork'),
        );
        $this->assertNull(
            Order::normalizeArtworkBatch('sports_day_0_shirt_adults', 'pants_artwork'),
        );
    }

    public function test_a_colour_house_key_that_names_no_sheet_is_refused(): void
    {
        foreach ([
            'sports_day_shirt_adults',          // no house
            'sports_day_0_shirt_short',         // a length, which these sheets do not have
            'sports_day_000_shirt_adults',      // outside the house numbering
            'sports_day_0_shirt_adults_extra',  // trailing rubbish
        ] as $key) {
            $this->assertNull(
                Order::normalizeArtworkBatch($key, 'shirt_artwork'),
                $key.' should name no sheet',
            );
        }
    }
}
