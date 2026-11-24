<?php

declare(strict_types=1);

namespace App\Support\Orders;

use App\Models\Order;
use Illuminate\Support\Arr;

/**
 * "คิดเงินเพิ่มเติม": the lines a bill charges for something that is not a
 * garment — delivery, a rush fee, a courier.
 *
 * One place reads them off a request and one place writes them, so the bill
 * being opened and the bill being edited cannot come out with different
 * money. The rules are deliberately strict, because every one of these ends
 * up on a customer's receipt:
 *
 *  - a line needs a name AND an amount; a half-typed row is dropped rather
 *    than printed as "฿ 500" with nothing beside it;
 *  - nothing may be negative. The counter asked for a way to charge more,
 *    not a second discount that would slip past the discount field and the
 *    limit on it;
 *  - the order typed is the order kept, which is the order printed.
 */
final class OrderCharges
{
    /** More lines than this on one bill is a mis-paste, not a bill. */
    public const MAX_LINES = 20;

    public const MAX_LABEL_LENGTH = 255;

    /**
     * @return list<array{label: string, amount: float, position: int}>
     */
    public static function normalize(mixed $charges): array
    {
        $normalized = [];

        foreach (Arr::wrap($charges) as $charge) {
            if (! is_array($charge)) {
                continue;
            }

            $label = trim((string) ($charge['label'] ?? ''));
            $amount = round(max(0.0, (float) ($charge['amount'] ?? 0)), 2);

            // A row with only a name is someone still typing, and a row with
            // only money is a charge nobody can explain to the customer.
            if ($label === '' || $amount <= 0.0) {
                continue;
            }

            $normalized[] = [
                'label' => mb_substr($label, 0, self::MAX_LABEL_LENGTH),
                'amount' => $amount,
                'position' => count($normalized),
            ];

            if (count($normalized) >= self::MAX_LINES) {
                break;
            }
        }

        return $normalized;
    }

    /**
     * @param  list<array{label: string, amount: float, position: int}>  $normalized
     */
    public static function total(array $normalized): float
    {
        return round(array_sum(array_column($normalized, 'amount')), 2);
    }

    /**
     * Replaces a bill's charges with the ones given. Rewritten whole rather
     * than matched row by row: the counter edits these as a short list, and
     * an id handed back by the browser is one more thing that can point at
     * another bill.
     *
     * @param  list<array{label: string, amount: float, position: int}>  $normalized
     */
    public static function replace(Order $order, array $normalized): void
    {
        $order->charges()->delete();

        foreach ($normalized as $charge) {
            $order->charges()->create($charge);
        }

        $order->unsetRelation('charges');
    }
}
