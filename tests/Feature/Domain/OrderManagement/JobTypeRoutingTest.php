<?php

namespace Tests\Feature\Domain\OrderManagement;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\OrderRouting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The seven job types the shop actually runs, and the rooms each one must pass
 * through. Routing is what produces the timeline, so a change here silently
 * sends work to the wrong room — these cases pin the agreed flows down.
 *
 * Station -> room: cutting=ห้องตัด, print=ห้องพิมพ์, screen=ห้องอัด,
 * flex=ห้องสกรีน เฟล๊กซ์, embroidery=ห้องปัก, sewing=ห้องเย็บ,
 * qc=ห้องตรวจสอบ, shipping=จัดส่ง.
 */
class JobTypeRoutingTest extends TestCase
{
    use RefreshDatabase;

    private function stationsFor(string $jobType): string
    {
        $customer = Customer::firstOrCreate(['customer_code' => 'CUS-RT'], ['customer_name' => 'Routing']);
        $branch = Branch::firstOrCreate(['branch_code' => 'BR-RT'], ['branch_name' => 'Routing']);
        $creator = User::factory()->create(['role' => UserRole::Sales, 'station_department' => StationDepartment::None]);

        $order = (new CreateOrderAction())->execute([
            'customer_id' => $customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'routing probe',
            'job_type' => $jobType,
            'order_date' => now()->toDateTimeString(),
            'due_date' => now()->addDays(5)->toDateTimeString(),
            'discount_percent' => 0,
            'items' => [[
                'item_type' => 'shirt', 'size_group' => 'adults', 'size_label' => 'M',
                'quantity' => 1, 'unit_price' => 10,
            ]],
        ], $creator->id);

        return OrderRouting::query()
            ->where('order_id', $order->id)
            ->where('is_required', true)
            ->orderBy('id')
            ->pluck('station_name')
            ->map(fn ($station): string => $station->value)
            ->implode(' > ');
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function jobTypeFlows(): array
    {
        return [
            'ปัก' => ['ปัก', 'cutting > embroidery > sewing > qc > shipping'],
            'ซับลิเมชั่น' => ['ซับลิเมชั่น', 'cutting > print > screen > sewing > qc > shipping'],
            'สกรีน เฟล๊กซ์' => ['สกรีน เฟล๊กซ์', 'cutting > flex > sewing > qc > shipping'],
            'ซับลิเมชั่น + ปัก' => ['ซับลิเมชั่น + ปัก', 'cutting > print > screen > embroidery > sewing > qc > shipping'],
            'ซับลิเมชั่น + ปัก + สกรีน' => ['ซับลิเมชั่น + ปัก + สกรีน', 'cutting > print > screen > flex > embroidery > sewing > qc > shipping'],
            'ซับลิเมชั่น + สกรีน' => ['ซับลิเมชั่น + สกรีน', 'cutting > print > screen > flex > sewing > qc > shipping'],
            'ปัก + สกรีน เฟล๊กซ์' => ['ปัก + สกรีน เฟล๊กซ์', 'cutting > flex > embroidery > sewing > qc > shipping'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('jobTypeFlows')]
    public function test_each_job_type_routes_through_its_agreed_rooms(string $jobType, string $expected): void
    {
        $this->assertSame($expected, $this->stationsFor($jobType));
    }

    public function test_the_catalog_names_currently_in_use_route_the_same_way(): void
    {
        // The saved catalog spells these slightly differently; the routing keys
        // off the keywords, so the flows must come out identical.
        $this->assertSame(
            'cutting > embroidery > sewing > qc > shipping',
            $this->stationsFor('งานปัก'),
        );
        $this->assertSame(
            'cutting > print > screen > embroidery > sewing > qc > shipping',
            $this->stationsFor('ซับลิเมชั่น+ปัก'),
        );
        $this->assertSame(
            'cutting > print > screen > flex > embroidery > sewing > qc > shipping',
            $this->stationsFor('ซับลิเมชั่น+ปัก+สกรีน เฟล๊กซ์'),
        );
        $this->assertSame(
            'cutting > flex > embroidery > sewing > qc > shipping',
            $this->stationsFor('ปัก+สกรีน เฟล๊กซ์'),
        );
    }

    public function test_a_job_type_with_no_production_keyword_stays_in_design(): void
    {
        $this->assertSame('design', $this->stationsFor('งานทั่วไป'));
    }

    /**
     * "เฟล็กซ์" and "เฟล๊กซ์" differ only by tone mark and both get typed. If the
     * matcher only knew one of them, a flex-only job silently skipped every
     * production room and sat in design.
     *
     * @return array<string, array{0: string}>
     */
    public static function flexSpellings(): array
    {
        return [
            'ไม้ไต่คู้' => ['เฟล็กซ์'],
            'ไม้ตรี' => ['เฟล๊กซ์'],
            'ไม่มีวรรณยุกต์' => ['เฟลกซ์'],
            'อังกฤษ' => ['flex'],
            'ปนข้อความอื่น' => ['งานเฟล๊กซ์อย่างเดียว'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('flexSpellings')]
    public function test_every_flex_spelling_reaches_the_screen_flex_room(string $jobType): void
    {
        $this->assertSame(
            'cutting > flex > sewing > qc > shipping',
            $this->stationsFor($jobType),
        );
    }

    public function test_the_seven_catalog_entries_are_the_agreed_ones(): void
    {
        $this->artisan('migrate', ['--force' => true]);

        $names = \App\Models\CatalogItem::query()
            ->where('storage_key', 'jssport.job-types')
            ->where('active', true)
            ->orderBy('item_id')
            ->pluck('name')
            ->all();

        $this->assertSame([
            'ปัก',
            'ซับลิเมชั่น',
            'สกรีน เฟล๊กซ์',
            'ซับลิเมชั่น + ปัก',
            'ซับลิเมชั่น + ปัก + สกรีน',
            'ซับลิเมชั่น + สกรีน',
            'ปัก + สกรีน เฟล๊กซ์',
        ], $names);
    }
}
