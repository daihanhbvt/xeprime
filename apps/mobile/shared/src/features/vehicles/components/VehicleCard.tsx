import { memo, useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
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
import { isNegativeMoney, subtractMoney } from '@xeprime/domain';
import { Ionicons } from '@/components/icons/Ionicons';
import { CheckGlyph } from '@/components/icons/CheckGlyph';
import { LineIcon } from '@/components/icons/LineIcon';
import type { IconName } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { CardAction } from '@/components/ui/CardActionBar';
import { Pill, pillToneOfStatusColor, usePillSkin } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { VehicleAlertGroup, VehicleListItem, VehicleStats } from '../api';

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

/*
 * Số đo Figma "Vehicle Summary" (Danh sách xe MB `24158:103762`): thẻ đệm 12, khối cách 8, viền
 * `stroke/gray-low200`, bo 16; ảnh 63×40 cách cột chữ 12; nút mở/thu tròn 24; khối số liệu nền
 * `bg/gray-50` bo 12 đệm 8, dòng cách 6; kiểm duyệt cách viên vận hành 32.
 */
const CARD_PAD = 12;
const BLOCK_GAP = 8;
const THUMB_GAP = 12;
const TOGGLE = 24;
/** Figma "Down 2" / "Up 2" khung 20 (`LineIcon chevron-down-md`; "Up 2" = cùng nét lật dọc). */
const TOGGLE_GLYPH = 20;
/** Figma "Check Icon" xs: tròn 20, nền `status/*-low`, glyph 12; cách chữ 6; khối cách viên vận hành 32. */
const REVIEW_BADGE = 20;
const REVIEW_GLYPH = 12;
const REVIEW_TEXT_GAP = 6;
const ROTATE_UP = [{ rotate: '180deg' }] as const;
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
  actions?: (vehicle: VehicleListItem) => readonly CardAction[];
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

  const operation = vehicle.operationStatus as VehicleOperationStatus;
  const review = vehicle.publicStatus as VehiclePublicStatus;
  const operationTone = pillToneOfStatusColor(VEHICLE_OPERATION_STATUS_META[operation].color);
  const reviewSkin = pillSkin[pillToneOfStatusColor(VEHICLE_PUBLIC_STATUS_META[review].color)];

  /* Viên "-N%" cạnh tên (Figma 24158:103997) - khuyến mãi CHỈ áp cho tự lái (ADR 0011). */
  const discountPercent = vehicle.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE)
    ? (vehicle.discountPercent ?? 0)
    : 0;
  /* Giá GỐC như thẻ web (`VehicleCardParts` - `weekdayPrice`). */
  const weekdayPrice = vehicle.weekdayPrice;

  /* Figma chỉ vẽ biển số (người dùng chốt 25/11/2026); xe chưa có biển thì rơi về mã xe. */
  const identity = vehicle.plateNumber || vehicle.code;
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

  const cardActions = actions ? actions(vehicle) : [];

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
                {discountPercent > 0 ? (
                  <Pill label={`-${discountPercent}%`} tone="success" borderless />
                ) : null}
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
                  <YStack transform={expanded ? ROTATE_UP : undefined}>
                    <LineIcon
                      name="chevron-down-md"
                      size={TOGGLE_GLYPH}
                      color={expanded ? colors.brandLink : colors.textMuted}
                    />
                  </YStack>
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

        {/*
          Figma "Vehicle Status": kiểm duyệt = icon tròn + chữ TRẦN màu trạng thái (người dùng chốt
          25/11/2026, thay chip 19/11). Hàng dàn đều: Sở hữu · Kiểm duyệt · Vận hành. Việc cần làm, lý do
          bị trả về, viên tạm ẩn đã bỏ khỏi thẻ - màn chi tiết xe hiện đủ.
        */}
        <XStack ai="center" jc="space-between" flexWrap="wrap" columnGap={space.sm} rowGap={space.xs}>
          {/* Figma 24158:103997: viên nguồn xe xuống hàng trạng thái, đứng đầu. */}
          {/* Figma `24599:137389`: nền `bg/gray-100`. */}
          <YStack px={space.sm} py={2} br={radius.card} bg={colors.surfaceMuted} flexShrink={0}>
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
          <XStack ai="center" gap={REVIEW_TEXT_GAP}>
            <YStack w={REVIEW_BADGE} h={REVIEW_BADGE} br={radius.pill} ai="center" jc="center" bg={reviewSkin.bg}>
              {review === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC ? (
                <CheckGlyph size={REVIEW_GLYPH} color={reviewSkin.fg} />
              ) : (
                /* Figma chỉ vẽ ca "Đã kiểm duyệt"; các trạng thái khác giữ glyph cũ trong cùng khuôn. */
                <Ionicons name={REVIEW_ICON[review]} size={REVIEW_GLYPH} color={reviewSkin.fg} />
              )}
            </YStack>
            <Text
              col={reviewSkin.fg}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.regular}
              numberOfLines={1}
            >
              {t(`review.${review}`)}
            </Text>
          </XStack>
          {/* Viên vận hành bo TRÒN (người dùng chốt 25/11/2026, Figma vẽ bo 6). */}
          <Pill label={t(`operation.${operation}`)} tone={operationTone} />
        </XStack>

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
              <YStack key={action.key} flexGrow={1} flexShrink={1} flexBasis="auto" minWidth={0}>
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
      <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} numberOfLines={1}>
        {metric.label}
      </Text>
      {metric.value == null ? (
        <Skeleton width={72} height={14} />
      ) : (
        <Text
          col={metric.tone ?? colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
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
