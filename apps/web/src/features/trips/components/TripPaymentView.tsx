'use client';

/* eslint-disable @next/next/no-img-element -- ảnh xe từ storage ngoài, 64×44 và trang trí (alt
 * rỗng); `next/image` cần khai domain cho một ô nhỏ không cần tối ưu. */

import { Alert, Button, Result, Skeleton } from 'antd';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  API_ERROR_CODE,
  BOOKING_HOLD_STATUS,
  HOLD_COUNTDOWN_SEGMENT_MINUTES,
  isAwaitingPayment,
  PAYMENT_RETURN_PARAM,
  type BookingHoldStatus,
} from '@xeprime/types';
import { Countdown } from '@/components/data-display/Countdown';
import { ROUTES, tripPath } from '@/constants/routes';
import { CheckoutFrame } from '@/features/payment-gateway/components/CheckoutFrame';
import { CheckoutPanel } from '@/features/payment-gateway/components/CheckoutPanel';
import { TripGatewayReturn } from '@/features/payment-gateway/components/TripGatewayReturn';
import { canStartAnotherCheckout, useGatewayOrder } from '@/features/payment-gateway/hooks';
import { PAYMENT_SURFACE } from '@/features/payment-gateway/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { dayjs } from '@/lib/datetime';
import { getErrorCode } from '@/services/api-client';
import { useTrip } from '../hooks';
import type { CustomerTripDetail } from '../types';
import { TripHoldPanel } from './TripHoldPanel';
import styles from './TripPaymentView.module.css';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * TRANG THANH TOÁN tiền giữ chỗ — `/payment/:tripId` (13/10/2026).
 *
 * Tách khỏi trang chuyến (`/trips/:id`) vì hai trang trả lời hai câu khác nhau: trang chuyến kể
 * chuyến đi (lịch, xe, chủ xe, giấy tờ, lịch sử), còn trang này chỉ có MỘT việc — trả khoản giữ chỗ
 * trước khi hết giờ. Khách được đưa thẳng tới đây ngay khi chuyến được nhận (luồng đặt xe), từ thẻ
 * "Thanh toán ngay" của trang chuyến, và đây cũng là trang cổng MoMo/VNPAY chuyển khách về
 * (`returnUrl` do server dựng — `PAYMENT_PAGE_PATH`).
 *
 * Trang KHÔNG BAO GIỜ tự nói "đã thanh toán" vì một cú bấm hay một lượt quét: chuyến chỉ thành đơn
 * khi đối soát xác nhận đủ tiền (ADR 0044 điều 2). Màn đổi sang "đặt xe thành công" khi CHÍNH khoản
 * giữ chỗ của chuyến đổi trạng thái — thông báo `hold_paid` đẩy qua bản chiếu realtime làm mới nó
 * ngay, nhịp hỏi lại của `useTrip` là lưới an toàn.
 */
export function TripPaymentView({ tripId }: { tripId: string }) {
  const t = useTranslations('Trips.payment');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const trip = useTrip(tripId);

  const detailHref = tripPath.detail(tripId);

  if (trip.isPending) {
    return (
      <CheckoutFrame backHref={detailHref} backLabel={t('back')} title={t('title')}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </CheckoutFrame>
    );
  }

  if (trip.isError || !trip.data) {
    const notFound = getErrorCode(trip.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <CheckoutFrame backHref={ROUTES.TRIPS} backLabel={t('backToTrips')} title={t('title')}>
        <Result
          status={notFound ? '404' : 'error'}
          title={notFound ? t('notFoundTitle') : t('loadErrorTitle')}
          subTitle={notFound ? t('notFoundBody') : errorMessage(trip.error)}
          extra={
            notFound ? (
              <Link href={ROUTES.TRIPS}>
                <Button type="primary">{t('backToTrips')}</Button>
              </Link>
            ) : (
              <Button type="primary" onClick={() => void trip.refetch()}>
                {tCommon('actions.retry')}
              </Button>
            )
          }
        />
      </CheckoutFrame>
    );
  }

  const data = trip.data;
  const hold = data.hold;

  return (
    <CheckoutFrame
      backHref={detailHref}
      backLabel={t('back')}
      title={t('title')}
      subtitle={t('subtitle', { vehicle: data.vehicle.name })}
    >
      {/*
        Quay về từ MoMo/VNPAY: trạng thái lượt thanh toán, hỏi từ server — đứng TRÊN mọi thứ vì đó là
        câu trả lời người vừa quay về đang tìm.
      */}
      <TripGatewayReturn tripId={data.id} />

      {hold && isAwaitingPayment(hold.status as BookingHoldStatus) ? (
        <AwaitingHold trip={data} hold={hold} />
      ) : (
        <HoldSettled trip={data} hold={hold ?? null} />
      )}
    </CheckoutFrame>
  );
}

/** Khoản còn đang chờ tiền — chọn kênh và trả. */
function AwaitingHold({ trip, hold }: { trip: CustomerTripDetail; hold: Hold }) {
  const t = useTranslations('Trips.payment');
  const tHold = useTranslations('Trips.hold');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const dl = useDomainLabel();

  /*
   * Vừa quay về từ cổng với một lượt còn dùng được / đang ghi nhận ⇒ KHÔNG mời mở phiên mới (xem
   * `canStartAnotherCheckout`). Đọc cùng khoá cache với `TripGatewayReturn` — không request thứ hai.
   */
  const params = useSearchParams();
  const orderId = params?.get(PAYMENT_RETURN_PARAM.TRIP_ORDER) ?? null;
  const order = useGatewayOrder(PAYMENT_SURFACE.CUSTOMER, orderId);
  const gatewayEnabled =
    !orderId || canStartAnotherCheckout(order.data, { failedToLoad: order.isError });

  const underpaid = hold.status === BOOKING_HOLD_STATUS.UNDERPAID;
  /*
   * Cửa sổ huỷ miễn phí hẹp hơn cửa sổ trả tiền nghĩa là nó đã bị kẹp bởi giờ nhận xe — chuyến sát
   * giờ (ADR 0032 điều 5 bắt cảnh báo TRƯỚC khi trả). So hai MỐC ĐÃ LƯU của server.
   */
  const freeCancelIsShort =
    new Date(hold.freeCancelUntil).getTime() <= new Date(hold.expiresAt).getTime();
  const customerTotal = trip.estimate?.fees?.customerTotalAmount ?? null;
  const payAtPickup = trip.estimate?.fees?.payAtPickupAmount ?? null;

  const details = (
    <div className={styles.details}>
      <div className={styles.vehicle}>
        {trip.vehicle.imageUrl ? (
          <img className={styles.vehicleImg} src={trip.vehicle.imageUrl} alt="" loading="lazy" />
        ) : null}
        <span className={styles.vehicleText}>
          <b>{trip.vehicle.name}</b>
          {trip.vehicle.plateNumber ? <small>{trip.vehicle.plateNumber}</small> : null}
        </span>
      </div>
      <dl className={styles.rows}>
        {trip.pickupAt && trip.returnAt ? (
          <div className={styles.row}>
            <dt>{t('time')}</dt>
            <dd>
              {fmt.rentalPoint(dayjs(trip.pickupAt))} → {fmt.rentalPoint(dayjs(trip.returnAt))}
            </dd>
          </div>
        ) : null}
        <div className={styles.row}>
          <dt>{t('service')}</dt>
          <dd>{dl('serviceType', trip.serviceType)}</dd>
        </div>
        {customerTotal != null ? (
          <div className={styles.row}>
            <dt>{tCommon('components.price.customerTotal')}</dt>
            <dd>{fmt.money(customerTotal)}</dd>
          </div>
        ) : null}
        {payAtPickup != null ? (
          <div className={styles.row}>
            <dt>{tCommon('components.price.payAtHandover')}</dt>
            <dd>{fmt.money(payAtPickup)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );

  return (
    <CheckoutPanel
      target={{ kind: 'trip', tripId: trip.id }}
      amount={hold.remainingAmount}
      code={hold.code}
      account={hold.paymentInfo}
      deadline={hold.expiresAt}
      gatewayEnabled={gatewayEnabled}
      amountLabel={underpaid ? t('remainingLabel') : t('amountLabel')}
      details={details}
      alert={
        underpaid ? (
          <Alert
            type="warning"
            showIcon
            title={tHold('partialIntro', { paid: fmt.money(hold.paidAmount) })}
          />
        ) : null
      }
      countdown={
        <Countdown
          deadline={hold.expiresAt}
          urgentMs={HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000}
          segmentMs={HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000}
          labels={{
            remaining: tHold('countdownRemaining'),
            expired: tHold('countdownExpired'),
            segment: (index, total) => tHold('countdownSegment', { index, total }),
          }}
        />
      }
      notes={
        <ul className={styles.notes}>
          <li>{tHold('expires')}</li>
          <li>
            {tHold(freeCancelIsShort ? 'freeCancelSoon' : 'freeCancel', {
              time: fmt.dateTime(hold.freeCancelUntil),
            })}
          </li>
          {payAtPickup == null ? <li>{tHold('restAtHandover')}</li> : null}
        </ul>
      }
    />
  );
}

/**
 * Khoản đã KHÉP (hoặc chuyến không có khoản nào) — nói kết cục và chỉ đường đi tiếp. Không còn gì
 * để trả ở đây, nên không dựng lại phương thức thanh toán nào.
 */
function HoldSettled({ trip, hold }: { trip: CustomerTripDetail; hold: Hold | null }) {
  const t = useTranslations('Trips.payment');
  const fmt = useAppFormat();
  const detailHref = tripPath.detail(trip.id);

  const viewTrip = (
    <Link key="trip" href={detailHref}>
      <Button type="primary" size="large">
        {t('viewTrip')}
      </Button>
    </Link>
  );

  if (!hold) {
    return <Result status="info" title={t('noHoldTitle')} subTitle={t('noHoldBody')} extra={viewTrip} />;
  }

  if (hold.status === BOOKING_HOLD_STATUS.PAID || hold.status === BOOKING_HOLD_STATUS.RELEASED) {
    return (
      <Result
        status="success"
        title={t('paidTitle')}
        subTitle={t('paidBody', { amount: fmt.money(hold.paidAmount), code: hold.code })}
        extra={[
          viewTrip,
          <Link key="trips" href={ROUTES.TRIPS}>
            <Button size="large">{t('backToTrips')}</Button>
          </Link>,
        ]}
      />
    );
  }

  /*
   * Hết hạn / huỷ / có khoản hoàn: `TripHoldPanel` đã biết nói từng ca (kể cả ô khai tài khoản
   * nhận hoàn) — dùng lại nó thay vì viết câu thứ hai cho cùng một kết cục.
   */
  return (
    <div className={styles.settled}>
      <TripHoldPanel hold={hold} tripId={trip.id} />
      <div>{viewTrip}</div>
    </div>
  );
}
