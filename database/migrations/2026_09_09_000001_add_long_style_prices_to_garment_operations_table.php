<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Long sleeves and long legs cost more to make than short ones, and the rate
     * table could only hold one price per size group.
     *
     * Nullable on purpose: an operation whose cost does not change with length
     * is left empty and falls back to the short price, so the shop only fills in
     * what actually differs. Orders already taken carry their own rate snapshot
     * and are not repriced by this column existing.
     */
    public function up(): void
    {
        Schema::table('garment_operations', function (Blueprint $table): void {
            $table->decimal('child_price_long', 8, 2)->nullable()->after('child_price');
            $table->decimal('adult_price_long', 8, 2)->nullable()->after('adult_price');
        });
    }

    public function down(): void
    {
        Schema::table('garment_operations', function (Blueprint $table): void {
            $table->dropColumn(['child_price_long', 'adult_price_long']);
        });
    }
};
