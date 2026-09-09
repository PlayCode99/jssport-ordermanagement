import { describe, expect, it } from 'vitest';

import { resolveLogoHref } from '@/lib/permissionHelpers';

/**
 * Pressing the logo used to take everyone to the counter, including accounts
 * that cannot open it. Home now follows the account's own menus.
 */
describe('resolveLogoHref', () => {
    it('sends an account without the counter to its own landing page', () => {
        expect(
            resolveLogoHref({
                canOpenCounter: false,
                counterUrl: '/counter',
                landingPath: '/production/qc',
            }),
        ).toBe('/production/qc');
    });

    it('keeps counter staff on the counter', () => {
        expect(
            resolveLogoHref({
                canOpenCounter: true,
                counterUrl: '/counter',
                landingPath: '/counter',
            }),
        ).toBe('/counter');
    });

    it('keeps the team-scoped counter URL for counter staff who have a team', () => {
        // The landing path the server shares is unprefixed; counter staff keep
        // the team URL the sidebar has always used.
        expect(
            resolveLogoHref({
                canOpenCounter: true,
                counterUrl: '/js-sport/counter',
                landingPath: '/counter',
            }),
        ).toBe('/js-sport/counter');
    });

    it('never leaves the logo pointing nowhere', () => {
        // A page served before this prop existed, or one that failed to carry it.
        expect(
            resolveLogoHref({
                canOpenCounter: false,
                counterUrl: '/counter',
                landingPath: null,
            }),
        ).toBe('/counter');
        expect(
            resolveLogoHref({
                canOpenCounter: false,
                counterUrl: '/counter',
                landingPath: undefined,
            }),
        ).toBe('/counter');
        expect(
            resolveLogoHref({
                canOpenCounter: false,
                counterUrl: '/counter',
                landingPath: '',
            }),
        ).toBe('/counter');
    });

    it('routes each production role to its own room', () => {
        const rooms: Array<[string, string]> = [
            ['/production/qc', '/production/qc'],
            ['/production/sewing', '/production/sewing'],
            ['/production/cutting', '/production/cutting'],
            ['/production/shipping', '/production/shipping'],
            ['/owner-dashboard', '/owner-dashboard'],
        ];

        rooms.forEach(([landingPath, expected]) => {
            expect(
                resolveLogoHref({
                    canOpenCounter: false,
                    counterUrl: '/counter',
                    landingPath,
                }),
            ).toBe(expected);
        });
    });
});
