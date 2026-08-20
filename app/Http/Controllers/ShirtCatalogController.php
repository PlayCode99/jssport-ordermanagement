<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\CatalogItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
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

    public function jobTypes(Request $request): Response
    {
        return Inertia::render('settings/data/job-types/index');
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