<?php

namespace App\Models;

use App\Enums\GarmentCategory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Cast attributes, spelled out because static analysis reads the database
 * schema and would otherwise see the raw column types rather than what the
 * casts hand back at runtime.
 *
 * @property int $id
 * @property GarmentCategory|null $category
 * @property bool $is_active
 * @property int $display_order
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property string|null $code
 * @property string|null $name
 */
class GarmentType extends Model
{
    use HasFactory;

    /**
     * @var list<string>
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

    /**
     * @return HasMany<GarmentOperation, $this>
     */
    public function operations(): HasMany
    {
        return $this->hasMany(GarmentOperation::class);
    }
}
