<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderRouting extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'station_name' => RoutingStationName::class,
            'status' => RoutingStatus::class,
            'is_required' => 'boolean',
            'cutting_team_id' => 'integer',
            'sewing_team_id' => 'integer',
            'embroidery_team_id' => 'integer',
            'screen_team_id' => 'integer',
            'heat_press_machine_id' => 'integer',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }

    public function cuttingTeam(): BelongsTo
    {
        return $this->belongsTo(CuttingTeam::class, 'cutting_team_id');
    }

    public function sewingTeam(): BelongsTo
    {
        return $this->belongsTo(SewingTeam::class, 'sewing_team_id');
    }

    public function embroideryTeam(): BelongsTo
    {
        return $this->belongsTo(EmbroideryTeam::class, 'embroidery_team_id');
    }

    public function screenTeam(): BelongsTo
    {
        return $this->belongsTo(ScreenTeam::class, 'screen_team_id');
    }

    public function heatPressMachine(): BelongsTo
    {
        return $this->belongsTo(HeatPressMachine::class, 'heat_press_machine_id');
    }
}
