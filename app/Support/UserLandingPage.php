<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;

/**
 * Where a user should land after signing in. Everyone used to be sent to the
 * counter, and anyone who could not open the counter was sent to the new-order
 * form instead -- a page a QC or sewing account has no business on. The landing
 * page now follows the menus the account may actually open.
 */
final class UserLandingPage
{
    /**
     * Menus in the order they make sense as a home page, each with the route
     * that opens it. The first menu the user may access wins.
     *
     * @var array<string, string>
     */
    private const MENU_ROUTES = [
        'dashboard' => 'owner.dashboard',
        'counter' => 'counter.fallback',
        'qc' => 'production.qc',
        'cutting' => 'production.cutting',
        'printing' => 'production.print-room',
        'pressing' => 'production.heat-press',
        'embroidery' => 'production.embroidery',
        'sewing' => 'production.sewing',
        'screen_flex' => 'production.screen-flex',
        'delivery' => 'production.shipping',
        'production' => 'production.kanban',
        'orders' => 'orders.index',
        'users_management' => 'settings.users.index',
        'settings_data' => 'settings.data.branches.index',
    ];

    public static function routeFor(User $user): string
    {
        foreach (self::MENU_ROUTES as $menu => $routeName) {
            if (UserAccessControl::canAccessMenu($user, $menu)) {
                return route($routeName, absolute: false);
            }
        }

        // An account with no menus at all is a misconfiguration, not a reason to
        // drop someone onto a page they cannot use; their own profile always works.
        return route('profile.edit', absolute: false);
    }
}
