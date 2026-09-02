<?php

use App\Models\CatalogItem;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Job types used to be master data that lived only in each browser's
 * localStorage, so the server could never list a type until an order had used
 * it — and two machines could disagree about what exists. This moves the list
 * into catalog_items like every other catalog.
 *
 * The existing orders are the only copy of that list the server can actually
 * see, so they seed it. Any type a user had configured but never ordered stays
 * in their browser; the settings page offers to import those.
 */
return new class extends Migration
{
    private const STORAGE_KEY = 'jssport.job-types';

    public function up(): void
    {
        if (CatalogItem::query()->where('storage_key', self::STORAGE_KEY)->exists()) {
            return;
        }

        $jobTypes = DB::table('orders')
            ->select('job_type')
            ->whereNotNull('job_type')
            ->where('job_type', '!=', '')
            ->distinct()
            ->orderBy('job_type')
            ->pluck('job_type');

        if ($jobTypes->isEmpty()) {
            return;
        }

        $now = now();

        foreach ($jobTypes->values() as $index => $name) {
            CatalogItem::query()->create([
                'storage_key' => self::STORAGE_KEY,
                'item_id' => $index + 1,
                'name' => (string) $name,
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
