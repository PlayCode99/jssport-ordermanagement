<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A discount that belongs to the delivery note and to nothing else.
 *
 * The bill already has `discount_percent`, which is the one the work receipt
 * is written with and the one the bill's money is worked out from. This is a
 * second, separate reduction the counter gives when the goods are handed
 * over, taken off what the bill came to — so the delivery note the customer
 * signs can say a smaller figure without the bill behind it being rewritten.
 *
 * Kept on the order so reprinting a delivery note gives the same paper as
 * the first print; a figure typed into a print dialog and thrown away would
 * mean the shop's copy and the customer's copy could disagree.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->decimal('delivery_discount_percent', 5, 2)
                ->default('0.00')
                ->after('net_amount');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('delivery_discount_percent');
        });
    }
};
