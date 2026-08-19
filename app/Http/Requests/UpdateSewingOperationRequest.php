<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\SewingTargetGroup;
use App\Models\SewingOperation;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSewingOperationRequest extends FormRequest
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
        $operation = $this->route('sewingOperation');
        $operationId = $operation instanceof SewingOperation ? (int) $operation->id : null;

        return [
            'shirt_type_id' => ['required', 'integer', 'exists:shirt_types,id'],
            'target_group' => ['required', 'string', Rule::in(array_column(SewingTargetGroup::cases(), 'value'))],
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('sewing_operations', 'name')
                    ->where(fn ($query) => $query
                        ->where('shirt_type_id', (int) $this->input('shirt_type_id'))
                        ->where('target_group', (string) $this->input('target_group')))
                    ->ignore($operationId),
            ],
            'price' => ['required', 'numeric', 'min:0', 'max:999999.99'],
            'is_active' => ['sometimes', 'boolean'],
            'display_order' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
