<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\Order;
use App\Support\UserAccessControl;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreQcInspectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var Order|null $order */
        $order = $this->route('order');
        $user = $this->user();

        if ($user === null || $order === null) {
            return false;
        }

        // Whoever may open the QC room may sign its inspections off. Asking the
        // access-role config keeps this in step with the menu the user is
        // standing in; the old check read only the legacy `role` column, which
        // users created through user management never have, so an owner or a
        // system admin was refused their own QC screen.
        return $user->is_active && UserAccessControl::canAccessMenu($user, 'qc');
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'decision' => ['required', 'in:pass,reject'],
            'target_station' => ['nullable', 'string'],
            'remark' => ['required_if:decision,reject', 'string'],
        ];
    }
}
