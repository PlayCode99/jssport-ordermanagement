<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A garment is made to a length, and the length decides the work: a
     * sleeveless shirt has no sleeve to attach and no cuff to hem, and it has
     * an armhole to bind that the others do not. The steps hang off the
     * garment already — what was missing was the length that tells you which
     * set of steps you are looking at.
     *
     * Nullable on purpose. Everything the shop has priced so far was entered
     * before lengths were recorded, and those rates apply whatever the length;
     * saying "แขนสั้น" for them would be inventing a fact. A garment with no
     * length keeps pricing every bill exactly as it does today.
     */
    public function up(): void
    {
        Schema::table('garment_types', function (Blueprint $table): void {
            $table->string('style', 20)->nullable()->after('category');
        });
    }

    public function down(): void
    {
        Schema::table('garment_types', function (Blueprint $table): void {
            $table->dropColumn('style');
        });
    }
};
