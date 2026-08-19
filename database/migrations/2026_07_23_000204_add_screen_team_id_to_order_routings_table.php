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
            $table->foreignId('screen_team_id')
                ->nullable()
                ->after('embroidery_team_id')
                ->constrained('screen_teams')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_routings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('screen_team_id');
        });
    }
};
