<?php

declare(strict_types=1);

namespace App\Support\Orders;

use RuntimeException;

/**
 * An artwork file that passed validation as an image but cannot be read back
 * as one — a truncated upload, an exotic encoding this host's GD was not
 * built for, or a file renamed to .png that never was one.
 *
 * Its own class so a caller can tell it apart from a genuine fault and answer
 * the user instead of returning a bare 500. Nothing has been stored when it
 * is thrown.
 */
class ArtworkNotConvertibleException extends RuntimeException {}
