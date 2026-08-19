<?php

declare(strict_types=1);

namespace App\Enums;

enum OrderStatus: string
{
    case Draft = 'draft';
    case Designing = 'designing';
    case WaitingCustomerConfirm = 'waiting_customer_confirm';
    case Confirmed = 'confirmed';
    case InProduction = 'in_production';
    case QcChecking = 'qc_checking';
    case QcRejected = 'qc_rejected';
    case Shipping = 'shipping';
    case Completed = 'completed';
    case Cancelled = 'cancelled';

    public function canBeEdited(): bool
    {
        return true;
    }
}
