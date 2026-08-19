<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('station_department', [
                'none',
                'design',
                'print',
                'embroidery',
                'screen',
                'flex',
                'cutting',
                'sewing',
                'qc',
            ])->default('none')->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('users')
            ->where('station_department', 'design')
            ->update(['station_department' => 'none']);

        Schema::table('users', function (Blueprint $table) {
            $table->enum('station_department', [
                'none',
                'print',
                'embroidery',
                'screen',
                'flex',
                'cutting',
                'sewing',
                'qc',
            ])->default('none')->change();
        });
    }
};
