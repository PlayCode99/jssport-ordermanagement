<?php

namespace App\Http\Requests\Settings;

use App\Enums\AccessRole;
use App\Models\User;
use App\Support\UserAccessControl;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Resetting someone else's password hands over their account, so it is kept to
 * the owner alone -- narrower than the rest of user management, which system
 * admins may also use.
 */
class ResetManagedUserPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        $actor = $this->user();

        if ($actor === null || ! $actor->is_active) {
            return false;
        }

        return UserAccessControl::resolveAccessRole($actor) === AccessRole::Owner;
    }

    /**
     * @return array<string, array<int, mixed>|string>
     */
    public function rules(): array
    {
        return [
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'password.required' => 'กรุณากรอกรหัสผ่านใหม่',
            'password.min' => 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
            'password.confirmed' => 'ยืนยันรหัสผ่านไม่ตรงกัน',
        ];
    }

    protected function passedValidation(): void
    {
        $actor = $this->user();
        /** @var User|null $target */
        $target = $this->route('user');

        // An owner still only reaches the branches they may see.
        if ($actor !== null && $target !== null && $target->branch_id !== null
            && ! UserAccessControl::canAccessBranch($actor, (int) $target->branch_id)) {
            abort(403);
        }
    }
}
