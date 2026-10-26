'use client';

import { Alert, Button, Empty, Pagination, Skeleton } from 'antd';
import { SERVICE_TYPE, type HostMetrics } from '@xeprime/types';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import { useErrorMessage } from '@/i18n/use-error-message';
import { SHOP_LIST_LAYOUT_MAX_VEHICLES } from '../constants';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { useShopListings, type ShopListingFilters } from '../hooks/use-shop-listings';
import type { PublicShop } from '../types';
import { VehicleCard } from './VehicleCard';
import styles from './ShopVehicles.module.css';

const PAGE_SIZE = 12;

/** Chip dịch vụ — chọn MỘT (một yêu cầu thuê chỉ có một dịch vụ), bấm lại để bỏ. */
const SERVICE_CHIPS = [
  { key: 'withDriver', serviceType: SERVICE_TYPE.WITH_DRIVER },
  { key: 'longTerm', serviceType: SERVICE_TYPE.LONG_TERM },
] as const;

/** Chip tiện ích — bật/tắt độc lập, cộng dồn bằng AND như ở trang tìm kiếm. */
const TOGGLE_CHIPS = ['delivery', 'instantBook', 'noCollateral', 'vatInvoice'] as const;

type FilterCounts = PublicShop['vehicleFilterCounts'];

/**
 * "Xe đang cho thuê" của trang gian hàng — client island (thẻ xe có nút yêu thích, bộ lọc và
 * phân trang sống ở URL qua `useMarketplaceFilters`, ADR 0004).
 *
 * ## Hai bố cục theo QUY MÔ đội xe
 *
 *   ≤ `SHOP_LIST_LAYOUT_MAX_VEHICLES` xe — thẻ NGANG (Figma `20058:73312`): ít xe thì mỗi xe có
 *     chỗ cho đủ thông số và ba chỉ số của chủ xe; không có bộ lọc, vì lọc ba chiếc xe không giúp
 *     ai tìm nhanh hơn.
 *   nhiều hơn — lưới thẻ đứng (Figma `20063:59271`) kèm tab tỉnh/thành và chip lọc.
 *
 * Ngưỡng đếm trên TỔNG số xe công khai của gian hàng (từ hồ sơ), không trên kết quả đã lọc: bố cục
 * không được lật qua lại mỗi lần khách bấm chip. Ở bố cục ngang, bộ lọc trên URL (link chia sẻ từ
 * lúc đội xe còn đông) bị bỏ qua — không có nút nào để khách tự gỡ nó.
 *
 * ## Chip nào hiện ra cũng có xe
 *
 * Số xe của từng chip đến từ hồ sơ (`vehicleFilterCounts`), đếm bằng chính bộ lọc của danh sách.
 * Chip 0 xe bị ẩn — trừ khi nó đang bật (link cũ), để khách luôn tắt được thứ đang lọc mình.
 */
export function ShopVehicles({
  slug,
  vehicleCount,
  metrics,
  provinces,
  filterCounts,
}: {
  slug: string;
  vehicleCount: number;
  metrics: HostMetrics;
  provinces: PublicShop['serviceProvinces'];
  filterCounts: FilterCounts;
}) {
  const t = useTranslations('Shops');
  const errorMessage = useErrorMessage();
  const { filters, setFilters } = useMarketplaceFilters();

  const layout = vehicleCount <= SHOP_LIST_LAYOUT_MAX_VEHICLES ? 'list' : 'grid';
  const filterable = layout === 'grid';
  const page = filterable && filters.page && filters.page > 0 ? filters.page : 1;

  const activeFilters: ShopListingFilters = filterable
    ? {
        provinceCode: filters.provinceCode,
        serviceType: filters.serviceType,
        delivery: filters.delivery,
        instantBook: filters.instantBook,
        noCollateral: filters.noCollateral,
        vatInvoice: filters.vatInvoice,
      }
    : {};
  const hasActiveFilter = Object.values(activeFilters).some(Boolean);

  const { data, isLoading, isError, error } = useShopListings(slug, page, activeFilters);
  const total = data?.meta.total ?? 0;

  const serviceChips = SERVICE_CHIPS.filter(
    (chip) => filterCounts[chip.key] > 0 || filters.serviceType === chip.serviceType,
  );
  const toggleChips = TOGGLE_CHIPS.filter((key) => filterCounts[key] > 0 || filters[key]);
  const showProvinceTabs = filterable && provinces.length > 1;
  const showChips = filterable && serviceChips.length + toggleChips.length > 0;

  function clearFilters() {
    setFilters({
      provinceCode: undefined,
      serviceType: undefined,
      delivery: false,
      instantBook: false,
      noCollateral: false,
      vatInvoice: false,
    });
  }

  return (
    <section className={styles.section} aria-labelledby="shop-vehicles-title">
      <div className={styles.head}>
        <h2 id="shop-vehicles-title" className={styles.title}>
          {total > 0 ? t('vehicles.titleWithCount', { count: total }) : t('vehicles.title')}
        </h2>

        {showProvinceTabs ? (
          <div
            className={styles.chips}
            role="group"
            aria-label={t('vehicleFilters.provinceLabel')}
          >
            <FilterChip
              label={t('vehicleFilters.all')}
              active={!filters.provinceCode}
              onClick={() => setFilters({ provinceCode: undefined })}
            />
            {provinces.map((province) => (
              <FilterChip
                key={province.code}
                label={province.name}
                active={filters.provinceCode === province.code}
                onClick={() => setFilters({ provinceCode: province.code })}
              />
            ))}
          </div>
        ) : null}
      </div>

      {showChips ? (
        <div className={styles.chips} role="group" aria-label={t('vehicleFilters.label')}>
          {serviceChips.map((chip) => {
            const active = filters.serviceType === chip.serviceType;
            return (
              <FilterChip
                key={chip.key}
                label={t(`vehicleFilters.${chip.key}`)}
                active={active}
                onClick={() => setFilters({ serviceType: active ? undefined : chip.serviceType })}
              />
            );
          })}
          {toggleChips.map((key) => (
            <FilterChip
              key={key}
              label={t(`vehicleFilters.${key}`)}
              active={Boolean(filters[key])}
              onClick={() => setFilters({ [key]: !filters[key] })}
            />
          ))}
        </div>
      ) : null}

      {isError ? (
        <Alert
          type="error"
          showIcon
          title={t('vehicles.loadError')}
          description={errorMessage(error)}
        />
      ) : isLoading ? (
        layout === 'list' ? (
          <div className={styles.list}>
            {Array.from({ length: Math.max(1, vehicleCount) }).map((_, i) => (
              <div key={i} className={cx(styles.skeleton, styles.skeletonRow)}>
                <Skeleton.Image active className={styles.skeletonRowImg} />
                <Skeleton active paragraph={{ rows: 3 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.grid}>
            {Array.from({ length: Math.min(PAGE_SIZE, vehicleCount) }).map((_, i) => (
              <div key={i} className={styles.skeleton}>
                <Skeleton.Image active className={styles.skeletonImg} />
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            ))}
          </div>
        )
      ) : total === 0 ? (
        hasActiveFilter ? (
          <Empty className={styles.empty} description={t('vehicleFilters.emptyFiltered')}>
            <Button onClick={clearFilters}>{t('vehicleFilters.clear')}</Button>
          </Empty>
        ) : (
          <Empty className={styles.empty} description={t('vehicles.empty')} />
        )
      ) : layout === 'list' ? (
        <div className={styles.list}>
          {data?.listings.map((listing) => (
            <VehicleCard key={listing.id} listing={listing} variant="list" hostMetrics={metrics} />
          ))}
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {data?.listings.map((listing) => (
              <VehicleCard key={listing.id} listing={listing} />
            ))}
          </div>
          {total > PAGE_SIZE ? (
            <div className={styles.pager}>
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={total}
                showSizeChanger={false}
                onChange={(next) => setFilters({ page: next > 1 ? next : undefined })}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Chip lọc dạng viên (Figma "_Card Filter") — `aria-pressed` nói trạng thái bật/tắt. */
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cx(styles.chip, active && styles.chipActive)}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
