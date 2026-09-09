<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('production_daily_settings', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('daily_capacity')->default(200);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('production_daily_settings');
    }
};
