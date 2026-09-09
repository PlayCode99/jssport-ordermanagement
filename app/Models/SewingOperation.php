<?php

namespace App\Models;

use App\Enums\SewingTargetGroup;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property-read ShirtType|null $shirtType
 */
class SewingOperation extends Model
{
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'shirt_type_id',
        'target_group',
        'name',
        'price',
        'is_active',
        'display_order',
    ];

    protected function casts(): array
    {
        return [
            'shirt_type_id' => 'integer',
            'target_group' => SewingTargetGroup::class,
            'price' => 'decimal:2',
            'is_active' => 'boolean',
            'display_order' => 'integer',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<ShirtType, $this>
     */
    public function shirtType(): BelongsTo
    {
        return $this->belongsTo(ShirtType::class);
    }
}
