'use client';

import { Alert, Button, Pagination, Skeleton } from 'antd';
import type { PaginationMeta } from '@xeprime/types';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/feedback/EmptyState';
import type { RowAction } from '@/components/data-display/RowActions';
import { useIsMobile } from '@/hooks/use-media-query';
import { useTranslations } from 'next-intl';
import { useVehicleAlerts } from '../hooks/use-vehicle-alerts';
import { useVehicleAlertView } from '../hooks/use-vehicle-alert-view';
import { useVehicleCardStats } from '../hooks/use-vehicle-card-stats';
import type { VehicleListItem } from '../types';
import { VehicleListRow } from './VehicleListRow';
import { VehicleWideCard } from './VehicleWideCard';
import styles from './VehicleCardGrid.module.css';

/**
 * Bố cục desktop (Figma Partner-XePrime, chốt 16/11/2026): `list` — một xe một hàng
 * (`23655:36959`) cho đội xe dưới `VEHICLE_LIST_PAIRS_FROM` xe; `pairs` — hai thẻ một hàng
 * (`23655:38521`) từ số đó trở lên. Trang chọn theo tổng xe; ở ≤640px luôn là hàng ngang mobile.
 */
export type VehicleGridLayout = 'list' | 'pairs';

interface VehicleCardGridProps {
  items: VehicleListItem[];
  layout: VehicleGridLayout;
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  emptyAction?: ReactNode;
  /** `shape` để nhãn hành động khớp bề mặt: thẻ desktop nhãn đầy đủ, hàng mobile nhãn rút gọn. */
  rowActions: (row: VehicleListItem, shape: 'card' | 'row') => RowAction[];
  onPageChange: (page: number, pageSize: number) => void;
  /**
   * Đích của tên xe. Mặc định là Hồ sơ 360 ở `/manage`; khu tài khoản của chủ xe
   * (`/account/vehicles`) truyền đường của nó để CÙNG một lưới dẫn về đúng vỏ đang đứng.
   */
  detailHref?: (id: string) => string;
}

/** Số khung chờ theo bố cục — ba hàng danh sách, hai hàng thẻ đôi. */
const SKELETON_COUNT: Readonly<Record<VehicleGridLayout, number>> = { list: 3, pairs: 4 };

/**
 * Danh sách xe của `/vehicles` — dùng chung cho gian hàng và chủ xe tuyến hoa hồng.
 *
 * Design 03/11/2026 thả thẻ thẳng trên nền trang (không còn khung bao). Trạng thái rỗng / không
 * kết quả / lỗi — design không vẽ — nằm trong một ô trắng bo 16 cùng ngôn ngữ thẻ; dòng "Hiển thị
 * x-y của N xe" + phân trang đứng dưới danh sách, chỉ khi có dữ liệu.
 *
 * Ở ≤640px chuyển sang `VehicleListRow` theo Figma `186:2374`: hàng ngang, không phải thẻ bóp nhỏ.
 */
export function VehicleCardGrid({
  items,
  layout,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  emptyAction,
  rowActions,
  onPageChange,
  detailHref,
}: VehicleCardGridProps) {
  const t = useTranslations('Vehicles.list.grid');
  const tCommon = useTranslations('Common.actions');
  const isMobile = useIsMobile();
  const ids = items.map((item) => item.id);
  const stats = useVehicleCardStats(ids);
  // Desktop và mobile dùng CÙNG một nguồn dữ liệu nghiệp vụ — khác nhau ở cách vẽ, không ở dữ liệu.
  const alerts = useVehicleAlerts(ids);
  // Cảnh báo server trả về → bản hiện ra được ở KHU này (lọc việc không làm được, trỏ đúng khu).
  const alertView = useVehicleAlertView();

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
          className={isMobile ? styles.list : styles[layout]}
          role="status"
          aria-busy="true"
          aria-label={t('loading')}
        >
          {Array.from({ length: SKELETON_COUNT[layout] }, (_, index) => (
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
        title={t('alertsErrorTitle')}
        description={t('alertsErrorBody')}
        action={
          <Button size="small" onClick={alerts.refetch}>
            {tCommon('retry')}
          </Button>
        }
      />
    ) : null;

    /** Cảnh báo của MỘT xe, đã lọc và đổi đích — `undefined` khi chưa tải xong hoặc tải hỏng. */
    const alertsOf = (id: string) => {
      const group = alerts.byId.get(id);
      return group ? { ...group, alerts: alertView(id, group.alerts) } : undefined;
    };
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
                alerts={alertsOf(item.id)}
                {...cardAlertState}
                actions={rowActions(item, 'row')}
                detailHref={detailHref}
              />
            </li>
          ))}
        </ul>
      </>
    ) : (
      <>
        {alertsBanner}
        <ul className={styles[layout]} {...listProps}>
          {items.map((item) => {
            const cardProps = {
              vehicle: item,
              stats: stats.byId.get(item.id),
              statsLoading: stats.isLoading,
              statsFailed: stats.isError,
              alerts: alertsOf(item.id),
              ...cardAlertState,
              actions: rowActions(item, 'card'),
              detailHref,
            };
            return (
              <li key={item.id} className={styles.cell}>
                <VehicleWideCard {...cardProps} layout={layout === 'pairs' ? 'stacked' : 'row'} />
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <div className={styles.root}>
      {renderBody()}

      {/* Chân danh sách chỉ có nghĩa khi đang có dữ liệu — trang rỗng không cần "Hiển thị 0-0". */}
      {items.length > 0 ? (
        <div className={styles.footer}>
          <p className={styles.summary}>{t('showing', { from, to, total: meta.total })}</p>
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
