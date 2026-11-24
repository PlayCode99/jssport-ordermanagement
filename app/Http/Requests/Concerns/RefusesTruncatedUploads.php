<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use Illuminate\Validation\Validator;

/**
 * Refuses a request that arrived with fewer files than the browser attached.
 *
 * PHP accepts `max_file_uploads` files per request — twenty by default — and
 * throws the rest away at startup without raising anything the application can
 * catch. A bill with more artwork than that would have been saved looking
 * complete while some of its images had simply vanished.
 *
 * The browser says how many it attached in `artwork_file_count`, so a
 * shortfall is visible here and the request is refused instead of stored
 * short. Shared by the counter form and by "อัปเดตรูป", which posts artwork on
 * its own and can hit the same ceiling.
 */
trait RefusesTruncatedUploads
{
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
}
