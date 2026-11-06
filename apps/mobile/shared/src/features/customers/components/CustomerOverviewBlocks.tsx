import { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isZeroMoney } from '@xeprime/domain';
import { BOOKING_STATUS, BOOKING_STATUS_META, PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { metaColor } from '@/lib/status-meta';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
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
  const domainLabel = useDomainLabel();
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
        <XStack
          ai="center"
          gap={space.sm}
          p={space.md}
          br={radius.md}
          bg={colors.dangerSurface}
          accessibilityRole="summary"
        >
          <Ionicons name="wallet-outline" size={22} color={colors.danger} />
          <YStack f={1} gap={2}>
            <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.bold}>
              {t('debtBanner.title', { amount: fmt.money(customer.debtAmount) })}
            </Text>
            <Text col={colors.text} fos={fontSize.label}>
              {(receivable?.count ?? 0) > 1
                ? t('debtBanner.bodyMore', {
                    code: oldest.code,
                    count: (receivable?.count ?? 1) - 1,
                    paid: fmt.money(oldest.paidAmount),
                  })
                : t('debtBanner.body', { code: oldest.code, paid: fmt.money(oldest.paidAmount) })}
            </Text>
          </YStack>
          {canCollect ? (
            <Button
              label={t('debtBanner.collect')}
              size="sm"
              block={false}
              onPress={() => setPaying(oldest)}
            />
          ) : null}
        </XStack>
      ) : null}

      {canViewBookings ? (
        <Card {...(current ? { onPress: () => navigateOnce(ROUTES.manage.bookingDetail(current.id)) } : {})}>
          <YStack gap={space.sm}>
            <BlockTitle>{t('current.title')}</BlockTitle>
            {current ? (
              <>
                <XStack ai="center" gap={space.sm}>
                  <YStack f={1} gap={2}>
                    <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
                      #{current.code} · {current.vehicleName}
                    </Text>
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {t('current.count', { count: customer.activeBookingCount })}
                    </Text>
                  </YStack>
                  <StatusBadge
                    label={domainLabel('bookingStatus', current.status)}
                    color={metaColor(BOOKING_STATUS_META, current.status)}
                    size="sm"
                  />
                </XStack>
                <BookingTimeline booking={current} canViewFinance={canViewFinance} />
              </>
            ) : (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
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
        ? t('rentingBody', { time: fmt.shortDateTime(booking.pickupAt) })
        : t('awaitingBody', { time: fmt.shortDateTime(booking.pickupAt) }),
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
      body: t('returnPlanBody', { time: fmt.shortDateTime(booking.returnAt) }),
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
