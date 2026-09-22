<?php

namespace App\Http\Controllers;

use App\Models\CatalogItem;
use App\Support\UserAccessControl;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ShirtCatalogController extends Controller
{
    /**
     * Rows come back in the catalog's own order — the position the shop put
     * each entry in — so a screen that lets the shop reorder (the size lists)
     * shows the list the way the order form will. Screens that sort by date
     * themselves are unaffected.
     *
     * @return array<int, array{id: int, createdAt: string, name: string, createdBy: string, active: bool}>
     */
    private function loadCatalogRows(string $storageKey): array
    {
        return CatalogItem::query()
            ->where('storage_key', $storageKey)
            ->orderBy('sort_order')
            ->orderBy('item_id')
            ->get()
            ->map(fn (CatalogItem $item): array => [
                'id' => (int) $item->item_id,
                'createdAt' => $item->created_at?->toIso8601String() ?? now()->toIso8601String(),
                'name' => $item->name,
                'createdBy' => $item->created_by ?? '-',
                'active' => (bool) $item->active,
            ])
            ->values()
            ->all();
    }

    /**
     * Catalogs the shop puts in an order of its own on the settings page. The
     * order form lists these exactly as arranged there.
     */
    public const SORTABLE_STORAGE_KEYS = [
        self::SIZE_KIDS_STORAGE_KEY,
        self::SIZE_ADULTS_STORAGE_KEY,
    ];

    public const SIZE_KIDS_STORAGE_KEY = 'jssport.size-kids';

    public const SIZE_ADULTS_STORAGE_KEY = 'jssport.size-adults';

    /**
     * The catalogs behind the sewing-spec fields on the order form. The form
     * is the one place these are managed from: anyone opening a bill can add
     * to them, and an owner or system admin can rename or hide an entry.
     */
    public const SPEC_CATALOG_STORAGE_KEYS = [
        'jssport.shirt-patterns',
        'jssport.shirt-fabrics',
        'jssport.shirt-fabric-colors',
        'jssport.shirt-collars',
        'jssport.shirt-neck-colors',
        'jssport.shirt-plackets',
        'jssport.shirt-placket-outer-colors',
        'jssport.shirt-placket-inner-colors',
        'jssport.shirt-cuffs',
        'jssport.shirt-panels',
        'jssport.shirt-screen-colors',
        'jssport.shirt-embroidery-colors',
        'jssport.shirt-sublimation',
        'jssport.pants-patterns',
        'jssport.pants-leg-style',
        'jssport.pants-leg-hem',
    ];

    private const QUICK_ADD_ALLOWED_STORAGE_KEYS = [
        ...self::SPEC_CATALOG_STORAGE_KEYS,
        self::JOB_NAMES_STORAGE_KEY,
    ];

    public function sizeKids(Request $request): Response
    {
        return $this->renderSharedCatalog(
            title: 'ไซซ์เด็ก',
            routePath: '/settings/data/size-kids',
            storageKey: self::SIZE_KIDS_STORAGE_KEY,
            dataLabel: 'Size Data',
            parentTitle: 'ไซซ์เด็ก',
            parentPath: '/settings/data/size-kids',
            pagePrefix: 'ไซซ์เด็ก'
        );
    }

    public function sizeAdults(Request $request): Response
    {
        return $this->renderSharedCatalog(
            title: 'ไซซ์ผู้ใหญ่',
            routePath: '/settings/data/size-adults',
            storageKey: self::SIZE_ADULTS_STORAGE_KEY,
            dataLabel: 'Size Data',
            parentTitle: 'ไซซ์ผู้ใหญ่',
            parentPath: '/settings/data/size-adults',
            pagePrefix: 'ไซซ์ผู้ใหญ่'
        );
    }

    public function branches(Request $request): Response
    {
        return Inertia::render('settings/data/branches/index');
    }

    public const JOB_TYPES_STORAGE_KEY = 'jssport.job-types';

    /** Organisation / job names offered on the order form. */
    public const JOB_NAMES_STORAGE_KEY = 'jssport.job-names';

    public function jobTypes(Request $request): Response
    {
        return Inertia::render('settings/data/job-types/index', [
            'rows' => $this->loadCatalogRows(self::JOB_TYPES_STORAGE_KEY),
            'storageKey' => self::JOB_TYPES_STORAGE_KEY,
        ]);
    }

    /**
     * Job names reuse the shared catalog screen, so the shop gets the same
     * add / rename / retire / delete controls it already knows from the colour
     * catalogs. Deleting a name here only retires the master-data row: orders
     * keep their own copy of the text in orders.job_name.
     */
    public function jobNames(Request $request): Response
    {
        return $this->renderSharedCatalog(
            title: 'ชื่อหน่วยงาน, ชื่องาน',
            routePath: '/settings/data/job-names',
            storageKey: self::JOB_NAMES_STORAGE_KEY,
            dataLabel: 'Order Data',
            parentTitle: 'จัดการข้อมูล',
            parentPath: '/settings/data',
            pagePrefix: 'จัดการข้อมูล'
        );
    }

    public function syncCatalogItems(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'storage_key' => ['required', 'string', 'max:255'],
            // 'present', not 'required': this endpoint replaces the whole list,
            // so deleting the last remaining row legitimately sends []. With
            // 'required' that came back 422 while the screen had already hidden
            // the row, so the deletion looked done until the next refresh.
            'rows' => ['present', 'array'],
            'rows.*.id' => ['required', 'integer', 'min:1'],
            'rows.*.createdAt' => ['required', 'string'],
            'rows.*.name' => ['required', 'string', 'max:255'],
            'rows.*.createdBy' => ['nullable', 'string', 'max:255'],
            'rows.*.active' => ['required', 'boolean'],
        ]);

        $storageKey = (string) $validated['storage_key'];

        DB::transaction(function () use ($validated, $storageKey): void {
            $rows = $validated['rows'];
            $incomingIds = collect($rows)->pluck('id')->map(fn ($value): int => (int) $value)->values();

            CatalogItem::query()
                ->where('storage_key', $storageKey)
                ->whereNotIn('item_id', $incomingIds)
                ->delete();

            // The list arrives in the order the screen shows it, and that
            // order is what the row's place in the catalog is: moving a size
            // up on the settings page is what moves it on the order form.
            foreach (array_values($rows) as $position => $row) {
                $timestamp = Carbon::parse((string) $row['createdAt']);

                CatalogItem::query()->updateOrCreate(
                    [
                        'storage_key' => $storageKey,
                        'item_id' => (int) $row['id'],
                    ],
                    [
                        'name' => trim((string) $row['name']),
                        'sort_order' => $position + 1,
                        'created_by' => trim((string) ($row['createdBy'] ?? '')),
                        'active' => (bool) $row['active'],
                        'created_at' => $timestamp,
                        'updated_at' => now(),
                    ],
                );
            }
        });

        return response()->json([
            'rows' => $this->loadCatalogRows($storageKey),
        ]);
    }

    /**
     * Quick-add a single master-data value from an order form field (e.g. a
     * color the user typed that isn't in the dropdown yet). Unlike
     * syncCatalogItems() this never deletes anything — it only ever adds
     * one row, or returns an existing matching one so the caller doesn't
     * create a duplicate.
     */
    public function quickAddCatalogItem(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'storage_key' => ['required', 'string', Rule::in(self::QUICK_ADD_ALLOWED_STORAGE_KEYS)],
            'name' => ['required', 'string', 'max:255'],
        ]);

        $storageKey = (string) $validated['storage_key'];
        $name = trim((string) $validated['name']);

        if ($name === '') {
            return response()->json(['message' => 'กรุณาระบุชื่อ'], 422);
        }

        $existing = CatalogItem::query()
            ->where('storage_key', $storageKey)
            ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($name)])
            ->orderByDesc('active')
            ->first();

        if ($existing) {
            if (! $existing->active) {
                $existing->active = true;
                $existing->save();
            }

            return response()->json([
                'item' => ['id' => (int) $existing->item_id, 'name' => $existing->name],
                'created' => false,
            ]);
        }

        // The (storage_key, item_id) pair is unique-constrained at the DB
        // level, so a race between two concurrent quick-adds for the same
        // key can't corrupt data — the loser just retries with a fresh
        // next id.
        $attemptsLeft = 3;
        $item = null;

        while ($attemptsLeft > 0 && $item === null) {
            $attemptsLeft--;

            try {
                $item = DB::transaction(function () use ($storageKey, $name, $request): CatalogItem {
                    $existingRows = CatalogItem::query()
                        ->where('storage_key', $storageKey)
                        ->lockForUpdate();
                    $nextItemId = (int) ($existingRows->clone()->max('item_id') ?? 0) + 1;
                    $lastPosition = (int) ($existingRows->clone()->max('sort_order') ?? 0);

                    return CatalogItem::query()->create([
                        'storage_key' => $storageKey,
                        'item_id' => $nextItemId,
                        'name' => $name,
                        'sort_order' => $lastPosition + 1,
                        'created_by' => $request->user()?->name,
                        'active' => true,
                    ]);
                });
            } catch (QueryException $exception) {
                if ($attemptsLeft <= 0) {
                    throw $exception;
                }
            }
        }

        if ($item === null) {
            return response()->json(['message' => 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่'], 500);
        }

        return response()->json([
            'item' => ['id' => (int) $item->item_id, 'name' => $item->name],
            'created' => true,
        ]);
    }

    /**
     * Rename a spec master-data entry from the order form.
     *
     * Bills that already use the entry keep the name they were saved with (the
     * form snapshots it into spec_labels), so a rename only changes what new
     * bills see.
     */
    public function renameCatalogItem(Request $request): JsonResponse
    {
        $this->authorizeMasterDataManagement($request);

        $validated = $request->validate([
            'storage_key' => ['required', 'string', Rule::in(self::SPEC_CATALOG_STORAGE_KEYS)],
            'item_id' => ['required', 'integer', 'min:1'],
            'name' => ['required', 'string', 'max:255'],
        ]);

        $storageKey = (string) $validated['storage_key'];
        $itemId = (int) $validated['item_id'];
        $name = trim((string) $validated['name']);

        if ($name === '') {
            return response()->json(['message' => 'กรุณาระบุชื่อ'], 422);
        }

        $item = CatalogItem::query()
            ->where('storage_key', $storageKey)
            ->where('item_id', $itemId)
            ->first();

        if (! $item instanceof CatalogItem) {
            return response()->json(['message' => 'ไม่พบรายการนี้'], 404);
        }

        $clash = CatalogItem::query()
            ->where('storage_key', $storageKey)
            ->where('item_id', '!=', $itemId)
            ->where('active', true)
            ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($name)])
            ->exists();

        if ($clash) {
            return response()->json(['message' => 'มีชื่อนี้อยู่แล้ว'], 422);
        }

        $item->name = $name;
        $item->save();

        return response()->json([
            'item' => ['id' => (int) $item->item_id, 'name' => $item->name, 'active' => (bool) $item->active],
        ]);
    }

    /**
     * Take a spec master-data entry out of the form's choices.
     *
     * The row is kept and only marked inactive: bills that used it still
     * resolve its name on the counter and the floor, and adding the same name
     * again later simply brings it back.
     */
    public function hideCatalogItem(Request $request): JsonResponse
    {
        $this->authorizeMasterDataManagement($request);

        $validated = $request->validate([
            'storage_key' => ['required', 'string', Rule::in(self::SPEC_CATALOG_STORAGE_KEYS)],
            'item_id' => ['required', 'integer', 'min:1'],
        ]);

        $item = CatalogItem::query()
            ->where('storage_key', (string) $validated['storage_key'])
            ->where('item_id', (int) $validated['item_id'])
            ->first();

        if (! $item instanceof CatalogItem) {
            return response()->json(['message' => 'ไม่พบรายการนี้'], 404);
        }

        if ($item->active) {
            $item->active = false;
            $item->save();
        }

        return response()->json([
            'item' => ['id' => (int) $item->item_id, 'name' => $item->name, 'active' => false],
        ]);
    }

    private function authorizeMasterDataManagement(Request $request): void
    {
        $user = $request->user();

        abort_unless($user !== null && UserAccessControl::canManageMasterData($user), 403);
    }

    private function renderSharedCatalog(
        string $title,
        string $routePath,
        string $storageKey,
        string $dataLabel,
        string $parentTitle,
        string $parentPath,
        string $pagePrefix,
    ): Response {
        return Inertia::render('settings/data/shirts/catalog', [
            'catalog' => [
                'title' => $title,
                'routePath' => $routePath,
                'storageKey' => $storageKey,
                'dataLabel' => $dataLabel,
                'parentTitle' => $parentTitle,
                'parentPath' => $parentPath,
                'pagePrefix' => $pagePrefix,
                'sortable' => in_array($storageKey, self::SORTABLE_STORAGE_KEYS, true),
            ],
            'rows' => $this->loadCatalogRows($storageKey),
        ]);
    }
}
