<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The size lists are shown in an order the shop chooses (JSS before JS, S
 * before M), not the order they happened to be typed in. Every catalog row
 * gets a position; the existing rows keep the order they were added in so
 * nothing moves until somebody reorders it on the settings page.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('catalog_items', function (Blueprint $table): void {
            $table->unsignedInteger('sort_order')->default(0)->after('name');
            $table->index(['storage_key', 'sort_order'], 'catalog_items_storage_key_sort_order_index');
        });

        $storageKeys = DB::table('catalog_items')->distinct()->pluck('storage_key');

        foreach ($storageKeys as $storageKey) {
            $ids = DB::table('catalog_items')
                ->where('storage_key', $storageKey)
                ->orderBy('created_at')
                ->orderBy('item_id')
                ->pluck('id');

            foreach ($ids as $position => $id) {
                DB::table('catalog_items')->where('id', $id)->update(['sort_order' => $position + 1]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('catalog_items', function (Blueprint $table): void {
            $table->dropIndex('catalog_items_storage_key_sort_order_index');
            $table->dropColumn('sort_order');
        });
    }
};
