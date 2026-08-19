<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Support\UserAccessControl;
use Illuminate\Database\QueryException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class BranchManagementController extends Controller
{
    public function index(Request $request): Response
    {
        $query = Branch::query()
            ->orderBy('branch_name')
            ->orderBy('id');

        UserAccessControl::applyBranchScope($query, $request->user(), 'id');

        $branches = $query
            ->get(['id', 'branch_code', 'branch_name', 'phone', 'address'])
            ->map(fn (Branch $branch): array => [
                'id' => (int) $branch->id,
                'branch_code' => (string) $branch->branch_code,
                'branch_name' => (string) $branch->branch_name,
                'phone' => (string) ($branch->phone ?? ''),
                'address' => (string) ($branch->address ?? ''),
            ])
            ->values();

        return Inertia::render('settings/data/branches/index', [
            'branches' => $branches,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        if (! UserAccessControl::hasCrossBranchAccess($request->user())) {
            abort(403);
        }

        $validated = $request->validate([
            'branch_code' => ['required', 'string', 'max:50', Rule::unique('branches', 'branch_code')],
            'branch_name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:1000'],
        ], [
            'branch_code.required' => 'กรุณากรอกรหัสสาขา',
            'branch_code.unique' => 'รหัสสาขานี้มีอยู่แล้ว',
            'branch_name.required' => 'กรุณากรอกชื่อสาขา',
        ]);

        Branch::query()->create([
            'branch_code' => trim((string) $validated['branch_code']),
            'branch_name' => trim((string) $validated['branch_name']),
            'phone' => trim((string) ($validated['phone'] ?? '')),
            'address' => trim((string) ($validated['address'] ?? '')),
        ]);

        return back()->with('success', 'สร้างสาขาเรียบร้อยแล้ว');
    }

    public function update(Request $request, Branch $branch): RedirectResponse
    {
        $this->ensureBranchAccessible($request, $branch);

        $validated = $request->validate([
            'branch_code' => ['required', 'string', 'max:50', Rule::unique('branches', 'branch_code')->ignore($branch->id)],
            'branch_name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:1000'],
        ], [
            'branch_code.required' => 'กรุณากรอกรหัสสาขา',
            'branch_code.unique' => 'รหัสสาขานี้มีอยู่แล้ว',
            'branch_name.required' => 'กรุณากรอกชื่อสาขา',
        ]);

        $branch->update([
            'branch_code' => trim((string) $validated['branch_code']),
            'branch_name' => trim((string) $validated['branch_name']),
            'phone' => trim((string) ($validated['phone'] ?? '')),
            'address' => trim((string) ($validated['address'] ?? '')),
        ]);

        return back()->with('success', 'อัปเดตข้อมูลสาขาเรียบร้อยแล้ว');
    }

    public function destroy(Branch $branch): RedirectResponse
    {
        $this->ensureBranchAccessible(request(), $branch);

        try {
            $branch->delete();
        } catch (QueryException) {
            return back()->withErrors([
                'branch' => 'ไม่สามารถลบสาขานี้ได้ เนื่องจากมีข้อมูลที่อ้างอิงอยู่ในระบบ',
            ]);
        }

        return back()->with('success', 'ลบสาขาเรียบร้อยแล้ว');
    }

    private function ensureBranchAccessible(Request $request, Branch $branch): void
    {
        if (! UserAccessControl::canAccessBranch($request->user(), (int) $branch->id)) {
            abort(403);
        }
    }
}
