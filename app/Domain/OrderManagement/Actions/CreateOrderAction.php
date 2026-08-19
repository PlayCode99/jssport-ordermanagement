<?php
declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentType;
use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Receipt;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class CreateOrderAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data, int $creatorUserId): Order
    {
        try {
            return DB::transaction(function () use ($data, $creatorUserId): Order {
                $this->logCreateStage('start', $creatorUserId, $data, [
                    'has_specification' => is_array($data['specification'] ?? null),
                    'design_artwork' => ($data['design_artwork'] ?? null) instanceof UploadedFile,
                    'shirt_artwork' => ($data['shirt_artwork'] ?? null) instanceof UploadedFile,
                    'pants_artwork' => ($data['pants_artwork'] ?? null) instanceof UploadedFile,
                    'reference_designs_count' => count(Arr::wrap($data['reference_designs'] ?? [])),
                    'payment_method' => isset($data['payment_method']) ? (string) $data['payment_method'] : null,
                    'delivery_method' => isset($data['delivery_method']) ? (string) $data['delivery_method'] : null,
                ]);

                $orderCode = $this->generateOrderCode();

                $subTotalAmount = 0.0;
                $orderItemsPayload = [];

                foreach (($data['items'] ?? []) as $item) {
                    $quantity = (int) ($item['quantity'] ?? 0);
                    $unitPrice = (float) ($item['unit_price'] ?? 0);
                    $itemTotalPrice = $quantity * $unitPrice;
                    $subTotalAmount += $itemTotalPrice;

                    $orderItemsPayload[] = [
                        'item_type' => (string) $item['item_type'],
                        'size_group' => (string) $item['size_group'],
                        'size_label' => (string) $item['size_label'],
                        'quantity' => $quantity,
                        'unit_price' => $unitPrice,
                        'total_price' => $itemTotalPrice,
                    ];
                }

                $this->logCreateStage('before_order_create', $creatorUserId, $data, [
                    'items_count' => count($orderItemsPayload),
                    'item_size_groups' => array_values(array_unique(array_map(
                        static fn (array $item): string => (string) $item['size_group'],
                        $orderItemsPayload,
                    ))),
                    'item_size_labels' => array_values(array_unique(array_map(
                        static fn (array $item): string => (string) $item['size_label'],
                        $orderItemsPayload,
                    ))),
                ]);

                $discountPercent = (float) ($data['discount_percent'] ?? 0);
                $discountAmount = ($subTotalAmount * $discountPercent) / 100;
                $netAmount = max(0, $subTotalAmount - $discountAmount);

                $customerId = $this->resolveCustomerId($data);

                $order = Order::create([
                    'order_code' => $orderCode,
                    'customer_id' => $customerId,
                    'branch_id' => (int) $data['branch_id'],
                    'creator_user_id' => $creatorUserId,
                    'job_name' => (string) $data['job_name'],
                    'job_type' => (string) $data['job_type'],
                    'delivery_method' => isset($data['delivery_method']) ? (string) $data['delivery_method'] : null,
                    'shipping_address' => isset($data['shipping_address']) ? (string) $data['shipping_address'] : null,
                    'order_date' => (string) $data['order_date'],
                    'due_date' => (string) $data['due_date'],
                    'total_amount' => $subTotalAmount,
                    'discount_percent' => $discountPercent,
                    'discount_amount' => $discountAmount,
                    'net_amount' => $netAmount,
                    'order_status' => OrderStatus::Draft,
                ]);

                if (! empty($data['specification']) && is_array($data['specification'])) {
                    $this->logCreateStage('before_specification_create', $creatorUserId, $data, [
                        'specification_keys' => array_values(array_keys($data['specification'])),
                    ]);

                    $order->specification()->create(Arr::only($data['specification'], [
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

                $this->logCreateStage('before_items_create', $creatorUserId, $data, [
                    'items_count' => count($orderItemsPayload),
                ]);

                foreach ($orderItemsPayload as $itemPayload) {
                    $order->items()->create($itemPayload);
                }

                if (($data['design_artwork'] ?? null) instanceof UploadedFile) {
                    $order->addMedia($data['design_artwork'])->toMediaCollection('artwork');
                }

                $this->storeArtworkAsWebpIfPresent($order, $data['shirt_artwork'] ?? null, 'shirt_artwork');
                $this->storeArtworkAsWebpIfPresent($order, $data['pants_artwork'] ?? null, 'pants_artwork');

                foreach (Arr::wrap($data['reference_designs'] ?? []) as $referenceDesign) {
                    if ($referenceDesign instanceof UploadedFile) {
                        $order->addMedia($referenceDesign)->toMediaCollection('reference_designs');
                    }
                }

                $stationNames = $this->resolveRoutingStations($data);

                $this->logCreateStage('before_routings_create', $creatorUserId, $data, [
                    'routing_count' => count($stationNames),
                    'routing_stations' => $stationNames,
                ]);

                foreach ($stationNames as $stationName) {
                    $order->routings()->create([
                        'station_name' => $stationName,
                        'is_required' => true,
                        'status' => RoutingStatus::Pending,
                    ]);
                }

                $depositAmount = max(0.0, (float) ($data['deposit_amount'] ?? 0));
                $receiptCode = $this->generateReceiptCode();
                $paymentMethod = ((string) ($data['payment_method'] ?? 'cash')) === 'transfer'
                    ? PaymentMethod::BankTransfer
                    : PaymentMethod::Cash;

                $paymentType = $depositAmount >= $netAmount
                    ? PaymentType::FullPayment
                    : ($depositAmount > 0 ? PaymentType::Deposit : PaymentType::Deposit);

                $this->logCreateStage('before_receipt_create', $creatorUserId, $data, [
                    'deposit_amount' => $depositAmount,
                    'payment_type' => $paymentType->value,
                ]);

                Receipt::create([
                    'receipt_code' => $receiptCode,
                    'order_id' => $order->id,
                    'cashier_user_id' => $creatorUserId,
                    'payment_date' => now(),
                    'payment_type' => $paymentType,
                    'payment_method' => $paymentMethod,
                    'amount_paid' => $depositAmount,
                    'note' => (string) ($data['contact_detail'] ?? ''),
                ]);

                $order->statusHistories()->create([
                    'user_id' => $creatorUserId,
                    'from_status' => OrderStatus::Draft,
                    'to_status' => OrderStatus::Draft,
                    'remark' => 'Initial status set to draft on order creation (from none).',
                ]);

                return $order->load(['items', 'specification', 'routings', 'receipts']);
            });
        } catch (Throwable $exception) {
            Log::error('Failed to create order.', [
                'creator_user_id' => $creatorUserId,
                'branch_id' => isset($data['branch_id']) ? (int) $data['branch_id'] : null,
                'job_type' => isset($data['job_type']) ? (string) $data['job_type'] : null,
                'items_count' => is_array($data['items'] ?? null) ? count($data['items']) : 0,
                'has_specification' => is_array($data['specification'] ?? null),
                'previous_exception_class' => $exception::class,
                'previous_exception_message' => $exception->getMessage(),
            ]);

            throw new RuntimeException('Failed to create order.', previous: $exception);
        }
    }

    private function storeArtworkAsWebpIfPresent(Order $order, mixed $file, string $collection): void
    {
        if (! $file instanceof UploadedFile) {
            return;
        }

        $webpBinary = $this->convertUploadedImageToWebpBinary($file);

        if ($webpBinary === null) {
            if (strtolower((string) $file->getClientOriginalExtension()) === 'webp') {
                $order->addMedia($file)->toMediaCollection($collection);

                return;
            }

            throw new RuntimeException(sprintf('Unable to convert %s to webp before persistence.', $collection));
        }

        $baseName = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $safeBaseName = trim((string) $baseName) !== '' ? (string) $baseName : 'artwork';

        $order->addMediaFromString($webpBinary)
            ->usingFileName($safeBaseName.'.webp')
            ->usingName($safeBaseName)
            ->toMediaCollection($collection);
    }

    private function convertUploadedImageToWebpBinary(UploadedFile $file): ?string
    {
        $mimeType = strtolower((string) $file->getMimeType());

        if (! str_starts_with($mimeType, 'image/')) {
            return null;
        }

        if (! function_exists('imagecreatefromstring') || ! function_exists('imagewebp')) {
            return null;
        }

        $contents = @file_get_contents($file->getRealPath());

        if ($contents === false) {
            return null;
        }

        $image = @imagecreatefromstring($contents);

        if ($image === false) {
            return null;
        }

        ob_start();
        $written = @imagewebp($image, null, 82);
        $binary = ob_get_clean();
        imagedestroy($image);

        if ($written !== true || ! is_string($binary) || $binary === '') {
            return null;
        }

        return $binary;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $context
     */
    private function logCreateStage(string $stage, int $creatorUserId, array $data, array $context = []): void
    {
        Log::debug('order.create.stage', array_merge([
            'stage' => $stage,
            'creator_user_id' => $creatorUserId,
            'branch_id' => isset($data['branch_id']) ? (int) $data['branch_id'] : null,
            'job_type' => isset($data['job_type']) ? (string) $data['job_type'] : null,
            'items_count' => is_array($data['items'] ?? null) ? count($data['items']) : 0,
        ], $context));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function resolveCustomerId(array $data): int
    {
        $inputName = trim((string) ($data['customer_name'] ?? ''));

        if (isset($data['customer_id']) && $data['customer_id'] !== null) {
            $existingCustomer = Customer::find((int) $data['customer_id']);

            if ($existingCustomer !== null) {
                $existingName = trim((string) $existingCustomer->customer_name);

                if ($inputName !== '' && $existingName !== $inputName) {
                    return $this->createCustomerFromOrderData($data);
                }

                return (int) $existingCustomer->id;
            }
        }

        return $this->createCustomerFromOrderData($data);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function createCustomerFromOrderData(array $data): int
    {
        $customer = Customer::create([
            'customer_code' => $this->generateCustomerCode(),
            'customer_name' => (string) ($data['customer_name'] ?? '-'),
            'phone' => isset($data['customer_phone']) ? (string) $data['customer_phone'] : null,
            'line_fb' => isset($data['contact_detail']) ? (string) $data['contact_detail'] : null,
        ]);

        return (int) $customer->id;
    }

    private function generateOrderCode(): string
    {
        $year = now()->format('Y');
        $sequence = Order::withTrashed()->count() + 1;

        do {
            $orderCode = 'ORD-'.$year.'-'.str_pad((string) $sequence, 5, '0', STR_PAD_LEFT);
            $sequence++;
        } while (Order::withTrashed()->where('order_code', $orderCode)->exists());

        return $orderCode;
    }

    private function generateCustomerCode(): string
    {
        $year = now()->format('Y');
        $sequence = Customer::withTrashed()->count() + 1;

        do {
            $customerCode = 'CUS-'.$year.'-'.str_pad((string) $sequence, 5, '0', STR_PAD_LEFT);
            $sequence++;
        } while (Customer::withTrashed()->where('customer_code', $customerCode)->exists());

        return $customerCode;
    }

    private function generateReceiptCode(): string
    {
        $year = now()->format('Y');
        $sequence = Receipt::withTrashed()->count() + 1;

        do {
            $receiptCode = 'RCP-'.$year.'-'.str_pad((string) $sequence, 5, '0', STR_PAD_LEFT);
            $sequence++;
        } while (Receipt::withTrashed()->where('receipt_code', $receiptCode)->exists());

        return $receiptCode;
    }

    /**
     * @return array<int, string>
     */
    /**
     * @param  array<string, mixed>  $data
     * @return array<int, string>
     */
    private function resolveRoutingStations(array $data): array
    {
        return $this->resolveRoutingStationsByJobType((string) ($data['job_type'] ?? ''));
    }

    /**
     * @return array<int, string>
     */
    private function resolveRoutingStationsByJobType(string $jobType): array
    {
        $normalizedJobType = mb_strtolower(trim($jobType));

        $hasEmbroidery = str_contains($normalizedJobType, 'ปัก') || str_contains($normalizedJobType, 'embroider');
        $hasSublimation = str_contains($normalizedJobType, 'ซับ') || str_contains($normalizedJobType, 'sublimation');
        $hasScreen = str_contains($normalizedJobType, 'สกรีน') || str_contains($normalizedJobType, 'screen');
        $hasFlex = str_contains($normalizedJobType, 'เฟล็ก') || str_contains($normalizedJobType, 'flex');
        $hasScreenFlex = $hasScreen || $hasFlex;

        if (! $hasEmbroidery && ! $hasSublimation && ! $hasScreenFlex) {
            return [RoutingStationName::Design->value];
        }

        $stations = [RoutingStationName::Cutting->value];

        if ($hasSublimation) {
            // For sublimation jobs, include the print station right after cutting.
            $stations[] = RoutingStationName::Print->value;
            $stations[] = RoutingStationName::Screen->value;
        }

        if ($hasScreen || $hasFlex) {
            $stations[] = RoutingStationName::Flex->value;
        }

        if ($hasEmbroidery) {
            $stations[] = RoutingStationName::Embroidery->value;
        }

        $stations[] = RoutingStationName::Sewing->value;
        $stations[] = RoutingStationName::Qc->value;
        $stations[] = RoutingStationName::Shipping->value;

        return $this->normalizeRoutingStations($stations);
    }

    /**
     * @param  array<int, string>  $stations
     * @return array<int, string>
     */
    private function normalizeRoutingStations(array $stations): array
    {
        $allowedStations = array_column(RoutingStationName::cases(), 'value');
        return array_values(array_filter(
            array_values(array_unique($stations)),
            static fn (string $station): bool => in_array($station, $allowedStations, true),
        ));
    }
}
