'use client';

import { Alert, Empty, Pagination, Skeleton } from 'antd';
import { VEHICLE_TYPE_LABEL, VEHICLE_TYPE_VALUES } from '@xeprime/types';
import { cx } from '@/lib/cx';
import { getErrorMessage } from '@/services/api-client';
import { SORT_CHIPS } from '../constants';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { usePublicListings } from '../hooks/use-public-listings';
import { VehicleCard } from './VehicleCard';
import styles from './VehicleRecommendations.module.css';

const PAGE_SIZE = 8;

export function VehicleRecommendations() {
  const { filters, setFilters } = useMarketplaceFilters();
  const page = filters.page ?? 1;
  const { data, isLoading, isError, error } = usePublicListings({
    ...filters,
    page,
    limit: PAGE_SIZE,
  });

  const activeType = filters.vehicleType ?? 'all';
  const activeSort = filters.sort ?? 'newest';
  const total = data?.meta.total ?? 0;

  return (
    <section className={styles.section} aria-labelledby="rec-title">
      <header className={styles.head}>
        <div>
          <h2 id="rec-title" className={styles.title}>
            Xe cho thuê gợi ý
          </h2>
          <p className={styles.count}>
            {isLoading ? 'Đang tìm xe…' : `${total} xe khả dụng`}
          </p>
        </div>
      </header>

      {/* Chip loại xe — filter đẩy ra URL (ADR 0004) */}
      <div className={styles.chips} role="tablist" aria-label="Lọc loại xe">
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
        {SORT_CHIPS.map((s) => (
          <Chip key={s.key} active={activeSort === s.key} onClick={() => setFilters({ sort: s.key })}>
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
        <Empty
          className={styles.empty}
          description="Chưa có xe phù hợp bộ lọc. Thử bỏ bớt điều kiện."
        />
      ) : (
        <>
          <div className={styles.grid}>
            {data?.listings.map((listing) => <VehicleCard key={listing.id} listing={listing} />)}
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
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
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
