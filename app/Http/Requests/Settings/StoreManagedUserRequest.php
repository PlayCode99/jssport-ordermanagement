<?php

declare(strict_types=1);

namespace App\Http\Requests\Settings;

use App\Enums\AccessRole;
use App\Models\User;
use App\Support\UserAccessControl;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreManagedUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->can('create', User::class);
    }

    /**
     * @return array<string, array<int, mixed>|string>
     */
    public function rules(): array
    {
        return [
            'full_name' => ['required', 'string', 'max:255'],
            'employee_code' => ['required', 'string', 'max:100', Rule::unique('users', 'employee_code')],
            'role' => ['required', Rule::in(array_column(AccessRole::cases(), 'value'))],
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'is_active' => ['required', 'boolean'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
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
            'password.required' => 'กรุณากรอกรหัสผ่าน',
            'password.min' => 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
            'password.confirmed' => 'ยืนยันรหัสผ่านไม่ตรงกัน',
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
