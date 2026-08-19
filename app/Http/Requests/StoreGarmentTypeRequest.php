<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\GarmentCategory;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreGarmentTypeRequest extends FormRequest
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
            'category' => ['required', 'string', Rule::in(array_column(GarmentCategory::cases(), 'value'))],
            'code' => ['required', 'string', 'max:50', Rule::unique('garment_types', 'code')],
            'name' => ['required', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'display_order' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
