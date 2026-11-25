<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The lengths a garment is cut to, as data the shop owns rather than three
 * words written into the code.
 *
 * A length is not decoration: it decides the work (a sleeveless shirt has no
 * sleeve to attach and an armhole to bind instead), it splits the bill into
 * production sheets keyed `{garment}_{tier}_{length}`, and artwork is pinned
 * to those sheets. So the shop could not sell a three-quarter sleeve at all —
 * not because the database refused it, but because 'short', 'long' and
 * 'sleeveless' were spelled out in the validation, the sheet keys and every
 * label. This table is where they live now.
 *
 * `code` is the machine name: it is what a bill stores in
 * order_items.shirt_style, what a sheet key is built from, and what every
 * bill already on file carries. The five rows seeded below use exactly the
 * codes the shop has been writing, so nothing printed before this migration
 * reads any differently after it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('garment_styles', function (Blueprint $table): void {
            $table->id();
            $table->string('category', 10);
            // Kept short and ASCII: it ends up inside sheet keys and in a
            // column on every order line.
            $table->string('code', 20);
            $table->string('name');
            $table->unsignedSmallInteger('display_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            // A shirt's lengths and a pair of trousers' are separate lists,
            // so each may use the same code for its own.
            $table->unique(['category', 'code']);
            $table->index(['category', 'display_order']);
        });

        $now = now();

        // The lengths the shop has always had, under the codes its bills
        // already carry. Seeded here rather than in a seeder because every
        // existing bill depends on them being present.
        DB::table('garment_styles')->insert([
            ['category' => 'SHIRT', 'code' => 'short', 'name' => 'แขนสั้น', 'display_order' => 1, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['category' => 'SHIRT', 'code' => 'long', 'name' => 'แขนยาว', 'display_order' => 2, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['category' => 'SHIRT', 'code' => 'sleeveless', 'name' => 'แขนกุด', 'display_order' => 3, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['category' => 'PANTS', 'code' => 'short', 'name' => 'ขาสั้น', 'display_order' => 1, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['category' => 'PANTS', 'code' => 'long', 'name' => 'ขายาว', 'display_order' => 2, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('garment_styles');
    }
};
