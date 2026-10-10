<?php

namespace App\Http\Requests;

use App\Enums\RoutingStationName;
use App\Enums\SizeTier;
use App\Models\Order;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->can('create', Order::class);
    }

    /**
     * The counter form posts as multipart/form-data, because it carries artwork
     * files. In that encoding every scalar is its own input variable, so a bill
     * sends roughly ten of them per size row — and PHP stops reading a request
     * once it has seen `max_input_vars` of them, which is 1000 by default.
     *
     * It does not refuse the request. It parses the first thousand variables,
     * silently discards the rest and hands the remains to the application, so a
     * Form 2 bill of about fifty people arrived with its items cut in a quarter
     * and its `specification` missing entirely — and was refused for a pattern
     * and a fabric the counter had plainly filled in. Nothing on either side was
     * wrong; the request never arrived whole.
     *
     * So the two long lists travel as one JSON string each and are unpacked
     * here, before any rule runs. That makes the variable count a constant that
     * does not grow with the bill, and every rule below still sees the arrays it
     * was written for. A caller that posts real arrays — the tests, and anything
     * speaking to this as an API — is left untouched.
     */
    protected function prepareForValidation(): void
    {
        foreach (['items', 'line_items'] as $key) {
            $value = $this->input($key);

            if (! is_string($value)) {
                continue;
            }

            $decoded = json_decode($value, true);

            // Anything that is not a list of rows is left exactly as it came, so
            // the `array` rule reports it rather than this quietly reading it as
            // an empty bill.
            if (is_array($decoded)) {
                $this->merge([$key => $decoded]);
            }
        }
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    /**
     * Parses a submitted date down to its day, ignoring any time-of-day, so the
     * date rules compare calendar days rather than timestamps. Returns null for
     * anything unparseable and lets the plain `date` rule report that instead.
     */
    private function asStartOfDay(mixed $value): ?Carbon
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }

    public function rules(): array
    {
        return [
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'customer_name' => ['required', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'contact_detail' => ['nullable', 'string', 'max:255'],
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'job_name' => ['required', 'string', 'max:255'],
            'job_type' => ['required', 'string'],
            'delivery_method' => ['nullable', 'string', Rule::in(['pickup', 'shipping', 'onsite'])],
            'shipping_address' => ['nullable', 'string'],
            // A brand-new bill may not be opened in the past. Editing an existing
            // order deliberately skips this: historical orders must stay
            // correctable long after their billing date has gone by.
            'order_date' => ['required', 'date', function (string $attribute, mixed $value, callable $fail): void {
                if ($this->route('order') !== null) {
                    return;
                }

                $opened = $this->asStartOfDay($value);

                if ($opened !== null && $opened->lt(now()->startOfDay())) {
                    $fail('วันที่เปิดบิลต้องไม่เป็นวันที่ผ่านมาแล้ว');
                }
            }],
            // Compared by day, not by timestamp: the bill carries the real time
            // it was opened (e.g. 15:28) while a delivery date is always
            // midnight, so a plain after_or_equal would reject same-day delivery.
            'due_date' => ['required', 'date', function (string $attribute, mixed $value, callable $fail): void {
                $due = $this->asStartOfDay($value);
                $opened = $this->asStartOfDay($this->input('order_date'));

                if ($due === null || $opened === null) {
                    return;
                }

                if ($due->lt($opened)) {
                    $fail('วันที่รับสินค้าต้องไม่ก่อนวันที่เปิดบิล');
                }
            }],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'deposit_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', Rule::in(['cash', 'transfer'])],
            'design_artwork' => ['nullable', 'file', 'mimes:webp,png,jpg,pdf', 'max:5120'],
            'shirt_artwork' => ['nullable', 'array'],
            'shirt_artwork.*' => ['file', 'image', 'mimes:webp,png,jpg,jpeg', 'max:5120'],
            'pants_artwork' => ['nullable', 'array'],
            'pants_artwork.*' => ['file', 'image', 'mimes:webp,png,jpg,jpeg', 'max:5120'],
            // Artwork drawn for one production batch only, keyed by that
            // batch. The key itself is checked against the batches that can
            // exist, so an image can never be pinned to a sheet that cannot.
            'shirt_artwork_scoped' => ['nullable', 'array'],
            'shirt_artwork_scoped.*' => ['array'],
            'shirt_artwork_scoped.*.*' => ['file', 'image', 'mimes:webp,png,jpg,jpeg', 'max:5120'],
            'pants_artwork_scoped' => ['nullable', 'array'],
            'pants_artwork_scoped.*' => ['array'],
            'pants_artwork_scoped.*.*' => ['file', 'image', 'mimes:webp,png,jpg,jpeg', 'max:5120'],
            // Batches to pin artwork already on file to, keyed by media id.
            // An empty value puts an image back on every sheet of its garment.
            'artwork_scopes' => ['nullable', 'array'],
            'artwork_scopes.*' => ['nullable', 'string', 'max:64'],
            'reference_designs' => ['nullable', 'array'],
            'reference_designs.*' => ['file', 'mimes:webp,png,jpg,pdf', 'max:5120'],

            // Form 3 only: keyed by colour house index -> that house's files.
            'sports_day_artwork' => ['nullable', 'array'],
            'sports_day_artwork.*' => ['array'],
            'sports_day_artwork.*.*' => ['file', 'image', 'mimes:webp,png,jpg,jpeg', 'max:5120'],
            // ชุดพละ: keyed by the size table, so only kids and adults exist.
            'pe_uniform_artwork' => ['nullable', 'array'],
            'pe_uniform_artwork.kids' => ['nullable', 'array'],
            'pe_uniform_artwork.adults' => ['nullable', 'array'],
            'pe_uniform_artwork.*.*' => ['file', 'image', 'mimes:webp,png,jpg,jpeg', 'max:5120'],

            // Set when the form was opened via "เปิดบิลอีกครั้ง": the artwork of
            // the source order is copied onto the new one server-side, because
            // the browser only ever holds display URLs for already-saved images.
            'duplicate_from_id' => ['nullable', 'integer', 'exists:orders,id'],

            // Saved artwork the user removed while editing. Ownership is checked
            // again when deleting, so an id from another order is simply ignored.
            'removed_media_ids' => ['sometimes', 'array'],
            'removed_media_ids.*' => ['integer', 'min:1'],

            // How many artwork files the browser attached. PHP drops uploads
            // past `max_file_uploads` without saying so, so the count is what
            // lets the server notice that some never arrived.
            'artwork_file_count' => ['nullable', 'integer', 'min:0'],

            'items' => ['required', 'array', 'min:1'],
            'items.*.item_type' => ['required', 'string'],
            'items.*.size_group' => ['required', 'string', Rule::in(['kids', 'adults', 'oversize'])],
            // The tier the line is cut at, which is what the floor batches by.
            // It is optional: a caller that names none is read as having been
            // cut at the tier it is billed under.
            'items.*.size_tier' => ['nullable', 'string', Rule::in(SizeTier::values())],
            'items.*.size_label' => ['required', 'string', 'max:50'],
            // A shirt can be cut sleeveless; a pair of trousers cannot.
            'items.*.shirt_style' => ['nullable', 'string', Rule::in(['short', 'long', 'sleeveless'])],
            'items.*.pants_style' => ['nullable', 'string', Rule::in(['short', 'long'])],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],

            'specification' => ['sometimes', 'array'],
            'specification.pattern_id' => ['required', 'integer'],
            'specification.fabric_id' => ['required', 'integer'],
            'specification.neck_style_id' => ['nullable', 'integer'],
            'specification.collar_color' => ['nullable', 'string', 'max:255'],
            'specification.leg_style' => ['nullable', 'string', 'max:255'],
            'specification.leg_hem' => ['nullable', 'string', 'max:255'],
            'specification.placket_style' => ['nullable', 'string', 'max:255'],
            'specification.placket_color' => ['nullable', 'string', 'max:255'],
            'specification.sleeve_style' => ['nullable', 'string', 'max:255'],
            'specification.sleeve_hem' => ['nullable', 'string', 'max:255'],
            'specification.sublimation_detail' => ['nullable', 'string'],
            'specification.screen_print_detail' => ['required', 'string'],
            'specification.embroidery_code' => ['nullable', 'string', 'max:255'],

            'routings' => ['sometimes', 'array', 'min:1'],
            'routings.*' => ['required', 'string', Rule::in(array_column(RoutingStationName::cases(), 'value'))],
        ];
    }

    /**
     * Counts every file that actually reached PHP, however it was nested.
     */
    private function uploadedFileCount(): int
    {
        $count = 0;
        // Held in a variable first: array_walk_recursive takes its subject by
        // reference, so the result of a call cannot be passed straight in.
        $files = $this->allFiles();

        array_walk_recursive(
            $files,
            function (mixed $file) use (&$count): void {
                if ($file !== null) {
                    $count++;
                }
            },
        );

        return $count;
    }

    /**
     * PHP accepts `max_file_uploads` files per request — twenty by default —
     * and throws the rest away at startup without raising anything the
     * application can catch. A bill with more artwork than that would have been
     * saved looking complete while some of its images had simply vanished.
     *
     * The browser says how many it attached, so a shortfall is visible here and
     * the bill is refused instead of stored short.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $claimed = $this->input('artwork_file_count');

            if (! is_numeric($claimed)) {
                return;
            }

            $arrived = $this->uploadedFileCount();

            if ($arrived >= (int) $claimed) {
                return;
            }

            $validator->errors()->add('artwork_file_count', sprintf(
                'แนบรูปมา %d ไฟล์ แต่ระบบรับได้เพียง %d ไฟล์ '
                .'เซิร์ฟเวอร์จำกัดจำนวนไฟล์ต่อการบันทึกหนึ่งครั้ง '
                .'กรุณาลดจำนวนรูป แล้วบันทึกอีกครั้ง (ยังไม่มีการบันทึกข้อมูล)',
                (int) $claimed,
                $arrived,
            ));
        });
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'design_artwork.mimes' => 'ไฟล์ Art Work ทั่วไปต้องเป็นชนิด webp, png, jpg หรือ pdf เท่านั้น',
            'design_artwork.max' => 'ไฟล์ Art Work ทั่วไปต้องมีขนาดไม่เกิน 5MB',
            'shirt_artwork.*.image' => 'ไฟล์ Art Work เสื้อ ต้องเป็นไฟล์รูปภาพเท่านั้น',
            'shirt_artwork.*.mimes' => 'ไฟล์ Art Work เสื้อ ต้องเป็นชนิด webp, png หรือ jpg เท่านั้น',
            'shirt_artwork.*.max' => 'ไฟล์ Art Work เสื้อ ต้องมีขนาดไม่เกิน 5MB',
            'pants_artwork.*.image' => 'ไฟล์ Art Work กางเกง ต้องเป็นไฟล์รูปภาพเท่านั้น',
            'pants_artwork.*.mimes' => 'ไฟล์ Art Work กางเกง ต้องเป็นชนิด webp, png หรือ jpg เท่านั้น',
            'pants_artwork.*.max' => 'ไฟล์ Art Work กางเกง ต้องมีขนาดไม่เกิน 5MB',
            'shirt_artwork_scoped.*.*.image' => 'ไฟล์ Art Work เสื้อ ต้องเป็นไฟล์รูปภาพเท่านั้น',
            'shirt_artwork_scoped.*.*.mimes' => 'ไฟล์ Art Work เสื้อ ต้องเป็นชนิด webp, png หรือ jpg เท่านั้น',
            'shirt_artwork_scoped.*.*.max' => 'ไฟล์ Art Work เสื้อ ต้องมีขนาดไม่เกิน 5MB',
            'pants_artwork_scoped.*.*.image' => 'ไฟล์ Art Work กางเกง ต้องเป็นไฟล์รูปภาพเท่านั้น',
            'pants_artwork_scoped.*.*.mimes' => 'ไฟล์ Art Work กางเกง ต้องเป็นชนิด webp, png หรือ jpg เท่านั้น',
            'pants_artwork_scoped.*.*.max' => 'ไฟล์ Art Work กางเกง ต้องมีขนาดไม่เกิน 5MB',
            'sports_day_artwork.*.*.image' => 'ไฟล์ Art Work คณะสี ต้องเป็นไฟล์รูปภาพเท่านั้น',
            'sports_day_artwork.*.*.mimes' => 'ไฟล์ Art Work คณะสี ต้องเป็นชนิด webp, png หรือ jpg เท่านั้น',
            'sports_day_artwork.*.*.max' => 'ไฟล์ Art Work คณะสี ต้องมีขนาดไม่เกิน 5MB',
            'pe_uniform_artwork.*.*.image' => 'ไฟล์ Art Work ชุดพละ ต้องเป็นไฟล์รูปภาพเท่านั้น',
            'pe_uniform_artwork.*.*.mimes' => 'ไฟล์ Art Work ชุดพละ ต้องเป็นชนิด webp, png หรือ jpg เท่านั้น',
            'pe_uniform_artwork.*.*.max' => 'ไฟล์ Art Work ชุดพละ ต้องมีขนาดไม่เกิน 5MB',
        ];
    }
}
