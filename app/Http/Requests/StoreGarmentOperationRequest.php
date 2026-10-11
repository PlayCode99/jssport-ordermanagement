<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreGarmentOperationRequest extends FormRequest
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
            'garment_type_id' => ['required', 'integer', 'exists:garment_types,id'],
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('garment_operations', 'name')
                    ->where(fn ($query) => $query->where('garment_type_id', (int) $this->input('garment_type_id'))),
            ],
            'child_price' => ['required', 'numeric', 'min:0', 'max:999999.99'],
            'adult_price' => ['required', 'numeric', 'min:0', 'max:999999.99'],
            'is_active' => ['sometimes', 'boolean'],
            'display_order' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
