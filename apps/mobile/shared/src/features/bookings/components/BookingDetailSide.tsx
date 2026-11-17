import type { ReactNode } from 'react';
import { Linking, Pressable } from 'react-native';
import { Image } from 'expo-image';
import CarOutlined from '@ant-design/icons-svg/es/asn/CarOutlined';
import EditOutlined from '@ant-design/icons-svg/es/asn/EditOutlined';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_HANDOVER_PLACE,
  BOOKING_HANDOVER_PLACE_VALUES,
  type BookingHandoverPlace,
  isBookingClosedWithoutTrip,
  SERVICE_TYPE,
  STATUS_COLOR,
  TENANT_CUSTOMER_RETURNING_MIN_RENTALS,
  type BookingStatus,
} from '@xeprime/types';
import { isNegativeMoney, isZeroMoney, subtractMoney, telHref, toAppTz } from '@xeprime/domain';
import { AntIcon } from '@/components/icons/AntIcon';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { Pill } from '@/components/ui/Pill';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { Ionicons } from '@/components/icons/Ionicons';
import { Timeline, type TimelineItem } from '@/components/ui/Timeline';
import { InfoHint } from '@/components/ui/InfoHint';
import { ToneDotBadge } from '@/components/ui/ToneDotBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BookingDetail } from '../api';

/*
 * Cột phải của chi tiết đơn - bản native của web `detail/BookingDetailSide.tsx` (Figma
 * `23845:49956`). Khổ hẹp web xếp cột này LÊN TRƯỚC cột chính (`.side { order: -1 }`).
 */

/** Web `.vehicleThumb { width: 100px; height: 64px }`. */
const THUMB = { width: 100, height: 64 } as const;
/** Web `--xp-space-12` / `--xp-space-6` / `--xp-space-4` - không đổi theo khổ. */
const GAP_12 = 12;
const GAP_6 = 6;
const GAP_4 = 4;

const useStyles = makeStyles((colors) => ({
  thumb: { ...THUMB, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
}));

/**
 * Khung thẻ cột phải - web `.sideCard`: đệm `space-lg`, các phần cách 12, viền `border-subtle`, bo
 * 16, nền thẻ, KHÔNG bóng.
 */
export function SideCard({ children, label }: { children: ReactNode; label?: string }) {
  const colors = useColors();
  return (
    <YStack
      p={space.lg}
      gap={GAP_12}
      bw={1}
      bc={colors.borderSubtle}
      br={radius.card}
      bg={colors.surface}
      {...(label ? { accessibilityLabel: label } : {})}
    >
      {children}
    </YStack>
  );
}

/** Tiêu đề thẻ cột phải - web `.sideTitle`: 16 đậm vừa. */
function SideTitle({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Nút chữ của thẻ - web `.textAction`/`.textLink`: 12/500 vàng đậm, icon cách 6. */
function TextAction({
  label,
  icon,
  onPress,
  role = 'button',
}: {
  label: string;
  icon?: boolean;
  onPress: () => void;
  role?: 'button' | 'link';
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole={role} accessibilityLabel={label} hitSlop={space.sm}>
      {({ pressed }) => (
        <XStack ai="center" gap={GAP_6} opacity={pressed ? 0.7 : 1}>
          {icon ? <AntIcon icon={EditOutlined} size={fontSize.bodySm} color={colors.primaryStrong} /> : null}
          <Text col={colors.primaryStrong} fos={fontSize.body} fow={fontWeight.medium}>
            {label}
          </Text>
        </XStack>
      )}
    </Pressable>
  );
}

/**
 * Một dòng sự kiện của thẻ xe - web `.sideFacts > div`: nhãn trái (màu phụ, không co) · giá trị phải
 * (dọc, canh phải), đệm dọc 12, vạch trên `border-subtle`, chữ 12.
 */
function SideFact({ label, children }: { label: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <XStack
      jc="space-between"
      gap={space.md}
      py={GAP_12}
      borderTopWidth={1}
      borderTopColor={colors.borderSubtle}
    >
      <Text col={colors.textMuted} fos={fontSize.body} flexShrink={0}>
        {label}
      </Text>
      <YStack f={1} minWidth={0} ai="flex-end">
        {children}
      </YStack>
    </XStack>
  );
}

function FactValue({ children, strong = false }: { children: string; strong?: boolean }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fos={fontSize.body} fow={strong ? fontWeight.bold : fontWeight.regular} ta="right">
      {children}
    </Text>
  );
}

/** Thẻ xe - ảnh, biển số, hình thức, nơi nhận/trả, lộ trình (có tài xế), điểm đến, ghi chú đơn. */
export function VehicleSideCard({
  booking,
  onOpenVehicle,
  onOpenSchedule,
}: {
  booking: BookingDetail;
  /** Vắng khi không có quyền xem xe - tên là chữ thường. */
  onOpenVehicle?: (() => void) | undefined;
  /** Link "Lịch xe" (Figma) - vắng khi không có quyền xem xe. */
  onOpenSchedule?: (() => void) | undefined;
}) {
  const fmt = useAppFormat();
  const colors = useColors();
  const styles = useStyles();
  const t = useTranslations('Bookings.detailPage.side');
  const dl = useDomainLabel();
  const place = (BOOKING_HANDOVER_PLACE_VALUES as readonly string[]).includes(
    booking.handoverPlaceKind ?? '',
  )
    ? (booking.handoverPlaceKind as BookingHandoverPlace)
    : null;

  /*
   * Figma "Vehicle Summary" `24145:102864`: ảnh 85×54 · tên · viên biển số · "Lịch xe >"; hàng
   * Hình thức; dòng thời gian nhận (chấm xanh lá) → trả (chấm xanh dương) kèm nơi đổi tay.
   */
  const pickup = toAppTz(booking.pickupAt);
  const dropoff = toAppTz(booking.returnAt);
  const returnLabel =
    place === BOOKING_HANDOVER_PLACE.BRANCH ? t('returnBranch') : t('returnAgreed');
  const timeline: TimelineItem[] = [
    {
      key: 'pickup',
      dot: 'pickup',
      title: [fmt.rentalPoint(pickup), place ? t(`place.${place}`) : null].filter(Boolean).join(' - '),
      ...(booking.handoverPlace ? { lines: [booking.handoverPlace] } : {}),
      meta: fmt.rentalDuration(pickup, dropoff),
    },
    {
      key: 'return',
      dot: 'return',
      title: `${fmt.rentalPoint(dropoff)} - ${returnLabel}`,
      ...(place === BOOKING_HANDOVER_PLACE.BRANCH && booking.handoverPlace
        ? { lines: [booking.handoverPlace] }
        : {}),
    },
  ];

  return (
    <SideCard>
      <XStack ai="center" gap={GAP_12}>
        <VehicleThumb uri={booking.vehicleImageUrl ?? null} accessibilityLabel={booking.vehicleName} />
        <YStack f={1} minWidth={0} gap={space.xs} ai="flex-start">
          <Text
            col={colors.text}
            fos={fontSize.bodyLg}
            fow={fontWeight.semibold}
            numberOfLines={1}
            {...(onOpenVehicle
              ? { onPress: onOpenVehicle, accessibilityRole: 'link' as const, accessibilityHint: t('viewVehicle') }
              : {})}
          >
            {booking.vehicleName}
          </Text>
          {booking.vehiclePlate ? <Pill label={booking.vehiclePlate} tone="neutral" /> : null}
        </YStack>
        {onOpenSchedule ? (
          // Nút lịch gọn (icon) thay "Lịch xe →" để không che tên xe (người dùng 16/11/2026).
          <IconSquareButton label={t('schedule')} onPress={onOpenSchedule}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          </IconSquareButton>
        ) : null}
      </XStack>

      <YStack gap={GAP_12}>
        <XStack jc="space-between" ai="center" pb={GAP_12} borderBottomWidth={1} borderBottomColor={colors.borderSubtle}>
          <Text col={colors.textMuted} fos={fontSize.body}>
            {t('serviceType')}
          </Text>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
            {dl('serviceType', booking.serviceType)}
          </Text>
        </XStack>
        <Timeline items={timeline} />
      </YStack>

      <YStack>
        {booking.serviceType === SERVICE_TYPE.WITH_DRIVER && booking.routeType ? (
          <SideFact label={t('route')}>
            <FactValue>{dl('routeType', booking.routeType)}</FactValue>
          </SideFact>
        ) : null}
        {booking.destination ? (
          <SideFact label={t('destination')}>
            <FactValue>{booking.destination}</FactValue>
          </SideFact>
        ) : null}
        {booking.note ? (
          <SideFact label={t('note')}>
            <FactValue>{booking.note}</FactValue>
          </SideFact>
        ) : null}
      </YStack>
    </SideCard>
  );
}

/** Thẻ khách - "Chỉnh sửa" = form Sửa đơn; hồ sơ khách + giấy tờ khi có quyền. */
export function CustomerSideCard({
  booking,
  onEdit,
  onViewProfile,
  onDocuments,
}: {
  booking: BookingDetail;
  onEdit?: (() => void) | undefined;
  onViewProfile?: (() => void) | undefined;
  onDocuments?: (() => void) | undefined;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.detailPage.side');
  const tel = telHref(booking.customerPhone);

  return (
    <SideCard>
      {/* Figma "Nhóm thông tin" `24145:102920`: tên + viên "Khách quen" · SĐT, nút sửa bên phải. */}
      <XStack ai="center" gap={space.sm}>
        <YStack f={1} minWidth={0} gap={6}>
          <XStack ai="center" flexWrap="wrap" gap={space.sm}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
              {booking.customerName}
            </Text>
            {booking.customerCompletedRentals != null &&
            booking.customerCompletedRentals >= TENANT_CUSTOMER_RETURNING_MIN_RENTALS ? (
              <Pill label={t('returningCustomer')} tone="success" />
            ) : null}
          </XStack>
          {booking.customerPhone ? (
            <Text
              col={colors.text}
              fos={fontSize.body}
              alignSelf="flex-start"
              {...(tel ? { onPress: () => void Linking.openURL(tel), accessibilityRole: 'link' as const } : {})}
            >
              {booking.customerPhone}
            </Text>
          ) : (
            <Text col={colors.placeholder} fos={fontSize.label}>
              {t('noPhone')}
            </Text>
          )}
        </YStack>
        {onEdit ? (
          <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={t('edit')} hitSlop={space.sm}>
            <AntIcon icon={EditOutlined} size={20} color={colors.primary} />
          </Pressable>
        ) : null}
      </XStack>
      {booking.tenantCustomerId && (onViewProfile || onDocuments) ? (
        <XStack flexWrap="wrap" gap={space.md}>
          {onViewProfile ? <TextAction label={t('viewProfile')} role="link" onPress={onViewProfile} /> : null}
          {onDocuments ? <TextAction label={t('documents')} onPress={onDocuments} /> : null}
        </XStack>
      ) : null}
    </SideCard>
  );
}

/** Một dòng tiền - web `.moneyRows > div`: nhãn trái (màu phụ, dòng phụ 12 màu phụ ba) · số phải. */
function MoneyRow({
  label,
  detail,
  value,
  strong = false,
  negative = false,
  trailing,
}: {
  label: ReactNode;
  detail?: string | null;
  value: string;
  strong?: boolean;
  negative?: boolean;
  trailing?: ReactNode;
}) {
  const colors = useColors();
  return (
    <XStack ai="flex-start" jc="space-between" gap={space.md}>
      <YStack f={1} minWidth={0}>
        {typeof label === 'string' ? (
          <Text
            col={strong ? colors.text : colors.textMuted}
            fos={fontSize.body}
            fow={strong ? fontWeight.semibold : fontWeight.regular}
          >
            {label}
          </Text>
        ) : (
          label
        )}
        {detail ? (
          <Text col={colors.placeholder} fos={fontSize.label}>
            {detail}
          </Text>
        ) : null}
      </YStack>
      <XStack ai="center" gap={GAP_6} flexShrink={0}>
        <Text
          col={negative ? colors.danger : colors.text}
          fos={fontSize.body}
          fow={strong ? fontWeight.semibold : fontWeight.medium}
          ta="right"
        >
          {value}
        </Text>
        {trailing}
      </XStack>
    </XStack>
  );
}

/**
 * Thẻ "Thanh toán" - mọi con số do SERVER tính (ADR 0007); dòng phụ chỉ hiện khi khác 0. Đọc như
 * MỘT phép trừ: Tổng tiền chuyến − trả trước qua XePrime − đã thu = Còn phải thu (`counterDueAmount`).
 */
export function PaymentSideCard({
  booking,
  onEditFee,
}: {
  booking: BookingDetail;
  /** Vắng khi không có quyền sửa đơn hoặc đơn đã khép. */
  onEditFee?: (() => void) | undefined;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.detailPage.side');
  const fmt = useAppFormat();
  const excess = subtractMoney(booking.collectedAmount, booking.amountDue);
  const overCollected = isNegativeMoney(excess) || isZeroMoney(excess) ? null : excess;
  const prepaid = isZeroMoney(booking.ownerShareOnlineAmount) ? null : booking.ownerShareOnlineAmount;
  const settled = isZeroMoney(booking.counterDueAmount);
  const unit = booking.ownerPayout?.unitAmount ?? null;
  const days = booking.ownerPayout?.rentalDays ?? null;
  const moneyClosed = isBookingClosedWithoutTrip(booking.status as BookingStatus);

  return (
    <SideCard label={t('payment')}>
      <SideTitle>{t('payment')}</SideTitle>
      <YStack gap={GAP_12}>
        <MoneyRow
          label={t('rent')}
          detail={unit && days ? t('rentDetail', { days, unit: fmt.money(unit) }) : null}
          value={fmt.money(booking.baseAmount)}
        />
        {isZeroMoney(booking.discountAmount) ? null : (
          <MoneyRow label={t('discount')} value={`−${fmt.money(booking.discountAmount)}`} negative />
        )}
        <MoneyRow
          label={t('deliveryFee')}
          value={isZeroMoney(booking.deliveryFee) ? t('free') : fmt.money(booking.deliveryFee)}
          trailing={
            onEditFee ? (
              <Pressable onPress={onEditFee} accessibilityRole="button" accessibilityLabel={t('deliveryFee')} hitSlop={space.sm}>
                <AntIcon icon={EditOutlined} size={fontSize.bodySm} color={colors.primaryStrong} />
              </Pressable>
            ) : null
          }
        />
        {isZeroMoney(booking.surchargeTotal) ? null : (
          <MoneyRow label={t('surcharge')} value={`+${fmt.money(booking.surchargeTotal)}`} />
        )}
        <MoneyRow label={t('amountDue')} value={fmt.money(booking.amountDue)} strong />
        {prepaid ? (
          <MoneyRow
            label={
              <XStack ai="center" gap={GAP_4}>
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {t('prepaidOnline')}
                </Text>
                <InfoHint
                  label={t('prepaidOnline')}
                  size={fontSize.bodySm}
                  content={
                    booking.holdPaidAmount
                      ? t('prepaidOnlineHint', {
                          hold: fmt.money(booking.holdPaidAmount),
                          share: fmt.money(prepaid),
                        })
                      : t('prepaidOnlineHintShort')
                  }
                />
              </XStack>
            }
            value={`−${fmt.money(prepaid)}`}
          />
        ) : null}
        <MoneyRow
          label={t('collected')}
          detail={
            isZeroMoney(booking.otherCollected)
              ? null
              : `${t('otherCollected')} ${fmt.money(booking.otherCollected)}`
          }
          value={`${isZeroMoney(booking.collectedAmount) ? '' : '−'}${fmt.money(booking.collectedAmount)}`}
        />
        {overCollected ? <MoneyRow label={t('overCollected')} value={fmt.money(overCollected)} /> : null}
      </YStack>

      {/*
        Đơn huỷ / khách không đến: không còn gì để thu, nên ô "Còn phải thu" vắng hẳn. Web
        `.moneyDue`: viền vàng (`primary-border`), bo `border-radius`, đệm 12/`space-md`, cách trên
        `space-md`; thu đủ ⇒ viền xanh + nền `success-subtle`, số xanh.
      */}
      {moneyClosed ? null : (
        <YStack
          mt={space.md}
          px={space.md}
          py={GAP_12}
          gap={GAP_4}
          bw={1}
          bc={settled ? colors.successBorder : colors.primaryBorder}
          br={radius.md}
          bg={settled ? colors.successSubtle : colors.surface}
          accessibilityRole="text"
          accessibilityLabel={`${t('dueTitle')}: ${fmt.money(booking.counterDueAmount)}`}
        >
          <XStack ai="baseline" jc="space-between" gap={space.md}>
            <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('dueTitle')}
            </Text>
            <Text
              col={settled ? colors.success : colors.brandLink}
              fos={fontSize.h3}
              fow={fontWeight.bold}
              numberOfLines={1}
            >
              {fmt.money(booking.counterDueAmount)}
            </Text>
          </XStack>
          <Text col={colors.textMuted} fos={fontSize.body}>
            {settled
              ? t('dueSettled')
              : booking.actualPickupAt
                ? t('dueAfterPickup')
                : t('dueAtPickup')}
          </Text>
        </YStack>
      )}
      {/* Cọc tài sản là tiền GIỮ rồi trả lại - không cộng vào số phải thu ở trên. */}
      {isZeroMoney(booking.depositAmount) ? null : (
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('depositNote', { amount: fmt.money(booking.depositAmount) })}
        </Text>
      )}
    </SideCard>
  );
}
