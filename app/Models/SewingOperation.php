<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\SewingTargetGroup;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SewingOperation extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
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

    public function shirtType(): BelongsTo
    {
        return $this->belongsTo(ShirtType::class);
    }
}
