<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property-read CuttingOrder|null $cuttingOrder
 * @property-read PieceworkPrice|null $priceMaster
 * @property-read User|null $workerUser
 */
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

    /**
     * @return BelongsTo<CuttingOrder, $this>
     */
    public function cuttingOrder(): BelongsTo
    {
        return $this->belongsTo(CuttingOrder::class);
    }

    /**
     * @return BelongsTo<PieceworkPrice, $this>
     */
    public function priceMaster(): BelongsTo
    {
        return $this->belongsTo(PieceworkPrice::class, 'price_master_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function workerUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'worker_user_id');
    }
}
