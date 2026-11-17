import { memo, useCallback } from 'react';
import { LineIcon } from '@/components/icons/LineIcon';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_HANDOVER_PLACE,
  BOOKING_HANDOVER_PLACE_VALUES,
  BOOKING_LIST_PRESET,
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  canTransitionBooking,
  HANDOVER_STATUS,
  isCancellationParty,
  isNoShowGracePassed,
  PERMISSION,
  SERVICE_TYPE,
  type BookingHandoverPlace,
  type BookingListPreset,
  type BookingStatus,
} from '@xeprime/types';
import {
  DATE_TIME_SEPARATOR,
  isLateReturn,
  isPositiveMoney,
  PICKUP_URGENCY,
  pickupUrgency,
  rentalProgress,
  shortAddress,
  toAppTz,
} from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { pillToneOfStatusColor } from '@/components/ui/Pill';
import { useDomainLabel } from '@/i18n/domain';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useStartBookingRequestConversation } from '@/features/booking-requests/hooks/use-booking-requests';
import { useListingSpecSummary } from '@/features/booking-requests/hooks/use-listing-spec-summary';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, space, typeScale } from '@/theme/tokens';
import type { BookingListItem } from '../api';
import {
  bareLabel,
  RentalCard,
  RentalContactButtons,
  RentalCustomerIdentity,
  RentalFact,
} from './rental-card/RentalCard';

/** Còn ít hơn chừng này tới giờ trả thì câu tình trạng đổi sang sắc cảnh báo (web `RETURN_SOON_MINUTES`). */
const RETURN_SOON_MINUTES = 120;

type Tone = 'muted' | 'warning' | 'danger';

/**
 * MỘT đơn thuê trên màn "Đơn thuê xe" gộp — nhóm "Chờ giao xe" và "Đang thuê" (Figma Partner-XePrime
 * "Rental Request - List" `23973:51952`). Bản native của `BookingCard` web: CÙNG khung `RentalCard`
 * với thẻ YÊU CẦU.
 *
 * Khung v2 (Figma "Rental Request - MB"): đầu thẻ mã · trạng thái / dịch vụ · tiền thuê; thân xe ·
 * khách · hàng cột tiền · ô lịch; thanh tiến độ (Đang thuê); chân thẻ là câu tình trạng của NHÓM
 * (giao xe hôm nay · quá giờ giao · còn bao lâu tới giờ trả) và các nút.
 *
 * "Xử lý giao xe" mở chi tiết đơn (Chuẩn bị bàn giao); "Nhận xe" mở thẳng màn "Xác nhận đã nhận lại
 * xe"; "Khách không đến" mở thẳng tấm ghi nhận (sổ cái §3.2b dòng 15 · §3.2c dòng 11).
 */
function BookingCardImpl({
  booking,
  onPress,
  onExtend,
  onReceive,
  onNoShow,
  awaitingPickup = false,
  group,
}: {
  booking: BookingListItem;
  onPress: (booking: BookingListItem) => void;
  /** "Gia hạn" (ADR 0077) — chỉ truyền khi có `bookings.update`. */
  onExtend?: (booking: BookingListItem) => void;
  /** "Nhận xe" ở thẻ Đang thuê — chỉ truyền khi có `handovers.confirm`. */
  onReceive?: (booking: BookingListItem) => void;
  /** "Khách không đến" ở thẻ Chờ giao xe — chỉ truyền khi có `bookings.update`. */
  onNoShow?: (booking: BookingListItem) => void;
  /** Cũ: thẻ thuộc nhóm "Chờ giao xe". Nơi gọi mới truyền `group`. */
  awaitingPickup?: boolean;
  /** Nhóm của màn gộp — quyết câu tình trạng và nút. Vắng thì suy từ trạng thái đơn. */
  group?: BookingListPreset;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.board');
  const tKanban = useTranslations('Bookings.board.kanban');
  const tBookings = useTranslations('Bookings');
  const tExtension = useTranslations('Bookings.extension');
  const tRequests = useTranslations('BookingRequests');
  const tActions = useTranslations('BookingRequests.actions');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const startConversation = useStartBookingRequestConversation();
  const specs = useListingSpecSummary(booking);
  const domainLabel = useDomainLabel();

  const status = booking.status as BookingStatus;
  const stage: BookingListPreset =
    group ??
    (awaitingPickup
      ? BOOKING_LIST_PRESET.AWAITING_PICKUP
      : status === BOOKING_STATUS.ACTIVE
        ? BOOKING_LIST_PRESET.RENTING
        : status === BOOKING_STATUS.COMPLETED
          ? BOOKING_LIST_PRESET.COMPLETED
          : status === BOOKING_STATUS.RESERVED || status === BOOKING_STATUS.CONFIRMED
            ? BOOKING_LIST_PRESET.AWAITING_PICKUP
            : BOOKING_LIST_PRESET.CANCELLED);
  const statusLine = statusLineOf(booking, stage, t, fmt);
  const progress = stage === BOOKING_LIST_PRESET.RENTING ? rentingProgress(booking) : null;
  const canViewVehicle = permissions.has(PERMISSION.VEHICLE_VIEW);
  const canHandle = onReceive !== undefined;

  const open = useCallback(() => onPress(booking), [onPress, booking]);
  const extend = useCallback(() => onExtend?.(booking), [onExtend, booking]);
  const receive = useCallback(() => onReceive?.(booking), [onReceive, booking]);
  const noShow = useCallback(() => onNoShow?.(booking), [onNoShow, booking]);

  const extendable =
    onExtend !== undefined &&
    stage === BOOKING_LIST_PRESET.RENTING &&
    booking.serviceType === SERVICE_TYPE.LONG_TERM &&
    // Chỉ đơn đặt qua chợ: đơn tự lập không có tài khoản khách nhận QR / tiền hoàn (ADR 0077).
    booking.bookingRequestId != null;
  /* Cùng bộ điều kiện server kiểm: còn cạnh `→ no_show`, qua ân hạn, chưa có biên bản giao xe. */
  const noShowable =
    onNoShow !== undefined &&
    stage === BOOKING_LIST_PRESET.AWAITING_PICKUP &&
    canTransitionBooking(status, BOOKING_STATUS.NO_SHOW) &&
    isNoShowGracePassed(booking.pickupAt) &&
    booking.pickupHandoverStatus !== HANDOVER_STATUS.CONFIRMED;

  const pickup = toAppTz(booking.pickupAt);
  const dropoff = toAppTz(booking.returnAt);
  const place = (BOOKING_HANDOVER_PLACE_VALUES as readonly string[]).includes(
    booking.handoverPlaceKind ?? '',
  )
    ? (booking.handoverPlaceKind as BookingHandoverPlace)
    : null;
  const durationLabel =
    booking.serviceType === SERVICE_TYPE.LONG_TERM && booking.longTermPackageMonths
      ? fmt.packageLabel(booking.longTermPackageMonths)
      : fmt.rentalDuration(pickup, dropoff);

  /* Nhắn tin = hội thoại của yêu cầu gốc, kèm thẻ chuyến (web `openConversation`). */
  const canMessage =
    booking.bookingRequestId != null && permissions.has(PERMISSION.BOOKING_REQUEST_VIEW);
  const message = () => {
    const requestId = booking.bookingRequestId;
    if (!requestId) return;
    if (!booking.canMessageOnPlatform) {
      toast.showInfo(tActions('messageUnavailable'));
      return;
    }
    startConversation.mutate(requestId, {
      onSuccess: (conversation) =>
        navigateOnce(ROUTES.manage.chatThread(conversation.id, requestId)),
      onError: (err) => toast.showError(errorMessage(err)),
    });
  };

  const toneColor: Record<Tone, string> = {
    muted: colors.textMuted,
    warning: colors.warning,
    danger: colors.danger,
  };

  /* Câu tình trạng của nhóm ở chân thẻ — Figma "Confirmation Status": icon đồng hồ 16 · chữ 14/20. */
  const footerStatus = (
    <XStack ai="flex-start" gap={space.xs}>
      <YStack pt={STATUS_ICON_NUDGE}>
        <LineIcon name="time-circle" size={iconSize.sm} color={toneColor[statusLine.tone]} />
      </YStack>
      {/* `flexShrink` chứ không `f={1}`: cỡ gốc = cả câu, để câu dài tự sang dòng riêng ở chân thẻ. */}
      <Text
        flexShrink={1}
        col={toneColor[statusLine.tone]}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.medium}
      >
        {statusLine.text}
      </Text>
    </XStack>
  );

  const actions =
    stage === BOOKING_LIST_PRESET.AWAITING_PICKUP ? (
      <>
        {noShowable ? (
          <Button label={t('noShowAction')} variant="neutral" size="compact" block={false} onPress={noShow} />
        ) : null}
        {canHandle ? (
          <Button label={t('handlePickup')} variant="gradient" size="compact" block={false} onPress={open} />
        ) : (
          <Button label={t('viewDetailShort')} variant="neutral" size="compact" block={false} onPress={open} />
        )}
      </>
    ) : stage === BOOKING_LIST_PRESET.RENTING ? (
      <>
        <Button label={t('viewDetailShort')} variant="neutral" size="compact" block={false} onPress={open} />
        {/* Web giữ CẢ "Gia hạn" lẫn "Nhận xe" trên thẻ dài hạn (sổ cái §3.2 dòng 12). */}
        {extendable ? (
          <Button
            label={tExtension('action')}
            icon="sync-outline"
            variant="primarySubtle"
            size="compact"
            block={false}
            onPress={extend}
          />
        ) : null}
        {canHandle ? (
          <Button label={t('receiveBack')} variant="success" size="compact" block={false} onPress={receive} />
        ) : null}
      </>
    ) : null;

  const plateLine = booking.vehiclePlate ?? null;
  /*
   * Thẻ gọn góc nhìn CHỦ XE - web `bookingBoardMoney` (PR #292, chốt 10/11/2026). Số vàng ở đầu là
   * TỔNG KHÁCH TRẢ. Đơn qua chợ: Giữ chỗ (đã trả) · Thu khi giao xe · Cộng ví (`D − T`); đơn lập tay:
   * Đã thu · Còn phải thu. Viên ở đầu thẻ là trạng thái GIỮ CHỖ (nhóm đã nói trạng thái đơn).
   */
  const customerTotal = booking.customerTotalAmount ?? booking.totalAmount;
  const marketplace = booking.payAtPickupAmount != null;
  const held = marketplace && booking.holdPaidAmount != null;
  const moneyColumns = marketplace
    ? [
        ...(held
          ? [{ key: 'hold', label: tKanban('money.hold'), value: fmt.money(booking.holdPaidAmount as string) }]
          : []),
        {
          key: 'pickup',
          label: tKanban('money.payAtPickup'),
          value: fmt.money(booking.payAtPickupAmount as string),
        },
        ...(held && booking.ownerPayableAmount != null
          ? [
              {
                key: 'walletCredit',
                label: tKanban('money.walletCredit'),
                value: fmt.money(booking.ownerPayableAmount),
              },
            ]
          : []),
      ]
    : [
        { key: 'collected', label: tKanban('money.collected'), value: fmt.money(booking.collectedAmount) },
        {
          key: 'debt',
          label: tKanban('money.debt'),
          value: fmt.money(booking.debtAmount),
          emphasis: isPositiveMoney(booking.debtAmount),
        },
      ];
  /* Web `bookingBoardPlace`: nhãn theo hình thức, địa chỉ gọn (chi nhánh rơi về hồ sơ gian hàng). */
  const placeLabel =
    place === BOOKING_HANDOVER_PLACE.DELIVERY
      ? tKanban('schedule.placeDelivery')
      : place === BOOKING_HANDOVER_PLACE.DRIVER_PICKUP
        ? tKanban('schedule.placeDriverPickup')
        : tKanban('schedule.placeBranch');
  const placeAddress = shortAddress(
    place === BOOKING_HANDOVER_PLACE.BRANCH
      ? (booking.pickupPointAddress ?? booking.handoverPlace)
      : booking.handoverPlace,
  );

  return (
    <RentalCard
      accessibilityLabel={t('openDetail', { code: booking.code })}
      onOpenDetail={open}
      code={`#${booking.code}`}
      status={held ? { label: tKanban('holdState.paid'), tone: 'success' } : null}
      serviceType={booking.serviceType}
      price={{ value: fmt.money(customerTotal), label: tKanban('money.customerTotal') }}
      vehicle={{
        name: booking.vehicleName,
        imageUrl: booking.vehicleImageUrl,
        specs,
        plateLine,
        ...(canViewVehicle
          ? {
              onOpen: () => navigateOnce(ROUTES.manage.vehicleDetail(booking.vehicleId)),
              schedule: {
                label: tRequests('vehicle.viewSchedule'),
                accessibilityLabel: tRequests('vehicle.viewScheduleFor', {
                  vehicle: booking.vehicleName,
                }),
                onPress: () =>
                  navigateOnce(
                    vehicleSchedulePath(
                      { name: booking.vehicleName, plateNumber: booking.vehiclePlate },
                      { back: true },
                    ),
                  ),
              },
            }
          : {}),
        noImageLabel: tRequests('vehicle.noImage'),
      }}
      customer={
        <>
          <RentalCustomerIdentity
            name={booking.customerName}
            avatarUrl={booking.customerAvatarUrl}
            phone={booking.customerPhone}
          />
          <RentalContactButtons
            name={booking.customerName}
            phone={booking.customerPhone}
            {...(canMessage ? { onMessage: message } : {})}
            messageUnavailable={!booking.canMessageOnPlatform}
            messageLoading={startConversation.isPending}
            size="md"
          />
        </>
      }
      money={moneyColumns}
      schedule={
        <>
          <RentalFact
            label={tKanban('schedule.period')}
            value={`${keepTogether(fmt.rentalPoint(pickup))} → ${keepTogether(fmt.rentalPoint(dropoff))}`}
          />
          {booking.serviceType === SERVICE_TYPE.LONG_TERM && booking.longTermPackageMonths ? (
            <RentalFact label={tRequests('card.package')} value={durationLabel} />
          ) : null}
          {place ? (
            <RentalFact label={placeLabel} value={placeAddress ?? tKanban('schedule.placeUnknown')} />
          ) : null}
        </>
      }
      progress={
        progress ? (
          <ProgressBar
            percent={progress.percent}
            tone={progress.tone === 'danger' ? 'exception' : 'active'}
            {...(progress.tone === 'danger' ? {} : { color: colors.infoStrong })}
            size="md"
          />
        ) : null
      }
      footerStatus={footerStatus}
      actions={actions}
    />
  );
}

export const BookingCard = memo(BookingCardImpl);

/** Icon 16 căn giữa dòng chữ đầu 20 của câu tình trạng (câu dài xuống nhiều dòng). */
const STATUS_ICON_NUDGE = 2;

/**
 * Ô "Thanh toán" của thẻ đơn — chép `bookingPaymentRows` web. Đơn qua chợ: tiền thuê · khách trả ·
 * đã giữ chỗ · trả chủ xe khi nhận xe. Đơn tự lập: tiền thuê · đã thu · còn phải thu.
 */
function bookingPaymentRows(
  booking: BookingListItem,
  t: ReturnType<typeof useTranslations<'Bookings.board'>>,
): { key: string; label: string; amount: string; emphasis?: boolean }[] {
  const rows: { key: string; label: string; amount: string; emphasis?: boolean }[] = [
    { key: 'rental', label: t('money.rental'), amount: booking.totalAmount },
  ];
  if (booking.customerTotalAmount && booking.customerTotalAmount !== booking.totalAmount) {
    rows.push({ key: 'customer', label: t('money.customerTotal'), amount: booking.customerTotalAmount });
  }
  if (booking.holdPaidAmount != null) {
    rows.push({ key: 'hold', label: t('money.holdPaid'), amount: booking.holdPaidAmount });
  }
  if (booking.payAtPickupAmount != null) {
    rows.push({ key: 'pickup', label: t('money.payAtPickup'), amount: booking.payAtPickupAmount });
    return rows;
  }
  rows.push({ key: 'collected', label: t('money.collected'), amount: booking.collectedAmount });
  if (isPositiveMoney(booking.debtAmount)) {
    rows.push({ key: 'debt', label: t('money.debt'), amount: booking.debtAmount, emphasis: true });
  }
  return rows;
}

/** Đang thuê: đo từ lúc xe THẬT SỰ rời tay; quá giờ trả thì đỏ. */
function rentingProgress(booking: BookingListItem): { percent: number; tone: 'info' | 'danger' } {
  const { percent, overdueMinutes } = rentalProgress(
    booking.actualPickupAt ?? booking.pickupAt,
    booking.returnAt,
  );
  return { percent, tone: overdueMinutes > 0 ? 'danger' : 'info' };
}

/** Câu tình trạng ở dải đầu — mỗi nhóm trả lời đúng câu hỏi của nhóm đó (web `statusLine`). */
function statusLineOf(
  booking: BookingListItem,
  group: BookingListPreset,
  t: ReturnType<typeof useTranslations<'Bookings.board'>>,
  fmt: ReturnType<typeof useAppFormat>,
): { text: string; tone: Tone } {
  switch (group) {
    case BOOKING_LIST_PRESET.AWAITING_PICKUP: {
      if (Date.now() >= new Date(booking.returnAt).getTime()) {
        return {
          text: t('pickupNeverConfirmed', { date: fmt.rentalPoint(toAppTz(booking.returnAt)) }),
          tone: 'danger',
        };
      }
      const urgency = pickupUrgency(booking.pickupAt);
      const time = fmt.time(booking.pickupAt);
      if (urgency === PICKUP_URGENCY.OVERDUE) return { text: t('pickupOverdue', { time }), tone: 'danger' };
      if (urgency === PICKUP_URGENCY.TODAY) return { text: t('pickupToday', { time }), tone: 'warning' };
      return {
        text: t('pickupUpcoming', {
          date: fmt.dayMonth(booking.pickupAt),
          time,
          sep: DATE_TIME_SEPARATOR,
        }),
        tone: 'muted',
      };
    }
    case BOOKING_LIST_PRESET.RENTING: {
      if (booking.customerReturnedAt && booking.returnAutoCompleteAt) {
        return {
          text: t('customerReturned', {
            time: fmt.time(booking.customerReturnedAt),
            deadline: fmt.rentalPoint(toAppTz(booking.returnAutoCompleteAt)),
          }),
          tone: 'warning',
        };
      }
      const { remainingMinutes, overdueMinutes } = rentalProgress(
        booking.actualPickupAt ?? booking.pickupAt,
        booking.returnAt,
      );
      if (overdueMinutes > 0) {
        return { text: t('overdueReturn', { duration: fmt.roughDuration(overdueMinutes) }), tone: 'danger' };
      }
      return {
        text: t('remaining', { remaining: fmt.roughDuration(remainingMinutes) }),
        tone: remainingMinutes <= RETURN_SOON_MINUTES ? 'warning' : 'muted',
      };
    }
    case BOOKING_LIST_PRESET.COMPLETED:
      return isLateReturn(booking.returnAt, booking.actualReturnAt)
        ? { text: t('returnedLate'), tone: 'warning' }
        : { text: t('returnedOnTime'), tone: 'muted' };
    default: {
      if (booking.status === BOOKING_STATUS.NO_SHOW) return { text: t('noShow'), tone: 'danger' };
      const party = booking.cancellationParty;
      return {
        text: party && isCancellationParty(party) ? t(`cancelledBy.${party}`) : t('cancelled'),
        tone: 'danger',
      };
    }
  }
}

/** Một mốc thời gian không bị bẻ giữa chừng - dòng "Thời gian" chỉ xuống dòng trước "→" (web `RentalBoardPeriod`). */
function keepTogether(text: string): string {
  return text.replace(/ /g, ' ');
}
