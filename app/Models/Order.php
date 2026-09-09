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
use Illuminate\Support\Carbon;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Cast attributes, spelled out because static analysis reads the database
 * schema and would otherwise see the raw column types rather than what the
 * casts hand back at runtime.
 *
 * @property int $id
 * @property Carbon|null $deleted_at
 * @property array<string, mixed>|null $production_rate_snapshot
 * @property Carbon|null $order_date
 * @property Carbon|null $due_date
 * @property float $total_amount
 * @property float $discount_percent
 * @property float $discount_amount
 * @property float $net_amount
 * @property array<string, mixed>|null $shipping_delivery_info
 * @property OrderStatus|null $order_status
 * @property string $order_code
 * @property int $customer_id
 * @property int|null $branch_id
 * @property int|null $creator_user_id
 * @property string|null $job_name
 * @property string|null $job_type
 * @property string|null $delivery_method
 * @property string|null $shipping_address
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Customer|null $customer
 * @property-read Branch|null $branch
 * @property-read User|null $creatorUser
 */
class Order extends Model implements HasMedia
{
    use HasFactory, InteractsWithMedia, SoftDeletes;

    /**
     * @var array<int, string>
     */
    protected $guarded = [];

    /**
     * @var list<string>
     */
    protected $appends = [
        'artwork_url',
        'shirt_artwork_url',
        'pants_artwork_url',
        'shirt_artwork_urls',
        'pants_artwork_urls',
        'sports_day_artwork_urls',
        'pe_uniform_artwork_urls',
        'reference_designs',
    ];

    protected function casts(): array
    {
        return [
            'production_rate_snapshot' => 'array',
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

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * @return BelongsTo<Branch, $this>
     */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creatorUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creator_user_id');
    }

    /**
     * @return HasOne<OrderSpecification, $this>
     */
    public function specification(): HasOne
    {
        return $this->hasOne(OrderSpecification::class);
    }

    /**
     * @return HasMany<OrderItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /**
     * @return HasMany<OrderStatusHistory, $this>
     */
    public function statusHistories(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class);
    }

    /**
     * @return HasMany<OrderRouting, $this>
     */
    public function routings(): HasMany
    {
        return $this->hasMany(OrderRouting::class);
    }

    /**
     * @return HasMany<Receipt, $this>
     */
    public function receipts(): HasMany
    {
        return $this->hasMany(Receipt::class);
    }

    /**
     * @return HasMany<CuttingOrder, $this>
     */
    public function cuttingOrders(): HasMany
    {
        return $this->hasMany(CuttingOrder::class);
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('artwork')->singleFile();
        $this->addMediaCollection('shirt_artwork');
        $this->addMediaCollection('pants_artwork');
        // Form 3 (กีฬาสี). One collection for the whole order; each file carries
        // a `sports_day_group` custom property naming the colour house it
        // belongs to, so the artwork follows that house onto its printed sheet.
        $this->addMediaCollection('sports_day_artwork');
        $this->addMediaCollection('pe_uniform_artwork');
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
     * ชุดพละ artwork grouped by the size table it belongs to, keyed 'kids' or
     * 'adults' so the form can hand each table back its own gallery.
     *
     * @return array<string, list<string>>
     */
    public function getPeUniformArtworkUrlsAttribute(): array
    {
        $grouped = [];

        foreach ($this->getMedia('pe_uniform_artwork') as $media) {
            $table = $media->getCustomProperty('pe_table');

            if ($table !== 'kids' && $table !== 'adults') {
                continue;
            }

            $grouped[$table][] = $media->getUrl();
        }

        return $grouped;
    }

    /**
     * @return array<int, string>
     */
    public function getShirtArtworkUrlsAttribute(): array
    {
        return $this->getMedia('shirt_artwork')
            ->map(fn (Media $media): string => $media->getUrl())
            ->toArray();
    }

    /**
     * Artwork grouped by colour house, keyed by the house index as a string so
     * it survives JSON encoding. Houses with no artwork are simply absent.
     *
     * @return array<array-key, list<string>>
     */
    public function getSportsDayArtworkUrlsAttribute(): array
    {
        $grouped = [];

        foreach ($this->getMedia('sports_day_artwork') as $media) {
            $groupIndex = $media->getCustomProperty('sports_day_group');

            if (! is_numeric($groupIndex)) {
                continue;
            }

            $grouped[(string) (int) $groupIndex][] = $media->getUrl();
        }

        return $grouped;
    }

    /**
     * @return array<int, string>
     */
    public function getPantsArtworkUrlsAttribute(): array
    {
        return $this->getMedia('pants_artwork')
            ->map(fn (Media $media): string => $media->getUrl())
            ->toArray();
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

    /**
     * The artwork collections a user may attach to and remove from. Anything
     * outside this list is off limits to the edit form's delete path.
     *
     * @return array<int, string>
     */
    public static function artworkCollections(): array
    {
        return ['artwork', 'shirt_artwork', 'pants_artwork', 'sports_day_artwork', 'pe_uniform_artwork', 'reference_designs'];
    }

    /**
     * Saved artwork with its media id, so the edit form can ask for a specific
     * image to be removed instead of guessing from a URL.
     *
     * @return array<int, array{id: int, url: string}>
     */
    public function artworkMedia(string $collection): array
    {
        return $this->getMedia($collection)
            ->map(fn (Media $media): array => ['id' => (int) $media->id, 'url' => $media->getUrl()])
            ->values()
            ->all();
    }
}
