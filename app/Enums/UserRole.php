<?php

declare(strict_types=1);

namespace App\Enums;

enum UserRole: string
{
    case Admin = 'admin';
    case Sales = 'sales';
    case Designer = 'designer';
    case ProductionManager = 'production_manager';
    case Worker = 'worker';
    case Qc = 'qc';
    case Finance = 'finance';
}
