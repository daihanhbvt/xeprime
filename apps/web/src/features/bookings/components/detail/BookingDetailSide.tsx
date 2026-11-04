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
import { ToneDotBadge } from '@/components/data-display/StatusBadge';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { customerPath, vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { isNegativeMoney, isZeroMoney, subtractMoney } from '@/lib/money';
import { BookingDriverSection } from '../BookingDriverSection';
import { BookingStatusActions } from '../BookingStatusActions';
import { useBookingDetailActions } from './BookingDetailActions';
import styles from './BookingDetail.module.css';

/** Thẻ xe — ảnh, biển số, hình thức, nơi nhận/trả, lộ trình (có tài xế), ghi chú đơn. */
export function VehicleSideCard() {
  const t = useTranslations('Bookings.detailPage.side');
  const dl = useDomainLabel();
  const { has } = usePermissions();
  const { booking } = useBookingDetailActions();
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
          <ToneDotBadge color={STATUS_COLOR.SUCCESS}>{t('returningCustomer')}</ToneDotBadge>
        ) : null}
      </p>
      {booking.customerPhone ? (
        <a href={`tel:${booking.customerPhone}`} className={styles.customerPhone}>
          {booking.customerPhone}
        </a>
      ) : (
        <p className={styles.muted}>{t('noPhone')}</p>
      )}
      {booking.tenantCustomerId && (has(PERMISSION.CUSTOMER_VIEW) || can.documents) ? (
        <div className={styles.customerLinks}>
          {has(PERMISSION.CUSTOMER_VIEW) ? (
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
 * khác, thu vượt, giữ chỗ) chỉ hiện khi khác 0. Dòng cuối "Còn lại (phải thu)" tô vàng như design.
 */
export function PaymentSideCard() {
  const t = useTranslations('Bookings.detailPage.side');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const { booking, closed, openFee } = useBookingDetailActions();
  const excess = subtractMoney(booking.collectedAmount, booking.amountDue);
  const overCollected = isNegativeMoney(excess) || isZeroMoney(excess) ? null : excess;
  const hold = booking.holdPaidAmount != null && booking.payAtPickupAmount != null;
  const unit = booking.ownerPayout?.unitAmount ?? null;
  const days = booking.ownerPayout?.rentalDays ?? null;

  return (
    <section className={styles.sideCard} aria-label={t('payment')}>
      <h2 className={styles.sideTitle}>{t('payment')}</h2>
      <dl className={styles.moneyRows}>
        <div>
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
        <div>
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
        <div className={styles.moneyStrong}>
          <dt>{t('amountDue')}</dt>
          <dd>{fmt.money(booking.amountDue)}</dd>
        </div>
        {hold ? (
          <>
            <div>
              <dt>{t('holdPaid')}</dt>
              <dd>{fmt.money(booking.holdPaidAmount)}</dd>
            </div>
            <div>
              <dt>{t('payAtPickup')}</dt>
              <dd>{fmt.money(booking.payAtPickupAmount)}</dd>
            </div>
          </>
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
          <dd>{fmt.money(booking.collectedAmount)}</dd>
        </div>
        {!isZeroMoney(booking.depositAmount) ? (
          <div>
            <dt>{t('deposit')}</dt>
            <dd>{fmt.money(booking.depositAmount)}</dd>
          </div>
        ) : null}
        {overCollected ? (
          <div>
            <dt>{t('overCollected')}</dt>
            <dd>{fmt.money(overCollected)}</dd>
          </div>
        ) : null}
        <div className={styles.moneyRemaining}>
          <dt>{t('remaining')}</dt>
          <dd>{fmt.money(booking.debtAmount)}</dd>
        </div>
      </dl>
      {hold ? <p className={styles.moneyNote}>{t('holdNote')}</p> : null}
    </section>
  );
}

/** Quyết định khép đơn (huỷ · khách không đến) + hành động chính theo chặng (giao / nhận xe). */
export function SideActions() {
  const { booking, handover, primary, can, requestHandover } = useBookingDetailActions();
  return (
    <div className={styles.sideActions}>
      <div className={styles.sideActionsRow}>
        <BookingStatusActions
          booking={booking}
          pickupConfirmed={Boolean(handover?.pickup?.confirmedAt)}
        />
      </div>
      {primary && can.confirmHandover ? (
        <Button
          type="primary"
          size="large"
          block
          icon={<CheckOutlined />}
          className={styles.primaryCta}
          onClick={() => requestHandover(primary.type)}
        >
          {primary.label}
        </Button>
      ) : null}
    </div>
  );
}
