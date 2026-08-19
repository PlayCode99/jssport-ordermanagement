<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\GarmentCategory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GarmentType extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $fillable = [
        'category',
        'code',
        'name',
        'is_active',
        'display_order',
    ];

    protected function casts(): array
    {
        return [
            'category' => GarmentCategory::class,
            'is_active' => 'boolean',
            'display_order' => 'integer',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function operations(): HasMany
    {
        return $this->hasMany(GarmentOperation::class);
    }
}
