import CheckOutlined from '@ant-design/icons-svg/es/asn/CheckOutlined';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { AntIcon } from '@/components/icons/AntIcon';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isZeroMoney, rentalProgress, toAppTz } from '@xeprime/domain';
import {
  BOOKING_HISTORY_OUTCOME,
  BOOKING_STATUS,
  CANCELLATION_PARTY,
  HANDOVER_CONFIRM_SOURCE,
  PERMISSION,
  STATUS_COLOR,
  type BookingStatus,
  type StatusColor,
} from '@xeprime/types';
import { ToneDotBadge } from '@/components/ui/ToneDotBadge';
import { SectionCard } from '@/components/ui/SectionCard';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useHandoverContext } from '@/features/handovers/hooks/use-handovers';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
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
export function BookingStepper({
  booking,
  variant = 'dots',
}: {
  booking: BookingDetail;
  /** `bar` = thanh 4 đoạn trong thanh trên (Figma "Status Labels" `24145:102674`). */
  variant?: 'dots' | 'bar';
}) {
  const t = useTranslations('Bookings.detailPage');
  const colors = useColors();
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const handover = useHandoverContext(booking.id, permissions.has(PERMISSION.HANDOVER_VIEW)).data;
  const stage = bookingStageOf(booking.status);
  const ended = stage === 'cancelled' || stage === 'noShow';
  // Đơn huỷ / khách không đến KHÔNG có thanh bước (web 05/11/2026) — banner kết cục nói đủ.
  if (ended) return null;
  // Biên bản do LỜI CỦA KHÁCH (ADR 0081) — thanh bước nói rõ không phải gian hàng đã kiểm xe.
  const pickupByCustomer = handover?.pickup?.confirmSource === HANDOVER_CONFIRM_SOURCE.CUSTOMER;
  const returnAuto = handover?.return?.confirmSource === HANDOVER_CONFIRM_SOURCE.AUTO;
  const at = (
    key:
      | 'confirmed'
      | 'holdPaid'
      | 'pickupDue'
      | 'pickedUp'
      | 'pickedUpByCustomer'
      | 'returnDue'
      | 'returned'
      | 'returnedAuto',
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
      // Kèm SỐ TIỀN đã về (06/11/2026) — số khách thực chuyển cho XePrime.
      hint: booking.holdPaidAt
        ? booking.holdPaidAmount
          ? t('stepAt.holdPaidAmount', {
              amount: fmt.money(booking.holdPaidAmount),
              time: fmt.shortDateTime(booking.holdPaidAt),
            })
          : at('holdPaid', booking.holdPaidAt)
        : null,
    },
    {
      key: 'renting',
      label: t('stage.renting'),
      hint: booking.actualPickupAt
        ? at(pickupByCustomer ? 'pickedUpByCustomer' : 'pickedUp', booking.actualPickupAt)
        : at('pickupDue', booking.pickupAt),
    },
    {
      key: 'completed',
      label: t('stage.completed'),
      hint: booking.actualReturnAt
        ? at(returnAuto ? 'returnedAuto' : 'returned', booking.actualReturnAt)
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

  if (variant === 'bar') {
    return (
      <XStack gap={STEP_BAR_GAP} accessibilityLabel={t('stepperLabel')} accessibilityRole="list">
        {steps.map((step) => (
          <YStack key={step.key} f={1} gap={6} ai="center" minWidth={0}>
            <YStack
              w="100%"
              h={STEP_BAR_H}
              br={STEP_BAR_H}
              bg={step.state === 'todo' ? colors.surfaceMuted : colors.primary}
            />
            <Text
              col={step.state === 'todo' ? colors.placeholder : colors.text}
              fos={typeScale.caption.fontSize}
              lh={typeScale.caption.lineHeight}
              fow={step.state === 'current' ? fontWeight.semibold : fontWeight.regular}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          </YStack>
        ))}
      </XStack>
    );
  }

  return (
    /*
      Web `.stepper`: MỘT hàng ngang bốn bước chia đều, đệm dọc 8, KHÔNG khung thẻ. Mỗi bước: chấm
      24 (viền 2), nhãn 14/500 căn giữa, mốc giờ 12 màu phụ; đường nối 2px ở cao 11 giữa hai chấm,
      tô vàng khi bước trước đã xong.
    */
    <XStack py={space.sm} accessibilityLabel={t('stepperLabel')} accessibilityRole="list">
      {steps.map((step, index) => {
        const current = step.state === 'current';
        return (
          <YStack key={step.key} f={1} ai="center" gap={space.sm} minWidth={0}>
            {index > 0 ? (
              <YStack
                pos="absolute"
                top={STEP_LINE_TOP}
                left="-50%"
                right="50%"
                h={2}
                bg={steps[index - 1]?.state === 'done' ? colors.primary : colors.border}
              />
            ) : null}
            <YStack
              w={STEP_DOT}
              h={STEP_DOT}
              br={radius.pill}
              bw={2}
              bc={step.state === 'todo' ? colors.border : colors.primary}
              bg={step.state === 'todo' ? colors.surface : current ? colors.surface : colors.primary}
              ai="center"
              jc="center"
              zIndex={1}
            >
              {/* `.step_current`: nền vàng thụt vào trong một vòng trắng 4px. */}
              {current ? <YStack w={STEP_DOT - 12} h={STEP_DOT - 12} br={radius.pill} bg={colors.primary} /> : null}
              {step.state === 'done' ? (
                <AntIcon icon={CheckOutlined} size={12} color={colors.onPrimary} />
              ) : null}
            </YStack>
            <Text
              col={current ? colors.primaryStrong : colors.text}
              fos={fontSize.label}
              fow={fontWeight.medium}
              ta="center"
            >
              {step.label}
            </Text>
            {step.hint ? (
              <Text col={current ? colors.primaryStrong : colors.textMuted} fos={typeScale.caption.fontSize} lh={typeScale.caption.lineHeight} ta="center">
                {step.hint}
              </Text>
            ) : null}
          </YStack>
        );
      })}
    </XStack>
  );
}

/** Web `.stepDot { width: 24px }` · `.step + .step::before { top: 11px }`. */
const STEP_DOT = 24;
const STEP_LINE_TOP = 11;

/**
 * Banner kết cục - web `Alert type="success|error"` (chỉ tiêu đề, không icon) bo `border-radius-control`:
 * nền + viền cùng sắc, đệm 8/12, chữ 14 màu chữ chính.
 */
function OutcomeAlert({ tone, children }: { tone: 'success' | 'danger'; children: string }) {
  const colors = useColors();
  const success = tone === 'success';
  return (
    <YStack
      px={space.md}
      py={space.sm}
      br={radius.control}
      bw={1}
      bc={success ? colors.successBorder : colors.dangerBorder}
      bg={success ? colors.successSurface : colors.dangerSurface}
      accessibilityRole="alert"
    >
      <Text col={colors.text} fos={fontSize.body}>
        {children}
      </Text>
    </YStack>
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
      <OutcomeAlert tone="success">
        {payable && !isZeroMoney(payable)
          ? t('completedBanner', { amount: fmt.money(payable) })
          : t('completedBannerPlain')}
      </OutcomeAlert>
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
      .join(' - ');
    return (
      <OutcomeAlert tone="danger">
        {stage === 'noShow'
          ? t('noShowBanner')
          : reason
            ? t('cancelledBannerWithReason', { reason })
            : t('cancelledBanner')}
      </OutcomeAlert>
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
          ? t('overdue', { duration: fmt.roughDuration(progress.overdueMinutes) })
          : t('remaining', { duration: fmt.roughDuration(progress.remainingMinutes) })
        : null;

  return (
    <SectionCard title={t('title')}>
      {/* Web `.tripBlock`: đầu dòng 14 (nhãn · giờ đậm), rãnh 6, câu tình trạng 12. */}
      <YStack gap={space.sm} minWidth={0}>
        <XStack jc="space-between" gap={space.md}>
          <Text col={colors.text} fos={fontSize.body}>
            {t('pickup')}
          </Text>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
            {fmt.rentalPoint(toAppTz(booking.pickupAt))}
          </Text>
        </XStack>
        <YStack h={TRIP_TRACK} br={radius.pill} bg={colors.surfaceMuted} ov="hidden">
          <YStack
            h={TRIP_TRACK}
            br={radius.pill}
            w={`${Math.max(percent, 1)}%`}
            bg={overdue ? colors.danger : colors.success}
          />
        </YStack>
        {pickupLine ? (
          <Text col={colors.text} fos={fontSize.body}>
            {pickupLine}
          </Text>
        ) : null}
      </YStack>
      <YStack gap={space.sm} minWidth={0} mt={space.lg}>
        <XStack jc="space-between" gap={space.md}>
          <Text col={colors.text} fos={fontSize.body}>
            {t('return')}
          </Text>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
            {fmt.rentalPoint(toAppTz(booking.returnAt))}
          </Text>
        </XStack>
        <Text
          col={overdue ? colors.danger : returnLine ? colors.text : colors.placeholder}
          fos={fontSize.body}
          fontStyle={returnLine ? 'normal' : 'italic'}
        >
          {returnLine ?? t('notRecorded')}
        </Text>
      </YStack>
      {notes.length > 0 ? (
        <Text col={colors.textMuted} fos={fontSize.label} mt={GAP_12}>
          {t('note', { note: notes.join(' · ') })}
        </Text>
      ) : null}
    </SectionCard>
  );
}

/** Web `.tripTrack { height: 6px }` · `.tripNote { margin-top: 12px }`. */
const TRIP_TRACK = 6;
const GAP_12 = 12;

const STAGE_COLOR: Record<Stage, StatusColor> = {
  awaitingPickup: STATUS_COLOR.WARNING,
  renting: STATUS_COLOR.INFO,
  completed: STATUS_COLOR.SUCCESS,
  cancelled: STATUS_COLOR.DANGER,
  noShow: STATUS_COLOR.DANGER,
};

/**
 * Chip chặng ở đầu trang - web `BookingStageChip`: cùng nhãn với thanh bước, `ToneDotBadge`. Đơn huỷ
 * nói AI huỷ ("Khách hàng đã huỷ" / "Bạn đã huỷ"); phía huỷ do SERVER suy (ADR 0045 điều 2).
 */
export function BookingStageChip({
  status,
  cancellationParty,
}: {
  status: string;
  cancellationParty?: string | null;
}) {
  const t = useTranslations('Bookings.detailPage.stage');
  const domainLabel = useDomainLabel();
  const stage = bookingStageOf(status);
  const label =
    stage === 'cancelled' && cancellationParty === CANCELLATION_PARTY.CUSTOMER
      ? domainLabel('bookingHistoryOutcome', BOOKING_HISTORY_OUTCOME.CANCELLED_BY_CUSTOMER)
      : stage === 'cancelled' && cancellationParty === CANCELLATION_PARTY.HOST
        ? domainLabel('bookingHistoryOutcome', BOOKING_HISTORY_OUTCOME.CANCELLED_BY_HOST)
        : t(stage);
  // Figma "_Badge": viên bo tròn có viền, không chấm (16/11/2026).
  return <Pill label={label} tone={pillToneOfStatusColor(STAGE_COLOR[stage])} />;
}

/** Figma "Progress": vạch 4 cao, các đoạn cách 10. */
const STEP_BAR_H = 4;
const STEP_BAR_GAP = 10;
