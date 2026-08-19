<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\OrderStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class Order extends Model implements HasMedia
{
    use HasFactory, InteractsWithMedia, SoftDeletes;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    /**
     * @var array<int, string>
     */
    protected $appends = ['artwork_url', 'shirt_artwork_url', 'pants_artwork_url', 'reference_designs'];

    protected function casts(): array
    {
        return [
            'order_date' => 'datetime',
            'due_date' => 'datetime',
            'total_amount' => 'float',
            'discount_percent' => 'float',
            'discount_amount' => 'float',
            'net_amount' => 'float',
            'shipping_delivery_info' => 'array',
            'order_status' => OrderStatus::class,
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function creatorUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creator_user_id');
    }

    public function specification(): HasOne
    {
        return $this->hasOne(OrderSpecification::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function statusHistories(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class);
    }

    public function routings(): HasMany
    {
        return $this->hasMany(OrderRouting::class);
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(Receipt::class);
    }

    public function cuttingOrders(): HasMany
    {
        return $this->hasMany(CuttingOrder::class);
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('artwork')->singleFile();
        $this->addMediaCollection('shirt_artwork')->singleFile();
        $this->addMediaCollection('pants_artwork')->singleFile();
        $this->addMediaCollection('reference_designs');
    }

    public function getArtworkUrlAttribute(): ?string
    {
        $url = $this->getFirstMediaUrl('artwork');

        return $url !== '' ? $url : null;
    }

    public function getShirtArtworkUrlAttribute(): ?string
    {
        $url = $this->getFirstMediaUrl('shirt_artwork');

        return $url !== '' ? $url : null;
    }

    public function getPantsArtworkUrlAttribute(): ?string
    {
        $url = $this->getFirstMediaUrl('pants_artwork');

        return $url !== '' ? $url : null;
    }

    /**
     * @return array<int, string>
     */
    public function getReferenceDesignsAttribute(): array
    {
        return $this->getMedia('reference_designs')
            ->map(fn (Media $media): string => $media->getUrl())
            ->toArray();
    }
}
