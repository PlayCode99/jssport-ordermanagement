<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * An edit to a length that already exists.
 *
 * The category and the code are deliberately absent: both are stored on
 * every bill sold at this length, and moving a length between shirts and
 * trousers — or renaming its code — would strand those bills. The name, the
 * order it is read in and whether it is still offered are all free to change.
 */
class UpdateGarmentStyleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user();
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'display_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['name.required' => 'กรุณากรอกชื่อความยาว'];
    }
}
