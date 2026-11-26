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
import { isNegativeMoney, isZeroMoney, subtractMoney, sumMoney, telHref, toAppTz } from '@xeprime/domain';
import { AntIcon } from '@/components/icons/AntIcon';
import { LineIcon } from '@/components/icons/LineIcon';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { Pill } from '@/components/ui/Pill';
import { LinkArrow } from '@/components/ui/LinkArrow';
import { Timeline, type TimelineItem } from '@/components/ui/Timeline';
import { InfoHint } from '@/components/ui/InfoHint';
import { ToneDotBadge } from '@/components/ui/ToneDotBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
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

/** Tiêu đề thẻ cột phải - CÙNG cỡ/độ đậm với tiêu đề `SectionCard` ("Lợi nhuận chuyến"…, 20/11/2026). */
export function SideTitle({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text
      col={colors.text}
      fos={fontSize.h4}
      fow={fontWeight.bold}
      lh={Math.round(fontSize.h4 * 1.4)}
      accessibilityRole="header"
    >
      {children}
    </Text>
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
  title,
}: {
  booking: BookingDetail;
  /** Tiêu đề thẻ - chỉ tấm chi tiết công nợ có ("Xe & Giao nhận", Figma `24512:133583`). */
  title?: string | undefined;
  /** Vắng khi không có quyền xem xe - tên là chữ thường. */
  onOpenVehicle?: (() => void) | undefined;
  /** Link "Lịch xe" (Figma) - vắng khi không có quyền xem xe. */
  onOpenSchedule?: (() => void) | undefined;
}) {
  const fmt = useAppFormat();
  const colors = useColors();
  const styles = useStyles();
  const t = useTranslations('Bookings.detailPage.side');
  const tApp = useTranslations('Bookings.detailPage.partnerApp');
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
  // App: "Trả tại chi nhánh" như Figma (Figma ghi "đại lý" - app dùng "chi nhánh"); web giữ câu cũ.
  const returnLabel =
    place === BOOKING_HANDOVER_PLACE.BRANCH ? tApp('returnBranch') : t('returnAgreed');
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
      {title ? <SideTitle>{title}</SideTitle> : null}
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
          {/* Figma "_Badge" biển số: nền `gray-50`, bo 16, KHÔNG viền. */}
          {booking.vehiclePlate ? <Pill label={booking.vehiclePlate} tone="neutral" borderless /> : null}
        </YStack>
        {onOpenSchedule ? (
          // Figma `24145:101960`: chữ "Lịch xe ›" ở góc phải thẻ xe (người dùng chốt 20/11/2026).
          <YStack als="flex-start">
            <LinkArrow label={t('schedule')} onPress={onOpenSchedule} icon="chevron-right" />
          </YStack>
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

/**
 * Thẻ khách (Figma `24145:102920`) - tên (bấm mở hồ sơ khách khi có quyền) · "Khách quen" · SĐT ·
 * bút "Chỉnh sửa" = form Sửa đơn. Không còn hàng link: hồ sơ qua tên, giấy tờ qua tab Chuẩn bị.
 */
export function CustomerSideCard({
  booking,
  onEdit,
  onViewProfile,
}: {
  booking: BookingDetail;
  onEdit?: (() => void) | undefined;
  onViewProfile?: (() => void) | undefined;
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
            <Text
              col={colors.text}
              fos={fontSize.body}
              fow={fontWeight.semibold}
              numberOfLines={1}
              {...(onViewProfile
                ? { onPress: onViewProfile, accessibilityRole: 'link' as const, accessibilityHint: t('viewProfile') }
                : {})}
            >
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
          // Figma "Edit 2" vàng thương hiệu (bộ `LineIcon`).
          <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={t('edit')} hitSlop={space.sm}>
            <LineIcon name="edit" size={20} color={colors.primary} />
          </Pressable>
        ) : null}
      </XStack>
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
  const tApp = useTranslations('Bookings.detailPage.side.partnerApp');
  const fmt = useAppFormat();
  const prepaid = isZeroMoney(booking.ownerShareOnlineAmount) ? null : booking.ownerShareOnlineAmount;
  // Thu vượt = (trả trước qua XePrime + đã thu tại quầy) − tổng chuyến (web `PaymentSideCard`). Bỏ `D`
  // là nói "không vượt" với một đơn đã thu trọn tiền thuê ở quầy khi khách đã trả trước một phần.
  const excess = subtractMoney(
    sumMoney([booking.collectedAmount, booking.ownerShareOnlineAmount]),
    booking.amountDue,
  );
  const overCollected = isNegativeMoney(excess) || isZeroMoney(excess) ? null : excess;
  const settled = isZeroMoney(booking.counterDueAmount);
  const unit = booking.ownerPayout?.unitAmount ?? null;
  const days = booking.ownerPayout?.rentalDays ?? null;
  const moneyClosed = isBookingClosedWithoutTrip(booking.status as BookingStatus);

  return (
    <SideCard label={t('payment')}>
      {/* "Chưa gồm cọc tài sản…" thành dấu "i" cạnh tiêu đề (người dùng 20/11/2026). */}
      <XStack ai="center" gap={GAP_4}>
        <SideTitle>{t('payment')}</SideTitle>
        {isZeroMoney(booking.depositAmount) ? null : (
          <InfoHint
            label={t('payment')}
            size={fontSize.body}
            content={t('depositNote', { amount: fmt.money(booking.depositAmount) })}
          />
        )}
      </XStack>
      {/*
        Figma "Thanh toán" `24512:130949` (người dùng chốt 20/11/2026): các dòng cách 8 (dòng
        "Tổng tiền chuyến" bỏ ngày 20/11 đã bổ sung lại 26/11/2026); đọc thẳng một phép trừ xuống "Còn lại (phải thu)" dưới vạch kẻ. Nhãn
        "Trả trước qua XePrime" giữ đúng nghĩa (là phần `D`, không phải cả tiền giữ chỗ).
      */}
      <YStack gap={space.sm}>
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
        {/*
          Web `PaymentSideCard`: "Tổng tiền chuyến" đậm, đứng trước phần trừ (trả trước · đã thu).
          Người dùng bổ sung lại 26/11/2026 - thiếu nó thì "Đã trả x / y" của tấm Công nợ không có
          con số y để đối chiếu.
        */}
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
        Đơn huỷ / khách không đến: không còn gì để thu, nên dòng "Còn lại" vắng hẳn. Figma: vạch kẻ,
        rồi nhãn xám + số 18 vàng; thu đủ ⇒ số xanh. Câu "thu khi giao xe…" vào dấu "i".
      */}
      {moneyClosed ? null : (
        <YStack gap={space.sm}>
          <YStack h={1} bg={colors.borderSubtle} />
          <XStack
            ai="center"
            jc="space-between"
            gap={space.md}
            accessibilityRole="text"
            accessibilityLabel={`${tApp('due')}: ${fmt.money(booking.counterDueAmount)}`}
          >
            <XStack f={1} minWidth={0} ai="center" gap={GAP_4}>
              <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                {tApp('due')}
              </Text>
              <InfoHint
                label={tApp('due')}
                size={fontSize.bodySm}
                content={
                  settled
                    ? t('dueSettled')
                    : booking.actualPickupAt
                      ? t('dueAfterPickup')
                      : t('dueAtPickup')
                }
              />
            </XStack>
            <Text
              col={settled ? colors.success : colors.brandLink}
              fos={typeScale.heading.fontSize}
              lh={typeScale.heading.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {fmt.money(booking.counterDueAmount)}
            </Text>
          </XStack>
        </YStack>
      )}
    </SideCard>
  );
}
