import { useState, type ReactNode } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isZeroMoney, LIST_SEPARATOR, toAppTz } from '@xeprime/domain';
import { BOOKING_STATUS, BOOKING_STATUS_META, PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { SectionHeader } from '@/components/ui/CardTitle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { CustomerBooking, TenantCustomerDetail } from '../api';

/**
 * Đầu tab "Tổng quan" của chi tiết khách (web `CustomerOverviewTab`, 02/11/2026): banner công nợ
 * (khoản cũ nhất + nút Thu tiền) và thẻ "Chuyến hiện tại" kèm ba mốc (chặng · thanh toán · lịch trả).
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
  const colors = useColors();
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);
  const canCollect = permissions.has(PERMISSION.PAYMENT_RECORD) && financeFeature.isVisible;
  const [paying, setPaying] = useState<CustomerBooking | null>(null);

  const receivable = customer.receivable;
  const oldest = receivable?.oldest ?? null;
  const current = customer.currentBooking ?? null;

  return (
    <YStack gap={space.md}>
      {canViewFinance && oldest && !isZeroMoney(customer.debtAmount) ? (
        // Web `.debtBanner`: viền đỏ nhạt, ô biểu tượng, chữ; khổ hẹp thì nút "Thu tiền" xuống hàng, trải ngang.
        <YStack
          gap={space.md}
          p={space.md}
          br={radius.lg}
          bw={1}
          bc={colors.dangerBorder}
          bg={colors.dangerSurface}
          accessibilityRole="summary"
        >
          <XStack ai="flex-start" gap={space.sm}>
            <YStack w={40} h={40} br={radius.md} ai="center" jc="center" bg={colors.surface}>
              <Ionicons name="wallet-outline" size={20} color={colors.danger} />
            </YStack>
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.danger} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.bold}>
                {t('debtBanner.title', { amount: fmt.money(customer.debtAmount) })}
              </Text>
              <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                {(receivable?.count ?? 0) > 1
                  ? t('debtBanner.bodyMore', {
                      code: oldest.code,
                      count: (receivable?.count ?? 1) - 1,
                      paid: fmt.money(oldest.paidAmount),
                    })
                  : t('debtBanner.body', { code: oldest.code, paid: fmt.money(oldest.paidAmount) })}
              </Text>
            </YStack>
          </XStack>
          {canCollect ? (
            <Button label={t('debtBanner.collect')} variant="gradient" size="compact" onPress={() => setPaying(oldest)} />
          ) : null}
        </YStack>
      ) : null}

      {/*
        Web `CustomerOverviewTab`: thẻ "Đơn thuê hiện tại" = `BookingPreview` (xe · biển số · mã · dịch
        vụ · chặng; nhận/trả, thời lượng, ba dòng tiền khi có `finance.view`; bước tiếp theo + "Xem
        chi tiết đơn"), rồi khối "Tiến trình đơn thuê" riêng với ba mốc.
      */}
      {canViewBookings ? (
        <Card>
          <YStack gap={space.sm}>
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <YStack f={1} minWidth={0}>
                <SectionHeader icon="car-outline">{t('current.title')}</SectionHeader>
              </YStack>
              {current ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('current.count', { count: customer.activeBookingCount })}
                </Text>
              ) : null}
            </XStack>
            {current ? (
              <CurrentBookingPreview
                booking={current}
                canViewFinance={canViewFinance}
                onOpen={() => navigateOnce(ROUTES.manage.bookingDetail(current.id))}
              />
            ) : (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('current.empty')}
              </Text>
            )}
          </YStack>
        </Card>
      ) : null}

      {current && canViewBookings ? (
        <Card>
          <YStack gap={space.sm}>
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <YStack f={1} minWidth={0}>
                <SectionHeader icon="git-commit-outline">{t('timeline.title')}</SectionHeader>
              </YStack>
              <Text col={colors.textMuted} fos={fontSize.label}>
                #{current.code}
              </Text>
            </XStack>
            <BookingTimeline booking={current} canViewFinance={canViewFinance} />
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

/** Ba mốc của đơn hiện tại: chặng · thanh toán · lịch trả — web `BookingTimeline`. */
function BookingTimeline({
  booking,
  canViewFinance,
}: {
  booking: CustomerBooking;
  canViewFinance: boolean;
}) {
  const t = useTranslations('Customers.profile.timeline');
  const colors = useColors();
  const fmt = useAppFormat();
  const renting = booking.status === BOOKING_STATUS.ACTIVE;
  const debt = booking.debtAmount;
  const bold = (chunks: ReactNode) => <Text fow={fontWeight.bold}>{chunks}</Text>;

  const steps: {
    key: string;
    icon: 'time-outline' | 'document-text-outline' | 'calendar-outline';
    color: string;
    title: string;
    body: ReactNode;
  }[] = [
    {
      key: 'stage',
      icon: 'time-outline',
      color: colors.warning,
      title: renting ? t('renting') : t('awaiting'),
      body: renting
        ? t('rentingBody', { time: fmt.rentalAt(booking.pickupAt) })
        : t('awaitingBody', { time: fmt.rentalAt(booking.pickupAt) }),
    },
    ...(canViewFinance && debt != null
      ? [
          {
            key: 'payment',
            icon: 'document-text-outline' as const,
            color: isZeroMoney(debt) ? colors.success : colors.textMuted,
            title: isZeroMoney(debt) ? t('paid') : t('unpaid'),
            body: isZeroMoney(debt)
              ? t('paidBody')
              : t.rich('unpaidBody', { amount: fmt.money(debt), b: bold }),
          },
        ]
      : []),
    {
      key: 'return',
      icon: 'calendar-outline',
      color: colors.textMuted,
      title: t('returnPlan'),
      body: t('returnPlanBody', { time: fmt.rentalAt(booking.returnAt) }),
    },
  ];

  return (
    <YStack gap={space.sm}>
      {steps.map((step) => (
        <XStack key={step.key} gap={space.sm} ai="flex-start">
          <Ionicons name={step.icon} size={18} color={step.color} />
          <YStack f={1} gap={2}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {step.title}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {step.body}
            </Text>
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

/** Thân thẻ "Đơn thuê hiện tại" - web `BookingPreview`. */
function CurrentBookingPreview({
  booking,
  canViewFinance,
  onOpen,
}: {
  booking: CustomerBooking;
  canViewFinance: boolean;
  onOpen: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Customers.profile');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const status = booking.status;
  const awaiting = status === BOOKING_STATUS.RESERVED || status === BOOKING_STATUS.CONFIRMED;
  const renting = status === BOOKING_STATUS.ACTIVE;
  const facts: { key: string; label: string; value: string; danger?: boolean }[] = [
    { key: 'pickup', label: t('current.pickup'), value: fmt.shortDateTime(booking.pickupAt) },
    { key: 'return', label: t('current.return'), value: fmt.shortDateTime(booking.returnAt) },
    {
      key: 'duration',
      label: t('history.duration'),
      value: fmt.rentalDuration(toAppTz(booking.pickupAt), toAppTz(booking.returnAt)),
    },
    ...(canViewFinance
      ? [
          { key: 'total', label: t('current.total'), value: fmt.money(booking.totalAmount) },
          { key: 'paid', label: t('history.paid'), value: fmt.money(booking.paidAmount) },
          {
            key: 'remaining',
            label: t('history.remaining'),
            value: fmt.money(booking.debtAmount),
            danger: !isZeroMoney(booking.debtAmount ?? '0'),
          },
        ]
      : []),
  ];

  return (
    <YStack gap={space.sm}>
      <XStack ai="center" gap={space.sm}>
        {/* Ảnh xe như thẻ đơn thuê. */}
        <VehicleThumb uri={booking.vehicleImageUrl ?? null} accessibilityLabel={booking.vehicleName} />
        <YStack f={1} minWidth={0} gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
            {booking.vehicleName}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
            {[booking.vehiclePlate, booking.code, domainLabel('serviceType', booking.serviceType)]
              .filter(Boolean)
              .join(LIST_SEPARATOR)}
          </Text>
        </YStack>
        <Pill
          label={domainLabel('bookingStatus', status)}
          tone={pillToneOfStatusColor(metaColor(BOOKING_STATUS_META, status))}
        />
      </XStack>
      <YStack gap={space.xs}>
        {facts.map((fact) => (
          <XStack key={fact.key} jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {fact.label}
            </Text>
            <Text
              col={fact.danger ? colors.danger : colors.text}
              fos={fontSize.bodySm}
              fow={fontWeight.medium}
              ta="right"
            >
              {fact.value}
            </Text>
          </XStack>
        ))}
      </YStack>
      {awaiting || renting ? (
        <Text col={colors.text} fos={fontSize.bodySm}>
          <Text col={colors.textMuted}>{t('current.next')}</Text>{' '}
          {awaiting ? t('current.nextAwaiting') : t('current.nextRenting')}
        </Text>
      ) : null}
      <Text
        col={colors.primaryActive}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
        accessibilityRole="link"
        onPress={onOpen}
      >
        {t('current.viewBooking')}
      </Text>
    </YStack>
  );
}
