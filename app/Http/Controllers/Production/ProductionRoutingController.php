<?php

declare(strict_types=1);

namespace App\Http\Controllers\Production;

use App\Domain\Production\Actions\AdvanceRoutingStationAction;
use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Production\AdvanceRoutingStationRequest;
use App\Http\Requests\Production\StoreShippingDeliveryInfoRequest;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;

class ProductionRoutingController extends Controller
{
    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, string>
     */
    private function normalizeShippingDeliveryInfo(array $payload): array
    {
        return [
            'carrier_name' => trim((string) ($payload['carrier_name'] ?? '')),
            'tracking_no' => trim((string) ($payload['tracking_no'] ?? '')),
            'parcel_weight_kg' => trim((string) ($payload['parcel_weight_kg'] ?? '')),
            'parcel_shipping_cost' => trim((string) ($payload['parcel_shipping_cost'] ?? '')),
            'onsite_sender_name' => trim((string) ($payload['onsite_sender_name'] ?? '')),
            'onsite_vehicle_plate' => trim((string) ($payload['onsite_vehicle_plate'] ?? '')),
            'sender_signature' => trim((string) ($payload['sender_signature'] ?? '')),
        ];
    }

    public function advance(AdvanceRoutingStationRequest $request, Order $order, AdvanceRoutingStationAction $action): JsonResponse|RedirectResponse
    {
        $routing = $action->execute(
            $order,
            RoutingStationName::from((string) $request->validated('station_name')),
            RoutingStatus::from((string) $request->validated('new_status')),
            (int) $request->user()->id,
            $request->validated('print_machine') !== null ? (string) $request->validated('print_machine') : null,
            $request->validated('cutting_team_id') !== null ? (int) $request->validated('cutting_team_id') : null,
            $request->validated('sewing_team_id') !== null ? (int) $request->validated('sewing_team_id') : null,
            $request->validated('embroidery_team_id') !== null ? (int) $request->validated('embroidery_team_id') : null,
            $request->validated('screen_team_id') !== null ? (int) $request->validated('screen_team_id') : null,
            $request->validated('heat_press_machine_id') !== null ? (int) $request->validated('heat_press_machine_id') : null,
            $request->validated('rework_note') !== null ? (string) $request->validated('rework_note') : null,
            $request->boolean('direct_complete'),
        );

        $shippingDeliveryInfo = $request->validated('shipping_delivery_info');

        if (is_array($shippingDeliveryInfo)) {
            $order->update([
                'shipping_delivery_info' => $this->normalizeShippingDeliveryInfo($shippingDeliveryInfo),
            ]);
        }

        if ((string) $request->header('X-Inertia') !== '') {
            return back(status: 303);
        }

        return response()->json(['data' => $routing]);
    }

    public function storeShippingDeliveryInfo(StoreShippingDeliveryInfoRequest $request, Order $order): JsonResponse|RedirectResponse
    {
        $order->update([
            'shipping_delivery_info' => $this->normalizeShippingDeliveryInfo($request->validated()),
        ]);

        if ((string) $request->header('X-Inertia') !== '') {
            return back(status: 303);
        }

        return response()->json([
            'data' => [
                'order_id' => $order->id,
                'shipping_delivery_info' => $order->fresh()->shipping_delivery_info,
            ],
        ]);
    }
}
