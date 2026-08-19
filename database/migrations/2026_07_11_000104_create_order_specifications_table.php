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
        Schema::create('order_specifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained('orders')->cascadeOnDelete();
            $table->unsignedBigInteger('pattern_id')->nullable()->index();
            $table->unsignedBigInteger('fabric_id')->nullable()->index();
            $table->unsignedBigInteger('neck_style_id')->nullable()->index();
            $table->string('collar_color')->nullable();
            $table->string('leg_style')->nullable();
            $table->string('leg_hem')->nullable();
            $table->string('placket_style')->nullable();
            $table->string('placket_color')->nullable();
            $table->string('sleeve_style')->nullable();
            $table->string('sleeve_hem')->nullable();
            $table->text('sublimation_detail')->nullable();
            $table->text('screen_print_detail')->nullable();
            $table->string('embroidery_code')->nullable()->index();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('order_specifications');
    }
};
