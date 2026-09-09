<?php

namespace Tests\Feature\Domain\OrderManagement;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Domain\OrderManagement\Actions\UpdateOrderAction;
use App\Domain\Production\Actions\AdvanceRoutingStationAction;
use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\OrderRouting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class UpdateOrderActionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Regression test for the critical bug where editing an order (e.g. to fix
     * a customer phone number) wiped every order_routings row back to "pending",
     * destroying in-progress/completed production state. UpdateOrderAction must
     * never delete or recreate routings — only AdvanceRoutingStationAction
     * (production flow) and ProcessQcInspectionAction (QC) are allowed to.
     */
    public function test_editing_an_order_never_resets_routing_progress_already_in_production(): void
    {
        $customer = Customer::create([
            'customer_code' => 'CUS-UPD-0001',
            'customer_name' => 'Update Regression Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-UPD-0001',
            'branch_name' => 'Update Regression Branch',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        $order = (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Regression Order',
            'job_type' => 'งานปัก',
            'order_date' => '2026-08-01 09:00:00',
            'due_date' => '2026-08-10 18:00:00',
            'discount_percent' => 0,
            'items' => [
                [
                    'item_type' => 'shirt',
                    'size_group' => 'adults',
                    'size_label' => 'L',
                    'quantity' => 10,
                    'unit_price' => 50,
                ],
            ],
        ], $creator->id);

        // Advance the first station (cutting) to in_progress, then complete it,
        // and start the second station (embroidery), to simulate real production
        // progress that must never be lost by an unrelated order edit.
        $cutting = (new AdvanceRoutingStationAction)->execute(
            $order, RoutingStationName::Cutting, RoutingStatus::InProgress, $creator->id,
        );
        $cutting = (new AdvanceRoutingStationAction)->execute(
            $order, RoutingStationName::Cutting, RoutingStatus::Completed, $creator->id,
        );
        $embroidery = (new AdvanceRoutingStationAction)->execute(
            $order, RoutingStationName::Embroidery, RoutingStatus::InProgress, $creator->id,
        );

        $this->assertSame(RoutingStatus::Completed, $cutting->status);
        $this->assertNotNull($cutting->completed_at);
        $this->assertSame(RoutingStatus::InProgress, $embroidery->status);
        $this->assertNotNull($embroidery->started_at);

        $routingCountBeforeEdit = OrderRouting::query()->where('order_id', $order->id)->count();
        $this->assertGreaterThan(0, $routingCountBeforeEdit);

        // Simulate the counter staff editing unrelated fields (phone number, discount)
        // on the order while it is mid-production, exactly like the real UI does:
        // it recomputes and resubmits a 'routings' array derived from job_type.
        $updatedOrder = (new UpdateOrderAction)->execute($order, [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Regression Order (updated)',
            'job_type' => 'งานปัก',
            'order_date' => '2026-08-01 09:00:00',
            'due_date' => '2026-08-12 18:00:00',
            'discount_percent' => 5,
            'items' => [
                [
                    'item_type' => 'shirt',
                    'size_group' => 'adults',
                    'size_label' => 'L',
                    'quantity' => 10,
                    'unit_price' => 50,
                ],
            ],
            // Frontend always resubmits a freshly recomputed routing plan; the
            // action must ignore it entirely and keep existing routings intact.
            'routings' => ['cutting', 'embroidery', 'sewing', 'qc', 'shipping'],
        ], $creator->id);

        $this->assertSame(
            $routingCountBeforeEdit,
            OrderRouting::query()->where('order_id', $order->id)->count(),
            'Editing an order must not change the number of routing rows.',
        );

        $cutting->refresh();
        $embroidery->refresh();

        $this->assertSame(RoutingStatus::Completed, $cutting->status, 'Completed station must stay completed after an order edit.');
        $this->assertNotNull($cutting->completed_at);
        $this->assertSame(RoutingStatus::InProgress, $embroidery->status, 'In-progress station must stay in progress after an order edit.');
        $this->assertNotNull($embroidery->started_at);

        // The unrelated fields the edit actually targeted should still be applied.
        $this->assertSame('Regression Order (updated)', $updatedOrder->job_name);
        $this->assertSame('2026-08-12 18:00:00', $updatedOrder->due_date->format('Y-m-d H:i:s'));
    }

    /**
     * shirt_artwork/pants_artwork are no longer singleFile() media collections.
     * Like reference_designs, editing an order must only ever ADD newly selected
     * images to those collections — it must never delete images saved earlier.
     */
    public function test_it_appends_new_shirt_and_pants_artwork_images_on_update_without_removing_existing_ones(): void
    {
        Storage::fake('public');

        $customer = Customer::create([
            'customer_code' => 'CUS-UPD-ART-0001',
            'customer_name' => 'Update Artwork Customer',
        ]);

        $branch = Branch::create([
            'branch_code' => 'BR-UPD-ART-0001',
            'branch_name' => 'Update Artwork Branch',
        ]);

        $creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);

        $order = (new CreateOrderAction)->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Artwork Update Order',
            'job_type' => 'งานปัก',
            'order_date' => '2026-08-01 09:00:00',
            'due_date' => '2026-08-10 18:00:00',
            'discount_percent' => 0,
            'items' => [
                [
                    'item_type' => 'shirt',
                    'size_group' => 'adults',
                    'size_label' => 'L',
                    'quantity' => 5,
                    'unit_price' => 50,
                ],
            ],
            'shirt_artwork' => UploadedFile::fake()->image('shirt-original.jpg', 120, 120),
            'pants_artwork' => UploadedFile::fake()->image('pants-original.jpg', 120, 120),
        ], $creator->id);

        $order->refresh();
        $this->assertCount(1, $order->getMedia('shirt_artwork'));
        $this->assertCount(1, $order->getMedia('pants_artwork'));

        $updatedOrder = (new UpdateOrderAction)->execute($order, [
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'Artwork Update Order',
            'job_type' => 'งานปัก',
            'order_date' => '2026-08-01 09:00:00',
            'due_date' => '2026-08-10 18:00:00',
            'discount_percent' => 0,
            'items' => [
                [
                    'item_type' => 'shirt',
                    'size_group' => 'adults',
                    'size_label' => 'L',
                    'quantity' => 5,
                    'unit_price' => 50,
                ],
            ],
            'shirt_artwork' => [
                UploadedFile::fake()->image('shirt-extra-1.jpg', 120, 120),
                UploadedFile::fake()->image('shirt-extra-2.jpg', 120, 120),
            ],
            'pants_artwork' => [
                UploadedFile::fake()->image('pants-extra-1.jpg', 120, 120),
            ],
        ], $creator->id);

        $updatedOrder->refresh();

        // The originally uploaded images must still be present (append, not replace).
        $this->assertCount(3, $updatedOrder->getMedia('shirt_artwork'));
        $this->assertCount(2, $updatedOrder->getMedia('pants_artwork'));
        $this->assertCount(3, $updatedOrder->shirt_artwork_urls);
        $this->assertCount(2, $updatedOrder->pants_artwork_urls);
    }
}
