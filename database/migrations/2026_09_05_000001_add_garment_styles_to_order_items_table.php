<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Sleeve and leg length are chosen per size row, so they belong on the item
     * rather than on the order-wide specification. Nullable on purpose: rows
     * saved before this column existed simply have no recorded style, and the
     * printed receipt omits the label instead of inventing one.
     */
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table): void {
            $table->string('shirt_style', 20)->nullable()->after('size_label');
            $table->string('pants_style', 20)->nullable()->after('shirt_style');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table): void {
            $table->dropColumn(['shirt_style', 'pants_style']);
        });
    }
};
