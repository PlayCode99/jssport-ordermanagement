<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions;

use App\Models\Order;
use RuntimeException;

class CreateAddonOrderAction
{
    public function __construct(private CreateOrderAction $createOrderAction)
    {
        //
    }

    public function execute(int $parentOrderId, int $creatorUserId): Order
    {
        throw new RuntimeException('CreateAddonOrderAction is not yet implemented.');
    }
}
