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
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', [
                'admin',
                'sales',
                'designer',
                'production_manager',
                'worker',
                'qc',
                'finance',
            ])->default('sales')->after('email');

            $table->enum('station_department', [
                'none',
                'print',
                'embroidery',
                'screen',
                'flex',
                'cutting',
                'sewing',
                'qc',
            ])->default('none')->after('role');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['role', 'station_department']);
        });
    }
};
