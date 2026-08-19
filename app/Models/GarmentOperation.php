<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GarmentOperation extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
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

    public function garmentType(): BelongsTo
    {
        return $this->belongsTo(GarmentType::class);
    }
}
