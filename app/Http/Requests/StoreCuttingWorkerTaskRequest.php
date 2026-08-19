<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreCuttingWorkerTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'cutting_order_id' => ['required', 'integer', 'exists:cutting_orders,id'],
            'price_master_id' => ['required', 'integer', 'exists:piecework_prices,id'],
            'worker_user_id' => ['required', 'integer', 'exists:users,id'],
            'quantity_done' => ['required', 'integer', 'min:1'],
        ];
    }
}
