'use client';

import { Skeleton } from 'antd';
import { MAINTENANCE_BOARD_FILTER, MAINTENANCE_BOARD_FILTER_LABEL } from '@xeprime/types';
import { cx } from '@/lib/cx';
import type { MaintenanceBoardSummary } from '../types';
import styles from './MaintenanceBoard.module.css';

/**
 * Dải "việc cần làm" đứng trước bảng (docs §12.1: việc trước, dữ liệu sau).
 *
 * Số đếm lấy từ endpoint summary riêng nên KHÔNG phụ thuộc trang/bộ lọc đang xem — con số
 * "3 xe quá hạn" phải đúng với cả đội xe, không phải với 20 dòng đang hiển thị.
 * Một hàng ngang, cuộn khi tràn, không bao giờ wrap (§4.2).
 */
const TABS = [
  { key: MAINTENANCE_BOARD_FILTER.ALL, dot: null, count: (s: MaintenanceBoardSummary) => s.total },
  {
    key: MAINTENANCE_BOARD_FILTER.OVERDUE,
    dot: styles.dotOverdue,
    count: (s: MaintenanceBoardSummary) => s.overdue,
  },
  {
    key: MAINTENANCE_BOARD_FILTER.DUE_SOON,
    dot: styles.dotDueSoon,
    count: (s: MaintenanceBoardSummary) => s.dueSoon,
  },
  {
    key: MAINTENANCE_BOARD_FILTER.IN_PROGRESS,
    dot: styles.dotInProgress,
    count: (s: MaintenanceBoardSummary) => s.inProgress,
  },
  {
    key: MAINTENANCE_BOARD_FILTER.MISSING_ODOMETER,
    dot: styles.dotMissing,
    count: (s: MaintenanceBoardSummary) => s.missingOdometer,
  },
  {
    key: MAINTENANCE_BOARD_FILTER.UPCOMING,
    dot: null,
    count: (s: MaintenanceBoardSummary) => s.upcoming,
  },
] as const;

export function MaintenanceBoardTabs({
  active,
  summary,
  loading,
  onChange,
}: {
  active: string;
  summary?: MaintenanceBoardSummary;
  loading: boolean;
  onChange: (filter: string) => void;
}) {
  if (loading && !summary) return <Skeleton.Input active block style={{ height: 44 }} />;

  return (
    <div className={styles.summaryTabs} role="tablist" aria-label="Nhóm việc bảo dưỡng">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={cx(styles.summaryTab, active === tab.key && styles.summaryTabActive)}
          onClick={() => onChange(tab.key)}
        >
          {tab.dot ? <span className={cx(styles.summaryDot, tab.dot)} aria-hidden="true" /> : null}
          {MAINTENANCE_BOARD_FILTER_LABEL[tab.key]}
          {summary ? <span className={styles.summaryCount}>{tab.count(summary)}</span> : null}
        </button>
      ))}
    </div>
  );
}
