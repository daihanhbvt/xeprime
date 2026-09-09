import { memo, useCallback, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { absoluteMoney, isNegativeMoney, subtractMoney, LIST_SEPARATOR } from '@xeprime/domain';
import { BadgeRows, type BadgeRowItem } from '@/components/ui/BadgeRows';
import { Card } from '@/components/ui/Card';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import { Divider } from '@/components/ui/DataRow';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { DiscountTag } from '@/components/ui/DiscountTag';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { IconName } from '@/components/ui/Chip';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { discountedPriceVnd } from '../pricing';
import { useVehicleAlertBadges } from './vehicle-alert-badges';
import type { VehicleAlertGroup, VehicleListItem, VehicleStats } from '../api';

/**
 * Tỉ lệ khung ảnh — 2:1.
 *
 * Ảnh chạy TRỌN bề ngang thẻ thay vì một ô vuông nhỏ bên trái: thứ chủ xe nhận ra một chiếc xe
 * bằng, trước cả biển số, là chính tấm ảnh.
 *
 * Dẹt hơn 16:9 một chút vì trên MỘT màn 844pt, mỗi 20pt chiều cao thẻ là một phần mười chiếc xe
 * bị đẩy khỏi tầm nhìn. 2:1 vẫn đủ cao để thấy dáng xe, mà cắt bớt phần trời/mặt đường — hai
 * thứ chiếm nhiều nhất trong một tấm ảnh chụp xe ngoài đường.
 */
const IMAGE_RATIO = 2;

/**
 * Số viên "việc cần làm" hiện trên THẺ; phần dư gộp thành `+N`.
 *
 * Hai, không phải ba: server đã sắp theo ưu tiên, nên hai viên đầu luôn là hai việc gấp nhất.
 */
const ALERT_CHIP_LIMIT = 2;

/** Mảng rỗng ở module scope: `[]` viết tại chỗ gọi là một tham chiếu mới mỗi lần render. */
const NO_ALERTS: readonly [] = [];

interface VehicleCardProps {
  vehicle: VehicleListItem;
  onPress: (vehicle: VehicleListItem) => void;
  /**
   * Vắng mặt = ẩn nút "Sửa" — đúng `hidden: !canEdit` của web.
   *
   * Quyền đọc ở MÀN, không ở thẻ: thẻ nằm trong một danh sách dài và không nên gọi
   * `usePermissions()` một lần cho mỗi dòng. Và ẩn nút chỉ là trang trí — chặn thật là guard
   * backend (CLAUDE.md §6).
   */
  onEdit?: ((vehicle: VehicleListItem) => void) | undefined;
  onSchedule: (vehicle: VehicleListItem) => void;
  /** Chỉ số của xe này; `undefined` khi chưa tải xong HOẶC khi tải hỏng — hai cờ dưới nói rõ ca nào. */
  stats?: VehicleStats | undefined;
  statsLoading: boolean;
  statsFailed: boolean;
  /** Việc cần làm + KM hiện tại, do server tính. Cùng ba trạng thái với `stats`. */
  alerts?: VehicleAlertGroup | undefined;
  alertsLoading: boolean;
  alertsFailed: boolean;
}

/**
 * Một chiếc xe trong đội xe — thẻ ẢNH LỚN.
 *
 * Bốn tầng, mỗi tầng trả lời một câu hỏi: **xe nào và đang ở trạng thái gì** (ảnh + nhãn đè lên
 * nó) · **giá bao nhiêu** (viên giá ở góc ảnh) · **đang chạy ra sao** (ba dòng chỉ số) · **làm gì
 * với nó** (thanh thao tác ở chân thẻ).
 *
 * Giá thuê nằm TRÊN ảnh chứ không trong phần chữ: nó là con số chủ xe tra nhiều nhất khi lướt đội
 * xe, và ở góc ảnh nó đọc được trước cả khi mắt xuống tới phần chữ.
 *
 * Nửa dưới cố ý CHẬT: chữ ở hai bậc nhỏ nhất, đệm một bậc `sm`, và chỉ số là ba dòng có hình dẫn
 * thay vì một lưới ô có nhãn riêng. Thẻ này nằm trong danh sách người ta cuộn hàng chục xe, nên
 * chiều cao phải trả giá cho từng điểm một.
 */
function VehicleCardImpl({
  vehicle,
  onPress,
  onEdit,
  onSchedule,
  stats,
  statsLoading,
  statsFailed,
  alerts,
  alertsLoading,
  alertsFailed,
}: VehicleCardProps) {
  const t = useTranslations('Vehicles.list');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  /* Hook nên gọi VÔ ĐIỀU KIỆN — `alerts` vắng mặt khi chưa tải xong hoặc tải hỏng. */
  const alertBadges = useVehicleAlertBadges(alerts?.alerts ?? NO_ALERTS, ALERT_CHIP_LIMIT);

  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;
  const publicStatus = vehicle.publicStatus as VehiclePublicStatus;
  const operationMeta = VEHICLE_OPERATION_STATUS_META[operationStatus];
  const publicMeta = VEHICLE_PUBLIC_STATUS_META[publicStatus];

  /*
   * Một dòng định danh, GHÉP CHUỖI đúng như `VehicleListRow` của web: mã · biển số · loại/dịch vụ.
   * Ở bố cục này nó có trọn bề ngang thẻ, nên không phải cắt làm hai dòng như bản ô ảnh vuông.
   */
  const identity = [
    vehicle.code,
    vehicle.plateNumber,
    `${domainLabel('vehicleType', vehicle.vehicleType)} / ${fmt.serviceTypes(vehicle.serviceTypes)}`,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  /*
   * Khuyến mãi CHỈ áp cho tự lái (ADR 0011), nên viên "-N%" chỉ hiện khi xe có bán dịch vụ đó —
   * và giá hiện ra là giá đã giảm, dựng bằng đúng hàm mà form giá và trang chi tiết sàn dùng.
   */
  const selfDrive = vehicle.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE);
  const discountPercent = selfDrive ? (vehicle.discountPercent ?? 0) : 0;
  const price =
    (discountPercent > 0 ? discountedPriceVnd(vehicle.weekdayPrice, discountPercent) : null) ??
    vehicle.weekdayPrice;

  // Lãi/lỗ chỉ tính khi CẢ HAI vế cùng có mặt — hai trường này vắng khi thiếu quyền `finance.view`.
  const hasFinance = stats?.totalIncome != null && stats?.totalExpense != null;
  const profit = hasFinance ? subtractMoney(stats.totalIncome, stats.totalExpense) : null;
  const atLoss = profit != null && isNegativeMoney(profit);

  /*
   * MỘT hàm mở cho cả thân thẻ lẫn nút "Xem". Viết `() => onPress(vehicle)` ở hai chỗ là hai
   * closure mới mỗi lần render, tức `memo` không bao giờ ăn, mà thẻ này nằm trong một danh sách
   * dài. Cùng khuôn với `BookingCard`.
   */
  const open = useCallback(() => onPress(vehicle), [onPress, vehicle]);

  /*
   * Dải viên nhãn dưới phần chữ: trạng thái CÔNG KHAI và việc cần làm.
   *
   * Trạng thái VẬN HÀNH không nằm ở đây mà đè lên ảnh — nó là thuộc tính của chính chiếc xe
   * trong ảnh ("đang có khách thuê"), và đưa lên đó thì dải dưới còn chỗ cho việc cần làm.
   */
  const badges: BadgeRowItem[] = [
    {
      key: 'public',
      label: domainLabel('vehiclePublicStatus', publicStatus, publicMeta.label),
      node: (
        <StatusBadge
          label={domainLabel('vehiclePublicStatus', publicStatus, publicMeta.label)}
          color={publicMeta.color}
          size="sm"
        />
      ),
    },
    ...(alertsFailed ? [] : alertBadges),
  ];

  /*
   * Ba thao tác của web (`useVehicleRowActions`): Xem · Sửa · Lịch — cùng thứ tự, cùng luật ẩn.
   *
   * "Xem" thay luôn vai mũi tên `>`: giữ cả hai là ba lối vào cùng một màn (thân thẻ, mũi tên,
   * nút) trên một bề mặt chỉ rộng 390pt.
   */
  const actions: CardAction[] = [
    { key: 'view', label: t('actions.viewShort'), icon: 'eye-outline' as IconName, onPress: open },
    ...(onEdit
      ? [
          {
            key: 'edit',
            label: t('actions.edit'),
            icon: 'create-outline' as IconName,
            onPress: () => onEdit(vehicle),
          },
        ]
      : []),
    {
      key: 'schedule',
      label: t('actions.schedule'),
      icon: 'calendar-outline' as IconName,
      onPress: () => onSchedule(vehicle),
    },
  ];

  return (
    <Card onPress={open} accessibilityLabel={vehicle.name} padded={false}>
      {/*
        TẦNG 1 — ẢNH, chạy sát ba mép thẻ. `Card` đã `overflow: hidden` nên hai góc trên tự bo
        theo thẻ; không cần bo góc riêng cho ảnh, và bo riêng thì hở một nét nền ở hai góc.
      */}
      <YStack aspectRatio={IMAGE_RATIO}>
        {/*
          Ảnh đi qua `RemoteImage` để có đủ ba trạng thái. Xe demo trong seed hotlink ảnh từ một
          máy chủ ngoài: có tấm về, có tấm bị chặn tần suất — không có nhánh HỎNG thì những tấm
          đó ở lại thành ô rỗng và đọc ra như "thẻ trắng".
        */}
        <RemoteImage
          uri={vehicle.mainImageUrl}
          recyclingKey={vehicle.id}
          fallback={
            <Ionicons name="car-outline" size={iconSize.lg * 2} color={colors.placeholder} />
          }
        />

        {/*
          Nhãn trạng thái vận hành ở góc TRÁI TRÊN, viên "-N%" ở góc phải — hai đầu một hàng, nên
          một nhãn dài ("Ngừng khai thác" / "Under maintenance") không đẩy viên kia ra khỏi ảnh.

          Cả hai viên đều có nền ĐẶC: một nhãn chữ trần đặt lên ảnh chụp thì đọc được hay không
          là tuỳ tấm ảnh, và ảnh xe nào cũng có mảng sáng lẫn mảng tối.
        */}
        <XStack
          pos="absolute"
          top={space.sm}
          left={space.sm}
          right={space.sm}
          ai="flex-start"
          jc="space-between"
          gap={space.xs}
        >
          <StatusBadge
            label={domainLabel('vehicleOperationStatus', operationStatus, operationMeta.label)}
            color={operationMeta.color}
            size="sm"
          />
          {discountPercent > 0 ? <DiscountTag percent={discountPercent} size="sm" /> : null}
        </XStack>

        {/* Giá ở góc PHẢI DƯỚI — nơi mắt rơi xuống sau khi đã nhìn xe, ngay trước phần chữ. */}
        {price ? (
          <XStack
            pos="absolute"
            bottom={space.sm}
            right={space.sm}
            maxWidth="80%"
            bg={colors.surface}
            bw={1}
            bc={colors.border}
            br={radius.pill}
            px={space.sm}
            py={2}
          >
            <Text
              col={colors.price}
              fos={fontSize.bodySm}
              fow={fontWeight.bold}
              numberOfLines={1}
            >
              {fmt.pricePerDay(price)}
            </Text>
          </XStack>
        ) : null}
      </YStack>

      <YStack p={space.sm} gap={space.xs}>
        {/* TẦNG 2 — định danh. Một dòng tên, một dòng mã · biển số · loại/dịch vụ. */}
        <YStack gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold} numberOfLines={1}>
            {vehicle.name}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
            {identity}
          </Text>
        </YStack>

        {/* TẦNG 3 — trạng thái công khai và việc cần làm, xếp hàng cho khít bằng `BadgeRows`. */}
        {alertsLoading ? (
          <Skeleton width="70%" height={18} />
        ) : (
          <YStack gap={space.xs}>
            <BadgeRows items={badges} />
            {/* Cảnh báo tải hỏng là một CÂU, không phải viên nhãn — nó không vào phép xếp hàng. */}
            {alertsFailed ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('card.alertsUnavailable')}
              </Text>
            ) : null}
          </YStack>
        )}

        {/*
          TẦNG 4 — CHỈ SỐ, ba dòng chữ nhỏ có hình dẫn đầu, tách khỏi phần trên bằng kẻ mảnh.

          Không phải lưới ô có nhãn riêng: lưới hai cột × hai hàng cao gần gấp đôi mà nói đúng
          bấy nhiêu thứ, và trên một danh sách cuộn dài thì mỗi thẻ dôi ra 40pt là bớt gần một
          thẻ mỗi màn. Ở đây nhãn đi LIỀN con số trong cùng một câu ("KM hiện tại: 42.500 km"),
          nên vẫn không con số nào phải đoán.

          Hình dẫn đầu mang màu NGỮ NGHĨA của chính con số nó dẫn (đơn = `info`, lãi/lỗ =
          `success`/`danger`): ở cỡ 12px, hình nhận ra nhanh hơn chữ, nên mắt nhảy thẳng tới dòng
          cần đọc. Chữ vẫn mờ — tô cả ba dòng theo màu thì không dòng nào nổi lên nữa.
        */}
        <Divider />
        <YStack gap={2}>
          {alertsLoading ? (
            <Skeleton width="45%" height={14} />
          ) : alertsFailed || !alerts ? null : (
            <Stat icon="speedometer-outline">
              {t('row.odometer', { value: fmt.km(alerts.currentOdometerKm) })}
            </Stat>
          )}

          {statsLoading ? (
            <>
              <Skeleton width="55%" height={14} />
              <Skeleton width="40%" height={14} />
            </>
          ) : statsFailed || !stats ? (
            <Stat icon="alert-circle-outline">{t('card.statsUnavailable')}</Stat>
          ) : (
            <>
              <Stat icon="documents-outline" tone={colors.info}>
                {t.rich('row.bookings', {
                  active: stats.activeBookings,
                  done: stats.completedBookings,
                  n: strong,
                })}
              </Stat>
              {/*
                Thu và lãi/lỗ ĐI CHUNG một dòng — hai vế của cùng một phép tính, đọc rời nhau thì
                phải nhớ số dòng trên. Chỉ có khi người xem có quyền `finance.view`.
              */}
              {profit != null ? (
                <Stat icon="wallet-outline" tone={atLoss ? colors.danger : colors.success}>
                  {t.rich('row.income', {
                    value: fmt.moneyCompact(stats.totalIncome),
                    n: strong,
                  })}
                  {LIST_SEPARATOR}
                  {t.rich(atLoss ? 'row.loss' : 'row.profit', {
                    value: fmt.moneyCompact(absoluteMoney(profit)),
                    n: (chunks) => (
                      <Strong tone={atLoss ? colors.danger : colors.success}>{chunks}</Strong>
                    ),
                  })}
                </Stat>
              ) : null}
            </>
          )}
        </YStack>
      </YStack>

      <CardActionBar actions={actions} />
    </Card>
  );
}

/**
 * Bộ dựng phần `<n>` dùng chung cho mọi dòng có nhãn.
 *
 * Khai ở module scope, không phải trong thân component: viết `(chunks) => <Strong>…` ngay tại
 * chỗ gọi là mấy closure mới mỗi lần render, mà thẻ này nằm trong một danh sách dài.
 */
const strong = (chunks: ReactNode) => <Strong>{chunks}</Strong>;

/** Một dòng chỉ số: hình dẫn đầu + chữ, cả dòng ở bậc chữ nhỏ nhất của thẻ. */
function Stat({ icon, tone, children }: { icon: IconName; tone?: string; children: ReactNode }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons name={icon} size={iconSize.sm} color={tone ?? colors.textMuted} />
      <Text f={1} col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
        {children}
      </Text>
    </XStack>
  );
}

/** Phần `<n>` của message: con số được nhấn, chữ dẫn quanh nó vẫn mờ — đúng vai `<b>` của web. */
function Strong({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <Text col={tone ?? colors.text} fow={fontWeight.semibold}>
      {children}
    </Text>
  );
}

export const VehicleCard = memo(VehicleCardImpl);
