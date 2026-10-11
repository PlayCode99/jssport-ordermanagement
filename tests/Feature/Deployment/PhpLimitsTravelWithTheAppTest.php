<?php

namespace Tests\Feature\Deployment;

use Tests\TestCase;

/**
 * The limits a counter bill needs, kept with the application.
 *
 * A bill posts as multipart because it carries artwork, and the stock PHP
 * limits cut those requests up without saying so — the first thousand input
 * variables kept and the rest discarded, twenty files kept and the rest
 * dropped, anything over eight megabytes refused outright. A bill with
 * everything filled in came back refused for fields that were plainly there,
 * or did not come back at all.
 *
 * Every directive involved is PERDIR, so `public/.user.ini` sets them wherever
 * PHP runs as FastCGI or php-fpm, which is what hosting normally uses, and
 * nobody has to be talked through editing php.ini on a server to deploy this.
 * Apache with mod_php ignores .user.ini, so `public/.htaccess` repeats them
 * behind an IfModule guard.
 *
 * These cases hold the two files to the application's own rules, because the
 * numbers only mean anything in relation to them: the file ceiling has to sit
 * above the 5MB the validator allows, or the validator's message can never be
 * the one a counter sees.
 */
class PhpLimitsTravelWithTheAppTest extends TestCase
{
    /**
     * The directives as `public/.user.ini` states them.
     *
     * @return array<string, string>
     */
    private function userIni(): array
    {
        $path = base_path('public/.user.ini');

        $this->assertFileExists(
            $path,
            'public/.user.ini is how this application carries its own PHP limits.',
        );

        $parsed = parse_ini_file($path, false, INI_SCANNER_RAW);

        $this->assertIsArray($parsed, 'public/.user.ini does not parse.');

        return $parsed;
    }

    /** A size written as 16M or 128M, in bytes. */
    private function bytes(string $value): int
    {
        $unit = strtolower(substr(trim($value), -1));
        $size = (int) $value;

        return match ($unit) {
            'g' => $size * 1024 * 1024 * 1024,
            'm' => $size * 1024 * 1024,
            'k' => $size * 1024,
            default => $size,
        };
    }

    /**
     * The validator turns away anything over 5MB with the shop's own wording.
     * Below that, PHP drops the file first and the counter is told the file
     * "failed to upload" instead — so the ceiling has to be the higher of the
     * two, or the rule is one nobody can ever reach.
     */
    public function test_php_accepts_a_larger_file_than_the_validator_allows(): void
    {
        $validatorCeiling = 5120 * 1024;

        $this->assertGreaterThan(
            $validatorCeiling,
            $this->bytes($this->userIni()['upload_max_filesize']),
            'upload_max_filesize must sit above the max:5120 the order form validates with.',
        );
    }

    /**
     * PHP caps a single file at the smaller of the two, so a post ceiling under
     * the file ceiling quietly lowers it.
     */
    public function test_the_whole_request_may_be_larger_than_one_file(): void
    {
        $ini = $this->userIni();

        $this->assertGreaterThanOrEqual(
            $this->bytes($ini['upload_max_filesize']),
            $this->bytes($ini['post_max_size']),
        );
    }

    /**
     * Artwork is pinned per production sheet and a bill can carry fifteen of
     * them, so twenty files is not enough to hold one.
     */
    public function test_a_bill_may_carry_more_artwork_than_the_stock_twenty(): void
    {
        $this->assertGreaterThanOrEqual(
            100,
            (int) $this->userIni()['max_file_uploads'],
        );
    }

    /**
     * The order payload spends about 37 of these however long the bill is,
     * since its two long lists travel as JSON. The headroom is for the rest of
     * the application, and for the day somebody adds a field per row again.
     */
    public function test_there_is_room_for_far_more_input_variables_than_an_order_spends(): void
    {
        $ini = $this->userIni();

        $this->assertGreaterThanOrEqual(5000, (int) $ini['max_input_vars']);
        $this->assertGreaterThanOrEqual(
            (int) $ini['max_input_vars'],
            (int) $ini['max_multipart_body_parts'],
        );
    }

    /**
     * The reason a failure was silent rather than reported: PHP wrote its
     * startup warnings into the response body, headers were therefore already
     * sent, and Laravel could not set a status — the browser got 200 and an
     * empty page where it should have had 413.
     */
    public function test_php_logs_its_warnings_instead_of_printing_them_into_the_response(): void
    {
        $ini = $this->userIni();

        $this->assertSame('Off', $ini['display_errors']);
        $this->assertSame('Off', $ini['display_startup_errors']);
        $this->assertSame('On', $ini['log_errors']);
    }

    /**
     * Apache with mod_php never reads .user.ini, so the same numbers are
     * repeated in .htaccess — and must stay in step with it.
     */
    public function test_htaccess_carries_the_same_limits_for_mod_php(): void
    {
        $htaccess = file_get_contents(base_path('public/.htaccess'));
        $ini = $this->userIni();

        $this->assertIsString($htaccess);

        foreach (['upload_max_filesize', 'post_max_size', 'max_file_uploads', 'max_input_vars'] as $directive) {
            $this->assertStringContainsString(
                sprintf('php_value %s %s', $directive, $ini[$directive]),
                $htaccess,
                sprintf('.htaccess and .user.ini disagree about %s.', $directive),
            );
        }
    }

    /**
     * Loose php_value directives answer every request with a 500 on a server
     * running PHP as FastCGI, which is most of them.
     */
    public function test_the_htaccess_limits_are_guarded_so_they_cannot_break_a_fastcgi_host(): void
    {
        $htaccess = (string) file_get_contents(base_path('public/.htaccess'));

        $this->assertMatchesRegularExpression(
            '/<IfModule mod_php\d?\.c>[\s\S]*?php_value[\s\S]*?<\/IfModule>/',
            $htaccess,
        );
        $this->assertSame(
            $this->directiveCount($this->withoutComments($htaccess)),
            $this->guardedDirectiveCount($htaccess),
            'Every php_value and php_flag must sit inside an IfModule guard.',
        );
    }

    /** The file without its comment lines, which may name a directive. */
    private function withoutComments(string $htaccess): string
    {
        return implode("\n", array_filter(
            explode("\n", $htaccess),
            fn (string $line): bool => ! str_starts_with(ltrim($line), '#'),
        ));
    }

    private function directiveCount(string $text): int
    {
        return substr_count($text, 'php_value') + substr_count($text, 'php_flag');
    }

    /**
     * The limits are no secret, but a file that configures the server is not
     * content either. Apache hides .htaccess itself in most builds and says
     * nothing about .user.ini, so the rule is written down here. nginx needs
     * the same thing said in its own site file, which this cannot reach.
     */
    public function test_the_server_is_told_not_to_serve_its_own_dotfiles(): void
    {
        $this->assertMatchesRegularExpression(
            '/<FilesMatch "\^\\\\\.">[\s\S]*?(Require all denied|Deny from all)/',
            (string) file_get_contents(base_path('public/.htaccess')),
        );
    }

    /** How many php_value/php_flag lines sit inside an IfModule mod_php guard. */
    private function guardedDirectiveCount(string $htaccess): int
    {
        preg_match_all(
            '/<IfModule mod_php\d?\.c>([\s\S]*?)<\/IfModule>/',
            $htaccess,
            $matches,
        );

        return array_sum(array_map(
            fn (string $block): int => $this->directiveCount(
                $this->withoutComments($block),
            ),
            $matches[1],
        ));
    }
}
