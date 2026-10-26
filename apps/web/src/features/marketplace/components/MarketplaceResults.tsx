'use client';

import {
  AppstoreOutlined,
  CloseOutlined,
  FilterOutlined,
  ReloadOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Button, Select, Skeleton } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_LISTING_SORT,
  LISTING_AMENITY_LABEL,
  LISTING_AMENITY_VALUES,
  LISTING_SORT_LABEL,
  LISTING_SORT_VALUES,
  SEAT_BUCKET_LABEL,
  TRANSMISSION_TYPE_EXT_LABEL,
  type ListingSort,
  type SeatBucket,
  type TransmissionTypeExt,
} from '@xeprime/types';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { cx } from '@/lib/cx';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { FACET_FILTER_KEYS } from '../filter-params';
import { provinceLabelOf } from '../province-options';
import { useAllDestinations } from '../hooks/use-destinations';
import { useInfinitePublicListings } from '../hooks/use-infinite-listings';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { usePriceBandLabel } from '../search/use-price-band-label';
import type { MarketplaceFilters } from '../types';
import { SearchExperienceProvider } from '../search/search-context';
import { SearchHeroBanner } from '../search/SearchHeroBanner';
import { StickySearchHeader } from '../search/StickySearchHeader';
import { FilterModal } from './FilterModal';
import { SearchDialog } from './SearchDialog';
import { VehicleCard } from './VehicleCard';
import styles from './MarketplaceResults.module.css';
import { useTranslations } from 'next-intl';
import { useErrorMessage } from '@/i18n/use-error-message';

/** Số ô khung chờ — bằng đúng cỡ trang của API để lưới không đổi hình khi dữ liệu về. */
const SKELETON_COUNT = 12;

export function MarketplaceResults() {
  return (
    <SearchExperienceProvider>
      <MarketplaceResultsContent />
    </SearchExperienceProvider>
  );
}

function MarketplaceResultsContent() {
  const errorMessage = useErrorMessage();
  const tFilters = useTranslations('Marketplace.filterPanel');
  const tCommon = useTranslations('Common');
  const t = useTranslations('Marketplace.results');
  const tLocation = useTranslations('HomeSearch.location');
  const domainLabel = useDomainLabel();
  const priceBandLabel = usePriceBandLabel();

  const { filters, setFilters } = useMarketplaceFilters();
  const { data: destinations } = useAllDestinations();
  const { brandLabel, bodyTypeLabel, fuelTypeLabel, featureLabel } = useCatalogLabels();

  // Chế độ hiển thị: 'grid' (mặc định) hoặc 'list' (thẻ ngang 1200px)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const {
    listings,
    total,
    isInitialLoading,
    initialError,
    appendError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    retryInitial,
    retryNextPage,
  } = useInfinitePublicListings(filters);

  // --- Sentinel tải trang kế -------------------------------------------------------------
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fetchNextPage();
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, listings.length]);

  // --- Chip filter ĐANG ÁP DỤNG (Figma: Số tự động ⊗ · Dưới 500k ⊗ · Xoá bộ lọc) ---------
  const appliedChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    const removeFrom = (field: keyof MarketplaceFilters, value: string) => () =>
      setFilters({ [field]: (filters[field] as string[]).filter((v) => v !== value) });

    for (const v of filters.bodyType ?? [])
      chips.push({
        key: `body-${v}`,
        label: bodyTypeLabel(v) ?? v,
        onRemove: removeFrom('bodyType', v),
      });
    for (const v of filters.motorbikeCategory ?? [])
      chips.push({
        key: `moto-${v}`,
        label: domainLabel('motorbikeCategory', v),
        onRemove: removeFrom('motorbikeCategory', v),
      });
    for (const v of filters.brand ?? [])
      chips.push({
        key: `brand-${v}`,
        label: brandLabel(v) ?? v,
        onRemove: removeFrom('brand', v),
      });
    for (const v of filters.transmission ?? [])
      chips.push({
        key: `trans-${v}`,
        label: domainLabel('transmissionType', v, TRANSMISSION_TYPE_EXT_LABEL[v as TransmissionTypeExt] ?? v),
        onRemove: removeFrom('transmission', v),
      });
    for (const v of filters.seats ?? [])
      chips.push({
        key: `seats-${v}`,
        label: domainLabel('seatBucket', v, SEAT_BUCKET_LABEL[v as SeatBucket] ?? v),
        onRemove: removeFrom('seats', v),
      });
    for (const v of filters.fuelType ?? [])
      chips.push({
        key: `fuel-${v}`,
        label: fuelTypeLabel(v) ?? v,
        onRemove: removeFrom('fuelType', v),
      });
    for (const v of filters.features ?? [])
      chips.push({ key: `feat-${v}`, label: featureLabel(v), onRemove: removeFrom('features', v) });
    for (const amenity of LISTING_AMENITY_VALUES)
      if (filters[amenity])
        chips.push({
          key: `amenity-${amenity}`,
          label: domainLabel('listingAmenity', amenity, LISTING_AMENITY_LABEL[amenity]),
          onRemove: () => setFilters({ [amenity]: undefined }),
        });
    if (filters.instantBook)
      chips.push({
        key: 'instantBook',
        label: tFilters('modal.chips.instantBook'),
        onRemove: () => setFilters({ instantBook: undefined }),
      });
    if (filters.minRating != null)
      chips.push({
        key: 'minRating',
        label: tFilters('modal.ratingFrom', { rating: filters.minRating }),
        onRemove: () => setFilters({ minRating: undefined }),
      });
    if (filters.priceMin != null || filters.priceMax != null) {
      chips.push({
        key: 'price',
        label: priceBandLabel({ min: filters.priceMin, max: filters.priceMax }),
        onRemove: () => setFilters({ priceMin: undefined, priceMax: undefined }),
      });
    }
    return chips;
  }, [
    filters,
    setFilters,
    brandLabel,
    bodyTypeLabel,
    fuelTypeLabel,
    featureLabel,
    domainLabel,
    priceBandLabel,
    tFilters,
  ]);

  /** Xoá đúng nhóm chip của panel Bộ lọc — giữ ngữ cảnh tìm kiếm (tỉnh/ngày/loại xe/dịch vụ). */
  function clearFacets() {
    setFilters(Object.fromEntries(FACET_FILTER_KEYS.map((key) => [key, undefined])));
  }

  const hasActiveQuery = Boolean(
    appliedChips.length > 0 ||
    filters.q ||
    filters.provinceCode ||
    filters.province ||
    filters.vehicleType ||
    filters.serviceType ||
    filters.pickupAt,
  );

  const locationSubtitle =
    provinceLabelOf(destinations, filters.provinceCode) ??
    (filters.provinceCode || filters.province ? tLocation('unavailable') : tLocation('nationwide'));

  const sort = filters.sort ?? DEFAULT_LISTING_SORT;

  return (
    <section className={styles.workspace} aria-labelledby="search-title">
      <h1 id="search-title" className={styles.srOnly}>
        {t('title')}
      </h1>

      {/* Cụm tìm kiếm dính cố định trên cùng khi scroll xuống > 140px */}
      <StickySearchHeader
        onOpenFilterModal={() => setFilterModalOpen(true)}
        appliedCount={appliedChips.length}
      />

      {/* Hero Banner đen ánh vàng sang trọng ở đỉnh trang (Figma) */}
      <SearchHeroBanner
        onOpenFilterModal={() => setFilterModalOpen(true)}
        appliedCount={appliedChips.length}
      />

      {/* Vùng kết quả tìm kiếm */}
      <div className={styles.container}>
        {/* Toolbar kết quả: Tiêu đề + Vị trí + Sắp xếp + Chuyển Grid/List */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarHeader}>
            <div className={styles.toolbarLeft}>
              <span className={styles.count} aria-live="polite">
                {initialError
                  ? tCommon('labels.emptyValue')
                  : isInitialLoading
                    ? t('searching')
                    : filters.q
                      ? t('availableFor', { count: total, q: filters.q })
                      : t('foundCount', { count: total })}
              </span>
            </div>
            {locationSubtitle ? (
              <p className={styles.locationSubtitle}>{locationSubtitle}</p>
            ) : null}
          </div>

          <div className={styles.toolbarRight}>
            <label className={styles.sort}>
              <span className={styles.sortLabel}>{t('sortLabel')}</span>
              <Select
                value={sort}
                onChange={(value: ListingSort) =>
                  setFilters({ sort: value === DEFAULT_LISTING_SORT ? undefined : value })
                }
                options={LISTING_SORT_VALUES.map((value) => ({
                  value,
                  label: domainLabel('listingSort', value, LISTING_SORT_LABEL[value]),
                }))}
                className={styles.sortSelect}
                size="large"
                popupMatchSelectWidth={false}
                aria-label={t('sortAriaLabel')}
              />
            </label>

            {/* Nút chuyển đổi View Mode: Grid (mặc định) & List */}
            <div className={styles.viewModeGroup} role="group" aria-label={t('viewMode')}>
              <button
                type="button"
                className={cx(styles.viewModeBtn, viewMode === 'grid' && styles.viewModeActive)}
                onClick={() => setViewMode('grid')}
                title={t('viewGrid')}
                aria-label={t('viewGrid')}
                aria-pressed={viewMode === 'grid'}
              >
                <AppstoreOutlined />
              </button>
              <button
                type="button"
                className={cx(styles.viewModeBtn, viewMode === 'list' && styles.viewModeActive)}
                onClick={() => setViewMode('list')}
                title={t('viewList')}
                aria-label={t('viewList')}
                aria-pressed={viewMode === 'list'}
              >
                <UnorderedListOutlined />
              </button>
            </div>
          </div>
        </div>

        {/* Chip filter đang áp dụng */}
        {appliedChips.length > 0 ? (
          <div className={styles.appliedRow}>
            {appliedChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={styles.appliedChip}
                onClick={chip.onRemove}
                aria-label={t('removeFilter', { label: chip.label })}
              >
                {chip.label} <CloseOutlined className={styles.appliedX} />
              </button>
            ))}
            <button type="button" className={styles.clearAll} onClick={clearFacets}>
              {t('clearAll')}
            </button>
          </div>
        ) : null}

        {/* --- Thân kết quả: 4 trạng thái loại trừ nhau ----------------------------------- */}
        {initialError ? (
          <div className={styles.stateBox} role="alert">
            <div className={styles.stateIcon}>
              <ReloadOutlined />
            </div>
            <h2 className={styles.stateTitle}>{t('loadErrorTitle')}</h2>
            <p className={styles.stateDesc}>{errorMessage(initialError)}</p>
            <Button type="primary" onClick={retryInitial}>
              {tCommon('actions.retry')}
            </Button>
          </div>
        ) : isInitialLoading ? (
          <div className={styles.grid} aria-busy="true" aria-label={t('loadingLabel')}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          filters.q ? (
            <div className={styles.stateBox}>
              <div className={styles.stateIcon} aria-hidden>
                <SearchOutlined />
              </div>
              <h2 className={styles.stateTitle}>{t('emptyKeywordTitle', { q: filters.q })}</h2>
              <p className={styles.stateDesc}>{t('emptyKeywordDesc')}</p>
              <Button type="primary" onClick={() => setFilters({ q: undefined })}>
                {t('clearKeyword')}
              </Button>
              {appliedChips.length > 0 ? (
                <button type="button" className={styles.stateLink} onClick={clearFacets}>
                  {tFilters('clear')}
                </button>
              ) : null}
            </div>
          ) : hasActiveQuery ? (
            <div className={styles.stateBox}>
              <div className={styles.stateIcon} aria-hidden>
                <FilterOutlined />
              </div>
              <h2 className={styles.stateTitle}>{t('emptyFilteredTitle')}</h2>
              <p className={styles.stateDesc}>{t('emptyFilteredDesc')}</p>
              <Button type="primary" onClick={clearFacets}>
                {tFilters('clear')}
              </Button>
              <button type="button" className={styles.stateLink} onClick={() => setEditOpen(true)}>
                {t('changeTimeOrPlace')}
              </button>
            </div>
          ) : (
            <div className={styles.stateBox}>
              <div className={styles.stateIcon} aria-hidden>
                <FilterOutlined />
              </div>
              <h2 className={styles.stateTitle}>{t('emptySystemTitle')}</h2>
              <p className={styles.stateDesc}>{t('emptySystemDesc')}</p>
            </div>
          )
        ) : (
          <>
            {/* Hiển thị danh sách xe theo dạng Thẻ (Grid) hoặc Danh sách (List) */}
            {viewMode === 'grid' ? (
              <ul className={styles.grid}>
                {listings.map((listing) => (
                  <li key={listing.id} className={styles.cell}>
                    <VehicleCard listing={listing} variant="grid" />
                  </li>
                ))}
                {isFetchingNextPage
                  ? Array.from({ length: 4 }, (_, i) => (
                      <li key={`sk-${i}`} className={styles.cell}>
                        <CardSkeleton />
                      </li>
                    ))
                  : null}
              </ul>
            ) : (
              <ul className={styles.list}>
                {listings.map((listing) => (
                  <li key={listing.id}>
                    <VehicleCard listing={listing} variant="list" />
                  </li>
                ))}
                {isFetchingNextPage
                  ? Array.from({ length: 2 }, (_, i) => (
                      <li key={`sk-list-${i}`}>
                        <CardSkeleton />
                      </li>
                    ))
                  : null}
              </ul>
            )}

            {/* Vùng đáy: sentinel + nút tải thêm + thông báo hết kết quả (Figma) */}
            <div className={styles.footerZone}>
              <div ref={sentinelRef} className={styles.sentinel} aria-hidden />
              <span className={styles.srOnly} aria-live="polite">
                {isFetchingNextPage ? t('loadingMore') : ''}
              </span>

              {appendError ? (
                <div className={styles.appendError} role="alert">
                  <span>{t('appendError', { reason: errorMessage(appendError) })}</span>
                  <Button size="small" onClick={retryNextPage}>
                    {tCommon('actions.retry')}
                  </Button>
                </div>
              ) : hasNextPage ? (
                <Button loading={isFetchingNextPage} onClick={fetchNextPage}>
                  {t('loadMore')}
                </Button>
              ) : listings.length > 0 ? (
                <div className={styles.endBanner}>
                  <h3 className={styles.endTitle}>{t('allViewed')}</h3>
                  <p className={styles.endSubtitle}>{t('allViewedDesc')}</p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Modal Bộ lọc chi tiết cho Ô tô & Xe máy */}
      <FilterModal open={filterModalOpen} onClose={() => setFilterModalOpen(false)} />

      {/* Modal chỉnh sửa tìm kiếm nhanh */}
      {editOpen ? (
        <SearchDialog
          open
          initial={filters}
          onClose={() => setEditOpen(false)}
          onSubmit={(values) => {
            setEditOpen(false);
            setFilters({
              vehicleType: values.vehicleType,
              provinceCode: values.provinceCode,
              province: undefined,
              pickupAt: values.pickupAt,
              returnAt: values.returnAt,
              hourly: values.hourly,
              routeType: values.routeType,
            });
          }}
        />
      ) : null}
    </section>
  );
}

/** Khung chờ đúng hình học thẻ thật (ảnh 16/10 + 3 dòng) — dữ liệu về không giật layout. */
function CardSkeleton() {
  return (
    <div className={styles.skeletonCard} aria-hidden>
      <div className={styles.skeletonMedia}>
        <Skeleton.Image active className={styles.skeletonImg} />
      </div>
      <Skeleton active paragraph={{ rows: 2 }} title={{ width: '70%' }} />
    </div>
  );
}
