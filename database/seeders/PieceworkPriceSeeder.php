<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\PieceworkPrice;
use Illuminate\Database\Seeder;

class PieceworkPriceSeeder extends Seeder
{
    /**
     * Seed standard piecework wage master data.
     */
    public function run(): void
    {
        $prices = [
            [
                'code' => 'SEW-COL-01',
                'name' => 'Sewing Standard T-Shirt Collar',
                'price_per_unit' => 15.00,
            ],
            [
                'code' => 'SEW-POL-01',
                'name' => 'Sewing Polo Placket & Buttons',
                'price_per_unit' => 25.50,
            ],
            [
                'code' => 'SEW-SLV-01',
                'name' => 'Sewing Sleeves & Hems',
                'price_per_unit' => 12.00,
            ],
            [
                'code' => 'CUT-SHT-01',
                'name' => 'Fabric Cutting Standard Shirt',
                'price_per_unit' => 3.50,
            ],
            [
                'code' => 'CUT-SET-01',
                'name' => 'Fabric Cutting Oversize Set',
                'price_per_unit' => 6.00,
            ],
            [
                'code' => 'PRN-SUB-01',
                'name' => 'Sublimation Heat Transfer per piece',
                'price_per_unit' => 8.00,
            ],
            [
                'code' => 'EMB-LOG-01',
                'name' => 'Embroidery Left Chest Logo',
                'price_per_unit' => 12.50,
            ],
            [
                'code' => 'SCR-2CL-01',
                'name' => 'Screen Printing 2 Colors',
                'price_per_unit' => 7.00,
            ],
        ];

        foreach ($prices as $price) {
            PieceworkPrice::updateOrCreate(
                ['code' => $price['code']],
                $price
            );
        }
    }
}
