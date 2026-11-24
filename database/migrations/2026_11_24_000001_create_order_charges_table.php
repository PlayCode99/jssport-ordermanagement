<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "คิดเงินเพิ่มเติม": money a bill charges for something that is not a
 * garment — delivery, a rush fee, a courier, an extra set-up.
 *
 * A row of its own rather than a line in the spec blob, because this is
 * money: it is summed into the bill's total, it is printed on the receipt
 * line by line, and the shop has to be able to ask later what it charged
 * for and how often.
 *
 * Deliberately not an order_item. Items drive the production sheets — the
 * floor cuts and sews from them — and a delivery fee would print as a
 * garment nobody can make.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_charges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('label');
            // Same precision as every other money column on the bill.
            $table->decimal('amount', 10, 2)->default('0.00');
            // The order the counter typed them in, which is the order they
            // are read back and printed in.
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->index(['order_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_charges');
    }
};
