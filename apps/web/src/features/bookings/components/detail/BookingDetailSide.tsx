'use client';

import { CarOutlined, CheckOutlined, EditOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  BOOKING_HANDOVER_PLACE,
  BOOKING_HANDOVER_PLACE_VALUES,
  type BookingHandoverPlace,
  PERMISSION,
  SERVICE_TYPE,
  STATUS_COLOR,
  TENANT_CUSTOMER_RETURNING_MIN_RENTALS,
} from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { ToneDotBadge } from '@/components/data-display/StatusBadge';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { customerPath, vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { isNegativeMoney, isZeroMoney, subtractMoney, sumMoney } from '@/lib/money';
import { BookingDriverSection } from '../BookingDriverSection';
import { BookingStatusActions } from '../BookingStatusActions';
import { useBookingDetailActions } from './BookingDetailActions';
import { CustomerReturnReport } from './CustomerReturnReport';
import styles from './BookingDetail.module.css';

/** Thẻ xe — ảnh, biển số, hình thức, nơi nhận/trả, lộ trình (có tài xế), ghi chú đơn. */
export function VehicleSideCard() {
  const t = useTranslations('Bookings.detailPage.side');
  const dl = useDomainLabel();
  const { has } = usePermissions();
  const { booking } = useBookingDetailActions();
  // Nguồn đơn nằm ở đầu trang, cạnh nhãn chặng (`BookingSourceControl`) - không lặp lại ở thẻ này.
  const place = (BOOKING_HANDOVER_PLACE_VALUES as readonly string[]).includes(
    booking.handoverPlaceKind ?? '',
  )
    ? (booking.handoverPlaceKind as BookingHandoverPlace)
    : null;

  return (
    <section className={styles.sideCard}>
      <div className={styles.vehicleHead}>
        <span className={styles.vehicleThumb}>
          {booking.vehicleImageUrl ? (
            <PreviewImage
              src={booking.vehicleImageUrl}
              alt={booking.vehicleName}
              className={styles.vehicleImage}
              loading="lazy"
            />
          ) : (
            <CarOutlined aria-hidden="true" />
          )}
        </span>
        <div className={styles.vehicleText}>
          {has(PERMISSION.VEHICLE_VIEW) ? (
            <Link
              href={vehiclePath.detail(booking.vehicleId)}
              className={styles.vehicleName}
              title={t('viewVehicle')}
            >
              {booking.vehicleName}
            </Link>
          ) : (
            <span className={styles.vehicleName}>{booking.vehicleName}</span>
          )}
          {booking.vehiclePlate ? (
            <span className={styles.plate}>{booking.vehiclePlate}</span>
          ) : null}
        </div>
      </div>
      <dl className={styles.sideFacts}>
        <div>
          <dt>{t('serviceType')}</dt>
          <dd>{dl('serviceType', booking.serviceType)}</dd>
        </div>
        <div>
          <dt>{t('pickup')}</dt>
          <dd>
            {place ? <b>{t(`place.${place}`)}</b> : null}
            {booking.handoverPlace ? <span>{booking.handoverPlace}</span> : null}
          </dd>
        </div>
        <div>
          <dt>{t('return')}</dt>
          <dd>
            <b>{place === BOOKING_HANDOVER_PLACE.BRANCH ? t('returnBranch') : t('returnAgreed')}</b>
            {place === BOOKING_HANDOVER_PLACE.BRANCH && booking.handoverPlace ? (
              <span>{booking.handoverPlace}</span>
            ) : null}
          </dd>
        </div>
        {booking.serviceType === SERVICE_TYPE.WITH_DRIVER && booking.routeType ? (
          <div>
            <dt>{t('route')}</dt>
            <dd>{dl('routeType', booking.routeType)}</dd>
          </div>
        ) : null}
        {booking.destination ? (
          <div>
            <dt>{t('destination')}</dt>
            <dd>{booking.destination}</dd>
          </div>
        ) : null}
        {booking.note ? (
          <div className={styles.sideNote}>
            <dt>{t('note')}</dt>
            <dd>{booking.note}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

/** Tài xế (đơn có tài) — giữ nguyên khối gán/đổi/tiền công đã có, chỉ đặt vào cột phải. */
export function DriverSideCard() {
  const { has } = usePermissions();
  const { booking } = useBookingDetailActions();
  if (booking.serviceType !== SERVICE_TYPE.WITH_DRIVER && !booking.driver) return null;
  // Khối gán tài xế đã tự có khung — không bọc thêm một lớp thẻ nữa.
  return <BookingDriverSection booking={booking} canUpdate={has(PERMISSION.BOOKING_UPDATE)} />;
}

/** Thẻ khách — "Chỉnh sửa" = form Sửa đơn (tên · SĐT · cọc · ghi chú, đúng bốn ô của design). */
export function CustomerSideCard() {
  const t = useTranslations('Bookings.detailPage.side');
  const { has } = usePermissions();
  const { booking, can, openEdit, openDocuments } = useBookingDetailActions();
  // Sổ khách là năng lực của GÓI (ADR 0027 điều 1) — chủ xe tuyến hoa hồng có quyền tenant đầy đủ
  // nhưng không có trang đó (server chặn bằng `@SubscriptionTrackOnly`), nên không có link.
  const { isManage } = useWorkspace();
  const canViewCustomer = has(PERMISSION.CUSTOMER_VIEW) && isManage;

  return (
    <section className={styles.sideCard}>
      <div className={styles.sideCardHead}>
        <h2 className={styles.sideTitle}>{t('customer')}</h2>
        {can.edit ? (
          <button type="button" className={styles.textAction} onClick={openEdit}>
            <EditOutlined aria-hidden="true" />
            {t('edit')}
          </button>
        ) : null}
      </div>
      <p className={styles.customerName}>
        {booking.customerName}
        {/* Cùng luật với nhãn "Khách quen" của sổ khách — không suy từ tên/SĐT tự khai. */}
        {booking.customerCompletedRentals != null &&
        booking.customerCompletedRentals >= TENANT_CUSTOMER_RETURNING_MIN_RENTALS ? (
          <ToneDotBadge compact color={STATUS_COLOR.SUCCESS}>
            {t('returningCustomer')}
          </ToneDotBadge>
        ) : null}
      </p>
      {booking.customerPhone ? (
        <a href={`tel:${booking.customerPhone}`} className={styles.customerPhone}>
          {booking.customerPhone}
        </a>
      ) : (
        <p className={styles.muted}>{t('noPhone')}</p>
      )}
      {booking.tenantCustomerId && (canViewCustomer || can.documents) ? (
        <div className={styles.customerLinks}>
          {canViewCustomer ? (
            <Link href={customerPath.detail(booking.tenantCustomerId)} className={styles.textLink}>
              {t('viewProfile')}
            </Link>
          ) : null}
          {can.documents ? (
            <button type="button" className={styles.textLink} onClick={openDocuments}>
              {t('documents')}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Thẻ "Thanh toán" — mọi con số do SERVER tính (ADR 0007); dòng phụ (khuyến mãi, phát sinh, thu
 * khác, thu vượt, trả trước online) chỉ hiện khi khác 0.
 *
 * Đọc như MỘT phép trừ (06/11/2026, phản hồi "các nguồn tiền khó hiểu"): Tổng tiền chuyến − phần
 * khách đã trả trước qua XePrime − đã thu tại quầy = **Còn lại (phải thu)**, dòng cuối thẻ.
 * Dòng trả trước là `D` (tiền thuê CỦA CHỦ XE trong tiền giữ chỗ), không phải cả khoản giữ chỗ:
 * khoản đó còn gồm phí đặt xe và bảo hiểm — không thuộc tổng của gian hàng, trừ vào là các dòng
 * không còn cộng ra nhau. Số cuối là `counterDueAmount` — cùng phép với "Thu tiền thuê" của Chuẩn bị
 * bàn giao và hộp nhận lại xe.
 */
export function PaymentSideCard() {
  const t = useTranslations('Bookings.detailPage.side');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const { booking, closed, moneyClosed, openFee } = useBookingDetailActions();
  const hasDeposit = !isZeroMoney(booking.depositAmount);
  const prepaid = isZeroMoney(booking.ownerShareOnlineAmount)
    ? null
    : booking.ownerShareOnlineAmount;
  // Thu vượt = (trả trước qua XePrime + đã thu tại quầy) − tổng chuyến. Bỏ `D` là nói "không vượt"
  // với một đơn đã thu trọn tiền thuê ở quầy trong khi khách đã trả trước một phần qua XePrime.
  const excess = subtractMoney(
    sumMoney([booking.collectedAmount, booking.ownerShareOnlineAmount]),
    booking.amountDue,
  );
  const overCollected = isNegativeMoney(excess) || isZeroMoney(excess) ? null : excess;
  const settled = isZeroMoney(booking.counterDueAmount);
  const dueHint = settled
    ? t('dueSettled')
    : booking.actualPickupAt
      ? t('dueAfterPickup')
      : t('dueAtPickup');
  const unit = booking.ownerPayout?.unitAmount ?? null;
  const days = booking.ownerPayout?.rentalDays ?? null;

  return (
    <section className={cx(styles.sideCard, styles.paymentCard)} aria-label={t('payment')}>
      <h2 className={styles.sideTitle}>
        {t('payment')}
        {/* "Chưa gồm cọc tài sản…" thành dấu "i" cạnh tiêu đề - rê chuột mới hiện (người dùng 20/11/2026). */}
        {hasDeposit ? (
          <>
            {' '}
            <InfoHint
              label={t('payment')}
              content={t('depositNote', { amount: fmt.money(booking.depositAmount) })}
            />
          </>
        ) : null}
      </h2>
      <dl className={styles.moneyRows}>
        <div className={styles.moneyRowRent}>
          <dt>
            {t('rent')}
            {unit && days ? (
              <small>{t('rentDetail', { days, unit: fmt.money(unit) })}</small>
            ) : null}
          </dt>
          <dd>{fmt.money(booking.baseAmount)}</dd>
        </div>
        {!isZeroMoney(booking.discountAmount) ? (
          <div>
            <dt>{t('discount')}</dt>
            <dd className={styles.negative}>−{fmt.money(booking.discountAmount)}</dd>
          </div>
        ) : null}
        <div className={styles.moneyRowDelivery}>
          <dt>{t('deliveryFee')}</dt>
          <dd className={styles.editable}>
            {isZeroMoney(booking.deliveryFee) ? t('free') : fmt.money(booking.deliveryFee)}
            {has(PERMISSION.BOOKING_UPDATE) && !closed ? (
              <button
                type="button"
                className={styles.inlineEdit}
                aria-label={t('deliveryFee')}
                onClick={openFee}
              >
                <EditOutlined aria-hidden="true" />
              </button>
            ) : null}
          </dd>
        </div>
        {!isZeroMoney(booking.surchargeTotal) ? (
          <div>
            <dt>{t('surcharge')}</dt>
            <dd>+{fmt.money(booking.surchargeTotal)}</dd>
          </div>
        ) : null}
        <div className={cx(styles.moneyStrong, styles.moneyDesktopOnly)}>
          <dt>{t('amountDue')}</dt>
          <dd>{fmt.money(booking.amountDue)}</dd>
        </div>
        {prepaid ? (
          <div>
            <dt>
              <span className={styles.moneyLabel}>
                {t('prepaidOnline')}
                <InfoHint
                  label={t('prepaidOnline')}
                  content={
                    booking.holdPaidAmount
                      ? t('prepaidOnlineHint', {
                          hold: fmt.money(booking.holdPaidAmount),
                          share: fmt.money(prepaid),
                        })
                      : t('prepaidOnlineHintShort')
                  }
                />
              </span>
            </dt>
            <dd>−{fmt.money(prepaid)}</dd>
          </div>
        ) : null}
        <div>
          <dt>
            {t('collected')}
            {!isZeroMoney(booking.otherCollected) ? (
              <small>
                {t('otherCollected')} {fmt.money(booking.otherCollected)}
              </small>
            ) : null}
          </dt>
          <dd>
            {isZeroMoney(booking.collectedAmount) ? '' : '−'}
            {fmt.money(booking.collectedAmount)}
          </dd>
        </div>
        {overCollected ? (
          <div>
            <dt>{t('overCollected')}</dt>
            <dd>{fmt.money(overCollected)}</dd>
          </div>
        ) : null}
      </dl>
      {/*
        Đơn huỷ / khách không đến: không còn gì để thu (ADR 0045 điều 1 — đơn đang chạy không huỷ
        được), nên ô "Còn phải thu" vắng hẳn; các dòng trên vẫn là bản ghi số tiền của đơn.
      */}
      {/*
        "Còn lại (phải thu)" - Figma `23777:48877`: một dòng sau đường kẻ ở mọi khổ màn hình, cùng số
        `counterDueAmount`; câu "thu lúc nào" nằm ở dấu "i" cạnh nhãn.
      */}
      {moneyClosed ? null : (
        <div
          className={cx(styles.moneyDuePhone, settled && styles.moneyDuePhoneSettled)}
          role="status"
          aria-label={`${t('partnerApp.due')}: ${fmt.money(booking.counterDueAmount)}`}
        >
          <span className={styles.moneyLabel}>
            {t('partnerApp.due')}
            <InfoHint label={t('partnerApp.due')} content={dueHint} />
          </span>
          <strong className={styles.moneyDuePhoneAmount}>
            {fmt.money(booking.counterDueAmount)}
          </strong>
        </div>
      )}
    </section>
  );
}

/** Quyết định khép đơn (huỷ · khách không đến) + hành động chính theo chặng (giao / nhận xe). */
export function SideActions() {
  const { booking, handover, primary, can, requestHandover } = useBookingDetailActions();
  return (
    <div className={styles.sideActions}>
      <CustomerReturnReport booking={booking} canDispute={can.confirmHandover} />
      {/*
        MỘT hàng, cùng cỡ (06/11/2026): "Hủy đơn" trái · nút bàn giao phải. Chỉ còn một nút thì nó
        chiếm cả hàng; "Khách không đến" (hiếm, sau ân hạn) xuống hàng dưới.
      */}
      <div className={styles.sideActionsRow}>
        <BookingStatusActions
          booking={booking}
          pickupConfirmed={Boolean(handover?.pickup?.confirmedAt)}
          size="large"
        />
        {primary && can.confirmHandover ? (
          <Button
            type="primary"
            size="large"
            icon={<CheckOutlined />}
            className={styles.primaryCta}
            onClick={() => requestHandover(primary.type)}
          >
            {primary.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
