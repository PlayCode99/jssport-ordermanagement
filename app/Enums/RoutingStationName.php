<?php

declare(strict_types=1);

namespace App\Enums;

enum RoutingStationName: string
{
    case Design = 'design';
    case Print = 'print';
    case Embroidery = 'embroidery';
    case Screen = 'screen';
    case Flex = 'flex';
    case Cutting = 'cutting';
    case Sewing = 'sewing';
    case Qc = 'qc';
    case Shipping = 'shipping';
}
