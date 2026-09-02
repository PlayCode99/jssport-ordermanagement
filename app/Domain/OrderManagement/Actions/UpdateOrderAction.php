<?php
declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentType;
use App\Models\Order;
use App\Models\Receipt;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class UpdateOrderAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(Order $order, array $data, int $actorUserId): Order
    {
        try {
            return DB::transaction(function () use ($order, $data, $actorUserId): Order {
                $order->update([
                    'customer_id' => isset($data['customer_id']) && $data['customer_id'] !== null
                        ? (int) $data['customer_id']
                        : $order->customer_id,
                    'branch_id' => (int) ($data['branch_id'] ?? $order->branch_id),
                    'job_name' => (string) ($data['job_name'] ?? $order->job_name),
                    'job_type' => (string) ($data['job_type'] ?? $order->job_type),
                    'delivery_method' => isset($data['delivery_method']) ? (string) $data['delivery_method'] : $order->delivery_method,
                    'shipping_address' => isset($data['shipping_address']) ? (string) $data['shipping_address'] : $order->shipping_address,
                    'order_date' => (string) ($data['order_date'] ?? $order->order_date),
                    'due_date' => (string) ($data['due_date'] ?? $order->due_date),
                    'discount_percent' => (float) ($data['discount_percent'] ?? $order->discount_percent ?? 0),
                ]);

                $items = $data['items'] ?? [];
                $order->items()->delete();
                foreach ($items as $item) {
                    $order->items()->create([
                        'item_type' => (string) ($item['item_type'] ?? 'garment'),
                        'size_group' => (string) ($item['size_group'] ?? 'adults'),
                        'size_label' => (string) ($item['size_label'] ?? 'M'),
                        'quantity' => (int) ($item['quantity'] ?? 0),
                        'unit_price' => (float) ($item['unit_price'] ?? 0),
                        'total_price' => (float) (($item['quantity'] ?? 0) * ($item['unit_price'] ?? 0)),
                    ]);
                }

                $specificationData = is_array($data['specification'] ?? null) ? $data['specification'] : [];
                $order->specification()->delete();
                if ($specificationData !== []) {
                    $order->specification()->create(Arr::only($specificationData, [
                        'pattern_id',
                        'fabric_id',
                        'neck_style_id',
                        'collar_color',
                        'leg_style',
                        'leg_hem',
                        'placket_style',
                        'placket_color',
                        'sleeve_style',
                        'sleeve_hem',
                        'sublimation_detail',
                        'screen_print_detail',
                        'embroidery_code',
                    ]));
                }

                // Intentionally do not touch order_routings here. Production progress
                // (station status, assigned users/teams, started_at/completed_at) is
                // owned by AdvanceRoutingStationAction and must survive unrelated edits
                // to the order (e.g. fixing a phone number or discount). Any incoming
                // 'routings' field is accepted for validation compatibility but ignored.

                $receipt = $order->receipts()->first();
                $depositAmount = max(0.0, (float) ($data['deposit_amount'] ?? 0));
                $paymentMethod = ((string) ($data['payment_method'] ?? 'cash')) === 'transfer'
                    ? PaymentMethod::BankTransfer
                    : PaymentMethod::Cash;

                if ($receipt === null) {
                    $receiptCode = 'RCP-'.now()->format('Y').'-'.str_pad((string) (Receipt::withTrashed()->count() + 1), 5, '0', STR_PAD_LEFT);
                    $receipt = $order->receipts()->create([
                        'receipt_code' => $receiptCode,
                        'cashier_user_id' => $actorUserId,
                        'payment_date' => now(),
                        'payment_type' => $depositAmount > 0 ? PaymentType::Deposit : PaymentType::Deposit,
                        'payment_method' => $paymentMethod,
                        'amount_paid' => $depositAmount,
                        'note' => (string) ($data['contact_detail'] ?? ''),
                    ]);
                } else {
                    $receipt->update([
                        'payment_method' => $paymentMethod,
                        'amount_paid' => $depositAmount,
                        'note' => (string) ($data['contact_detail'] ?? ''),
                    ]);
                }

                $subtotal = 0.0;
                foreach ($order->items()->get() as $item) {
                    $subtotal += (float) $item->total_price;
                }

                $discountPercent = (float) ($data['discount_percent'] ?? $order->discount_percent ?? 0);
                $discountAmount = ($subtotal * $discountPercent) / 100;
                $netAmount = max(0.0, $subtotal - $discountAmount);

                $order->update([
                    'total_amount' => $subtotal,
                    'discount_amount' => $discountAmount,
                    'net_amount' => $netAmount,
                    'order_status' => $order->order_status ?? OrderStatus::Draft,
                ]);

                if (($data['design_artwork'] ?? null) instanceof \Illuminate\Http\UploadedFile) {
                    $order->clearMediaCollection('artwork');
                    $order->addMedia($data['design_artwork'])->toMediaCollection('artwork');
                }

                // Shirt/pants artwork now support multiple images per order.
                // Like reference_designs below, saving only ever appends newly
                // selected files here — it never removes previously saved ones.
                foreach (Arr::wrap($data['shirt_artwork'] ?? []) as $shirtArtworkFile) {
                    if ($shirtArtworkFile instanceof \Illuminate\Http\UploadedFile) {
                        $order->addMedia($shirtArtworkFile)->toMediaCollection('shirt_artwork');
                    }
                }

                foreach (Arr::wrap($data['pants_artwork'] ?? []) as $pantsArtworkFile) {
                    if ($pantsArtworkFile instanceof \Illuminate\Http\UploadedFile) {
                        $order->addMedia($pantsArtworkFile)->toMediaCollection('pants_artwork');
                    }
                }

                // Form 3 (กีฬาสี): files arrive keyed by colour house index. The
                // index is stored on the media itself so the artwork can be
                // handed back to the right house on the printed sheet.
                foreach (Arr::wrap($data['sports_day_artwork'] ?? []) as $groupIndex => $groupFiles) {
                    if (! is_numeric($groupIndex)) {
                        continue;
                    }

                    foreach (Arr::wrap($groupFiles) as $groupFile) {
                        if (! $groupFile instanceof \Illuminate\Http\UploadedFile) {
                            continue;
                        }

                        $order->addMedia($groupFile)
                            ->withCustomProperties(['sports_day_group' => (int) $groupIndex])
                            ->toMediaCollection('sports_day_artwork');
                    }
                }

                foreach (Arr::wrap($data['reference_designs'] ?? []) as $referenceDesign) {
                    if ($referenceDesign instanceof \Illuminate\Http\UploadedFile) {
                        $order->addMedia($referenceDesign)->toMediaCollection('reference_designs');
                    }
                }

                return $order->refresh()->load(['items', 'specification', 'routings', 'receipts']);
            });
        } catch (Throwable $exception) {
            throw new RuntimeException('Failed to update order.', previous: $exception);
        }
    }
}
