'use client';

import { Alert, Button, Pagination, Skeleton } from 'antd';
import type { PaginationMeta } from '@xeprime/types';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/feedback/EmptyState';
import type { RowAction } from '@/components/data-display/RowActions';
import { useIsMobile } from '@/hooks/use-media-query';
import { useTranslations } from 'next-intl';
import { useVehicleAlerts } from '../hooks/use-vehicle-alerts';
import { useVehicleCardStats } from '../hooks/use-vehicle-card-stats';
import type { VehicleListItem } from '../types';
import { VehicleListRow } from './VehicleListRow';
import { VehicleManagementCard } from './VehicleManagementCard';
import styles from './VehicleCardGrid.module.css';

interface VehicleCardGridProps {
  items: VehicleListItem[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  emptyAction?: ReactNode;
  /** `shape` để nhãn hành động khớp bề mặt: thẻ desktop nhãn đầy đủ, hàng mobile nhãn rút gọn. */
  rowActions: (row: VehicleListItem, shape: 'card' | 'row') => RowAction[];
  onPageChange: (page: number, pageSize: number) => void;
}

/** Một hàng lưới đầy của bố cục desktop 5 cột (bản chỉnh 11/08/2026). */
const SKELETON_COUNT = 5;

/**
 * Danh sách xe của `/manage/vehicles` — hình thái DUY NHẤT của route này.
 *
 * Figma `186:1670` bọc lưới trong một **khung có viền**, và đặt dòng "Hiển thị x-y của N xe" cùng
 * bộ phân trang vào chân khung đó thay vì thả trôi dưới trang. Mọi trạng thái (rỗng, không kết
 * quả, lỗi, đang tải) đều nằm TRONG khung này — `188:1553`/`188:1685`/`188:2158` đều vẽ vậy —
 * nên khối nội dung không nhảy kích thước khi đổi trạng thái.
 *
 * Ở ≤640px chuyển sang `VehicleListRow` theo Figma `186:2374`: hàng ngang, không phải thẻ bóp nhỏ.
 */
export function VehicleCardGrid({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  emptyAction,
  rowActions,
  onPageChange,
}: VehicleCardGridProps) {
  const t = useTranslations('Vehicles.list.grid');
  const tCommon = useTranslations('Common.actions');
  const isMobile = useIsMobile();
  const ids = items.map((item) => item.id);
  const stats = useVehicleCardStats(ids);
  // Desktop và mobile dùng CÙNG một nguồn dữ liệu nghiệp vụ — khác nhau ở cách vẽ, không ở dữ liệu.
  const alerts = useVehicleAlerts(ids);

  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  function renderBody() {
    if (error) {
      return (
        <div className={styles.state}>
          <EmptyState
            variant="error"
            title={t('loadErrorTitle')}
            description={t('loadErrorBody')}
            onRetry={error.onRetry}
          />
        </div>
      );
    }

    if (loading && items.length === 0) {
      return (
        <div
          className={isMobile ? styles.list : styles.grid}
          role="status"
          aria-busy="true"
          aria-label={t('loading')}
        >
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <div key={index} className={isMobile ? styles.skeletonRow : styles.skeletonCard}>
              <Skeleton active avatar={{ shape: 'square' }} paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className={styles.state}>
          {filtered ? (
            <EmptyState
              variant="no-results"
              title={t('noResultsTitle')}
              description={t('noResultsBody')}
              action={
                onClearFilters ? (
                  <Button onClick={onClearFilters}>{tCommon('clear')}</Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              variant="empty"
              title={t('emptyTitle')}
              description={t('emptyBody')}
              action={emptyAction}
            />
          )}
        </div>
      );
    }

    const listProps = { 'aria-label': t('ariaLabel'), 'aria-busy': loading || undefined };
    /**
     * Cảnh báo hỏng KHÔNG làm hỏng danh sách xe — nhưng cũng KHÔNG được im lặng: một dải cảnh
     * báo gọn có nút thử lại, dùng `Alert`/`Button` sẵn có (không dựng hệ thống thông báo thứ hai).
     */
    const alertsBanner = alerts.isError ? (
      <Alert
        type="warning"
        showIcon
        className={styles.alertsBanner}
        message={t('alertsErrorTitle')}
        description={t('alertsErrorBody')}
        action={
          <Button size="small" onClick={alerts.refetch}>
            {tCommon('retry')}
          </Button>
        }
      />
    ) : null;

    const cardAlertState = {
      alertsLoading: alerts.isLoading,
      alertsFailed: alerts.isError,
    };

    return isMobile ? (
      <>
        {alertsBanner}
        <ul className={styles.list} {...listProps}>
          {items.map((item) => (
            <li key={item.id}>
              <VehicleListRow
                vehicle={item}
                stats={stats.byId.get(item.id)}
                statsLoading={stats.isLoading}
                statsFailed={stats.isError}
                alerts={alerts.byId.get(item.id)}
                {...cardAlertState}
                actions={rowActions(item, 'row')}
              />
            </li>
          ))}
        </ul>
      </>
    ) : (
      <>
        {alertsBanner}
        <ul className={styles.grid} {...listProps}>
          {items.map((item) => (
            <li key={item.id} className={styles.cell}>
              <VehicleManagementCard
                vehicle={item}
                stats={stats.byId.get(item.id)}
                statsLoading={stats.isLoading}
                statsFailed={stats.isError}
                alerts={alerts.byId.get(item.id)}
                {...cardAlertState}
                actions={rowActions(item, 'card')}
              />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className={styles.plate}>
      <div className={styles.inner}>{renderBody()}</div>

      {/* Chân khung chỉ có nghĩa khi đang có dữ liệu — trang rỗng không cần "Hiển thị 0-0". */}
      {items.length > 0 ? (
        <div className={styles.footer}>
          <p className={styles.summary}>
            {t('showing', { from, to, total: meta.total })}
          </p>
          <Pagination
            current={meta.page}
            pageSize={meta.limit}
            total={meta.total}
            showSizeChanger={false}
            size="small"
            onChange={onPageChange}
          />
        </div>
      ) : null}
    </div>
  );
}
