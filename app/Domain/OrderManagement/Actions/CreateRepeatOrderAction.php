<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions;

use App\Models\Order;

class CreateRepeatOrderAction
{
    public function execute(int $sourceOrderId, int $creatorUserId): Order
    {
        $source = Order::with(['items', 'specification'])->findOrFail($sourceOrderId);

        $createOrder = new CreateOrderAction;

        /** @var array<string, mixed> $data */
        $data = $source->toArray();

        return $createOrder->execute($data, $creatorUserId);
    }
}
