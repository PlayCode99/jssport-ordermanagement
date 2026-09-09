<?php

namespace App\Models;

use App\Enums\RoutingStationName;
use App\Enums\RoutingStatus;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Cast attributes, spelled out because static analysis reads the database
 * schema and would otherwise see the raw column types rather than what the
 * casts hand back at runtime.
 *
 * @property int $id
 * @property int $order_id
 * @property RoutingStationName|null $station_name
 * @property bool $is_required
 * @property RoutingStatus|null $status
 * @property string|null $print_machine
 * @property int|null $assigned_user_id
 * @property int|null $cutting_team_id
 * @property int|null $sewing_team_id
 * @property int|null $embroidery_team_id
 * @property int|null $screen_team_id
 * @property int|null $heat_press_machine_id
 * @property string|null $rework_note
 * @property CarbonInterface|null $started_at
 * @property CarbonInterface|null $completed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Order|null $order
 * @property-read User|null $assignedUser
 * @property-read CuttingTeam|null $cuttingTeam
 * @property-read SewingTeam|null $sewingTeam
 * @property-read EmbroideryTeam|null $embroideryTeam
 * @property-read ScreenTeam|null $screenTeam
 * @property-read HeatPressMachine|null $heatPressMachine
 */
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

    /**
     * @return BelongsTo<Order, $this>
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }

    /**
     * @return BelongsTo<CuttingTeam, $this>
     */
    public function cuttingTeam(): BelongsTo
    {
        return $this->belongsTo(CuttingTeam::class, 'cutting_team_id');
    }

    /**
     * @return BelongsTo<SewingTeam, $this>
     */
    public function sewingTeam(): BelongsTo
    {
        return $this->belongsTo(SewingTeam::class, 'sewing_team_id');
    }

    /**
     * @return BelongsTo<EmbroideryTeam, $this>
     */
    public function embroideryTeam(): BelongsTo
    {
        return $this->belongsTo(EmbroideryTeam::class, 'embroidery_team_id');
    }

    /**
     * @return BelongsTo<ScreenTeam, $this>
     */
    public function screenTeam(): BelongsTo
    {
        return $this->belongsTo(ScreenTeam::class, 'screen_team_id');
    }

    /**
     * @return BelongsTo<HeatPressMachine, $this>
     */
    public function heatPressMachine(): BelongsTo
    {
        return $this->belongsTo(HeatPressMachine::class, 'heat_press_machine_id');
    }
}
