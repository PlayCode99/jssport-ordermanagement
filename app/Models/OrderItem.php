<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Cast attributes, spelled out because static analysis reads the database
 * schema and would otherwise see the raw column types rather than what the
 * casts hand back at runtime.
 *
 * @property int $id
 * @property int $quantity
 * @property float $unit_price
 * @property float $total_price
 * @property int $order_id
 * @property string|null $item_type
 * @property string|null $size_group
 * @property string|null $size_label
 * @property string|null $shirt_style
 * @property string|null $pants_style
 * @property-read Order|null $order
 */
class OrderItem extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price' => 'float',
            'total_price' => 'float',
        ];
    }

    /**
     * @return BelongsTo<Order, $this>
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
