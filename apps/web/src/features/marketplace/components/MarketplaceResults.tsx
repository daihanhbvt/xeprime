'use client';

import { EmptyState } from '@/components/feedback/EmptyState';
import { CtaButton } from './CtaButton';
import { CloseOutlined } from '@ant-design/icons';
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
import { LineIcon } from '@/components/icons/LineIcon';
import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { FACET_FILTER_KEYS } from '../filter-params';
import { provinceLabelOf } from '../province-options';
import { useAllDestinations } from '../hooks/use-destinations';
import { useInfinitePublicListings } from '../hooks/use-infinite-listings';
import { useViewMode, type ViewMode } from '../hooks/use-view-mode';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { usePriceBandLabel } from '../search/use-price-band-label';
import type { MarketplaceFilters } from '../types';
import { SearchExperienceProvider } from '../search/search-context';
import { SearchHeroBanner } from '../search/SearchHeroBanner';
import { StickySearchHeader } from '../search/StickySearchHeader';
import { FilterModal } from './FilterModal';
import { SearchDialog } from './SearchDialog';
import { staggerFastClass, viewEnterClass } from '@/components/motion/motion-classes';
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

  // Chế độ hiển thị dùng chung kho với nút chuyển ở hàng viên lọc (hero + thanh cố định).
  const [viewMode] = useViewMode();
  // Điện thoại (≤640px) không có chế độ danh sách (Figma "List - MB" chỉ có thẻ lưới): dù
  // localStorage nhớ "list" từ desktop, ở đây luôn dựng thẻ lưới. Nút chuyển chỉ có ở desktop.
  const isMobile = useIsMobile();
  const effectiveViewMode: ViewMode = isMobile ? 'grid' : viewMode;
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

    // Nhu cầu (Tự lái / Có tài xế / Thuê dài hạn) là viên lọc ở hàng pill — hiện thành chip để
    // khách thấy nó đang thu hẹp kết quả; gỡ thì bỏ luôn lộ trình đi kèm "Có tài xế".
    if (filters.serviceType)
      chips.push({
        key: `service-${filters.serviceType}`,
        label: domainLabel('serviceType', filters.serviceType),
        onRemove: () => setFilters({ serviceType: undefined, routeType: undefined }),
      });

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
        label: domainLabel(
          'transmissionType',
          v,
          TRANSMISSION_TYPE_EXT_LABEL[v as TransmissionTypeExt] ?? v,
        ),
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

  /** Xoá mọi chip đang hiện (bộ lọc + nhu cầu) — giữ ngữ cảnh tìm kiếm (tỉnh/ngày/loại xe). */
  function clearFacets() {
    setFilters({
      ...Object.fromEntries(FACET_FILTER_KEYS.map((key) => [key, undefined])),
      serviceType: undefined,
      routeType: undefined,
    });
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
        <div className={styles.infoBlock}>
          {/*
            Figma 19707:80489 › "Thông tin kết quả" (22230:58257): MỘT dòng - chip bộ lọc đang áp +
            "↻ Xoá bộ lọc" bên trái, "Sắp xếp" bên phải. Số kết quả / khu vực không còn hiện, chỉ giữ
            cho trình đọc màn hình; nút lưới/danh sách đã lên hàng viên lọc của hero.
          */}
          <div className={styles.srOnly} aria-live="polite">
            <span>
              {initialError
                ? tCommon('labels.emptyValue')
                : isInitialLoading
                  ? t('searching')
                  : filters.q
                    ? t('availableFor', { count: total, q: filters.q })
                    : t('foundCount', { count: total })}
            </span>
            {locationSubtitle ? <span> {locationSubtitle}</span> : null}
          </div>

          <div className={styles.toolbar}>
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
                <button
                  type="button"
                  className={styles.clearAll}
                  onClick={clearFacets}
                  aria-label={t('clearAllAria')}
                >
                  {/* Figma "Rotate Right" vàng + "Xoá bộ lọc"; điện thoại chỉ còn icon, ghim mép phải. */}
                  <LineIcon name="rotate-right" className={styles.clearAllIcon} />
                  <span className={styles.clearAllText}>{t('clearFilters')}</span>
                </button>
              </div>
            ) : null}

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
                  popupMatchSelectWidth={false}
                  suffixIcon={<LineIcon name="chevron-down" className={styles.sortCaret} />}
                  aria-label={t('sortAriaLabel')}
                />
              </label>
            </div>
          </div>
        </div>

        {/* --- Thân kết quả: 4 trạng thái loại trừ nhau ----------------------------------- */}
        {initialError ? (
          <EmptyState
            variant="error"
            title={t('loadErrorTitle')}
            description={errorMessage(initialError)}
            onRetry={retryInitial}
          />
        ) : isInitialLoading ? (
          <div className={styles.grid} aria-busy="true" aria-label={t('loadingLabel')}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          // Trạng thái rỗng chung (Figma "States Page" `22306:67026`) - cùng component với mọi màn.
          filters.q ? (
            <EmptyState
              variant="no-results"
              title={t('emptyKeywordTitle', { q: filters.q })}
              description={t('emptyKeywordDesc')}
              action={
                <CtaButton onClick={() => setFilters({ q: undefined })}>
                  {t('clearKeyword')}
                </CtaButton>
              }
              {...(appliedChips.length > 0
                ? {
                    secondaryAction: (
                      <button type="button" className={styles.stateLink} onClick={clearFacets}>
                        {tFilters('clear')}
                      </button>
                    ),
                  }
                : {})}
            />
          ) : hasActiveQuery ? (
            <EmptyState
              variant="no-results"
              title={t('emptyFilteredTitle')}
              description={t('emptyFilteredDesc')}
              action={<CtaButton onClick={clearFacets}>{tFilters('clear')}</CtaButton>}
              secondaryAction={
                <button
                  type="button"
                  className={styles.stateLink}
                  onClick={() => setEditOpen(true)}
                >
                  {t('changeTimeOrPlace')}
                </button>
              }
            />
          ) : (
            <EmptyState
              variant="no-results"
              title={t('emptySystemTitle')}
              description={t('emptySystemDesc')}
            />
          )
        ) : (
          <>
            {/* Hiển thị danh sách xe theo dạng Thẻ (Grid) hoặc Danh sách (List) */}
            {effectiveViewMode === 'grid' ? (
              <ul className={cx(styles.grid, staggerFastClass, viewEnterClass)}>
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
              <ul className={cx(styles.list, staggerFastClass, viewEnterClass)}>
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
