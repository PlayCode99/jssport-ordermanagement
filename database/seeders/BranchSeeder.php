<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Branch;
use Illuminate\Database\Seeder;

class BranchSeeder extends Seeder
{
    /**
     * Seed the branches table.
     */
    public function run(): void
    {
        $branches = [
            [
                'branch_code' => 'HQ-001',
                'branch_name' => 'Main Factory & HQ',
                'phone' => '02-100-0001',
                'address' => '100 Main Factory Road, Industrial Zone, Bangkok',
            ],
            [
                'branch_code' => 'BR-002',
                'branch_name' => 'City Sub-Branch',
                'phone' => '02-100-0002',
                'address' => '200 City Sub-Branch Road, Central District, Bangkok',
            ],
        ];

        foreach ($branches as $branch) {
            Branch::updateOrCreate(
                ['branch_code' => $branch['branch_code']],
                $branch
            );
        }
    }
}
