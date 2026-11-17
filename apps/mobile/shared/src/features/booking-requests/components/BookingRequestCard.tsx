import { memo, useState, type ReactNode } from 'react';
import type { BookingRequestDecisionAction } from '../hooks/use-booking-request-decisions';
import { Ionicons } from '@/components/icons/Ionicons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_REQUEST_STATUS,
  HOLD_PAYMENT_REMINDER_REMAINING_MINUTES,
  isBookingRequestPastDue,
  STATUS_COLOR,
  BOOKING_REQUEST_STATUS_META,
  PERMISSION,
  ROUTE_TYPE,
  SERVICE_TYPE,
  TENANT_CUSTOMER_RISK_LEVEL,
  type BookingRequestStatus,
  type RouteType,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import { isPositiveMoney, shortAddress, subtractMoney, toAppTz, LIST_SEPARATOR } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { DataRow } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useNow } from '@/hooks/use-now';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import {
  bareLabel,
  RentalCard,
  RentalContactButtons,
  RentalCustomerIdentity,
  RentalFact,
  RentalPanelNote,
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
 * hoặc mã đơn · mốc xử lý · nhãn trạng thái / viên dịch vụ · tiền thuê. Thân: xe · khách · hàng cột
 * tiền · ô lịch; thông tin thêm chỉ khi có (rủi ro, SĐT tài khoản/email, lộ trình, địa chỉ giao, ghi
 * chú, lý do). Chân thẻ: đồng hồ của chặng (hạn phản hồi / hạn thanh toán) · các nút (Từ chối ·
 * Xác nhận — Huỷ chuyến · Nhắc khách).
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
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  const customerProfileAccess = useCustomerProfileAccess();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const startConversation = useStartBookingRequestConversation();
  const specs = useListingSpecSummary(request);
  const [noteExpanded, setNoteExpanded] = useState(false);

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
  const plateLine = [request.vehicleCode, request.vehiclePlate]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  const riskLevel = request.customerRiskLevel as TenantCustomerRiskLevel | null;
  const showRisk = riskLevel != null && riskLevel !== TENANT_CUSTOMER_RISK_LEVEL.NORMAL;
  const isLongTerm = request.serviceType === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = request.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const routeType = request.routeType as RouteType | null;
  const longDistance =
    routeType === ROUTE_TYPE.INTER_CITY || routeType === ROUTE_TYPE.INTER_CITY_ONE_WAY;

  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;

  const hasDriverFacts =
    isWithDriver && Boolean(routeType || request.pickupAddress || request.destination);
  const contactLine = [
    request.customerAccountPhone
      ? t('customer.accountPhone', { phone: request.customerAccountPhone })
      : null,
    request.customerEmail,
    !request.tenantCustomerId ? t('customer.noProfile') : null,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);
  const hasExtras = Boolean(
    hasDriverFacts ||
    request.deliveryRequested ||
    request.note ||
    request.rejectReason ||
    showRisk ||
    contactLine,
  );

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
  const walletCredit = holdRow
    ? (request.pricing?.ownerPayableAmount ??
      request.approvalPreview?.ownerPayout.ownerPayableAmount ??
      null)
    : null;
  const moneyColumns = [
    ...(holdRow ? [{ key: 'hold', label: tKanban('money.hold'), value: fmt.money(holdRow.amount) }] : []),
    ...(payAtPickupRow
      ? [
          {
            key: 'payAtPickup',
            label: tKanban('money.payAtPickup'),
            value: fmt.money(payAtPickupRow.amount),
          },
        ]
      : []),
    ...(walletCredit != null
      ? [{ key: 'walletCredit', label: tKanban('money.walletCredit'), value: fmt.money(walletCredit) }]
      : []),
  ];
  const holdState = holdRow?.state === 'awaiting' ? 'unpaid' : holdRow?.state;
  const holdChip =
    holdState === 'paid' || holdState === 'unpaid' || holdState === 'expected'
      ? {
          // Chưa duyệt: nói "Chờ duyệt" thay "Dự kiến" (người dùng 16/11/2026, cả web).
          label: holdState === 'expected' ? tKanban('holdState.awaitingApproval') : tKanban(`holdState.${holdState}`),
          tone:
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
      notice={needsDecision && pastDue ? t('deadline.pastDueHint') : null}
      vehicle={{
        name: request.vehicleName,
        imageUrl: request.vehicleImageUrl,
        specs,
        plateLine: plateLine || null,
        ...(canViewVehicle
          ? {
              onOpen: () => navigateOnce(ROUTES.manage.vehicleDetail(request.vehicleId)),
              schedule: {
                label: t('vehicle.viewSchedule'),
                accessibilityLabel: t('vehicle.viewScheduleFor', { vehicle: request.vehicleName }),
                onPress: () =>
                  navigateOnce(
                    vehicleSchedulePath(
                      { name: request.vehicleName, plateNumber: request.vehiclePlate },
                      { back: true },
                    ),
                  ),
              },
            }
          : {}),
        noImageLabel: t('vehicle.noImage'),
      }}
      customer={
        <>
          <RentalCustomerIdentity
            name={request.customerName}
            avatarUrl={request.customerAvatarUrl}
            phone={request.customerPhone}
            badge={request.customerIsRegular ? t('detail.regular') : undefined}
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
      moneyNote={request.pricing?.isEstimate ? tCard('estimate') : null}
      schedule={
        <>
          {pickup && dropoff ? (
            <>
              <RentalFact
                label={tKanban('schedule.period')}
                value={`${keepTogether(fmt.rentalPoint(pickup))} → ${keepTogether(fmt.rentalPoint(dropoff))}`}
              />
              {isLongTerm && request.longTermPackageMonths ? (
                <RentalFact
                  label={tCard('package')}
                  value={fmt.packageLabel(request.longTermPackageMonths)}
                />
              ) : null}
            </>
          ) : (
            // Dài hạn CHƯA duyệt không có lịch (ADR 0011) — nói GÓI và NGUYỆN VỌNG.
            <>
              <RentalFact
                label={tCard('package')}
                value={
                  request.longTermPackageMonths
                    ? fmt.packageLabel(request.longTermPackageMonths)
                    : t('schedule.packageMissing')
                }
              />
              <RentalFact label={tCard('pickupWish')} value={fmt.pickupWish(request)} />
            </>
          )}
          {/* Nhãn tự nói hình thức (web bỏ dòng "Hình thức nhận xe" 10/11/2026). */}
          <RentalFact label={place.label} value={placeAddress ?? tKanban('schedule.placeUnknown')} />
          {isLongTerm && !(pickup && dropoff) ? (
            <RentalPanelNote>{t('schedule.pickupWishHint')}</RentalPanelNote>
          ) : null}
        </>
      }
      footerStatus={footerStatus}
      actions={actions}
      extras={
        hasExtras ? (
          <>
            {showRisk ? (
              <XStack ai="flex-start" gap={space.xs}>
                <Ionicons name="alert-circle-outline" size={iconSize.sm} color={colors.danger} />
                <Text
                  f={1}
                  col={colors.danger}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                >
                  {t('customer.riskWarning', {
                    level: domainLabel('tenantCustomerRiskLevel', riskLevel),
                  })}
                </Text>
              </XStack>
            ) : null}

            {contactLine ? (
              <Text
                col={colors.textMuted}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
              >
                {contactLine}
              </Text>
            ) : null}

            {hasDriverFacts ? (
              <YStack gap={space.xs}>
                {routeType ? (
                  <XStack ai="center" gap={space.xs} flexWrap="wrap">
                    <Text col={colors.textMuted} fos={typeScale.body.fontSize}>
                      {t('schedule.route')}
                    </Text>
                    <StatusBadge
                      label={domainLabel('routeType', routeType)}
                      color={longDistance ? STATUS_COLOR.WARNING : STATUS_COLOR.NEUTRAL}
                      size="sm"
                    />
                  </XStack>
                ) : null}
                {request.pickupAddress ? (
                  <DataRow
                    label={t('schedule.pickupAddress')}
                    value={request.pickupAddress}
                    block
                  />
                ) : null}
                {request.destination ? (
                  <DataRow label={t('schedule.destination')} value={request.destination} block />
                ) : null}
              </YStack>
            ) : null}

            {request.deliveryRequested ? (
              <YStack gap={space.xs}>
                {request.deliveryAddress ? (
                  <DataRow
                    label={t('schedule.deliveryAddress')}
                    value={request.deliveryAddress}
                    block
                  />
                ) : null}
                {/* KHÔNG hứa giao nhận miễn phí — phí chốt sau khi hai bên thoả thuận. */}
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('schedule.deliveryFeeHint')}
                </Text>
              </YStack>
            ) : null}

            {request.note ? (
              <NotePanel
                icon="chatbox-ellipses-outline"
                title={t('note.label')}
                tone="muted"
                expanded={noteExpanded}
                toggleLabel={noteExpanded ? t('note.collapse') : t('note.expand')}
                onToggle={() => setNoteExpanded((open) => !open)}
              >
                {request.note}
              </NotePanel>
            ) : null}

            {request.rejectReason ? (
              <NotePanel
                icon="close-circle-outline"
                title={t('trace.rejectReason')}
                tone="danger"
                expanded
              >
                {request.rejectReason}
              </NotePanel>
            ) : null}
          </>
        ) : undefined
      }
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
  state?: 'expected' | 'awaiting' | 'unpaid' | 'paid';
}

export function requestPaymentRows(
  request: Pick<BookingRequestItem, 'pricing'> & {
    approvalPreview?: BookingRequestItem['approvalPreview'] | undefined;
    /** Vắng ở tấm duyệt (yêu cầu còn chờ duyệt - chưa có chặng chờ khách trả). */
    status?: string | undefined;
  },
  t: ReturnType<typeof useTranslations<'BookingRequests'>>,
): RequestPaymentRow[] {
  const pricing = request.pricing;
  if (!pricing) return [];
  const preview = request.approvalPreview ?? null;
  const rows: RequestPaymentRow[] = [
    { key: 'rental', label: t('card.rentalTotal'), amount: pricing.rentalTotal },
  ];
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
 * Một khối chữ TỰ DO của người dùng: ghi chú của khách, lý do gian hàng từ chối.
 *
 * Có NỀN chứ không phải chữ trần dưới một nhãn viết hoa: đây là chữ do NGƯỜI viết xen giữa dữ
 * liệu có cấu trúc, và cái nền nói ra ranh giới đó mà không tốn thêm dòng nào. Màu mang NGHĨA —
 * đỏ nhạt cho lý do từ chối.
 */
function NotePanel({
  icon,
  title,
  tone,
  expanded,
  toggleLabel,
  onToggle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  tone: 'muted' | 'danger';
  /** `false` = cắt ở 2 dòng để các thẻ trong danh sách cao đều nhau. */
  expanded: boolean;
  /** Nhãn nút "Xem đầy đủ"/"Thu gọn" — không truyền thì không có nút. */
  toggleLabel?: string;
  onToggle?: () => void;
  children: string;
}) {
  const colors = useColors();
  const danger = tone === 'danger';

  return (
    <XStack
      ai="flex-start"
      gap={space.xs}
      p={space.sm}
      br={radius.md}
      bg={danger ? colors.dangerSurface : colors.surfaceMuted}
    >
      <Ionicons name={icon} size={iconSize.sm} color={danger ? colors.danger : colors.textMuted} />
      <YStack f={1} gap={2}>
        <Text
          col={danger ? colors.danger : colors.textMuted}
          fos={fontSize.label}
          fow={fontWeight.semibold}
        >
          {title}
        </Text>
        <Text col={colors.text} fos={fontSize.bodySm} {...(expanded ? {} : { numberOfLines: 2 })}>
          {children}
        </Text>
        {toggleLabel && onToggle ? (
          <XStack>
            <Text
              col={colors.accentText}
              fos={fontSize.label}
              fow={fontWeight.semibold}
              accessibilityRole="button"
              onPress={onToggle}
              suppressHighlighting
            >
              {toggleLabel}
            </Text>
          </XStack>
        ) : null}
      </YStack>
    </XStack>
  );
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
