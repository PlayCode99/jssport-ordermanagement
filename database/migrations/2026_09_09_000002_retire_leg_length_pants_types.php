<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Leg length used to be asked twice: once as the order-wide pants type
     * (กางเกงขาสั้น / กางเกงขายาว) and again per size row. The row is now the
     * single source of truth, and the pants type only picks the labour rate, so
     * the two length-shaped types collapse into one.
     *
     * Existing orders are untouched: every one of them already carries its own
     * rate snapshot, including the type name it was booked under, so their
     * sheets and costs stay exactly as they were.
     */
    public function up(): void
    {
        // Nothing has ever been ordered against the long-leg type, so retiring
        // it removes a choice rather than history. Deactivated rather than
        // deleted: garment_operations references it with restrictOnDelete.
        DB::table('garment_types')
            ->where('code', 'LONG-PANTS')
            ->update(['is_active' => false, 'updated_at' => now()]);

        DB::table('garment_types')
            ->where('code', 'SHORTS')
            ->where('name', 'กางเกงขาสั้น')
            ->update(['name' => 'กางเกง', 'updated_at' => now()]);
    }

    public function down(): void
    {
        DB::table('garment_types')
            ->where('code', 'SHORTS')
            ->where('name', 'กางเกง')
            ->update(['name' => 'กางเกงขาสั้น', 'updated_at' => now()]);

        DB::table('garment_types')
            ->where('code', 'LONG-PANTS')
            ->update(['is_active' => true, 'updated_at' => now()]);
    }
};
