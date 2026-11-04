'use client';

import { CarOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import Link from 'next/link';
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
import { LIST_SEPARATOR } from '@xeprime/domain';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { LineIcon } from '@/components/icons/LineIcon';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useBranchCrumb } from '@/features/branches/hooks/use-branch-return';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { telHref, zaloHref } from '@/lib/contact';
import { toAppTz } from '@/lib/datetime';
import { BOOKING_REQUEST_CLOSED_STATUSES } from '../constants';
import type { BookingRequestItem } from '../types';
import { RequestPaymentFacts } from './BookingRequestCard';
import styles from './BookingRequestDetailDialog.module.css';

interface Props {
  request: BookingRequestItem | null;
  canApprove: boolean;
  /** Đang chạy quyết định nào trên yêu cầu này — khoá nút để không bấm chồng. */
  pendingAction: 'approve' | 'reject' | 'cancel' | null;
  onClose: () => void;
  onApprove: (request: BookingRequestItem) => void;
  onReject: (request: BookingRequestItem) => void;
  /** HUỶ một chuyến ĐÃ NHẬN (ADR 0045 điều 1) — chỉ có ở `awaiting_hold`. */
  onCancel: (request: BookingRequestItem) => void;
  onOpenVehicle: (request: BookingRequestItem) => void;
  /**
   * Mở hồ sơ khách trong sổ khách hàng. Vắng mặt ⇒ không có nút: sổ khách là năng lực của gói
   * (ADR 0027 điều 1), nên "Chuyến cho thuê" của Owner Lite không truyền.
   */
  onOpenCustomer?: (request: BookingRequestItem) => void;
  /** Đường quay lại đúng chỗ đang đứng, gắn vào link sang màn lịch. */
  backHref: string;
}

/**
 * Chi tiết một YÊU CẦU THUÊ — Figma Partner-XePrime "Request / Details" (`23807:65661`, 02/11/2026):
 * hai cột, trái là XE và chuyến (hình thức, lịch, nhận xe), phải là KHÁCH và THANH TOÁN; chân hộp
 * là quyết định. Dựng từ CHÍNH dữ liệu của dòng hộp thư — không endpoint thứ hai.
 *
 * Giữ đủ những gì design không vẽ (chốt 02/11/2026, sổ cái `09_PARTNER_REDESIGN.md` §3.1): lịch
 * nhận/trả, lộ trình có tài xế, SĐT tài khoản, Zalo, email, cảnh báo khách rủi ro, ghi chú, lý do
 * từ chối, dấu vết thời gian, nút Huỷ chuyến ở chặng chờ khách trả. Nút "Chỉnh sửa" khách của
 * design thành "Xem hồ sơ": danh tính người đặt đọc từ tài khoản, không ai sửa được (ADR 0060).
 */
function DetailBody({
  request,
  onOpenVehicle,
  onOpenCustomer,
  backHref,
}: Props & { request: BookingRequestItem }) {
  const t = useTranslations('BookingRequests');
  const branchCrumb = useBranchCrumb();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;
  const hasSchedule = pickup !== null && dropoff !== null;
  const isLongTerm = request.serviceType === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = request.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const routeType = request.routeType as RouteType | null;
  const routeIsLongDistance =
    routeType === ROUTE_TYPE.INTER_CITY || routeType === ROUTE_TYPE.INTER_CITY_ONE_WAY;

  const riskLevel = request.customerRiskLevel as TenantCustomerRiskLevel | null;
  const showRisk = riskLevel != null && riskLevel !== TENANT_CUSTOMER_RISK_LEVEL.NORMAL;

  const phoneLink = telHref(request.customerPhone);
  const accountPhoneLink = telHref(request.customerAccountPhone);
  const zaloLink = zaloHref(request.customerPhone);
  const plateLine = [request.vehicleCode, request.vehiclePlate].filter(Boolean).join(LIST_SEPARATOR);
  const needsDecision = request.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;

  return (
    <div className={styles.body}>
      {/* ── Cột trái: xe + chuyến ─────────────────────────────────────────── */}
      <section className={styles.panel} aria-label={t('vehicle.heading')}>
        <div className={styles.panelMain}>
          <div className={styles.vehicle}>
            <span className={styles.thumb}>
              {request.vehicleImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={request.vehicleImageUrl} alt="" className={styles.thumbImage} />
              ) : (
                <CarOutlined aria-hidden="true" title={t('vehicle.noImage')} />
              )}
            </span>
            <div className={styles.vehicleText}>
              <p className={styles.vehicleName}>{request.vehicleName}</p>
              {plateLine ? <span className={styles.plate}>{plateLine}</span> : null}
            </div>
          </div>

          <dl className={styles.rows}>
            <Row label={t('detail.service')}>{domainLabel('serviceType', request.serviceType)}</Row>
            {hasSchedule ? (
              <>
                <Row label={t('schedule.pickup')}>{fmt.rentalPoint(pickup)}</Row>
                <Row label={t('schedule.return')}>{fmt.rentalPoint(dropoff)}</Row>
                <Row label={t('schedule.duration')}>{fmt.rentalDuration(pickup, dropoff)}</Row>
                {isLongTerm && request.longTermPackageMonths ? (
                  <Row label={t('schedule.package')}>
                    {fmt.packageLabel(request.longTermPackageMonths)}
                  </Row>
                ) : null}
              </>
            ) : (
              /* Dài hạn chưa duyệt KHÔNG có lịch (ADR 0011) — nói gói + nguyện vọng. */
              <>
                <Row label={t('schedule.package')}>
                  {request.longTermPackageMonths
                    ? fmt.packageLabel(request.longTermPackageMonths)
                    : t('schedule.packageMissing')}
                </Row>
                <Row label={t('schedule.pickupWish')}>{fmt.pickupWish(request)}</Row>
              </>
            )}
            {isWithDriver && routeType ? (
              <Row label={t('schedule.route')}>
                <Tag
                  className={styles.tag}
                  color={routeIsLongDistance ? STATUS_COLOR.WARNING : undefined}
                >
                  {domainLabel('routeType', routeType)}
                </Tag>
              </Row>
            ) : null}
            {isWithDriver && request.pickupAddress ? (
              <Row label={t('schedule.pickupAddress')}>{request.pickupAddress}</Row>
            ) : null}
            {isWithDriver && request.destination ? (
              <Row label={t('schedule.destination')}>{request.destination}</Row>
            ) : null}
            {/* "Nhận xe": hình thức đậm + địa chỉ giao xám dưới (design). */}
            <Row label={t('schedule.handoverHeading')}>
              <span className={styles.strong}>
                {request.deliveryRequested ? t('card.handoverDelivery') : t('card.handoverSelf')}
              </span>
              {request.deliveryRequested && request.deliveryAddress ? (
                <span className={styles.sub}>{request.deliveryAddress}</span>
              ) : null}
            </Row>
          </dl>
          {isLongTerm && !hasSchedule ? (
            <p className={styles.hint}>{t('schedule.pickupWishHint')}</p>
          ) : null}
          {request.deliveryRequested ? (
            <p className={styles.hint}>{t('schedule.deliveryFeeHint')}</p>
          ) : null}
        </div>

        <div className={styles.panelActions}>
          <Button className={styles.ghostButton} onClick={() => onOpenVehicle(request)}>
            {t('detail.openVehicle')}
          </Button>
          {/* Lịch của chính xe này — câu hỏi đầu tiên trước khi duyệt. */}
          <Link
            className={styles.ghostLink}
            href={vehicleSchedulePath(
              { name: request.vehicleName, plateNumber: request.vehiclePlate },
              { back: backHref, branchId: branchCrumb },
            )}
          >
            {t('vehicle.viewSchedule')}
          </Link>
        </div>
      </section>

      {/* ── Cột phải: khách + thanh toán ──────────────────────────────────── */}
      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby={`req-${request.id}-customer`}>
          <div className={styles.panelHead}>
            <h3 id={`req-${request.id}-customer`} className={styles.panelTitle}>
              {t('customer.heading')}
            </h3>
            {request.tenantCustomerId && onOpenCustomer ? (
              <button
                type="button"
                className={styles.textAction}
                onClick={() => onOpenCustomer(request)}
                aria-label={t('detail.openCustomer')}
              >
                <LineIcon name="profile" className={styles.textActionIcon} />
                {t('detail.viewProfile')}
              </button>
            ) : null}
          </div>
          <div className={styles.customer}>
            <p className={styles.customerName}>
              <span>{request.customerName}</span>
              {request.customerIsRegular ? (
                <span className={styles.regular}>{t('detail.regular')}</span>
              ) : null}
            </p>
            {/*
              SĐT/email chỉ có khi chủ xe được phép thấy (`hostSeesCustomerContact` — ADR 0056):
              vắng thì ẩn hẳn dòng, không để ô trống hay câu giải thích luật.
            */}
            {request.customerPhone ? (
              <p className={styles.contactLine}>
                {phoneLink ? <a href={phoneLink}>{request.customerPhone}</a> : request.customerPhone}
                {zaloLink ? (
                  <a
                    className={styles.zalo}
                    href={zaloLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('actions.zaloAria', {
                      name: request.customerName,
                      phone: request.customerPhone,
                    })}
                  >
                    {t('actions.zalo')}
                  </a>
                ) : null}
              </p>
            ) : null}
            {request.customerAccountPhone ? (
              <p className={styles.contactLine}>
                {t('detail.accountPhone')}:{' '}
                {accountPhoneLink ? (
                  <a href={accountPhoneLink}>{request.customerAccountPhone}</a>
                ) : (
                  request.customerAccountPhone
                )}
              </p>
            ) : null}
            {request.customerEmail ? (
              <p className={styles.contactLine}>{request.customerEmail}</p>
            ) : null}
            {showRisk ? (
              <p className={styles.risk} role="note">
                <ExclamationCircleOutlined aria-hidden="true" />{' '}
                {t('customer.riskWarning', {
                  level: domainLabel('tenantCustomerRiskLevel', riskLevel),
                })}
              </p>
            ) : null}
            {!request.tenantCustomerId ? (
              <p className={styles.hint}>{t('customer.noProfile')}</p>
            ) : null}
          </div>
        </section>

        {request.pricing ? (
          <section className={styles.panel} aria-labelledby={`req-${request.id}-payment`}>
            <div className={styles.panelHead}>
              <h3 id={`req-${request.id}-payment`} className={styles.panelTitle}>
                {t('detail.paymentHeading')}
              </h3>
              {request.pricing.isEstimate ? (
                <span className={styles.estimateTag}>{t('card.estimate')}</span>
              ) : null}
            </div>
            <RequestPaymentFacts request={request} emphasizeLast />
            {request.pricing.isEstimate ? (
              <p className={styles.hint}>{t('pricing.estimateHint')}</p>
            ) : null}
          </section>
        ) : null}
      </div>

      {/* ── Ghi chú · lý do từ chối · dấu vết — cả chiều ngang, đọc hết không cắt. ── */}
      <section className={styles.more} aria-label={t('detail.moreHeading')}>
        {request.note ? (
          <div>
            <p className={styles.moreLabel}>{t('note.label')}</p>
            <p className={styles.longText}>{request.note}</p>
          </div>
        ) : null}
        {request.rejectReason ? (
          <div>
            <p className={styles.moreLabel}>{t('trace.rejectReason')}</p>
            <p className={styles.rejectReason}>{request.rejectReason}</p>
          </div>
        ) : null}
        <dl className={styles.trace}>
          <Row label={t('detail.createdAt')}>{fmt.dateTime(request.createdAt)}</Row>
          {needsDecision ? (
            <Row label={t('deadline.label')}>{fmt.dateTime(request.respondBy)}</Row>
          ) : null}
          {request.decidedAt ? (
            <Row label={t('detail.decidedAt')}>{fmt.dateTime(request.decidedAt)}</Row>
          ) : null}
        </dl>
      </section>
    </div>
  );
}

/** Chân hộp: quyết định (design) — hoặc lý do không còn quyết định, hoặc Huỷ chuyến. */
function DetailFooter({
  request,
  canApprove,
  pendingAction,
  onApprove,
  onReject,
  onCancel,
}: Props & { request: BookingRequestItem }) {
  const t = useTranslations('BookingRequests');
  // Cùng vị từ với thẻ ở danh sách và với server: hết hạn phản hồi thì không còn quyết định nào.
  const pastDue = isBookingRequestPastDue(request.respondBy);
  const needsDecision = request.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;
  const busy = pendingAction !== null;

  if (needsDecision && !pastDue && canApprove) {
    return (
      <div className={styles.footer}>
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
      </div>
    );
  }
  if (needsDecision && pastDue) {
    return (
      <div className={styles.footer}>
        <p className={styles.footerHint}>{t('deadline.pastDueHint')}</p>
      </div>
    );
  }
  if (request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD && canApprove) {
    /*
     * Chuyến đã nhận, đang chờ khách trả: việc chính là ĐỢI, chỗ này chỉ có một lối thoát
     * (ADR 0045 điều 1) — người mở chi tiết thường để đọc lại lịch trình rồi gọi cho khách.
     */
    return (
      <div className={styles.footer}>
        <Button
          className={styles.rejectButton}
          icon={<LineIcon name="close" className={styles.buttonIcon} />}
          loading={pendingAction === 'cancel'}
          disabled={busy && pendingAction !== 'cancel'}
          onClick={() => onCancel(request)}
        >
          {t('actions.cancel')}
        </Button>
      </div>
    );
  }
  return null;
}

/** Một dòng "nhãn — giá trị": nhãn xám trái, giá trị đậm phải (design "Rental Details"). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <dt className={styles.rowLabel}>{label}</dt>
      <dd className={styles.rowValue}>{children}</dd>
    </div>
  );
}

/** Remount theo `request.id` để không giữ lại trạng thái của yêu cầu trước. */
export function BookingRequestDetailDialog(props: Props) {
  const t = useTranslations('BookingRequests');
  const { request, onClose } = props;
  if (!request) return null;
  const isClosed = (BOOKING_REQUEST_CLOSED_STATUSES as readonly string[]).includes(request.status);

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      size="fit"
      mobileMode="fullscreen"
      footer={<DetailFooter key={request.id} {...props} request={request} />}
      title={
        <span className={styles.titleRow}>
          <span>{t('detail.dialogTitle')}</span>
          <StatusBadge
            value={request.status as BookingRequestStatus}
            meta={BOOKING_REQUEST_STATUS_META}
            group="bookingRequestStatus"
            tone={isClosed ? STATUS_COLOR.DANGER : undefined}
          />
        </span>
      }
    >
      <DetailBody key={request.id} {...props} request={request} />
    </ResponsiveDialog>
  );
}
