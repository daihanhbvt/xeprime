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
  /**
   * Hàng đợi "Thiếu KM trả" (Wave 8) — dòng là BIÊN BẢN chứ không phải xe, nên trang đổi hẳn
   * bảng khi chọn tab này. Đặt ở đây thay vì một mục điều hướng riêng: người vận hành đã ở
   * bề mặt việc-cần-làm rồi, tách ra chỉ làm họ phải nhớ thêm một chỗ để nhìn.
   */
  {
    key: MAINTENANCE_BOARD_FILTER.MISSING_RETURN_KM,
    dot: styles.dotOverdue,
    count: (s: MaintenanceBoardSummary) => s.missingReturnKm,
  },
] as const;

export function MaintenanceBoardTabs({
  active,
  summary,
  loading,
  canViewHandovers = false,
  onChange,
}: {
  active: string;
  summary?: MaintenanceBoardSummary;
  loading: boolean;
  /**
   * `handovers.view`. Thiếu quyền thì nhóm việc "Thiếu KM trả" biến mất HẲN — hiện một tab
   * luôn báo 0 cũng là một câu trả lời về dữ liệu người dùng không được biết (Wave 8.1).
   * Đây chỉ là lớp trình bày; backend vẫn là nơi chặn thật.
   */
  canViewHandovers?: boolean;
  onChange: (filter: string) => void;
}) {
  if (loading && !summary) return <Skeleton.Input active block className={styles.tabsSkeleton} />;

  const visibleTabs = TABS.filter(
    (tab) => canViewHandovers || tab.key !== MAINTENANCE_BOARD_FILTER.MISSING_RETURN_KM,
  );

  return (
    <div className={styles.summaryTabs} role="tablist" aria-label="Nhóm việc bảo dưỡng">
      {visibleTabs.map((tab) => (
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
