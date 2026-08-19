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
        Schema::create('order_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->enum('from_status', [
                'draft',
                'designing',
                'waiting_customer_confirm',
                'confirmed',
                'in_production',
                'qc_checking',
                'qc_rejected',
                'shipping',
                'completed',
                'cancelled',
            ]);
            $table->enum('to_status', [
                'draft',
                'designing',
                'waiting_customer_confirm',
                'confirmed',
                'in_production',
                'qc_checking',
                'qc_rejected',
                'shipping',
                'completed',
                'cancelled',
            ]);
            $table->text('remark')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('order_status_histories');
    }
};
