<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Orders still carry the job type text they were saved with, from before the
 * catalog was standardised on seven agreed names. The owner dashboard groups by
 * that text, so "งานปัก" and "ปัก" showed up as two separate rows for what is
 * one kind of work.
 *
 * Renaming is safe for routing: an order's stations were resolved when it was
 * created and are stored on order_routings. It is also safe for the counter's
 * floor cards, which only read this text to tell ห้องอัด from ห้องสกรีนเฟล๊กซ์
 * by looking for "ซับ" — and every mapping below keeps that word present or
 * absent exactly as it was.
 */
return new class extends Migration
{
    /**
     * @var array<string, string>
     */
    private const RENAMES = [
        'งานปัก' => 'ปัก',
        'ซับลิเมชั่น+ปัก' => 'ซับลิเมชั่น + ปัก',
        'ซับลิเมชั่น+ปัก+สกรีน เฟล๊กซ์' => 'ซับลิเมชั่น + ปัก + สกรีน',
        'ปัก+สกรีน เฟล๊กซ์' => 'ปัก + สกรีน เฟล๊กซ์',
        'ซับลิเมชั่น+สกรีน' => 'ซับลิเมชั่น + สกรีน',
        'งานสกรีน' => 'สกรีน เฟล๊กซ์',
        'ซับลิเมชั่น' => 'ซับลิเมชั่น',
    ];

    public function up(): void
    {
        foreach (self::RENAMES as $from => $to) {
            if ($from === $to) {
                continue;
            }

            DB::table('orders')->where('job_type', $from)->update(['job_type' => $to]);
        }
    }

    /**
     * Deliberately not reversible: the old spellings were inconsistent free
     * text, and restoring them would only reintroduce the duplicate rows.
     */
    public function down(): void
    {
        //
    }
};
