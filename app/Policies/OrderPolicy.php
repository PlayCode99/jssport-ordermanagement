<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\OrderStatus;
use App\Enums\RoutingStatus;
use App\Enums\UserRole;
use App\Models\Order;
use App\Models\User;
use App\Support\Orders\OrderCompletion;
use App\Support\UserAccessControl;

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
     * Moving the delivery date is for the people who edit bills, but unlike
     * editing it stays open while the bill is in production — that is when a
     * date usually has to move. A bill that is finished or cancelled keeps
     * the date it went out on.
     */
    public function reschedule(User $user, Order $order): bool
    {
        if (! in_array($user->role, [UserRole::Admin, UserRole::Sales], true)) {
            return false;
        }

        if (! UserAccessControl::canAccessBranch($user, (int) $order->branch_id)) {
            return false;
        }

        if ($order->order_status === OrderStatus::Cancelled) {
            return false;
        }

        return ! OrderCompletion::isClosed($order);
    }

    /**
     * The delivery note's own discount.
     *
     * Open while the bill is in production and after it closes, because that
     * is when goods are handed over and when a reprint is asked for — but
     * only to the people who write bills, since it is money coming off what
     * the customer is asked to sign for. A cancelled bill hands over nothing.
     */
    public function discountDeliveryNote(User $user, Order $order): bool
    {
        if (! in_array($user->role, [UserRole::Admin, UserRole::Sales], true)) {
            return false;
        }

        if (! UserAccessControl::canAccessBranch($user, (int) $order->branch_id)) {
            return false;
        }

        return $order->order_status !== OrderStatus::Cancelled;
    }

    /**
     * Updating a bill's pictures is deliberately wider than editing it.
     *
     * Editing closes as soon as the floor starts cutting, because the sizes
     * and prices under the work must stop moving. The pictures are the one
     * part that legitimately keeps changing after that: a customer sends a
     * corrected logo mid-run, and once the job is finished the counter
     * replaces the mock-up with a photograph of what actually shipped, so the
     * bill shows the real thing when it is re-ordered.
     *
     * So this stays open at every status, and the designer — who holds the
     * artwork files — is allowed in alongside the people who write bills. A
     * cancelled bill is the exception: nothing about it should move again.
     */
    public function updateArtwork(User $user, Order $order): bool
    {
        if (! in_array($user->role, [UserRole::Admin, UserRole::Sales, UserRole::Designer], true)) {
            return false;
        }

        if (! UserAccessControl::canAccessBranch($user, (int) $order->branch_id)) {
            return false;
        }

        return $order->order_status !== OrderStatus::Cancelled;
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
