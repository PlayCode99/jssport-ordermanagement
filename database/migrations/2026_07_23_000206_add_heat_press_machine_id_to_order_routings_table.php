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
        Schema::table('order_routings', function (Blueprint $table) {
            $table->foreignId('heat_press_machine_id')
                ->nullable()
                ->after('screen_team_id')
                ->constrained('heat_press_machines')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_routings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('heat_press_machine_id');
        });
    }
};
