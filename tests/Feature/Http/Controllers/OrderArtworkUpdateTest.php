<?php

namespace Tests\Feature\Http\Controllers;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Domain\OrderManagement\Actions\SyncOrderArtworkAction;
use App\Enums\OrderStatus;
use App\Enums\RoutingStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderRouting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * "อัปเดตรูป" on the counter: the pictures on a bill, changed on their own.
 *
 * The point of the feature is that it keeps working after the counter form
 * has stopped — a corrected logo arrives mid-run, and a finished job gets a
 * photograph of what actually shipped. The point of these tests is that it
 * does so without becoming a second way to edit the bill: the money, the
 * dates and the shop floor's progress must come out the other side untouched.
 */
class OrderArtworkUpdateTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');

        $this->customer = Customer::create([
            'customer_code' => 'CUS-ART-1',
            'customer_name' => 'ลูกค้ารูป',
        ]);

        $this->branch = Branch::create([
            'branch_code' => 'BR-ART-1',
            'branch_name' => 'สาขารูป',
        ]);
    }

    private function user(UserRole $role, ?Branch $branch = null): User
    {
        return User::factory()->create([
            'role' => $role,
            'station_department' => StationDepartment::None,
            'branch_id' => ($branch ?? $this->branch)->id,
        ]);
    }

    private function makeOrder(User $creator, array $overrides = []): Order
    {
        $order = (new CreateOrderAction)->execute(array_merge([
            'customer_id' => $this->customer->id,
            'branch_id' => $this->branch->id,
            'job_name' => 'งานรูป',
            'job_type' => 'งานปัก',
            'order_date' => '2026-07-11 09:30:00',
            'due_date' => '2026-07-20 18:00:00',
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'separate_shirt', 'size_group' => 'adults', 'size_tier' => 'adults',
                'size_label' => 'L', 'shirt_style' => 'short',
                'quantity' => 10, 'unit_price' => 100,
            ]],
        ], $overrides), $creator->id);

        return Order::query()->findOrFail($order->id);
    }

    private function startProduction(Order $order): void
    {
        $routing = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('is_required', true)
            ->firstOrFail();

        DB::table('order_routings')
            ->where('id', $routing->id)
            ->update(['status' => RoutingStatus::InProgress->value]);
    }

    private function image(string $name): UploadedFile
    {
        return UploadedFile::fake()->image($name, 40, 40);
    }

    // ---------------- the reason the feature exists ----------------

    public function test_a_bill_already_in_production_can_still_have_a_picture_added(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);
        $this->startProduction($order);

        // The counter form is shut by now; this is the whole point.
        $this->actingAs($sales)->get("/orders/{$order->id}/edit")->assertForbidden();

        $this->actingAs($sales)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('new-logo.png')]])
            ->assertOk();

        $this->assertSame(
            ['new-logo'],
            $order->refresh()->getMedia('shirt_artwork')->pluck('name')->all(),
        );
    }

    public function test_a_finished_bill_can_have_its_mock_up_replaced_with_the_real_photograph(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);

        $this->actingAs($sales)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('mock-up.png')]])
            ->assertOk();

        $mockUp = $order->refresh()->getMedia('shirt_artwork')->firstOrFail();

        $order->forceFill(['order_status' => OrderStatus::Completed])->save();

        // Swapping a picture is one delete and one upload arriving together.
        $this->actingAs($sales)
            ->post("/orders/{$order->id}/artwork", [
                'removed_media_ids' => [$mockUp->id],
                'shirt_artwork' => [$this->image('as-shipped.png')],
            ])
            ->assertOk();

        $this->assertSame(
            ['as-shipped'],
            $order->refresh()->getMedia('shirt_artwork')->pluck('name')->all(),
        );
    }

    public function test_a_saved_picture_can_be_moved_to_another_sheet(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('logo.png')]])
            ->assertOk();

        $media = $order->refresh()->getMedia('shirt_artwork')->firstOrFail();

        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", [
                'artwork_scopes' => [(string) $media->id => 'shirt_adults_short'],
            ])
            ->assertOk();

        $this->assertSame(
            'shirt_adults_short',
            $order->refresh()->getMedia('shirt_artwork')->firstOrFail()
                ->getCustomProperty(Order::ARTWORK_BATCH_PROPERTY),
        );
    }

    // ---------------- it must not become a second edit form ----------------

    public function test_it_cannot_change_anything_but_the_pictures(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);
        $this->startProduction($order);

        $snapshot = static fn (Order $order): array => [
            'job_name' => $order->job_name,
            'due_date' => $order->due_date?->format('Y-m-d'),
            'total_amount' => (float) $order->total_amount,
            'net_amount' => (float) $order->net_amount,
            'discount_percent' => (float) $order->discount_percent,
        ];

        $before = $snapshot($order);
        $routingsBefore = $order->routings()->pluck('status', 'id')->all();

        $this->actingAs($sales)
            ->post("/orders/{$order->id}/artwork", [
                // Everything a crafted request might try to smuggle in.
                'job_name' => 'ชื่อใหม่',
                'due_date' => '2099-01-01',
                'discount_percent' => 90,
                'total_amount' => 1,
                'items' => [['item_type' => 'shirt', 'quantity' => 999, 'unit_price' => 0]],
                'shirt_artwork' => [$this->image('logo.png')],
            ])
            ->assertOk();

        $order->refresh();

        $this->assertSame($before, $snapshot($order));
        $this->assertSame($routingsBefore, $order->routings()->pluck('status', 'id')->all());
        $this->assertCount(1, $order->items()->get());
        $this->assertSame(10, (int) $order->items()->first()->quantity);
    }

    public function test_it_cannot_delete_another_bills_picture(): void
    {
        $admin = $this->user(UserRole::Admin);
        $mine = $this->makeOrder($admin);
        $theirs = $this->makeOrder($admin);

        $this->actingAs($admin)
            ->post("/orders/{$theirs->id}/artwork", ['shirt_artwork' => [$this->image('theirs.png')]])
            ->assertOk();

        $victim = $theirs->refresh()->getMedia('shirt_artwork')->firstOrFail();

        $this->actingAs($admin)
            ->post("/orders/{$mine->id}/artwork", ['removed_media_ids' => [$victim->id]])
            ->assertOk();

        $this->assertCount(1, $theirs->refresh()->getMedia('shirt_artwork'));
    }

    public function test_a_sheet_the_bill_cannot_have_is_refused_rather_than_stored(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", [
                'shirt_artwork_scoped' => ['pants_adults_long' => [$this->image('wrong-sheet.png')]],
            ])
            ->assertOk();

        // Pinned to nothing rather than to a trouser sheet: a shirt picture on
        // the trouser sheet would be printed in the wrong room.
        $this->assertNull(
            $order->refresh()->getMedia('shirt_artwork')->firstOrFail()
                ->getCustomProperty(Order::ARTWORK_BATCH_PROPERTY),
        );
    }

    // ---------------- how a picture is stored ----------------

    public function test_a_picture_added_later_is_stored_as_webp_like_the_bills_first_artwork(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", [
                'shirt_artwork' => [$this->image('photo.png')],
                'sports_day_artwork' => [0 => [$this->image('house.jpg')]],
                'pe_uniform_artwork' => ['kids' => [$this->image('table.png')]],
            ])
            ->assertOk();

        $order->refresh();

        foreach (['shirt_artwork', 'sports_day_artwork', 'pe_uniform_artwork'] as $collection) {
            $media = $order->getMedia($collection)->firstOrFail();

            $this->assertSame('webp', pathinfo($media->file_name, PATHINFO_EXTENSION), $collection);
            $this->assertSame('image/webp', $media->mime_type, $collection);
        }
    }

    public function test_the_two_slots_that_accept_a_pdf_are_stored_exactly_as_they_came(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", [
                'design_artwork' => UploadedFile::fake()->create('cover.pdf', 10, 'application/pdf'),
                'reference_designs' => [UploadedFile::fake()->create('ref.pdf', 10, 'application/pdf')],
            ])
            ->assertOk();

        $order->refresh();

        $this->assertSame('cover.pdf', $order->getMedia('artwork')->firstOrFail()->file_name);
        $this->assertSame('ref.pdf', $order->getMedia('reference_designs')->firstOrFail()->file_name);
    }

    public function test_a_webp_this_host_cannot_decode_is_kept_rather_than_refused(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        // Stands in for the case the shortcut exists for: a file already named
        // .webp that the conversion cannot read back — an animated one, or a
        // host whose GD was built without webp. Refusing it would lose a
        // picture that is already in the format we wanted.
        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", [
                'shirt_artwork' => [
                    UploadedFile::fake()->create('already.webp', 10, 'image/webp'),
                ],
            ])
            ->assertOk();

        $this->assertSame(
            'already.webp',
            $order->refresh()->getMedia('shirt_artwork')->firstOrFail()->file_name,
        );
    }

    public function test_a_file_that_cannot_be_opened_is_reported_rather_than_crashing(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('good.png')]])
            ->assertOk();

        // Named .png, passes the mime rules, and is not an image at all.
        $broken = UploadedFile::fake()->create('broken.png', 5, 'image/png');

        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$broken]])
            ->assertSessionHasErrors('shirt_artwork');

        // Rolled back whole: the picture that was already there is untouched
        // and the broken one was never stored beside it.
        $this->assertSame(
            ['good'],
            $order->refresh()->getMedia('shirt_artwork')->pluck('name')->all(),
        );
    }

    // ---------------- who may do it ----------------

    public function test_a_designer_may_update_the_pictures(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);
        $designer = $this->user(UserRole::Designer);

        $this->actingAs($designer)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('logo.png')]])
            ->assertOk();

        $this->assertCount(1, $order->refresh()->getMedia('shirt_artwork'));
    }

    public function test_a_production_worker_may_not(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);
        $worker = $this->user(UserRole::Worker);

        $this->actingAs($worker)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('logo.png')]])
            ->assertForbidden();

        $this->assertCount(0, $order->refresh()->getMedia('shirt_artwork'));
    }

    public function test_a_cancelled_bill_is_closed_to_picture_changes(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);
        $order->forceFill(['order_status' => OrderStatus::Cancelled])->save();

        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('logo.png')]])
            ->assertForbidden();

        $this->actingAs($admin)->get("/orders/{$order->id}/artwork")->assertForbidden();
    }

    public function test_another_branchs_bill_is_out_of_reach(): void
    {
        $owner = $this->user(UserRole::Sales);
        $order = $this->makeOrder($owner);

        $elsewhere = Branch::create(['branch_code' => 'BR-ART-2', 'branch_name' => 'อีกสาขา']);
        $outsider = $this->user(UserRole::Sales, $elsewhere);

        $this->actingAs($outsider)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('logo.png')]])
            ->assertForbidden();
    }

    public function test_updating_pictures_requires_authentication(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $this->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('logo.png')]])
            ->assertRedirect('/login');
    }

    // ---------------- what the dialog is shown ----------------

    public function test_show_lists_the_sheets_this_bill_prints_and_the_pictures_on_them(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", [
                'shirt_artwork_scoped' => ['shirt_adults_short' => [$this->image('sheet-logo.png')]],
            ])
            ->assertOk();

        $response = $this->actingAs($admin)->get("/orders/{$order->id}/artwork")->assertOk();
        $data = $response->json('data');
        $placeKeys = array_column($data['places'], 'key');

        // One bill, one job type, one slot. The bill sells a short-sleeved
        // adult shirt and nothing else, so that is the whole list — no cover,
        // no references, no "every shirt sheet", no ชุดพละ tables, and
        // certainly nothing for trousers it does not sell.
        $this->assertSame(['shirt_adults_short'], $placeKeys);

        $this->assertCount(1, $data['images']);
        $this->assertSame('shirt_adults_short', $data['images'][0]['place']);
    }

    public function test_a_bill_offers_one_slot_per_job_type_it_actually_carries(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin, [
            'items' => [
                [
                    'item_type' => 'separate_shirt', 'size_group' => 'kids', 'size_tier' => 'kids',
                    'size_label' => 'S', 'shirt_style' => 'short', 'quantity' => 5, 'unit_price' => 100,
                ],
                [
                    'item_type' => 'separate_shirt', 'size_group' => 'kids', 'size_tier' => 'junior',
                    'size_label' => 'M', 'shirt_style' => 'short', 'quantity' => 7, 'unit_price' => 100,
                ],
                [
                    'item_type' => 'separate_pants', 'size_group' => 'kids', 'size_tier' => 'kids',
                    'size_label' => 'S', 'pants_style' => 'long', 'quantity' => 5, 'unit_price' => 80,
                ],
            ],
        ]);

        $data = $this->actingAs($admin)->get("/orders/{$order->id}/artwork")->assertOk()->json('data');

        $this->assertSame(
            ['shirt_kids_short', 'shirt_junior_short', 'pants_kids_long'],
            array_column($data['places'], 'key'),
        );
        $this->assertSame([5, 7, 5], array_column($data['places'], 'quantity'));
    }

    public function test_the_cover_and_the_references_are_listed_only_when_the_bill_carries_them(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        $before = $this->actingAs($admin)->get("/orders/{$order->id}/artwork")->assertOk()->json('data');
        $this->assertNotContains('artwork', array_column($before['places'], 'key'));
        $this->assertNotContains('reference', array_column($before['places'], 'key'));

        // A bill written with a cover and a reference keeps both reachable —
        // a picture nobody can see is a picture nobody can delete.
        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", [
                'design_artwork' => $this->image('cover.png'),
                'reference_designs' => [$this->image('ref.png')],
            ])
            ->assertOk();

        $after = $this->actingAs($admin)->get("/orders/{$order->id}/artwork")->assertOk()->json('data');
        $placeKeys = array_column($after['places'], 'key');

        $this->assertContains('artwork', $placeKeys);
        $this->assertContains('reference', $placeKeys);
    }

    public function test_an_unpinned_picture_keeps_its_every_sheet_slot(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        // Not pinned to a sheet: it prints on every shirt sheet of the bill.
        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('logo.png')]])
            ->assertOk();

        $data = $this->actingAs($admin)->get("/orders/{$order->id}/artwork")->assertOk()->json('data');
        $shirtPlace = collect($data['places'])->firstWhere('key', 'shirt');

        $this->assertNotNull($shirtPlace, '"ทุกใบงานเสื้อ" must stay listed while it holds a picture');
        $this->assertSame('garment_all', $shirtPlace['kind']);
    }

    public function test_a_picture_left_behind_by_an_edited_away_sheet_is_still_reachable(): void
    {
        $admin = $this->user(UserRole::Admin);
        $order = $this->makeOrder($admin);

        // Pinned to a sheet of long sleeves, which this bill does not print.
        $this->actingAs($admin)
            ->post("/orders/{$order->id}/artwork", [
                'shirt_artwork_scoped' => ['shirt_adults_long' => [$this->image('orphan.png')]],
            ])
            ->assertOk();

        $data = $this->actingAs($admin)->get("/orders/{$order->id}/artwork")->assertOk()->json('data');

        $this->assertContains('shirt_adults_long', array_column($data['places'], 'key'));
        $this->assertSame('shirt_adults_long', $data['images'][0]['place']);
    }

    public function test_a_picture_added_later_records_who_added_it(): void
    {
        $designer = $this->user(UserRole::Designer);
        $order = $this->makeOrder($this->user(UserRole::Sales));

        $this->actingAs($designer)
            ->post("/orders/{$order->id}/artwork", ['shirt_artwork' => [$this->image('logo.png')]])
            ->assertOk();

        $media = $order->refresh()->getMedia('shirt_artwork')->firstOrFail();

        $this->assertSame(
            $designer->name,
            $media->getCustomProperty(SyncOrderArtworkAction::UPLOADED_BY_NAME_PROPERTY),
        );
        $this->assertSame(
            $designer->id,
            $media->getCustomProperty(SyncOrderArtworkAction::UPLOADED_BY_PROPERTY),
        );
        $this->assertNotNull($media->getCustomProperty(SyncOrderArtworkAction::UPLOADED_AT_PROPERTY));
    }

    public function test_the_counter_says_whether_this_user_may_update_the_pictures(): void
    {
        $sales = $this->user(UserRole::Sales);
        $order = $this->makeOrder($sales);
        $this->startProduction($order);

        $this->actingAs($sales)->get('/counter')->assertInertia(
            fn ($page) => $page->where('orders.0.details.can_update_artwork', true)
                ->etc(),
        );

        $worker = $this->user(UserRole::Worker);

        $this->actingAs($worker)->get('/counter')->assertInertia(
            fn ($page) => $page->where('orders.0.details.can_update_artwork', false)
                ->etc(),
        );
    }
}
