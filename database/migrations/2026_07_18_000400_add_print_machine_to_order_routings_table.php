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
        Schema::table('order_routings', function (Blueprint $table): void {
            $table->string('print_machine', 20)->nullable()->after('status');
            $table->index(['station_name', 'status', 'print_machine'], 'order_routings_station_status_machine_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_routings', function (Blueprint $table): void {
            $table->dropIndex('order_routings_station_status_machine_idx');
            $table->dropColumn('print_machine');
        });
    }
};
