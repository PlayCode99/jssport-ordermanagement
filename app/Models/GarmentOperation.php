<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $garment_type_id
 * @property string $name
 * @property string $child_price
 * @property string $adult_price
 * @property bool $is_active
 * @property int $display_order
 * @property-read GarmentType|null $garmentType
 */
class GarmentOperation extends Model
{
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'garment_type_id',
        'name',
        'child_price',
        'adult_price',
        'is_active',
        'display_order',
    ];

    protected function casts(): array
    {
        return [
            'garment_type_id' => 'integer',
            'child_price' => 'decimal:2',
            'adult_price' => 'decimal:2',
            'is_active' => 'boolean',
            'display_order' => 'integer',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<GarmentType, $this>
     */
    public function garmentType(): BelongsTo
    {
        return $this->belongsTo(GarmentType::class);
    }
}
