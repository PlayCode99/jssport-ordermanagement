<?php

declare(strict_types=1);

use App\Enums\AccessRole;
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
        $hasFullName = Schema::hasColumn('users', 'full_name');
        $hasEmployeeCode = Schema::hasColumn('users', 'employee_code');
        $hasAccessRole = Schema::hasColumn('users', 'access_role');
        $hasBranchId = Schema::hasColumn('users', 'branch_id');
        $hasIsActive = Schema::hasColumn('users', 'is_active');
        $hasDeletedAt = Schema::hasColumn('users', 'deleted_at');

        Schema::table('users', function (Blueprint $table) use ($hasFullName, $hasEmployeeCode, $hasAccessRole, $hasBranchId, $hasIsActive, $hasDeletedAt): void {
            if (! $hasFullName) {
                $table->string('full_name')->nullable()->after('name');
            }

            if (! $hasEmployeeCode) {
                $table->string('employee_code', 100)->nullable()->after('full_name');
                $table->unique('employee_code');
            }

            if (! $hasAccessRole) {
                $table->enum('access_role', array_column(AccessRole::cases(), 'value'))
                    ->default(AccessRole::Counter->value)
                    ->after('station_department');
                $table->index('access_role');
            }

            if (! $hasBranchId) {
                $table->foreignId('branch_id')->nullable()->after('access_role')->constrained('branches')->restrictOnDelete();
            }

            if (! $hasIsActive) {
                $table->boolean('is_active')->default(true)->after('branch_id');
                $table->index('is_active');
            }

            if (! $hasDeletedAt) {
                $table->softDeletes();
            }
        });

        DB::table('users')->whereNull('full_name')->update([
            'full_name' => DB::raw('name'),
        ]);

        $firstBranchId = DB::table('branches')->orderBy('id')->value('id');
        if ($firstBranchId !== null) {
            DB::table('users')->whereNull('branch_id')->update(['branch_id' => (int) $firstBranchId]);
        }

        $users = DB::table('users')->select(['id', 'role', 'station_department'])->get();

        foreach ($users as $user) {
            $accessRole = match ((string) $user->role) {
                'admin' => AccessRole::AdminSystem->value,
                'production_manager' => AccessRole::AdminProduction->value,
                'qc' => AccessRole::QcStaff->value,
                'worker' => match ((string) $user->station_department) {
                    'cutting' => AccessRole::CuttingStaff->value,
                    'print' => AccessRole::PrintingStaff->value,
                    'embroidery' => AccessRole::EmbroideryStaff->value,
                    'sewing' => AccessRole::SewingStaff->value,
                    'screen', 'flex' => AccessRole::ScreenFlexStaff->value,
                    default => AccessRole::DeliveryStaff->value,
                },
                default => AccessRole::Counter->value,
            };

            DB::table('users')->where('id', $user->id)->update(['access_role' => $accessRole]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (Schema::hasColumn('users', 'deleted_at')) {
                $table->dropSoftDeletes();
            }

            if (Schema::hasColumn('users', 'is_active')) {
                $table->dropIndex(['is_active']);
                $table->dropColumn('is_active');
            }

            if (Schema::hasColumn('users', 'branch_id')) {
                $table->dropConstrainedForeignId('branch_id');
            }

            if (Schema::hasColumn('users', 'access_role')) {
                $table->dropIndex(['access_role']);
                $table->dropColumn('access_role');
            }

            if (Schema::hasColumn('users', 'employee_code')) {
                $table->dropUnique(['employee_code']);
                $table->dropColumn('employee_code');
            }

            if (Schema::hasColumn('users', 'full_name')) {
                $table->dropColumn('full_name');
            }
        });
    }
};
