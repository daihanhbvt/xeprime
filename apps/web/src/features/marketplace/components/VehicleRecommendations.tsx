'use client';

import { FilterOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, Badge, Button, Drawer, Empty, Modal, Pagination, Select, Skeleton } from 'antd';
import { useState, type ReactNode } from 'react';
import {
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPE_VALUES,
  type VehicleType,
} from '@xeprime/types';
import { cx } from '@/lib/cx';
import { useIsMobile } from '@/hooks/use-media-query';
import { getErrorMessage } from '@/services/api-client';
import { PRICE_RANGES, SEAT_OPTIONS, SERVICE_CHIPS, SORT_CHIPS } from '../constants';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { usePublicListings } from '../hooks/use-public-listings';
import { VehicleCard } from './VehicleCard';
import styles from './VehicleRecommendations.module.css';

const PAGE_SIZE = 8;

/**
 * Khối "xe gợi ý" — nguồn dữ liệu duy nhất là `/public/listings`; mọi filter/paging đẩy ra URL
 * searchParams (ADR 0004) nên link chia sẻ được và nút back hoạt động. Lọc/sort/phân trang đều
 * chạy ở server, FE không tự cắt mảng.
 */
export function VehicleRecommendations() {
  const { filters, setFilters } = useMarketplaceFilters();
  const isMobile = useIsMobile();
  const [filterOpen, setFilterOpen] = useState(false);

  const page = filters.page ?? 1;
  const { data, isLoading, isError, error } = usePublicListings({
    ...filters,
    page,
    limit: PAGE_SIZE,
  });

  const activeType = filters.vehicleType ?? 'all';
  const activeSort = filters.sort ?? 'newest';
  const total = data?.meta.total ?? 0;

  const heading =
    filters.vehicleType && filters.vehicleType !== 'all'
      ? `${VEHICLE_TYPE_LABEL[filters.vehicleType as VehicleType] ?? 'Xe'} gợi ý`
      : 'Xe cho thuê gợi ý';

  // Số filter đang bật (ngoài loại xe/sort) — hiện badge trên nút "Bộ lọc".
  const advancedCount = [
    filters.serviceType,
    filters.minSeats,
    filters.priceMin ?? filters.priceMax,
    filters.province,
  ].filter((v) => v !== undefined && v !== null).length;

  function clearAll() {
    setFilters({
      vehicleType: undefined,
      serviceType: undefined,
      minSeats: undefined,
      priceMin: undefined,
      priceMax: undefined,
      province: undefined,
    });
  }

  const filterFields = (
    <FilterFields
      filters={filters}
      setFilters={setFilters}
      onClear={() => {
        clearAll();
        setFilterOpen(false);
      }}
    />
  );

  return (
    <section className={styles.section} aria-labelledby="rec-title">
      <header className={styles.head}>
        <div>
          <h2 id="rec-title" className={styles.title}>
            {heading}
          </h2>
          <p className={styles.count}>{isLoading ? 'Đang tìm xe…' : `${total} xe khả dụng`}</p>
        </div>
        {advancedCount > 0 || activeType !== 'all' ? (
          <button type="button" className={styles.seeAll} onClick={clearAll}>
            Xem tất cả <RightOutlined />
          </button>
        ) : null}
      </header>

      {/* Chip lọc nhanh — filter đẩy ra URL (ADR 0004) */}
      <div className={styles.chips} role="tablist" aria-label="Lọc xe">
        <Badge count={advancedCount} size="small" offset={[-4, 4]}>
          <button
            type="button"
            className={cx(styles.chip, styles.chipFilter)}
            onClick={() => setFilterOpen(true)}
          >
            <FilterOutlined /> Bộ lọc
          </button>
        </Badge>

        <Chip active={activeType === 'all'} onClick={() => setFilters({ vehicleType: undefined })}>
          Tất cả
        </Chip>
        {VEHICLE_TYPE_VALUES.map((type) => (
          <Chip
            key={type}
            active={activeType === type}
            onClick={() => setFilters({ vehicleType: type })}
          >
            {VEHICLE_TYPE_LABEL[type]}
          </Chip>
        ))}

        <span className={styles.chipDivider} aria-hidden="true" />
        {SERVICE_CHIPS.map((s) => (
          <Chip
            key={s.key}
            active={filters.serviceType === s.key}
            onClick={() =>
              setFilters({ serviceType: filters.serviceType === s.key ? undefined : s.key })
            }
          >
            {s.label}
          </Chip>
        ))}

        <span className={styles.chipDivider} aria-hidden="true" />
        {SORT_CHIPS.map((s) => (
          <Chip
            key={s.key}
            active={activeSort === s.key}
            onClick={() => setFilters({ sort: s.key })}
          >
            {s.label}
          </Chip>
        ))}
      </div>

      {isError ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được danh sách xe"
          description={getErrorMessage(error)}
        />
      ) : isLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className={styles.skeleton}>
              <Skeleton.Image active className={styles.skeletonImg} />
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <Empty className={styles.empty} description="Chưa có xe phù hợp bộ lọc.">
          <Button onClick={clearAll}>Xoá bộ lọc</Button>
        </Empty>
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
                onChange={(next) => setFilters({ page: next })}
              />
            </div>
          ) : null}
        </>
      )}

      {/* Mobile: bottom-sheet; desktop: modal — cùng một nội dung filter. */}
      {isMobile ? (
        <Drawer
          title="Bộ lọc"
          placement="bottom"
          size="auto"
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
        >
          {filterFields}
        </Drawer>
      ) : (
        <Modal
          title="Bộ lọc"
          open={filterOpen}
          onCancel={() => setFilterOpen(false)}
          footer={null}
          width={420}
        >
          {filterFields}
        </Modal>
      )}
    </section>
  );
}

/** Các filter ít dùng hơn — gom vào drawer/modal để thanh chip không quá tải. */
function FilterFields({
  filters,
  setFilters,
  onClear,
}: {
  filters: ReturnType<typeof useMarketplaceFilters>['filters'];
  setFilters: ReturnType<typeof useMarketplaceFilters>['setFilters'];
  onClear: () => void;
}) {
  const priceKey =
    PRICE_RANGES.find((r) => r.min === filters.priceMin && r.max === filters.priceMax)?.key ?? 'all';
  const seatKey = SEAT_OPTIONS.find((s) => s.minSeats === filters.minSeats)?.key ?? 'all';

  return (
    <div className={styles.filterForm}>
      <label className={styles.filterField}>
        <span className={styles.filterLabel}>Số chỗ</span>
        <Select
          size="large"
          value={seatKey}
          options={SEAT_OPTIONS.map((s) => ({ value: s.key, label: s.label }))}
          onChange={(key) => setFilters({ minSeats: SEAT_OPTIONS.find((s) => s.key === key)?.minSeats })}
        />
      </label>

      <label className={styles.filterField}>
        <span className={styles.filterLabel}>Khoảng giá / ngày</span>
        <Select
          size="large"
          value={priceKey}
          options={PRICE_RANGES.map((r) => ({ value: r.key, label: r.label }))}
          onChange={(key) => {
            const range = PRICE_RANGES.find((r) => r.key === key);
            setFilters({ priceMin: range?.min, priceMax: range?.max });
          }}
        />
      </label>

      {filters.province ? (
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Địa điểm</span>
          <Button block onClick={() => setFilters({ province: undefined })}>
            Bỏ lọc “{filters.province}”
          </Button>
        </label>
      ) : null}

      <Button block onClick={onClear}>
        Xoá tất cả bộ lọc
      </Button>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cx(styles.chip, active && styles.chipActive)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
