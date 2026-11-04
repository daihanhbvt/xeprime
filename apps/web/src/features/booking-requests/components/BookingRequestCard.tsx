'use client';

import { CarOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_META,
  isBookingRequestPastDue,
  ROUTE_TYPE,
  SERVICE_TYPE,
  STATUS_COLOR,
  TENANT_CUSTOMER_RISK_LEVEL,
  type BookingRequestStatus,
  type RouteType,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import { isPositiveMoney, LIST_SEPARATOR, subtractMoney } from '@xeprime/domain';
import { ServiceTypeChip } from '@/components/data-display/ServiceTypeChip';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { LineIcon } from '@/components/icons/LineIcon';
import { customerPath, vehiclePath } from '@/constants/routes';
import { useBranchCrumb } from '@/features/branches/hooks/use-branch-return';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { telHref } from '@/lib/contact';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { openOverlayOnPlainClick } from '@/lib/modal-link';
import { toAppTz } from '@/lib/datetime';
import { useListingSpecSummary } from '../hooks/use-listing-spec-summary';
import { BOOKING_REQUEST_CLOSED_STATUSES } from '../constants';
import { CustomerContactButtons } from './CustomerContactButtons';
import { CustomerIdentity } from './CustomerIdentity';
import { RespondDeadline } from './RespondDeadline';
import type { BookingRequestItem } from '../types';
import styles from './BookingRequestCard.module.css';

/** Thao tác đang chạy trên ĐÚNG yêu cầu này — chặn bấm chồng lên nhau. */
export type BookingRequestAction = 'approve' | 'reject' | 'cancel' | 'message';

interface Props {
  request: BookingRequestItem;
  /** `booking_requests.approve` — thiếu thì KHÔNG render nút duyệt/từ chối (không disable giả). */
  canApprove: boolean;
  canViewVehicle: boolean;
  canViewCustomer: boolean;
  /**
   * Đọc được ĐƠN — không dùng trong thẻ nữa: "Xem chi tiết đơn" luôn gọi `onOpenDetail`, và màn
   * cha mới quyết mở chi tiết đơn hay chi tiết yêu cầu theo quyền này. Giữ prop cho nơi gọi cũ.
   */
  canViewBooking: boolean;
  /** Thao tác đang chạy trên yêu cầu này; `null` khi rảnh. */
  pendingAction: BookingRequestAction | null;
  onApprove: (request: BookingRequestItem) => void;
  onReject: (request: BookingRequestItem) => void;
  /**
   * HUỶ một chuyến ĐÃ NHẬN (ADR 0045 điều 1) — chỉ có ở `awaiting_hold`.
   *
   * Khác `onReject` về bản chất chứ không chỉ về nhãn: từ chối là trả lời một câu hỏi còn
   * treo, huỷ là rút lại một lời đã hứa và phải nhả lịch + hoàn phần khách đã chuyển.
   */
  onCancel: (request: BookingRequestItem) => void;
  onMessage: (request: BookingRequestItem) => void;
  /**
   * Mở CHI TIẾT yêu cầu dưới dạng modal. Yêu cầu đã thành đơn mở chi tiết ĐƠN; yêu cầu chưa
   * có đơn mở chi tiết YÊU CẦU — nơi gọi quyết định, thẻ chỉ báo "người dùng muốn xem".
   */
  onOpenDetail: (request: BookingRequestItem) => void;
  onOpenVehicle: (request: BookingRequestItem) => void;
  onOpenCustomer: (request: BookingRequestItem) => void;
  /**
   * Đường quay lại ĐÚNG chỗ đang đứng (kèm tab + trang), gắn vào link "Xem lịch xe" để màn
   * lịch dựng được nút quay lại. Thẻ không tự đọc URL — màn cha mới biết trạng thái lọc.
   */
  backHref: string;
}

/**
 * MỘT yêu cầu thuê trong hộp thư của gian hàng — Figma Partner-XePrime "Vehicle Card" của màn
 * Request (`23649:25607`, 02/11/2026).
 *
 * Bố cục: DẢI ĐẦU (mã đơn · loại dịch vụ · gửi lúc · xử lý lúc, phải là đồng hồ hạn phản hồi hoặc
 * nhãn trạng thái + quyết định) rồi THÂN bốn vùng (xe · khách · yêu cầu thuê · chi tiết thanh
 * toán), cuối cùng là DẢI THÔNG TIN THÊM chỉ khi yêu cầu có (ghi chú, địa chỉ giao, lộ trình, cảnh
 * báo rủi ro, lý do từ chối) — chốt với người dùng 02/11/2026, xem sổ cái `09_PARTNER_REDESIGN.md`
 * §3.1. Các vùng là con TRỰC TIẾP của lưới nên `grid-template-areas` xếp lại theo bề rộng mà
 * không phải render nội dung lần thứ hai cho mobile.
 *
 * Component không tự quyết QUYỀN và không tự gọi API: nó nhận cờ quyền và callback, nên cùng
 * một thẻ dùng được ở mọi chỗ và test không phải dựng cả tầng dữ liệu.
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
  onMessage,
  onOpenDetail,
  onOpenVehicle,
  onOpenCustomer,
  backHref,
}: Props) {
  const branchCrumb = useBranchCrumb();
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [noteExpanded, setNoteExpanded] = useState(false);
  const specs = useListingSpecSummary(request);

  /*
   * Quá hạn phản hồi thì KHÔNG còn quyết định nào — server từ chối cả duyệt lẫn từ chối
   * (`BOOKING_REQUEST_EXPIRED`), nên bày nút ra là mời người dùng bấm một thứ chắc chắn hỏng.
   *
   * Hỏi `respondBy` chứ không hỏi `status`: trạng thái `expired` do worker ghi theo nhịp, nên
   * có một cửa sổ mà bản ghi vẫn còn `pending_host_approval` trong khi giờ đã hết. Đây chính
   * là vị từ mà server dùng, nên hai phía không bao giờ nói hai câu khác nhau.
   */
  const pastDue = isBookingRequestPastDue(request.respondBy);
  // Chặng DUY NHẤT gian hàng còn phải duyệt/từ chối (ADR 0055 gỡ `hold_paid` của ADR 0039).
  const needsDecision = request.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;
  const decidable = needsDecision && !pastDue;
  const awaitingHold = request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD;
  const isClosed = (BOOKING_REQUEST_CLOSED_STATUSES as readonly string[]).includes(request.status);
  // Bất kỳ thao tác nào đang chạy đều khoá CẢ HAI quyết định: duyệt và từ chối cùng lúc trên
  // một yêu cầu là hai kết cục loại trừ nhau, và cái tới sau chỉ nhận được lỗi khó hiểu.
  const busy = pendingAction !== null;

  const vehicleLabel = request.vehicleName;
  /*
   * Mỗi thẻ phải có TÊN khả truy cập, nếu không trình đọc màn hình chỉ đọc "article" mười lần
   * liền và người dùng không nhảy giữa các yêu cầu được. Tên là chính tên xe — thứ ai cũng
   * dùng để gọi một yêu cầu ("cái Carnival hôm qua").
   */
  const titleId = `booking-request-${request.id}-title`;
  // Mã nội bộ của xe đi cùng biển số — thứ nhân viên đọc to ở quầy khi biển số chưa có.
  const plateLine = [request.vehicleCode, request.vehiclePlate].filter(Boolean).join(LIST_SEPARATOR);

  const riskLevel = request.customerRiskLevel as TenantCustomerRiskLevel | null;
  const showRisk = riskLevel != null && riskLevel !== TENANT_CUSTOMER_RISK_LEVEL.NORMAL;

  const customerLinkable = canViewCustomer && Boolean(request.tenantCustomerId);
  const phoneLink = telHref(request.customerPhone);
  // Phiên hỗ trợ gian hàng không nhắn tin thay gian hàng (ADR 0050 §10).
  const chatHidden = useSupportHides(SUPPORT_HIDDEN_AREA.CHAT);
  // Chủ xe tuyến hoa hồng chưa nhắn khách khi yêu cầu chưa thành đơn (ADR 0073) — ẩn hẳn, cùng
  // luật với SĐT khách; server chặn endpoint mở hội thoại.
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

  return (
    <article className={styles.card} aria-labelledby={titleId} aria-busy={busy || undefined}>
      {/* ── Dải đầu: dấu vết bên trái, trạng thái + quyết định bên phải. ─────── */}
      <header className={styles.head}>
        <div className={styles.headMeta}>
          {request.bookingCode ? (
            <span className={styles.code}>{t('card.bookingCode', { code: request.bookingCode })}</span>
          ) : null}
          <ServiceTypeChip value={request.serviceType} />
          <span className={styles.stamp}>
            {t('card.sentAt', { value: fmt.dateTime(request.createdAt) })}
          </span>
          {request.decidedAt ? (
            <span className={styles.stamp}>
              {t('card.decidedAt', { value: fmt.dateTime(request.decidedAt) })}
            </span>
          ) : null}
        </div>

        <div className={styles.headActions}>
          {/*
            Còn chờ quyết định: đồng hồ hạn phản hồi. Mọi chặng khác: nhãn trạng thái ở ĐÚNG chỗ
            đó (design vẽ viên đỏ có chấm cho kết cục) — hai thứ cùng trả lời "yêu cầu đang ở đâu".
          */}
          {needsDecision ? (
            <RespondDeadline respondBy={request.respondBy} variant="header" />
          ) : (
            <StatusBadge
              value={request.status as BookingRequestStatus}
              meta={BOOKING_REQUEST_STATUS_META}
              group="bookingRequestStatus"
              // Kết cục KHÔNG thành đơn (tab "Đã kết thúc") là viên đỏ — design `23649:25607`.
              tone={isClosed ? STATUS_COLOR.DANGER : undefined}
            />
          )}

          {/*
            Quyết định chỉ có ở yêu cầu CÒN XỬ LÝ ĐƯỢC (chờ duyệt + chưa quá hạn) và chỉ với người
            có quyền duyệt. Quá hạn thì nút biến mất hẳn thay vì mờ đi: không có điều kiện nào để
            chờ nữa, và một nút xám vĩnh viễn chỉ làm người ta thử bấm.
          */}
          {decidable && canApprove ? (
            <>
              <Button
                className={styles.rejectButton}
                icon={<LineIcon name="close" className={styles.buttonIcon} />}
                loading={pendingAction === 'reject'}
                disabled={busy && pendingAction !== 'reject'}
                onClick={() => onReject(request)}
              >
                {t('actions.reject')}
              </Button>
              <Button
                type="primary"
                className={styles.confirmButton}
                icon={<LineIcon name="tick" className={styles.buttonIcon} />}
                loading={pendingAction === 'approve'}
                disabled={busy && pendingAction !== 'approve'}
                onClick={() => onApprove(request)}
              >
                {t('card.confirm')}
              </Button>
            </>
          ) : null}

          {awaitingHold && canApprove ? (
            /*
             * Nút HUỶ đứng ở chỗ của hai nút quyết định và không ở đâu khác: đây là chặng duy
             * nhất mà gian hàng đã hứa nhận chuyến nhưng chuyến chưa thành đơn (ADR 0045). Trước
             * đó xe hỏng lúc mười giờ tối thì đường duy nhất là chờ hết cửa sổ thanh toán.
             */
            <Button
              className={styles.rejectButton}
              icon={<LineIcon name="close" className={styles.buttonIcon} />}
              loading={pendingAction === 'cancel'}
              disabled={busy && pendingAction !== 'cancel'}
              onClick={() => onCancel(request)}
            >
              {t('actions.cancel')}
            </Button>
          ) : null}
        </div>
      </header>

      {/*
        Hai câu trạng thái chỉ một số chặng có — đứng ngay dưới dải đầu, cả chiều ngang, vì chúng
        giải thích vì sao hàng nút trên kia vắng hoặc khác đi.
      */}
      {needsDecision && pastDue ? (
        <p className={styles.notice}>{t('deadline.pastDueHint')}</p>
      ) : awaitingHold ? (
        /*
         * Gian hàng ĐÃ nhận chuyến; việc còn lại thuộc về khách (ADR 0044 điều 2). Mốc tuyệt đối
         * chứ không phải đồng hồ chạy: cửa sổ này dài tới hai giờ, và một hộp thư mười thẻ với
         * mười `setInterval` nhích mỗi giây là chi phí không đổi lại được gì.
         */
        <p className={styles.notice}>
          {t('awaitingHold.footerHint')}
          {request.holdExpiresAt
            ? ` ${t('card.payDeadline', { value: fmt.dateTime(request.holdExpiresAt) })}`
            : ''}
        </p>
      ) : null}

      <div className={styles.body}>
        {/* ── Xe: mỏ neo thị giác đầu tiên. ─────────────────────────────────── */}
        <div className={styles.vehicle}>
          <div className={styles.vehicleMedia}>
            <VehicleThumb
              imageUrl={request.vehicleImageUrl}
              href={canViewVehicle ? vehiclePath.detail(request.vehicleId) : null}
              onOpen={() => onOpenVehicle(request)}
              emptyLabel={t('vehicle.noImage')}
            />
            {/*
              Lịch của CHÍNH chiếc xe này — câu hỏi đầu tiên trước khi duyệt là "xe có rảnh khung
              đó không". LINK thật tới màn lịch (lọc sẵn theo biển số), không phải modal: xem lịch
              là việc cần cả màn hình.
            */}
            {canViewVehicle ? (
              <Link
                href={vehicleSchedulePath(
                  { name: request.vehicleName, plateNumber: request.vehiclePlate },
                  { back: backHref, branchId: branchCrumb },
                )}
                className={styles.scheduleLink}
                aria-label={t('vehicle.viewScheduleFor', { vehicle: vehicleLabel })}
              >
                <LineIcon name="calendar-sm" className={styles.buttonIcon} />
                {t('vehicle.viewSchedule')}
              </Link>
            ) : null}
          </div>
          <div className={styles.vehicleText}>
            {canViewVehicle ? (
              <Link
                id={titleId}
                href={vehiclePath.detail(request.vehicleId)}
                className={styles.vehicleName}
                title={vehicleLabel}
                onClick={openOverlayOnPlainClick(() => onOpenVehicle(request))}
              >
                {vehicleLabel}
              </Link>
            ) : (
              // Thiếu quyền xem xe: hiện CHỮ, không hiện một link dẫn tới màn 403.
              <span id={titleId} className={styles.vehicleNamePlain} title={vehicleLabel}>
                {vehicleLabel}
              </span>
            )}
            {specs.length > 0 ? (
              <p className={styles.specs}>{specs.join(LIST_SEPARATOR)}</p>
            ) : null}
            {plateLine ? <span className={styles.plate}>{plateLine}</span> : null}
          </div>
        </div>

        {/* ── Khách hàng + liên hệ. ─────────────────────────────────────────── */}
        <div className={styles.customer}>
          <div className={styles.customerTop}>
            <h3 className={styles.zoneLabel}>{t('card.customer')}</h3>
            <CustomerIdentity
              avatarUrl={request.customerAvatarUrl}
              nameSource={request.customerName}
              name={
                customerLinkable ? (
                  <Link
                    href={customerPath.detail(request.tenantCustomerId as string)}
                    className={styles.customerLink}
                    onClick={openOverlayOnPlainClick(() => onOpenCustomer(request))}
                  >
                    {request.customerName}
                  </Link>
                ) : (
                  request.customerName
                )
              }
              badge={request.customerIsRegular ? t('detail.regular') : undefined}
              phone={
                phoneLink ? (
                  <a href={phoneLink} className={styles.customerPhone}>
                    {request.customerPhone}
                  </a>
                ) : (
                  request.customerPhone
                )
              }
            />
          </div>
          <CustomerContactButtons
            variant="labeled"
            name={request.customerName}
            phone={request.customerPhone}
            onMessage={canOpenChat ? () => onMessage(request) : undefined}
            messageUnavailable={!request.canMessageOnPlatform}
            messageLoading={pendingAction === 'message'}
            disabled={busy}
          />
        </div>

        {/* ── Yêu cầu thuê: lịch, hoặc gói + nguyện vọng với đơn dài hạn. ───── */}
        <section className={styles.panel} aria-labelledby={`${titleId}-request`}>
          <div className={styles.panelHead}>
            <h3 id={`${titleId}-request`} className={styles.panelTitle}>
              {t('card.requestHeading')}
            </h3>
            {/*
              MỌI yêu cầu mở được chi tiết: đã thành đơn thì chi tiết ĐƠN, chưa thì chi tiết YÊU
              CẦU — nơi duyệt/từ chối được ngay mà không phải tìm lại thẻ trong danh sách.
            */}
            <button
              type="button"
              className={styles.detailLink}
              onClick={() => onOpenDetail(request)}
              aria-label={t('trace.viewBookingFor', { vehicle: vehicleLabel })}
            >
              {t('card.viewDetail')}
              <LineIcon name="chevron-sm" className={styles.buttonIcon} />
            </button>
          </div>
          <dl className={styles.facts}>
            {hasSchedule ? (
              <>
                <Fact label={t('card.pickupAt')}>{fmt.rentalPoint(pickup)}</Fact>
                <Fact label={t('card.returnAt')}>{fmt.rentalPoint(dropoff)}</Fact>
                <Fact label={t('card.duration')}>{fmt.rentalDuration(pickup, dropoff)}</Fact>
                {isLongTerm && request.longTermPackageMonths ? (
                  <Fact label={t('card.package')}>
                    {fmt.packageLabel(request.longTermPackageMonths)}
                  </Fact>
                ) : null}
              </>
            ) : (
              /*
               * Yêu cầu dài hạn CHƯA duyệt không có lịch (ADR 0011) — nói GÓI và NGUYỆN VỌNG.
               * Bịa ra một khoảng ngày ở đây sẽ khiến người trực tưởng khách đã chốt giờ nhận.
               */
              <>
                <Fact label={t('card.package')}>
                  {request.longTermPackageMonths
                    ? fmt.packageLabel(request.longTermPackageMonths)
                    : t('schedule.packageMissing')}
                </Fact>
                <Fact label={t('card.pickupWish')}>{fmt.pickupWish(request)}</Fact>
              </>
            )}
            {/* LUÔN nói rõ một trong hai hình thức — im lặng bị đọc là "chắc khách tự đến". */}
            <Fact label={t('card.handover')}>
              {request.deliveryRequested ? t('card.handoverDelivery') : t('card.handoverSelf')}
            </Fact>
          </dl>
          {isLongTerm && !hasSchedule ? (
            <p className={styles.hint}>{t('schedule.pickupWishHint')}</p>
          ) : null}
        </section>

        {/*
          ── Chi tiết thanh toán. `pricing = null` (dài hạn chưa chốt lịch, xe thiếu giá, chưa có
          chính sách phí — xem `BookingRequestPricingDto`) thì không dựng vùng này.
        */}
        {request.pricing ? (
          <section className={styles.panel} aria-labelledby={`${titleId}-payment`}>
            <div className={styles.panelHead}>
              <h3 id={`${titleId}-payment`} className={styles.panelTitle}>
                {t('card.paymentHeading')}
              </h3>
              {request.pricing.isEstimate ? (
                <span className={styles.estimateTag}>{t('card.estimate')}</span>
              ) : null}
            </div>
            <RequestPaymentFacts request={request} />
          </section>
        ) : null}
      </div>

      {/*
        Dải thông tin thêm — chỉ MỘT SỐ yêu cầu có (chốt 02/11/2026, design chưa vẽ). Tách khỏi
        thân bốn vùng để thẻ thường (phần lớn yêu cầu) giữ đúng một hàng gọn.
      */}
      {hasExtras ? (
        <div className={styles.extras} aria-label={t('card.extrasLabel')}>
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
                <Fact label={t('schedule.route')}>
                  <Tag
                    className={styles.chip}
                    color={routeIsLongDistance ? STATUS_COLOR.WARNING : undefined}
                  >
                    {domainLabel('routeType', routeType)}
                  </Tag>
                </Fact>
              ) : null}
              {request.pickupAddress ? (
                <Fact label={t('schedule.pickupAddress')}>{request.pickupAddress}</Fact>
              ) : null}
              {request.destination ? (
                <Fact label={t('schedule.destination')}>{request.destination}</Fact>
              ) : null}
            </dl>
          ) : null}

          {/*
            Địa chỉ giao là văn bản đầy đủ, không tooltip: đó là nơi nhân viên phải lái xe tới. Và
            KHÔNG quảng cáo giao nhận là miễn phí vĩnh viễn — phí chốt sau khi hai bên thoả thuận.
          */}
          {request.deliveryRequested ? (
            <div>
              {request.deliveryAddress ? (
                <dl className={styles.extraFacts}>
                  <Fact label={t('schedule.deliveryAddress')}>{request.deliveryAddress}</Fact>
                </dl>
              ) : null}
              <p className={styles.hint}>{t('schedule.deliveryFeeHint')}</p>
            </div>
          ) : null}

          {request.note ? (
            <div className={styles.note}>
              <p className={styles.noteLabel}>{t('note.label')}</p>
              <p className={noteExpanded ? styles.noteBodyFull : styles.noteBody}>{request.note}</p>
              {/*
                Nút mở rộng luôn có mặt khi CÓ ghi chú: đo xem hai dòng đã đủ chưa cần layout
                thật, còn một nút thừa thì vô hại — thà bấm một lần không đổi gì còn hơn giấu
                mất phần cuối của một ghi chú quan trọng.
              */}
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

        </div>
      ) : null}
    </article>
  );
}

/**
 * Các dòng tiền của ô "Chi tiết thanh toán", đổi NHÃN theo chặng (chốt 02/11/2026, ADR 0044):
 * chưa ai nhận chuyến thì tiền giữ chỗ là số DỰ KIẾN; đã phát hành mà chưa đủ thì "chờ khách trả";
 * chỉ khi tiền về đủ mới là "Đã giữ chỗ". "Khách trả" không lặp lại khi bằng "Tiền thuê".
 */
export function RequestPaymentFacts({
  request,
  emphasizeLast = false,
}: {
  request: BookingRequestItem;
  /** Popup chi tiết: dòng cuối (phần còn phải thu) tô vàng, chữ to hơn — design `23807:66302`. */
  emphasizeLast?: boolean;
}) {
  const t = useTranslations('BookingRequests.card');
  const fmt = useAppFormat();
  const pricing = request.pricing!;
  const preview = request.approvalPreview ?? null;

  let hold: { label: string; amount: string } | null = null;
  if (pricing.holdAmount != null) {
    const paid = pricing.holdPaidAmount ?? '0';
    const settled = !isPositiveMoney(subtractMoney(pricing.holdAmount, paid));
    hold = settled
      ? { label: t('holdPaid'), amount: paid }
      : {
          // "Chờ khách trả" chỉ khi cửa sổ thanh toán còn mở; hết hạn/huỷ là khoản KHÔNG về.
          label:
            request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD
              ? t('holdAwaiting')
              : t('holdUnpaid'),
          amount: pricing.holdAmount,
        };
  } else if (pricing.paidAmount != null) {
    // Đơn đi đường không có khoản giữ chỗ (gian hàng không thu cọc online): số đã trả qua nền tảng.
    hold = { label: t('holdPaid'), amount: pricing.paidAmount };
  } else if (preview?.collectsHold && preview.onlineAmount) {
    hold = { label: t('holdExpected'), amount: preview.onlineAmount };
  }

  const payAtPickup =
    pricing.remainingAmount != null
      ? { label: t('payAtPickup'), amount: pricing.remainingAmount }
      : preview
        ? { label: t('payAtPickupExpected'), amount: preview.payAtPickupAmount }
        : null;

  return (
    <dl className={styles.facts}>
      <Fact label={t('rentalTotal')} align="end">
        {fmt.money(pricing.rentalTotal)}
      </Fact>
      {pricing.customerTotalAmount !== pricing.rentalTotal ? (
        <Fact label={t('customerTotal')} align="end">
          {fmt.money(pricing.customerTotalAmount)}
        </Fact>
      ) : null}
      {hold ? (
        <Fact label={hold.label} align="end">
          {fmt.money(hold.amount)}
        </Fact>
      ) : null}
      {payAtPickup ? (
        <Fact label={payAtPickup.label} align="end" emphasis={emphasizeLast}>
          {fmt.money(payAtPickup.amount)}
        </Fact>
      ) : null}
    </dl>
  );
}

/** Một dòng "nhãn — giá trị" của hai ô Yêu cầu thuê / Chi tiết thanh toán. */
function Fact({
  label,
  align,
  emphasis = false,
  children,
}: {
  label: string;
  /** Tiền canh phải để các con số thẳng cột. */
  align?: 'end';
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd
        className={
          emphasis
            ? styles.factValueEmphasis
            : align === 'end'
              ? styles.factValueEnd
              : styles.factValue
        }
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * Ảnh xe với tỉ lệ CỐ ĐỊNH — ảnh nguồn dọc hay ngang thì hàng vẫn thẳng.
 *
 * Link ảnh mang `aria-hidden` + `tabIndex={-1}`: nó trỏ cùng chỗ với link tên ngay bên cạnh,
 * nên để cả hai lộ ra là bắt người dùng bàn phím Tab hai lần qua cùng một đích.
 */
function VehicleThumb({
  imageUrl,
  href,
  onOpen,
  emptyLabel,
}: {
  imageUrl: string | null | undefined;
  href: string | null;
  onOpen: () => void;
  emptyLabel: string;
}) {
  const inner = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.thumbImage} src={imageUrl} alt="" loading="lazy" />
  ) : (
    <span className={styles.thumbFallback} title={emptyLabel}>
      <CarOutlined aria-hidden="true" />
    </span>
  );

  if (!href) return <div className={styles.thumb}>{inner}</div>;
  return (
    <Link
      href={href}
      className={styles.thumb}
      aria-hidden="true"
      tabIndex={-1}
      onClick={openOverlayOnPlainClick(onOpen)}
    >
      {inner}
    </Link>
  );
}
