<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\RoutingStatus;
use App\Enums\UserRole;
use App\Models\Order;
use App\Models\User;

class OrderPolicy
{
    public function create(User $user): bool
    {
        return in_array($user->role, [UserRole::Admin, UserRole::Sales], true);
    }

    public function viewAny(User $user): bool
    {
        return $user->exists;
    }

    public function edit(User $user, Order $order): bool
    {
        return $this->update($user, $order);
    }

    public function update(User $user, Order $order): bool
    {
        if (! in_array($user->role, [UserRole::Admin, UserRole::Sales], true)) {
            return false;
        }

        if (! $order->order_status->canBeEdited()) {
            return false;
        }

        return ! $this->hasProductionProgress($order);
    }

    /**
     * Deleting is deliberately stricter than editing: only an admin may do it,
     * and only while the order has not entered the production line. Once any
     * required routing is in progress or completed, the shop floor has already
     * acted on the order and removing it would orphan that work.
     */
    public function delete(User $user, Order $order): bool
    {
        if ($user->role !== UserRole::Admin) {
            return false;
        }

        return ! $this->hasProductionProgress($order);
    }

    private function hasProductionProgress(Order $order): bool
    {
        return $order->routings()
            ->where('is_required', true)
            ->whereIn('status', [
                RoutingStatus::InProgress->value,
                RoutingStatus::Completed->value,
            ])
            ->exists();
    }

    public function confirmDesign(User $user, Order $order): bool
    {
        return in_array($user->role, [UserRole::Admin, UserRole::Sales, UserRole::Designer], true);
    }

    public function approveReceipt(User $user, Order $order): bool
    {
        return in_array($user->role, [UserRole::Admin, UserRole::Finance], true);
    }
}
