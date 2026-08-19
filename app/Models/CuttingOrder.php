<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\CuttingOrderStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CuttingOrder extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'start_date' => 'datetime',
            'completed_date' => 'datetime',
            'status' => CuttingOrderStatus::class,
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function cutterUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cutter_user_id');
    }

    public function inspectorUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inspector_user_id');
    }

    public function workerTasks(): HasMany
    {
        return $this->hasMany(CuttingWorkerTask::class);
    }
}
