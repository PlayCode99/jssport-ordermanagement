<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sewing_operations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shirt_type_id')
                ->constrained('shirt_types')
                ->restrictOnDelete();
            $table->enum('target_group', ['ADULT', 'CHILD'])->index();
            $table->string('name');
            $table->decimal('price', 8, 2);
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedInteger('display_order')->default(0)->index();
            $table->timestamps();

            $table->unique(['shirt_type_id', 'target_group', 'name'], 'sewing_operations_unique_name_group');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sewing_operations');
    }
};
