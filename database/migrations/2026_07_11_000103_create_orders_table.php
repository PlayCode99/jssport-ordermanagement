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
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_code')->unique();
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->restrictOnDelete();
            $table->foreignId('creator_user_id')->constrained('users')->restrictOnDelete();
            $table->string('job_name');
            $table->string('job_type');
            $table->dateTime('order_date');
            $table->dateTime('due_date');
            $table->decimal('total_amount', 10, 2)->default('0.00');
            $table->decimal('discount_percent', 5, 2)->default('0.00');
            $table->decimal('discount_amount', 10, 2)->default('0.00');
            $table->decimal('net_amount', 10, 2)->default('0.00');
            $table->enum('order_status', [
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
            ])->default('draft');
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
