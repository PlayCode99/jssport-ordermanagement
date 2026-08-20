<?php

declare(strict_types=1);

namespace App\Http\Requests\Settings;

use App\Enums\AccessRole;
use App\Models\User;
use App\Support\UserAccessControl;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateManagedUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User $target */
        $target = $this->route('user');

        return (bool) $this->user()?->can('update', $target);
    }

    /**
     * @return array<string, array<int, mixed>|string>
     */
    public function rules(): array
    {
        /** @var User $target */
        $target = $this->route('user');

        return [
            'full_name' => ['required', 'string', 'max:255'],
            'employee_code' => ['required', 'string', 'max:100', Rule::unique('users', 'employee_code')->ignore($target->id)],
            'role' => ['required', Rule::in(array_column(AccessRole::cases(), 'value'))],
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'is_active' => ['required', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'full_name.required' => 'กรุณากรอกชื่อ-สกุล',
            'employee_code.required' => 'กรุณากรอกรหัสพนักงาน',
            'employee_code.unique' => 'รหัสพนักงานนี้ถูกใช้งานแล้ว',
            'role.required' => 'กรุณาเลือกตำแหน่ง',
            'role.in' => 'ตำแหน่งที่เลือกไม่ถูกต้อง',
            'branch_id.required' => 'กรุณาเลือกสาขา',
            'branch_id.exists' => 'ไม่พบสาขาที่เลือก',
            'is_active.required' => 'กรุณาระบุสถานะการใช้งาน',
        ];
    }

    protected function passedValidation(): void
    {
        $actor = $this->user();
        $branchId = (int) $this->input('branch_id');

        if ($actor !== null && ! UserAccessControl::canAccessBranch($actor, $branchId)) {
            abort(403);
        }
    }
}
