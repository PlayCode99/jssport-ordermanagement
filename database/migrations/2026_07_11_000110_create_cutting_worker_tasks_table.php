<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('cutting_worker_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cutting_order_id')->constrained('cutting_orders')->cascadeOnDelete();
            $table->foreignId('price_master_id')->constrained('piecework_prices')->restrictOnDelete();
            $table->foreignId('worker_user_id')->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('quantity_done');
            $table->decimal('total_wage', 10, 2);
            $table->timestamps();

            $table->index(['worker_user_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cutting_worker_tasks');
    }
};
