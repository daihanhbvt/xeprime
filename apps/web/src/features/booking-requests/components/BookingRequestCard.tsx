'use client';

import { ExclamationCircleOutlined } from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_META,
  HOLD_PAYMENT_REMINDER_REMAINING_MINUTES,
  isBookingRequestPastDue,
  ROUTE_TYPE,
  SERVICE_TYPE,
  STATUS_COLOR,
  TENANT_CUSTOMER_RISK_LEVEL,
  type BookingRequestStatus,
  type RouteType,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import { shortAddress, isPositiveMoney, LIST_SEPARATOR, subtractMoney } from '@xeprime/domain';
import { ServiceTypeChip } from '@/components/data-display/ServiceTypeChip';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { customerPath, vehiclePath } from '@/constants/routes';
import { useBranchCrumb } from '@/features/branches/hooks/use-branch-return';
import {
  RentalCard,
  RentalCardDetailButton,
  RentalCardStamp,
  RentalFact,
  RentalFacts,
  RentalPanelNote,
  type RentalCardLayout,
} from '@/features/bookings/components/rental-card/RentalCard';
import {
  RentalBoardAddress,
  RentalBoardCard,
  RentalBoardHintList,
  RentalBoardPeriod,
  type RentalBoardFact,
  type RentalBoardHold,
  type RentalBoardMoney,
} from '@/features/bookings/components/rental-card/RentalBoardCard';
import { InfoHint } from '@/components/data-display/InfoHint';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { telHref } from '@/lib/contact';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { openOverlayOnPlainClick } from '@/lib/modal-link';
import { toAppTz } from '@/lib/datetime';
import { useListingSpecSummary } from '../hooks/use-listing-spec-summary';
import { BOOKING_REQUEST_CLOSED_STATUSES } from '../constants';
import { CountdownClock } from './CountdownClock';
import { CustomerContactButtons } from './CustomerContactButtons';
import { CustomerIdentity } from './CustomerIdentity';
import { RespondDeadline } from './RespondDeadline';
import type { BookingRequestItem } from '../types';
import styles from './BookingRequestCard.module.css';

/** Thao tác đang chạy trên ĐÚNG yêu cầu này — chặn bấm chồng lên nhau. */
export type BookingRequestAction = 'approve' | 'reject' | 'cancel' | 'message' | 'remind';

interface Props {
  request: BookingRequestItem;
  /** `booking_requests.approve` — thiếu thì KHÔNG render nút duyệt/từ chối/huỷ/nhắc (không disable giả). */
  canApprove: boolean;
  canViewVehicle: boolean;
  canViewCustomer: boolean;
  /** Giữ cho nơi gọi cũ — màn cha quyết mở chi tiết đơn hay chi tiết yêu cầu theo quyền này. */
  canViewBooking: boolean;
  /** Thao tác đang chạy trên yêu cầu này; `null` khi rảnh. */
  pendingAction: BookingRequestAction | null;
  onApprove: (request: BookingRequestItem) => void;
  onReject: (request: BookingRequestItem) => void;
  /**
   * HUỶ một chuyến ĐÃ NHẬN (ADR 0045 điều 1) — chỉ có ở `awaiting_hold`. Khác `onReject` về bản
   * chất: huỷ là rút lại một lời đã hứa và phải nhả lịch + hoàn phần khách đã chuyển.
   */
  onCancel: (request: BookingRequestItem) => void;
  /**
   * NHẮC khách chuyển tiền giữ chỗ (05/11/2026) — chỉ ở `awaiting_hold`. Vắng ⇒ không có nút
   * (phiên hỗ trợ không gửi tin thay gian hàng, ADR 0050).
   */
  onRemind?: (request: BookingRequestItem) => void;
  onMessage: (request: BookingRequestItem) => void;
  /**
   * Mở CHI TIẾT — yêu cầu đã thành đơn mở chi tiết ĐƠN, chưa có đơn mở chi tiết YÊU CẦU; nơi gọi
   * quyết, thẻ chỉ báo "người dùng muốn xem".
   */
  onOpenDetail: (request: BookingRequestItem) => void;
  onOpenVehicle: (request: BookingRequestItem) => void;
  onOpenCustomer: (request: BookingRequestItem) => void;
  /** Đường quay lại đúng chỗ đang đứng, gắn vào link "Xem lịch xe". */
  backHref: string;
  /** `board` = thẻ trong cột Kanban (đồng hồ gọn + nút ở chân thẻ). */
  layout?: RentalCardLayout;
  /** Tay nắm kéo thả — chỉ khi thẻ kéo được sang bước kế (bảng Kanban quyết). */
  dragHandle?: ReactNode;
}

/**
 * MỘT yêu cầu thuê trên màn "Đơn thuê xe" gộp — nhóm "Cần xử lý" và "Chờ khách thanh toán" (Figma
 * Partner-XePrime "Rental Request - List" `23973:51952`, 05/11/2026). CÙNG khung `RentalCard` với
 * thẻ ĐƠN của hai nhóm sau, để một chuyến đi qua bốn nhóm vẫn là một tấm thẻ.
 *
 * Dải đầu: chưa có đơn thì KHÔNG có mã `#DH…` (mã chỉ sinh khi tiền về đủ — sổ cái §3.1 dòng 3), nên
 * chỗ đó là mốc "Gửi lúc"; phải là đồng hồ của chặng (hạn phản hồi / hạn thanh toán) và quyết định.
 * Thân: xe · khách · ô lịch · ô tiền; dải thông tin thêm chỉ khi yêu cầu có (ghi chú, giao tận nơi,
 * lộ trình, rủi ro, lý do từ chối) — chốt 02/11/2026, sổ cái `09_PARTNER_REDESIGN.md` §3.1.
 *
 * Component không tự quyết QUYỀN và không tự gọi API: nhận cờ quyền và callback.
 */
export function BookingRequestCard({
  request,
  canApprove,
  canViewVehicle,
  canViewCustomer,
  pendingAction,
  onApprove,
  onReject,
  onCancel,
  onRemind,
  onMessage,
  onOpenDetail,
  onOpenVehicle,
  onOpenCustomer,
  backHref,
  layout = 'list',
  dragHandle,
}: Props) {
  const branchCrumb = useBranchCrumb();
  const compactClock = layout === 'board';
  const tKanban = useTranslations('Bookings.board.kanban');
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [noteExpanded, setNoteExpanded] = useState(false);
  const specs = useListingSpecSummary(request);

  /*
   * Quá hạn phản hồi thì KHÔNG còn quyết định nào — server từ chối cả duyệt lẫn từ chối. Hỏi
   * `respondBy` chứ không hỏi `status`: worker ghi `expired` theo nhịp, nên có một cửa sổ bản ghi
   * còn `pending_host_approval` trong khi giờ đã hết. Cùng vị từ với server.
   */
  const pastDue = isBookingRequestPastDue(request.respondBy);
  const needsDecision = request.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;
  const decidable = needsDecision && !pastDue;
  const awaitingHold = request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD;
  const isClosed = (BOOKING_REQUEST_CLOSED_STATUSES as readonly string[]).includes(request.status);
  // Một thao tác đang chạy khoá MỌI quyết định trên yêu cầu này — chúng loại trừ nhau.
  const busy = pendingAction !== null;

  const titleId = `booking-request-${request.id}-title`;
  const plateLine = [request.vehicleCode, request.vehiclePlate]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  const riskLevel = request.customerRiskLevel as TenantCustomerRiskLevel | null;
  const showRisk = riskLevel != null && riskLevel !== TENANT_CUSTOMER_RISK_LEVEL.NORMAL;

  const customerLinkable = canViewCustomer && Boolean(request.tenantCustomerId);
  const phoneLink = telHref(request.customerPhone);
  // Phiên hỗ trợ không nhắn tin thay gian hàng (ADR 0050 §10); tuyến hoa hồng chưa có đơn thì
  // server không mở hội thoại (`chatOpen`, ADR 0073) — ẩn hẳn.
  const chatHidden = useSupportHides(SUPPORT_HIDDEN_AREA.CHAT);
  const canOpenChat = !chatHidden && request.chatOpen;

  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;
  const hasSchedule = pickup !== null && dropoff !== null;
  const isLongTerm = request.serviceType === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = request.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const routeType = request.routeType as RouteType | null;
  const routeIsLongDistance =
    routeType === ROUTE_TYPE.INTER_CITY || routeType === ROUTE_TYPE.INTER_CITY_ONE_WAY;

  const hasExtras = Boolean(
    (isWithDriver && (routeType || request.pickupAddress || request.destination)) ||
    request.deliveryRequested ||
    request.note ||
    request.rejectReason ||
    showRisk ||
    request.customerAccountPhone ||
    request.customerEmail ||
    !request.tenantCustomerId,
  );

  const openDetail = () => onOpenDetail(request);
  const detailAria = t('card.openDetail', { vehicle: request.vehicleName });

  const meta = (
    <>
      <RentalCardDetailButton onClick={openDetail} ariaLabel={detailAria}>
        {request.bookingCode
          ? t('card.bookingCode', { code: request.bookingCode })
          : t('card.sentAt', { value: fmt.dateTime(request.createdAt) })}
      </RentalCardDetailButton>
      <ServiceTypeChip value={request.serviceType} />
      {request.decidedAt ? (
        <RentalCardStamp>
          {t('card.decidedAt', { value: fmt.dateTime(request.decidedAt) })}
        </RentalCardStamp>
      ) : null}
    </>
  );

  const statusNode = needsDecision ? (
    <RespondDeadline respondBy={request.respondBy} variant="header" compact={compactClock} />
  ) : awaitingHold && request.holdExpiresAt ? (
    <CountdownClock
      deadline={request.holdExpiresAt}
      label={t('card.awaitingPayment')}
      expiredLabel={t('card.paymentExpired')}
      urgentMinutes={HOLD_PAYMENT_REMINDER_REMAINING_MINUTES.FINAL}
      title={t('card.payDeadline', { value: fmt.dateTime(request.holdExpiresAt) })}
      compact={compactClock}
    />
  ) : (
    <StatusBadge
      value={request.status as BookingRequestStatus}
      meta={BOOKING_REQUEST_STATUS_META}
      group="bookingRequestStatus"
      tone={isClosed ? STATUS_COLOR.DANGER : undefined}
    />
  );

  const hasActions = (decidable || awaitingHold) && canApprove;
  const actionsNode = (
    <>
      {/*
        Quyết định chỉ có ở yêu cầu CÒN xử lý được và chỉ với người có quyền duyệt. Quá hạn thì nút
        biến mất hẳn — không có điều kiện nào để chờ nữa.
      */}
      {decidable && canApprove ? (
        <>
          <Button
            className={styles.rejectButton}
            loading={pendingAction === 'reject'}
            disabled={busy && pendingAction !== 'reject'}
            onClick={() => onReject(request)}
          >
            {t('actions.reject')}
          </Button>
          <Button
            type="primary"
            className={styles.confirmButton}
            loading={pendingAction === 'approve'}
            disabled={busy && pendingAction !== 'approve'}
            onClick={() => onApprove(request)}
          >
            {t('card.confirmShort')}
          </Button>
        </>
      ) : null}

      {awaitingHold && canApprove ? (
        <>
          {/*
            HUỶ đứng ở chỗ của nút từ chối: chặng duy nhất gian hàng đã hứa nhận nhưng chuyến chưa
            thành đơn (ADR 0045). NHẮC KHÁCH cạnh nó — việc thường ngày của chặng này (design).
          */}
          <Button
            className={styles.rejectButton}
            loading={pendingAction === 'cancel'}
            disabled={busy && pendingAction !== 'cancel'}
            onClick={() => onCancel(request)}
          >
            {t('actions.cancel')}
          </Button>
          {onRemind && request.paymentReminderAvailableAt ? (
            <RemindButton
              availableAt={request.paymentReminderAvailableAt}
              loading={pendingAction === 'remind'}
              disabled={busy && pendingAction !== 'remind'}
              onClick={() => onRemind(request)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );

  const aside = (
    <>
      {statusNode}
      {actionsNode}
    </>
  );

  const vehicle = {
    name: request.vehicleName,
    imageUrl: request.vehicleImageUrl,
    specs,
    plateLine: plateLine || null,
    href: canViewVehicle ? vehiclePath.detail(request.vehicleId) : null,
    onOpen: () => onOpenVehicle(request),
    noImageLabel: t('vehicle.noImage'),
    // Lịch của CHÍNH chiếc xe — câu hỏi đầu tiên trước khi duyệt. Link thật, cả màn hình.
    schedule: canViewVehicle
      ? {
          href: vehicleSchedulePath(
            { name: request.vehicleName, plateNumber: request.vehiclePlate },
            { back: backHref, branchId: branchCrumb },
          ),
          label: t('vehicle.viewSchedule'),
          ariaLabel: t('vehicle.viewScheduleFor', { vehicle: request.vehicleName }),
        }
      : null,
  };

  const customerName = customerLinkable ? (
    <Link
      href={customerPath.detail(request.tenantCustomerId as string)}
      className={styles.customerLink}
      onClick={openOverlayOnPlainClick(() => onOpenCustomer(request))}
    >
      {request.customerName}
    </Link>
  ) : (
    request.customerName
  );
  const customerPhone = phoneLink ? (
    <a href={phoneLink} className={styles.customerPhone}>
      {request.customerPhone}
    </a>
  ) : (
    request.customerPhone
  );
  const contacts = (
    <CustomerContactButtons
      variant="icon"
      compact={layout === 'board'}
      name={request.customerName}
      phone={request.customerPhone}
      onMessage={canOpenChat ? () => onMessage(request) : undefined}
      messageUnavailable={!request.canMessageOnPlatform}
      messageLoading={pendingAction === 'message'}
      disabled={busy}
    />
  );

  if (layout === 'board') {
    return (
      <RentalBoardCard
        titleId={titleId}
        busy={busy}
        handle={dragHandle}
        code={
          <RentalCardDetailButton onClick={openDetail} ariaLabel={detailAria}>
            {request.bookingCode
              ? t('card.bookingCode', { code: request.bookingCode })
              : t('card.sentAt', { value: fmt.dateTime(request.createdAt) })}
          </RentalCardDetailButton>
        }
        chip={<ServiceTypeChip value={request.serviceType} />}
        // Thẻ hẹp: viên chỉ mang BIỂN SỐ như design (mã nội bộ còn ở List + chi tiết).
        vehicle={{ ...vehicle, plateLine: request.vehiclePlate || plateLine || null }}
        customer={{
          identity: (
            <CustomerIdentity
              size="sm"
              avatarUrl={request.customerAvatarUrl}
              nameSource={request.customerName}
              name={customerName}
              phone={customerPhone}
              extra={<RequestCustomerHint request={request} showRisk={showRisk} />}
            />
          ),
          contacts,
        }}
        schedule={requestBoardSchedule(request, { t, tKanban, fmt, domainLabel })}
        {...requestBoardMoney(request, t, tKanban)}
        status={statusNode}
        actions={hasActions ? actionsNode : undefined}
        onOpenDetail={openDetail}
      />
    );
  }

  return (
    <RentalCard
      titleId={titleId}
      busy={busy}
      meta={meta}
      aside={aside}
      notice={needsDecision && pastDue ? t('deadline.pastDueHint') : undefined}
      onOpenDetail={openDetail}
      vehicle={vehicle}
      customer={
        <>
          <div className={styles.customerTop}>
            <h3 className={styles.zoneLabel}>{t('card.customer')}</h3>
            <CustomerIdentity
              avatarUrl={request.customerAvatarUrl}
              nameSource={request.customerName}
              name={customerName}
              badge={request.customerIsRegular ? t('detail.regular') : undefined}
              phone={customerPhone}
            />
          </div>
          {contacts}
        </>
      }
      schedule={
        <>
          <RentalFacts>
            {hasSchedule ? (
              <>
                <RentalFact label={t('card.pickupAt')}>{fmt.rentalPoint(pickup)}</RentalFact>
                <RentalFact label={t('card.returnAt')}>{fmt.rentalPoint(dropoff)}</RentalFact>
                <RentalFact label={t('card.duration')}>
                  {fmt.rentalDuration(pickup, dropoff)}
                </RentalFact>
                {isLongTerm && request.longTermPackageMonths ? (
                  <RentalFact label={t('card.package')}>
                    {fmt.packageLabel(request.longTermPackageMonths)}
                  </RentalFact>
                ) : null}
              </>
            ) : (
              /*
               * Dài hạn CHƯA duyệt không có lịch (ADR 0011) — nói GÓI và NGUYỆN VỌNG. Bịa một khoảng
               * ngày ở đây khiến người trực tưởng khách đã chốt giờ nhận.
               */
              <>
                <RentalFact label={t('card.package')}>
                  {request.longTermPackageMonths
                    ? fmt.packageLabel(request.longTermPackageMonths)
                    : t('schedule.packageMissing')}
                </RentalFact>
                <RentalFact label={t('card.pickupWish')}>{fmt.pickupWish(request)}</RentalFact>
              </>
            )}
            {/* LUÔN nói rõ một trong hai hình thức — im lặng bị đọc là "chắc khách tự đến". */}
            <RentalFact label={t('card.handover')}>
              {request.deliveryRequested ? t('card.handoverDelivery') : t('card.handoverSelf')}
            </RentalFact>
          </RentalFacts>
          {isLongTerm && !hasSchedule ? (
            <RentalPanelNote>{t('schedule.pickupWishHint')}</RentalPanelNote>
          ) : null}
        </>
      }
      payment={
        request.pricing ? (
          <>
            <RentalFacts>
              {requestPaymentRows(request, t).map((row) => (
                <RentalFact key={row.key} label={row.label} money={row.text == null}>
                  {row.text ?? fmt.money(row.amount)}
                </RentalFact>
              ))}
            </RentalFacts>
            {request.pricing.isEstimate ? (
              <RentalPanelNote>{t('card.estimate')}</RentalPanelNote>
            ) : null}
          </>
        ) : null
      }
      extrasLabel={t('card.extrasLabel')}
      extras={
        hasExtras ? (
          <>
            {showRisk ? (
              <p className={styles.risk} role="note">
                <ExclamationCircleOutlined aria-hidden="true" />{' '}
                {t('customer.riskWarning', {
                  level: domainLabel('tenantCustomerRiskLevel', riskLevel),
                })}
              </p>
            ) : null}

            {request.customerAccountPhone || request.customerEmail || !request.tenantCustomerId ? (
              <p className={styles.extraLine}>
                {[
                  request.customerAccountPhone
                    ? t('customer.accountPhone', { phone: request.customerAccountPhone })
                    : null,
                  request.customerEmail,
                  !request.tenantCustomerId ? t('customer.noProfile') : null,
                ]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR)}
              </p>
            ) : null}

            {isWithDriver && (routeType || request.pickupAddress || request.destination) ? (
              <dl className={styles.extraFacts}>
                {routeType ? (
                  <ExtraFact label={t('schedule.route')}>
                    <Tag
                      className={styles.chip}
                      color={routeIsLongDistance ? STATUS_COLOR.WARNING : undefined}
                    >
                      {domainLabel('routeType', routeType)}
                    </Tag>
                  </ExtraFact>
                ) : null}
                {request.pickupAddress ? (
                  <ExtraFact label={t('schedule.pickupAddress')}>{request.pickupAddress}</ExtraFact>
                ) : null}
                {request.destination ? (
                  <ExtraFact label={t('schedule.destination')}>{request.destination}</ExtraFact>
                ) : null}
              </dl>
            ) : null}

            {/*
              Địa chỉ giao là văn bản đầy đủ, không tooltip: đó là nơi nhân viên phải lái xe tới. KHÔNG
              hứa giao nhận miễn phí — phí chốt sau khi hai bên thoả thuận.
            */}
            {request.deliveryRequested ? (
              <div>
                {request.deliveryAddress ? (
                  <dl className={styles.extraFacts}>
                    <ExtraFact label={t('schedule.deliveryAddress')}>
                      {request.deliveryAddress}
                    </ExtraFact>
                  </dl>
                ) : null}
                {request.pricing?.deliveryFee == null ? (
                  <p className={styles.hint}>{t('schedule.deliveryFeeHint')}</p>
                ) : null}
              </div>
            ) : null}

            {request.note ? (
              <div className={styles.note}>
                <p className={styles.noteLabel}>{t('note.label')}</p>
                <p className={noteExpanded ? styles.noteBodyFull : styles.noteBody}>
                  {request.note}
                </p>
                <Button
                  type="link"
                  size="small"
                  className={styles.noteToggle}
                  onClick={() => setNoteExpanded((open) => !open)}
                >
                  {noteExpanded ? t('note.collapse') : t('note.expand')}
                </Button>
              </div>
            ) : null}

            {request.rejectReason ? (
              <div className={styles.note}>
                <p className={styles.noteLabel}>{t('trace.rejectReason')}</p>
                <p className={styles.noteBodyFull}>{request.rejectReason}</p>
              </div>
            ) : null}
          </>
        ) : null
      }
    />
  );
}

/**
 * "Nhắc khách" — mở khi khoảng lặng từ lời nhắc gần nhất đã qua (`paymentReminderAvailableAt`,
 * server tính). Trước mốc đó nút MỜ kèm giờ mở lại; tự mở đúng lúc mà không cần tải lại trang.
 */
function RemindButton({
  availableAt,
  loading,
  disabled,
  onClick,
}: {
  availableAt: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useTranslations('BookingRequests.card');
  const fmt = useAppFormat();
  const [now, setNow] = useState(() => Date.now());
  const opensAt = new Date(availableAt).getTime();
  const waiting = opensAt > now;

  useEffect(() => {
    const wait = new Date(availableAt).getTime() - Date.now();
    if (wait <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), wait + 250);
    return () => clearTimeout(timer);
  }, [availableAt]);

  const button = (
    <Button
      className={styles.ghostButton}
      loading={loading}
      disabled={disabled || waiting}
      onClick={onClick}
    >
      {t('remind')}
    </Button>
  );
  if (!waiting) return button;
  return (
    <Tooltip title={t('remindAvailableAt', { time: fmt.time(availableAt) })}>
      {/* Nút đang `disabled` không phát sự kiện chuột — bọc để tooltip vẫn hiện. */}
      <span className={styles.tooltipAnchor}>{button}</span>
    </Tooltip>
  );
}

/** Một dòng tiền của ô "Thanh toán" — đổi NHÃN theo chặng (chốt 02/11/2026, ADR 0044). */
export interface RequestPaymentRow {
  key: 'rental' | 'delivery' | 'customer' | 'hold' | 'payAtPickup';
  label: string;
  amount: string;
  /** Chữ thay cho số tiền ("Miễn phí", "Chốt khi duyệt") - chỉ dòng phí giao xe. */
  text?: string;
  /** Chỉ ở dòng giữ chỗ: dự kiến (chưa ai nhận) · chưa thanh toán · đã thanh toán đủ. */
  holdState?: RentalBoardHold['state'];
}

/**
 * Các dòng tiền của một yêu cầu: chưa ai nhận chuyến thì tiền giữ chỗ là số DỰ KIẾN (chưa có QR —
 * ADR 0044 điều 1); đã phát hành mà chưa đủ thì "chờ khách trả"; chỉ khi tiền về đủ mới là "Đã giữ
 * chỗ". "Khách trả" không lặp khi bằng "Tiền thuê". MỘT phép tính cho thẻ lẫn popup chi tiết.
 */
export function requestPaymentRows(
  request: BookingRequestItem,
  t: ReturnType<typeof useTranslations<'BookingRequests'>>,
): RequestPaymentRow[] {
  const pricing = request.pricing;
  if (!pricing) return [];
  const preview = request.approvalPreview ?? null;
  /*
   * Phí giao xe tận nơi `G` (QC 27/11/2026): chủ xe chốt ở hộp duyệt, nằm trong `rentalTotal` và
   * trong phần trả tay, không vào tiền giữ chỗ (ADR 0064 điều 4). Tách thành dòng riêng để "Tiền
   * thuê" là tiền thuê thật và các dòng cộng lại khớp "Khách trả". Chưa duyệt thì chưa có số (chủ
   * xe nhập ở hộp duyệt) - không có dòng, ⓘ cạnh "Giao xe tận nơi" giải thích.
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
        : { key: 'delivery', label: t('card.deliveryFee'), amount: '0', text: t('card.deliveryFeeFree') },
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
        ? { key: 'hold', label: t('card.holdPaid'), amount: paid, holdState: 'paid' }
        : {
            key: 'hold',
            holdState: 'unpaid',
            // "Chờ khách trả" chỉ khi cửa sổ còn mở; hết hạn/huỷ là khoản KHÔNG về.
            label:
              request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD
                ? t('card.holdAwaiting')
                : t('card.holdUnpaid'),
            amount: pricing.holdAmount,
          },
    );
  } else if (pricing.paidAmount != null) {
    // Đơn không có khoản giữ chỗ (gian hàng không thu online): số đã trả qua nền tảng.
    rows.push({
      key: 'hold',
      label: t('card.holdPaid'),
      amount: pricing.paidAmount,
      holdState: 'paid',
    });
  } else if (preview?.collectsHold && preview.onlineAmount) {
    rows.push({
      key: 'hold',
      label: t('card.holdExpected'),
      amount: preview.onlineAmount,
      holdState: 'expected',
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
    });
  }
  return rows;
}

/**
 * Các dòng tiền ở cỡ chữ của popup chi tiết yêu cầu (design `23807:66302`) — CÙNG phép tính
 * `requestPaymentRows` với thẻ.
 */
export function RequestPaymentFacts({
  request,
  emphasizeLast = false,
}: {
  request: BookingRequestItem;
  /** Popup chi tiết: dòng cuối (phần còn phải thu) tô vàng, chữ to hơn. */
  emphasizeLast?: boolean;
}) {
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const rows = requestPaymentRows(request, t);
  return (
    <dl className={styles.facts}>
      {rows.map((row, index) => (
        <div key={row.key} className={styles.fact}>
          <dt className={styles.factLabel}>{row.label}</dt>
          <dd
            className={
              emphasizeLast && index === rows.length - 1
                ? styles.factValueEmphasis
                : styles.factValueEnd
            }
          >
            {row.text ?? fmt.money(row.amount)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Một dòng "nhãn — giá trị" của dải thông tin thêm. */
function ExtraFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.extraFact}>
      <dt className={styles.extraFactLabel}>{label}</dt>
      <dd className={styles.extraFactValue}>{children}</dd>
    </div>
  );
}

type RequestCardT = ReturnType<typeof useTranslations<'BookingRequests'>>;

type KanbanT = ReturnType<typeof useTranslations<'Bookings.board.kanban'>>;

/**
 * Ô lịch của thẻ gọn (design 10/11/2026 bản 2): "Nhận xe" nhận → trả trên MỘT dòng, rồi NƠI đổi
 * tay với nhãn theo hình thức (chốt 10/11 — design bỏ dòng "Hình thức nhận xe", nhãn phải tự nói):
 * giao tận nơi "Giao xe tới" · có tài xế "Điểm đón" · khách tự tới "Nhận tại" (chi nhánh / hồ sơ
 * gian hàng). Địa chỉ gọn bỏ tỉnh/TP và chữ "Phường/Xã" (`shortAddress`); bản đầy đủ, phí giao,
 * lộ trình, điểm đến vào ⓘ. Dài hạn thêm GÓI; dài hạn chưa duyệt nói gói + nguyện vọng.
 */
function requestBoardSchedule(
  request: BookingRequestItem,
  {
    t,
    tKanban,
    fmt,
    domainLabel,
  }: {
    t: RequestCardT;
    tKanban: KanbanT;
    fmt: ReturnType<typeof useAppFormat>;
    domainLabel: ReturnType<typeof useDomainLabel>;
  },
): RentalBoardFact[] {
  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;
  const packageLabel = request.longTermPackageMonths
    ? fmt.packageLabel(request.longTermPackageMonths)
    : null;
  const facts: RentalBoardFact[] =
    pickup && dropoff
      ? [
          {
            key: 'period',
            label: tKanban('schedule.period'),
            value: <RentalBoardPeriod from={pickup} to={dropoff} />,
          },
          ...(request.serviceType === SERVICE_TYPE.LONG_TERM && packageLabel
            ? [{ key: 'package', label: t('card.package'), value: packageLabel }]
            : []),
        ]
      : [
          // Dài hạn CHƯA duyệt không có lịch (ADR 0011) — nói GÓI và NGUYỆN VỌNG, không bịa ngày.
          {
            key: 'package',
            label: t('card.package'),
            value: packageLabel ?? t('schedule.packageMissing'),
          },
          { key: 'wish', label: t('card.pickupWish'), value: fmt.pickupWish(request) },
        ];

  const routeType = request.routeType as RouteType | null;
  const details = [
    request.deliveryAddress
      ? { key: 'address', label: t('schedule.deliveryAddress'), text: request.deliveryAddress }
      : null,
    request.deliveryRequested
      ? request.pricing?.deliveryFee == null
        ? { key: 'fee', text: t('schedule.deliveryFeeHint') }
        : {
            key: 'fee',
            label: t('approve.deliveryFeeLabel'),
            text: isPositiveMoney(request.pricing.deliveryFee)
              ? fmt.money(request.pricing.deliveryFee)
              : t('card.deliveryFeeFree'),
          }
      : null,
    routeType
      ? { key: 'route', label: t('schedule.route'), text: domainLabel('routeType', routeType) }
      : null,
    request.pickupAddress
      ? { key: 'pickupAddress', label: t('schedule.pickupAddress'), text: request.pickupAddress }
      : null,
    request.destination
      ? { key: 'destination', label: t('schedule.destination'), text: request.destination }
      : null,
  ].filter((item): item is { key: string; label?: string; text: string } => item !== null);

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
  facts.push({
    key: 'place',
    label: place.label,
    value: placeAddress ? (
      <RentalBoardAddress text={placeAddress} />
    ) : (
      tKanban('schedule.placeUnknown')
    ),
    hint:
      details.length > 0
        ? { label: t('card.handoverInfo'), content: <RentalBoardHintList items={details} /> }
        : null,
  });
  return facts;
}

/**
 * MỘT hàng tiền của thẻ gọn, góc nhìn CHỦ XE (chốt 10/11/2026, đối chiếu bảng cộng ví của Mioto):
 * Giữ chỗ (khách chuyển online qua XePrime) · Thu khi giao xe (khách trả tận tay) · Cộng ví (`D − T`
 * XePrime ghi vào Ví điểm khi chuyến xong). Giữ chỗ + Thu khi giao xe = tổng khách trả — số vàng ở
 * dải đầu. CÙNG phép tính `requestPaymentRows` với thẻ List và popup; viên trạng thái giữ chỗ ở
 * dải đầu. Chuyến không thu online thì không có ô giữ chỗ lẫn cộng ví (không có gì về ví).
 */
function requestBoardMoney(
  request: BookingRequestItem,
  t: RequestCardT,
  tKanban: KanbanT,
): { total: RentalBoardMoney | null; money: RentalBoardMoney[]; hold: RentalBoardHold | null } {
  const pricing = request.pricing;
  /*
   * Yêu cầu còn chờ duyệt LUÔN có viên "Chờ duyệt", kể cả khi chưa có khoản giữ chỗ nào (thuê dài
   * hạn chưa chốt lịch/giá - ADR 0011 · 0044): cùng một trạng thái thì cùng một viên (người dùng
   * chốt 20/11/2026, cả app). Chỉ là hiển thị - không bịa số tiền.
   */
  const awaitingApproval: RentalBoardHold | null =
    request.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL
      ? { label: tKanban('money.hold'), state: 'expected', stateLabel: tKanban('holdState.awaitingApproval') }
      : null;
  if (!pricing) return { total: null, money: [], hold: awaitingApproval };
  const rows = requestPaymentRows(request, t);
  const payAtPickup = rows.find((row) => row.key === 'payAtPickup');
  const holdRow = rows.find((row) => row.key === 'hold');
  const walletCredit = holdRow
    ? (pricing.ownerPayableAmount ??
      request.approvalPreview?.ownerPayout.ownerPayableAmount ??
      null)
    : null;
  const money: RentalBoardMoney[] = [
    ...(holdRow ? [{ key: 'hold', label: tKanban('money.hold'), amount: holdRow.amount }] : []),
    ...(payAtPickup
      ? [{ key: 'payAtPickup', label: tKanban('money.payAtPickup'), amount: payAtPickup.amount }]
      : []),
    ...(walletCredit != null
      ? [{ key: 'walletCredit', label: tKanban('money.walletCredit'), amount: walletCredit }]
      : []),
  ];
  const hold =
    holdRow && holdRow.holdState
      ? {
          label: tKanban('money.hold'),
          state: holdRow.holdState,
          // Chưa duyệt: "Chờ duyệt" thay "Dự kiến" (người dùng 16/11/2026, cả app).
          stateLabel:
            holdRow.holdState === 'expected'
              ? tKanban('holdState.awaitingApproval')
              : tKanban(`holdState.${holdRow.holdState}`),
        }
      : awaitingApproval;
  return {
    total: {
      key: 'customer',
      label: tKanban('money.customerTotal'),
      amount: pricing.customerTotalAmount,
    },
    money,
    hold,
  };
}

/**
 * ⓘ cạnh tên khách trên thẻ Kanban — những gì thẻ List để ở dải thông tin thêm: cảnh báo rủi ro
 * (ⓘ đỏ), khách quen, ghi chú của khách, SĐT tài khoản / email, chưa có hồ sơ. Không có gì thì không có ⓘ.
 */
function RequestCustomerHint({
  request,
  showRisk,
}: {
  request: BookingRequestItem;
  showRisk: boolean;
}) {
  const t = useTranslations('BookingRequests');
  const domainLabel = useDomainLabel();
  const riskLevel = request.customerRiskLevel as TenantCustomerRiskLevel | null;
  const items = [
    showRisk && riskLevel
      ? {
          key: 'risk',
          text: t('customer.riskWarning', {
            level: domainLabel('tenantCustomerRiskLevel', riskLevel),
          }),
        }
      : null,
    request.customerIsRegular ? { key: 'regular', text: t('detail.regular') } : null,
    request.note ? { key: 'note', label: t('note.label'), text: request.note } : null,
    request.customerAccountPhone
      ? {
          key: 'account',
          text: t('customer.accountPhone', { phone: request.customerAccountPhone }),
        }
      : null,
    request.customerEmail ? { key: 'email', text: request.customerEmail } : null,
    !request.tenantCustomerId ? { key: 'profile', text: t('customer.noProfile') } : null,
  ].filter((item): item is { key: string; label?: string; text: string } => item !== null);
  if (items.length === 0) return null;
  return (
    <InfoHint
      label={t('card.customerInfo')}
      content={<RentalBoardHintList items={items} />}
      className={showRisk ? styles.riskHint : styles.infoHint}
    />
  );
}
