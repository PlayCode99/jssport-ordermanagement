<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions;

use App\Models\Order;
use RuntimeException;

class CreateRepeatOrderAction
{
    public function __construct(private CreateOrderAction $createOrderAction)
    {
        //
    }

    public function execute(int $sourceOrderId, int $creatorUserId): Order
    {
        throw new RuntimeException('CreateRepeatOrderAction is not yet implemented.');
    }
}
