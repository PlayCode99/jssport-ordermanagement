<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\AccessRole;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Seed the application's users.
     */
    public function run(): void
    {
        $primaryBranch = Branch::query()->orderBy('id')->first();
        $secondaryBranch = Branch::query()->orderByDesc('id')->first();

        $users = [
            [
                'name' => 'System Admin',
                'email' => 'admin@garment-erp.local',
                'role' => UserRole::Admin,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::AdminSystem,
                'branch_id' => $primaryBranch?->id,
                'employee_code' => 'EMP-ADMIN-001',
            ],
            [
                'name' => 'Sales Rep 01',
                'email' => 'sales01@garment-erp.local',
                'role' => UserRole::Sales,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::Counter,
                'branch_id' => $primaryBranch?->id,
                'employee_code' => 'EMP-SALES-001',
            ],
            [
                'name' => 'Sales Rep 02',
                'email' => 'sales02@garment-erp.local',
                'role' => UserRole::Sales,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::Counter,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-SALES-002',
            ],
            [
                'name' => 'Graphic Designer 01',
                'email' => 'designer01@garment-erp.local',
                'role' => UserRole::Designer,
                'station_department' => StationDepartment::Design,
                'access_role' => AccessRole::AdminSystem,
                'branch_id' => $primaryBranch?->id,
                'employee_code' => 'EMP-DESIGN-001',
            ],
            [
                'name' => 'Graphic Designer 02',
                'email' => 'designer02@garment-erp.local',
                'role' => UserRole::Designer,
                'station_department' => StationDepartment::Design,
                'access_role' => AccessRole::AdminSystem,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-DESIGN-002',
            ],
            [
                'name' => 'Production Manager',
                'email' => 'production.manager@garment-erp.local',
                'role' => UserRole::ProductionManager,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::AdminProduction,
                'branch_id' => $primaryBranch?->id,
                'employee_code' => 'EMP-PROD-001',
            ],
            [
                'name' => 'Print Worker 01',
                'email' => 'print01@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Print,
                'access_role' => AccessRole::PrintingStaff,
                'branch_id' => $primaryBranch?->id,
                'employee_code' => 'EMP-PRN-001',
            ],
            [
                'name' => 'Print Worker 02',
                'email' => 'print02@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Print,
                'access_role' => AccessRole::PrintingStaff,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-PRN-002',
            ],
            [
                'name' => 'Embroidery Worker 01',
                'email' => 'embroidery01@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Embroidery,
                'access_role' => AccessRole::EmbroideryStaff,
                'branch_id' => $primaryBranch?->id,
                'employee_code' => 'EMP-EMB-001',
            ],
            [
                'name' => 'Embroidery Worker 02',
                'email' => 'embroidery02@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Embroidery,
                'access_role' => AccessRole::EmbroideryStaff,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-EMB-002',
            ],
            [
                'name' => 'Fabric Cutter 01',
                'email' => 'cutter01@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Cutting,
                'access_role' => AccessRole::CuttingStaff,
                'branch_id' => $primaryBranch?->id,
                'employee_code' => 'EMP-CUT-001',
            ],
            [
                'name' => 'Fabric Cutter 02',
                'email' => 'cutter02@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Cutting,
                'access_role' => AccessRole::CuttingStaff,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-CUT-002',
            ],
            [
                'name' => 'Fabric Cutter 03',
                'email' => 'cutter03@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Cutting,
                'access_role' => AccessRole::CuttingStaff,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-CUT-003',
            ],
            [
                'name' => 'Sewing Worker 01',
                'email' => 'sewing01@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Sewing,
                'access_role' => AccessRole::SewingStaff,
                'branch_id' => $primaryBranch?->id,
                'employee_code' => 'EMP-SEW-001',
            ],
            [
                'name' => 'Sewing Worker 02',
                'email' => 'sewing02@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Sewing,
                'access_role' => AccessRole::SewingStaff,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-SEW-002',
            ],
            [
                'name' => 'Sewing Worker 03',
                'email' => 'sewing03@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Sewing,
                'access_role' => AccessRole::SewingStaff,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-SEW-003',
            ],
            [
                'name' => 'Sewing Worker 04',
                'email' => 'sewing04@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Sewing,
                'access_role' => AccessRole::SewingStaff,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-SEW-004',
            ],
            [
                'name' => 'Sewing Worker 05',
                'email' => 'sewing05@garment-erp.local',
                'role' => UserRole::Worker,
                'station_department' => StationDepartment::Sewing,
                'access_role' => AccessRole::SewingStaff,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-SEW-005',
            ],
            [
                'name' => 'QC Inspector 01',
                'email' => 'qc01@garment-erp.local',
                'role' => UserRole::Qc,
                'station_department' => StationDepartment::Qc,
                'access_role' => AccessRole::QcStaff,
                'branch_id' => $primaryBranch?->id,
                'employee_code' => 'EMP-QC-001',
            ],
            [
                'name' => 'QC Inspector 02',
                'email' => 'qc02@garment-erp.local',
                'role' => UserRole::Qc,
                'station_department' => StationDepartment::Qc,
                'access_role' => AccessRole::QcStaff,
                'branch_id' => $secondaryBranch?->id,
                'employee_code' => 'EMP-QC-002',
            ],
            [
                'name' => 'Finance Cashier',
                'email' => 'finance@garment-erp.local',
                'role' => UserRole::Finance,
                'station_department' => StationDepartment::None,
                'access_role' => AccessRole::Counter,
                'branch_id' => $primaryBranch?->id,
                'employee_code' => 'EMP-FIN-001',
            ],
        ];

        foreach ($users as $user) {
            User::updateOrCreate(
                ['email' => $user['email']],
                [
                    'name' => $user['name'],
                    'full_name' => $user['name'],
                    'password' => Hash::make('password'),
                    'role' => $user['role'],
                    'station_department' => $user['station_department'],
                    'access_role' => $user['access_role'],
                    'branch_id' => $user['branch_id'],
                    'employee_code' => $user['employee_code'],
                    'is_active' => true,
                ]
            );
        }
    }
}
