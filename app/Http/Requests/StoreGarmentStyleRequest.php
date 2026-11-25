<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\GarmentCategory;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** A new length for a garment: แขนสามส่วน, ขาสี่ส่วน, whatever the shop adds. */
class StoreGarmentStyleRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            // Optional: the action makes one from the name when it is left
            // out. Letters, digits and underscores only — it ends up inside
            // production sheet keys.
            'code' => ['nullable', 'string', 'max:20', 'regex:/^[A-Za-z0-9_]+$/'],
            'display_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'กรุณากรอกชื่อความยาว',
            'code.regex' => 'รหัสใช้ได้เฉพาะ a-z, 0-9 และ _',
        ];
    }
}
