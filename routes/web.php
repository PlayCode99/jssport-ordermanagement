<?php

use App\Http\Controllers\OrderController;
use App\Http\Controllers\OwnerDashboardController;
use App\Http\Controllers\GarmentPricingController;
use App\Http\Controllers\ShirtCatalogController;
use App\Http\Controllers\ShirtDataManagementController;
use App\Http\Controllers\Production\CuttingTaskController;
use App\Http\Controllers\Production\ProductionKanbanController;
use App\Http\Controllers\Production\ProductionRoutingController;
use App\Http\Controllers\Settings\BranchManagementController;
use App\Http\Controllers\Settings\CuttingTeamController;
use App\Http\Controllers\Settings\EmbroideryTeamController;
use App\Http\Controllers\Settings\HeatPressMachineController;
use App\Http\Controllers\Settings\ProductionDailySettingController;
use App\Http\Controllers\Settings\ScreenTeamController;
use App\Http\Controllers\Settings\SewingTeamController;
use App\Http\Controllers\QcInspectionController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\Teams\TeamInvitationController;
use App\Http\Middleware\EnsureTeamMembership;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/login')->name('home');

Route::prefix('{current_team}')
    ->middleware(['auth', 'verified', EnsureTeamMembership::class])
    ->group(function () {
        Route::get('index', DashboardController::class)->name('index');
        Route::get('counter', DashboardController::class)->name('counter.index');
        Route::redirect('dashboard', 'index')->name('dashboard');
    });

Route::middleware(['auth'])->group(function () {
    Route::get('counter', DashboardController::class)->name('counter.fallback');
    Route::get('owner-dashboard', OwnerDashboardController::class)->name('owner.dashboard');
    Route::get('invitations/{invitation}/accept', [TeamInvitationController::class, 'accept'])->name('invitations.accept');
    Route::delete('invitations/{invitation}', [TeamInvitationController::class, 'decline'])->name('invitations.decline');
    Route::get('orders/create', [OrderController::class, 'create'])->name('orders.create');
    Route::get('orders/{order}/edit', [OrderController::class, 'edit'])->name('orders.edit');
    Route::get('orders/{order}/duplicate', [OrderController::class, 'duplicate'])->name('orders.duplicate');
    Route::put('orders/{order}', [OrderController::class, 'update'])->name('orders.update');
    Route::delete('orders/{order}', [OrderController::class, 'destroy'])->name('orders.destroy');
    Route::get('orders', [OrderController::class, 'index'])->name('orders.index');
    Route::post('orders', [OrderController::class, 'store'])->name('orders.store');
    Route::get('production/kanban', [ProductionKanbanController::class, 'index'])->name('production.kanban');
    Route::get('production/print-room', [ProductionKanbanController::class, 'printRoom'])->name('production.print-room');
    Route::get('production/heat-press', [ProductionKanbanController::class, 'heatPress'])->name('production.heat-press');
    Route::get('production/embroidery', [ProductionKanbanController::class, 'embroidery'])->name('production.embroidery');
    Route::get('production/cutting', [ProductionKanbanController::class, 'cutting'])->name('production.cutting');
    Route::get('production/sewing', [ProductionKanbanController::class, 'sewing'])->name('production.sewing');
    Route::get('production/screen-flex', [ProductionKanbanController::class, 'screenFlex'])->name('production.screen-flex');
    Route::get('production/qc', [ProductionKanbanController::class, 'qc'])->name('production.qc');
    Route::get('production/shipping', [ProductionKanbanController::class, 'shipping'])->name('production.shipping');
    Route::post('orders/{order}/routing/advance', [ProductionRoutingController::class, 'advance'])->name('production.routing.advance');
    Route::post('orders/{order}/shipping-delivery-info', [ProductionRoutingController::class, 'storeShippingDeliveryInfo'])->name('production.shipping.delivery-info.store');
    Route::post('production/cutting-tasks', [CuttingTaskController::class, 'store'])->name('production.cutting-tasks.store');
    Route::post('orders/{order}/qc', [QcInspectionController::class, 'submit'])->name('qc.submit');
    Route::get('settings/data/branches', [BranchManagementController::class, 'index'])->name('settings.data.branches.index');
    Route::post('settings/data/branches', [BranchManagementController::class, 'store'])->name('settings.data.branches.store');
    Route::put('settings/data/branches/{branch}', [BranchManagementController::class, 'update'])->name('settings.data.branches.update');
    Route::delete('settings/data/branches/{branch}', [BranchManagementController::class, 'destroy'])->name('settings.data.branches.destroy');
    Route::get('settings/data/job-types', [ShirtCatalogController::class, 'jobTypes'])->name('settings.data.job-types.index');
    Route::get('settings/data/cutting-teams', [CuttingTeamController::class, 'index'])->name('settings.data.cutting-teams.index');
    Route::post('settings/data/cutting-teams', [CuttingTeamController::class, 'store'])->name('settings.data.cutting-teams.store');
    Route::put('settings/data/cutting-teams/{cuttingTeam}', [CuttingTeamController::class, 'update'])->name('settings.data.cutting-teams.update');
    Route::delete('settings/data/cutting-teams/{cuttingTeam}', [CuttingTeamController::class, 'destroy'])->name('settings.data.cutting-teams.destroy');
    Route::get('settings/data/sewing-teams', [SewingTeamController::class, 'index'])->name('settings.data.sewing-teams.index');
    Route::post('settings/data/sewing-teams', [SewingTeamController::class, 'store'])->name('settings.data.sewing-teams.store');
    Route::put('settings/data/sewing-teams/{sewingTeam}', [SewingTeamController::class, 'update'])->name('settings.data.sewing-teams.update');
    Route::delete('settings/data/sewing-teams/{sewingTeam}', [SewingTeamController::class, 'destroy'])->name('settings.data.sewing-teams.destroy');
    Route::get('settings/data/embroidery-teams', [EmbroideryTeamController::class, 'index'])->name('settings.data.embroidery-teams.index');
    Route::post('settings/data/embroidery-teams', [EmbroideryTeamController::class, 'store'])->name('settings.data.embroidery-teams.store');
    Route::put('settings/data/embroidery-teams/{embroideryTeam}', [EmbroideryTeamController::class, 'update'])->name('settings.data.embroidery-teams.update');
    Route::delete('settings/data/embroidery-teams/{embroideryTeam}', [EmbroideryTeamController::class, 'destroy'])->name('settings.data.embroidery-teams.destroy');
    Route::get('settings/data/screen-teams', [ScreenTeamController::class, 'index'])->name('settings.data.screen-teams.index');
    Route::post('settings/data/screen-teams', [ScreenTeamController::class, 'store'])->name('settings.data.screen-teams.store');
    Route::put('settings/data/screen-teams/{screenTeam}', [ScreenTeamController::class, 'update'])->name('settings.data.screen-teams.update');
    Route::delete('settings/data/screen-teams/{screenTeam}', [ScreenTeamController::class, 'destroy'])->name('settings.data.screen-teams.destroy');
    Route::get('settings/data/heat-press-machines', [HeatPressMachineController::class, 'index'])->name('settings.data.heat-press-machines.index');
    Route::post('settings/data/heat-press-machines', [HeatPressMachineController::class, 'store'])->name('settings.data.heat-press-machines.store');
    Route::put('settings/data/heat-press-machines/{heatPressMachine}', [HeatPressMachineController::class, 'update'])->name('settings.data.heat-press-machines.update');
    Route::delete('settings/data/heat-press-machines/{heatPressMachine}', [HeatPressMachineController::class, 'destroy'])->name('settings.data.heat-press-machines.destroy');
    Route::get('settings/data/production-capacity', [ProductionDailySettingController::class, 'index'])->name('settings.data.production-capacity.index');
    Route::put('settings/data/production-capacity', [ProductionDailySettingController::class, 'update'])->name('settings.data.production-capacity.update');
    Route::get('settings/data/garments/types', [GarmentPricingController::class, 'types'])
        ->name('settings.data.garments.types');
    Route::post('settings/data/garments/types', [GarmentPricingController::class, 'storeType'])
        ->name('settings.data.garments.types.store');
    Route::put('settings/data/garments/types/{garmentType}', [GarmentPricingController::class, 'updateType'])
        ->name('settings.data.garments.types.update');
    Route::delete('settings/data/garments/types/{garmentType}', [GarmentPricingController::class, 'destroyType'])
        ->name('settings.data.garments.types.destroy');
    Route::get('settings/data/garments/prices', [GarmentPricingController::class, 'prices'])
        ->name('settings.data.garments.prices');
    Route::post('settings/data/garments/prices', [GarmentPricingController::class, 'storePrice'])
        ->name('settings.data.garments.prices.store');
    Route::put('settings/data/garments/prices/{garmentOperation}', [GarmentPricingController::class, 'updatePrice'])
        ->name('settings.data.garments.prices.update');
    Route::delete('settings/data/garments/prices/{garmentOperation}', [GarmentPricingController::class, 'destroyPrice'])
        ->name('settings.data.garments.prices.destroy');
    Route::get('settings/data/shirts', [ShirtCatalogController::class, 'index'])->name('settings.data.shirts.index');
    Route::get('settings/data/shirts/types', [ShirtDataManagementController::class, 'types'])
        ->name('settings.data.shirts.types');
    Route::post('settings/data/shirts/types', [ShirtDataManagementController::class, 'storeType'])
        ->name('settings.data.shirts.types.store');
    Route::put('settings/data/shirts/types/{shirtType}', [ShirtDataManagementController::class, 'updateType'])
        ->name('settings.data.shirts.types.update');
    Route::delete('settings/data/shirts/types/{shirtType}', [ShirtDataManagementController::class, 'destroyType'])
        ->name('settings.data.shirts.types.destroy');
    Route::get('settings/data/shirts/patterns', [ShirtCatalogController::class, 'patterns'])->name('settings.data.shirts.patterns');
    Route::get('settings/data/shirts/catalog/{catalog}', [ShirtCatalogController::class, 'show'])
        ->name('settings.data.shirts.catalog');
    Route::post('settings/data/catalog-items/sync', [ShirtCatalogController::class, 'syncCatalogItems'])
        ->name('settings.data.catalog-items.sync');
    Route::post('settings/data/catalog-items/quick-add', [ShirtCatalogController::class, 'quickAddCatalogItem'])
        ->name('settings.data.catalog-items.quick-add');
    Route::get('settings/data/pants', [ShirtCatalogController::class, 'pantsIndex'])->name('settings.data.pants.index');
    Route::get('settings/data/pants/catalog/{catalog}', [ShirtCatalogController::class, 'showPantsCatalog'])
        ->name('settings.data.pants.catalog');
    Route::get('settings/data/size-kids', [ShirtCatalogController::class, 'sizeKids'])->name('settings.data.size-kids');
    Route::get('settings/data/size-adults', [ShirtCatalogController::class, 'sizeAdults'])->name('settings.data.size-adults');
});

require __DIR__.'/settings.php';
