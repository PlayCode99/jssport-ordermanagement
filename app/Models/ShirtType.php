<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShirtType extends Model
{
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'code',
        'name',
        'is_active',
        'display_order',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'display_order' => 'integer',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return HasMany<SewingOperation, $this>
     */
    public function sewingOperations(): HasMany
    {
        return $this->hasMany(SewingOperation::class);
    }
}
