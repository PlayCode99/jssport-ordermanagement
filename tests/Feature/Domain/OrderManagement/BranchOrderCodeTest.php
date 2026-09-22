<?php

namespace Tests\Feature\Domain\OrderManagement;

use App\Domain\OrderManagement\Actions\CreateOrderAction;
use App\Enums\StationDepartment;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Order codes are branch-based: {branch code}-{year}-{running number}. Each
 * branch counts its own bills from 00001 every year, deleted bills keep their
 * number out of circulation, and the bills opened before this scheme keep the
 * ORD-YYYY-NNNNN codes already printed on their paperwork.
 */
class BranchOrderCodeTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private User $creator;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-09-21 10:00:00', 'Asia/Bangkok'));

        $this->customer = Customer::create([
            'customer_code' => 'CUS-CODE-1',
            'customer_name' => 'ลูกค้าทดสอบเลขบิล',
        ]);

        $this->creator = User::factory()->create([
            'role' => UserRole::Sales,
            'station_department' => StationDepartment::None,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_a_bill_is_numbered_with_its_branch_code_the_year_and_a_running_number(): void
    {
        $branch = $this->branch('01', 'หนองบัวลำภู');

        $order = $this->openBill($branch);

        $this->assertSame('01-2026-00001', $order->order_code);
        $this->assertSame($branch->id, $order->branch_id);
    }

    public function test_each_branch_counts_its_own_bills(): void
    {
        $nongBuaLamphu = $this->branch('01', 'หนองบัวลำภู');
        $siBunRueang = $this->branch('02', 'ศรีบุญเรือง');

        $first = $this->openBill($nongBuaLamphu);
        $second = $this->openBill($nongBuaLamphu);
        $otherBranch = $this->openBill($siBunRueang);
        $third = $this->openBill($nongBuaLamphu);

        $this->assertSame('01-2026-00001', $first->order_code);
        $this->assertSame('01-2026-00002', $second->order_code);
        // The other branch starts its own count; it does not take 00003.
        $this->assertSame('02-2026-00001', $otherBranch->order_code);
        $this->assertSame('01-2026-00003', $third->order_code);
    }

    public function test_the_running_number_starts_again_each_year(): void
    {
        $branch = $this->branch('01', 'หนองบัวลำภู');

        $this->openBill($branch);
        $lastOfTheYear = $this->openBill($branch);

        Carbon::setTestNow(Carbon::parse('2027-01-02 09:00:00', 'Asia/Bangkok'));
        $firstOfNextYear = $this->openBill($branch);

        $this->assertSame('01-2026-00002', $lastOfTheYear->order_code);
        $this->assertSame('01-2027-00001', $firstOfNextYear->order_code);
    }

    public function test_the_year_follows_the_shop_clock_not_utc(): void
    {
        $branch = $this->branch('01', 'หนองบัวลำภู');

        // 00:30 on New Year's Day in Bangkok is still 17:30 on 31 December in UTC.
        Carbon::setTestNow(Carbon::parse('2027-01-01 00:30:00', 'Asia/Bangkok'));
        $order = $this->openBill($branch);

        $this->assertSame('01-2027-00001', $order->order_code);
        $this->assertSame('2027', $order->order_date->format('Y'));
    }

    public function test_a_deleted_bill_keeps_its_number_out_of_circulation(): void
    {
        $branch = $this->branch('01', 'หนองบัวลำภู');

        $this->openBill($branch);
        $deleted = $this->openBill($branch);
        $deleted->delete();

        $next = $this->openBill($branch);

        $this->assertSame('01-2026-00002', $deleted->order_code);
        $this->assertSame('01-2026-00003', $next->order_code);
        $this->assertSoftDeleted('orders', ['order_code' => '01-2026-00002']);
    }

    public function test_bills_opened_under_the_old_scheme_keep_their_codes_and_do_not_shift_the_count(): void
    {
        $branch = $this->branch('01', 'หนองบัวลำภู');

        $legacy = $this->openBill($branch);
        $legacy->forceFill(['order_code' => 'ORD-2026-00024'])->save();

        $order = $this->openBill($branch);

        $this->assertSame('ORD-2026-00024', $legacy->fresh()->order_code);
        // The old bill is this branch's, but its code is not in the new series,
        // so the series starts at 00001 rather than continuing from 24.
        $this->assertSame('01-2026-00001', $order->order_code);
    }

    public function test_the_count_continues_from_the_highest_number_even_after_a_gap(): void
    {
        $branch = $this->branch('01', 'หนองบัวลำภู');

        $first = $this->openBill($branch);
        // A number hand-edited far ahead of the sequence still moves the count on.
        $first->forceFill(['order_code' => '01-2026-00120'])->save();

        $order = $this->openBill($branch);

        $this->assertSame('01-2026-00121', $order->order_code);
    }

    public function test_a_branch_code_that_prefixes_another_never_shares_a_series(): void
    {
        $short = $this->branch('1', 'สาขาหนึ่ง');
        $long = $this->branch('11', 'สาขาสิบเอ็ด');

        $this->openBill($long);
        $this->openBill($long);
        $order = $this->openBill($short);

        $this->assertSame('1-2026-00001', $order->order_code);
    }

    public function test_the_new_code_is_carried_through_the_counter_and_production_pages(): void
    {
        $branch = $this->branch('03', 'เมืองเลย');
        $order = $this->openBill($branch);

        $this->actingAs($this->creator)
            ->get('/counter?search=03-2026-00001')
            ->assertOk()
            ->assertSee('03-2026-00001');

        $this->actingAs($this->creator)
            ->get('/production/kanban')
            ->assertOk()
            ->assertSee($order->order_code);
    }

    private function branch(string $code, string $name): Branch
    {
        return Branch::create([
            'branch_code' => $code,
            'branch_name' => $name,
        ]);
    }

    private function openBill(Branch $branch): Order
    {
        return (new CreateOrderAction)->execute([
            'customer_id' => $this->customer->id,
            'branch_id' => $branch->id,
            'job_name' => 'งานทดสอบเลขบิล',
            'job_type' => 'งานปัก',
            'due_date' => Carbon::now('Asia/Bangkok')->addDays(7)->format('Y-m-d'),
            'discount_percent' => 0,
            'items' => [
                [
                    'item_type' => 'shirt',
                    'size_group' => 'adults',
                    'size_label' => 'L',
                    'quantity' => 10,
                    'unit_price' => 50,
                ],
            ],
        ], $this->creator->id);
    }
}
