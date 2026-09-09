<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmbroideryTeam extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    /**
     * @return HasMany<OrderRouting, $this>
     */
    public function orderRoutings(): HasMany
    {
        return $this->hasMany(OrderRouting::class, 'embroidery_team_id');
    }
}
