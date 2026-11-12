import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isZeroMoney, rentalProgress } from '@xeprime/domain';
import { BOOKING_STATUS, PERMISSION, type BookingStatus } from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useHandoverContext } from '@/features/handovers/hooks/use-handovers';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BookingDetail } from '../api';

type Stage = 'awaitingPickup' | 'renting' | 'completed' | 'cancelled' | 'noShow';
type StepState = 'done' | 'current' | 'todo' | 'failed';

/** Chặng hiển thị của đơn — chép `bookingStageOf` của web (`detail/BookingDetailSections`). */
export function bookingStageOf(status: string): Stage {
  switch (status as BookingStatus) {
    case BOOKING_STATUS.ACTIVE:
      return 'renting';
    case BOOKING_STATUS.COMPLETED:
      return 'completed';
    case BOOKING_STATUS.CANCELLED:
      return 'cancelled';
    case BOOKING_STATUS.NO_SHOW:
      return 'noShow';
    default:
      return 'awaitingPickup';
  }
}

/**
 * Đã xác nhận → Chờ giao xe → Đang thuê → Hoàn thành, mỗi bước kèm MỐC GIỜ — bản native của
 * `BookingStepper` (web, 03/11/2026). Đơn huỷ / khách không đến: KHÔNG có thanh bước (web 05/11/2026) —
 * banner kết cục nói đủ.
 */
export function BookingStepper({ booking }: { booking: BookingDetail }) {
  const t = useTranslations('Bookings.detailPage');
  const colors = useColors();
  const fmt = useAppFormat();
  const stage = bookingStageOf(booking.status);
  const ended = stage === 'cancelled' || stage === 'noShow';
  // Đơn huỷ / khách không đến KHÔNG có thanh bước (web 05/11/2026) — banner kết cục nói đủ.
  if (ended) return null;
  const at = (
    key: 'confirmed' | 'holdPaid' | 'pickupDue' | 'pickedUp' | 'returnDue' | 'returned',
    iso: string,
  ) => t(`stepAt.${key}`, { time: fmt.shortDateTime(iso) });

  const confirmed = {
    key: 'confirmed',
    label: t('stage.confirmed'),
    hint: booking.confirmedAt ? at('confirmed', booking.confirmedAt) : null,
  };
  const base = [
    confirmed,
    {
      key: 'awaitingPickup',
      label: t('stage.awaitingPickup'),
      hint: booking.holdPaidAt ? at('holdPaid', booking.holdPaidAt) : null,
    },
    {
      key: 'renting',
      label: t('stage.renting'),
      hint: booking.actualPickupAt
        ? at('pickedUp', booking.actualPickupAt)
        : at('pickupDue', booking.pickupAt),
    },
    {
      key: 'completed',
      label: t('stage.completed'),
      hint: booking.actualReturnAt
        ? at('returned', booking.actualReturnAt)
        : at('returnDue', booking.returnAt),
    },
  ];
  const current = stage === 'renting' ? 2 : stage === 'completed' ? 3 : 1;
  const steps: { key: string; label: string; hint: string | null; state: StepState }[] = base.map((step, index) => ({
        ...step,
        state:
          index < current || stage === 'completed'
            ? 'done'
            : index === current
              ? 'current'
              : 'todo',
      }));

  const dotColor: Record<StepState, string> = {
    done: colors.success,
    current: colors.primary,
    todo: colors.borderInput,
    failed: colors.danger,
  };

  return (
    <Card accessibilityLabel={t('stepperLabel')}>
      <YStack gap={0}>
        {steps.map((step, index) => (
          <XStack key={step.key} gap={space.sm} ai="stretch">
            <YStack ai="center" w={22}>
              <YStack
                w={18}
                h={18}
                br={radius.pill}
                ai="center"
                jc="center"
                bg={step.state === 'todo' ? 'transparent' : dotColor[step.state]}
                bw={step.state === 'todo' ? 1.5 : 0}
                bc={dotColor.todo}
              >
                {step.state === 'done' ? (
                  <Ionicons name="checkmark" size={12} color={colors.onPrimary} />
                ) : step.state === 'failed' ? (
                  <Ionicons name="close" size={12} color={colors.onPrimary} />
                ) : null}
              </YStack>
              {index < steps.length - 1 ? (
                <YStack f={1} w={2} minHeight={14} bg={colors.borderSubtle} />
              ) : null}
            </YStack>
            <YStack f={1} pb={index < steps.length - 1 ? space.sm : 0} gap={2}>
              <Text
                col={step.state === 'failed' ? colors.danger : colors.text}
                fos={fontSize.bodySm}
                fow={step.state === 'current' ? fontWeight.bold : fontWeight.semibold}
              >
                {step.label}
              </Text>
              {step.hint ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {step.hint}
                </Text>
              ) : null}
            </YStack>
          </XStack>
        ))}
      </YStack>
    </Card>
  );
}

/** Banner kết cục của đơn đã khép — web `BookingOutcomeBanner`. */
export function BookingOutcomeBanner({ booking }: { booking: BookingDetail }) {
  const t = useTranslations('Bookings.detailPage');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const stage = bookingStageOf(booking.status);
  if (stage === 'completed') {
    const payable = booking.ownerPayout?.ownerPayableAmount;
    return (
      <Callout tone="success">
        {payable && !isZeroMoney(payable)
          ? t('completedBanner', { amount: fmt.money(payable) })
          : t('completedBannerPlain')}
      </Callout>
    );
  }
  if (stage === 'cancelled' || stage === 'noShow') {
    // Lý do huỷ = nhóm lý do + câu gửi khách của `booking_cancellations` (web 05/11/2026).
    const reason = [
      booking.cancellationReasonCategory
        ? domainLabel('cancellationReasonCategory', booking.cancellationReasonCategory)
        : null,
      booking.cancellationReason?.trim() || null,
    ]
      .filter(Boolean)
      .join(' — ');
    return (
      <Callout tone="danger">
        {stage === 'noShow'
          ? t('noShowBanner')
          : reason
            ? t('cancelledBannerWithReason', { reason })
            : t('cancelledBanner')}
      </Callout>
    );
  }
  return null;
}

/**
 * "CHUYẾN ĐI & THỜI GIAN THUÊ" — web `TripScheduleCard`: Nhận xe (giờ hẹn, tiến độ theo giờ xe THẬT
 * rời tay, câu tình trạng + Odo giao) rồi Trả xe (đúng/trễ hạn + Odo nhận), kèm ghi chú bàn giao.
 */
export function TripScheduleCard({ booking }: { booking: BookingDetail }) {
  const t = useTranslations('Bookings.detailPage.trip');
  const colors = useColors();
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const handover = useHandoverContext(booking.id, permissions.has(PERMISSION.HANDOVER_VIEW)).data;
  const stage = bookingStageOf(booking.status);
  const progress = rentalProgress(booking.actualPickupAt ?? booking.pickupAt, booking.returnAt);
  const percent = stage === 'completed' ? 100 : stage === 'renting' ? progress.percent : 0;
  const late =
    booking.actualReturnAt != null && new Date(booking.actualReturnAt) > new Date(booking.returnAt);
  const pickupOdo = handover?.pickup?.confirmedAt ? handover.pickup.odometerKm : null;
  const returnOdo = handover?.return?.confirmedAt ? handover.return.odometerKm : null;
  const notes = [handover?.pickup?.notes, handover?.return?.notes].filter(Boolean);
  const overdue = stage === 'renting' && progress.overdueMinutes > 0;

  const pickupLine =
    stage === 'cancelled' || stage === 'noShow'
      ? t('notHappened')
      : stage === 'awaitingPickup'
        ? t('notStarted')
        : booking.actualPickupAt
          ? [
              t('handedOver', { time: fmt.shortDateTime(booking.actualPickupAt) }),
              pickupOdo != null ? t('odometer', { km: fmt.km(pickupOdo) }) : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : null;
  const returnLine =
    stage === 'completed' && booking.actualReturnAt
      ? [
          late
            ? t('returnedLate', { time: fmt.shortDateTime(booking.actualReturnAt) })
            : t('returnedOnTime', { time: fmt.shortDateTime(booking.actualReturnAt) }),
          returnOdo != null ? t('odometer', { km: fmt.km(returnOdo) }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : stage === 'renting'
        ? overdue
          ? t('overdue', { duration: fmt.minutesDuration(progress.overdueMinutes) })
          : t('remaining', { duration: fmt.minutesDuration(progress.remainingMinutes) })
        : null;

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('title')}</BlockTitle>
        <YStack gap={space.xs}>
          <XStack jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('pickup')}
            </Text>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {fmt.shortDateTime(booking.pickupAt)}
            </Text>
          </XStack>
          <ProgressBar
            percent={Math.max(percent, 1)}
            tone={overdue ? 'exception' : 'active'}
            size="sm"
          />
          {pickupLine ? (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {pickupLine}
            </Text>
          ) : null}
        </YStack>
        <YStack gap={space.xs}>
          <XStack jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('return')}
            </Text>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {fmt.shortDateTime(booking.returnAt)}
            </Text>
          </XStack>
          <Text
            col={overdue ? colors.danger : returnLine ? colors.textMuted : colors.placeholder}
            fos={fontSize.label}
          >
            {returnLine ?? t('notRecorded')}
          </Text>
        </YStack>
        {notes.length > 0 ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('note', { note: notes.join(' · ') })}
          </Text>
        ) : null}
      </YStack>
    </Card>
  );
}
