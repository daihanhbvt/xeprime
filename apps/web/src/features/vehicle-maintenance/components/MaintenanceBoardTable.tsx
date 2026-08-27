'use client';

import {
  CalendarOutlined,
  CheckOutlined,
  DashboardOutlined,
  EyeOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Progress, Tag } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_DUE_STATUS_META,
  MAINTENANCE_STATUS_META,
  MAINTENANCE_TYPE_LABEL,
  PERMISSION,
  STATUS_COLOR,
  type MaintenanceDueStatus,
  type MaintenanceStatus,
  type MaintenanceType,
} from '@xeprime/types';
import type { PaginationMeta } from '@xeprime/types';
import { actionColumn, DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusTag } from '@/components/data-display/StatusTag';
import { VEHICLE_EDIT_TAB, vehicleTabPath } from '@/constants/routes';
import type { MaintenanceBoardItem } from '../types';
import styles from './MaintenanceBoard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTranslations } from 'next-intl';

/**
 * Bề rộng tối thiểu của bảng: hẹp hơn thì CUỘN NGANG, không nén cột (quy tắc bảng của repo +
 * docs §12.8). Cột hành động `fixed: 'right'` nên vẫn với tới được khi đang cuộn.
 */
const MIN_TABLE_WIDTH = 1120;

interface BoardActions {
  onSchedule: (row: MaintenanceBoardItem) => void;
  onComplete: (row: MaintenanceBoardItem) => void;
  onCancel: (row: MaintenanceBoardItem) => void;
  onCorrectOdometer: (row: MaintenanceBoardItem) => void;
}

/** Link tới đúng tab bảo dưỡng của xe — không dựng chuỗi query rải rác trong component. */
export function maintenanceTabHref(vehicleId: string): string {
  return vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE);
}

/**
 * Ô "tình trạng chu kỳ" là COMPONENT chứ không phải hàm dựng JSX: nó cần nhãn theo ngôn
 * ngữ (`useAppFormat`), mà hook chỉ gọi được trong component.
 */
function DueCell({ row }: { row: MaintenanceBoardItem }) {
  const fmt = useAppFormat();
  const tCommon = useTranslations('Common');
  const status = row.dueStatus as MaintenanceDueStatus;
  if (status === MAINTENANCE_DUE_STATUS.UNKNOWN) {
    return <span className={styles.muted}>{tCommon('labels.insufficientData')}</span>;
  }
  const percent =
    row.oilChangeIntervalKm && row.remainingKm != null
      ? Math.min(
          100,
          Math.max(
            0,
            ((row.oilChangeIntervalKm - row.remainingKm) / row.oilChangeIntervalKm) * 100,
          ),
        )
      : null;
  return (
    <div className={styles.dueCell}>
      <span className={status === MAINTENANCE_DUE_STATUS.OVERDUE ? styles.overdue : styles.dueText}>
        {fmt.remainingKm(row.remainingKm)}
      </span>
      {percent != null ? (
        <Progress
          percent={percent}
          size="small"
          showInfo={false}
          status={status === MAINTENANCE_DUE_STATUS.OVERDUE ? 'exception' : 'normal'}
        />
      ) : null}
    </div>
  );
}

/**
 * Bảng Trung tâm bảo dưỡng. Desktop dùng bảng có cột canh theo loại dữ liệu (KM/ngày canh
 * phải), mobile đổi sang thẻ gọn qua `renderCard` của `DataTable` — KHÔNG nén bảng desktop
 * xuống điện thoại (docs §12.7–12.8).
 */
export function MaintenanceBoardTable({
  items,
  meta,
  loading,
  error,
  filtered,
  permissionDenied,
  canManage,
  canCorrectOdometer,
  actions,
  onPageChange,
  onClearFilters,
}: {
  items: MaintenanceBoardItem[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered: boolean;
  permissionDenied: boolean;
  canManage: boolean;
  canCorrectOdometer: boolean;
  actions: BoardActions;
  onPageChange: (page: number, pageSize: number) => void;
  onClearFilters: () => void;
}) {
  const fmt = useAppFormat();

  const router = useRouter();
  const rowActions = (row: MaintenanceBoardItem): RowAction[] => [
    {
      key: 'detail',
      label: 'Chi tiết',
      icon: <EyeOutlined />,
      primary: true,
      onClick: () => router.push(maintenanceTabHref(row.vehicleId)),
    },
    {
      key: 'odometer',
      label: 'Cập nhật ODO',
      icon: <DashboardOutlined />,
      hidden: !canCorrectOdometer,
      onClick: () => actions.onCorrectOdometer(row),
    },
    {
      key: 'schedule',
      label: row.activeRecord ? 'Sửa lịch' : 'Lên lịch',
      icon: <CalendarOutlined />,
      hidden: !canManage,
      onClick: () => actions.onSchedule(row),
    },
    {
      key: 'complete',
      label: 'Hoàn tất',
      icon: <CheckOutlined />,
      hidden: !canManage || !row.activeRecord,
      onClick: () => actions.onComplete(row),
    },
    {
      key: 'cancel',
      label: 'Hủy lịch',
      icon: <StopOutlined />,
      danger: true,
      hidden: !canManage || !row.activeRecord,
      confirm: {
        title: 'Hủy lịch bảo dưỡng này? Khoảng thời gian sẽ được giải phóng cho đơn thuê.',
      },
      onClick: () => actions.onCancel(row),
    },
  ];

  const columns: DataTableColumn<MaintenanceBoardItem>[] = [
    {
      key: 'vehicle',
      title: 'Xe',
      width: 260,
      render: (_, row) => (
        <Link href={maintenanceTabHref(row.vehicleId)} className={styles.vehicleLink}>
          <EntityIdentity
            kind="vehicle"
            name={row.vehicleName}
            subtitle={[row.vehicleCode, row.plateNumber].filter(Boolean).join(' · ')}
            imageUrl={row.mainImageUrl}
          />
        </Link>
      ),
    },
    {
      key: 'currentKm',
      title: 'KM hiện tại',
      align: 'right',
      width: 140,
      render: (_, row) =>
        row.currentOdometerKm == null ? (
          <Tag color={STATUS_COLOR.WARNING}>Thiếu KM</Tag>
        ) : (
          <span className={styles.numeric}>{fmt.km(row.currentOdometerKm)}</span>
        ),
    },
    {
      key: 'nextKm',
      title: 'Mốc tiếp theo',
      align: 'right',
      width: 140,
      render: (_, row) => (
        <span className={styles.numeric}>
          {row.nextMaintenanceKm != null ? fmt.km(row.nextMaintenanceKm) : '—'}
        </span>
      ),
    },
    {
      key: 'due',
      title: 'Tình trạng chu kỳ',
      width: 200,
      render: (_, row) => <DueCell row={row} />,
    },
    {
      key: 'dueStatus',
      title: 'Trạng thái',
      width: 140,
      render: (_, row) => (
        <StatusTag
          value={row.dueStatus as MaintenanceDueStatus}
          meta={MAINTENANCE_DUE_STATUS_META}
          group="maintenanceDueStatus"
        />
      ),
    },
    {
      key: 'active',
      title: 'Lịch đang mở',
      width: 200,
      render: (_, row) =>
        row.activeRecord ? (
          <div className={styles.activeCell}>
            <StatusTag
              value={row.activeRecord.status as MaintenanceStatus}
              meta={MAINTENANCE_STATUS_META}
              group="maintenanceStatus"
            />
            <span className={styles.muted}>
              {MAINTENANCE_TYPE_LABEL[row.activeRecord.type as MaintenanceType]}
            </span>
            {row.activeRecord.plannedStartAt ? (
              <span className={styles.muted}>{fmt.date(row.activeRecord.plannedStartAt)}</span>
            ) : null}
          </div>
        ) : (
          <span className={styles.muted}>—</span>
        ),
    },
    {
      key: 'lastCompleted',
      title: 'Lần gần nhất',
      align: 'right',
      width: 130,
      render: (_, row) => (
        <span className={styles.numeric}>
          {row.lastCompletedAt ? fmt.date(row.lastCompletedAt) : '—'}
        </span>
      ),
    },
    actionColumn<MaintenanceBoardItem>(rowActions, { width: 350, maxInline: 3 }),
  ];

  return (
    <DataTable<MaintenanceBoardItem>
      label="Danh sách xe cần bảo dưỡng"
      columns={columns}
      items={items}
      rowKey={(row) => row.vehicleId}
      onRowClick={(row) => router.push(maintenanceTabHref(row.vehicleId))}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: 'Không tải được danh sách bảo dưỡng', onRetry: error.onRetry } : null}
      permission={
        permissionDenied
          ? {
              kind: 'forbidden',
              title: 'Không có quyền xem trung tâm bảo dưỡng',
              missingPermissions: [PERMISSION.VEHICLE_MAINTENANCE_VIEW],
            }
          : null
      }
      filtered={filtered}
      empty={{
        title: 'Chưa có xe nào trong đội xe',
        description: 'Thêm xe và nhập số KM để theo dõi lịch bảo dưỡng.',
      }}
      noResults={{
        title: 'Không có xe nào khớp bộ lọc',
        description: 'Thử bỏ bớt điều kiện lọc để xem thêm kết quả.',
        action: (
          <button type="button" className={styles.clearButton} onClick={onClearFilters}>
            Xóa bộ lọc
          </button>
        ),
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => `${total} xe`,
      }}
      renderCard={(row) => <MaintenanceBoardCard row={row} rowActions={rowActions(row)} />}
    />
  );
}

/** Thẻ mobile — thiết kế riêng theo ảnh Figma, không phải bảng desktop bị nén. */
function MaintenanceBoardCard({
  row,
  rowActions,
}: {
  row: MaintenanceBoardItem;
  rowActions: RowAction[];
}) {
  const fmt = useAppFormat();

  const status = row.dueStatus as MaintenanceDueStatus;

  return (
    <article
      className={`${styles.card} ${status === MAINTENANCE_DUE_STATUS.OVERDUE ? styles.cardOverdue : ''}`}
    >
      <header className={styles.cardHead}>
        <Link href={maintenanceTabHref(row.vehicleId)} className={styles.cardTitle}>
          {row.vehicleName}
        </Link>
        <StatusTag value={status} meta={MAINTENANCE_DUE_STATUS_META} group="maintenanceDueStatus" />
      </header>
      <p className={styles.cardSub}>
        {[row.vehicleCode, row.plateNumber].filter(Boolean).join(' · ')}
      </p>
      <p className={styles.cardBody}>
        {row.currentOdometerKm == null
          ? 'Cần cập nhật Kilometer thủ công (chưa có dữ liệu hành trình)'
          : `${fmt.remainingKm(row.remainingKm)}${
              row.oilChangeIntervalKm ? ` (Chu kỳ ${fmt.km(row.oilChangeIntervalKm)})` : ''
            }`}
      </p>
      {row.activeRecord ? (
        <p className={styles.cardBody}>
          <StatusTag
            value={row.activeRecord.status as MaintenanceStatus}
            meta={MAINTENANCE_STATUS_META}
            group="maintenanceStatus"
          />{' '}
          {MAINTENANCE_TYPE_LABEL[row.activeRecord.type as MaintenanceType]}
        </p>
      ) : null}
      <div className={styles.cardActions}>
        <RowActions actions={rowActions} align="start" variant="filled" maxInline={3} />
      </div>
    </article>
  );
}
