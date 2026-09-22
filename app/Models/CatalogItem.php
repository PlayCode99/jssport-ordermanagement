<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CatalogItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'storage_key',
        'item_id',
        'name',
        'sort_order',
        'created_by',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'item_id' => 'integer',
            'sort_order' => 'integer',
            'active' => 'boolean',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }
}
