<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\GarmentCategory;
use App\Models\GarmentType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateGarmentTypeRequest extends FormRequest
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
        $garmentType = $this->route('garmentType');
        $garmentTypeId = $garmentType instanceof GarmentType ? (int) $garmentType->id : null;

        return [
            'category' => ['required', 'string', Rule::in(array_column(GarmentCategory::cases(), 'value'))],
            'code' => ['required', 'string', 'max:50', Rule::unique('garment_types', 'code')->ignore($garmentTypeId)],
            'name' => ['required', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'display_order' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
