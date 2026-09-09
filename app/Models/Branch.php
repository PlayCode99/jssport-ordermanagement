<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Cast attributes, spelled out because static analysis reads the database
 * schema and would otherwise see the raw column types rather than what the
 * casts hand back at runtime.
 *
 * @property int $id
 * @property string|null $branch_code
 * @property string|null $branch_name
 */
class Branch extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    /**
     * @return HasMany<Order, $this>
     */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
