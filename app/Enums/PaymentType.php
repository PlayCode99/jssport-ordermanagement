<?php

declare(strict_types=1);

namespace App\Enums;

enum PaymentType: string
{
    case Deposit = 'deposit';
    case PartiallyPaid = 'partially_paid';
    case FullPayment = 'full_payment';
    case BalanceClear = 'balance_clear';
}
