<?php

declare(strict_types=1);

namespace App\Enums;

enum StationDepartment: string
{
    case None = 'none';
    case Design = 'design';
    case Print = 'print';
    case Embroidery = 'embroidery';
    case Screen = 'screen';
    case Flex = 'flex';
    case Cutting = 'cutting';
    case Sewing = 'sewing';
    case Qc = 'qc';
}
