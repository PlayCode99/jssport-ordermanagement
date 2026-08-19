<?php

declare(strict_types=1);

namespace App\Domain\OrderManagement\Actions;

use App\Models\Order;

class CreateAddonOrderAction
{
    public function execute(int $parentOrderId, int $creatorUserId): Order
    {
        $parent = Order::with(['items', 'specification'])->findOrFail($parentOrderId);

        $createOrder = new CreateOrderAction;

        /** @var array<string, mixed> $data */
        $data = $parent->toArray();

        return $createOrder->execute($data, $creatorUserId);
    }
}
