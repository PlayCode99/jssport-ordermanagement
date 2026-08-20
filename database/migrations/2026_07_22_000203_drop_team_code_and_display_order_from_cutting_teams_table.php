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
        Schema::table('cutting_teams', function (Blueprint $table) {
            $table->dropUnique('cutting_teams_team_code_unique');
            $table->dropColumn(['team_code', 'display_order']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('cutting_teams', function (Blueprint $table) {
            $table->string('team_code', 50)->nullable()->after('id');
            $table->unsignedInteger('display_order')->default(0)->after('team_name');
            $table->unique('team_code');
        });
    }
};
