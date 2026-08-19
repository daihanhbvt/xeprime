'use client';

import { Button, Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_META,
  ROUTE_TYPE,
  SERVICE_TYPE,
  STATUS_COLOR,
  TENANT_CUSTOMER_RISK_LEVEL,
  type BookingRequestStatus,
  type RouteType,
  type TenantCustomerRiskLevel,
  type VehicleType,
} from '@xeprime/types';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { telHref, zaloHref } from '@/lib/contact';
import { toAppTz } from '@/lib/datetime';
import type { BookingRequestItem } from '../types';
import styles from './BookingRequestDetailDialog.module.css';

interface Props {
  request: BookingRequestItem | null;
  canApprove: boolean;
  /** Đang chạy quyết định nào trên yêu cầu này — khoá nút để không bấm chồng. */
  pendingAction: 'approve' | 'reject' | null;
  onClose: () => void;
  onApprove: (request: BookingRequestItem) => void;
  onReject: (request: BookingRequestItem) => void;
  onOpenVehicle: (request: BookingRequestItem) => void;
  onOpenCustomer: (request: BookingRequestItem) => void;
  /** Đường quay lại đúng chỗ đang đứng, gắn vào link sang màn lịch. */
  backHref: string;
}

/**
 * Chi tiết một YÊU CẦU THUÊ chưa thành đơn.
 *
 * Yêu cầu đã duyệt có `BookingDetailDialog` để mở; yêu cầu còn chờ duyệt (và các nhánh kết
 * thúc: bị từ chối, khách huỷ, quá hạn) thì KHÔNG có đơn nào để mở — trước đợt này chúng là
 * những thẻ duy nhất bấm vào không ra gì. Màn này lấp đúng khoảng đó, và cố ý dựng từ CHÍNH
 * dữ liệu đã có trên thẻ: không thêm một endpoint hay một nguồn sự thật thứ hai.
 *
 * Khác thẻ ở chỗ nó KHÔNG cắt gọt gì: ghi chú hiện đủ, địa chỉ hiện đủ, và quyết định
 * duyệt/từ chối nằm ngay trong hộp thoại để không phải đóng ra rồi tìm lại đúng thẻ.
 */
function DetailBody({
  request,
  canApprove,
  pendingAction,
  onClose,
  onApprove,
  onReject,
  onOpenVehicle,
  onOpenCustomer,
  backHref,
}: Props & { request: BookingRequestItem }) {
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const isPending = request.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;
  const busy = pendingAction !== null;

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
  const zaloLink = zaloHref(request.customerPhone);
  const vehicleMeta = [request.vehicleCode, request.vehiclePlate].filter(Boolean).join(' · ');

  /** Cùng cụm nút dùng chung với thẻ ở danh sách — một hành động, một cách trình bày. */
  const decisionActions: RowAction[] = [
    {
      key: 'reject',
      label: t('actions.reject'),
      showLabel: true,
      danger: true,
      loading: pendingAction === 'reject',
      disabled: busy && pendingAction !== 'reject',
      onClick: () => onReject(request),
    },
    {
      key: 'approve',
      label: t('actions.approve'),
      showLabel: true,
      primary: true,
      loading: pendingAction === 'approve',
      disabled: busy && pendingAction !== 'approve',
      onClick: () => onApprove(request),
    },
  ];

  return (
    <div className={styles.body}>
      {/* ── Xe ─────────────────────────────────────────────────────────────── */}
      <Section title={t('vehicle.heading')}>
        <div className={styles.entity}>
          <EntityIdentity
            kind="vehicle"
            size="md"
            imageUrl={request.vehicleImageUrl}
            initialSource={request.vehicleName}
            name={request.vehicleName}
            subtitle={vehicleMeta || undefined}
          />
          <div className={styles.entityActions}>
            <Button size="small" onClick={() => onOpenVehicle(request)}>
              {t('detail.openVehicle')}
            </Button>
            {/* Lịch của chính xe này — câu hỏi đầu tiên trước khi duyệt. */}
            <Link
              href={vehicleSchedulePath(
                { name: request.vehicleName, plateNumber: request.vehiclePlate },
                { back: backHref },
              )}
            >
              <Button size="small">{t('vehicle.viewSchedule')}</Button>
            </Link>
          </div>
        </div>
        <div className={styles.tags}>
          {request.vehicleType ? (
            <Tag>{domainLabel('vehicleType', request.vehicleType as VehicleType)}</Tag>
          ) : null}
          <Tag>{domainLabel('serviceType', request.serviceType)}</Tag>
        </div>
      </Section>

      {/* ── Khách ──────────────────────────────────────────────────────────── */}
      <Section title={t('customer.heading')}>
        <div className={styles.entity}>
          <EntityIdentity
            kind="person"
            size="md"
            imageUrl={request.customerAvatarUrl}
            initialSource={request.customerName}
            name={request.customerName}
            subtitle={request.customerEmail ?? undefined}
          />
          {request.tenantCustomerId ? (
            <Button size="small" onClick={() => onOpenCustomer(request)}>
              {t('detail.openCustomer')}
            </Button>
          ) : null}
        </div>
        <dl className={styles.facts}>
          <Fact label={t('detail.phone')}>
            {phoneLink ? <a href={phoneLink}>{request.customerPhone}</a> : request.customerPhone}
          </Fact>
          {zaloLink ? (
            <Fact label={t('actions.zalo')}>
              <a href={zaloLink} target="_blank" rel="noopener noreferrer">
                {request.customerPhone}
              </a>
            </Fact>
          ) : null}
        </dl>
        {showRisk ? (
          <p className={styles.risk} role="note">
            {t('customer.riskWarning', {
              level: domainLabel('tenantCustomerRiskLevel', riskLevel),
            })}
          </p>
        ) : null}
        {!request.tenantCustomerId ? (
          <p className={styles.hint}>{t('customer.noProfile')}</p>
        ) : null}
      </Section>

      {/* ── Yêu cầu thuê ───────────────────────────────────────────────────── */}
      <Section title={t('schedule.heading')}>
        <dl className={styles.facts}>
          {hasSchedule ? (
            <>
              <Fact label={t('schedule.pickup')}>{fmt.rentalPoint(pickup)}</Fact>
              <Fact label={t('schedule.return')}>{fmt.rentalPoint(dropoff)}</Fact>
              <Fact label={t('schedule.duration')}>{fmt.rentalDuration(pickup, dropoff)}</Fact>
              {isLongTerm && request.longTermPackageMonths ? (
                <Fact label={t('schedule.package')}>
                  {fmt.packageLabel(request.longTermPackageMonths)}
                </Fact>
              ) : null}
            </>
          ) : (
            /* Dài hạn chưa duyệt KHÔNG có lịch (ADR 0011) — nói gói + nguyện vọng. */
            <>
              <Fact label={t('schedule.package')}>
                {request.longTermPackageMonths
                  ? fmt.packageLabel(request.longTermPackageMonths)
                  : t('schedule.packageMissing')}
              </Fact>
              <Fact label={t('schedule.pickupWish')}>{fmt.pickupWish(request)}</Fact>
            </>
          )}

          {isWithDriver && routeType ? (
            <Fact label={t('schedule.route')}>
              <Tag color={routeIsLongDistance ? STATUS_COLOR.WARNING : undefined}>
                {domainLabel('routeType', routeType)}
              </Tag>
            </Fact>
          ) : null}
          {isWithDriver && request.pickupAddress ? (
            <Fact label={t('schedule.pickupAddress')}>{request.pickupAddress}</Fact>
          ) : null}
          {isWithDriver && request.destination ? (
            <Fact label={t('schedule.destination')}>{request.destination}</Fact>
          ) : null}

          <Fact label={t('schedule.handoverHeading')}>
            {request.deliveryRequested
              ? t('schedule.handoverDelivery')
              : t('schedule.handoverAtShop')}
          </Fact>
          {request.deliveryRequested && request.deliveryAddress ? (
            <Fact label={t('schedule.deliveryAddress')}>{request.deliveryAddress}</Fact>
          ) : null}
        </dl>
        {isLongTerm && !hasSchedule ? (
          <p className={styles.hint}>{t('schedule.pickupWishHint')}</p>
        ) : null}
        {request.deliveryRequested ? (
          <p className={styles.hint}>{t('schedule.deliveryFeeHint')}</p>
        ) : null}
      </Section>

      {/* ── Ghi chú · lý do từ chối · dấu vết ──────────────────────────────── */}
      {request.note ? (
        <Section title={t('note.label')}>
          {/* Trong hộp thoại KHÔNG cắt hai dòng: đây đúng là chỗ để đọc hết. */}
          <p className={styles.longText}>{request.note}</p>
        </Section>
      ) : null}

      {request.rejectReason ? (
        <Section title={t('trace.rejectReason')}>
          <p className={styles.rejectReason}>{request.rejectReason}</p>
        </Section>
      ) : null}

      <dl className={styles.facts}>
        <Fact label={t('detail.createdAt')}>{fmt.dateTime(request.createdAt)}</Fact>
        {request.decidedAt ? (
          <Fact label={t('detail.decidedAt')}>{fmt.dateTime(request.decidedAt)}</Fact>
        ) : null}
      </dl>

      <div className={styles.footer}>
        <Button onClick={onClose}>{tCommon('actions.close')}</Button>
        {isPending && canApprove ? (
          <RowActions actions={decisionActions} variant="filled" maxInline={2} />
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{children}</dd>
    </div>
  );
}

/** Remount theo `request.id` để không giữ lại trạng thái của yêu cầu trước. */
export function BookingRequestDetailDialog(props: Props) {
  const t = useTranslations('BookingRequests');
  const { request, onClose } = props;
  if (!request) return null;

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      size="lg"
      mobileMode="fullscreen"
      footer={null}
      title={
        <span className={styles.titleRow}>
          <span>{t('detail.title')}</span>
          <StatusTag
            value={request.status as BookingRequestStatus}
            meta={BOOKING_REQUEST_STATUS_META}
            group="bookingRequestStatus"
          />
        </span>
      }
    >
      <DetailBody key={request.id} {...props} request={request} />
    </ResponsiveDialog>
  );
}
