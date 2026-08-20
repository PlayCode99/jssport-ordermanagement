<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

final class UserAccessControl
{
    public static function resolveAccessRole(User $user): AccessRole
    {
        if ($user->access_role instanceof AccessRole) {
            return $user->access_role;
        }

        if ($user->role === UserRole::Admin) {
            return AccessRole::AdminSystem;
        }

        if ($user->role === UserRole::ProductionManager) {
            return AccessRole::AdminProduction;
        }

        if ($user->role === UserRole::Qc || $user->station_department === StationDepartment::Qc) {
            return AccessRole::QcStaff;
        }

        if ($user->role === UserRole::Worker) {
            return match ($user->station_department) {
                StationDepartment::Cutting => AccessRole::CuttingStaff,
                StationDepartment::Print => AccessRole::PrintingStaff,
                StationDepartment::Embroidery => AccessRole::EmbroideryStaff,
                StationDepartment::Sewing => AccessRole::SewingStaff,
                StationDepartment::Screen, StationDepartment::Flex => AccessRole::ScreenFlexStaff,
                default => AccessRole::DeliveryStaff,
            };
        }

        return AccessRole::Counter;
    }

    public static function canManageUsers(User $user): bool
    {
        $role = self::resolveAccessRole($user);

        return $user->is_active && in_array($role, [AccessRole::Owner, AccessRole::AdminSystem], true);
    }

    public static function canAssignRole(User $actor, AccessRole $targetRole): bool
    {
        $actorRole = self::resolveAccessRole($actor);

        if ($actorRole === AccessRole::Owner) {
            return true;
        }

        if ($actorRole === AccessRole::AdminSystem) {
            return $targetRole !== AccessRole::Owner;
        }

        return false;
    }

    public static function canAccessMenu(User $user, string $menu): bool
    {
        return self::canAccessMenuByRole(self::resolveAccessRole($user), $menu);
    }

    public static function canAccessMenuByRole(AccessRole $role, string $menu): bool
    {
        $menus = config('access_permissions.menus_by_role.'.$role->value, []);

        if (! is_array($menus)) {
            return false;
        }

        if (in_array('*', $menus, true)) {
            return true;
        }

        if ($role === AccessRole::AdminSystem && $menu === (string) config('access_permissions.dashboard_menu', 'dashboard')) {
            return false;
        }

        return in_array($menu, $menus, true);
    }

    public static function canAccessBranch(User $user, int $targetBranchId): bool
    {
        if (self::hasCrossBranchAccess($user)) {
            return true;
        }

        return $user->branch_id !== null && (int) $user->branch_id === $targetBranchId;
    }

    public static function hasCrossBranchAccess(User $user): bool
    {
        $branchCode = self::normalizedBranchCode($user->branch?->branch_code);

        return $branchCode !== null && $branchCode === (string) config('access_permissions.branch_cross_view_code', '01');
    }

    public static function applyBranchScope(Builder $query, User $user, string $column = 'branch_id'): void
    {
        if (self::hasCrossBranchAccess($user)) {
            return;
        }

        if ($user->branch_id === null) {
            $query->whereRaw('1 = 0');

            return;
        }

        $query->where($column, (int) $user->branch_id);
    }

    public static function normalizedBranchCode(?string $branchCode): ?string
    {
        $raw = trim((string) $branchCode);

        if ($raw === '') {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $raw);
        if (! is_string($digits) || $digits === '') {
            return null;
        }

        if (strlen($digits) === 1) {
            return '0'.$digits;
        }

        return substr($digits, -2);
    }

    /**
     * @return array<int, array{id: int, branch_code: string, branch_name: string}>
     */
    public static function branchOptionsVisibleTo(User $user): array
    {
        $query = Branch::query()->select(['id', 'branch_code', 'branch_name'])->orderBy('branch_name');
        self::applyBranchScope($query, $user, 'id');

        return $query->get()->map(fn (Branch $branch): array => [
            'id' => (int) $branch->id,
            'branch_code' => (string) $branch->branch_code,
            'branch_name' => (string) $branch->branch_name,
        ])->values()->all();
    }
}
