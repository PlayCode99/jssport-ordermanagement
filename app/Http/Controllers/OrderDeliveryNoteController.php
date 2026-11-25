<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Order;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * The discount that belongs to the delivery note alone.
 *
 * It comes off what the bill already came to, and it stops there: the bill's
 * own total, its discount, what has been paid and what is still owed are all
 * left exactly as the work receipt wrote them. That is the point of it —
 * the counter can hand the goods over at a lower figure without rewriting
 * the bill the floor and the books have been working from.
 */
class OrderDeliveryNoteController extends Controller
{
    public function updateDiscount(Request $request, Order $order): RedirectResponse
    {
        $this->authorize('discountDeliveryNote', $order);

        $validated = $request->validate([
            // Same ceiling the bill's own discount keeps, so the delivery
            // note cannot quietly give away more than the counter may.
            'delivery_discount_percent' => ['required', 'numeric', 'min:0', 'max:50'],
        ], [
            'delivery_discount_percent.required' => 'กรุณากรอกส่วนลดใบส่งของ',
            'delivery_discount_percent.max' => 'ส่วนลดใบส่งของเกิน 50% ไม่ได้',
            'delivery_discount_percent.min' => 'ส่วนลดใบส่งของติดลบไม่ได้',
        ]);

        // forceFill rather than an update of the money columns: nothing about
        // what the bill is worth changes here.
        $order->forceFill([
            'delivery_discount_percent' => round((float) $validated['delivery_discount_percent'], 2),
        ])->save();

        return back()->with('success', 'บันทึกส่วนลดใบส่งของ '.$order->order_code.' แล้ว');
    }
}
