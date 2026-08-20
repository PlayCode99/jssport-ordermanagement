<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PieceworkPrice extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'price_per_unit' => 'float',
        ];
    }

    public function cuttingWorkerTasks(): HasMany
    {
        return $this->hasMany(CuttingWorkerTask::class, 'price_master_id');
    }
}
