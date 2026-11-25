<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\GarmentCategory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One length a garment can be cut to — แขนสั้น, แขนยาว, แขนกุด, and whatever
 * else the shop starts selling.
 *
 * The length is what decides the work and what splits a bill into production
 * sheets, so `code` is load-bearing: it is stored on every order line and
 * built into every sheet key. A name may be corrected freely; a code may not
 * be changed once bills carry it.
 *
 * @property int $id
 * @property GarmentCategory $category
 * @property string $code
 * @property string $name
 * @property int $display_order
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class GarmentStyle extends Model
{
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'category',
        'code',
        'name',
        'display_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'category' => GarmentCategory::class,
            'display_order' => 'integer',
            'is_active' => 'boolean',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }
}
