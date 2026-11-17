import { memo, useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  MARKETPLACE_VISIBILITY_REASON,
  MARKETPLACE_VISIBILITY_REASON_META,
  type MarketplaceVisibilityReason,
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_SOURCE_TYPE,
  type ServiceType,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import { isNegativeMoney, subtractMoney, LIST_SEPARATOR } from '@xeprime/domain';
import { Ionicons } from '@/components/icons/Ionicons';
import { CheckGlyph } from '@/components/icons/CheckGlyph';
import type { IconName } from '@/components/ui/Chip';
import { BadgeRows } from '@/components/ui/BadgeRows';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { CardAction } from '@/components/ui/CardActionBar';
import { DiscountTag } from '@/components/ui/DiscountTag';
import { Pill, pillToneOfStatusColor, usePillSkin } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { discountedPriceVnd } from '../pricing';
import { useVehicleAlertBadges } from './vehicle-alert-badges';
import type { VehicleAlertGroup, VehicleListItem, VehicleStats } from '../api';

/** Hai lý do "đã duyệt nhưng công tắc đang tắt" — chủ xe tự cất, hoặc hệ thống ẩn vì hết suất gói. */
const PAUSED_REASONS: readonly MarketplaceVisibilityReason[] = [
  MARKETPLACE_VISIBILITY_REASON.PLAN_PAUSED,
  MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED,
];

/** Biểu tượng của trạng thái kiểm duyệt — cùng bộ với web `REVIEW_ICON` (`VehicleCardParts`). */
const REVIEW_ICON: Readonly<Record<VehiclePublicStatus, IconName>> = {
  [VEHICLE_PUBLIC_STATUS.DRAFT]: 'create-outline',
  [VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW]: 'time-outline',
  [VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC]: 'checkmark-outline',
  [VEHICLE_PUBLIC_STATUS.NEEDS_REVISION]: 'alert-circle-outline',
  [VEHICLE_PUBLIC_STATUS.REJECTED]: 'close-outline',
  [VEHICLE_PUBLIC_STATUS.HIDDEN]: 'eye-off-outline',
  [VEHICLE_PUBLIC_STATUS.ARCHIVED]: 'ban-outline',
};

/** Số viên "việc cần làm" hiện trên THẺ; phần dư gộp thành `+N` (server đã sắp theo ưu tiên). */
const ALERT_CHIP_LIMIT = 2;

/** Mảng rỗng ở module scope: `[]` viết tại chỗ gọi là một tham chiếu mới mỗi lần render. */
const NO_ALERTS: readonly [] = [];

/*
 * Số đo Figma "Vehicle Summary" (Danh sách xe MB `24158:103762`): thẻ đệm 12, khối cách 8, viền
 * `stroke/gray-low200`, bo 16; ảnh 63×40 cách cột chữ 12; nút mở/thu tròn 24; khối số liệu nền
 * `bg/gray-50` bo 12 đệm 8, dòng cách 6; kiểm duyệt cách viên vận hành 32.
 */
const CARD_PAD = 12;
const BLOCK_GAP = 8;
const THUMB_GAP = 12;
const TOGGLE = 24;
/** Mũi tên 11.5×5.5 của Figma nằm trong khung 20 - glyph Ionicons 14 cho cùng độ lớn nét. */
const TOGGLE_GLYPH = 14;
const REVIEW_DISC = 20;
const REVIEW_GLYPH = 10;
const STATUS_GAP = 32;
const METRICS_PAD = 8;
const METRICS_GAP = 6;
const DOT = 4;

interface VehicleCardProps {
  vehicle: VehicleListItem;
  onPress: (vehicle: VehicleListItem) => void;
  /**
   * Hàng nút ở chân thẻ, do MÀN quyết định — bản tương đương `rowActions` web truyền vào
   * `VehicleCardGrid`. Nút CUỐI là nút chính (dải vàng), các nút trước là nút viền.
   */
  actions: (vehicle: VehicleListItem) => readonly CardAction[];
  /** Chỉ số của xe này; `undefined` khi chưa tải xong HOẶC khi tải hỏng — hai cờ dưới nói rõ ca nào. */
  stats?: VehicleStats | undefined;
  statsLoading: boolean;
  statsFailed: boolean;
  /** Việc cần làm + KM hiện tại, do server tính. Cùng ba trạng thái với `stats`. */
  alerts?: VehicleAlertGroup | undefined;
  alertsLoading: boolean;
  alertsFailed: boolean;
}

interface Metric {
  key: string;
  label: string;
  /** `null` = đang tải. */
  value: string | null;
  tone?: string;
  strong?: boolean;
}

/**
 * Một chiếc xe trong Danh sách xe — Figma Partner-XePrime "Vehicle Summary" (`24158:103762`).
 *
 * Đầu thẻ: ảnh nhỏ · tên + nguồn xe (+ viên "-N%") · nút mở/thu; dòng mã · biển số, loại xe · dịch
 * vụ. Rồi kiểm duyệt (biểu tượng + chữ) · viên vận hành · viên "tạm ẩn"; việc cần làm + lý do bị trả
 * về khi có (giữ của web — người dùng chốt 16/11/2026). Khối số liệu: THU GỌN = Tổng doanh thu ·
 * Lợi nhuận thực tế (không có `finance.view` ⇒ hai giá); MỞ = đủ bảy số như web. Chân thẻ là hàng
 * nút Lịch · Chỉnh sửa · Chi tiết (khuôn thẻ Đơn thuê).
 */
function VehicleCardImpl({
  vehicle,
  onPress,
  actions,
  stats,
  statsLoading,
  statsFailed,
  alerts,
  alertsLoading,
  alertsFailed,
}: VehicleCardProps) {
  const colors = useColors();
  const t = useTranslations('Vehicles.list');
  const tCard = useTranslations('Vehicles.list.card');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const pillSkin = usePillSkin();
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((open) => !open), []);
  const open = useCallback(() => onPress(vehicle), [onPress, vehicle]);

  // Nguồn xe (sở hữu / hợp tác…) — viên cạnh tên như thẻ web `VehicleCardParts`; thiếu = sở hữu.
  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;
  // Lý do kiểm duyệt CHỈ hiện khi xe bị trả về / từ chối — việc chủ xe phải sửa (như web).
  const reviewReason =
    vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.NEEDS_REVISION ||
    vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.REJECTED
      ? (vehicle.latestPublicReview?.reason ?? null)
      : null;
  /* Hook nên gọi VÔ ĐIỀU KIỆN — `alerts` vắng mặt khi chưa tải xong hoặc tải hỏng. */
  const alertBadges = useVehicleAlertBadges(alerts?.alerts ?? NO_ALERTS, ALERT_CHIP_LIMIT);

  const operation = vehicle.operationStatus as VehicleOperationStatus;
  const review = vehicle.publicStatus as VehiclePublicStatus;
  const operationTone = pillToneOfStatusColor(VEHICLE_OPERATION_STATUS_META[operation].color);
  const reviewSkin = pillSkin[pillToneOfStatusColor(VEHICLE_PUBLIC_STATUS_META[review].color)];
  const pausedReason = PAUSED_REASONS.find((reason) => reason === vehicle.marketplaceVisibilityReason);

  /* Khuyến mãi CHỈ áp cho tự lái (ADR 0011) — viên "-N%" chỉ khi xe bán dịch vụ đó. */
  const selfDrive = vehicle.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE);
  const discountPercent = selfDrive ? (vehicle.discountPercent ?? 0) : 0;
  const weekdayPrice =
    (discountPercent > 0 ? discountedPriceVnd(vehicle.weekdayPrice, discountPercent) : null) ??
    vehicle.weekdayPrice;

  const identity = [vehicle.code, vehicle.plateNumber].filter(Boolean).join(LIST_SEPARATOR);
  const kinds = [
    domainLabel('vehicleType', vehicle.vehicleType),
    ...vehicle.serviceTypes.map((service) => domainLabel('serviceType', service as ServiceType)),
  ];

  // Lãi/lỗ chỉ tính khi CẢ HAI vế cùng có mặt — hai trường này vắng khi thiếu quyền `finance.view`.
  const statsReady = stats != null && !statsLoading && !statsFailed;
  const hasFinance = statsReady && stats.totalIncome != null && stats.totalExpense != null;
  const profit = hasFinance ? subtractMoney(stats.totalIncome, stats.totalExpense) : null;
  const atLoss = profit != null && isNegativeMoney(profit);

  const odometer: Metric = {
    key: 'odometer',
    label: tCard('currentOdometer'),
    value: alertsLoading
      ? null
      : alertsFailed
        ? tCard('odometerUnknown')
        : alerts
          ? fmt.km(alerts.currentOdometerKm)
          : '-',
  };
  const weekday: Metric = {
    key: 'weekday',
    label: tCard('weekdayPrice'),
    value: weekdayPrice ? fmt.money(weekdayPrice) : '-',
  };
  const weekend: Metric = {
    key: 'weekend',
    label: tCard('weekendPrice'),
    value: vehicle.weekendPrice ? fmt.money(vehicle.weekendPrice) : '-',
  };
  const finance: Metric[] =
    hasFinance && profit != null
      ? [
          { key: 'income', label: tCard('totalIncome'), value: fmt.money(stats.totalIncome as string) },
          { key: 'expense', label: tCard('totalExpense'), value: fmt.money(stats.totalExpense as string) },
          {
            key: 'profit',
            label: tCard('profit'),
            value: fmt.money(profit),
            tone: atLoss ? colors.danger : colors.success,
            strong: true,
          },
        ]
      : [];
  const allMetrics: Metric[] = [
    odometer,
    weekday,
    weekend,
    ...(statsReady
      ? [{ key: 'trips', label: tCard('completedTrips'), value: fmt.count(stats.completedBookings) }]
      : []),
    ...finance,
  ];
  /* Thu gọn: hai dòng tiền chốt của Figma; người xem không có số tiền thì hai mức giá. */
  const collapsedMetrics: Metric[] =
    finance.length > 0
      ? finance.filter((metric) => metric.key !== 'expense')
      : [weekday, weekend];
  const metrics = expanded ? allMetrics : collapsedMetrics;

  const cardActions = actions(vehicle);

  return (
    <Card onPress={open} accessibilityLabel={vehicle.name} padded={false} lift="flat">
      <YStack p={CARD_PAD} gap={BLOCK_GAP}>
        <XStack ai="center" gap={THUMB_GAP}>
          <VehicleThumb uri={vehicle.mainImageUrl} recyclingKey={vehicle.id} size="sm" />
          <YStack f={1} minWidth={0} gap={space.xs} jc="center">
            <XStack ai="center" gap={space.sm}>
              <XStack f={1} minWidth={0} ai="center" gap={space.sm}>
                <Text
                  flexShrink={1}
                  col={colors.text}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {vehicle.name}
                </Text>
                <YStack px={space.sm} py={2} br={radius.card} bg={colors.background} flexShrink={0}>
                  <Text
                    col={colors.textMuted}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={fontWeight.medium}
                    numberOfLines={1}
                  >
                    {domainLabel('vehicleSourceType', sourceType)}
                  </Text>
                </YStack>
                {discountPercent > 0 ? <DiscountTag percent={discountPercent} size="sm" /> : null}
              </XStack>
              <Pressable
                onPress={toggle}
                hitSlop={space.sm}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={expanded ? tActions('collapse') : tActions('expand')}
              >
                <YStack
                  w={TOGGLE}
                  h={TOGGLE}
                  br={radius.pill}
                  ai="center"
                  jc="center"
                  bg={expanded ? colors.brandLow : colors.surfaceMuted}
                >
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={TOGGLE_GLYPH}
                    color={expanded ? colors.brandLink : colors.textMuted}
                  />
                </YStack>
              </Pressable>
            </XStack>
            <XStack ai="center" jc="space-between" flexWrap="wrap" columnGap={space.sm} rowGap={2}>
              <Text
                flexShrink={1}
                col={colors.textMuted}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {identity}
              </Text>
              <XStack ai="center" gap={space.sm} flexShrink={1}>
                {kinds.map((kind, index) => (
                  <XStack key={`${kind}-${index}`} ai="center" gap={space.sm}>
                    {index > 0 ? <YStack w={DOT} h={DOT} br={radius.pill} bg={colors.border} /> : null}
                    <Text
                      col={colors.textMuted}
                      fos={typeScale.label.fontSize}
                      lh={typeScale.label.lineHeight}
                      numberOfLines={1}
                    >
                      {kind}
                    </Text>
                  </XStack>
                ))}
              </XStack>
            </XStack>
          </YStack>
        </XStack>

        {/* Figma "Vehicle Status": kiểm duyệt (đĩa biểu tượng + chữ) cách viên vận hành 32. */}
        <XStack ai="center" flexWrap="wrap" columnGap={STATUS_GAP} rowGap={space.xs}>
          <XStack ai="center" gap={6}>
            <YStack w={REVIEW_DISC} h={REVIEW_DISC} br={radius.pill} bg={reviewSkin.bg} ai="center" jc="center">
              {review === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC ? (
                <CheckGlyph color={reviewSkin.fg} />
              ) : (
                <Ionicons name={REVIEW_ICON[review]} size={REVIEW_GLYPH} color={reviewSkin.fg} />
              )}
            </YStack>
            <Text col={reviewSkin.fg} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
              {t(`review.${review}`)}
            </Text>
          </XStack>
          <XStack ai="center" gap={space.xs}>
            <Pill label={t(`operation.${operation}`)} tone={operationTone} size="caption" shape="tag" />
            {pausedReason ? (
              <Pill
                label={domainLabel('marketplaceVisibility', pausedReason)}
                tone={pillToneOfStatusColor(MARKETPLACE_VISIBILITY_REASON_META[pausedReason].color)}
                size="caption"
                shape="tag"
              />
            ) : null}
          </XStack>
        </XStack>

        {/* Việc cần làm + lý do bị trả về (web `VehicleCardNotices`) — chỉ khi có. */}
        {alertsLoading ? (
          <Skeleton width="60%" height={18} />
        ) : alertsFailed ? (
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {tCard('alertsUnavailable')}
          </Text>
        ) : alertBadges.length > 0 ? (
          <BadgeRows items={alertBadges} />
        ) : null}
        {reviewReason ? (
          <Text col={colors.danger} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={3}>
            {reviewReason}
          </Text>
        ) : null}

        {/* Figma "Vehicle Metrics": nền `bg/gray-50`, bo 12, đệm 8, dòng 12/18 cách 6. */}
        <YStack p={METRICS_PAD} gap={METRICS_GAP} br={radius.control} bg={colors.background}>
          {metrics.map((metric) => (
            <MetricRow key={metric.key} metric={metric} />
          ))}
          {statsLoading ? (
            <Skeleton width="100%" height={14} />
          ) : statsFailed ? (
            <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {t('card.statsUnavailable')}
            </Text>
          ) : null}
        </YStack>

        {cardActions.length > 0 ? (
          <XStack gap={space.sm}>
            {cardActions.map((action) => (
              <YStack key={action.key} f={1} minWidth={0}>
                <Button
                  label={action.label}
                  variant="gradient"
                  size="compact"
                  {...(action.icon ? { icon: action.icon } : {})}
                  onPress={action.onPress}
                />
              </YStack>
            ))}
          </XStack>
        ) : null}
      </YStack>
    </Card>
  );
}

/** Một dòng của khối số liệu: nhãn `text/gray/low` trái, giá trị đậm vừa phải. */
const MetricRow = memo(function MetricRow({ metric }: { metric: Metric }) {
  const colors = useColors();
  return (
    <XStack jc="space-between" ai="center" gap={space.sm}>
      <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
        {metric.label}
      </Text>
      {metric.value == null ? (
        <Skeleton width={72} height={14} />
      ) : (
        <Text
          col={metric.tone ?? colors.text}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
          fow={metric.strong ? fontWeight.semibold : fontWeight.medium}
          numberOfLines={1}
        >
          {metric.value}
        </Text>
      )}
    </XStack>
  );
});

export const VehicleCard = memo(VehicleCardImpl);
