<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Production labour was always priced from the live garment_operations rows, so
 * editing a rate silently re-priced every order ever made — an order booked at
 * 10฿ a shirt started reading 15฿, and the owner dashboard's historical spend
 * moved with it.
 *
 * The rate an order was taken at now belongs to the order. Quantities still
 * come from the order's items, so adding shirts to an existing order costs them
 * at the rate that order was opened with.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->json('production_rate_snapshot')->nullable()->after('order_status');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn('production_rate_snapshot');
        });
    }
};
