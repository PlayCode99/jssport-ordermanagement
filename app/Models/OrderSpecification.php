<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

/**
 * Cast attributes, spelled out because static analysis reads the database
 * schema and would otherwise see the raw column types rather than what the
 * casts hand back at runtime.
 *
 * @property int $id
 * @property int $pattern_id
 * @property int $fabric_id
 * @property int $neck_style_id
 * @property int $order_id
 * @property string|null $screen_print_detail
 * @property string|null $collar_color
 * @property string|null $leg_style
 * @property string|null $leg_hem
 * @property string|null $placket_style
 * @property string|null $placket_color
 * @property string|null $sleeve_style
 * @property string|null $sleeve_hem
 * @property string|null $sublimation_detail
 * @property string|null $embroidery_code
 * @property-read Order|null $order
 */
class OrderSpecification extends Model implements HasMedia
{
    use HasFactory, InteractsWithMedia;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'pattern_id' => 'integer',
            'fabric_id' => 'integer',
            'neck_style_id' => 'integer',
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
