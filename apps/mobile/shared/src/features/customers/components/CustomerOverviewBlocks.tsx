import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isZeroMoney, LIST_SEPARATOR } from '@xeprime/domain';
import { BOOKING_STATUS, BOOKING_STATUS_META, PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { metaColor } from '@/lib/status-meta';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { formatDayTime } from '../day-time';
import type { CustomerBooking, TenantCustomerDetail } from '../api';

/** Figma "Users / Details" `24486:59791`: đệm/khe 12 (thang `space` không có 12), ô khối bo 10, ô ví 40. */
const GAP = 12;
const BLOCK_RADIUS = 10;
const WALLET_BOX = 40;
const WALLET_ICON = 24;

/**
 * Đầu tab "Tổng quan" của chi tiết khách (web `CustomerOverviewTab`) theo Figma `24486:59791`: khối
 * công nợ (khoản cũ nhất + nút Thu tiền) và thẻ "Đơn thuê hiện tại". Khối "Tiến trình đơn thuê",
 * số đơn đang chạy trên đầu thẻ và ba dòng thời lượng / đã thu / còn lại Figma không vẽ nên đã bỏ
 * (người dùng chốt 25/11/2026); số còn nợ và đã thu vẫn có ở khối công nợ và tab Thu chi.
 */
export function CustomerOverviewBlocks({
  customer,
  canViewBookings,
  canViewFinance,
}: {
  customer: TenantCustomerDetail;
  canViewBookings: boolean;
  canViewFinance: boolean;
}) {
  const t = useTranslations('Customers.profile');
  const tApp = useTranslations('Customers.app.detail.overview');
  const colors = useColors();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);
  const canCollect = permissions.has(PERMISSION.PAYMENT_RECORD) && financeFeature.isVisible;
  const [paying, setPaying] = useState<CustomerBooking | null>(null);

  const receivable = customer.receivable;
  const oldest = receivable?.oldest ?? null;
  const current = customer.currentBooking ?? null;
  const otherUnpaid = (receivable?.count ?? 1) - 1;

  return (
    <YStack gap={space.lg}>
      {canViewFinance && oldest && !isZeroMoney(customer.debtAmount) ? (
        // Figma "Outstanding payment notice": viền đỏ nhạt; hàng ô ví + nút "Thu tiền", rồi hai dòng chữ.
        <YStack
          gap={GAP}
          p={space.lg}
          br={radius.card}
          bw={1}
          bc={colors.dangerBorder}
          bg={colors.dangerSurface}
          accessibilityRole="summary"
        >
          <XStack ai="flex-start" jc="space-between" gap={space.sm}>
            <YStack
              w={WALLET_BOX}
              h={WALLET_BOX}
              br={radius.control}
              ai="center"
              jc="center"
              bg={colors.surface}
            >
              <LineIcon name="wallet" size={WALLET_ICON} color={colors.danger} />
            </YStack>
            {canCollect ? (
              <Button
                label={t('debtBanner.collect')}
                variant="gradient"
                size="compact"
                onPress={() => setPaying(oldest)}
              />
            ) : null}
          </XStack>
          <YStack gap={5}>
            <Text
              col={colors.dangerStrong}
              fos={typeScale.title.fontSize}
              lh={typeScale.title.lineHeight}
              fow={fontWeight.semibold}
            >
              {t('debtBanner.title', { amount: fmt.money(customer.debtAmount) })}
            </Text>
            <Text
              col={colors.textMuted}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
            >
              {otherUnpaid > 0
                ? tApp('debtBodyMore', {
                    code: oldest.code,
                    count: otherUnpaid,
                    paid: fmt.money(oldest.paidAmount),
                  })
                : tApp('debtBody', { code: oldest.code, paid: fmt.money(oldest.paidAmount) })}
            </Text>
          </YStack>
        </YStack>
      ) : null}

      {canViewBookings ? (
        <Card>
          <YStack gap={GAP}>
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <Text
                f={1}
                minWidth={0}
                col={colors.text}
                fos={typeScale.title.fontSize}
                lh={typeScale.title.lineHeight}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {t('current.title')}
              </Text>
              {current ? (
                <Pill
                  label={domainLabel('bookingStatus', current.status)}
                  tone={pillToneOfStatusColor(metaColor(BOOKING_STATUS_META, current.status))}
                  size="lg"
                />
              ) : null}
            </XStack>
            {current ? (
              <CurrentBookingPreview
                booking={current}
                canViewFinance={canViewFinance}
                canCollect={canCollect}
                onCollect={() => setPaying(current)}
                onOpen={() => navigateOnce(ROUTES.manage.bookingDetail(current.id))}
              />
            ) : (
              <Text
                col={colors.textMuted}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
              >
                {t('current.empty')}
              </Text>
            )}
          </YStack>
        </Card>
      ) : null}

      {paying ? (
        <RecordPaymentSheet
          open
          onClose={() => setPaying(null)}
          bookingId={paying.id}
          debtAmount={paying.debtAmount ?? '0'}
        />
      ) : null}
    </YStack>
  );
}

/** Thân thẻ "Đơn thuê hiện tại" - Figma `24486:63328` (web `BookingPreview`). */
function CurrentBookingPreview({
  booking,
  canViewFinance,
  canCollect,
  onCollect,
  onOpen,
}: {
  booking: CustomerBooking;
  canViewFinance: boolean;
  canCollect: boolean;
  onCollect: () => void;
  onOpen: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Customers.profile');
  const tApp = useTranslations('Customers.app.detail.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const status = booking.status;
  const awaiting = status === BOOKING_STATUS.RESERVED || status === BOOKING_STATUS.CONFIRMED;
  const renting = status === BOOKING_STATUS.ACTIVE;
  // Chỉ mời "Thu tiền" khi còn nợ VÀ người xem được phép ghi nhận tiền - còn lại là "Chi tiết".
  const owing = canViewFinance && booking.debtAmount != null && !isZeroMoney(booking.debtAmount);
  const collect = owing && canCollect;
  const label = {
    col: colors.placeholder,
    fos: typeScale.label.fontSize,
    lh: typeScale.label.lineHeight,
  } as const;
  const value = {
    col: colors.text,
    fos: typeScale.label.fontSize,
    lh: typeScale.label.lineHeight,
    fow: fontWeight.semibold,
  } as const;

  return (
    <YStack gap={GAP}>
      <XStack ai="center" gap={GAP}>
        <VehicleThumb
          size="card"
          uri={booking.vehicleImageUrl ?? null}
          accessibilityLabel={booking.vehicleName}
        />
        <YStack f={1} minWidth={0} gap={3}>
          <Text
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {booking.vehicleName}
          </Text>
          <Text {...label} numberOfLines={1}>
            {[booking.vehiclePlate, `#${booking.code}`, domainLabel('serviceType', booking.serviceType)]
              .filter(Boolean)
              .join(LIST_SEPARATOR)}
          </Text>
        </YStack>
      </XStack>

      {/* Nhận xe → Trả xe · Tổng tiền (khối xám). Tổng tiền chỉ có khi được xem tiền. */}
      <XStack
        ai="center"
        jc="space-between"
        gap={space.sm}
        px={GAP}
        py={BLOCK_RADIUS}
        br={BLOCK_RADIUS}
        bg={colors.background}
      >
        <YStack gap={2}>
          <Text {...label}>{t('current.pickup')}</Text>
          <Text {...value}>{formatDayTime(booking.pickupAt)}</Text>
        </YStack>
        <Text
          col={colors.placeholder}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.medium}
        >
          →
        </Text>
        <YStack gap={2}>
          <Text {...label}>{t('current.return')}</Text>
          <Text {...value}>{formatDayTime(booking.returnAt)}</Text>
        </YStack>
        {canViewFinance ? (
          <YStack gap={2} ai="flex-end">
            <Text {...label}>{tApp('total')}</Text>
            <Text {...value}>{fmt.money(booking.totalAmount)}</Text>
          </YStack>
        ) : null}
      </XStack>

      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text f={1} minWidth={0} {...label} numberOfLines={2}>
          {awaiting ? tApp('nextAwaiting') : renting ? t('current.nextRenting') : ''}
        </Text>
        <Pressable
          onPress={collect ? onCollect : onOpen}
          accessibilityRole="link"
          accessibilityLabel={collect ? tApp('collect') : tApp('detail')}
          hitSlop={8}
        >
          <XStack ai="center" gap={6}>
            <Text
              col={colors.brandLink}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
            >
              {collect ? tApp('collect') : tApp('detail')}
            </Text>
            <LineIcon name="arrow-right" size={20} color={colors.brandShape} />
          </XStack>
        </Pressable>
      </XStack>
    </YStack>
  );
}
