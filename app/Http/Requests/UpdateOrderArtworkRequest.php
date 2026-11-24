<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Http\Requests\Concerns\RefusesTruncatedUploads;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * The counter's "อัปเดตรูป": the pictures on a bill and nothing else.
 *
 * Deliberately a separate request from StoreOrderRequest rather than a subset
 * of it. This one runs against bills that are already on the floor, so it must
 * not be able to carry a size, a price or a delivery date — a field it does
 * not name cannot reach the order, whatever the browser posts.
 *
 * The field names match what SyncOrderArtworkAction reads, so the edit form
 * and this share one implementation.
 */
class UpdateOrderArtworkRequest extends FormRequest
{
    use RefusesTruncatedUploads;

    public function authorize(): bool
    {
        // The route already runs the updateArtwork policy check through the
        // controller; a false here would turn that 403 into a less helpful one.
        return true;
    }

    /**
     * The three maps below are keyed by media id and would otherwise be one
     * POST variable per picture. They travel as JSON when the browser sends
     * them, for the same reason the bill's items do: multipart counts every
     * scalar against PHP's max_input_vars, and a request over that limit is
     * silently truncated rather than refused. A caller posting real arrays —
     * the tests, anything speaking to this as an API — is left untouched.
     */
    protected function prepareForValidation(): void
    {
        foreach (['removed_media_ids', 'artwork_scopes', 'sports_day_artwork_houses'] as $key) {
            $value = $this->input($key);

            if (! is_string($value)) {
                continue;
            }

            $decoded = json_decode($value, true);

            if (is_array($decoded)) {
                $this->merge([$key => $decoded]);
            }
        }
    }

    /**
     * Same file rules as the counter form, so a picture that the bill would
     * have accepted when it was written is still accepted now.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $image = ['file', 'image', 'mimes:webp,png,jpg,jpeg', 'max:5120'];

        return [
            'design_artwork' => ['nullable', 'file', 'mimes:webp,png,jpg,pdf', 'max:5120'],

            'shirt_artwork' => ['nullable', 'array'],
            'shirt_artwork.*' => $image,
            'pants_artwork' => ['nullable', 'array'],
            'pants_artwork.*' => $image,

            // Files for one sheet only, keyed by the sheet. The key is checked
            // against the sheets this bill can have in the action, so an image
            // can never be pinned to a sheet that cannot exist.
            'shirt_artwork_scoped' => ['nullable', 'array'],
            'shirt_artwork_scoped.*' => ['array'],
            'shirt_artwork_scoped.*.*' => $image,
            'pants_artwork_scoped' => ['nullable', 'array'],
            'pants_artwork_scoped.*' => ['array'],
            'pants_artwork_scoped.*.*' => $image,

            'sports_day_artwork' => ['nullable', 'array'],
            'sports_day_artwork.*' => ['array'],
            'sports_day_artwork.*.*' => $image,

            'pe_uniform_artwork' => ['nullable', 'array'],
            'pe_uniform_artwork.kids' => ['nullable', 'array'],
            'pe_uniform_artwork.adults' => ['nullable', 'array'],
            'pe_uniform_artwork.*.*' => $image,

            'reference_designs' => ['nullable', 'array'],
            'reference_designs.*' => ['file', 'mimes:webp,png,jpg,pdf', 'max:5120'],

            // Sheet to re-pin a saved picture to, keyed by media id. Empty puts
            // it back on every sheet of its garment.
            'artwork_scopes' => ['sometimes', 'array'],
            'artwork_scopes.*' => ['nullable', 'string', 'max:64'],
            'sports_day_artwork_houses' => ['sometimes', 'array'],
            'sports_day_artwork_houses.*' => ['integer', 'min:0', 'max:99'],

            // Ownership is checked in the action: an id that is not this
            // order's own artwork deletes nothing.
            'removed_media_ids' => ['sometimes', 'array'],
            'removed_media_ids.*' => ['integer', 'min:1'],

            // How many files the browser attached. PHP drops uploads past
            // max_file_uploads without a word, so the controller compares this
            // against what arrived and refuses a half-delivered update rather
            // than saving part of it.
            'artwork_file_count' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
