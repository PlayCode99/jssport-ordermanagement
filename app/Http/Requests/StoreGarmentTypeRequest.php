<?php

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
            // A length decides the work, so a garment cannot be priced
            // without one. Sleeveless belongs to shirts alone.
            'style' => ['required', 'string', Rule::in(['short', 'long', 'sleeveless'])],
            'name' => ['required', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'display_order' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
