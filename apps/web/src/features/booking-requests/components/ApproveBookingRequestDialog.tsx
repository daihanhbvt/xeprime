'use client';

import { CarOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { LineIcon } from '@/components/icons/LineIcon';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { OwnerPayoutTable } from '@/features/bookings/components/OwnerPayoutTable';
import { useBranchCrumb } from '@/features/branches/hooks/use-branch-return';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { toAppTz } from '@/lib/datetime';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingRequest } from '../api';
import type { BookingRequestDecisionTarget, BookingRequestItem } from '../types';
import { ApprovalWindowNotes } from './ApprovalPreviewSummary';
import { RequestPaymentFacts } from './BookingRequestCard';
import { RespondDeadline } from './RespondDeadline';
import styles from './ApproveBookingRequestDialog.module.css';

interface Props {
  request: BookingRequestDecisionTarget | null;
  submitting: boolean;
  /** Lỗi lần duyệt vừa rồi (vd trùng lịch 409) — hộp thoại ở lại để đọc và quyết định tiếp. */
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Xác nhận duyệt một yêu cầu theo NGÀY (tự lái / có tài xế) — Figma Partner-XePrime "Phê duyệt yêu
 * cầu thuê xe" (`23898:25444`, 05/11/2026): trái là XE + chuyến, phải là THANH TOÁN + LỢI NHUẬN
 * CHUYẾN, dưới là hai cửa sổ của khách; chân hộp là đồng hồ hạn phản hồi + quyết định. Thuê dài hạn
 * đi `ApproveLongTermDialog` (gian hàng còn phải CHỐT giờ nhận — ADR 0011).
 *
 * Lệch design có chủ đích (sổ cái §3.1): không có mã `#DH…` (yêu cầu chưa có mã); "2 giờ" của design
 * là cửa sổ ĐỘNG do server tính (`holdWindowsFor`), huỷ miễn phí tính từ lúc khách TRẢ ĐỦ (ADR 0072);
 * thuế/hoa hồng đọc từ bảng cộng ví dùng chung (`OwnerPayoutTable`, ADR 0068); không có nút "Chỉnh
 * sửa thông tin khách" — danh tính người đặt không sửa được (ADR 0060).
 *
 * Trùng lịch trả 409: hộp thoại KHÔNG đóng — constraint DB mới là chỗ quyết định (ADR 0006).
 */
function ApproveForm({
  request,
  submitting,
  error,
  onCancel,
  onConfirm,
}: Props & { request: BookingRequestDecisionTarget }) {
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  const branchCrumb = useBranchCrumb();

  /*
   * Đọc LẠI yêu cầu mỗi lần mở: hai cửa sổ của khách được server ước theo "duyệt NGAY" lúc trả dòng
   * hộp thư — một dòng tải từ 20 phút trước sẽ hứa một cửa sổ dài hơn thật, hoặc giấu `tooShort`.
   */
  const fresh = useQuery({
    queryKey: queryKeys.bookingRequests.detail(request.id),
    queryFn: () => fetchBookingRequest(request.id),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  /*
   * Nơi gọi chỉ hứa bộ trường của `BookingRequestDecisionTarget` (khu chủ xe truyền một dòng hẹp
   * hơn); phần còn lại (ảnh xe, hạn phản hồi, địa chỉ giao…) đến từ lượt đọc lại — vắng thì dòng đó
   * vắng, không đoán.
   */
  const full = fresh.data?.id === request.id ? fresh.data : null;
  const current = { ...request, ...full } as BookingRequestDecisionTarget &
    Partial<BookingRequestItem>;
  const approvalPreview = current.approvalPreview ?? null;
  const collectsHold = approvalPreview?.collectsHold ?? true;

  const pickup = current.pickupAt ? toAppTz(current.pickupAt) : null;
  const dropoff = current.returnAt ? toAppTz(current.returnAt) : null;
  const plateLine = [current.vehicleCode, current.vehiclePlate].filter(Boolean).join(LIST_SEPARATOR);
  const handover = current.deliveryRequested ? t('card.handoverDelivery') : t('card.handoverSelf');

  return (
    <ResponsiveDialog
      open
      onClose={onCancel}
      size="fit"
      mobileMode="fullscreen"
      title={
        <span className={styles.titleBlock}>
          <span>{t('approve.title')}</span>
          <span className={styles.subtitle}>
            {collectsHold
              ? t.rich('approve.subtitleHold', { b: (chunks) => <strong>{chunks}</strong> })
              : t.rich('approve.subtitleNoHold', { b: (chunks) => <strong>{chunks}</strong> })}
          </span>
        </span>
      }
      footer={
        <div className={styles.footer}>
          {current.respondBy ? (
            <span className={styles.deadline}>
              <RespondDeadline respondBy={current.respondBy} variant="header" />
            </span>
          ) : (
            <span />
          )}
          <div className={styles.footerButtons}>
            <Button size="large" onClick={onCancel} disabled={submitting}>
              {t('approve.back')}
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<LineIcon name="tick" className={styles.buttonIcon} />}
              loading={submitting}
              onClick={() => {
                if (!submitting) onConfirm();
              }}
            >
              {t('approve.confirm')}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.body}>
        <div className={styles.columns}>
          {/* ── Trái: xe + chuyến ─────────────────────────────────────────── */}
          <section className={styles.card} aria-label={t('vehicle.heading')}>
            <div className={styles.vehicle}>
              <span className={styles.thumb}>
                {current.vehicleImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current.vehicleImageUrl} alt="" className={styles.thumbImage} />
                ) : (
                  <CarOutlined aria-hidden="true" title={t('vehicle.noImage')} />
                )}
              </span>
              <div className={styles.vehicleText}>
                <p className={styles.vehicleName}>{current.vehicleName}</p>
                {plateLine ? <span className={styles.plate}>{plateLine}</span> : null}
              </div>
            </div>
            {has(PERMISSION.VEHICLE_VIEW) ? (
              <Link
                className={styles.textLink}
                href={vehicleSchedulePath(
                  { name: current.vehicleName, plateNumber: current.vehiclePlate },
                  { branchId: branchCrumb },
                )}
              >
                <LineIcon name="calendar-sm" className={styles.buttonIcon} />
                {t('vehicle.viewSchedule')}
              </Link>
            ) : null}

            <dl className={styles.rows}>
              <Row label={t('detail.service')}>
                <span className={styles.strong}>
                  {domainLabel('serviceType', current.serviceType)}
                </span>
              </Row>
              {pickup && dropoff ? (
                <>
                  <Row label={t('schedule.pickup')}>
                    <span className={styles.strong}>
                      {fmt.rentalPoint(pickup)} · {handover}
                    </span>
                    {current.deliveryRequested && current.deliveryAddress ? (
                      <span className={styles.sub}>{current.deliveryAddress}</span>
                    ) : null}
                  </Row>
                  <Row label={t('schedule.return')}>
                    <span className={styles.strong}>{fmt.rentalPoint(dropoff)}</span>
                  </Row>
                  <Row label={t('schedule.duration')}>
                    <span className={styles.strong}>{fmt.rentalDuration(pickup, dropoff)}</span>
                  </Row>
                </>
              ) : null}
              <Row label={t('customer.heading')}>
                <span className={styles.strong}>
                  {[current.customerName, current.customerPhone].filter(Boolean).join(' ')}
                </span>
                {current.customerAccountPhone ? (
                  <span className={styles.sub}>
                    {t('customer.accountPhone', { phone: current.customerAccountPhone })}
                  </span>
                ) : null}
                {current.customerIsRegular ? (
                  <span className={styles.regular}>{t('detail.regular')}</span>
                ) : null}
              </Row>
            </dl>
          </section>

          {/* ── Phải: thanh toán + lợi nhuận chuyến ───────────────────────── */}
          <div className={styles.side}>
            {current.pricing ? (
              <section className={styles.card} aria-labelledby={`approve-${current.id}-pay`}>
                <div className={styles.cardHead}>
                  <h3 id={`approve-${current.id}-pay`} className={styles.cardTitle}>
                    {t('detail.paymentHeading')}
                  </h3>
                  {current.pricing.isEstimate ? (
                    <span className={styles.estimate}>{t('card.estimate')}</span>
                  ) : null}
                </div>
                <RequestPaymentFacts request={current as BookingRequestItem} emphasizeLast />
              </section>
            ) : null}

            {approvalPreview ? (
              <section className={styles.card} aria-labelledby={`approve-${current.id}-profit`}>
                <div className={styles.cardHead}>
                  <h3 id={`approve-${current.id}-profit`} className={styles.cardTitle}>
                    {t('approve.profitHeading')}
                  </h3>
                  <span className={styles.estimate}>{t('approvalPreview.estimate')}</span>
                </div>
                <OwnerPayoutTable
                  payout={approvalPreview.ownerPayout}
                  label={t('approve.profitHeading')}
                />
              </section>
            ) : null}
          </div>
        </div>

        {/*
          Hai cửa sổ của khách nếu duyệt NGAY — mốc do server tính, đúng chặng: huỷ miễn phí đếm từ
          lúc khách trả ĐỦ (ADR 0072), không từ lúc duyệt.
        */}
        {approvalPreview ? (
          <ApprovalWindowNotes preview={approvalPreview} className={styles.notes} />
        ) : null}

        {current.deliveryRequested ? (
          <Alert type="info" showIcon title={t('approve.deliveryNote')} />
        ) : null}

        {error ? <Alert type="error" showIcon title={error} role="alert" /> : null}
      </div>
    </ResponsiveDialog>
  );
}

/** Một dòng "nhãn — giá trị": nhãn xám trái, giá trị phải (design "Rental Details"). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <dt className={styles.rowLabel}>{label}</dt>
      <dd className={styles.rowValue}>{children}</dd>
    </div>
  );
}

export function ApproveBookingRequestDialog(props: Props) {
  if (!props.request) return null;
  return <ApproveForm key={props.request.id} {...props} request={props.request} />;
}
