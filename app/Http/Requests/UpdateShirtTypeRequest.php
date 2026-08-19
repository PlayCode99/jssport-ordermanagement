<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\ShirtType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateShirtTypeRequest extends FormRequest
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
        $shirtType = $this->route('shirtType');
        $shirtTypeId = $shirtType instanceof ShirtType ? (int) $shirtType->id : null;

        return [
            'code' => ['required', 'string', 'max:50', Rule::unique('shirt_types', 'code')->ignore($shirtTypeId)],
            'name' => ['required', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'display_order' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
