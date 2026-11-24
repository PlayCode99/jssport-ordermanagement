<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of "คิดเงินเพิ่มเติม" on a bill: something charged for that is
 * not a garment — delivery, a rush fee, a courier.
 *
 * It is money on the bill, not work for the floor: nothing here reaches a
 * production sheet, and the label is whatever the counter typed.
 *
 * @property int $id
 * @property int $order_id
 * @property string $label
 * @property float $amount
 * @property int $position
 */
class OrderCharge extends Model
{
    use HasFactory;

    protected $fillable = ['order_id', 'label', 'amount', 'position'];

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'position' => 'integer',
        ];
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
