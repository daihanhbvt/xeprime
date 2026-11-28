import { memo, type ReactNode } from 'react';
import type { BookingRequestDecisionAction } from '../hooks/use-booking-request-decisions';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_REQUEST_STATUS,
  HOLD_PAYMENT_REMINDER_REMAINING_MINUTES,
  isBookingRequestPastDue,
  BOOKING_REQUEST_STATUS_META,
  PERMISSION,
  SERVICE_TYPE,
  type BookingRequestStatus,
} from '@xeprime/types';
import { isPositiveMoney, shortAddress, subtractMoney, toAppTz } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { useAppFormat } from '@/i18n/use-app-format';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useNow } from '@/hooks/use-now';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import {
  bareLabel,
  RentalCard,
  RentalContactButtons,
  RentalCustomerIdentity,
  RentalFact,
} from '@/features/bookings/components/rental-card/RentalCard';
import { pillToneOfStatusColor } from '@/components/ui/Pill';
import { BOOKING_REQUEST_CLOSED_STATUSES, type BookingRequestItem } from '../api';
import { useCustomerProfileAccess } from '../hooks/use-customer-profile-access';
import { useListingSpecSummary } from '../hooks/use-listing-spec-summary';
import {
  useRemindBookingRequestPayment,
  useStartBookingRequestConversation,
} from '../hooks/use-booking-requests';
import { RespondDeadline } from './RespondDeadline';

/**
 * MỘT YÊU CẦU THUÊ trên màn "Đơn thuê xe" gộp — nhóm "Cần xử lý" và "Chờ khách thanh toán" (Figma
 * Partner-XePrime "Rental Request - List" `23973:51952`, sổ cái §3.2b). Bản native của
 * `BookingRequestCard` web: CÙNG khung `RentalCard` với thẻ ĐƠN.
 *
 * Khung v2 (Figma "Rental Request - MB"): đầu thẻ "Gửi lúc …" (yêu cầu chưa có mã — §3.1 dòng 3)
 * hoặc mã đơn · nhãn trạng thái / viên dịch vụ · tiền. Thân: xe · khách · hàng cột tiền (Khách trả ·
 * Trả khi nhận xe · Giữ chỗ) · ô lịch (Nhận xe · Địa chỉ nhận). Chân thẻ: đồng hồ của chặng (hạn
 * phản hồi / hạn thanh toán) · các nút (Từ chối · Xác nhận — Huỷ chuyến · Nhắc khách).
 *
 * Thẻ là bản TÓM TẮT như Figma (người dùng chốt 20/11/2026): cảnh báo rủi ro khách, SĐT tài
 * khoản/email, lộ trình, địa chỉ giao, ghi chú, lý do, "Xem lịch xe", gói thuê, "Khách quen",
 * "Tạm tính"… chỉ còn ở màn chi tiết yêu cầu.
 *
 * Quyền thiếu thì **ẩn** nút, không disable — một nút xám không tự giải thích được.
 */
function BookingRequestCardImpl({
  request,
  onApprove,
  onReject,
  onCancel,
  onOpenDetail,
  pendingAction = null,
}: {
  request: BookingRequestItem;
  /**
   * Quyết định đang chạy cho chính yêu cầu này (web `pendingAction`): nút đó quay, các nút còn lại
   * khoá - bấm đúp là gửi hai lượt.
   */
  pendingAction?: BookingRequestDecisionAction | null;
  onApprove: (request: BookingRequestItem) => void;
  onReject: (request: BookingRequestItem) => void;
  /** HUỶ một chuyến ĐÃ NHẬN (ADR 0045 điều 1) — chỉ có ở `awaiting_hold`. */
  onCancel: (request: BookingRequestItem) => void;
  /** Màn gọi quyết đích: đã thành đơn thì chi tiết ĐƠN, chưa có thì chi tiết YÊU CẦU. */
  onOpenDetail: (request: BookingRequestItem) => void;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests');
  const tCard = useTranslations('BookingRequests.card');
  const tKanban = useTranslations('Bookings.board.kanban');
  const tApp = useTranslations('Bookings.board.kanban.partnerApp');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  const customerProfileAccess = useCustomerProfileAccess();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const startConversation = useStartBookingRequestConversation();
  const specs = useListingSpecSummary(request, { transmission: false });

  const status = request.status as BookingRequestStatus;
  const meta = BOOKING_REQUEST_STATUS_META[status];
  /* Chỉ `pending_host_approval` còn cần gian hàng quyết định (ADR 0055). */
  const needsDecision = status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;
  /* Hỏi `respondBy` chứ không hỏi `status` — đúng vị từ server dùng (`BOOKING_REQUEST_EXPIRED`). */
  const pastDue = isBookingRequestPastDue(request.respondBy);
  const decidable = needsDecision && !pastDue;
  const awaitingHold = status === BOOKING_REQUEST_STATUS.AWAITING_HOLD;
  const isClosed = (BOOKING_REQUEST_CLOSED_STATUSES as readonly string[]).includes(status);
  const canDecide = permissions.has(PERMISSION.BOOKING_REQUEST_APPROVE);
  const canViewVehicle = permissions.has(PERMISSION.VEHICLE_VIEW);
  /** Tên khách mở hồ sơ trong sổ khách — quyền + tuyến gói (ADR 0056). */
  const customerId = customerProfileAccess ? request.tenantCustomerId : null;

  const openDetail = () => onOpenDetail(request);
  // Viên chỉ mang BIỂN SỐ như thẻ đơn và Figma; mã xe nội bộ xem ở chi tiết (viên dài đẩy thông số
  // thành "7 …" - máy thật 20/11/2026). Xe chưa có biển thì rơi về mã xe.
  const plateLine = request.vehiclePlate || request.vehicleCode || '';

  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;

  /* Nhắn tin: tuyến hoa hồng chưa có ĐƠN thì server không mở hội thoại (`chatOpen`, ADR 0073). */
  const message = () => {
    if (!request.canMessageOnPlatform) {
      toast.showInfo(t('actions.messageUnavailable'));
      return;
    }
    startConversation.mutate(request.id, {
      onSuccess: (conversation) =>
        navigateOnce(ROUTES.manage.chatThread(conversation.id, request.id)),
      onError: (err) => toast.showError(errorMessage(err)),
    });
  };

  const footerStatus = needsDecision ? (
    <RespondDeadline respondBy={request.respondBy} variant="inline" />
  ) : awaitingHold && request.holdExpiresAt ? (
    <RespondDeadline
      respondBy={request.holdExpiresAt}
      urgentMinutes={HOLD_PAYMENT_REMINDER_REMAINING_MINUTES.FINAL}
      label={tCard('awaitingPayment')}
      expiredLabel={tCard('paymentExpired')}
      variant="inline"
    />
  ) : null;

  const cancelButton = (
    <Button
      label={t('actions.cancel')}
      variant="dangerSoft"
      size="compact"
      block={false}
      loading={pendingAction === 'cancel'}
      disabled={pendingAction !== null}
      onPress={() => onCancel(request)}
    />
  );

  const actions =
    decidable && canDecide ? (
      <>
        <Button
          label={t('actions.reject')}
          variant="dangerSoft"
          size="compact"
          block={false}
          loading={pendingAction === 'reject'}
          disabled={pendingAction !== null}
          onPress={() => onReject(request)}
        />
        <Button
          label={tCard('confirmShort')}
          variant="gradient"
          size="compact"
          block={false}
          loading={pendingAction === 'approve'}
          disabled={pendingAction !== null}
          onPress={() => onApprove(request)}
        />
      </>
    ) : awaitingHold && canDecide ? (
      <>
        {/* HUỶ đứng ở chỗ của nút từ chối; NHẮC KHÁCH cạnh nó (design, ADR 0045). */}
        {request.paymentReminderAvailableAt ? (
          <RemindPaymentButton
            request={request}
            busy={pendingAction !== null}
            leading={cancelButton}
          />
        ) : (
          cancelButton
        )}
      </>
    ) : null;

  /*
   * Thẻ gọn góc nhìn CHỦ XE - web `requestBoardMoney` (PR #292, chốt 10/11/2026): số vàng ở đầu là
   * TỔNG KHÁCH TRẢ; hàng tiền: Giữ chỗ (online qua XePrime) · Thu khi giao xe (khách trả tận tay) ·
   * Cộng ví (`D − T` ghi Ví điểm khi chuyến xong). Không thu online thì không có giữ chỗ lẫn cộng ví.
   * Viên ở đầu thẻ là trạng thái GIỮ CHỖ, không phải trạng thái yêu cầu (nhóm đã nói điều đó).
   */
  const paymentRows = requestPaymentRows(request, t);
  const holdRow = paymentRows.find((row) => row.key === 'hold');
  const payAtPickupRow = paymentRows.find((row) => row.key === 'payAtPickup');
  /*
   * App: hàng tiền theo Figma (người dùng chốt 20/11/2026; web giữ `requestBoardMoney`): Khách trả ·
   * Trả khi nhận xe · Giữ chỗ. "Cộng ví" xem ở chi tiết yêu cầu.
   */
  const moneyColumns = [
    ...(request.pricing
      ? [
          {
            key: 'customerTotal',
            label: tKanban('money.customerTotal'),
            value: fmt.money(request.pricing.customerTotalAmount),
          },
        ]
      : []),
    ...(payAtPickupRow
      ? [{ key: 'payAtPickup', label: tApp('payAtPickup'), value: fmt.money(payAtPickupRow.amount) }]
      : []),
    ...(holdRow ? [{ key: 'hold', label: tKanban('money.hold'), value: fmt.money(holdRow.amount) }] : []),
  ];
  // Chờ duyệt mà chưa có giữ chỗ (dài hạn chưa chốt giá) vẫn mang viên "Chờ duyệt" như web (20/11/2026).
  const holdState =
    holdRow?.state === 'awaiting'
      ? 'unpaid'
      : (holdRow?.state ?? (needsDecision ? 'expected' : undefined));
  const holdChip =
    holdState === 'paid' || holdState === 'unpaid' || holdState === 'expected'
      ? {
          // Chưa duyệt: nói "Chờ duyệt" thay "Dự kiến" (người dùng 16/11/2026, cả web).
          label: holdState === 'expected' ? tKanban('holdState.awaitingApproval') : tKanban(`holdState.${holdState}`),
          tone:
            // Đã trả giữ chỗ = xanh lá như web (`HOLD_STATE_COLOR`) - app và web phải giống nhau.
            holdState === 'paid'
              ? ('success' as const)
              : holdState === 'unpaid'
                ? ('danger' as const)
                : ('warning' as const),
        }
      : null;
  /* Nơi đổi tay - web `requestBoardSchedule`: giao tận nơi · điểm đón có tài xế · khách tự tới. */
  const place = request.deliveryRequested
    ? {
        label: tKanban('schedule.placeDelivery'),
        address: request.deliveryLocation?.displayAddress ?? request.deliveryAddress ?? null,
      }
    : request.serviceType === SERVICE_TYPE.WITH_DRIVER &&
        (request.pickupLocation?.displayAddress ?? request.pickupAddress)
      ? {
          label: tKanban('schedule.placeDriverPickup'),
          address: request.pickupLocation?.displayAddress ?? request.pickupAddress ?? null,
        }
      : { label: tKanban('schedule.placeBranch'), address: request.pickupPointAddress ?? null };
  const placeAddress = shortAddress(place.address);

  return (
    <RentalCard
      accessibilityLabel={tCard('openDetail', { vehicle: request.vehicleName })}
      onOpenDetail={openDetail}
      code={
        request.bookingCode
          ? tCard('bookingCode', { code: request.bookingCode })
          : tCard('sentAt', { value: fmt.dateTime(request.createdAt) })
      }
      status={holdChip}
      serviceType={request.serviceType}
      price={
        request.pricing
          ? {
              value: fmt.money(request.pricing.customerTotalAmount),
              label: tKanban('money.customerTotal'),
            }
          : null
      }
      vehicle={{
        name: request.vehicleName,
        imageUrl: request.vehicleImageUrl,
        specs,
        plateLine: plateLine || null,
        ...(canViewVehicle
          ? { onOpen: () => navigateOnce(ROUTES.manage.vehicleDetail(request.vehicleId)) }
          : {}),
        noImageLabel: t('vehicle.noImage'),
      }}
      customer={
        <>
          <RentalCustomerIdentity
            name={request.customerName}
            avatarUrl={request.customerAvatarUrl}
            phone={request.customerPhone}
            onOpen={
              customerId ? () => navigateOnce(ROUTES.manage.customerDetail(customerId)) : undefined
            }
          />
          <RentalContactButtons
            name={request.customerName}
            phone={request.customerPhone}
            {...(request.chatOpen ? { onMessage: message } : {})}
            messageUnavailable={!request.canMessageOnPlatform}
            messageLoading={startConversation.isPending}
            size="md"
          />
        </>
      }
      money={moneyColumns}
      schedule={
        <>
          {/* Dài hạn CHƯA duyệt chưa có lịch (ADR 0011): dòng "Nhận xe" nói NGUYỆN VỌNG ngày nhận. */}
          <RentalFact
            label={tApp('pickup')}
            value={
              pickup && dropoff
                ? `${keepTogether(fmt.rentalPoint(pickup))} → ${keepTogether(fmt.rentalPoint(dropoff))}`
                : fmt.pickupWish(request)
            }
          />
          <RentalFact label={tApp('place')} value={placeAddress ?? tKanban('schedule.placeUnknown')} />
        </>
      }
      footerStatus={footerStatus}
      actions={actions}
    />
  );
}

export const BookingRequestCard = memo(BookingRequestCardImpl);

/**
 * Các dòng tiền của một yêu cầu — chép `requestPaymentRows` web (02/11/2026): chưa ai nhận chuyến
 * thì tiền giữ chỗ là số DỰ KIẾN (ADR 0044 điều 1); đã phát hành mà chưa đủ thì "chờ khách trả";
 * chỉ khi tiền về đủ mới là "Đã giữ chỗ". "Khách trả" không lặp khi bằng "Tiền thuê".
 */
/**
 * Một dòng tiền của yêu cầu. `state` nói khoản đó đang ở đâu (tấm duyệt v2 vẽ nó thành viên trạng
 * thái cạnh nhãn "Giữ chỗ" / nhãn "dự kiến" của dòng còn lại) - thẻ thì đọc thẳng `label`.
 */
export interface RequestPaymentRow {
  key: string;
  label: string;
  amount: string;
  /** Chữ thay cho số tiền ("Miễn phí") - chỉ dòng phí giao xe (web #349). */
  text?: string;
  state?: 'expected' | 'awaiting' | 'unpaid' | 'paid';
}

export function requestPaymentRows(
  request: Pick<BookingRequestItem, 'pricing'> & {
    /** Khách xin giao tận nơi - dòng phí giao xe chỉ có khi đúng vậy (web #349). */
    deliveryRequested?: boolean | undefined;
    approvalPreview?: BookingRequestItem['approvalPreview'] | undefined;
    /** Vắng ở tấm duyệt (yêu cầu còn chờ duyệt - chưa có chặng chờ khách trả). */
    status?: string | undefined;
  },
  t: ReturnType<typeof useTranslations<'BookingRequests'>>,
): RequestPaymentRow[] {
  const pricing = request.pricing;
  if (!pricing) return [];
  const preview = request.approvalPreview ?? null;
  /*
   * Phí giao xe tận nơi `G` (web #349, QC 27/11/2026): chủ xe chốt ở hộp duyệt, nằm trong `rentalTotal`
   * và trong phần trả tay, không vào tiền giữ chỗ (ADR 0064 điều 4). Tách thành dòng riêng để "Tiền
   * thuê" là tiền thuê thật và các dòng cộng lại khớp "Khách trả". Chưa duyệt thì chưa có số - không dòng.
   */
  const deliveryFee = request.deliveryRequested ? (pricing.deliveryFee ?? null) : null;
  const rows: RequestPaymentRow[] = [
    {
      key: 'rental',
      label: t('card.rentalTotal'),
      amount: deliveryFee ? subtractMoney(pricing.rentalTotal, deliveryFee) : pricing.rentalTotal,
    },
  ];
  if (deliveryFee != null) {
    rows.push(
      isPositiveMoney(deliveryFee)
        ? { key: 'delivery', label: t('card.deliveryFee'), amount: deliveryFee }
        : {
            key: 'delivery',
            label: t('card.deliveryFee'),
            amount: '0',
            text: t('card.deliveryFeeFree'),
          },
    );
  }
  if (pricing.customerTotalAmount !== pricing.rentalTotal) {
    rows.push({
      key: 'customer',
      label: t('card.customerTotal'),
      amount: pricing.customerTotalAmount,
    });
  }
  if (pricing.holdAmount != null) {
    const paid = pricing.holdPaidAmount ?? '0';
    const settled = !isPositiveMoney(subtractMoney(pricing.holdAmount, paid));
    rows.push(
      settled
        ? { key: 'hold', label: t('card.holdPaid'), amount: paid, state: 'paid' }
        : {
            key: 'hold',
            state: request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD ? 'awaiting' : 'unpaid',
            // "Chờ khách trả" chỉ khi cửa sổ còn mở; hết hạn/huỷ là khoản KHÔNG về.
            label:
              request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD
                ? t('card.holdAwaiting')
                : t('card.holdUnpaid'),
            amount: pricing.holdAmount,
          },
    );
  } else if (pricing.paidAmount != null) {
    rows.push({
      key: 'hold',
      label: t('card.holdPaid'),
      amount: pricing.paidAmount,
      state: 'paid',
    });
  } else if (preview?.collectsHold && preview.onlineAmount) {
    rows.push({
      key: 'hold',
      label: t('card.holdExpected'),
      amount: preview.onlineAmount,
      state: 'expected',
    });
  }
  if (pricing.remainingAmount != null) {
    rows.push({
      key: 'payAtPickup',
      label: t('card.payAtPickup'),
      amount: pricing.remainingAmount,
    });
  } else if (preview) {
    rows.push({
      key: 'payAtPickup',
      label: t('card.payAtPickupExpected'),
      amount: preview.payAtPickupAmount,
      state: 'expected',
    });
  }
  return rows;
}


/**
 * "Nhắc khách" — nhóm "Chờ khách thanh toán" (web 05/11/2026). Chỉ gửi MỘT thông báo, không gia
 * hạn cửa sổ (ADR 0044). Khoảng lặng do SERVER quyết (`paymentReminderAvailableAt`, 429 khi bấm
 * sớm); ở đây chỉ khoá nút tới mốc đó cho đỡ một vòng lỗi.
 */
function RemindPaymentButton({
  request,
  busy = false,
  leading,
}: {
  request: BookingRequestItem;
  /**
   * Nút đứng TRƯỚC "Nhắc khách" trên CÙNG hàng (nút Huỷ chuyến). Câu "nhắc lại được lúc…" nằm
   * dưới cả hàng - để chung khối với nút thì khối rộng bằng câu và đẩy nút xuống dòng lệch (máy ảo
   * 16/11/2026).
   */
  leading?: ReactNode;
  /** Một quyết định khác đang chạy trên cùng yêu cầu (web `busy`). */
  busy?: boolean;
}) {
  const tCard = useTranslations('BookingRequests.card');
  const tRemind = useTranslations('BookingRequests.remind');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const colors = useColors();
  const remind = useRemindBookingRequestPayment();
  const availableAt = request.paymentReminderAvailableAt ?? null;
  const now = useNow(availableAt != null);
  const cooling = availableAt != null && new Date(availableAt).getTime() > now;

  return (
    <YStack gap={space.xs} ai="flex-end">
      <XStack gap={space.sm} ai="center">
        {leading}
        {/* Web `.ghostButton`: viền `border-strong`, nền trắng, chữ phụ, không icon. */}
        <Button
          label={tCard('remind')}
          variant="neutral"
          size="compact"
          block={false}
          disabled={busy || cooling || remind.isPending}
          loading={remind.isPending}
          onPress={() =>
            remind.mutate(request.id, {
              onSuccess: (res) =>
                toast.showSuccess(
                  tRemind('success', {
                    name: request.customerName,
                    time: fmt.time(res.nextAvailableAt),
                  }),
                ),
              onError: (err) => toast.showError(errorMessage(err)),
            })
          }
        />
      </XStack>
      {cooling && availableAt ? (
        <Text fos={fontSize.label} col={colors.textMuted} ta="right">
          {tCard('remindAvailableAt', { time: fmt.time(availableAt) })}
        </Text>
      ) : null}
    </YStack>
  );
}

/** Một mốc thời gian không bị bẻ giữa chừng - dòng "Thời gian" chỉ xuống dòng trước "→" (web `RentalBoardPeriod`). */
function keepTogether(text: string): string {
  return text.replace(/ /g, ' ');
}
