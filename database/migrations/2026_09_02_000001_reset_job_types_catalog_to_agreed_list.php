<?php

use App\Models\CatalogItem;
use Illuminate\Database\Migrations\Migration;

/**
 * The seven job types the shop actually runs. Earlier the catalog was seeded
 * from whatever spellings existed on past orders, which produced near-duplicate
 * names ("งานปัก" vs "ปัก") and left three combinations missing entirely.
 *
 * Orders keep the job_type text they were saved with — routing was resolved
 * when they were created and does not change — and the owner dashboard folds
 * those older names in so nothing drops out of the reports.
 */
return new class extends Migration
{
    private const STORAGE_KEY = 'jssport.job-types';

    /**
     * @var array<int, string>
     */
    private const JOB_TYPES = [
        'ปัก',
        'ซับลิเมชั่น',
        'สกรีน เฟล๊กซ์',
        'ซับลิเมชั่น + ปัก',
        'ซับลิเมชั่น + ปัก + สกรีน',
        'ซับลิเมชั่น + สกรีน',
        'ปัก + สกรีน เฟล๊กซ์',
    ];

    public function up(): void
    {
        CatalogItem::query()->where('storage_key', self::STORAGE_KEY)->delete();

        $now = now();

        foreach (self::JOB_TYPES as $index => $name) {
            CatalogItem::query()->create([
                'storage_key' => self::STORAGE_KEY,
                'item_id' => $index + 1,
                'name' => $name,
                'created_by' => 'system',
                'active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        CatalogItem::query()->where('storage_key', self::STORAGE_KEY)->delete();
    }
};
