<?php

namespace App\Models;

use App\Enums\PaymentMethod;
use App\Enums\PaymentType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

/**
 * Cast attributes, spelled out because static analysis reads the database
 * schema and would otherwise see the raw column types rather than what the
 * casts hand back at runtime.
 *
 * @property int $id
 * @property Carbon|null $deleted_at
 * @property Carbon|null $payment_date
 * @property PaymentType|null $payment_type
 * @property PaymentMethod|null $payment_method
 * @property float $amount_paid
 * @property int $order_id
 * @property string|null $receipt_code
 * @property string|null $note
 * @property-read Order|null $order
 * @property-read User|null $cashierUser
 */
class Receipt extends Model implements HasMedia
{
    use HasFactory, InteractsWithMedia, SoftDeletes;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'payment_date' => 'datetime',
            'payment_type' => PaymentType::class,
            'payment_method' => PaymentMethod::class,
            'amount_paid' => 'float',
        ];
    }

    /**
     * @return BelongsTo<Order, $this>
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function cashierUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cashier_user_id');
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('payment_slips');
    }
}
