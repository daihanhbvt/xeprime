'use client';

import {
  CalendarOutlined,
  CarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EnvironmentOutlined,
  ExclamationCircleOutlined,
  MessageOutlined,
  PhoneOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';
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
  type VehicleType,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusTag } from '@/components/data-display/StatusTag';
import { customerPath, vehiclePath } from '@/constants/routes';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { telHref, zaloHref } from '@/lib/contact';
import { openOverlayOnPlainClick } from '@/lib/modal-link';
import { toAppTz } from '@/lib/datetime';
import { RespondDeadline } from './RespondDeadline';
import type { BookingRequestItem } from '../types';
import styles from './BookingRequestCard.module.css';

/** Thao tác đang chạy trên ĐÚNG yêu cầu này — chặn bấm chồng lên nhau. */
export type BookingRequestAction = 'approve' | 'reject' | 'message';

interface Props {
  request: BookingRequestItem;
  /** `booking_requests.approve` — thiếu thì KHÔNG render nút duyệt/từ chối (không disable giả). */
  canApprove: boolean;
  canViewVehicle: boolean;
  canViewCustomer: boolean;
  canViewBooking: boolean;
  /** Thao tác đang chạy trên yêu cầu này; `null` khi rảnh. */
  pendingAction: BookingRequestAction | null;
  onApprove: (request: BookingRequestItem) => void;
  onReject: (request: BookingRequestItem) => void;
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
 * MỘT yêu cầu thuê trong hộp thư của gian hàng.
 *
 * Bố cục theo mẫu 19/08: một THÂN bốn vùng (xe · khách · yêu cầu thuê · trạng thái) rồi một
 * CHÂN THẺ ngăn bằng đường kẻ, trái là liên hệ, phải là quyết định (hoặc đường sang đơn đã tạo).
 * Các vùng là con TRỰC TIẾP của lưới nên `grid-template-areas` xếp lại được theo bề rộng mà
 * không phải render nội dung lần thứ hai cho mobile.
 *
 * Màu nhấn dùng GOLD thương hiệu (`--xp-color-primary*`), không dùng `--xp-color-link` xanh:
 * xanh trong bản mẫu chỉ là màu tạm của người vẽ, còn màu chính của sản phẩm là gold.
 *
 * Component không tự quyết QUYỀN và không tự gọi API: nó nhận cờ quyền và callback, nên cùng
 * một thẻ dùng được ở mọi chỗ và test không phải dựng cả tầng dữ liệu.
 */
export function BookingRequestCard({
  request,
  canApprove,
  canViewVehicle,
  canViewCustomer,
  canViewBooking,
  pendingAction,
  onApprove,
  onReject,
  onMessage,
  onOpenDetail,
  onOpenVehicle,
  onOpenCustomer,
  backHref,
}: Props) {
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [noteExpanded, setNoteExpanded] = useState(false);

  const isPending = request.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;
  /*
   * Quá hạn phản hồi thì KHÔNG còn quyết định nào — server từ chối cả duyệt lẫn từ chối
   * (`BOOKING_REQUEST_EXPIRED`), nên bày nút ra là mời người dùng bấm một thứ chắc chắn hỏng.
   *
   * Hỏi `respondBy` chứ không hỏi `status`: trạng thái `expired` do worker ghi theo nhịp, nên
   * có một cửa sổ mà bản ghi vẫn còn `pending_host_approval` trong khi giờ đã hết. Đây chính
   * là vị từ mà server dùng, nên hai phía không bao giờ nói hai câu khác nhau.
   */
  const pastDue = isBookingRequestPastDue(request.respondBy);
  const decidable = isPending && !pastDue;
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
  const vehicleMeta = [request.vehicleCode, request.vehiclePlate].filter(Boolean).join(LIST_SEPARATOR);

  const riskLevel = request.customerRiskLevel as TenantCustomerRiskLevel | null;
  const showRisk = riskLevel != null && riskLevel !== TENANT_CUSTOMER_RISK_LEVEL.NORMAL;

  const customerLinkable = canViewCustomer && Boolean(request.tenantCustomerId);
  const phoneLink = telHref(request.customerPhone);
  const zaloLink = zaloHref(request.customerPhone);

  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;
  const hasSchedule = pickup !== null && dropoff !== null;
  const isLongTerm = request.serviceType === SERVICE_TYPE.LONG_TERM;
  const routeType = request.routeType as RouteType | null;
  const routeIsLongDistance =
    routeType === ROUTE_TYPE.INTER_CITY || routeType === ROUTE_TYPE.INTER_CITY_ONE_WAY;

  /**
   * MỌI yêu cầu đều mở được chi tiết dạng modal — yêu cầu đã thành đơn mở chi tiết đơn, yêu
   * cầu còn chờ duyệt (hoặc đã từ chối/huỷ/quá hạn) mở chi tiết YÊU CẦU. Trước đợt này chỉ
   * yêu cầu đã có đơn mới bấm được, nên đúng những thẻ cần xử lý lại là những thẻ chết.
   */
  const openableDetail = true;
  /** Đường sang ĐƠN chỉ hiện khi thật sự có đơn và người xem đọc được đơn. */
  const hasBookingLink = Boolean(request.bookingId) && canViewBooking;

  /*
   * Quyết định đi qua `RowActions` — cụm nút DÙNG CHUNG của dự án (biến thể `filled`).
   *
   * Trước đây đây là hai `<Button>` tự dựng: chúng không có tông màu chuẩn của hệ, không có
   * vùng chạm 44px ở mobile, không thu gọn nhãn khi hẹp, và không chặn sự kiện nổi bọt. Mọi
   * bảng/thẻ khác trong cổng quản lý đã đi qua `RowActions`; tự vẽ lại một cặp nút thứ hai chỉ
   * cho màn này là cách chắc chắn nhất để hai chỗ trông khác nhau sau lần chỉnh giao diện sau.
   */
  const decisionActions: RowAction[] = [
    {
      key: 'reject',
      label: t('actions.reject'),
      icon: <CloseCircleOutlined />,
      showLabel: true,
      danger: true,
      loading: pendingAction === 'reject',
      disabled: busy && pendingAction !== 'reject',
      onClick: () => onReject(request),
    },
    {
      key: 'approve',
      // "Duyệt & giữ xe", không phải "Duyệt": đây là hành động DUY NHẤT tạo đơn từ một yêu
      // cầu, và tác dụng đáng nói nhất của nó là chiếm chỗ trên lịch chiếc xe (ADR 0006). Người
      // trực cần biết mình sắp khoá một khung giờ, không chỉ "đồng ý" một cách chung chung.
      label: t('actions.approve'),
      icon: <CheckCircleOutlined />,
      showLabel: true,
      primary: true,
      loading: pendingAction === 'approve',
      disabled: busy && pendingAction !== 'approve',
      onClick: () => onApprove(request),
    },
  ];

  const isWithDriver = request.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const hasExtras = Boolean(
    (isWithDriver && (routeType || request.pickupAddress || request.destination)) ||
    request.deliveryRequested ||
    request.note ||
    request.rejectReason ||
    showRisk,
  );

  return (
    <article className={styles.card} aria-labelledby={titleId} aria-busy={busy || undefined}>
      <div className={styles.body}>
        {/* ── Xe: mỏ neo thị giác đầu tiên. ─────────────────────────────────── */}
        <div className={styles.vehicle}>
          <VehicleThumb
            imageUrl={request.vehicleImageUrl}
            href={canViewVehicle ? vehiclePath.detail(request.vehicleId) : null}
            onOpen={() => onOpenVehicle(request)}
            emptyLabel={t('vehicle.noImage')}
          />
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
            <div className={styles.vehicleLine}>
              {vehicleMeta ? <span className={styles.vehicleMeta}>{vehicleMeta}</span> : null}
              {request.vehicleType ? (
                <Tag className={styles.chip}>
                  {domainLabel('vehicleType', request.vehicleType as VehicleType)}
                </Tag>
              ) : null}
              <Tag className={styles.chip}>{domainLabel('serviceType', request.serviceType)}</Tag>
            </div>
            {/*
              Lịch của CHÍNH chiếc xe này — câu hỏi đầu tiên trước khi duyệt là "xe có rảnh
              khung đó không". Là LINK thật tới màn lịch (đã lọc sẵn theo biển số) chứ không
              phải modal: xem lịch là việc cần cả màn hình, và người ta ở lại đó một lúc.
            */}
            {canViewVehicle ? (
              <Link
                href={vehicleSchedulePath(
                  { name: request.vehicleName, plateNumber: request.vehiclePlate },
                  { back: backHref },
                )}
                className={styles.scheduleLink}
                aria-label={t('vehicle.viewScheduleFor', { vehicle: vehicleLabel })}
              >
                <CalendarOutlined aria-hidden="true" /> {t('vehicle.viewSchedule')}
              </Link>
            ) : null}
          </div>
        </div>

        {/* ── Khách hàng. ───────────────────────────────────────────────────── */}
        <div className={styles.customer}>
          <h3 className={styles.zoneTitle}>{t('customer.heading')}</h3>
          <EntityIdentity
            kind="person"
            size="sm"
            imageUrl={request.customerAvatarUrl}
            initialSource={request.customerName}
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
            subtitle={
              phoneLink ? (
                <a href={phoneLink} className={styles.customerPhone}>
                  {request.customerPhone}
                </a>
              ) : (
                request.customerPhone
              )
            }
          />
          {request.customerEmail ? <p className={styles.email}>{request.customerEmail}</p> : null}
          {!request.tenantCustomerId ? (
            <p className={styles.hint}>{t('customer.noProfile')}</p>
          ) : null}
        </div>

        {/* ── Trạng thái. ───────────────────────────────────────────────────── */}
        <div className={styles.state}>
          <StatusTag
            value={request.status as BookingRequestStatus}
            meta={BOOKING_REQUEST_STATUS_META}
            group="bookingRequestStatus"
          />
          {/*
            Đồng hồ đứng ngay dưới chip trạng thái vì nó TRẢ LỜI cùng một câu hỏi ("yêu cầu này
            đang ở đâu"), chỉ khác là theo trục thời gian. Chỉ hiện khi còn chờ: một đơn đã
            thành đơn thuê rồi thì hạn phản hồi là chuyện đã qua.
          */}
          {isPending ? <RespondDeadline respondBy={request.respondBy} /> : null}
        </div>

        {/*
          ── Yêu cầu thuê: lịch, hoặc gói + nguyện vọng với đơn dài hạn. ──────
          Yêu cầu ĐÃ thành đơn thì cả vùng này là một NÚT mở chi tiết đơn dạng modal — người
          trực đọc lịch xong muốn xem tiếp thì bấm thẳng vào chính chỗ vừa đọc, không phải đi
          tìm một link ở góc. Yêu cầu chưa có đơn thì không có gì để mở, nên nó ở nguyên dạng
          tĩnh thay vì thành một ô bấm-không-ra-gì.
        */}
        <div className={openableDetail ? styles.requestOpenable : styles.request}>
          <div className={styles.requestHead}>
            <h3 className={styles.zoneTitle}>{t('schedule.heading')}</h3>
            {openableDetail ? (
              <span className={styles.requestCue} aria-hidden="true">
                {t('trace.viewBooking')} <RightOutlined />
              </span>
            ) : null}
          </div>
          {openableDetail ? (
            /*
             * Nút phủ toàn vùng: vùng bấm là cả khối chứ không phải một dòng chữ nhỏ, nhưng
             * DOM vẫn chỉ có MỘT phần tử tương tác nên không đẻ ra bẫy nhấn lồng nhau và
             * trình đọc màn hình chỉ nghe đúng một hành động.
             */
            <button
              type="button"
              className={styles.requestHitArea}
              onClick={() => onOpenDetail(request)}
            >
              <span className={styles.srOnly}>
                {t('trace.viewBookingFor', { vehicle: vehicleLabel })}
              </span>
            </button>
          ) : null}
          <dl className={styles.facts}>
            {hasSchedule ? (
              <>
                <Fact label={t('schedule.pickup')} strong>
                  {fmt.rentalPoint(pickup)}
                </Fact>
                <Fact label={t('schedule.return')} strong>
                  {fmt.rentalPoint(dropoff)}
                </Fact>
                <Fact label={t('schedule.duration')}>{fmt.rentalDuration(pickup, dropoff)}</Fact>
                {isLongTerm && request.longTermPackageMonths ? (
                  <Fact label={t('schedule.package')}>
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
                <Fact label={t('schedule.package')} strong>
                  {request.longTermPackageMonths
                    ? fmt.packageLabel(request.longTermPackageMonths)
                    : t('schedule.packageMissing')}
                </Fact>
                <Fact label={t('schedule.pickupWish')} strong>
                  {fmt.pickupWish(request)}
                </Fact>
              </>
            )}
            {/*
              LUÔN nói rõ một trong hai hình thức nhận xe — im lặng bị đọc là "chắc khách tự đến".
            */}
            <Fact label={t('schedule.handoverHeading')}>
              <span className={styles.handover}>
                {request.deliveryRequested ? (
                  <CarOutlined aria-hidden="true" />
                ) : (
                  <EnvironmentOutlined aria-hidden="true" />
                )}{' '}
                {request.deliveryRequested
                  ? t('schedule.handoverDelivery')
                  : t('schedule.handoverAtShop')}
              </span>
            </Fact>
          </dl>
          {isLongTerm && !hasSchedule ? (
            <p className={styles.hint}>{t('schedule.pickupWishHint')}</p>
          ) : null}
        </div>

        {/* ── Dấu vết xử lý — desktop nằm dưới trạng thái, mobile xuống dưới. ── */}
        <div className={styles.stamps}>
          <p className={styles.timestamp}>
            {t('trace.createdAt', { value: fmt.dateTime(request.createdAt) })}
          </p>
          {request.decidedAt ? (
            <p className={styles.timestamp}>
              {t('trace.decidedAt', { value: fmt.dateTime(request.decidedAt) })}
            </p>
          ) : null}
        </div>
      </div>

      {/*
        Chi tiết chỉ MỘT SỐ yêu cầu có: lộ trình, địa chỉ giao, ghi chú, lý do từ chối, cảnh
        báo rủi ro. Tách khỏi thân bốn vùng để thẻ thường (phần lớn yêu cầu) giữ được đúng một
        hàng gọn, còn yêu cầu có ngữ cảnh thì nở ra hết chiều ngang thay vì nén vào một cột.
      */}
      {hasExtras ? (
        <div className={styles.extras}>
          {showRisk ? (
            <p className={styles.risk} role="note">
              <ExclamationCircleOutlined aria-hidden="true" />{' '}
              {t('customer.riskWarning', {
                level: domainLabel('tenantCustomerRiskLevel', riskLevel),
              })}
            </p>
          ) : null}

          {isWithDriver ? (
            <dl className={styles.facts}>
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
            Địa chỉ giao là văn bản đầy đủ, không tooltip: đó là nơi nhân viên phải lái xe tới.
            Và KHÔNG quảng cáo giao nhận là miễn phí vĩnh viễn — đơn sinh ra với phí 0₫ rồi chủ
            xe chốt lại sau khi thoả thuận, nên câu ghi chú phải nói đúng điều đó.
          */}
          {request.deliveryRequested ? (
            <div>
              {request.deliveryAddress ? (
                <dl className={styles.facts}>
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
            <div className={styles.rejectReason}>
              <p className={styles.noteLabel}>{t('trace.rejectReason')}</p>
              <p className={styles.noteBodyFull}>{request.rejectReason}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Chân thẻ: liên hệ bên trái, quyết định / đường sang đơn bên phải. ── */}
      <div className={styles.footer}>
        <div className={styles.contact}>
          <Tooltip
            title={request.canMessageOnPlatform ? undefined : t('actions.messageUnavailable')}
          >
            {/*
              `<span>` bọc để tooltip vẫn nhận được sự kiện chuột khi nút bị disable — một nút
              xám không lý do là thứ người dùng không có cách nào tự giải thích.
            */}
            <span className={styles.contactSlot}>
              <Button
                variant="filled"
                color="default"
                className={styles.contactButton}
                icon={<MessageOutlined aria-hidden="true" />}
                loading={pendingAction === 'message'}
                disabled={!request.canMessageOnPlatform || (busy && pendingAction !== 'message')}
                aria-label={t('actions.messageAria', { name: request.customerName })}
                onClick={() => onMessage(request)}
              >
                {t('actions.message')}
              </Button>
            </span>
          </Tooltip>

          {phoneLink ? (
            <Button
              variant="filled"
              color="default"
              className={styles.contactButton}
              href={phoneLink}
              icon={<PhoneOutlined aria-hidden="true" />}
              aria-label={t('actions.callAria', {
                name: request.customerName,
                phone: request.customerPhone,
              })}
            >
              {t('actions.call')}
            </Button>
          ) : null}

          {zaloLink ? (
            <Button
              variant="filled"
              color="default"
              className={styles.zaloButton}
              href={zaloLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('actions.zaloAria', {
                name: request.customerName,
                phone: request.customerPhone,
              })}
            >
              {/* Không cài thêm bộ icon chỉ để có một logo — chữ "Zalo" đã là nhãn rõ ràng. */}
              <span aria-hidden="true">{t('actions.zalo')}</span>
            </Button>
          ) : null}
        </div>

        {/*
          Quyết định chỉ có ở yêu cầu CÒN XỬ LÝ ĐƯỢC (chờ duyệt + chưa quá hạn) và chỉ với người
          có quyền duyệt. Quá hạn thì hàng nút biến mất hẳn thay vì mờ đi: không có điều kiện
          nào để chờ nữa, và một nút xám vĩnh viễn chỉ làm người ta thử bấm.
        */}
        {decidable && canApprove ? (
          <div className={styles.decision}>
            <RowActions actions={decisionActions} variant="filled" maxInline={2} />
          </div>
        ) : isPending && pastDue ? (
          // Nói vì sao không còn nút, và việc cần làm tiếp — im lặng ở đây đọc như một lỗi tải.
          <p className={styles.expiredHint}>{t('deadline.pastDueHint')}</p>
        ) : hasBookingLink ? (
          /*
           * MỞ MODAL, không điều hướng: người trực đang quét cả hộp thư, nhảy sang một trang
           * khác là mất chỗ đang đọc và mất luôn bộ lọc/trang hiện tại. Trang chi tiết vẫn còn
           * (link chia sẻ nằm trong chính modal).
           */
          <Button type="link" className={styles.bookingLink} onClick={() => onOpenDetail(request)}>
            {t('trace.viewBooking')} <RightOutlined aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/** Một dòng "nhãn — giá trị". Desktop canh nhãn theo cột, mobile đẩy giá trị sang phải. */
function Fact({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={strong ? styles.factValueStrong : styles.factValue}>{children}</dd>
    </div>
  );
}

/**
 * Ảnh xe với tỉ lệ CỐ ĐỊNH — ảnh nguồn dọc hay ngang thì hàng vẫn thẳng.
 *
 * Link ảnh mang `aria-hidden` + `tabIndex={-1}`: nó trỏ cùng chỗ với link tên ngay bên cạnh,
 * nên để cả hai lộ ra là bắt người dùng bàn phím Tab hai lần qua cùng một đích và bắt trình đọc
 * màn hình đọc hai lần một liên kết.
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
