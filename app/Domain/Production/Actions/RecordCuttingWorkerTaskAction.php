<?php

declare(strict_types=1);

namespace App\Domain\Production\Actions;

use App\Models\CuttingWorkerTask;
use App\Models\PieceworkPrice;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class RecordCuttingWorkerTaskAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data): CuttingWorkerTask
    {
        try {
            return DB::transaction(function () use ($data): CuttingWorkerTask {
                $priceMaster = PieceworkPrice::findOrFail((int) $data['price_master_id']);
                $quantityDone = (int) $data['quantity_done'];
                $totalWage = $quantityDone * (float) $priceMaster->price_per_unit;

                return CuttingWorkerTask::create([
                    'cutting_order_id' => (int) $data['cutting_order_id'],
                    'price_master_id' => (int) $priceMaster->id,
                    'worker_user_id' => (int) $data['worker_user_id'],
                    'quantity_done' => $quantityDone,
                    'total_wage' => $totalWage,
                ]);
            });
        } catch (Throwable $exception) {
            throw new RuntimeException('Failed to record cutting worker task.', previous: $exception);
        }
    }
}
