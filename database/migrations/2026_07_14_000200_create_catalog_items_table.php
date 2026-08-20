<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_items', function (Blueprint $table): void {
            $table->id();
            $table->string('storage_key')->index();
            $table->unsignedBigInteger('item_id');
            $table->string('name');
            $table->string('created_by')->nullable();
            $table->boolean('active')->default(true)->index();
            $table->timestamps();

            $table->unique(['storage_key', 'item_id']);
        });

        $now = now();
        $rows = [
            ['storage_key' => 'jssport.shirt-patterns', 'item_id' => 1, 'name' => 'แพทเทิร์นมาตรฐาน'],
            ['storage_key' => 'jssport.shirt-patterns', 'item_id' => 2, 'name' => 'แพทเทิร์นเข้ารูป'],
            ['storage_key' => 'jssport.shirt-fabrics', 'item_id' => 1, 'name' => 'TK'],
            ['storage_key' => 'jssport.shirt-fabrics', 'item_id' => 2, 'name' => 'Micro'],
            ['storage_key' => 'jssport.shirt-colors', 'item_id' => 1, 'name' => 'ขาว'],
            ['storage_key' => 'jssport.shirt-colors', 'item_id' => 2, 'name' => 'กรมท่า'],
            ['storage_key' => 'jssport.shirt-colors', 'item_id' => 3, 'name' => 'ดำ'],
            ['storage_key' => 'jssport.shirt-colors', 'item_id' => 4, 'name' => 'แดง'],
            ['storage_key' => 'jssport.shirt-collars', 'item_id' => 1, 'name' => 'คอกลม'],
            ['storage_key' => 'jssport.shirt-collars', 'item_id' => 2, 'name' => 'คอวี'],
            ['storage_key' => 'jssport.shirt-plackets', 'item_id' => 1, 'name' => 'สาบซ่อน'],
            ['storage_key' => 'jssport.shirt-plackets', 'item_id' => 2, 'name' => 'สาบโชว์'],
            ['storage_key' => 'jssport.shirt-cuffs', 'item_id' => 1, 'name' => 'ปลายแขนจั๊ม'],
            ['storage_key' => 'jssport.shirt-cuffs', 'item_id' => 2, 'name' => 'ปลายแขนตรง'],
            ['storage_key' => 'jssport.shirt-panels', 'item_id' => 1, 'name' => 'ต่อข้าง'],
            ['storage_key' => 'jssport.shirt-panels', 'item_id' => 2, 'name' => 'ต่อหน้าอก'],
            ['storage_key' => 'jssport.shirt-sublimation', 'item_id' => 1, 'name' => 'เต็มตัว'],
            ['storage_key' => 'jssport.shirt-sublimation', 'item_id' => 2, 'name' => 'เฉพาะจุด'],
            ['storage_key' => 'jssport.pants-patterns', 'item_id' => 1, 'name' => 'ขาสั้นมาตรฐาน'],
            ['storage_key' => 'jssport.pants-patterns', 'item_id' => 2, 'name' => 'ขายาว'],
            ['storage_key' => 'jssport.pants-leg-style', 'item_id' => 1, 'name' => 'ขาตรง'],
            ['storage_key' => 'jssport.pants-leg-style', 'item_id' => 2, 'name' => 'ขาจั๊ม'],
            ['storage_key' => 'jssport.pants-leg-hem', 'item_id' => 1, 'name' => 'ปลายตรง'],
            ['storage_key' => 'jssport.pants-leg-hem', 'item_id' => 2, 'name' => 'ปลายยาง'],
        ];

        DB::table('catalog_items')->insert(array_map(static fn (array $row): array => [
            ...$row,
            'created_by' => 'system',
            'active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ], $rows));
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_items');
    }
};
