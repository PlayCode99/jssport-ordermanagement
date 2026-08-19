<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Domain\UserManagement\Actions\CreateManagedUserAction;
use App\Domain\UserManagement\Actions\DeleteManagedUserAction;
use App\Domain\UserManagement\Actions\ToggleManagedUserActiveAction;
use App\Domain\UserManagement\Actions\UpdateManagedUserAction;
use App\Enums\AccessRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\StoreManagedUserRequest;
use App\Http\Requests\Settings\ToggleManagedUserActiveRequest;
use App\Http\Requests\Settings\UpdateManagedUserRequest;
use App\Models\User;
use App\Support\UserAccessControl;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UserManagementController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorize('viewAny', User::class);

        $actor = $request->user();
        $filters = [
            'search' => trim((string) $request->query('search', '')),
            'role' => trim((string) $request->query('role', '')),
            'branch_id' => trim((string) $request->query('branch_id', '')),
            'status' => trim((string) $request->query('status', '')),
        ];

        $query = User::query()->with('branch:id,branch_code,branch_name')->orderBy('full_name')->orderBy('id');
        UserAccessControl::applyBranchScope($query, $actor);

        if ($filters['search'] !== '') {
            $search = $filters['search'];

            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('full_name', 'like', "%{$search}%")
                    ->orWhere('employee_code', 'like', "%{$search}%");
            });
        }

        if ($filters['role'] !== '' && in_array($filters['role'], array_column(AccessRole::cases(), 'value'), true)) {
            $query->where('access_role', $filters['role']);
        }

        if ($filters['branch_id'] !== '') {
            $branchId = (int) $filters['branch_id'];

            if (! UserAccessControl::canAccessBranch($actor, $branchId)) {
                abort(403);
            }

            $query->where('branch_id', $branchId);
        }

        if ($filters['status'] === 'active') {
            $query->where('is_active', true);
        }

        if ($filters['status'] === 'inactive') {
            $query->where('is_active', false);
        }

        $users = $query->paginate(20)->withQueryString()->through(function (User $user): array {
            $role = $user->access_role instanceof AccessRole
                ? $user->access_role
                : UserAccessControl::resolveAccessRole($user);

            return [
                'id' => (int) $user->id,
                'full_name' => (string) ($user->full_name ?? $user->name),
                'employee_code' => (string) ($user->employee_code ?? ''),
                'role' => $role->value,
                'role_label' => $role->label(),
                'branch_id' => (int) ($user->branch_id ?? 0),
                'branch_code' => (string) optional($user->branch)->branch_code,
                'branch_name' => (string) optional($user->branch)->branch_name,
                'is_active' => (bool) $user->is_active,
            ];
        });

        return Inertia::render('settings/users/index', [
            'users' => $users,
            'filters' => $filters,
            'branches' => UserAccessControl::branchOptionsVisibleTo($actor),
            'roles' => collect(AccessRole::cases())->map(fn (AccessRole $role): array => [
                'value' => $role->value,
                'label' => $role->label(),
            ])->values(),
        ]);
    }

    public function store(StoreManagedUserRequest $request, CreateManagedUserAction $action): RedirectResponse
    {
        $this->authorize('create', User::class);

        $action->execute($request->user(), $request->validated());

        return back()->with('success', 'Created user successfully.');
    }

    public function update(UpdateManagedUserRequest $request, User $user, UpdateManagedUserAction $action): RedirectResponse
    {
        $this->authorize('update', $user);

        $action->execute($request->user(), $user, $request->validated());

        return back()->with('success', 'Updated user successfully.');
    }

    public function updateActive(ToggleManagedUserActiveRequest $request, User $user, ToggleManagedUserActiveAction $action): RedirectResponse
    {
        $this->authorize('toggleActive', $user);

        $action->execute($request->user(), $user, (bool) $request->boolean('is_active'));

        return back()->with('success', 'Updated user status successfully.');
    }

    public function destroy(Request $request, User $user, DeleteManagedUserAction $action): RedirectResponse
    {
        $this->authorize('delete', $user);

        $action->execute($request->user(), $user);

        return back()->with('success', 'Deleted user successfully.');
    }
}
