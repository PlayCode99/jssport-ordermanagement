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
        Schema::create('shirt_types', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 50)->unique();
            $table->string('name');
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedInteger('display_order')->default(0)->index();
            $table->timestamps();
        });

        $now = now();

        DB::table('shirt_types')->insert([
            [
                'code' => 'POLO',
                'name' => 'เสื้อคอโปโล',
                'is_active' => true,
                'display_order' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'V-NECK',
                'name' => 'เสื้อคอวี',
                'is_active' => true,
                'display_order' => 2,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'ROUND-NECK',
                'name' => 'เสื้อคอกลม',
                'is_active' => true,
                'display_order' => 3,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'SHIRT',
                'name' => 'เสื้อเชิ้ต',
                'is_active' => true,
                'display_order' => 4,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'HOODIE',
                'name' => 'เสื้อฮู้ด',
                'is_active' => true,
                'display_order' => 5,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'JACKET',
                'name' => 'เสื้อแจ็กเก็ต',
                'is_active' => true,
                'display_order' => 6,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('shirt_types');
    }
};
