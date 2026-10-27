'use client';

import { App, Button, Result, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  API_ERROR_CODE,
  BOOKING_HOLD_STATUS,
  PAYMENT_RETURN_PARAM,
  isAwaitingPayment,
  type BookingHoldStatus,
} from '@xeprime/types';
import { ROUTES, tripPath } from '@/constants/routes';
import { TripGatewayReturn } from '@/features/payment-gateway/components/TripGatewayReturn';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/services/api-client';
import { useTrip } from '../hooks';
import type { CustomerTripDetail } from '../types';
import { TripHoldPanel } from './TripHoldPanel';
import { TripPageHeader, useTripDetailCrumbs, type TripCrumb } from './TripPageHeader';
import { TripPaymentCheckout } from './TripPaymentCheckout';
import styles from './TripPaymentView.module.css';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/** Khoản trả trong bấy nhiêu phút qua thì mở trang là được đưa sang trang chuyến kèm lời báo. */
const SUCCESS_FRESH_MS = 30 * 60_000;

/**
 * TRANG THANH TOÁN tiền giữ chỗ — `/payment/:tripId` (13/10/2026), design v2: Figma `19759:22346`
 * (VietQR) · `19759:37582` (ví điện tử) · `19759:37953` (hộp "Thanh toán thành công").
 *
 * Tách khỏi trang chuyến (`/trips/:id`) vì hai trang trả lời hai câu khác nhau: trang chuyến kể
 * chuyến đi (lịch, xe, chủ xe, giấy tờ, lịch sử), còn trang này chỉ có MỘT việc — trả khoản giữ chỗ
 * trước khi hết giờ. Khách tới đây từ thẻ "Khoản giữ chỗ cần thực hiện" của trang chuyến, và đây
 * cũng là trang cổng MoMo/VNPAY chuyển khách về (`returnUrl` do server dựng — `PAYMENT_PAGE_PATH`).
 *
 * Trang KHÔNG BAO GIỜ tự nói "đã thanh toán" vì một cú bấm hay một lượt quét: chuyến chỉ thành đơn
 * khi đối soát xác nhận đủ tiền (ADR 0044 điều 2). Khi CHÍNH khoản giữ chỗ của chuyến đổi trạng
 * thái — thông báo `hold_paid` đẩy qua bản chiếu realtime làm mới nó ngay, nhịp hỏi lại của
 * `useTrip` là lưới an toàn — khách được đưa sang trang chuyến kèm lời báo "Thanh toán thành công".
 */
export function TripPaymentView({ tripId }: { tripId: string }) {
  const t = useTranslations('Trips.payment');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const trip = useTrip(tripId);

  const detailHref = tripPath.detail(tripId);
  /*
   * Đường dẫn theo khu tài khoản như các trang chuyến khác: Tài khoản / Chuyến của tôi / Chi tiết
   * chuyến (liên kết về trang chuyến) / Thanh toán giữ chỗ.
   */
  const crumbs: TripCrumb[] = [
    ...useTripDetailCrumbs(ROUTES.TRIPS).map((crumb) =>
      crumb.key === 'detail' ? { ...crumb, href: detailHref } : crumb,
    ),
    { key: 'payment', label: t('title') },
  ];
  const header = (
    <TripPageHeader
      backHref={detailHref}
      backLabel={t('back')}
      crumbs={crumbs}
      title={t('title')}
    />
  );

  if (trip.isPending) {
    return (
      <div className={styles.page}>
        {header}
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (trip.isError || !trip.data) {
    const notFound = getErrorCode(trip.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <div className={styles.page}>
        <TripPageHeader
          backHref={ROUTES.TRIPS}
          backLabel={t('backToTrips')}
          crumbs={[{ key: 'payment', label: t('title') }]}
          title={t('title')}
        />
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
      </div>
    );
  }

  const data = trip.data;
  const hold = data.hold;

  return (
    <div className={styles.page}>
      {hold && isAwaitingPayment(hold.status as BookingHoldStatus) ? (
        <TripPaymentCheckout trip={data} hold={hold} header={header} />
      ) : (
        <>
          {header}
          {/*
            Quay về từ MoMo/VNPAY sau khi khoản đã khép: trạng thái lượt thanh toán vẫn là câu trả
            lời người vừa quay về đang tìm.
          */}
          <TripGatewayReturn tripId={data.id} />
          <HoldSettled trip={data} hold={hold ?? null} />
        </>
      )}
    </div>
  );
}

/**
 * Khoản đã KHÉP (hoặc chuyến không có khoản nào) — nói kết cục và chỉ đường đi tiếp. Không còn gì
 * để trả ở đây, nên không dựng lại phương thức thanh toán nào.
 *
 * Vừa trả đủ ⇒ sang thẳng trang chuyến (`/trips/:id`) và báo "Thanh toán thành công" bằng
 * `notification` của AntD ở góc trên bên phải. Lời báo sống ở `App` gốc nên vẫn hiện sau khi đổi
 * trang. Trang này giữ một kết cục đầy đủ cho liên kết cũ mở lại sau nhiều ngày.
 */
function HoldSettled({ trip, hold }: { trip: CustomerTripDetail; hold: Hold | null }) {
  const t = useTranslations('Trips.payment');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const params = useSearchParams();
  const router = useRouter();
  const { notification } = App.useApp();
  const detailHref = tripPath.detail(trip.id);
  const paid =
    hold?.status === BOOKING_HOLD_STATUS.PAID || hold?.status === BOOKING_HOLD_STATUS.RELEASED;
  /*
   * Lời báo là của KHOẢNH KHẮC tiền về — khách đang đứng ở trang này lúc realtime lật, mở lại từ
   * thông báo ngay sau đó, hoặc vừa quay về từ cổng. Liên kết nhắc cũ mở lại sau nhiều ngày thì chỉ
   * còn kết cục trên trang, không chúc mừng lần hai. Tính MỘT lần lúc dựng.
   */
  const [fresh] = useState(() => {
    const paidAt = hold?.paidAt ? new Date(hold.paidAt).getTime() : null;
    return (
      (paidAt != null && Date.now() - paidAt < SUCCESS_FRESH_MS) ||
      Boolean(params?.get(PAYMENT_RETURN_PARAM.TRIP_ORDER))
    );
  });
  /** StrictMode chạy effect hai lần ở dev — không báo và không đổi trang hai lần. */
  const announced = useRef(false);

  useEffect(() => {
    if (!paid || !fresh || !hold || announced.current) return;
    announced.current = true;
    const amount = fmt.money(hold.paidAmount);
    notification.success({
      title: t('success.title'),
      description: hold.paidVia
        ? t('success.lead', { amount, channel: dl('holdPaymentChannel', hold.paidVia) })
        : t('success.leadNoChannel', { amount }),
      placement: 'topRight',
    });
    // `replace`: nút Back không đưa khách quay lại một trang thanh toán đã xong.
    router.replace(detailHref);
  }, [paid, fresh, hold, fmt, dl, t, notification, router, detailHref]);

  const viewTrip = (
    <Link key="trip" href={detailHref}>
      <Button type="primary" size="large">
        {t('viewTrip')}
      </Button>
    </Link>
  );

  if (!hold) {
    return (
      <Result status="info" title={t('noHoldTitle')} subTitle={t('noHoldBody')} extra={viewTrip} />
    );
  }

  if (paid) {
    return (
      <>
        {/* Chuyển thừa ⇒ khoản hoàn + lối khai tài khoản nhận, ngay trên trang (không chỉ trong hộp). */}
        {hold.refund ? <TripHoldPanel hold={hold} tripId={trip.id} /> : null}
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
      </>
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
