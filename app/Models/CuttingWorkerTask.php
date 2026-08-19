<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CuttingWorkerTask extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'quantity_done' => 'integer',
            'total_wage' => 'float',
        ];
    }

    public function cuttingOrder(): BelongsTo
    {
        return $this->belongsTo(CuttingOrder::class);
    }

    public function priceMaster(): BelongsTo
    {
        return $this->belongsTo(PieceworkPrice::class, 'price_master_id');
    }

    public function workerUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'worker_user_id');
    }
}
