<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * A length is not optional. It decides the work — a sleeveless shirt has
     * no sleeve to attach and no cuff to hem — so a garment without one says
     * nothing about what it costs to make.
     *
     * The garments entered before lengths were recorded are given the one they
     * already are, rather than a guess:
     *
     *  - anything whose name says ขายาว is long, because it says so;
     *  - everything else is the base length, because the base price columns
     *    are what the costing already charges every batch that is not long.
     */
    public function up(): void
    {
        DB::table('garment_types')
            ->whereNull('style')
            ->where('name', 'like', '%ยาว%')
            ->update(['style' => 'long']);

        DB::table('garment_types')
            ->whereNull('style')
            ->update(['style' => 'short']);
    }

    public function down(): void
    {
        // Nothing to undo: the column itself is dropped by the migration that
        // added it, and no length recorded here was invented.
    }
};
