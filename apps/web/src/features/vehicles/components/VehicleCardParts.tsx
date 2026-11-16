'use client';

import {
  CarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  EditOutlined,
  ExclamationOutlined,
  EyeInvisibleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  MARKETPLACE_VISIBILITY_REASON,
  MARKETPLACE_VISIBILITY_REASON_META,
  type MarketplaceVisibilityReason,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_SOURCE_TYPE,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import type { RowAction } from '@/components/data-display/RowActions';
import { ToneDotBadge } from '@/components/data-display/StatusBadge';
import { statusColorClass } from '@/components/data-display/status-color';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { isNegativeMoney, subtractMoney } from '@/lib/money';
import type { VehicleAlertGroup, VehicleListItem, VehicleStats } from '../types';
import { VehicleAlertChips } from './VehicleAlerts';
import styles from './VehicleCardParts.module.css';

/**
 * Mảnh dùng chung của ba hình thái thẻ xe ở `/vehicles` (Figma Partner-XePrime 03/11/2026):
 * thẻ ÍT xe `23655:38951`, thẻ LƯỚI `23655:36682`, hàng DANH SÁCH `23655:38389`. Ba hình khác nhau
 * nhưng cùng dữ liệu, cùng nhãn, cùng ba trạng thái tải/hỏng/xong — nên phần đọc dữ liệu nằm Ở
 * ĐÂY một lần, mỗi thẻ chỉ còn lo xếp chỗ.
 */

/**
 * Xe đang nằm trong tay CHỦ XE chờ họ làm gì đó — hai trạng thái mà người duyệt đã trả xe về.
 * `draft` không có ở đây: xe nháp chưa từng được gửi nên không có lý do nào để hiện.
 */
export const NEEDS_OWNER_ACTION: readonly VehiclePublicStatus[] = [
  VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
  VEHICLE_PUBLIC_STATUS.REJECTED,
];

/** Hai lý do "đã duyệt nhưng công tắc đang tắt" — chủ xe tự cất, hoặc hệ thống ẩn vì hết suất gói. */
const PAUSED_REASONS: readonly MarketplaceVisibilityReason[] = [
  MARKETPLACE_VISIBILITY_REASON.PLAN_PAUSED,
  MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED,
];

/** Biểu tượng đứng trước nhãn kiểm duyệt ở thẻ ít xe (Figma "Kiểm duyệt" `23664:31874`). */
const REVIEW_ICON: Readonly<Record<VehiclePublicStatus, ReactNode>> = {
  [VEHICLE_PUBLIC_STATUS.DRAFT]: <EditOutlined />,
  [VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW]: <ClockCircleOutlined />,
  [VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC]: <CheckOutlined />,
  [VEHICLE_PUBLIC_STATUS.NEEDS_REVISION]: <ExclamationOutlined />,
  [VEHICLE_PUBLIC_STATUS.REJECTED]: <CloseOutlined />,
  [VEHICLE_PUBLIC_STATUS.HIDDEN]: <EyeInvisibleOutlined />,
  [VEHICLE_PUBLIC_STATUS.ARCHIVED]: <StopOutlined />,
};

/** Ảnh chính của xe; chưa có ảnh thì khung xám có biểu tượng xe. */
export function VehicleCardMedia({
  vehicle,
  className,
}: {
  vehicle: VehicleListItem;
  className?: string;
}) {
  return (
    <div className={cx(styles.media, className)}>
      {vehicle.mainImageUrl ? (
        // Ảnh minh hoạ cho tên nằm ngay cạnh → `alt` rỗng, cùng quy ước với `EntityIdentity`.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.image} src={vehicle.mainImageUrl} alt="" loading="lazy" />
      ) : (
        <span className={styles.mediaFallback} aria-hidden="true">
          <CarOutlined />
        </span>
      )}
    </div>
  );
}

/**
 * Tên (liên kết sang Hồ sơ xe) + viên nguồn xe, dòng mã | biển số, và dòng loại xe · dịch vụ.
 */
export function VehicleCardIdentity({
  vehicle,
  detailHref,
}: {
  vehicle: VehicleListItem;
  detailHref: string;
}) {
  const domainLabel = useDomainLabel();
  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;
  const idParts = [vehicle.code, vehicle.plateNumber].filter((part): part is string =>
    Boolean(part),
  );
  const specParts = [
    domainLabel('vehicleType', vehicle.vehicleType),
    ...vehicle.serviceTypes.map((service) => domainLabel('serviceType', service)),
  ];

  return (
    <div className={styles.identity}>
      <div className={styles.nameRow}>
        <Link href={detailHref} className={styles.name} title={vehicle.name}>
          {vehicle.name}
        </Link>
        <span className={styles.sourceBadge}>{domainLabel('vehicleSourceType', sourceType)}</span>
      </div>
      <SeparatedLine parts={idParts} separator="bar" />
      <SeparatedLine parts={specParts} separator="dot" />
    </div>
  );
}

/** `bar` = gạch đứng giữa mã và biển số; `dot` = chấm nhỏ giữa loại xe và các dịch vụ. */
function SeparatedLine({
  parts,
  separator,
}: {
  parts: readonly string[];
  separator: 'bar' | 'dot';
}) {
  if (parts.length === 0) return null;
  return (
    <p className={styles.line}>
      {parts.map((part, index) => (
        <Fragment key={`${index}-${part}`}>
          {index > 0 ? (
            <span className={separator === 'bar' ? styles.bar : styles.dot} aria-hidden="true">
              {separator === 'bar' ? '|' : null}
            </span>
          ) : null}
          <span>{part}</span>
        </Fragment>
      ))}
    </p>
  );
}

/**
 * Hai trục trạng thái độc lập (vận hành · kiểm duyệt) + chip "Chủ xe tạm ẩn".
 *
 *  - `short`: hai viên gọn ("Sẵn sàng" · "Chờ duyệt") — thẻ một xe một hàng và hàng mobile;
 *  - `detailed`: nhãn kiểm duyệt có biểu tượng tròn + viên vận hành nhãn dài ("Sẵn sàng vận
 *    hành") — thẻ hai xe một hàng và thẻ đầu Hồ sơ xe.
 *
 * Chip tạm ẩn CHỈ khi công tắc hiển thị đang tắt trên một xe đã duyệt (ADR 0048): mọi lý do ẩn khác
 * đã đọc được từ trạng thái kiểm duyệt, còn "đã duyệt nhưng đang tắt" thì không đọc được từ chỗ nào
 * khác — thiếu nó thì một chiếc xe đang cất đi trông y hệt một chiếc đang bán. Chip nói AI tắt: chủ
 * xe tự cất, hay hệ thống tạm ẩn vì hết suất gói lúc đổi tuyến/đổi gói (ADR 0085 điều 5).
 */
export function VehicleStatusBadges({
  vehicle,
  variant,
  className,
}: {
  /** Chỉ ba trường trạng thái — thẻ danh sách và Hồ sơ xe (bản ghi chi tiết) cùng truyền được. */
  vehicle: Pick<
    VehicleListItem,
    'operationStatus' | 'publicStatus' | 'marketplaceVisibilityReason'
  >;
  variant: 'short' | 'detailed';
  className?: string;
}) {
  const t = useTranslations('Vehicles.list');
  const domainLabel = useDomainLabel();
  const operation = vehicle.operationStatus as VehicleOperationStatus;
  const review = vehicle.publicStatus as VehiclePublicStatus;
  const operationColor = VEHICLE_OPERATION_STATUS_META[operation]?.color;
  const reviewColor = VEHICLE_PUBLIC_STATUS_META[review]?.color;
  const pausedReason = PAUSED_REASONS.find(
    (reason) => reason === vehicle.marketplaceVisibilityReason,
  );
  const paused = pausedReason ? (
    <ToneDotBadge compact color={MARKETPLACE_VISIBILITY_REASON_META[pausedReason].color}>
      {domainLabel('marketplaceVisibility', pausedReason)}
    </ToneDotBadge>
  ) : null;

  if (variant === 'short') {
    return (
      <div className={cx(styles.badges, className)}>
        <ToneDotBadge compact color={operationColor}>
          {domainLabel('vehicleOperationStatus', operation)}
        </ToneDotBadge>
        <ToneDotBadge compact color={reviewColor}>
          {t(`reviewShort.${review}`)}
        </ToneDotBadge>
        {paused}
      </div>
    );
  }

  return (
    <div className={cx(styles.detailedStatus, className)}>
      <span className={cx(styles.review, statusColorClass(reviewColor))}>
        <span className={styles.reviewIcon} aria-hidden="true">
          {REVIEW_ICON[review]}
        </span>
        {t(`review.${review}`)}
      </span>
      <span className={styles.badges}>
        <ToneDotBadge compact color={operationColor}>
          {t(`operation.${operation}`)}
        </ToneDotBadge>
        {paused}
      </span>
    </div>
  );
}

/**
 * Việc cần làm (server tính — cùng phép tính với Hồ sơ xe) + lý do người duyệt trả xe về.
 *
 * Ba trạng thái tách bạch cho cảnh báo: đang tải (skeleton) · hỏng (nói thẳng là không biết) ·
 * xong (rỗng nghĩa là THẬT SỰ không có việc) — không bao giờ một "0 cảnh báo" giả. Lý do trả về
 * chỉ hiện khi xe đang nằm trong tay chủ xe: chip nói "Bị từ chối" nhưng không nói VÌ SAO, mà vì
 * sao mới là thứ họ cần để đi tiếp. Không có gì để nói thì không dựng khối nào.
 */
export function VehicleCardNotices({
  vehicle,
  alerts,
  alertsLoading,
  alertsFailed,
}: {
  vehicle: VehicleListItem;
  alerts?: VehicleAlertGroup;
  alertsLoading: boolean;
  alertsFailed: boolean;
}) {
  const t = useTranslations('Vehicles.list.card');
  const reason = NEEDS_OWNER_ACTION.includes(vehicle.publicStatus as VehiclePublicStatus)
    ? vehicle.latestPublicReview?.reason
    : null;
  const hasAlerts = Boolean(alerts && alerts.alerts.length > 0);

  if (!alertsLoading && !alertsFailed && !hasAlerts && !reason) return null;

  return (
    <div className={styles.notices}>
      {reason ? <p className={styles.reviewReason}>{reason}</p> : null}
      {alertsLoading ? (
        <Skeleton active paragraph={{ rows: 1, width: '60%' }} title={false} />
      ) : alertsFailed ? (
        <p className={styles.unavailable}>{t('alertsUnavailable')}</p>
      ) : alerts ? (
        <VehicleAlertChips alerts={alerts.alerts} />
      ) : null}
    </div>
  );
}

/** Trạng thái của khối số liệu đơn/tiền — để thẻ không vẽ "0" khi thật ra là "chưa biết". */
export type VehicleStatsState = 'loading' | 'failed' | 'ready';

export interface VehicleCardFigures {
  odometer: string;
  weekdayPrice: string;
  weekendPrice: string;
  statsState: VehicleStatsState;
  completedTrips: string | null;
  /** `null` khi người xem không có `finance.view` — server đã không gửi số tiền. */
  finance: { income: string; expense: string; profit: string; atLoss: boolean } | null;
}

/**
 * Con số trên thẻ, đã định dạng — MỘT chỗ cho ba hình thái thẻ.
 *
 * KM: chưa có thì "—" (không dựng "0 km"), gọi cảnh báo hỏng thì "Không rõ" — khác hẳn "xe chưa
 * từng ghi KM". Lợi nhuận chỉ tính khi CẢ HAI vế cùng phạm vi luỹ kế; số mang dấu, lỗ tô đỏ.
 */
export function useVehicleCardFigures({
  vehicle,
  stats,
  statsLoading,
  statsFailed,
  alerts,
  alertsFailed,
}: {
  vehicle: VehicleListItem;
  stats?: VehicleStats;
  statsLoading: boolean;
  statsFailed: boolean;
  alerts?: VehicleAlertGroup;
  alertsFailed: boolean;
}): VehicleCardFigures {
  const t = useTranslations('Vehicles.list.card');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const empty = tLabels('emptyValue');

  const statsState: VehicleStatsState = statsLoading
    ? 'loading'
    : statsFailed || !stats
      ? 'failed'
      : 'ready';
  const hasFinance = stats?.totalIncome != null && stats?.totalExpense != null;
  const profit = hasFinance ? subtractMoney(stats.totalIncome, stats.totalExpense) : null;

  return {
    odometer: alertsFailed
      ? t('odometerUnknown')
      : alerts
        ? fmt.km(alerts.currentOdometerKm)
        : empty,
    weekdayPrice: vehicle.weekdayPrice ? fmt.money(vehicle.weekdayPrice) : empty,
    weekendPrice: vehicle.weekendPrice ? fmt.money(vehicle.weekendPrice) : empty,
    statsState,
    completedTrips: stats ? fmt.count(stats.completedBookings) : null,
    finance:
      hasFinance && profit != null
        ? {
            income: fmt.money(stats.totalIncome),
            expense: fmt.money(stats.totalExpense),
            profit: fmt.money(profit),
            atLoss: isNegativeMoney(profit),
          }
        : null,
  };
}

/**
 * Nút của thẻ: viền trắng, nút chính vàng (Figma `23655:38994`…`38996`). `layout`: `column` =
 * cột nút rộng bằng nhau (thẻ ít xe, hàng danh sách); `row` = một hàng, nút chính giãn hết phần
 * còn lại (thẻ lưới). Hành động `hidden` (thiếu quyền) vắng hẳn — ẩn là trang trí, chặn thật ở
 * backend.
 */
export function VehicleCardActions({
  actions,
  layout,
  label,
}: {
  actions: readonly RowAction[];
  layout: 'column' | 'row';
  label: string;
}) {
  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0) return null;
  return (
    <div
      className={layout === 'column' ? styles.actionsColumn : styles.actionsRow}
      role="group"
      aria-label={label}
    >
      {visible.map((action) => (
        <Button
          key={action.key}
          type={action.primary ? 'primary' : 'default'}
          className={cx(styles.action, action.primary && styles.actionPrimary)}
          disabled={action.disabled}
          loading={action.loading}
          onClick={(event) => {
            event.stopPropagation();
            action.onClick?.();
          }}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
