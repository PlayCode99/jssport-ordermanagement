<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Which size tier a line was cut at — kids, ประถม - มัธยมต้น or adults.
 *
 * `size_group` stays exactly what it was: the rate the line is costed at, of
 * which the shop keeps two. The tier is how the floor batches the work, and
 * ประถม - มัธยมต้น is a tier of its own that is still charged as a child.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table): void {
            $table->string('size_tier', 20)->nullable()->after('size_group');
        });

        // Every line written before this column existed was cut at the tier it
        // was billed under, so the two agree and no work is re-batched.
        DB::table('order_items')
            ->whereNull('size_tier')
            ->where('size_group', 'kids')
            ->update(['size_tier' => 'kids']);

        DB::table('order_items')
            ->whereNull('size_tier')
            ->whereNotNull('size_group')
            ->update(['size_tier' => 'adults']);
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table): void {
            $table->dropColumn('size_tier');
        });
    }
};
