<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A second price per size group, for when the garment was a long one.
     *
     * It was added while one garment type covered both lengths: a shirt was a
     * shirt, and the sheet said whether its sleeves were short or long, so the
     * rate table needed somewhere to put the difference.
     *
     * A garment type now carries its own length, and the order form will only
     * offer a long one for a long sheet. So a short type's long price could
     * never be read, and a long type's ordinary price could never be read
     * either — the costing looked at the long column first and only fell back
     * when it was empty. Two columns describing one thing, with the live one
     * depending on which type you were looking at.
     *
     * It was also a trap. A zero typed into the long column of a long type
     * silently replaced a real price sitting in the column beside it, and a
     * whole production sheet costed at nothing; that happened once already.
     *
     * Nothing is lost by dropping them: across all 22 operations, every long
     * price was empty, and across the rate snapshots of every booked order,
     * all 1,284 long-price entries were null. The shop has never priced a
     * length separately since the split.
     */
    public function up(): void
    {
        Schema::table('garment_operations', function (Blueprint $table): void {
            $table->dropColumn(['child_price_long', 'adult_price_long']);
        });
    }

    /**
     * Put them back empty, which is how they were in every row.
     */
    public function down(): void
    {
        Schema::table('garment_operations', function (Blueprint $table): void {
            $table->decimal('child_price_long', 8, 2)->nullable()->after('child_price');
            $table->decimal('adult_price_long', 8, 2)->nullable()->after('adult_price');
        });
    }
};
