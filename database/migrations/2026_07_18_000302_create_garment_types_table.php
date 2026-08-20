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
        Schema::create('garment_types', function (Blueprint $table): void {
            $table->id();
            $table->enum('category', ['SHIRT', 'PANTS'])->index();
            $table->string('code', 50)->unique();
            $table->string('name');
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedInteger('display_order')->default(0)->index();
            $table->timestamps();
        });

        $now = now();

        DB::table('garment_types')->insert([
            [
                'category' => 'SHIRT',
                'code' => 'POLO',
                'name' => 'เสื้อโปโล',
                'is_active' => true,
                'display_order' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'category' => 'SHIRT',
                'code' => 'ROUND-NECK',
                'name' => 'เสื้อคอกลม',
                'is_active' => true,
                'display_order' => 2,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'category' => 'SHIRT',
                'code' => 'V-NECK',
                'name' => 'เสื้อคอวี',
                'is_active' => true,
                'display_order' => 3,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'category' => 'PANTS',
                'code' => 'SHORTS',
                'name' => 'กางเกงขาสั้น',
                'is_active' => true,
                'display_order' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'category' => 'PANTS',
                'code' => 'LONG-PANTS',
                'name' => 'กางเกงขายาว',
                'is_active' => true,
                'display_order' => 2,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('garment_types');
    }
};
