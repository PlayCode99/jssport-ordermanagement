<?php

declare(strict_types=1);

namespace App\Enums;

enum AccessRole: string
{
    case Counter = 'COUNTER';
    case CuttingStaff = 'CUTTING_STAFF';
    case PrintingStaff = 'PRINTING_STAFF';
    case PressStaff = 'PRESS_STAFF';
    case EmbroideryStaff = 'EMBROIDERY_STAFF';
    case SewingStaff = 'SEWING_STAFF';
    case ScreenFlexStaff = 'SCREEN_FLEX_STAFF';
    case QcStaff = 'QC_STAFF';
    case DeliveryStaff = 'DELIVERY_STAFF';
    case AdminProduction = 'ADMIN_PRODUCTION';
    case AdminSystem = 'ADMIN_SYSTEM';
    case Owner = 'OWNER';

    public function label(): string
    {
        return match ($this) {
            self::Counter => 'Counter',
            self::CuttingStaff => 'Cutting Staff',
            self::PrintingStaff => 'Printing Staff',
            self::PressStaff => 'Press Staff',
            self::EmbroideryStaff => 'Embroidery Staff',
            self::SewingStaff => 'Sewing Staff',
            self::ScreenFlexStaff => 'Screen/Flex Staff',
            self::QcStaff => 'QC Staff',
            self::DeliveryStaff => 'Delivery Staff',
            self::AdminProduction => 'Admin Production',
            self::AdminSystem => 'Admin System',
            self::Owner => 'Owner',
        };
    }
}
