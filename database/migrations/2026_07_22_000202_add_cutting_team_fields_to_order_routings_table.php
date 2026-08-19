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
            $table->foreignId('cutting_team_id')
                ->nullable()
                ->after('assigned_user_id')
                ->constrained('cutting_teams')
                ->nullOnDelete();
            $table->string('rework_note', 255)
                ->nullable()
                ->after('cutting_team_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_routings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cutting_team_id');
            $table->dropColumn('rework_note');
        });
    }
};
