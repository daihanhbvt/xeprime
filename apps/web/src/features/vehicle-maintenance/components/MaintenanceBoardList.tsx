'use client';

import { CarOutlined, CheckOutlined, EyeOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Pagination, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import {
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_DUE_STATUS_META,
  MAINTENANCE_STATUS,
  PERMISSION,
  PLAN_FEATURE,
  STATUS_COLOR,
  type MaintenanceDueStatus,
  type PaginationMeta,
} from '@xeprime/types';
import { maintenanceCyclePercent } from '@xeprime/domain';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FeatureWriteTooltip } from '@/components/feedback/FeatureWriteTooltip';
import { PermissionState } from '@/components/feedback/PermissionState';
import { VEHICLE_EDIT_TAB, vehicleTabPath } from '@/constants/routes';
import { withBranchReturn } from '@/features/branches/branch-link';
import { useBranchCrumb } from '@/features/branches/hooks/use-branch-return';
import { useFeature } from '@/hooks/use-feature';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import type { MaintenanceBoardItem } from '../types';
import styles from './MaintenanceBoard.module.css';

/** Số khung chờ — vừa một màn 1080. */
const SKELETON_COUNT = 5;

/**
 * Sắc của một dòng: vạch trái, thanh chu kỳ và ô lịch đi theo tình trạng chu kỳ (Figma
 * `23754:29574` — đỏ quá hạn, cam sắp đến hạn, xanh trong chu kỳ, xám chưa đủ dữ liệu).
 */
const TONE: Readonly<Record<MaintenanceDueStatus, string | undefined>> = {
  [MAINTENANCE_DUE_STATUS.OVERDUE]: styles.toneDanger,
  [MAINTENANCE_DUE_STATUS.DUE_SOON]: styles.toneWarning,
  [MAINTENANCE_DUE_STATUS.OK]: styles.toneInfo,
  [MAINTENANCE_DUE_STATUS.UNKNOWN]: styles.toneNeutral,
};

export interface MaintenanceBoardActions {
  onSchedule: (row: MaintenanceBoardItem) => void;
  onComplete: (row: MaintenanceBoardItem) => void;
  onCancel: (row: MaintenanceBoardItem) => void;
  onCorrectOdometer: (row: MaintenanceBoardItem) => void;
}

/**
 * Link tới đúng mục bảo dưỡng của màn sửa xe — không dựng chuỗi query rải rác trong component.
 *
 * `branchId` là mẩu đường về của ADR 0052 (xem `withBranchReturn`): mục bảo dưỡng không lọc theo
 * chi nhánh, nó chỉ giữ hộ để nút quay lại trả người dùng đúng chỗ đang đứng.
 */
export function maintenanceTabHref(vehicleId: string, branchId?: string | null): string {
  return withBranchReturn(vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE), branchId);
}

/**
 * Danh sách bảo dưỡng toàn đội xe — Figma Partner-XePrime `23733:41941` (04/11/2026): một xe một
 * hàng ngang (xe · Odo · chu kỳ · ô lịch · nút), cách nhau 12. Ở ≤1200px hàng tự xếp thành lưới
 * hai cột rồi một cột — cùng dữ liệu, không có bản mobile thứ hai.
 *
 * Rỗng / không kết quả / lỗi / không quyền — design không vẽ — nằm trong một ô trắng bo 20 cùng
 * ngôn ngữ thẻ; "Hiển thị x-y của N xe" + phân trang dưới danh sách.
 */
export function MaintenanceBoardList({
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
  actions: MaintenanceBoardActions;
  onPageChange: (page: number, pageSize: number) => void;
  onClearFilters: () => void;
}) {
  const t = useTranslations('Maintenance');
  const tCommon = useTranslations('Common.actions');

  function body() {
    if (permissionDenied) {
      return (
        <div className={styles.state}>
          <PermissionState
            kind="forbidden"
            title={t('table.noPermission')}
            missingPermissions={[PERMISSION.VEHICLE_MAINTENANCE_VIEW]}
          />
        </div>
      );
    }
    if (error) {
      return (
        <div className={styles.state}>
          <EmptyState variant="error" title={t('table.loadError')} onRetry={error.onRetry} />
        </div>
      );
    }
    if (loading && items.length === 0) {
      return (
        <div className={styles.list} role="status" aria-busy="true" aria-label={t('board.loading')}>
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <div key={index} className={styles.skeletonRow}>
              <Skeleton active avatar={{ shape: 'square', size: 64 }} paragraph={{ rows: 1 }} />
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
              title={t('table.noResults')}
              description={t('table.noResultsHint')}
              action={<Button onClick={onClearFilters}>{tCommon('clear')}</Button>}
            />
          ) : (
            <EmptyState
              variant="empty"
              title={t('table.empty')}
              description={t('table.emptyHint')}
            />
          )}
        </div>
      );
    }
    return (
      <ul className={styles.list} aria-label={t('board.listLabel')} aria-busy={loading || undefined}>
        {items.map((row) => (
          <li key={row.vehicleId}>
            <MaintenanceBoardRow
              row={row}
              canManage={canManage}
              canCorrectOdometer={canCorrectOdometer}
              actions={actions}
            />
          </li>
        ))}
      </ul>
    );
  }

  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return (
    <div className={styles.root}>
      {body()}
      {items.length > 0 && !permissionDenied && !error ? (
        <div className={styles.footer}>
          <p className={styles.showing}>{t('board.showing', { from, to, total: meta.total })}</p>
          <Pagination
            current={meta.page}
            pageSize={meta.limit}
            total={meta.total}
            size="small"
            onChange={onPageChange}
          />
        </div>
      ) : null}
    </div>
  );
}

function MaintenanceBoardRow({
  row,
  canManage,
  canCorrectOdometer,
  actions,
}: {
  row: MaintenanceBoardItem;
  canManage: boolean;
  canCorrectOdometer: boolean;
  actions: MaintenanceBoardActions;
}) {
  const t = useTranslations('Maintenance');
  const tShell = useTranslations('ManageCommon');
  const fmt = useAppFormat();
  const router = useRouter();
  const branchCrumb = useBranchCrumb();
  /*
   * Bảo dưỡng là tính năng của GÓI (ADR 0027). Ở `read_only` các thao tác GHI bị KHOÁ chứ không bị
   * ẩn — kèm lý do. "Xem chi tiết xe" là đường ĐỌC, không bao giờ khoá.
   */
  const { canWrite } = useFeature(PLAN_FEATURE.MAINTENANCE);
  const writeBlock = canWrite
    ? {}
    : { disabled: true, disabledReason: tShell('feature.readOnlyTooltip') };

  const status = row.dueStatus as MaintenanceDueStatus;
  const href = maintenanceTabHref(row.vehicleId, branchCrumb);
  const record = row.activeRecord;
  const percent = maintenanceCyclePercent(row.oilChangeIntervalKm, row.remainingKm);
  const subtitle = row.plateNumber || row.vehicleCode;

  const menu: RowAction[] = [
    {
      key: 'detail',
      label: t('actions.detail'),
      icon: <EyeOutlined />,
      onClick: () => router.push(href),
    },
    {
      key: 'complete',
      label: t('actions.complete'),
      icon: <CheckOutlined />,
      hidden: !canManage || !record,
      ...writeBlock,
      onClick: () => actions.onComplete(row),
    },
    {
      key: 'cancel',
      label: t('actions.cancelSchedule'),
      icon: <StopOutlined />,
      danger: true,
      hidden: !canManage || !record,
      ...writeBlock,
      onClick: () => actions.onCancel(row),
    },
  ];

  return (
    <article className={cx(styles.row, TONE[status] ?? styles.toneNeutral)} aria-label={row.vehicleName}>
      <span className={styles.indicator} aria-hidden="true" />

      <div className={styles.vehicle}>
        <Link href={href} className={styles.media} tabIndex={-1} aria-hidden="true">
          {row.mainImageUrl ? (
            // Ảnh minh hoạ cho tên nằm ngay cạnh → `alt` rỗng, cùng quy ước với `EntityIdentity`.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.image} src={row.mainImageUrl} alt="" loading="lazy" />
          ) : (
            <CarOutlined />
          )}
        </Link>
        <div className={styles.identity}>
          <Link href={href} className={styles.name} title={row.vehicleName}>
            {row.vehicleName}
          </Link>
          {subtitle ? <span className={styles.plate}>{subtitle}</span> : null}
          <span className={styles.subtle}>
            {row.lastCompletedAt
              ? t.rich('board.lastService', {
                  date: fmt.date(row.lastCompletedAt),
                  b: (chunk) => <b className={styles.strong}>{chunk}</b>,
                })
              : t('board.noLastService')}
          </span>
        </div>
      </div>

      <div className={styles.odometer}>
        <span className={styles.label}>{t('board.odometer')}</span>
        {row.currentOdometerKm == null ? (
          <span className={styles.missing}>{t('board.missingOdometer')}</span>
        ) : (
          <span className={styles.km}>
            {fmt.kmNumber(row.currentOdometerKm)}
            <span className={styles.kmUnit}> {t('board.kmUnit')}</span>
          </span>
        )}
        <span className={styles.label}>
          {row.nextMaintenanceKm != null
            ? t.rich('board.nextDue', {
                km: fmt.km(row.nextMaintenanceKm),
                b: (chunk) => <b className={styles.medium}>{chunk}</b>,
              })
            : t('board.noNextDue')}
        </span>
      </div>

      <div className={styles.cycle}>
        <div className={styles.cycleHead}>
          <StatusBadge
            value={status}
            meta={MAINTENANCE_DUE_STATUS_META}
            group="maintenanceDueStatus"
            // Design tô "Trong chu kỳ" xanh dương cùng thanh chu kỳ (meta chung để xanh lá).
            tone={status === MAINTENANCE_DUE_STATUS.OK ? STATUS_COLOR.INFO : undefined}
            className={styles.dueBadge}
          />
          {status === MAINTENANCE_DUE_STATUS.UNKNOWN ? null : (
            <span className={styles.remaining}>{fmt.remainingKm(row.remainingKm)}</span>
          )}
        </div>
        <div
          className={styles.track}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent == null ? undefined : Math.round(percent)}
          aria-label={t('table.columns.cycleState')}
        >
          {/* Giá trị chỉ biết lúc chạy → CSS custom property (ngoại lệ duy nhất của luật inline). */}
          <span
            className={styles.fill}
            style={{ '--cycle-percent': `${percent ?? 0}%` } as CSSProperties}
          />
        </div>
        <span className={styles.subtle}>
          {row.currentOdometerKm == null
            ? t('board.needsOdometer')
            : percent != null && row.oilChangeIntervalKm
              ? t('board.cycle', {
                  percent: Math.round(percent),
                  interval: fmt.km(row.oilChangeIntervalKm),
                })
              : t('board.noCycle')}
        </span>
      </div>

      <ScheduleBox row={row} />

      <div className={styles.actions}>
        {canCorrectOdometer ? (
          <FeatureWriteTooltip feature={PLAN_FEATURE.MAINTENANCE}>
            {(disabled) => (
              <Button disabled={disabled} onClick={() => actions.onCorrectOdometer(row)}>
                {t('actions.updateOdometer')}
              </Button>
            )}
          </FeatureWriteTooltip>
        ) : null}
        {canManage ? (
          <FeatureWriteTooltip feature={PLAN_FEATURE.MAINTENANCE}>
            {(disabled) =>
              record ? (
                <Button disabled={disabled} onClick={() => actions.onSchedule(row)}>
                  {t('actions.editSchedule')}
                </Button>
              ) : (
                // Chưa có lịch: nút chính vàng khi xe quá hạn / sắp đến hạn, nút viền khi còn trong chu kỳ.
                <Button
                  type={status === MAINTENANCE_DUE_STATUS.OK ? 'default' : 'primary'}
                  disabled={disabled}
                  onClick={() => actions.onSchedule(row)}
                >
                  {status === MAINTENANCE_DUE_STATUS.OVERDUE
                    ? t('actions.scheduleNow')
                    : t('actions.schedule')}
                </Button>
              )
            }
          </FeatureWriteTooltip>
        ) : null}
        <RowActions
          actions={menu}
          maxInline={0}
          variant="filled"
          overflowLabel={t('board.more', { name: row.vehicleName })}
        />
      </div>
    </article>
  );
}

/** Ô lịch: phiếu đang mở (đã lên lịch / đang bảo dưỡng) hoặc lời nhắc theo tình trạng chu kỳ. */
function ScheduleBox({ row }: { row: MaintenanceBoardItem }) {
  const t = useTranslations('Maintenance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const record = row.activeRecord;
  const status = row.dueStatus as MaintenanceDueStatus;

  if (record) {
    const inProgress = record.status === MAINTENANCE_STATUS.IN_PROGRESS;
    const date = record.plannedStartAt ? fmt.date(record.plannedStartAt) : null;
    return (
      <div className={cx(styles.schedule, styles.scheduleBooked)}>
        <b>
          {inProgress
            ? date
              ? t('board.inProgressSince', { date })
              : t('board.inProgress')
            : date
              ? t('board.scheduledOn', { date })
              : t('board.scheduled')}
        </b>
        <span>{domainLabel('maintenanceType', record.type)}</span>
      </div>
    );
  }

  return (
    <div
      className={cx(
        styles.schedule,
        styles.scheduleEmpty,
        status === MAINTENANCE_DUE_STATUS.OVERDUE && styles.scheduleUrgent,
      )}
    >
      <b>{t('board.noSchedule')}</b>
      <span>
        {status === MAINTENANCE_DUE_STATUS.OVERDUE
          ? t('board.needNow')
          : status === MAINTENANCE_DUE_STATUS.DUE_SOON
            ? t('board.needSoon')
            : t('board.notYet')}
      </span>
    </div>
  );
}
