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
        Schema::create('garment_operations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('garment_type_id')
                ->constrained('garment_types')
                ->restrictOnDelete();
            $table->string('name');
            $table->decimal('child_price', 8, 2);
            $table->decimal('adult_price', 8, 2);
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedInteger('display_order')->default(0)->index();
            $table->timestamps();

            $table->unique(['garment_type_id', 'name'], 'garment_operations_unique_name');
        });

        $now = now();
        $poloTypeId = DB::table('garment_types')->where('code', 'POLO')->value('id');

        if (is_int($poloTypeId)) {
            DB::table('garment_operations')->insert([
                [
                    'garment_type_id' => $poloTypeId,
                    'name' => 'กลับปก+ทับปกบน',
                    'child_price' => 5.00,
                    'adult_price' => 8.00,
                    'is_active' => true,
                    'display_order' => 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('garment_operations');
    }
};
