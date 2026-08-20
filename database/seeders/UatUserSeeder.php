<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use App\Support\UserAccessControl;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class UatUserSeeder extends Seeder
{
    public function run(): void
    {
        $this->guardEnvironment();

        $branch01 = $this->resolveBranch01NongBuaLamphu();
        $branch02 = $this->resolveBranch02($branch01->id);

        $rows = [
            [
                'full_name' => 'UAT Owner Branch 01',
                'employee_code' => 'UAT-OWNER-01',
                'email' => 'uat.owner01@garment-erp.local',
                'password' => 'password',
                'role' => UserRole::Admin,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::Owner,
                'branch_id' => (int) $branch01->id,
                'is_active' => true,
            ],
            [
                'full_name' => 'UAT Admin System Branch 01',
                'employee_code' => 'UAT-ADMSYS-01',
                'email' => 'uat.adminsystem01@garment-erp.local',
                'password' => 'password',
                'role' => UserRole::Admin,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::AdminSystem,
                'branch_id' => (int) $branch01->id,
                'is_active' => true,
            ],
            [
                'full_name' => 'UAT Admin System Branch 02',
                'employee_code' => 'UAT-ADMSYS-02',
                'email' => 'uat.adminsystem02@garment-erp.local',
                'password' => 'password',
                'role' => UserRole::Admin,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::AdminSystem,
                'branch_id' => (int) $branch02->id,
                'is_active' => true,
            ],
            [
                'full_name' => 'UAT Counter Branch 02',
                'employee_code' => 'UAT-COUNTER-02',
                'email' => 'uat.counter02@garment-erp.local',
                'password' => 'password',
                'role' => UserRole::Sales,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::Counter,
                'branch_id' => (int) $branch02->id,
                'is_active' => true,
            ],
            [
                'full_name' => 'UAT Admin Production Branch 02',
                'employee_code' => 'UAT-ADMPROD-02',
                'email' => 'uat.adminproduction02@garment-erp.local',
                'password' => 'password',
                'role' => UserRole::ProductionManager,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::AdminProduction,
                'branch_id' => (int) $branch02->id,
                'is_active' => true,
            ],
            [
                'full_name' => 'UAT QC Staff Branch 02',
                'employee_code' => 'UAT-QC-02',
                'email' => 'uat.qc02@garment-erp.local',
                'password' => 'password',
                'role' => UserRole::Qc,
                'station_department' => StationDepartment::Qc,
                'access_role' => AccessRole::QcStaff,
                'branch_id' => (int) $branch02->id,
                'is_active' => true,
            ],
            [
                'full_name' => 'UAT Delivery Staff Branch 02',
                'employee_code' => 'UAT-DELIVERY-02',
                'email' => 'uat.delivery02@garment-erp.local',
                'password' => 'password',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::DeliveryStaff,
                'branch_id' => (int) $branch02->id,
                'is_active' => true,
            ],
        ];

        $resultRows = [];

        DB::transaction(function () use ($rows, &$resultRows): void {
            foreach ($rows as $row) {
                $user = User::query()->where('employee_code', $row['employee_code'])->first();
                $created = $user === null;

                $attributes = [
                    'name' => $row['full_name'],
                    'full_name' => $row['full_name'],
                    'employee_code' => $row['employee_code'],
                    'email' => $row['email'],
                    'password' => Hash::make($row['password']),
                    'role' => $row['role'],
                    'station_department' => $row['station_department'],
                    'access_role' => $row['access_role'],
                    'branch_id' => $row['branch_id'],
                    'is_active' => $row['is_active'],
                ];

                if ($user === null) {
                    $user = User::query()->create($attributes);
                } else {
                    $user->fill($attributes);
                    $user->save();
                }

                $branch = Branch::query()->findOrFail($user->branch_id);

                $resultRows[] = [
                    $created ? 'CREATED' : 'UPDATED',
                    (string) $user->full_name,
                    (string) $user->employee_code,
                    (string) $user->access_role->value,
                    sprintf('%s (%s)', (string) $branch->branch_name, (string) $branch->branch_code),
                    $user->is_active ? 'active' : 'inactive',
                ];
            }
        });

        if ($this->command !== null) {
            $this->command->table(
                ['result', 'full_name', 'employee_code', 'role', 'branch', 'status'],
                $resultRows,
            );

            $this->command->newLine();
            $this->command->info('UAT user seed completed successfully.');
            $this->command->line('Run this seeder with: php artisan db:seed --class=Database\\Seeders\\UatUserSeeder');
        }
    }

    private function guardEnvironment(): void
    {
        if (! app()->environment(['local', 'staging'])) {
            throw new RuntimeException(
                sprintf('UatUserSeeder is blocked in "%s" environment. Allowed: local, staging.', app()->environment()),
            );
        }
    }

    private function resolveBranch01NongBuaLamphu(): Branch
    {
        $branch = Branch::query()
            ->get(['id', 'branch_code', 'branch_name'])
            ->first(function (Branch $branch): bool {
                $normalizedCode = UserAccessControl::normalizedBranchCode((string) $branch->branch_code);
                $normalizedName = mb_strtolower((string) $branch->branch_name);

                $isBranch01 = $normalizedCode === '01';
                $isNongBuaLamphu = str_contains($normalizedName, 'หนองบัวลำภู')
                    || str_contains($normalizedName, 'nong bua lamphu');

                return $isBranch01 && $isNongBuaLamphu;
            });

        if ($branch === null) {
            throw new RuntimeException(
                'Missing required branch "01 หนองบัวลำภู". Seed was aborted. Please ensure this real branch exists in branches table before running UAT seeder.',
            );
        }

        return $branch;
    }

    private function resolveBranch02(int $branch01Id): Branch
    {
        $branch = Branch::query()
            ->get(['id', 'branch_code', 'branch_name'])
            ->first(function (Branch $branch) use ($branch01Id): bool {
                $normalizedCode = UserAccessControl::normalizedBranchCode((string) $branch->branch_code);

                return (int) $branch->id !== $branch01Id && $normalizedCode === '02';
            });

        if ($branch === null) {
            throw new RuntimeException(
                'Missing required branch with code 02 in branches table. Seed was aborted. Please ensure a real branch with code 02 exists before running UAT seeder.',
            );
        }

        return $branch;
    }
}
