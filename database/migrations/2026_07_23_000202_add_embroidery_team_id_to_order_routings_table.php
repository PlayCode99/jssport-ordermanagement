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
            $table->foreignId('embroidery_team_id')
                ->nullable()
                ->after('cutting_team_id')
                ->constrained('embroidery_teams')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_routings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('embroidery_team_id');
        });
    }
};
