<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\OrderManagement\Actions\SyncOrderArtworkAction;
use App\Http\Requests\UpdateOrderArtworkRequest;
use App\Models\Order;
use App\Support\Orders\ArtworkNotConvertibleException;
use App\Support\Orders\OrderArtworkPlaces;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * "อัปเดตรูป": the pictures on a bill, on their own.
 *
 * The counter form stops accepting edits the moment the floor starts cutting,
 * which is right for sizes and prices and wrong for pictures. A corrected logo
 * arrives mid-run; a finished job gets a photograph of what actually shipped,
 * so the bill shows the real thing when the customer re-orders from it. Both
 * happen long after the bill is locked.
 *
 * This is the narrow way in. It can only reach artwork: the request names no
 * other field, so nothing it carries can move a size, a price, a delivery date
 * or a routing, and the bill the floor is working from stays exactly as
 * written. That is also why it does not reuse the order form — reopening an
 * eleven-thousand-line form on a bill in production to change one picture
 * would put every other field back in play.
 */
class OrderArtworkController extends Controller
{
    /**
     * What the dialog needs to draw the bill's pictures: every saved image
     * with its media id and the sheet it is pinned to, plus the bill's items
     * and spec so the dialog can work out which sheets this bill has.
     *
     * Deliberately fetched when the dialog opens rather than carried in the
     * counter's row payload: the counter lists hundreds of bills a page and
     * almost none of them will have their pictures touched.
     */
    public function show(Request $request, Order $order): JsonResponse
    {
        $this->authorize('updateArtwork', $order);

        $order->loadMissing(['items', 'specification', 'media']);

        // The place keys are the bill's own — the same ones the production
        // sheet reads — so the dialog labels them with artworkPlaceLabel(),
        // the function the receipt gallery already uses, rather than carrying
        // a second set of names that could drift from it.
        return response()->json([
            'data' => [
                'id' => $order->id,
                'order_code' => $order->order_code,
                'job_name' => $order->job_name,
            ] + OrderArtworkPlaces::for($order),
        ]);
    }

    public function update(
        UpdateOrderArtworkRequest $request,
        Order $order,
        SyncOrderArtworkAction $artwork,
    ): JsonResponse|RedirectResponse {
        $this->authorize('updateArtwork', $order);

        try {
            DB::transaction(static function () use ($order, $request, $artwork): void {
                $artwork->execute($order, $request->validated(), $request->user());
            });
        } catch (ArtworkNotConvertibleException) {
            // A file that passed the image rules and still will not decode.
            // The transaction has rolled back, so the bill's pictures are as
            // they were; the user is told which step failed rather than being
            // shown a server error with nothing to act on.
            throw ValidationException::withMessages([
                'shirt_artwork' => 'มีรูปที่ระบบเปิดไม่ได้ อาจเป็นไฟล์เสียหรือเป็นชนิดที่ไม่รองรับ '
                    .'กรุณาบันทึกรูปใหม่เป็น PNG, JPG หรือ WEBP แล้วลองอีกครั้ง (ยังไม่มีการเปลี่ยนแปลงรูปของบิลนี้)',
            ]);
        }

        if (! $request->header('X-Inertia')) {
            return response()->json(['data' => ['order_code' => $order->order_code]], 200);
        }

        return back()->with('success', 'อัปเดตรูป '.$order->order_code.' เรียบร้อยแล้ว');
    }
}
