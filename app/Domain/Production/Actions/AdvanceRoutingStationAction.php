<?php

declare(strict_types=1);

namespace App\Domain\Production\Actions;

use App\Enums\OrderStatus;
use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use App\Models\Order;
use App\Models\OrderRouting;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdvanceRoutingStationAction
{
    public function execute(
        Order $order,
        RoutingStationName $stationName,
        RoutingStatus $newStatus,
        int $workerUserId,
        ?string $printMachine = null,
        ?int $cuttingTeamId = null,
        ?int $sewingTeamId = null,
        ?int $embroideryTeamId = null,
        ?int $screenTeamId = null,
        ?int $heatPressMachineId = null,
        ?string $reworkNote = null,
        bool $allowDirectCompletion = false,
    ): OrderRouting {
        return DB::transaction(function () use ($order, $stationName, $newStatus, $workerUserId, $printMachine, $cuttingTeamId, $sewingTeamId, $embroideryTeamId, $screenTeamId, $heatPressMachineId, $reworkNote, $allowDirectCompletion): OrderRouting {
            $this->ensureSequentialPrerequisites($order, $stationName, $newStatus, $allowDirectCompletion);

            $routing = OrderRouting::query()
                ->where('order_id', $order->id)
                ->where('station_name', $stationName->value)
                ->first();

            if ($routing === null) {
                if (
                    in_array($newStatus, [RoutingStatus::Pending, RoutingStatus::InProgress], true)
                    && in_array($stationName, [
                        RoutingStationName::Screen,
                        RoutingStationName::Flex,
                        RoutingStationName::Cutting,
                        RoutingStationName::Sewing,
                    ], true)
                ) {
                    $routing = OrderRouting::query()->create([
                        'order_id' => $order->id,
                        'station_name' => $stationName->value,
                        'is_required' => true,
                        'status' => RoutingStatus::Pending,
                    ]);
                } else {
                    throw ValidationException::withMessages([
                        'station' => sprintf(
                            'Order [%d] does not have routing station [%s].',
                            $order->id,
                            $stationName->value,
                        ),
                    ]);
                }
            }

            if (
                $stationName === RoutingStationName::Print
                && $newStatus === RoutingStatus::InProgress
                && ($printMachine === null || trim($printMachine) === '')
            ) {
                throw ValidationException::withMessages([
                    'print_machine' => 'The print machine field is required.',
                ]);
            }

            $canCompleteFromLegacyStartedSignal = $routing->status === RoutingStatus::Pending
                && ($routing->started_at !== null || $routing->assigned_user_id !== null);

            if ($allowDirectCompletion && $newStatus === RoutingStatus::Completed) {
                $canCompleteFromLegacyStartedSignal = true;
            }

            if ($newStatus === RoutingStatus::Completed && $routing->status !== RoutingStatus::InProgress && ! $canCompleteFromLegacyStartedSignal) {
                throw ValidationException::withMessages([
                    'status' => sprintf(
                        'Cannot complete station [%s] before it is in progress.',
                        $stationName->value,
                    ),
                ]);
            }

            $routing->status = $newStatus;

            if ($newStatus === RoutingStatus::InProgress) {
                if ($routing->started_at === null) {
                    $routing->started_at = now();
                }

                $routing->completed_at = null;
                $routing->assigned_user_id = $workerUserId;

                if ($stationName === RoutingStationName::Print) {
                    $routing->print_machine = $printMachine;
                }

                if ($stationName === RoutingStationName::Cutting && $cuttingTeamId !== null) {
                    $routing->cutting_team_id = $cuttingTeamId;
                }

                if ($stationName === RoutingStationName::Sewing) {
                    $routing->sewing_team_id = $sewingTeamId ?? $routing->sewing_team_id;
                }

                if ($stationName === RoutingStationName::Embroidery && $embroideryTeamId !== null) {
                    $routing->embroidery_team_id = $embroideryTeamId;
                }

                if (in_array($stationName, [RoutingStationName::Screen, RoutingStationName::Flex], true) && $screenTeamId !== null) {
                    $routing->screen_team_id = $screenTeamId;
                }

                if (in_array($stationName, [RoutingStationName::Screen, RoutingStationName::Flex], true) && $heatPressMachineId !== null) {
                    $routing->heat_press_machine_id = $heatPressMachineId;
                }
            }

            if (in_array($newStatus, [RoutingStatus::Completed, RoutingStatus::Skipped], true)) {
                $routing->completed_at = now();
            }

            if ($newStatus === RoutingStatus::Skipped && $routing->started_at === null) {
                $routing->started_at = now();
            }

            if (in_array($stationName, [RoutingStationName::Cutting, RoutingStationName::Sewing, RoutingStationName::Embroidery, RoutingStationName::Screen, RoutingStationName::Flex], true)) {
                if ($newStatus === RoutingStatus::Rejected) {
                    $routing->rework_note = $reworkNote;
                }

                if ($newStatus !== RoutingStatus::Rejected && $reworkNote !== null) {
                    $routing->rework_note = $reworkNote;
                }
            }

            $routing->save();

            if (
                ($newStatus === RoutingStatus::InProgress || ($newStatus === RoutingStatus::Completed && $allowDirectCompletion))
                && $order->order_status?->canEnterProduction() === true
            ) {
                $order->update(['order_status' => OrderStatus::InProduction]);
            }

            if ($allowDirectCompletion && $newStatus === RoutingStatus::Completed && in_array($stationName, [RoutingStationName::Screen, RoutingStationName::Flex], true)) {
                $siblings = OrderRouting::query()
                    ->where('order_id', $order->id)
                    ->where('is_required', true)
                    ->whereIn('station_name', [RoutingStationName::Screen->value, RoutingStationName::Flex->value])
                    ->where('id', '!=', $routing->id)
                    ->get();

                foreach ($siblings as $sibling) {
                    if (in_array($sibling->status, [RoutingStatus::Completed, RoutingStatus::Skipped], true)) {
                        continue;
                    }

                    $sibling->status = RoutingStatus::Completed;
                    $sibling->started_at = $sibling->started_at ?? now();
                    $sibling->completed_at = now();
                    $sibling->assigned_user_id = $sibling->assigned_user_id ?? $workerUserId;
                    $sibling->save();
                }
            }

            return $routing->refresh()->load(['cuttingTeam', 'sewingTeam', 'embroideryTeam', 'screenTeam', 'heatPressMachine']);
        });
    }

    private function ensureSequentialPrerequisites(Order $order, RoutingStationName $stationName, RoutingStatus $newStatus, bool $allowDirectCompletion = false): void
    {
        if ($allowDirectCompletion && $newStatus === RoutingStatus::Completed) {
            return;
        }

        if (! in_array($newStatus, [RoutingStatus::InProgress, RoutingStatus::Completed, RoutingStatus::Rejected, RoutingStatus::Skipped], true)) {
            return;
        }

        /** @var Collection<int, OrderRouting> $requiredRoutings */
        $requiredRoutings = OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('is_required', true)
            ->orderBy('id')
            ->get();

        if ($requiredRoutings->isEmpty()) {
            return;
        }

        $targetIndex = $requiredRoutings->search(
            fn (OrderRouting $routing): bool => $routing->station_name instanceof RoutingStationName
                ? $routing->station_name === $stationName
                : (string) $routing->station_name === $stationName->value,
        );

        if (! is_int($targetIndex)) {
            return;
        }

        $targetRouting = $requiredRoutings->get($targetIndex);

        if ($targetRouting instanceof OrderRouting) {
            $hasLegacyStartedSignal = $targetRouting->started_at !== null || $targetRouting->assigned_user_id !== null;

            if ($targetRouting->status !== RoutingStatus::Pending || $hasLegacyStartedSignal) {
                return;
            }
        }

        $blockingRouting = $requiredRoutings
            ->take($targetIndex)
            ->first(function (OrderRouting $routing): bool {
                return ! in_array($routing->status, [RoutingStatus::Completed, RoutingStatus::Skipped], true);
            });

        if ($blockingRouting === null) {
            return;
        }

        $blockingStation = $blockingRouting->station_name instanceof RoutingStationName
            ? $blockingRouting->station_name->value
            : (string) $blockingRouting->station_name;

        throw ValidationException::withMessages([
            'station' => sprintf(
                'Cannot move station [%s] before prerequisite station [%s] is completed or skipped.',
                $stationName->value,
                $blockingStation,
            ),
        ]);
    }
}
