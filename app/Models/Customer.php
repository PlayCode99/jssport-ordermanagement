<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * Cast attributes, spelled out because static analysis reads the database
 * schema and would otherwise see the raw column types rather than what the
 * casts hand back at runtime.
 *
 * @property int $id
 * @property Carbon|null $deleted_at
 * @property string|null $customer_code
 * @property string|null $customer_name
 * @property string|null $phone
 * @property string|null $line_fb
 */
class Customer extends Model
{
    use HasFactory, SoftDeletes;

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
