<?php

namespace App\Http\Controllers;

use App\Models\CatalogItem;
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
         * @return array<int, array{id: int, createdAt: string, name: string, createdBy: string, active: bool}>
         */
        private function loadCatalogRows(string $storageKey): array
        {
            return CatalogItem::query()
                ->where('storage_key', $storageKey)
                ->orderByDesc('created_at')
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
     * @var array<string, array{title: string, routePath: string, storageKey: string}>
     */
    private const CATALOGS = [
        'patterns' => [
            'title' => 'แพทเทิร์น',
            'routePath' => '/settings/data/shirts/patterns',
            'storageKey' => 'jssport.shirt-patterns',
        ],
        'fabrics' => [
            'title' => 'เนื้อผ้า',
            'routePath' => '/settings/data/shirts/fabrics',
            'storageKey' => 'jssport.shirt-fabrics',
        ],
        'colors' => [
            'title' => 'สีเสื้อ',
            'routePath' => '/settings/data/shirts/colors',
            'storageKey' => 'jssport.shirt-colors',
        ],
        'collars' => [
            'title' => 'ปก',
            'routePath' => '/settings/data/shirts/collars',
            'storageKey' => 'jssport.shirt-collars',
        ],
        'plackets' => [
            'title' => 'แบบสาป',
            'routePath' => '/settings/data/shirts/plackets',
            'storageKey' => 'jssport.shirt-plackets',
        ],
        'sleeves' => [
            'title' => 'แบบแขน',
            'routePath' => '/settings/data/shirts/sleeves',
            'storageKey' => 'jssport.shirt-sleeves',
        ],
        'cuffs' => [
            'title' => 'ปลายแขน',
            'routePath' => '/settings/data/shirts/cuffs',
            'storageKey' => 'jssport.shirt-cuffs',
        ],
        'panels' => [
            'title' => 'แบบต่อ',
            'routePath' => '/settings/data/shirts/panels',
            'storageKey' => 'jssport.shirt-panels',
        ],
        'sublimation' => [
            'title' => 'ซับลิเมชั่น',
            'routePath' => '/settings/data/shirts/sublimation',
            'storageKey' => 'jssport.shirt-sublimation',
        ],
    ];

    /**
     * @var array<string, array{title: string, storageKey: string}>
     */
    private const PANTS_CATALOGS = [
        'patterns' => [
            'title' => 'แพทเทิร์น',
            'storageKey' => 'jssport.pants-patterns',
        ],
        'leg-style' => [
            'title' => 'แบบขา',
            'storageKey' => 'jssport.pants-leg-style',
        ],
        'leg-hem' => [
            'title' => 'ปลายขา',
            'storageKey' => 'jssport.pants-leg-hem',
        ],
    ];

    /**
     * The only storage_keys the quick-add-from-order-form endpoint is
     * allowed to write to. This is a deliberate whitelist rather than
     * accepting any storage_key the client sends — otherwise a caller
     * could use this endpoint to inject rows into unrelated catalogs
     * (branches, job types, pricing, etc).
     *
     * @var array<int, string>
     */
    private const QUICK_ADD_ALLOWED_STORAGE_KEYS = [
        'jssport.shirt-fabric-colors',
        'jssport.shirt-neck-colors',
        'jssport.shirt-placket-outer-colors',
        'jssport.shirt-placket-inner-colors',
        'jssport.shirt-screen-colors',
        'jssport.shirt-embroidery-colors',
    ];

    public function patterns(Request $request): Response
    {
        return $this->renderCatalog($request, 'patterns');
    }

    public function index(Request $request): Response
    {
        return Inertia::render('settings/data/shirts/index');
    }

    public function pantsIndex(Request $request): Response
    {
        return Inertia::render('settings/data/pants/index');
    }

    public function show(Request $request, string $catalog): Response
    {
        return $this->renderCatalog($request, $catalog);
    }

    public function showPantsCatalog(Request $request, string $catalog): Response
    {
        $known = self::PANTS_CATALOGS[$catalog] ?? null;

        $resolvedTitle = trim((string) $request->query('title'));
        if ($resolvedTitle === '') {
            $resolvedTitle = $known['title'] ?? $catalog;
        }

        $resolvedStorageKey = $known['storageKey'] ?? "jssport.pants-catalog-{$catalog}";

        return $this->renderSharedCatalog(
            title: $resolvedTitle,
            routePath: "/settings/data/pants/catalog/{$catalog}",
            storageKey: $resolvedStorageKey,
            dataLabel: 'Pants Data',
            parentTitle: 'แบบกางเกง',
            parentPath: '/settings/data/pants',
            pagePrefix: 'แบบกางเกง'
        );
    }

    public function sizeKids(Request $request): Response
    {
        return $this->renderSharedCatalog(
            title: 'ไซซ์เด็ก',
            routePath: '/settings/data/size-kids',
            storageKey: 'jssport.size-kids',
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
            storageKey: 'jssport.size-adults',
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

    public function jobTypes(Request $request): Response
    {
        return Inertia::render('settings/data/job-types/index', [
            'rows' => $this->loadCatalogRows(self::JOB_TYPES_STORAGE_KEY),
            'storageKey' => self::JOB_TYPES_STORAGE_KEY,
        ]);
    }

    public function syncCatalogItems(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'storage_key' => ['required', 'string', 'max:255'],
            'rows' => ['required', 'array'],
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

            foreach ($rows as $row) {
                $timestamp = Carbon::parse((string) $row['createdAt']);

                CatalogItem::query()->updateOrCreate(
                    [
                        'storage_key' => $storageKey,
                        'item_id' => (int) $row['id'],
                    ],
                    [
                        'name' => trim((string) $row['name']),
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
                    $nextItemId = (int) (CatalogItem::query()
                        ->where('storage_key', $storageKey)
                        ->lockForUpdate()
                        ->max('item_id') ?? 0) + 1;

                    return CatalogItem::query()->create([
                        'storage_key' => $storageKey,
                        'item_id' => $nextItemId,
                        'name' => $name,
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

    private function renderCatalog(Request $request, string $catalog): Response
    {
        $known = self::CATALOGS[$catalog] ?? null;

        $resolvedTitle = trim((string) $request->query('title'));
        if ($resolvedTitle === '') {
            $resolvedTitle = $known['title'] ?? $catalog;
        }

        $resolvedStorageKey = $known['storageKey'] ?? "jssport.shirt-catalog-{$catalog}";

        return $this->renderSharedCatalog(
            title: $resolvedTitle,
            routePath: "/settings/data/shirts/catalog/{$catalog}",
            storageKey: $resolvedStorageKey,
            dataLabel: 'Shirt Data',
            parentTitle: 'แบบเสื้อ',
            parentPath: '/settings/data/shirts',
            pagePrefix: 'แบบเสื้อ'
        );
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
            ],
            'rows' => $this->loadCatalogRows($storageKey),
        ]);
    }
}